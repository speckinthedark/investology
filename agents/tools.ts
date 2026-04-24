import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Fundamentals {
  ticker: string;
  sector: string;
  industry: string;
  description: string;
  marketCap: number;
  enterpriseValue: number;
  trailingPE: number;
  forwardPE: number;
  pegRatio: number;
  priceToSales: number;
  priceToBook: number;
  revenueGrowth: number;
  earningsGrowth: number;
  currentOperatingMargin: number;
  targetableOperatingMargin: number; // gross margin as proxy for long-run potential
  grossMargin: number;
  freeCashFlow: number;
  totalRevenue: number;
  totalDebt: number;
  debtToEquity: number;
  sharesOutstanding: number;
  beta: number;
  analystTargetPrice: number;
  analystRating: string;
  trailingEPS: number;
  forwardEPS: number;
}

export interface DCFAssumptions {
  currentRevenue: number;
  currentOperatingMargin: number;
  revenueGrowthRates: { bull: number; base: number; bear: number };
  targetOperatingMargin: number;
  wacc: number;
  terminalGrowthRate: number;
  projectionYears: number;
  sharesOutstanding: number;
  netDebt: number;
  currentPrice: number;
}

export interface DCFScenario {
  scenario: 'bull' | 'base' | 'bear';
  impliedSharePrice: number;
  upsideDownsidePct: number;
  impliedEV: number;
  terminalValuePV: number;
}

export interface DCFResult {
  ticker: string;
  currentPrice: number;
  scenarios: DCFScenario[];
  assumptions: {
    wacc: number;
    terminalGrowthRate: number;
    projectionYears: number;
  };
}

// ─── In-memory fundamentals cache ─────────────────────────────────────────────

