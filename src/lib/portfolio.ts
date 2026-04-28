import { Transaction, PriceHistory } from '../types';

function getHistoricalPrice(
  entries: { dateMs: number; close: number }[],
  targetMs: number,
): number | null {
  let price: number | null = null;
  for (const e of entries) {
    if (e.dateMs <= targetMs) price = e.close;
    else break;
  }
  return price;
}

/**
 * Stock-only time-weighted YTD return.
 *
 * Treats buy costs as capital inflows into the stock portfolio and sell
 * proceeds as outflows. Cash is excluded entirely. Returns percentage (e.g.
 * 12.5 = +12.5%) or null if there is insufficient price history to compute.
 */
export function computeYTDTWR(
  transactions: Transaction[],
  priceHistory: PriceHistory,
  stockPrices: Record<string, { price: number }>,
): number | null {
  const now = new Date();
  const year = now.getFullYear();
  const ytdStartMs = new Date(year, 0, 1).getTime();

  // Pre-process history: sort ascending by date for binary-search-style lookup
  const sortedHistory: Record<string, { dateMs: number; close: number }[]> = {};
  for (const [ticker, entries] of Object.entries(priceHistory)) {
    sortedHistory[ticker] = entries
      .map(e => ({ dateMs: new Date(e.date).getTime(), close: e.close }))
      .sort((a, b) => a.dateMs - b.dateMs);
  }

  // Only buy/sell transactions, sorted chronologically
  const stockTx = [...transactions]
    .filter(tx => tx.type === 'buy' || tx.type === 'sell')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Holdings at a point in time (transactions strictly before targetMs)
  const holdingsAt = (targetMs: number): Record<string, number> => {
    const h: Record<string, number> = {};
    for (const tx of stockTx) {
      if (new Date(tx.timestamp).getTime() >= targetMs) break;
      h[tx.ticker] = (h[tx.ticker] ?? 0) + (tx.type === 'buy' ? tx.shares : -tx.shares);
    }
    return h;
  };

  // Stock portfolio market value at a point in time
  const portfolioValueAt = (targetMs: number, useCurrent: boolean): number => {
    const holdings = holdingsAt(targetMs);
    let total = 0;
    for (const [ticker, shares] of Object.entries(holdings)) {
      if (shares <= 0.0001) continue;
      const price = useCurrent
        ? (stockPrices[ticker]?.price ?? getHistoricalPrice(sortedHistory[ticker] ?? [], targetMs))
        : getHistoricalPrice(sortedHistory[ticker] ?? [], targetMs);
      if (price == null) continue;
      total += shares * price;
    }
    return total;
  };

  // Monthly checkpoints: [Jan 1, Feb 1, ..., first-of-current-month, today]
  const checkpoints: { ms: number; useCurrent: boolean }[] = [
    { ms: ytdStartMs, useCurrent: false },
  ];
  for (let m = 1; m <= now.getMonth(); m++) {
    checkpoints.push({ ms: new Date(year, m, 1).getTime(), useCurrent: false });
  }
  checkpoints.push({ ms: now.getTime(), useCurrent: true });

  let twr = 1.0;
  let hasValidPeriod = false;

  for (let i = 0; i < checkpoints.length - 1; i++) {
    const { ms: startMs } = checkpoints[i];
    const { ms: endMs, useCurrent } = checkpoints[i + 1];

    const startValue = portfolioValueAt(startMs, false);
    const endValue   = portfolioValueAt(endMs, useCurrent);

    // Net capital deployed into stocks during this sub-period
    let netCF = 0;
    for (const tx of stockTx) {
      const txMs = new Date(tx.timestamp).getTime();
      if (txMs >= startMs && txMs < endMs) {
        const cost = tx.shares * tx.price;
        netCF += tx.type === 'buy' ? cost : -cost;
      }
    }

    const denominator = startValue + netCF;
    if (denominator <= 0) continue;

    twr *= endValue / denominator;
    hasValidPeriod = true;
  }

  return hasValidPeriod ? (twr - 1) * 100 : null;
}
