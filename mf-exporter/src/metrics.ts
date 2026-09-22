import type { MoneyForwardSnapshot } from "./types.js";

interface SyncState {
  attempts: number;
  failures: number;
  lastAttemptSucceeded: boolean;
  lastDurationSeconds: number;
  lastSuccessTimestampSeconds: number;
  snapshot: MoneyForwardSnapshot | null;
}

function sample(name: string, value: number, labels = ""): string {
  return `${name}${labels} ${Number.isFinite(value) ? value : 0}`;
}

function monthLabel(month: string): string {
  return `{month="${month.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"}`;
}

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

function labels(values: Record<string, string>): string {
  return `{${Object.entries(values)
    .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
    .join(",")}}`;
}

function isInvestmentCategory(category: string): boolean {
  return /(投資|株式|投信|証券|資産運用|積立|iDeCo|NISA)/i.test(category);
}

function addAmount(amounts: Map<string, number>, name: string, amount: number): void {
  if (amount <= 0) return;
  amounts.set(name, (amounts.get(name) ?? 0) + amount);
}

function limitSources(sources: Map<string, number>, limit = 8): Map<string, number> {
  const sorted = [...sources.entries()].sort((left, right) => right[1] - left[1]);
  if (sorted.length <= limit) return new Map(sorted);
  const visible = sorted.slice(0, limit - 1);
  visible.push([
    "収入（その他）",
    sorted.slice(limit - 1).reduce((sum, [, amount]) => sum + amount, 0),
  ]);
  return new Map(visible);
}

function cashFlowSources(
  incomeYen: number,
  incomeSources: Record<string, number>,
  flowOutflow: number,
): Map<string, number> {
  const parsed = new Map(
    Object.entries(incomeSources).filter(([, amount]) => Number.isFinite(amount) && amount > 0),
  );
  const parsedTotal = [...parsed.values()].reduce((sum, amount) => sum + amount, 0);
  const reconciled = new Map<string, number>();
  if (incomeYen > 0 && parsedTotal > 0) {
    const scale = Math.min(1, incomeYen / parsedTotal);
    for (const [source, amount] of parsed) addAmount(reconciled, source, amount * scale);
  }
  const reconciledTotal = [...reconciled.values()].reduce((sum, amount) => sum + amount, 0);
  addAmount(reconciled, "収入（内訳未取得）", incomeYen - reconciledTotal);
  addAmount(reconciled, "資産取崩", flowOutflow - incomeYen);
  return limitSources(reconciled);
}

function cashFlowDestinations(
  incomeYen: number,
  expenseYen: number,
  expenseCategories: Record<string, number>,
  investmentTransfers: Record<string, number>,
): { destinations: Map<string, number>; flowOutflow: number } {
  const destinations = new Map<string, number>();
  const categoryTotal = Object.values(expenseCategories).reduce((sum, amount) => sum + amount, 0);
  const flowExpense = Math.max(expenseYen, categoryTotal);
  for (const [category, amount] of Object.entries(expenseCategories)) {
    const kind = isInvestmentCategory(category) ? "投資" : "支出";
    addAmount(destinations, `${kind} / ${category}`, amount);
  }
  addAmount(destinations, "支出 / その他・調整", flowExpense - categoryTotal);
  const investmentTotal = Object.values(investmentTransfers).reduce(
    (sum, amount) => sum + amount,
    0,
  );
  for (const [account, amount] of Object.entries(investmentTransfers)) {
    addAmount(destinations, `投資 / ${account}`, amount);
  }
  const flowOutflow = flowExpense + investmentTotal;
  addAmount(destinations, "現金余剰", incomeYen - flowOutflow);
  return { destinations, flowOutflow };
}

const DAY_MS = 86_400_000;

