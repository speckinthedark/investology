export type Persona = 'buffett' | 'lynch';

export interface UserProfile {
  uid: string;
  displayName?: string;
  email: string;
  selectedPersona?: Persona;
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
