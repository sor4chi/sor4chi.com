// Login flow adapted from hiroppy/mf-dashboard (MIT), apps/crawler/src/auth/.
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import { logger } from "./logger.js";
import { generateTotp } from "./totp.js";

const URLS = {
  home: "https://moneyforward.com/",
  accounts: "https://moneyforward.com/accounts",
  meSignIn: "https://moneyforward.com/sign_in",
  idSignIn: "https://id.moneyforward.com/sign_in",
  idPassword: "https://id.moneyforward.com/sign_in/password",
} as const;

const SELECTORS = {
  email: 'input[name="mfid_user[email]"]',
  password: 'input[name="mfid_user[password]"]',
  submit: "#submitto",
  otp: 'input[autocomplete="one-time-code"], input[name*="otp"], input[name*="code"]',
  otpSubmit: '#submitto, button:text-is("認証する"), button:text-is("Verify")',
  mePassword: 'input[type="password"]',
  meSignIn: 'button:has-text("Sign in")',
} as const;

async function requiredSecret(name: string): Promise<string> {
  const directValue = process.env[name]?.trim();
  if (directValue !== undefined && directValue !== "") return directValue;

  const filePath = process.env[`${name}_FILE`]?.trim();
  if (filePath === undefined || filePath === "") {
    throw new Error(`${name} or ${name}_FILE is required`);
  }
  const fileValue = (await readFile(filePath, "utf8")).trim();
  if (fileValue === "") throw new Error(`${name}_FILE is empty`);
  return fileValue;
}

function isAuthenticatedUrl(rawUrl: string): boolean {
  const url = new URL(rawUrl);
  return url.origin === "https://moneyforward.com" && url.pathname.startsWith("/accounts");
}

async function waitForUrlChange(page: Page, timeout = 3_000): Promise<void> {
  const initialUrl = page.url();
  await page.waitForURL((url) => url.toString() !== initialUrl, { timeout }).catch(() => undefined);
}

async function hasVisibleOtpInput(page: Page): Promise<boolean> {
  try {
    await page.locator(SELECTORS.otp).first().waitFor({ state: "visible", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function authenticate(page: Page): Promise<void> {
  logger.info("Starting Money Forward authentication");
  const username = await requiredSecret("MONEYFORWARD_USERNAME");
  const password = await requiredSecret("MONEYFORWARD_PASSWORD");

  await page.goto(URLS.idSignIn, { waitUntil: "domcontentloaded" });
  await page.locator(SELECTORS.email).fill(username);
  await page.locator(SELECTORS.submit).click();
  await page.locator(SELECTORS.password).waitFor({ state: "visible", timeout: 10_000 });
  await page.locator(SELECTORS.password).fill(password);
  await page.locator(SELECTORS.submit).click();

  if (await hasVisibleOtpInput(page)) {
    const otp = generateTotp(await requiredSecret("MONEYFORWARD_TOTP_SECRET"));
    await page.locator(SELECTORS.otp).first().fill(otp);
    await page.locator(SELECTORS.otpSubmit).first().click();
  }

  await page.waitForURL(/https:\/\/(id\.)?moneyforward\.com\/.*/, { timeout: 30_000 });
  await page.goto(URLS.meSignIn, { waitUntil: "domcontentloaded" });
  await waitForUrlChange(page);

  if (page.url().includes("account_selector")) {
    const accountButton = page
      .locator(
        `button:has-text("${username}"), button:has-text("メールアドレスでログイン"), button:has-text("Sign in with email")`,
      )
      .first();
    await accountButton.click();
    await page.waitForURL(/id\.moneyforward\.com\/sign_in\/password|moneyforward\.com\//, {
      timeout: 15_000,
    });
  }

  if (page.url().startsWith(URLS.idPassword)) {
    await page.locator(SELECTORS.mePassword).first().fill(password);
    await page.locator(SELECTORS.meSignIn).click();
    await page.waitForURL(`${URLS.home}**`, { timeout: 30_000 });
  }

  await page.goto(URLS.accounts, { waitUntil: "domcontentloaded" });
  await waitForUrlChange(page);
  if (!isAuthenticatedUrl(page.url())) throw new Error("Money Forward authentication failed");
  logger.info("Money Forward authentication succeeded");
}

export async function createAuthenticatedContext(
  browser: Browser,
  authStatePath: string,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ...(existsSync(authStatePath) ? { storageState: authStatePath } : {}),
  });
  context.setDefaultTimeout(5_000);
  context.setDefaultNavigationTimeout(30_000);
  await context.route("**/*", async (route) => {
    const resourceType = route.request().resourceType();
    if (["font", "image", "media"].includes(resourceType)) await route.abort();
    else await route.continue();
  });

  const page = await context.newPage();
  await page.goto(URLS.accounts, { waitUntil: "domcontentloaded" });
  await waitForUrlChange(page);
  if (!isAuthenticatedUrl(page.url())) await authenticate(page);

  await mkdir(path.dirname(authStatePath), { recursive: true });
  await context.storageState({ path: authStatePath });
  await page.close();
  return context;
}
