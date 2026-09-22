import { describe, expect, it } from "vitest";
import { MetricsRegistry } from "./metrics.js";

describe("MetricsRegistry", () => {
  it("renders aggregate financial metrics without transaction labels", () => {
    const registry = new MetricsRegistry();
    const startedAt = registry.startAttempt();
    registry.completeAttempt(startedAt, {
      collectedAt: new Date("2026-09-22T00:00:00Z"),
      totalAssetsYen: 5_000_000,
      totalLiabilitiesYen: 200_000,
      monthlySummaries: [
        {
          month: "2026-09",
          incomeYen: 400_000,
          incomeSources: { 勤務先A: 300_000, 副業B: 100_000 },
          expenseYen: 250_000,
          expenseCategories: { 食費: 150_000, 住宅: 100_000 },
          investmentTransfers: { Example証券: 50_000 },
        },
        {
          month: "2026-08",
          incomeYen: 280_000,
          incomeSources: { 勤務先A: 280_000 },
          expenseYen: 120_000,
          expenseCategories: { 住宅: 120_000 },
          investmentTransfers: {},
        },
      ],
      assetHistory: [
        {
          date: "2026-09-22",
          totalAssetsYen: 5_000_000,
          categories: { 投資信託: 2_000_000, "預金・現金": 3_000_000 },
        },
        {
          date: "2025-09-22",
          totalAssetsYen: 4_000_000,
          categories: { 投資信託: 1_500_000, "預金・現金": 2_500_000 },
        },
      ],
      portfolio: [
        { name: "Example Fund", type: "投資信託", institution: "Example", balanceYen: 500_000 },
      ],
    });

    const output = registry.render();
    expect(output).toContain("moneyforward_assets_yen 5000000");
    expect(output).toContain("moneyforward_net_worth_yen 4800000");
    expect(output).toContain('moneyforward_monthly_income_yen{month="2026-09"} 400000');
    expect(output).toContain(
      'moneyforward_monthly_income_source_yen{month="2026-08",source="副業B"} 0',
    );
    expect(output).toContain("moneyforward_current_month_balance_yen 150000");
    expect(output).toContain('moneyforward_asset_history_yen{date="2026-09-22"} 5000000');
    expect(output).toContain('moneyforward_asset_category_yen{category="預金・現金"} 3000000');
    expect(output).toContain(
      'moneyforward_asset_history_category_yen{category="投資信託",date="2026-09-22"} 2000000',
    );
    expect(output).toContain("moneyforward_asset_one_year_change_yen 1000000");
    expect(output).toContain(
      'moneyforward_monthly_expense_category_yen{category="食費",month="2026-09"} 150000',
    );
    expect(output).toContain(
      'moneyforward_monthly_expense_category_yen{category="食費",month="2026-08"} 0',
    );
    expect(output).toContain(
      'moneyforward_monthly_cashflow_link_yen{destination="支出 / 食費",month="2026-09",pool="Pool",source="勤務先A"} 112500',
    );
    expect(output).toContain(
      'moneyforward_monthly_cashflow_link_yen{destination="現金余剰",month="2026-09",pool="Pool",source="副業B"} 25000',
    );
    expect(output).toContain(
      'moneyforward_monthly_cashflow_link_yen{destination="投資 / Example証券",month="2026-09",pool="Pool",source="副業B"} 12500',
    );
    expect(output).toContain(
      'moneyforward_monthly_investment_transfer_total_yen{month="2026-09"} 50000',
    );
    expect(output).toContain(
      'moneyforward_monthly_investment_transfer_yen{account="Example証券",month="2026-08"} 0',
    );
    expect(output).toContain('moneyforward_monthly_cash_savings_yen{month="2026-09"} 100000');
    expect(output).toContain(
      'moneyforward_monthly_flow_yen{kind="投資振替",month="2026-09"} 50000',
    );
    expect(output).toContain(
      'institution="Example",name="Example Fund",position="0",type="投資信託"} 500000',
    );
    expect(output).not.toContain("transaction");
    expect(output).not.toContain("memo");
    expect(output).not.toContain("transaction_id");
  });
});