function dateMilliseconds(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function closestHistoryPoint(
  points: MoneyForwardSnapshot["assetHistory"],
  targetMilliseconds: number,
) {
  return points.reduce<(typeof points)[number] | undefined>((closest, point) => {
    if (closest === undefined) return point;
    return Math.abs(dateMilliseconds(point.date) - targetMilliseconds) <
      Math.abs(dateMilliseconds(closest.date) - targetMilliseconds)
      ? point
      : closest;
  }, undefined);
}

function calculateAssetTrend(points: MoneyForwardSnapshot["assetHistory"]): {
  annualChangePercent: number;
  annualChangeYen: number;
  projectedOneYearYen: number;
  projectedOneYearChangeYen: number;
} | null {
  const latest = points[0];
  if (latest === undefined) return null;
  const latestTime = dateMilliseconds(latest.date);
  const annualReference = closestHistoryPoint(points, latestTime - 365 * DAY_MS);
  if (annualReference === undefined) return null;

  const trendPoints = points.filter(
    (point) => dateMilliseconds(point.date) >= latestTime - 90 * DAY_MS,
  );
  const coordinates = trendPoints.map((point) => ({
    x: (dateMilliseconds(point.date) - latestTime) / DAY_MS,
    y: point.totalAssetsYen,
  }));
  const meanX = coordinates.reduce((sum, point) => sum + point.x, 0) / coordinates.length;
  const meanY = coordinates.reduce((sum, point) => sum + point.y, 0) / coordinates.length;
  const denominator = coordinates.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  const slopePerDay =
    denominator === 0
      ? 0
      : coordinates.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) /
        denominator;
  const annualChangeYen = latest.totalAssetsYen - annualReference.totalAssetsYen;
  const projectedOneYearChangeYen = slopePerDay * 365;
  return {
    annualChangePercent:
      annualReference.totalAssetsYen === 0
        ? 0
        : (annualChangeYen / annualReference.totalAssetsYen) * 100,
    annualChangeYen,
    projectedOneYearYen: latest.totalAssetsYen + projectedOneYearChangeYen,
    projectedOneYearChangeYen,
  };
}

