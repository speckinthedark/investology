import { StockData, PriceHistory, StockDetail, StockInsights, ScreenerQuote } from '../types';

export async function fetchStockData(ticker: string): Promise<StockData> {
  try {
    const res = await fetch(`/api/stock/${ticker}`);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data as StockData;
  } catch (e) {
    console.warn(`Finnhub failed for ${ticker}, using AI fallback:`, e);
    return fetchStockFromAI(ticker);
  }
}

async function fetchStockFromAI(ticker: string): Promise<StockData> {
  try {
    const res = await fetch(`/api/stock-ai/${ticker}`);
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch {
    return mockStockData(ticker);
  }
}

export async function fetchPriceHistory(tickers: string[], from: string): Promise<PriceHistory> {
  try {
    const res = await fetch('/api/price-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers, from }),
    });
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch (e) {
    console.warn('Price history fetch failed:', e);
    return {};
  }
}

function mockStockData(ticker: string): StockData {
  const base = 100 + Math.random() * 200;
  const sectors = ['Technology', 'Finance', 'Healthcare', 'Energy', 'Consumer Cyclical'];
  return {
    ticker,
    price: parseFloat(base.toFixed(2)),
    change: parseFloat(((Math.random() - 0.5) * 4).toFixed(2)),
    changePercent: parseFloat(((Math.random() - 0.5) * 3).toFixed(2)),
    sector: sectors[Math.floor(Math.random() * sectors.length)],
    history: Array.from({ length: 7 }, (_, i) => ({
      date: new Date(Date.now() - (6 - i) * 86400000).toISOString().split('T')[0],
      price: parseFloat((base + (Math.random() - 0.5) * 10).toFixed(2)),
    })),
  };
}

export async function fetchStockDetail(ticker: string): Promise<StockDetail> {
  const res = await fetch(`/api/stock/detail/${encodeURIComponent(ticker.toUpperCase())}`);
  if (res.status === 400) {
    const text = await res.text();
    let msg = 'Ticker not found';
    try { msg = (JSON.parse(text) as { error?: string }).error ?? msg; } catch {}
    throw new Error(msg);
  }
  if (!res.ok) throw new Error('Failed to fetch stock data');
  return res.json();
}

export async function fetchStockInsights(ticker: string): Promise<StockInsights> {
  const res = await fetch(`/api/stock/insights/${encodeURIComponent(ticker.toUpperCase())}`);
  if (!res.ok) throw new Error('Failed to fetch insights');
  return res.json();
}

export async function fetchFXRates(): Promise<{ INR: number | null; AUD: number | null }> {
  try {
    const res = await fetch('/api/market/fx-rates');
    if (!res.ok) return { INR: null, AUD: null };
    return res.json();
  } catch {
    return { INR: null, AUD: null };
  }
}

export async function fetchSP500YTD(): Promise<number | null> {
  try {
    const res = await fetch('/api/market/sp500-ytd');
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.ytdPct === 'number' ? data.ytdPct : null;
  } catch {
    return null;
  }
}

export async function fetchScreener(screenerId: string): Promise<ScreenerQuote[]> {
  const res = await fetch(`/api/screener/${encodeURIComponent(screenerId)}`);
  if (!res.ok) throw new Error('Failed to fetch screener');
  const data = await res.json();
  return data.quotes ?? [];
}
