# StockPulse Tracker

A personal stock portfolio tracker with real-time quotes, multi-broker import, historical performance charts, stock research, and AI-powered portfolio analysis.

![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)
![React](https://img.shields.io/badge/React-19-blue)
![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%2B%20Auth-orange)
![Yahoo Finance](https://img.shields.io/badge/Market%20Data-Yahoo%20Finance-purple)
![Gemini](https://img.shields.io/badge/AI-Gemini%20%2B%20Google%20ADK-blue)

---

## Features

### KPI Header (always visible)
- Total portfolio value with USD / INR / AUD toggle (live FX rates)
- Cash balance, total unrealised gain, today's gain
- Time-weighted YTD return (stock-only, monthly chain-linked)
- S&P 500 YTD return for benchmark comparison
- Privacy toggle — masks all dollar amounts across the entire app

### Overview Tab
- Holdings table with multi-column sort, 7-day sparklines, and company logos
- Click any ticker logo or name to jump directly to Research for that stock
- Interactive **treemap** with three views: day change, total return, portfolio weight
- **Sector allocation** donut chart with hover highlights

### Transactions Tab
- Full transaction log (buys, sells, deposits, withdrawals) with inline edit and delete
- CSV export and import (StockPulse format)
- Import wizard supporting eToro XLSX and IBKR Flex Query XML

### Performance Tab
- Portfolio value area chart with configurable time periods
- Month-over-month returns bar chart
- $10,000 invested comparison chart (portfolio vs per-holding)
- Per-holding performance breakdown

### Research Tab
- **Default idle state**: tabbed market screeners — Day Gainers, Day Losers, Most Active, Growth Tech, Undervalued Growth, Undervalued Large Caps — 10 stocks each with price, day %, 52W %, market cap, volume ratio, P/E
- **Stock detail view**: search any ticker or click one from your holdings or a screener
  - Company hero with exchange, sector, and industry badges
  - Portfolio callout if you hold the stock
  - Analyst rating strip (rating, price target, upside %) and valuation summary
  - Left column: Trading Snapshot, Fundamentals, Company info, Technical Outlook, Key Technicals — all scrollable
  - Right column: TradingView price chart, financials bar chart (income / balance sheet / cash flow), bull & bear case summaries — independently scrollable
  - Back button to return to screeners

### AI Insights Tab
- Multi-session agent chat powered by **Google ADK**
- Agents with access to live fundamentals, stock quotes, price history, and DCF modelling
- Structured outputs: DCF result cards, portfolio risk reports rendered inline
- Session history sidebar with per-session titles

### Authentication
- Google Sign-In via Firebase Auth
- All data isolated per user — no data is shared across accounts

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6 |
| Styling | Tailwind CSS v4 (no config file) |
| Animations | Framer Motion |
| Charts | Recharts, TradingView widget embed |
| Backend | Express 4, `tsx` (no compile step) |
| Auth + DB | Firebase Authentication (Google), Firestore |
| Market data | `yahoo-finance2` (quotes, insights, screener, FX rates) |
| AI agents | Google ADK (`@google/adk`), Gemini (`@google/genai`) |
| File parsing | `xlsx` (eToro), `fast-xml-parser` (IBKR) |
| Notifications | Sonner |

---

## Architecture

A single Express process serves everything. There is no separate frontend dev server.

```
Browser
  │
  ▼
Express server  (server.ts — port 3000)
  ├── /api/stock/:ticker              → yahoo-finance2 quote + sparkline
  ├── /api/stock/detail/:ticker       → full fundamentals + financials history
  ├── /api/stock/insights/:ticker     → analyst rating, valuation, technicals, bull/bear
  ├── /api/screener/:screenerId       → yahoo-finance2 screener (10 results)
  ├── /api/price-history              → monthly closes for Performance charts
  ├── /api/market/sp500-ytd           → ^GSPC YTD return
  ├── /api/market/fx-rates            → USD → INR, AUD live rates
  ├── /api/insights                   → Gemini portfolio analysis
  ├── /api/agent/session              → create ADK chat session
  ├── /api/agent/report               → portfolio risk report (SSE)
  ├── /api/agent/chat                 → agent chat turn (SSE)
  ├── /api/import/etoro               → parse eToro XLSX
  ├── /api/import/ibkr                → parse IBKR XML
  └── /* (dev: Vite middleware, prod: static dist/)

Firebase (client-side SDK)
  ├── Authentication                  → Google Sign-In
  └── Firestore
        └── /users/{uid}
              ├── holdings/{ticker}   → shares + averagePrice
              ├── transactions/{id}   → full transaction log
              └── settings/portfolio  → cash balance
```

---

## Getting Started

### Prerequisites

- **Node.js** 18 or later
- A **Firebase** project with Firestore and Google Auth enabled
- A **Gemini** API key (free tier at [aistudio.google.com](https://aistudio.google.com))

### Firebase Setup

1. Create a project at [Firebase Console](https://console.firebase.google.com).
2. Enable **Authentication → Sign-in method → Google**.
3. Enable **Firestore Database**.
4. In **Project Settings → General → Your apps**, register a Web app.
5. Download or copy the config — it gets saved as `firebase-applet-config.json` in the repo root (gitignored):

```json
{
  "apiKey": "...",
  "authDomain": "...",
  "projectId": "...",
  "storageBucket": "...",
  "messagingSenderId": "...",
  "appId": "...",
  "firestoreDatabaseId": "(default)"
}
```

### Environment Variables

Create a `.env` file at the repo root:

```env
GEMINI_API_KEY=your_gemini_api_key
```

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Powers AI portfolio analysis and ADK agents |
| `FINNHUB_API_KEY` | No | Legacy — no longer used for primary data |

### Running Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with Google.

> **Note:** `server.ts` does not hot-reload. After any backend change, stop the process and run `npm run dev` again. The Vite frontend hot-reloads normally.

### Production Build

```bash
npm run build
NODE_ENV=production npm run dev
```

| Script | Description |
|---|---|
| `npm run dev` | Start dev server (Express + Vite, port 3000) |
| `npm run build` | Bundle frontend to `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run lint` | TypeScript type-check (no emit) |
| `npm run clean` | Delete `dist/` |

---

## Importing Trade History

Open **Transactions → Import**. Transactions from multiple sources are merged — importing IBKR after eToro combines both into one portfolio.

### eToro (XLSX)
1. eToro → Portfolio → History → ⚙ → Account Statement
2. Set date range to your full account history and download the XLSX
3. Upload under the **eToro** tab in the import wizard

> eToro statements only include closed positions. Currently open positions must be added manually via Trade Asset.

> eToro caps exports to 12 months. For older accounts, download one statement per year and upload them one at a time.

### Interactive Brokers (XML Flex Query)
1. IBKR Client Portal → Performance & Reports → Flex Queries
2. Create an **Activity Flex Query** with the **Trades** section enabled
3. Set Asset Category filter to **Stocks only**, output format to **XML**
4. For multi-year accounts, run one query per year and upload each file separately
5. For multiple IBKR accounts, include all in a single Flex Query — cross-account transfers are handled automatically

**Required Trades fields:** Symbol, Date/Time, Buy/Sell, Quantity, Trade Price, Asset Category

### StockPulse CSV
Re-import a CSV previously exported from StockPulse. Use on a fresh account only — importing into an existing account will duplicate transactions.

```
date,type,ticker,shares,price
2024-03-09T10:22:00.000Z,buy,AAPL,5,172.30
2024-03-09T10:22:00.000Z,sell,MSFT,2,415.00
```

---

## Firestore Security Rules

Rules live in `firestore.rules`. Deploy via the Firebase Console (Firestore → Rules) or CLI:

```bash
npx firebase deploy --only firestore:rules
```

---

## Project Structure

```
.
├── server.ts                        # Express server + all API routes
├── firebase-applet-config.json      # Firebase credentials (gitignored — create manually)
├── agents/
│   ├── index.ts                     # Google ADK agent definitions
│   ├── tools.ts                     # Agent tool implementations (fundamentals, DCF, etc.)
│   └── prompts.ts                   # Agent system prompts
└── src/
    ├── App.tsx                      # Root: KPI header, tab routing, global state
    ├── types.ts                     # All shared TypeScript interfaces
    ├── firebase.ts                  # Firebase init (auth + db)
    ├── index.css                    # Tailwind import + custom utilities
    ├── contexts/
    │   └── PrivacyContext.tsx       # Global privacy toggle
    ├── hooks/
    │   ├── useAuth.ts               # Firebase auth state
    │   ├── usePortfolio.ts          # Firestore CRUD: holdings, transactions, cash
    │   ├── useAgentStream.ts        # SSE stream consumer for agent responses
    │   └── useChatSessions.ts       # Chat session management
    ├── services/
    │   └── stockService.ts          # All frontend → backend market data fetches
    ├── lib/
    │   ├── utils.ts                 # cn() helper (clsx + tailwind-merge)
    │   └── portfolio.ts             # Financial computations (YTD TWR)
    └── components/
        ├── tabs/
        │   ├── OverviewTab.tsx      # Holdings table, treemap, sector donut
        │   ├── TransactionsTab.tsx  # Transaction log, import/export
        │   ├── PerformanceTab.tsx   # Portfolio value chart, per-holding performance
        │   ├── ResearchTab.tsx      # Stock research orchestrator
        │   └── InsightsTab.tsx      # AI agent chat interface
        ├── research/
        │   ├── ScreenerView.tsx     # Tabbed market screeners (default idle state)
        │   ├── StockHero.tsx        # Ticker header (name, price, badges)
        │   ├── StockStatsTable.tsx  # Stats: fundamentals, technicals, key levels
        │   ├── StockSearchBar.tsx   # Ticker search input
        │   ├── TradingViewChart.tsx # TradingView chart embed
        │   ├── FinancialsChart.tsx  # Revenue / profit / cashflow bar charts
        │   ├── InsightsStrip.tsx    # Analyst rating + valuation strip
        │   ├── BullBearPanel.tsx    # Bull / bear case bullet points
        │   └── PortfolioCallout.tsx # "You hold X shares" banner
        ├── agent/
        │   ├── AgentChat.tsx
        │   ├── AgentMessage.tsx
        │   ├── SessionSidebar.tsx
        │   ├── PortfolioRiskReport.tsx
        │   ├── DCFResultCard.tsx
        │   └── MentionInput.tsx
        └── shared/
            └── TickerLogo.tsx       # Company logo (Parqet CDN, FMP fallback)
```

---

## Known Limitations

- **Yahoo Finance**: Unofficial API — not guaranteed for production use. May return incomplete data for non-US exchange tickers or during market outages.
- **eToro open positions**: Account statements don't include currently open positions. Add them manually via Trade Asset.
- **IBKR date range**: A single Flex Query is limited to one year. Multi-year accounts need one file per year uploaded sequentially.
- **Equities only**: The import pipeline filters to `STK` (stock) trades. Options, futures, and crypto are excluded.
- **YTD TWR**: Computed from monthly price snapshots. Tickers bought and fully sold within the current year (no longer in the portfolio) are excluded from the calculation as their historical prices are not retained.
