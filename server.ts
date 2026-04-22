import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Finnhub Proxy
  app.get("/api/stock/:ticker", async (req, res) => {
    const { ticker } = req.params;
    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "FINNHUB_API_KEY is not configured" });
    }

    try {
      // 1. Fetch Quote
      const quoteRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`);
      const quote = await quoteRes.json();

      // 2. Fetch Profile (for sector)
      const profileRes = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${apiKey}`);
      const profile = await profileRes.json();

      // 3. Fetch Candles (for history - last 7 days)
      // Finnhub candles: resolution 'D' (daily), from 7 days ago to now
      const now = Math.floor(Date.now() / 1000);
      const sevenDaysAgo = now - (7 * 24 * 60 * 60);
      const candleRes = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${sevenDaysAgo}&to=${now}&token=${apiKey}`);
      const candles = await candleRes.json();

      // Format history
      const history = (candles.c || []).map((price: number, index: number) => ({
        date: new Date(candles.t[index] * 1000).toISOString().split('T')[0],
        price: price
      }));

      res.json({
        ticker,
        price: quote.c || 0,
        change: quote.d || 0,
        changePercent: quote.dp || 0,
        sector: profile.finnhubIndustry || "Other",
        history: history.length > 0 ? history : []
      });
    } catch (error) {
      console.error("Finnhub API error:", error);
      res.status(500).json({ error: "Failed to fetch stock data" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