const fundamentalsCache = new Map<string, { data: Fundamentals; fetchedAt: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;

// ─── get_fundamentals ─────────────────────────────────────────────────────────

export async function getFundamentals(ticker: string): Promise<Fundamentals> {
  ticker = ticker.toUpperCase().trim();
  const cached = fundamentalsCache.get(ticker);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    console.log(`[fundamentals cache hit] ${ticker}`);
    return cached.data;
  }

  console.log(`[fundamentals fetch] ${ticker}`);
  let result;
  try {
    result = await yahooFinance.quoteSummary(ticker, {
      modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail', 'assetProfile'],
    });
  } catch (err) {
    throw new Error(`Failed to fetch fundamentals for ${ticker}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const data: Fundamentals = {
    ticker,
    sector: (result.assetProfile as any)?.sector ?? 'Unknown',
    industry: (result.assetProfile as any)?.industry ?? 'Unknown',
    description: (result.assetProfile as any)?.longBusinessSummary ?? '',
    marketCap: (result.summaryDetail as any)?.marketCap ?? 0,
    enterpriseValue: (result.defaultKeyStatistics as any)?.enterpriseValue ?? 0,
    trailingPE: (result.summaryDetail as any)?.trailingPE ?? 0,
    forwardPE: (result.defaultKeyStatistics as any)?.forwardPE ?? 0,
    pegRatio: (result.defaultKeyStatistics as any)?.pegRatio ?? 0,
    priceToSales: (result.summaryDetail as any)?.priceToSalesTrailing12Months ?? 0,
    priceToBook: (result.defaultKeyStatistics as any)?.priceToBook ?? 0,
    revenueGrowth: (result.financialData as any)?.revenueGrowth ?? 0,
    earningsGrowth: (result.financialData as any)?.earningsGrowth ?? 0,
    currentOperatingMargin: (result.financialData as any)?.operatingMargins ?? 0,
    targetableOperatingMargin: (result.financialData as any)?.grossMargins ?? 0,
    grossMargin: (result.financialData as any)?.grossMargins ?? 0,
    freeCashFlow: (result.financialData as any)?.freeCashflow ?? 0,
    totalRevenue: (result.financialData as any)?.totalRevenue ?? 0,
    totalDebt: (result.financialData as any)?.totalDebt ?? 0,
    debtToEquity: (result.financialData as any)?.debtToEquity ?? 0,
    sharesOutstanding: (result.defaultKeyStatistics as any)?.sharesOutstanding ?? 0,
    beta: (result.summaryDetail as any)?.beta ?? 1,
    analystTargetPrice: (result.financialData as any)?.targetMeanPrice ?? 0,
    analystRating: (result.financialData as any)?.recommendationKey ?? 'none',
    trailingEPS: (result.defaultKeyStatistics as any)?.trailingEps ?? 0,
    forwardEPS: (result.defaultKeyStatistics as any)?.forwardEps ?? 0,
  };

  fundamentalsCache.set(ticker, { data, fetchedAt: Date.now() });
  return data;
}

// ─── get_stock_quote (wraps existing Finnhub logic) ───────────────────────────

export async function getStockQuote(ticker: string, apiKey: string): Promise<{
  ticker: string; price: number; change: number; changePercent: number; sector: string;
}> {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`);
  if (!res.ok) {
    throw new Error(`Finnhub API error ${res.status} for ${ticker}`);
  }
  const quote = await res.json();
  return {
    ticker,
    price: quote.c ?? 0,
    change: quote.d ?? 0,
    changePercent: quote.dp ?? 0,
    sector: 'Unknown',
  };
}

// ─── get_price_history (wraps existing Yahoo Finance monthly logic) ────────────

export async function getPriceHistory(ticker: string, from: string): Promise<{ date: string; close: number }[]> {
  try {
    const quotes = await yahooFinance.historical(ticker, {
      period1: from,
      period2: new Date().toISOString().split('T')[0],
      interval: '1mo',
    }) as { date: Date; close: number | null }[];
    return quotes
      .filter((q) => q.close != null)
      .map((q) => {
        const d = q.date;
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return { date: dateStr, close: q.close ?? 0 };
      });
  } catch (err) {
    throw new Error(`Failed to fetch price history for ${ticker}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── calculate_dcf ────────────────────────────────────────────────────────────

function runDcfScenario(
  assumptions: DCFAssumptions,
  growthRate: number,
  scenario: 'bull' | 'base' | 'bear',
): DCFScenario {
  const { currentRevenue, currentOperatingMargin, targetOperatingMargin, wacc, terminalGrowthRate, projectionYears, sharesOutstanding, netDebt, currentPrice } = assumptions;

  let revenue = currentRevenue;
  let totalPV = 0;

  for (let year = 1; year <= projectionYears; year++) {
    revenue *= 1 + growthRate;
    // Ramp margin from current to target linearly over projection period
    const marginProgress = year / projectionYears;
    const margin = currentOperatingMargin + (targetOperatingMargin - currentOperatingMargin) * marginProgress;
    const fcf = revenue * margin;
    totalPV += fcf / Math.pow(1 + wacc, year);
  }

  const finalRevenue = currentRevenue * Math.pow(1 + growthRate, projectionYears);
  const finalFCF = finalRevenue * targetOperatingMargin;
  if (wacc <= terminalGrowthRate) {
    throw new Error(
      `Invalid DCF inputs: wacc (${wacc}) must be greater than terminalGrowthRate (${terminalGrowthRate})`
    );
  }
  const terminalValue = (finalFCF * (1 + terminalGrowthRate)) / (wacc - terminalGrowthRate);
  const terminalPV = terminalValue / Math.pow(1 + wacc, projectionYears);

  const impliedEV = totalPV + terminalPV;
  const equityValue = impliedEV - netDebt;
  if (sharesOutstanding <= 0) {
    throw new Error(`Invalid DCF inputs: sharesOutstanding must be positive, got ${sharesOutstanding}`);
  }
  const impliedSharePrice = Math.max(0, equityValue / sharesOutstanding);
  const upsideDownsidePct = currentPrice > 0 ? ((impliedSharePrice - currentPrice) / currentPrice) * 100 : 0;

  return { scenario, impliedSharePrice, upsideDownsidePct, impliedEV, terminalValuePV: terminalPV };
}

export function calculateDcf(ticker: string, assumptions: DCFAssumptions): DCFResult {
  return {
    ticker,
    currentPrice: assumptions.currentPrice,
    scenarios: [
      runDcfScenario(assumptions, assumptions.revenueGrowthRates.bull, 'bull'),
      runDcfScenario(assumptions, assumptions.revenueGrowthRates.base, 'base'),
      runDcfScenario(assumptions, assumptions.revenueGrowthRates.bear, 'bear'),
    ],
    assumptions: {
      wacc: assumptions.wacc,
      terminalGrowthRate: assumptions.terminalGrowthRate,
      projectionYears: assumptions.projectionYears,
    },
  };
}
