import { StockData, PriceHistory } from '../types';

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
