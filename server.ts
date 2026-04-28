import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import YahooFinance from 'yahoo-finance2';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { XMLParser } from 'fast-xml-parser';
const yahooFinance = new YahooFinance();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

dotenv.config();

import { runPortfolioReport, runChat, createChatSession } from './agents/index.js';
import type { Holding } from './src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const EXCHANGE_MAP: Record<string, string> = {
  NMS: 'NASDAQ', NasdaqGS: 'NASDAQ', NasdaqGM: 'NASDAQ', NCM: 'NASDAQ',
  NYQ: 'NYSE', NYSE: 'NYSE',
  PCX: 'AMEX', ASE: 'AMEX',
};

function shapeOutlook(o: any): {
  stateDescription: string; direction: string; score: number; scoreDescription: string;
  sectorDirection: string | null; sectorScore: number | null; sectorScoreDescription: string | null;
  indexDirection: string; indexScore: number; indexScoreDescription: string;
} {
  return {
    stateDescription: o.stateDescription,
    direction: o.direction,
    score: o.score,
    scoreDescription: o.scoreDescription,
    sectorDirection: o.sectorDirection ?? null,
    sectorScore: o.sectorScore ?? null,
    sectorScoreDescription: o.sectorScoreDescription ?? null,
    indexDirection: o.indexDirection,
    indexScore: o.indexScore,
    indexScoreDescription: o.indexScoreDescription,
  };
}

function buildFTSPeriods(
  data: any[],
  field: string,
  mode: 'annual' | 'quarterly',
): { label: string; value: number }[] {
  return [...data]
    .filter((e: any) => e[field] != null)
    .sort((a: any, b: any) => {
      const toMs = (d: any) => d instanceof Date ? d.getTime() : (d as number) * 1000;
      return toMs(a.date) - toMs(b.date);
    })
    .map((entry: any) => {
      const ts = entry.date instanceof Date ? entry.date.getTime() : (entry.date as number) * 1000;
      const date = new Date(ts);
      const year = date.getFullYear();
      const quarter = Math.ceil((date.getMonth() + 1) / 3);
      const label = mode === 'annual' ? `FY${year}` : `Q${quarter} ${year}`;
      return { label, value: entry[field] as number };
    });
}

