export interface UserProfile {
  uid: string;
  displayName?: string;
  email: string;
}

export interface Holding {
  ticker: string;
  shares: number;
  averagePrice: number;
}

export interface Transaction {
  id?: string;
  ticker: string;
  type: 'buy' | 'sell' | 'deposit' | 'withdrawal';
  shares: number;
  price: number;
  timestamp: string;
}

export interface StockData {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  sector: string;
  history: { date: string; price: number }[];
}

export type TransactionType = Transaction['type'];
export type SortConfig = { key: string; direction: 'asc' | 'desc' };
export type PriceHistory = Record<string, { date: string; close: number }[]>;

export interface StoredMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  agent?: string;
  structured?: { type: string; [key: string]: unknown };
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface StoredReport {
  data: Record<string, unknown>;
  generatedAt: Date;
}

export interface FinancialPeriod {
  label: string;  // e.g. "FY2024" or "Q3 2024"
  value: number;  // raw dollars
}

export interface StockDetail {
  // Identity
  ticker: string;
  companyName: string;
  exchange: string;          // human-readable, e.g. "NASDAQ"
  tvSymbol: string;          // TradingView format, e.g. "NASDAQ:AAPL"
  sector: string;
  industry: string;
  country: string;
  website: string;
  fullTimeEmployees: number;
  longBusinessSummary: string;

  // Price
  price: number;
  change: number;
  changePercent: number;

  // Trading snapshot
  marketCap: number | null;
  volume: number | null;
  averageVolume: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyDayAverage: number | null;
  twoHundredDayAverage: number | null;
  beta: number | null;
  sharesOutstanding: number | null;
  floatShares: number | null;
  shortRatio: number | null;
  shortPercentOfFloat: number | null;

  // Fundamentals
  trailingPE: number | null;
  forwardPE: number | null;
  trailingEps: number | null;
  pegRatio: number | null;
  priceToSalesTrailing12Months: number | null;
  priceToBook: number | null;
  dividendYield: number | null;
  totalRevenue: number | null;
  revenueGrowth: number | null;
  ebitda: number | null;
  profitMargins: number | null;
  operatingMargins: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  freeCashflow: number | null;
  totalDebt: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;

  // Financial history (for bar chart)
  // Annual — Income Statement
  annualRevenue: FinancialPeriod[];
  annualGrossProfit: FinancialPeriod[];
  annualNetIncome: FinancialPeriod[];
  // Annual — Balance Sheet
  annualTotalAssets: FinancialPeriod[];
  annualTotalLiabilities: FinancialPeriod[];
  annualNetCash: FinancialPeriod[];
  // Annual — Cash Flow
  annualOperatingCashFlow: FinancialPeriod[];
  annualInvestingCashFlow: FinancialPeriod[];
  annualFinancingCashFlow: FinancialPeriod[];
  annualFreeCashFlow: FinancialPeriod[];
  // Quarterly — Income Statement
  quarterlyRevenue: FinancialPeriod[];
  quarterlyGrossProfit: FinancialPeriod[];
  quarterlyNetIncome: FinancialPeriod[];
  // Quarterly — Balance Sheet
  quarterlyTotalAssets: FinancialPeriod[];
  quarterlyTotalLiabilities: FinancialPeriod[];
  quarterlyNetCash: FinancialPeriod[];
  // Quarterly — Cash Flow
  quarterlyOperatingCashFlow: FinancialPeriod[];
  quarterlyInvestingCashFlow: FinancialPeriod[];
  quarterlyFinancingCashFlow: FinancialPeriod[];
  quarterlyFreeCashFlow: FinancialPeriod[];
}

export interface ScreenerQuote {
  symbol: string;
  shortName: string;
  regularMarketPrice: number | null;
  regularMarketChangePercent: number | null;
  marketCap: number | null;
  regularMarketVolume: number | null;
  averageDailyVolume3Month: number | null;
  trailingPE: number | null;
  fiftyTwoWeekChangePercent: number | null;
}

export type InsightsDirection = 'Bearish' | 'Bullish' | 'Neutral';

export interface InsightsOutlook {
  stateDescription: string;
  direction: InsightsDirection;
  score: number;
  scoreDescription: string;
  sectorDirection?: InsightsDirection;
  sectorScore?: number;
  sectorScoreDescription?: string;
  indexDirection: InsightsDirection;
  indexScore: number;
  indexScoreDescription: string;
}

export interface StockInsights {
  recommendation: {
    rating: 'BUY' | 'SELL' | 'HOLD';
    targetPrice: number | null;
    provider: string;
  } | null;
  valuation: {
    description: string | null;
    discount: string | null;
    relativeValue: string | null;
    provider: string;
  } | null;
  technicalEvents: {
    shortTermOutlook: InsightsOutlook;
    intermediateTermOutlook: InsightsOutlook;
    longTermOutlook: InsightsOutlook;
  } | null;
  keyTechnicals: {
    support: number | null;
    resistance: number | null;
    stopLoss: number | null;
    provider: string;
  } | null;
  upsell: {
    bullishSummary: string[] | null;
    bearishSummary: string[] | null;
    companyName: string | null;
  } | null;
}
