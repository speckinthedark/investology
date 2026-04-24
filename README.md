# StockPulse Tracker

A personal stock portfolio tracker with real-time quotes, multi-broker import, historical performance charts, and AI-powered portfolio analysis.

![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)
![React](https://img.shields.io/badge/React-19-blue)
![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%2B%20Auth-orange)
![Gemini](https://img.shields.io/badge/AI-Gemini%202.0%20Flash-purple)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Firebase Setup](#firebase-setup)
  - [Environment Variables](#environment-variables)
  - [Running Locally](#running-locally)
  - [Production Build](#production-build)
- [Data Sources](#data-sources)
- [Importing Trade History](#importing-trade-history)
- [Firestore Security Rules](#firestore-security-rules)
- [Project Structure](#project-structure)
- [Known Limitations](#known-limitations)

---

## Features

### Portfolio Dashboard
- Total portfolio value with real-time day change and total unrealized P&L
- Cash balance tracked separately — does not affect performance calculations
- One-click price refresh via Finnhub

### Overview Tab
- Holdings table with search and multi-column sort
- Interactive **treemap** with three views: day change, total return, and portfolio weight
- **Sector allocation** pie chart built from Finnhub industry data
- 7-day price sparkline per holding
- Click any holding to open a detailed side panel with full transaction history for that ticker

### Transactions Tab
- Full transaction log (buys, sells, deposits, withdrawals) with edit and delete
- CSV export compatible with the StockPulse import format
- Import wizard supporting three sources (see [Importing Trade History](#importing-trade-history))
- Clear all transactions with double confirmation

### Performance Tab
- Portfolio value area chart with 6M / 1Y / All time periods
- Month-over-month returns bar chart (green/red)
- Stat cards: Unrealized P&L, YTD return, best month, worst month, win rate

### Deep Dive Tab
- AI-generated portfolio analysis via **Gemini 2.0 Flash**
- Two analyst personas: **Buffett / Munger** (moats, intrinsic value) and **Peter Lynch** (GARP, ten-baggers)
- Persona preference persisted per user in Firestore

### Authentication
- Google Sign-In via Firebase Auth (popup with redirect fallback)
- All data isolated per user — no data is shared across accounts

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6 |
| Styling | Tailwind CSS v4, Framer Motion |
| Charts | Recharts |
| Backend | Express.js on Node.js (via `tsx`) |
| Database | Firebase Firestore |
| Auth | Firebase Authentication (Google) |
| AI | Google Gemini 2.0 Flash (`@google/genai`) |
| Stock data | Finnhub API (real-time quotes) |
| Price history | Yahoo Finance via `yahoo-finance2` |
| File parsing | `xlsx` (eToro XLSX), `fast-xml-parser` (IBKR XML) |
| File uploads | `multer` |
| Notifications | `sonner` |

---

## Architecture

The project uses a single unified server (`server.ts`) that:
- Serves the **Express API** for all `/api/*` routes
- In development: proxies to **Vite's dev server** (HMR included)
- In production: serves the pre-built **static files** from `dist/`

```
Browser
  │
  ▼
Express server (server.ts :3000)
  ├── /api/stock/:ticker         → Finnhub (real-time quote + 7-day candles)
  ├── /api/stock-ai/:ticker      → Gemini (AI fallback if Finnhub fails)
  ├── /api/price-history         → Yahoo Finance (monthly OHLC for charts)
  ├── /api/insights              → Gemini (portfolio analysis)
  ├── /api/import/etoro          → Parse eToro XLSX upload
  ├── /api/import/ibkr           → Parse IBKR Flex Query XML upload
  └── /* (dev: Vite middleware, prod: static dist/)

Firebase (client-side SDK)
  ├── Authentication             → Google Sign-In
  └── Firestore
        └── /users/{uid}
              ├── holdings/{ticker}
              ├── transactions/{id}
              └── settings/portfolio
```

**Data fallback chain for stock quotes:** Finnhub → Gemini AI → mock data. This ensures the UI never breaks even if Finnhub is unavailable or rate-limited.

---

## Getting Started

### Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later
- A **Firebase** project with Firestore and Google Auth enabled
- A **Finnhub** API key (free tier available at [finnhub.io](https://finnhub.io))
- A **Gemini** API key (free tier available at [aistudio.google.com](https://aistudio.google.com))

### Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com) and create a new project.

2. Enable **Authentication** → Sign-in method → **Google**.

3. Enable **Firestore Database** in production mode.

4. Deploy the security rules (see [Firestore Security Rules](#firestore-security-rules)).

5. In **Project Settings → General → Your apps**, register a Web app and copy the config object.

6. Create `src/firebase.ts` with your project credentials (this file is gitignored):

```ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

```env
GEMINI_API_KEY=your_gemini_api_key
FINNHUB_API_KEY=your_finnhub_api_key
APP_URL=http://localhost:3000
```

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Powers AI portfolio analysis and the stock data fallback |
| `FINNHUB_API_KEY` | Yes | Real-time stock quotes and 7-day price history |
| `APP_URL` | No | Base URL of the deployed app (used for self-referential links) |

### Running Locally

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The Express API and Vite dev server run together on the same port.

### Production Build

```bash
# Build the React app
npm run build

# Start the production server
NODE_ENV=production npm run dev
```

The server will serve the compiled static files from `dist/` instead of using Vite middleware.

**Available scripts:**

| Script | Description |
|---|---|
| `npm run dev` | Start development server (Express + Vite) |
| `npm run build` | Compile TypeScript and bundle with Vite |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run TypeScript type checking |
| `npm run clean` | Delete the `dist/` directory |

---

## Data Sources

### Finnhub (real-time quotes)
Used for current price, day change, and 7-day candle history. The free tier allows up to 60 API calls/minute. Each price refresh calls Finnhub once per holding.

### Yahoo Finance (monthly history)
Used exclusively for the Performance tab charts. Fetches monthly OHLC data from the start of the previous year to the present. No API key required — uses the `yahoo-finance2` npm package.

### Google Gemini 2.0 Flash
- **Portfolio insights**: Generates analysis of your holdings through a selected investment persona.
- **Stock data fallback**: If Finnhub fails, Gemini generates realistic estimated stock data so the UI remains functional.

---

## Importing Trade History

The import wizard (Transactions tab → Import) supports three sources. Transactions from multiple sources are **merged** — importing IBKR after eToro combines both into one portfolio. Holdings are recomputed from the full transaction history after each import.

### eToro (XLSX)
1. eToro → Portfolio → History → ⚙ → Account Statement
2. Set date range to your full account history
3. Download the XLS/XLSX file
4. Upload under the **eToro** tab in the import wizard

> **Note:** eToro only exports closed positions. Currently open positions must be added manually via Trade Asset.

> **Note:** eToro may cap exports to 12 months. For accounts older than one year, download one statement per year and upload them one at a time.

### Interactive Brokers (XML Flex Query)
1. IBKR Client Portal → Performance & Reports → Flex Queries
2. Create a new **Activity Flex Query** with the **Trades** section enabled
3. Set the Asset Category filter to **Stocks** only
4. Set output format to **XML** and date range to your full account history
5. For accounts spanning multiple years, run one query per year
6. For multiple IBKR accounts, include all accounts in a single Flex Query — cross-account transfers are handled automatically

**Required Trades fields:** Symbol, Date/Time, Buy/Sell, Quantity, Trade Price, Asset Category

### StockPulse CSV Backup
Re-import a CSV previously exported from StockPulse. Use on a fresh account only — importing into an account with existing transactions will duplicate them.

**CSV format:**
```
date,type,ticker,shares,price
2024-03-09T10:22:00.000Z,buy,AAPL,5,172.30
2024-03-09T10:22:00.000Z,sell,MSFT,2,415.00
```

---

## Firestore Security Rules

The rules in `firestore.rules` enforce that each user can only read and write their own data. Deploy them via the Firebase Console (Firestore → Rules tab) or the Firebase CLI:

```bash
npx firebase deploy --only firestore:rules
```

**Data model:**

```
/users/{uid}                          # User profile (displayName, email, selectedPersona)
/users/{uid}/holdings/{ticker}        # Current positions (shares + averagePrice)
/users/{uid}/transactions/{id}        # Full transaction log
/users/{uid}/settings/portfolio       # Cash balance
```

---

## Project Structure

```
.
├── server.ts                  # Express API + Vite dev middleware
├── firestore.rules            # Firestore security rules
├── src/
│   ├── App.tsx                # Root component, state management, tab routing
│   ├── firebase.ts            # Firebase initialisation (gitignored — create manually)
│   ├── types.ts               # Shared TypeScript interfaces
│   ├── hooks/
│   │   ├── useAuth.ts         # Firebase Auth + persona persistence
│   │   └── usePortfolio.ts    # Firestore CRUD: holdings, transactions, cash
│   ├── services/
│   │   ├── stockService.ts    # Finnhub → Gemini fallback → mock data chain
│   │   └── geminiService.ts   # Portfolio insights API call
│   ├── components/
│   │   ├── tabs/
│   │   │   ├── OverviewTab.tsx       # Treemap, sector chart, holdings table
│   │   │   ├── TransactionsTab.tsx   # Transaction log, import/export controls
│   │   │   ├── PerformanceTab.tsx    # Area chart, monthly returns, stat cards
│   │   │   └── InsightsTab.tsx       # AI deep dive UI
│   │   ├── ImportGuidePanel.tsx      # Step-by-step import wizard + file upload
│   │   ├── AssetDetailPanel.tsx      # Per-ticker transaction history side panel
│   │   ├── TransactionModal.tsx      # Add / edit transaction form
│   │   ├── CashBalanceModal.tsx      # Set cash balance dialog
│   │   ├── ConfirmDialog.tsx         # Destructive action confirmation
│   │   ├── LoginPage.tsx             # Google Sign-In screen
│   │   ├── Nav.tsx                   # Top navigation bar
│   │   └── ErrorBoundary.tsx         # React error boundary
│   └── lib/
│       └── utils.ts           # cn() helper (clsx + tailwind-merge)
├── .env.example               # Environment variable template
├── vite.config.ts             # Vite configuration
├── tsconfig.json              # TypeScript configuration
└── package.json
```

---

## Known Limitations

- **Finnhub free tier**: Limited to 60 requests/minute. Large portfolios (20+ holdings) may hit rate limits on refresh. The app falls back to Gemini AI estimates automatically.
- **Yahoo Finance**: Unofficial API — not guaranteed for production use. Occasionally returns incomplete data for tickers listed on non-US exchanges.
- **eToro open positions**: The eToro account statement does not include currently open positions. These must be added manually.
- **IBKR date range**: A single IBKR Flex Query is limited to one year of data. Multi-year accounts require one XML file per year, imported sequentially.
- **Equities only**: The import pipeline filters to equity (`STK`) trades only. Options, futures, and crypto are excluded.
- **AI insights**: Portfolio analysis is based on Gemini's training knowledge and the holdings snapshot sent at request time — not live market data or real-time news.