function buildNetCashPeriods(
  data: any[],
  mode: 'annual' | 'quarterly',
): { label: string; value: number }[] {
  return [...data]
    .filter((e: any) => e.cashAndCashEquivalents != null)
    .sort((a: any, b: any) => {
      const toMs = (d: any) => d instanceof Date ? d.getTime() : (d as number) * 1000;
      return toMs(a.date) - toMs(b.date);
    })
    .map((entry: any) => {
      const ts = entry.date instanceof Date ? entry.date.getTime() : (entry.date as number) * 1000;
      const date = new Date(ts);
      const year = date.getFullYear();
      const quarter = Math.ceil((date.getMonth() + 1) / 3);
      const label = mode === 'annual' ? `FY${year}` : `Q${quarter} ${year}`;
      const cash = entry.cashAndCashEquivalents as number;
      const debt = typeof entry.totalDebt === 'number' ? entry.totalDebt : 0;
      return { label, value: cash - debt };
    });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // --- Rich stock detail for Research tab ---
  app.get('/api/stock/detail/:ticker', async (req, res) => {
    const ticker = (req.params.ticker as string).toUpperCase();
    try {
      const fifteenYearsAgo = new Date(Date.now() - 15 * 365 * 86400 * 1000).toISOString().split('T')[0];
      const fourYearsAgo    = new Date(Date.now() -  4 * 365 * 86400 * 1000).toISOString().split('T')[0];

      const [quote, summary, annualFTS, quarterlyFTS] = await Promise.all([
        yahooFinance.quote(ticker),
        yahooFinance.quoteSummary(ticker, {
          modules: ['assetProfile', 'summaryDetail', 'defaultKeyStatistics', 'financialData'] as any,
        }).catch(() => null),
        (yahooFinance as any).fundamentalsTimeSeries(ticker, {
          period1: fifteenYearsAgo, type: 'annual', module: 'all',
        }).catch(() => []),
        (yahooFinance as any).fundamentalsTimeSeries(ticker, {
          period1: fourYearsAgo, type: 'quarterly', module: 'all',
        }).catch(() => []),
      ]);

      const price = (quote as any).regularMarketPrice ?? null;
      if (price == null) return res.status(400).json({ error: `Ticker not found: ${ticker}` });

      const profile  = (summary as any)?.assetProfile ?? {};
      const detail   = (summary as any)?.summaryDetail ?? {};
      const keyStats = (summary as any)?.defaultKeyStatistics ?? {};
      const finData  = (summary as any)?.financialData ?? {};

      const rawExchange = (quote as any).exchange ?? '';
      const exchange = EXCHANGE_MAP[rawExchange] ?? (quote as any).fullExchangeName ?? rawExchange;
      const tvSymbol = exchange ? `${exchange}:${ticker}` : ticker;

      res.json({
        ticker,
        companyName: (quote as any).longName ?? (quote as any).shortName ?? ticker,
        exchange,
        tvSymbol,
        sector:              profile.sector ?? '',
        industry:            profile.industry ?? '',
        country:             profile.country ?? '',
        website:             profile.website ?? '',
        fullTimeEmployees:   profile.fullTimeEmployees ?? 0,
        longBusinessSummary: profile.longBusinessSummary ?? '',

        price,
        change:        (quote as any).regularMarketChange ?? 0,
        changePercent: (quote as any).regularMarketChangePercent ?? 0,

        marketCap:        (quote as any).marketCap ?? detail.marketCap ?? null,
        volume:           (quote as any).regularMarketVolume ?? null,
        averageVolume:    detail.averageVolume ?? null,
        dayLow:           detail.dayLow ?? null,
        dayHigh:          detail.dayHigh ?? null,
        fiftyTwoWeekHigh: detail.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow:  detail.fiftyTwoWeekLow ?? null,
        fiftyDayAverage:  detail.fiftyDayAverage ?? null,
        twoHundredDayAverage: detail.twoHundredDayAverage ?? null,
        beta:             detail.beta ?? keyStats.beta ?? null,
        sharesOutstanding:   keyStats.sharesOutstanding ?? null,
        floatShares:         keyStats.floatShares ?? null,
        shortRatio:          keyStats.shortRatio ?? null,
        shortPercentOfFloat: keyStats.shortPercentOfFloat ?? null,

        trailingPE:    detail.trailingPE ?? null,
        forwardPE:     detail.forwardPE ?? null,
        trailingEps:   keyStats.trailingEps ?? null,
        pegRatio:      keyStats.pegRatio ?? null,
        priceToSalesTrailing12Months: detail.priceToSalesTrailing12Months ?? null,
        priceToBook:   keyStats.priceToBook ?? null,
        dividendYield: detail.dividendYield ?? null,
        totalRevenue:  finData.totalRevenue ?? null,
        revenueGrowth: finData.revenueGrowth ?? null,
        ebitda:        finData.ebitda ?? null,
        profitMargins:    finData.profitMargins ?? null,
        operatingMargins: finData.operatingMargins ?? null,
        returnOnEquity:   finData.returnOnEquity ?? null,
        returnOnAssets:   finData.returnOnAssets ?? null,
        freeCashflow:     finData.freeCashflow ?? null,
        totalDebt:        finData.totalDebt ?? null,
        debtToEquity:     finData.debtToEquity ?? null,
        currentRatio:     finData.currentRatio ?? null,
        quickRatio:       finData.quickRatio ?? null,

        // Annual — Income
        annualRevenue:            buildFTSPeriods(annualFTS, 'totalRevenue', 'annual'),
        annualGrossProfit:        buildFTSPeriods(annualFTS, 'grossProfit',  'annual'),
        annualNetIncome:          buildFTSPeriods(annualFTS, 'netIncome',    'annual'),
        // Annual — Balance Sheet
        annualTotalAssets:        buildFTSPeriods(annualFTS, 'totalAssets',                         'annual'),
        annualTotalLiabilities:   buildFTSPeriods(annualFTS, 'totalLiabilitiesNetMinorityInterest', 'annual'),
        annualNetCash:            buildNetCashPeriods(annualFTS, 'annual'),
        // Annual — Cash Flow
        annualOperatingCashFlow:  buildFTSPeriods(annualFTS, 'operatingCashFlow',  'annual'),
        annualInvestingCashFlow:  buildFTSPeriods(annualFTS, 'investingCashFlow',  'annual'),
        annualFinancingCashFlow:  buildFTSPeriods(annualFTS, 'financingCashFlow',  'annual'),
        annualFreeCashFlow:       buildFTSPeriods(annualFTS, 'freeCashFlow',       'annual'),
        // Quarterly — Income
        quarterlyRevenue:           buildFTSPeriods(quarterlyFTS, 'totalRevenue', 'quarterly'),
        quarterlyGrossProfit:       buildFTSPeriods(quarterlyFTS, 'grossProfit',  'quarterly'),
        quarterlyNetIncome:         buildFTSPeriods(quarterlyFTS, 'netIncome',    'quarterly'),
        // Quarterly — Balance Sheet
        quarterlyTotalAssets:       buildFTSPeriods(quarterlyFTS, 'totalAssets',                         'quarterly'),
        quarterlyTotalLiabilities:  buildFTSPeriods(quarterlyFTS, 'totalLiabilitiesNetMinorityInterest', 'quarterly'),
        quarterlyNetCash:           buildNetCashPeriods(quarterlyFTS, 'quarterly'),
        // Quarterly — Cash Flow
        quarterlyOperatingCashFlow: buildFTSPeriods(quarterlyFTS, 'operatingCashFlow',  'quarterly'),
        quarterlyInvestingCashFlow: buildFTSPeriods(quarterlyFTS, 'investingCashFlow',  'quarterly'),
        quarterlyFinancingCashFlow: buildFTSPeriods(quarterlyFTS, 'financingCashFlow',  'quarterly'),
        quarterlyFreeCashFlow:      buildFTSPeriods(quarterlyFTS, 'freeCashFlow',       'quarterly'),
      });
    } catch (e) {
      console.error('Stock detail error:', e);
      res.status(500).json({ error: 'Failed to fetch stock data' });
    }
  });

  // --- Yahoo Finance Insights for Research tab ---
  app.get('/api/stock/insights/:ticker', async (req, res) => {
    const ticker = (req.params.ticker as string).toUpperCase();
    try {
      const raw = await yahooFinance.insights(ticker, { reportsCount: 0 });

      res.json({
        recommendation: raw.recommendation
          ? {
              rating: raw.recommendation.rating,
              targetPrice: raw.recommendation.targetPrice ?? null,
              provider: raw.recommendation.provider,
            }
          : null,
        valuation: raw.instrumentInfo?.valuation
          ? {
              description: raw.instrumentInfo.valuation.description ?? null,
              discount: raw.instrumentInfo.valuation.discount ?? null,
              relativeValue: raw.instrumentInfo.valuation.relativeValue ?? null,
              provider: raw.instrumentInfo.valuation.provider,
            }
          : null,
        technicalEvents: raw.instrumentInfo?.technicalEvents
          ? {
              shortTermOutlook: shapeOutlook(raw.instrumentInfo.technicalEvents.shortTermOutlook),
              intermediateTermOutlook: shapeOutlook(raw.instrumentInfo.technicalEvents.intermediateTermOutlook),
              longTermOutlook: shapeOutlook(raw.instrumentInfo.technicalEvents.longTermOutlook),
            }
          : null,
        keyTechnicals: raw.instrumentInfo?.keyTechnicals
          ? {
              support: raw.instrumentInfo.keyTechnicals.support ?? null,
              resistance: raw.instrumentInfo.keyTechnicals.resistance ?? null,
              stopLoss: raw.instrumentInfo.keyTechnicals.stopLoss ?? null,
              provider: raw.instrumentInfo.keyTechnicals.provider,
            }
          : null,
        upsell: raw.upsell
          ? {
              bullishSummary: raw.upsell.msBullishSummary ?? null,
              bearishSummary: raw.upsell.msBearishSummary ?? null,
              companyName: raw.upsell.companyName ?? null,
            }
          : null,
      });
    } catch (e) {
      console.error('Insights error:', e);
      res.status(500).json({ error: 'Failed to fetch insights' });
    }
  });

  // NOTE: This catch-all must remain BELOW all /api/stock/[specific]/:ticker routes
  // (e.g. /api/stock/detail/:ticker, /api/stock/insights/:ticker). Express matches
  // routes in registration order; moving this above them would silently swallow requests.
  // --- Stock quote + 7-day sparkline ---
  app.get('/api/stock/:ticker', async (req, res) => {
    const { ticker } = req.params;

    try {
      const from = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];

      const [quote, chartData, summary] = await Promise.all([
        yahooFinance.quote(ticker),
        // chart() uses the v8 API — more reliable than historical() for short windows
        (yahooFinance as any).chart(ticker, { period1: from, interval: '1d' }).catch(() => null),
        yahooFinance.quoteSummary(ticker, { modules: ['assetProfile'] }).catch(() => null),
      ]);

      const price = (quote as any).regularMarketPrice ?? 0;
      if (!price) throw new Error(`No price data for ${ticker}`);

      const quotes: any[] = chartData?.quotes ?? [];
      const history = quotes
        .filter((q: any) => q.close != null)
        .map((q: any) => ({
          date: new Date(q.date).toISOString().split('T')[0],
          price: parseFloat(q.close.toFixed(2)),
        }));

      res.json({
        ticker,
        price,
        change: (quote as any).regularMarketChange ?? 0,
        changePercent: (quote as any).regularMarketChangePercent ?? 0,
        sector: (summary as any)?.assetProfile?.sector ?? 'Other',
        history,
      });
    } catch (e) {
      console.error('Yahoo Finance quote error:', e);
      res.status(500).json({ error: 'Failed to fetch stock data' });
    }
  });

  // --- Yahoo Finance monthly price history ---
  app.post('/api/price-history', async (req, res) => {
    const { tickers, from } = req.body as { tickers: string[]; from: string };
    const stockTickers = (tickers ?? []).filter((t: string) => t !== 'CASH');
    if (stockTickers.length === 0) return res.json({});

    const results = await Promise.allSettled(
      stockTickers.map(async (ticker: string) => {
        const quotes = (await yahooFinance.historical(ticker, {
          period1: from,
          period2: new Date().toISOString().split('T')[0],
          interval: '1mo',
        })) as { date: Date; close: number | null }[];
        const history = quotes
          .filter((q) => q.close != null)
          .map((q) => {
            const d = q.date;
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return { date: dateStr, close: q.close ?? 0 };
          });
        return [ticker, history] as const;
      })
    );

    const data: Record<string, { date: string; close: number }[]> = {};
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const [ticker, history] = r.value;
        data[ticker] = history;
      } else {
        console.warn('Price history failed for a ticker:', r.reason?.message ?? r.reason);
      }
    }
    res.json(data);
  });

  // --- Gemini AI stock data fallback ---
  app.get('/api/stock-ai/:ticker', async (req, res) => {
    const { ticker } = req.params;

    if (!ai) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Provide realistic stock data for ${ticker} based on recent market trends.
Return ONLY a JSON object with these fields:
- ticker: string
- price: number (realistic current price)
- change: number (today's absolute change)
- changePercent: number (today's % change)
- sector: string (e.g. Technology, Healthcare, Finance, Energy, Consumer Cyclical)
- history: array of 7 objects { date: "YYYY-MM-DD", price: number } for the last 7 trading days`,
        config: { responseMimeType: 'application/json' },
      });

      const data = JSON.parse(response.text);
      res.json(data);
    } catch (e) {
      console.error('Gemini stock error:', e);
      res.status(500).json({ error: 'Gemini fallback failed' });
    }
  });

  // --- Gemini portfolio insights ---
  app.post('/api/insights', async (req, res) => {
    const { holdings, persona } = req.body;

    if (!ai) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    if (!holdings || holdings.length === 0) {
      return res.json({ insights: 'Add some stocks to get AI-powered insights.' });
    }

    const personaPrompts: Record<string, string> = {
      buffett:
        'You are a value investor inspired by Warren Buffett and Charlie Munger. Focus on competitive moats, long-term intrinsic value, and margin of safety.',
      lynch:
        "You are an investor inspired by Peter Lynch. Focus on 'invest in what you know', growth at a reasonable price (GARP), and spotting ten-baggers.",
    };

    const holdingsStr = holdings
      .map((h: any) => `${h.ticker}: ${h.shares} shares @ avg $${h.averagePrice.toFixed(2)}`)
      .join(', ');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `${personaPrompts[persona] || personaPrompts.buffett}

Analyze this portfolio: ${holdingsStr}.

Write 2-3 sentences of professional analysis covering diversification, strengths, and one specific observation about this portfolio from your investment philosophy. Be direct and insightful.`,
      });

      res.json({ insights: response.text });
    } catch (e) {
      console.error('Gemini insights error:', e);
      res.status(500).json({ error: 'Failed to generate insights' });
    }
  });

  // ─── Agent: create chat session ────────────────────────────────────────────
  app.post('/api/agent/session', async (req, res) => {
    const { uid } = req.body as { uid: string };
    if (!uid) return res.status(400).json({ error: 'uid required' });
    try {
      const sessionId = await createChatSession(uid);
      res.json({ sessionId });
    } catch (e) {
      console.error('Session creation error:', e);
      res.status(500).json({ error: 'Failed to create session' });
    }
  });

  // ─── Agent: portfolio risk report (SSE) ───────────────────────────────────
  app.post('/api/agent/report', async (req, res) => {
    const { uid, holdings, cashBalance } = req.body as {
      uid: string;
      holdings: Holding[];
      cashBalance: number;
    };

    if (!uid || !holdings) return res.status(400).json({ error: 'uid and holdings required' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      for await (const event of runPortfolioReport(uid, holdings, cashBalance)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (e) {
      console.error('Report agent error:', e);
      res.write(`data: ${JSON.stringify({ error: 'Report generation failed' })}\n\n`);
    } finally {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  });

  // ─── Agent: research chat (SSE) ───────────────────────────────────────────
  app.post('/api/agent/chat', async (req, res) => {
    const { uid, sessionId, message, holdings, cashBalance } = req.body as {
      uid: string;
      sessionId: string;
      message: string;
      holdings: Holding[];
      cashBalance: number;
    };

    if (!uid || !sessionId || !message) {
      return res.status(400).json({ error: 'uid, sessionId, and message required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const stream = async (sid: string) => {
      for await (const event of runChat(uid, sid, message, holdings, cashBalance)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    try {
      try {
        await stream(sessionId);
      } catch (e: any) {
        if (e?.message?.includes('Session not found')) {
          const newSessionId = await createChatSession(uid);
          res.write(`data: ${JSON.stringify({ newSessionId })}\n\n`);
          await stream(newSessionId);
        } else {
          throw e;
        }
      }
    } catch (e) {
      console.error('Chat agent error:', e);
      res.write(`data: ${JSON.stringify({ error: 'Agent failed to respond' })}\n\n`);
    } finally {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  });

  // --- S&P 500 YTD performance ---
  app.get('/api/market/sp500-ytd', async (req, res) => {
    try {
      const year = new Date().getFullYear();
      const period1 = `${year - 1}-12-26`; // late Dec to capture last trading day of prev year
      const chart = await (yahooFinance as any).chart('^GSPC', { period1, interval: '1d' });
      const quotes: { date: Date; close: number | null }[] = (chart.quotes ?? []).filter(
        (q: any) => q.close != null,
      );
      if (quotes.length === 0) return res.status(500).json({ error: 'No S&P 500 data' });

      const janFirst = new Date(year, 0, 1).getTime();
      const prevYearQuotes = quotes.filter((q) => new Date(q.date).getTime() < janFirst);
      if (prevYearQuotes.length === 0) return res.status(500).json({ error: 'No baseline data' });

      const baseline = prevYearQuotes[prevYearQuotes.length - 1].close as number;
      const current  = quotes[quotes.length - 1].close as number;
      res.json({ ytdPct: ((current - baseline) / baseline) * 100 });
    } catch (e) {
      console.error('S&P 500 YTD error:', e);
      res.status(500).json({ error: 'Failed to fetch S&P 500 data' });
    }
  });

  // --- Yahoo Finance screener ---
  app.get('/api/screener/:screenerId', async (req, res) => {
    const { screenerId } = req.params;
    try {
      const result = await (yahooFinance as any).screener({
        scrIds: screenerId,
        count: 10,
      });
      const quotes = (result.quotes ?? []).map((q: any) => ({
        symbol:                    q.symbol,
        shortName:                 q.shortName ?? q.symbol,
        regularMarketPrice:        q.regularMarketPrice ?? null,
        regularMarketChangePercent: q.regularMarketChangePercent ?? null,
        marketCap:                 q.marketCap ?? null,
        regularMarketVolume:       q.regularMarketVolume ?? null,
        averageDailyVolume3Month:  q.averageDailyVolume3Month ?? null,
        trailingPE:                q.trailingPE ?? null,
        fiftyTwoWeekChangePercent: q.fiftyTwoWeekChangePercent ?? null,
      }));
      res.json({ quotes });
    } catch (e) {
      console.error('Screener error:', e);
      res.status(500).json({ error: 'Failed to fetch screener data' });
    }
  });

  // --- eToro XLSX import ---
  app.post('/api/import/etoro', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });

      const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes('account activity'));
      if (!sheetName) return res.status(400).json({ error: 'Could not find "Account Activity" sheet' });

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null });

      type PreviewTx = {
        type: 'buy' | 'sell' | 'deposit' | 'withdrawal';
        ticker: string;
        shares: number;
        price: number;
        timestamp: string;
      };

      const transactions: PreviewTx[] = [];

      // For lot-specific avg cost: track open lots by Position ID
      const openLots = new Map<string, { ticker: string; units: number; amount: number }>();
      const closedPositionIds = new Set<string>();

      const parseDate = (dateRaw: unknown): string | null => {
        if (dateRaw instanceof Date) return dateRaw.toISOString();
        const s = String(dateRaw ?? '');
        const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (!m) return null;
        return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}`).toISOString();
      };

      for (const row of rows) {
        const rowType = String(row['Type'] ?? '').trim();
        const assetType = String(row['Asset type'] ?? '').trim();
        const positionId = String(row['Position ID'] ?? '').trim();
        const timestamp = parseDate(row['Date']);
        if (!timestamp) continue;

        const amountRaw = row['Amount'];
        const unitsRaw = row['Units / Contracts'];
        const details = String(row['Details'] ?? '').trim();

        const amount = typeof amountRaw === 'number' ? amountRaw : parseFloat(String(amountRaw ?? '').replace(/[^0-9.\-]/g, ''));
        const unitsNum = typeof unitsRaw === 'number' ? unitsRaw : parseFloat(String(unitsRaw ?? ''));
        const units = isNaN(unitsNum) || unitsNum <= 0 ? null : unitsNum;

        if (rowType === 'Open Position' && assetType === 'Stocks' && units) {
          const ticker = details.split('/')[0].trim().replace(/\.[A-Z]{2}$/, '');
          if (!ticker) continue;
          transactions.push({ type: 'buy', ticker, shares: units, price: amount / units, timestamp });
          if (positionId && positionId !== '-') openLots.set(positionId, { ticker, units, amount });

        } else if (rowType === 'Position closed' && assetType === 'Stocks' && units) {
          const ticker = details.split('/')[0].trim().replace(/\.[A-Z]{2}$/, '');
          if (!ticker) continue;
          transactions.push({ type: 'sell', ticker, shares: units, price: amount / units, timestamp });
          if (positionId && positionId !== '-') closedPositionIds.add(positionId);
        }
      }

      // Sort chronologically
      transactions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Compute holdings using lot-specific tracking (only open = unmatched lots)
      const holdingsMap: Record<string, { shares: number; totalCost: number }> = {};
      for (const [posId, lot] of openLots) {
        if (!closedPositionIds.has(posId)) {
          if (!holdingsMap[lot.ticker]) holdingsMap[lot.ticker] = { shares: 0, totalCost: 0 };
          holdingsMap[lot.ticker].shares += lot.units;
          holdingsMap[lot.ticker].totalCost += lot.amount;
        }
      }
      const holdings: Record<string, { shares: number; averagePrice: number }> = {};
      for (const [ticker, { shares, totalCost }] of Object.entries(holdingsMap)) {
        if (shares > 0.0001) holdings[ticker] = { shares, averagePrice: totalCost / shares };
      }

      res.json({ transactions, holdings, count: transactions.length });
    } catch (e: unknown) {
      console.error('eToro import error:', e);
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to parse file' });
    }
  });

  // --- IBKR Flex Query XML import ---
  app.post('/api/import/ibkr', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const xmlStr = req.file.buffer.toString('utf-8');
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
      const parsed = parser.parse(xmlStr);

      const flexStatements = parsed?.FlexQueryResponse?.FlexStatements?.FlexStatement;
      const statements = Array.isArray(flexStatements) ? flexStatements : flexStatements ? [flexStatements] : [];

      const parseIBKRDate = (dateTime: string): string => {
        const [datePart, timePart = '000000'] = dateTime.split(';');
        const y = datePart.slice(0, 4);
        const mo = datePart.slice(4, 6);
        const d = datePart.slice(6, 8);
        const hh = timePart.slice(0, 2);
        const mi = timePart.slice(2, 4);
        const ss = timePart.slice(4, 6);
        return new Date(`${y}-${mo}-${d}T${hh}:${mi}:${ss}Z`).toISOString();
      };

      type PreviewTx = {
        type: 'buy' | 'sell';
        ticker: string;
        shares: number;
        price: number;
        timestamp: string;
      };

      const transactions: PreviewTx[] = [];

      for (const statement of statements) {
        const tradesRaw = statement?.Trades?.Trade;
        const trades = tradesRaw ? (Array.isArray(tradesRaw) ? tradesRaw : [tradesRaw]) : [];

        for (const trade of trades) {
          // Skip non-stock trades (FX swaps, options, etc.) and empty symbols (AssetSummary rows)
          if (String(trade.assetCategory) !== 'STK') continue;
          const symbol = String(trade.symbol ?? '').trim();
          if (!symbol) continue;
          const dateTime = String(trade.dateTime ?? '').trim();
          if (!dateTime) continue;

          const quantity = parseFloat(String(trade.quantity));
          const tradePrice = parseFloat(String(trade.tradePrice));
          if (isNaN(quantity) || isNaN(tradePrice) || quantity === 0) continue;

          transactions.push({
            type: trade.buySell === 'BUY' ? 'buy' : 'sell',
            ticker: symbol,
            shares: Math.abs(quantity),
            price: tradePrice,
            timestamp: parseIBKRDate(dateTime),
          });
        }
      }

      // Sort chronologically — critical for correct weighted-average computation
      transactions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Compute holdings via running weighted average across all accounts combined.
      // Do NOT clamp shares to 0 on sells — a sell that drives shares negative represents
      // either a short position or a cross-account transfer (sell in one account that offsets
      // a buy recorded in the other account). Clamping to 0 would treat the subsequent cover
      // buy as a new long entry and produce a phantom position.
      const positions: Record<string, { shares: number; avgPrice: number }> = {};
      for (const tx of transactions) {
        const pos = positions[tx.ticker] ?? { shares: 0, avgPrice: 0 };
        if (tx.type === 'buy') {
          const newShares = pos.shares + tx.shares;
          pos.avgPrice = (pos.shares * pos.avgPrice + tx.shares * tx.price) / newShares;
          pos.shares = newShares;
        } else {
          pos.shares -= tx.shares;
          if (pos.shares <= 0) pos.avgPrice = 0;
        }
        positions[tx.ticker] = pos;
      }

      const holdings: Record<string, { shares: number; averagePrice: number }> = {};
      for (const [ticker, { shares, avgPrice }] of Object.entries(positions)) {
        if (shares > 0.0001) holdings[ticker] = { shares, averagePrice: avgPrice };
      }

      res.json({ transactions, holdings, count: transactions.length });
    } catch (e: unknown) {
      console.error('IBKR import error:', e);
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to parse IBKR XML' });
    }
  });

  // --- Vite dev / static production ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, _res) => {
      _res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
