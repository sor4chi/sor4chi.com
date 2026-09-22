import { expect, it } from "vitest";
import { mergeAssetHistory, mergeMonthlySummaries } from "./sync.js";

it("retains cached history while replacing recently scraped months", () => {
  const cached = [
    {
      month: "2026-08",
      incomeYen: 100,
      incomeSources: {},
      expenseYen: 80,
      expenseCategories: {},
      investmentTransfers: {},
    },
    {
      month: "2026-07",
      incomeYen: 90,
      incomeSources: {},
      expenseYen: 70,
      expenseCategories: {},
      investmentTransfers: {},
    },
  ];
  const current = [
    {
      month: "2026-09",
      incomeYen: 120,
      incomeSources: {},
      expenseYen: 95,
      expenseCategories: {},
      investmentTransfers: {},
    },
    {
      month: "2026-08",
      incomeYen: 110,
      incomeSources: {},
      expenseYen: 85,
      expenseCategories: {},
      investmentTransfers: {},
    },
  ];

  expect(mergeMonthlySummaries(cached, current, 3)).toEqual([
    {
      month: "2026-09",
      incomeYen: 120,
      incomeSources: {},
      expenseYen: 95,
      expenseCategories: {},
      investmentTransfers: {},
    },
    {
      month: "2026-08",
      incomeYen: 110,
      incomeSources: {},
      expenseYen: 85,
      expenseCategories: {},
      investmentTransfers: {},
    },
    {
      month: "2026-07",
      incomeYen: 90,
      incomeSources: {},
      expenseYen: 70,
      expenseCategories: {},
      investmentTransfers: {},
    },
  ]);
});

it("merges asset history by date and replaces refreshed points", () => {
  const cached = [{ date: "2026-08-31", totalAssetsYen: 100, categories: { cash: 100 } }];
  const current = [
    { date: "2026-09-01", totalAssetsYen: 120, categories: { cash: 120 } },
    { date: "2026-08-31", totalAssetsYen: 110, categories: { cash: 110 } },
  ];
  expect(mergeAssetHistory(cached, current)).toEqual(current);
});
