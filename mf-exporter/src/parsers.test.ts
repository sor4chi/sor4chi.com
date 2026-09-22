import { describe, expect, it } from "vitest";
import { parseJapaneseNumber } from "./parsers.js";
import {
  isInvestmentAccount,
  parseCashFlowMonthCsvHref,
  parseCashFlowMonthHeader,
  parseTransferRoute,
} from "./scrape.js";

describe("parseJapaneseNumber", () => {
  it.each([
    ["1,234円", 1234],
    ["▲12,345円", -12345],
    ["1億9233万400円", 192330400],
    ["取得失敗", 0],
  ])("parses %s", (value, expected) => {
    expect(parseJapaneseNumber(value)).toBe(expected);
  });
});

it("parses a cash flow month from the CSV link", () => {
  expect(parseCashFlowMonthCsvHref("/cf/csv?year=2026&month=9")).toBe("2026-09");
  expect(parseCashFlowMonthCsvHref("/cf/csv?year=2026&month=13")).toBeNull();
});

it("parses a cash flow month from the page header", () => {
  expect(parseCashFlowMonthHeader("2026年9月")).toBe("2026-09");
  expect(parseCashFlowMonthHeader("2026/08/25 - 2026/09/24")).toBe("2026-09");
});

it("parses transfer routes and identifies investment destinations", () => {
  expect(parseTransferRoute("普通預金からExample証券への振替")).toEqual({
    source: "普通預金",
    destination: "Example証券",
  });
  expect(parseTransferRoute("振替")).toBeNull();
  expect(isInvestmentAccount("Example証券")).toBe(true);
  expect(isInvestmentAccount("普通預金")).toBe(false);
});