export class MetricsRegistry {
  readonly #state: SyncState = {
    attempts: 0,
    failures: 0,
    lastAttemptSucceeded: false,
    lastDurationSeconds: 0,
    lastSuccessTimestampSeconds: 0,
    snapshot: null,
  };

  startAttempt(): number {
    this.#state.attempts += 1;
    return performance.now();
  }

  completeAttempt(startedAt: number, snapshot: MoneyForwardSnapshot): void {
    this.#state.lastAttemptSucceeded = true;
    this.#state.lastDurationSeconds = (performance.now() - startedAt) / 1000;
    this.#state.lastSuccessTimestampSeconds = snapshot.collectedAt.getTime() / 1000;
    this.#state.snapshot = snapshot;
  }

  failAttempt(startedAt: number): void {
    this.#state.failures += 1;
    this.#state.lastAttemptSucceeded = false;
    this.#state.lastDurationSeconds = (performance.now() - startedAt) / 1000;
  }

  hasSuccessfulSnapshot(): boolean {
    return this.#state.snapshot !== null;
  }

  render(): string {
    const lines = [
      "# HELP moneyforward_exporter_sync_attempts_total Total synchronization attempts.",
      "# TYPE moneyforward_exporter_sync_attempts_total counter",
      sample("moneyforward_exporter_sync_attempts_total", this.#state.attempts),
      "# HELP moneyforward_exporter_sync_failures_total Total failed synchronization attempts.",
      "# TYPE moneyforward_exporter_sync_failures_total counter",
      sample("moneyforward_exporter_sync_failures_total", this.#state.failures),
      "# HELP moneyforward_exporter_last_sync_success Whether the latest attempt succeeded.",
      "# TYPE moneyforward_exporter_last_sync_success gauge",
      sample("moneyforward_exporter_last_sync_success", this.#state.lastAttemptSucceeded ? 1 : 0),
      "# HELP moneyforward_exporter_last_sync_duration_seconds Duration of the latest attempt.",
      "# TYPE moneyforward_exporter_last_sync_duration_seconds gauge",
      sample("moneyforward_exporter_last_sync_duration_seconds", this.#state.lastDurationSeconds),
      "# HELP moneyforward_exporter_last_success_timestamp_seconds Unix timestamp of the last successful synchronization.",
      "# TYPE moneyforward_exporter_last_success_timestamp_seconds gauge",
      sample(
        "moneyforward_exporter_last_success_timestamp_seconds",
        this.#state.lastSuccessTimestampSeconds,
      ),
    ];

    const snapshot = this.#state.snapshot;
    if (snapshot !== null) {
      lines.push(
        "# HELP moneyforward_assets_yen Current total assets in Japanese yen.",
        "# TYPE moneyforward_assets_yen gauge",
        sample("moneyforward_assets_yen", snapshot.totalAssetsYen),
        "# HELP moneyforward_liabilities_yen Current total liabilities in Japanese yen.",
        "# TYPE moneyforward_liabilities_yen gauge",
        sample("moneyforward_liabilities_yen", snapshot.totalLiabilitiesYen),
        "# HELP moneyforward_net_worth_yen Current net worth in Japanese yen.",
        "# TYPE moneyforward_net_worth_yen gauge",
        sample(
          "moneyforward_net_worth_yen",
          snapshot.totalAssetsYen - snapshot.totalLiabilitiesYen,
        ),
        "# HELP moneyforward_snapshot_timestamp_seconds Timestamp represented by the current snapshot.",
        "# TYPE moneyforward_snapshot_timestamp_seconds gauge",
        sample("moneyforward_snapshot_timestamp_seconds", snapshot.collectedAt.getTime() / 1000),
        "# HELP moneyforward_monthly_income_yen Monthly income in Japanese yen.",
        "# TYPE moneyforward_monthly_income_yen gauge",
      );
      for (const summary of snapshot.monthlySummaries) {
        lines.push(
          sample("moneyforward_monthly_income_yen", summary.incomeYen, monthLabel(summary.month)),
        );
      }
      const incomeSources = new Set(
        snapshot.monthlySummaries.flatMap((summary) => Object.keys(summary.incomeSources)),
      );
      lines.push(
        "# HELP moneyforward_monthly_income_source_yen Monthly income by source in Japanese yen.",
        "# TYPE moneyforward_monthly_income_source_yen gauge",
      );
      for (const summary of snapshot.monthlySummaries) {
        for (const source of incomeSources) {
          lines.push(
            sample(
              "moneyforward_monthly_income_source_yen",
              summary.incomeSources[source] ?? 0,
              labels({ month: summary.month, source }),
            ),
          );
        }
      }
      lines.push(
        "# HELP moneyforward_asset_history_yen Historical total assets in Japanese yen.",
        "# TYPE moneyforward_asset_history_yen gauge",
      );
      for (const point of snapshot.assetHistory) {
        lines.push(
          sample(
            "moneyforward_asset_history_yen",
            point.totalAssetsYen,
            labels({ date: point.date }),
          ),
        );
      }
      lines.push(
        "# HELP moneyforward_asset_history_category_yen Historical assets by category in Japanese yen.",
        "# TYPE moneyforward_asset_history_category_yen gauge",
      );
      for (const point of snapshot.assetHistory) {
        for (const [category, value] of Object.entries(point.categories)) {
          if (value === 0) continue;
          lines.push(
            sample(
              "moneyforward_asset_history_category_yen",
              value,
              labels({ category, date: point.date }),
            ),
          );
        }
      }
      const assetTrend = calculateAssetTrend(snapshot.assetHistory);
      if (assetTrend !== null) {
        lines.push(
          "# HELP moneyforward_asset_one_year_change_yen Asset change versus approximately one year ago.",
          "# TYPE moneyforward_asset_one_year_change_yen gauge",
          sample("moneyforward_asset_one_year_change_yen", assetTrend.annualChangeYen),
          "# HELP moneyforward_asset_one_year_change_percent Asset percentage change versus approximately one year ago.",
          "# TYPE moneyforward_asset_one_year_change_percent gauge",
          sample("moneyforward_asset_one_year_change_percent", assetTrend.annualChangePercent),
          "# HELP moneyforward_asset_90d_trend_annualized_yen Annualized linear asset trend based on the latest 90 days.",
          "# TYPE moneyforward_asset_90d_trend_annualized_yen gauge",
          sample(
            "moneyforward_asset_90d_trend_annualized_yen",
            assetTrend.projectedOneYearChangeYen,
          ),
          "# HELP moneyforward_asset_90d_projection_one_year_yen One-year asset projection from the latest 90-day linear trend.",
          "# TYPE moneyforward_asset_90d_projection_one_year_yen gauge",
          sample("moneyforward_asset_90d_projection_one_year_yen", assetTrend.projectedOneYearYen),
        );
      }
      lines.push(
        "# HELP moneyforward_asset_category_yen Latest asset value by category in Japanese yen.",
        "# TYPE moneyforward_asset_category_yen gauge",
      );
      for (const [category, value] of Object.entries(snapshot.assetHistory[0]?.categories ?? {})) {
        lines.push(sample("moneyforward_asset_category_yen", value, labels({ category })));
      }
      lines.push(
        "# HELP moneyforward_portfolio_balance_yen Current holding value in Japanese yen.",
        "# TYPE moneyforward_portfolio_balance_yen gauge",
        "# HELP moneyforward_portfolio_daily_change_yen Daily holding change in Japanese yen.",
        "# TYPE moneyforward_portfolio_daily_change_yen gauge",
        "# HELP moneyforward_portfolio_unrealized_gain_yen Unrealized holding gain in Japanese yen.",
        "# TYPE moneyforward_portfolio_unrealized_gain_yen gauge",
        "# HELP moneyforward_portfolio_unrealized_gain_percent Unrealized holding gain in percent.",
        "# TYPE moneyforward_portfolio_unrealized_gain_percent gauge",
      );
      for (const [position, item] of snapshot.portfolio.entries()) {
        const itemLabels = labels({
          institution: item.institution,
          name: item.name,
          position: String(position),
          type: item.type,
        });
        lines.push(sample("moneyforward_portfolio_balance_yen", item.balanceYen, itemLabels));
        if (item.dailyChangeYen !== undefined) {
          lines.push(
            sample("moneyforward_portfolio_daily_change_yen", item.dailyChangeYen, itemLabels),
          );
        }
        if (item.unrealizedGainYen !== undefined) {
          lines.push(
            sample(
              "moneyforward_portfolio_unrealized_gain_yen",
              item.unrealizedGainYen,
              itemLabels,
            ),
          );
        }
        if (item.unrealizedGainPercent !== undefined) {
          lines.push(
            sample(
              "moneyforward_portfolio_unrealized_gain_percent",
              item.unrealizedGainPercent,
              itemLabels,
            ),
          );
        }
      }
      lines.push(
        "# HELP moneyforward_monthly_expense_yen Monthly expense in Japanese yen.",
        "# TYPE moneyforward_monthly_expense_yen gauge",
      );
      for (const summary of snapshot.monthlySummaries) {
        lines.push(
          sample("moneyforward_monthly_expense_yen", summary.expenseYen, monthLabel(summary.month)),
        );
      }
      lines.push(
        "# HELP moneyforward_monthly_expense_category_yen Monthly expense by category in Japanese yen.",
        "# TYPE moneyforward_monthly_expense_category_yen gauge",
        "# HELP moneyforward_monthly_investment_transfer_yen Monthly transfers to investment accounts in Japanese yen.",
        "# TYPE moneyforward_monthly_investment_transfer_yen gauge",
        "# HELP moneyforward_monthly_investment_transfer_total_yen Total monthly transfers to investment accounts in Japanese yen.",
        "# TYPE moneyforward_monthly_investment_transfer_total_yen gauge",
        "# HELP moneyforward_monthly_cash_savings_yen Monthly income remaining after expenses and investment transfers.",
        "# TYPE moneyforward_monthly_cash_savings_yen gauge",
        "# HELP moneyforward_monthly_flow_yen Monthly income, expenses, investment transfers, and cash savings for trend charts.",
        "# TYPE moneyforward_monthly_flow_yen gauge",
        "# HELP moneyforward_monthly_cashflow_link_yen Monthly cash-flow link value for Sankey diagrams.",
        "# TYPE moneyforward_monthly_cashflow_link_yen gauge",
      );
      const expenseCategories = new Set(
        snapshot.monthlySummaries.flatMap((summary) => Object.keys(summary.expenseCategories)),
      );
      const investmentAccounts = new Set(
        snapshot.monthlySummaries.flatMap((summary) => Object.keys(summary.investmentTransfers)),
      );
      for (const summary of snapshot.monthlySummaries) {
        const { destinations, flowOutflow } = cashFlowDestinations(
          summary.incomeYen,
          summary.expenseYen,
          summary.expenseCategories,
          summary.investmentTransfers,
        );
        for (const category of expenseCategories) {
          lines.push(
            sample(
              "moneyforward_monthly_expense_category_yen",
              summary.expenseCategories[category] ?? 0,
              labels({ category, month: summary.month }),
            ),
          );
        }
        const investmentTotal = Object.values(summary.investmentTransfers).reduce(
          (sum, amount) => sum + amount,
          0,
        );
        for (const account of investmentAccounts) {
          lines.push(
            sample(
              "moneyforward_monthly_investment_transfer_yen",
              summary.investmentTransfers[account] ?? 0,
              labels({ account, month: summary.month }),
            ),
          );
        }
        lines.push(
          sample(
            "moneyforward_monthly_investment_transfer_total_yen",
            investmentTotal,
            monthLabel(summary.month),
          ),
          sample(
            "moneyforward_monthly_cash_savings_yen",
            summary.incomeYen - summary.expenseYen - investmentTotal,
            monthLabel(summary.month),
          ),
          sample(
            "moneyforward_monthly_flow_yen",
            summary.incomeYen,
            labels({ kind: "収入", month: summary.month }),
          ),
          sample(
            "moneyforward_monthly_flow_yen",
            summary.expenseYen,
            labels({ kind: "生活支出", month: summary.month }),
          ),
          sample(
            "moneyforward_monthly_flow_yen",
            investmentTotal,
            labels({ kind: "投資振替", month: summary.month }),
          ),
          sample(
            "moneyforward_monthly_flow_yen",
            summary.incomeYen - summary.expenseYen - investmentTotal,
            labels({ kind: "現金余剰", month: summary.month }),
          ),
        );
        const sources = cashFlowSources(summary.incomeYen, summary.incomeSources, flowOutflow);
        const poolTotal = [...sources.values()].reduce((sum, amount) => sum + amount, 0);
        if (poolTotal > 0) {
          for (const [source, sourceAmount] of sources) {
            for (const [destination, destinationAmount] of destinations) {
              lines.push(
                sample(
                  "moneyforward_monthly_cashflow_link_yen",
                  (sourceAmount * destinationAmount) / poolTotal,
                  labels({ destination, month: summary.month, pool: "Pool", source }),
                ),
              );
            }
          }
        }
      }
      const currentMonth = snapshot.monthlySummaries[0];
      const previousMonth = snapshot.monthlySummaries[1];
      if (currentMonth !== undefined) {
        lines.push(
          "# HELP moneyforward_current_month_income_yen Income in the current partial month.",
          "# TYPE moneyforward_current_month_income_yen gauge",
          sample("moneyforward_current_month_income_yen", currentMonth.incomeYen),
          "# HELP moneyforward_current_month_expense_yen Expense in the current partial month.",
          "# TYPE moneyforward_current_month_expense_yen gauge",
          sample("moneyforward_current_month_expense_yen", currentMonth.expenseYen),
          "# HELP moneyforward_current_month_balance_yen Balance in the current partial month.",
          "# TYPE moneyforward_current_month_balance_yen gauge",
          sample(
            "moneyforward_current_month_balance_yen",
            currentMonth.incomeYen - currentMonth.expenseYen,
          ),
        );
      }
      if (previousMonth !== undefined) {
        lines.push(
          "# HELP moneyforward_previous_month_income_yen Income in the latest completed month.",
          "# TYPE moneyforward_previous_month_income_yen gauge",
          sample("moneyforward_previous_month_income_yen", previousMonth.incomeYen),
          "# HELP moneyforward_previous_month_expense_yen Expense in the latest completed month.",
          "# TYPE moneyforward_previous_month_expense_yen gauge",
          sample("moneyforward_previous_month_expense_yen", previousMonth.expenseYen),
          "# HELP moneyforward_previous_month_balance_yen Balance in the latest completed month.",
          "# TYPE moneyforward_previous_month_balance_yen gauge",
          sample(
            "moneyforward_previous_month_balance_yen",
            previousMonth.incomeYen - previousMonth.expenseYen,
          ),
        );
      }
    }

    lines.push("# EOF");
    return `${lines.join("\n")}\n`;
  }
}
