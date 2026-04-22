export type Persona = 'buffett' | 'lynch';

export interface UserProfile {
  uid: string;
  displayName?: string;
  email: string;
  currency?: string;
  selectedPersona?: Persona;
  cashBalance?: number;
}

export interface Holding {
  ticker: string;
  shares: number;
  averagePrice: number;
  lastPrice?: number;
  lastUpdated?: string;
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
