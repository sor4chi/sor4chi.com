// Derived from hiroppy/mf-dashboard (MIT), apps/crawler/src/parsers.ts.
export function parseJapaneseNumber(value: string): number {
  if (value === "") return 0;

  const isNegative = value.includes("-") || value.includes("−") || value.includes("▲");
  let total = 0;
  let remaining = value.replace(/[¥,$,\s円+\-−▲]/g, "");

  const okuMatch = remaining.match(/(\d+(?:\.\d+)?)億/);
  if (okuMatch?.[1] !== undefined) {
    total += Number.parseFloat(okuMatch[1]) * 100_000_000;
    remaining = remaining.replace(/\d+(?:\.\d+)?億/, "");
  }

  const manMatch = remaining.match(/(\d+(?:\.\d+)?)万/);
  if (manMatch?.[1] !== undefined) {
    total += Number.parseFloat(manMatch[1]) * 10_000;
    remaining = remaining.replace(/\d+(?:\.\d+)?万/, "");
  }

  if (okuMatch !== null || manMatch !== null) {
    const remainder = Number.parseInt(remaining.replace(/\D/g, ""), 10);
    if (Number.isFinite(remainder)) total += remainder;
    const rounded = Math.round(total);
    return isNegative ? -rounded : rounded;
  }

  const parsed = Number.parseInt(value.replace(/[¥,$\s円+\-−▲]/g, ""), 10);
  if (!Number.isFinite(parsed)) return 0;
  return isNegative ? -parsed : parsed;
}
