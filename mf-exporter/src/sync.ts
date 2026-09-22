import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createAuthenticatedContext } from "./auth.js";
import { scrapeSnapshot } from "./scrape.js";
import type { AssetHistoryPoint, MoneyForwardSnapshot, MonthlySummary } from "./types.js";

type CachedMonthlySummary = Omit<MonthlySummary, "incomeSources" | "investmentTransfers"> & {
  incomeSources?: Record<string, number>;
  investmentTransfers?: Record<string, number>;
};

function isMonthlySummary(value: unknown): value is CachedMonthlySummary {
  if (typeof value !== "object" || value === null) return false;
  const summary = value as Record<string, unknown>;
  return (
    typeof summary.month === "string" &&
    /^\d{4}-\d{2}$/.test(summary.month) &&
    typeof summary.incomeYen === "number" &&
    Number.isFinite(summary.incomeYen) &&
    typeof summary.expenseYen === "number" &&
    Number.isFinite(summary.expenseYen) &&
    typeof summary.expenseCategories === "object" &&
    summary.expenseCategories !== null &&
    Object.values(summary.expenseCategories).every(
      (amount) => typeof amount === "number" && Number.isFinite(amount),
    ) &&
    (summary.incomeSources === undefined ||
      (typeof summary.incomeSources === "object" &&
        summary.incomeSources !== null &&
        Object.values(summary.incomeSources).every(
          (amount) => typeof amount === "number" && Number.isFinite(amount),
        ))) &&
    (summary.investmentTransfers === undefined ||
      (typeof summary.investmentTransfers === "object" &&
        summary.investmentTransfers !== null &&
        Object.values(summary.investmentTransfers).every(
          (amount) => typeof amount === "number" && Number.isFinite(amount),
        )))
  );
}

async function loadMonthlyCache(cachePath: string): Promise<MonthlySummary[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(cachePath, "utf8"));
    if (!Array.isArray(parsed) || !parsed.every(isMonthlySummary)) {
      throw new Error("Monthly summary cache has an invalid format");
    }
    return parsed.map((summary) => ({
      ...summary,
      incomeSources: summary.incomeSources ?? {
        "収入（内訳未取得）": summary.incomeYen,
      },
      investmentTransfers: summary.investmentTransfers ?? {},
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function isAssetHistoryPoint(value: unknown): value is AssetHistoryPoint {
  if (typeof value !== "object" || value === null) return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(point.date) &&
    typeof point.totalAssetsYen === "number" &&
    Number.isFinite(point.totalAssetsYen) &&
    typeof point.categories === "object" &&
    point.categories !== null
  );
}

async function loadAssetHistoryCache(cachePath: string): Promise<AssetHistoryPoint[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(cachePath, "utf8"));
    if (!Array.isArray(parsed) || !parsed.every(isAssetHistoryPoint)) {
      throw new Error("Asset history cache has an invalid format");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function saveMonthlyCache(cachePath: string, summaries: MonthlySummary[]): Promise<void> {
  await mkdir(path.dirname(cachePath), { recursive: true });
  const temporaryPath = `${cachePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(summaries)}\n`, { mode: 0o600 });
  await rename(temporaryPath, cachePath);
}

async function saveAssetHistoryCache(
  cachePath: string,
  points: AssetHistoryPoint[],
): Promise<void> {
  await mkdir(path.dirname(cachePath), { recursive: true });
  const temporaryPath = `${cachePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(points)}\n`, { mode: 0o600 });
  await rename(temporaryPath, cachePath);
}

export function mergeAssetHistory(
  cached: AssetHistoryPoint[],
  current: AssetHistoryPoint[],
): AssetHistoryPoint[] {
  const byDate = new Map(cached.map((point) => [point.date, point]));
  for (const point of current) byDate.set(point.date, point);
  return [...byDate.values()].sort((left, right) => right.date.localeCompare(left.date));
}

export function mergeMonthlySummaries(
  cached: MonthlySummary[],
  current: MonthlySummary[],
  historyMonths: number,
): MonthlySummary[] {
  const byMonth = new Map(cached.map((summary) => [summary.month, summary]));
  for (const summary of current) byMonth.set(summary.month, summary);
  return [...byMonth.values()]
    .sort((left, right) => right.month.localeCompare(left.month))
    .slice(0, historyMonths);
}

export async function synchronize(
  authStatePath: string,
  assetHistoryCachePath: string,
  monthlyCachePath: string,
  historyMonths: number,
): Promise<MoneyForwardSnapshot> {
  const cachedSummaries = await loadMonthlyCache(monthlyCachePath);
  const cachedAssetHistory = await loadAssetHistoryCache(assetHistoryCachePath);
  const monthsToScrape = cachedSummaries.length === 0 ? historyMonths : Math.min(2, historyMonths);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await createAuthenticatedContext(browser, authStatePath);
    try {
      const page = await context.newPage();
      try {
        const snapshot = await scrapeSnapshot(
          page,
          monthsToScrape,
          cachedAssetHistory.length === 0,
        );
        snapshot.monthlySummaries = mergeMonthlySummaries(
          cachedSummaries,
          snapshot.monthlySummaries,
          historyMonths,
        );
        snapshot.assetHistory = mergeAssetHistory(cachedAssetHistory, snapshot.assetHistory);
        await saveMonthlyCache(monthlyCachePath, snapshot.monthlySummaries);
        await saveAssetHistoryCache(assetHistoryCachePath, snapshot.assetHistory);
        return snapshot;
      } finally {
        await page.close();
      }
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
