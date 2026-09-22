// Selectors and parsing strategy are adapted from hiroppy/mf-dashboard (MIT).
import type { Page } from "playwright";
import { parseJapaneseNumber } from "./parsers.js";
import type {
  AssetHistoryPoint,
  MoneyForwardSnapshot,
  MonthlySummary,
  PortfolioItem,
} from "./types.js";

const URLS = {
  cashFlow: "https://moneyforward.com/cf",
  assetHistory: "https://moneyforward.com/bs/history",
  liabilities: "https://moneyforward.com/bs/liability",
  portfolio: "https://moneyforward.com/bs/portfolio",
} as const;

export function parseTransferRoute(title: string): { source: string; destination: string } | null {
  const match = title.trim().match(/^(.+?)から(.+?)への振替$/);
  if (match === null) return null;
  const source = match[1]?.trim() ?? "";
  const destination = match[2]?.trim() ?? "";
  return source === "" || destination === "" ? null : { source, destination };
}

export function isInvestmentAccount(account: string): boolean {
  return /(証券|投資|投信|株式|NISA|iDeCo|確定拠出年金)/i.test(account);
}

async function readAssetHistoryTable(page: Page): Promise<AssetHistoryPoint[]> {
  const table = page.locator("table.table-bordered").first();
  await table.waitFor({ state: "visible", timeout: 10_000 });

  const headers = await table.locator("thead th").allTextContents();
  const categoryNames = headers.slice(2, -1).map((header) => header.trim());
  const rows = table.locator("tbody tr");
  const points: AssetHistoryPoint[] = [];
  for (let rowIndex = 0; rowIndex < (await rows.count()); rowIndex += 1) {
    const row = rows.nth(rowIndex);
    const cells = row.locator("td");
    const [dateText, totalText, ...categoryTexts] = await Promise.all([
      row
        .locator("th")
        .first()
        .textContent()
        .catch(() => ""),
      cells
        .nth(0)
        .textContent()
        .catch(() => "0"),
      ...categoryNames.map((_, index) =>
        cells
          .nth(index + 1)
          .textContent()
          .catch(() => "0"),
      ),
    ]);
    const date = dateText?.trim() ?? "";
    if (!/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(date)) continue;
    points.push({
      date: date.replaceAll("/", "-"),
      totalAssetsYen: parseJapaneseNumber(totalText ?? "0"),
      categories: Object.fromEntries(
        categoryNames.map((name, index) => [
          name,
          parseJapaneseNumber(categoryTexts[index] ?? "0"),
        ]),
      ),
    });
  }
  if (points.length === 0) throw new Error("Failed to read asset history");
  return points;
}

async function scrapeAssetHistory(
  page: Page,
  backfillPreviousMonths: boolean,
): Promise<AssetHistoryPoint[]> {
  await page.goto(URLS.assetHistory, { waitUntil: "domcontentloaded" });
  const currentPoints = await readAssetHistoryTable(page);
  if (!backfillPreviousMonths) return currentPoints;

  const monthlyPaths = await page
    .locator('a[href^="/bs/history/list/"][href$="/monthly"]')
    .evaluateAll((links) => [
      ...new Set(links.map((link) => link.getAttribute("href")).filter(Boolean)),
    ]);
  const points = [...currentPoints];
  for (const monthlyPath of monthlyPaths) {
    await page.waitForTimeout(1_500 + Math.floor(Math.random() * 1_501));
    await page.goto(new URL(monthlyPath!, URLS.assetHistory).toString(), {
      waitUntil: "domcontentloaded",
    });
    points.push(...(await readAssetHistoryTable(page)));
  }
  return [...new Map(points.map((point) => [point.date, point])).values()].sort((left, right) =>
    right.date.localeCompare(left.date),
  );
}

async function precedingHeading(table: ReturnType<Page["locator"]>): Promise<string> {
  return table.evaluate((element) => {
    let previous = element.previousElementSibling;
    while (previous !== null) {
      const heading = previous.matches("h1.heading-normal")
        ? previous
        : previous.querySelector("h1.heading-normal");
      if (heading !== null) return heading.textContent?.trim() ?? "";
      previous = previous.previousElementSibling;
    }
    return "";
  });
}

