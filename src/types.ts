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
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  beta: number | null;

  // Fundamentals
  trailingPE: number | null;
  forwardPE: number | null;
  trailingEps: number | null;
  dividendYield: number | null;
  profitMargins: number | null;
  operatingMargins: number | null;
  returnOnEquity: number | null;
  freeCashflow: number | null;

  // Financial history (for bar chart)
  annualRevenue: FinancialPeriod[];
  annualNetIncome: FinancialPeriod[];
  annualFreeCashFlow: FinancialPeriod[];
  quarterlyRevenue: FinancialPeriod[];
  quarterlyNetIncome: FinancialPeriod[];
  quarterlyFreeCashFlow: FinancialPeriod[];
}
