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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- Finnhub stock data ---
  app.get('/api/stock/:ticker', async (req, res) => {
    const { ticker } = req.params;
    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'FINNHUB_API_KEY not configured' });
    }

    try {
      const [quoteRes, profileRes, candleRes] = await Promise.all([
        fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`),
        fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${apiKey}`),
        fetch(
          `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${Math.floor(Date.now() / 1000) - 7 * 86400}&to=${Math.floor(Date.now() / 1000)}&token=${apiKey}`
        ),
      ]);

      const [quote, profile, candles] = await Promise.all([
        quoteRes.json(),
        profileRes.json(),
        candleRes.json(),
      ]);

      const history = (candles.c || []).map((price: number, i: number) => ({
        date: new Date(candles.t[i] * 1000).toISOString().split('T')[0],
        price,
      }));

      res.json({
        ticker,
        price: quote.c || 0,
        change: quote.d || 0,
        changePercent: quote.dp || 0,
        sector: profile.finnhubIndustry || 'Other',
        history,
      });
    } catch (e) {
      console.error('Finnhub error:', e);
      res.status(500).json({ error: 'Failed to fetch from Finnhub' });
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
        model: 'gemini-2.0-flash',
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
        model: 'gemini-2.0-flash',
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
