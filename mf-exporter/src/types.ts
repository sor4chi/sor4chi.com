export interface MonthlySummary {
  month: string;
  incomeYen: number;
  incomeSources: Record<string, number>;
  expenseYen: number;
  expenseCategories: Record<string, number>;
  investmentTransfers: Record<string, number>;
}

export interface AssetHistoryPoint {
  date: string;
  totalAssetsYen: number;
  categories: Record<string, number>;
}

export interface PortfolioItem {
  name: string;
  type: string;
  institution: string;
  balanceYen: number;
  dailyChangeYen?: number;
  unrealizedGainYen?: number;
  unrealizedGainPercent?: number;
}

export interface MoneyForwardSnapshot {
  collectedAt: Date;
  totalAssetsYen: number;
  totalLiabilitiesYen: number;
  monthlySummaries: MonthlySummary[];
  assetHistory: AssetHistoryPoint[];
  portfolio: PortfolioItem[];
}