async function scrapePortfolio(page: Page): Promise<PortfolioItem[]> {
  await page.goto(URLS.portfolio, { waitUntil: "domcontentloaded" });
  await page.locator("h1.heading-normal").first().waitFor({ state: "visible", timeout: 10_000 });
  const definitions = [
    { selector: "table.table-depo", name: 0, balance: 1, institution: 2 },
    {
      selector: "table.table-eq",
      name: 1,
      balance: 5,
      daily: 6,
      gain: 7,
      gainPct: 8,
      institution: 9,
    },
    {
      selector: "table.table-mf",
      name: 0,
      balance: 4,
      daily: 5,
      gain: 6,
      gainPct: 7,
      institution: 8,
    },
    { selector: "table.table-pns", name: 0, balance: 2, gain: 3, gainPct: 4, institution: 6 },
  ] as const;
  const items: PortfolioItem[] = [];
  for (const definition of definitions) {
    const tables = page.locator(definition.selector);
    for (let tableIndex = 0; tableIndex < (await tables.count()); tableIndex += 1) {
      const table = tables.nth(tableIndex);
      const type = (await precedingHeading(table)) || "その他";
      const rows = table.locator("tbody tr");
      for (let rowIndex = 0; rowIndex < (await rows.count()); rowIndex += 1) {
        const cells = rows.nth(rowIndex).locator("td");
        const texts = await Promise.all(
          Array.from({ length: await cells.count() }, (_, index) =>
            cells
              .nth(index)
              .textContent()
              .catch(() => ""),
          ),
        );
        const name = texts[definition.name]?.trim() ?? "";
        if (name === "") continue;
        const item: PortfolioItem = {
          name,
          type,
          institution: texts[definition.institution]?.trim() ?? "",
          balanceYen: Math.max(0, parseJapaneseNumber(texts[definition.balance] ?? "0")),
        };
        if ("daily" in definition)
          item.dailyChangeYen = parseJapaneseNumber(texts[definition.daily] ?? "0");
        if ("gain" in definition)
          item.unrealizedGainYen = parseJapaneseNumber(texts[definition.gain] ?? "0");
        if ("gainPct" in definition) {
          const parsed = Number.parseFloat((texts[definition.gainPct] ?? "").replace("%", ""));
          if (Number.isFinite(parsed)) item.unrealizedGainPercent = parsed;
        }
        items.push(item);
      }
    }
  }
  return items;
}

