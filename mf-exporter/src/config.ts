export interface Config {
  port: number;
  syncIntervalMs: number;
  syncOnStart: boolean;
  authStatePath: string;
  assetHistoryCachePath: string;
  monthlyCachePath: string;
  historyMonths: number;
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("SYNC_ON_START must be true or false");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = parsePositiveInteger(env.PORT, 8000, "PORT");
  const syncIntervalSeconds = parsePositiveInteger(
    env.SYNC_INTERVAL_SECONDS,
    86_400,
    "SYNC_INTERVAL_SECONDS",
  );
  const historyMonths = parsePositiveInteger(
    env.MONEYFORWARD_HISTORY_MONTHS,
    24,
    "MONEYFORWARD_HISTORY_MONTHS",
  );
  if (historyMonths > 60) {
    throw new Error("MONEYFORWARD_HISTORY_MONTHS must be 60 or less");
  }

  return {
    port,
    syncIntervalMs: syncIntervalSeconds * 1000,
    syncOnStart: parseBoolean(env.SYNC_ON_START, true),
    authStatePath: env.AUTH_STATE_PATH?.trim() || "/data/auth-state.json",
    assetHistoryCachePath: env.ASSET_HISTORY_CACHE_PATH?.trim() || "/data/asset-history.json",
    monthlyCachePath: env.MONTHLY_CACHE_PATH?.trim() || "/data/monthly-summaries-v2.json",
    historyMonths,
  };
}