async function scrapeTotalLiabilities(page: Page): Promise<number> {
  await page.goto(URLS.liabilities, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");

  const detailRows = page.locator("table.table-det tbody tr");
  let total = 0;
  for (let index = 0; index < (await detailRows.count()); index += 1) {
    const cells = detailRows.nth(index).locator("td");
    if ((await cells.count()) < 4) continue;
    const category =
      (await cells
        .nth(0)
        .textContent()
        .catch(() => "")) ?? "";
    const name =
      (await cells
        .nth(1)
        .textContent()
        .catch(() => "")) ?? "";
    const balance =
      (await cells
        .nth(2)
        .textContent()
        .catch(() => "0")) ?? "0";
    if (category.includes("種類") || name.includes("名称") || name.trim() === "") continue;
    total += parseJapaneseNumber(balance);
  }

  if (total > 0) return total;
  const summaryRows = page.locator("table.table-bordered").first().locator("tbody tr, tr");
  for (let index = 0; index < (await summaryRows.count()); index += 1) {
    const cells = summaryRows.nth(index).locator("td");
    if ((await cells.count()) < 2) continue;
    const category =
      (await cells
        .nth(0)
        .textContent()
        .catch(() => "")) ?? "";
    const balance =
      (await cells
        .nth(1)
        .textContent()
        .catch(() => "0")) ?? "0";
    if (category.trim() !== "" && !category.includes("負債") && !category.includes("合計")) {
      total += Math.max(0, parseJapaneseNumber(balance));
    }
  }
  return total;
}

export function parseCashFlowMonthCsvHref(href: string | null): string | null {
  const year = href?.match(/[?&]year=(\d{4})/)?.[1];
  const month = Number(href?.match(/[?&]month=(\d{1,2})/)?.[1]);
  if (year === undefined || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseCashFlowMonthHeader(header: string | null): string | null {
  const match =
    header?.match(/(\d{4})年(\d{1,2})月/) ??
    header?.match(/\d{4}\/\d{1,2}\/\d{1,2}\s*-\s*(\d{4})\/(\d{1,2})\/\d{1,2}/);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${String(month).padStart(2, "0")}`;
}

async function getDisplayedCashFlowMonth(page: Page): Promise<string> {
  const csvHref = await page
    .locator("a[href*='/cf/csv']")
    .first()
    .getAttribute("href")
    .catch(() => null);
  const csvMonth = parseCashFlowMonthCsvHref(csvHref);
  if (csvMonth !== null) return csvMonth;

  const header = await page
    .locator(".fc-header-title h2")
    .first()
    .textContent()
    .catch(() => null);
  const headerMonth = parseCashFlowMonthHeader(header);
  if (headerMonth !== null) return headerMonth;
  throw new Error("Failed to detect the displayed cash flow month");
}

async function waitForCashFlowFetchApplied(
  page: Page,
  navigate: () => Promise<void>,
): Promise<void> {
  const stateKey = "__mfExporterCashFlowAjax";
  await page.evaluate((key) => {
    type AjaxSettings = { url?: string };
    type AjaxHandler = (event: unknown, xhr: unknown, settings: AjaxSettings) => void;
    type JQueryTarget = {
      on: (eventName: string, handler: AjaxHandler) => void;
      off: (eventName: string, handler: AjaxHandler) => void;
    };
    type JQueryFactory = (target: Document) => JQueryTarget;
    const jquery = Reflect.get(window, "jQuery") as JQueryFactory | undefined;
    if (jquery === undefined) throw new Error("Cash flow AJAX lifecycle is unavailable");

    const target = jquery(document);
    const state = { completed: false, target, handler: null as AjaxHandler | null };
    state.handler = (_event, _xhr, settings) => {
      if (settings.url?.includes("/cf/fetch")) {
        state.completed = true;
        target.off("ajaxComplete.mfExporterCashFlow", state.handler!);
      }
    };
    target.on("ajaxComplete.mfExporterCashFlow", state.handler);
    Reflect.set(window, key, state);
  }, stateKey);

  try {
    await navigate();
    await page.waitForFunction((key) => Reflect.get(window, key)?.completed === true, stateKey, {
      timeout: 15_000,
    });
  } finally {
    await page
      .evaluate((key) => {
        const state = Reflect.get(window, key);
        if (state?.handler !== undefined) {
          state.target.off("ajaxComplete.mfExporterCashFlow", state.handler);
        }
        Reflect.deleteProperty(window, key);
      }, stateKey)
      .catch(() => undefined);
  }
}

async function readDisplayedMonthlySummary(page: Page): Promise<MonthlySummary> {
  const month = await getDisplayedCashFlowMonth(page);
  const cells = page.locator("#monthly_total_table_kakeibo tbody tr").first().locator("td");
  const [incomeText, expenseText] = await Promise.all([
    cells.nth(0).textContent({ timeout: 3_000 }),
    cells.nth(2).textContent({ timeout: 3_000 }),
  ]);
  if (incomeText === null || expenseText === null) {
    throw new Error(`Failed to read the cash flow summary for ${month}`);
  }
  const incomeSources: Record<string, number> = {};
  const expenseCategories: Record<string, number> = {};
  const investmentTransfers: Record<string, number> = {};
  const rows = page.locator("#cf-detail-table tbody tr");
  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    const cells = row.locator("td");
    if ((await cells.count()) < 7) continue;
    const [
      rowClass,
      amountClass,
      amountStyle,
      amountHtml,
      descriptionText,
      transferTitle,
      categoryText,
      amountText,
    ] = await Promise.all([
      row.getAttribute("class").catch(() => ""),
      cells
        .nth(3)
        .getAttribute("class")
        .catch(() => ""),
      cells
        .nth(3)
        .getAttribute("style")
        .catch(() => ""),
      cells
        .nth(3)
        .innerHTML()
        .catch(() => ""),
      cells
        .nth(2)
        .textContent()
        .catch(() => ""),
      cells
        .nth(4)
        .getAttribute("data-original-title")
        .catch(() => ""),
      cells
        .nth(5)
        .textContent()
        .catch(() => ""),
      cells
        .nth(3)
        .textContent()
        .catch(() => "0"),
    ]);
    const transfer = parseTransferRoute(transferTitle ?? "");
    if (transfer !== null && isInvestmentAccount(transfer.destination)) {
      investmentTransfers[transfer.destination] =
        (investmentTransfers[transfer.destination] ?? 0) +
        Math.abs(parseJapaneseNumber(amountText ?? "0"));
      continue;
    }
    const category = categoryText?.trim() ?? "";
    if (category === "" || rowClass?.includes("mf-grayout")) continue;
    const incomeMarkers = `${amountClass ?? ""} ${amountStyle ?? ""} ${amountHtml}`;
    const isIncome =
      incomeMarkers.includes("plus") ||
      incomeMarkers.includes("income") ||
      incomeMarkers.includes("blue");
    if (isIncome) {
      const source = (descriptionText?.trim() || category || "収入（内訳未取得）")
        .replace(/\s+/g, " ")
        .slice(0, 48);
      incomeSources[source] =
        (incomeSources[source] ?? 0) + Math.abs(parseJapaneseNumber(amountText ?? "0"));
      continue;
    }
    expenseCategories[category] =
      (expenseCategories[category] ?? 0) + Math.abs(parseJapaneseNumber(amountText ?? "0"));
  }
  return {
    month,
    incomeYen: Math.abs(parseJapaneseNumber(incomeText)),
    incomeSources,
    expenseYen: Math.abs(parseJapaneseNumber(expenseText)),
    expenseCategories,
    investmentTransfers,
  };
}

async function scrapeMonthlySummaries(
  page: Page,
  monthsToScrape: number,
): Promise<MonthlySummary[]> {
  await page.goto(URLS.cashFlow, { waitUntil: "domcontentloaded" });
  await page.locator("#monthly_total_table_kakeibo").waitFor({
    state: "visible",
    timeout: 10_000,
  });

  const results: MonthlySummary[] = [];
  for (let index = 0; index < monthsToScrape; index += 1) {
    const currentMonth = await getDisplayedCashFlowMonth(page);
    results.push(await readDisplayedMonthlySummary(page));
    if (index === monthsToScrape - 1) break;

    const previousButton = page.locator("button.fc-button-prev, span.fc-button-prev").first();
    await page.waitForTimeout(1_500 + Math.floor(Math.random() * 1_501));
    await waitForCashFlowFetchApplied(page, async () => {
      await previousButton.click();
    });
    const previousMonth = await getDisplayedCashFlowMonth(page);
    if (previousMonth === currentMonth) break;
  }
  return results;
}

export async function scrapeSnapshot(
  page: Page,
  historyMonths: number,
  backfillAssetHistory = false,
): Promise<MoneyForwardSnapshot> {
  const assetHistory = await scrapeAssetHistory(page, backfillAssetHistory);
  const totalAssetsYen = assetHistory[0]?.totalAssetsYen ?? 0;
  const portfolio = await scrapePortfolio(page);
  const totalLiabilitiesYen = await scrapeTotalLiabilities(page);
  const monthlySummaries = await scrapeMonthlySummaries(page, historyMonths);
  return {
    collectedAt: new Date(),
    totalAssetsYen,
    totalLiabilitiesYen,
    monthlySummaries,
    assetHistory,
    portfolio,
  };
}
