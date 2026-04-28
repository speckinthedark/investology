# StockPulse Tracker — Claude Code Context

A personal stock portfolio tracker and research tool. Users connect their brokerage holdings, track real-time performance, and research individual stocks. All market data is fetched live from Yahoo Finance. User data (holdings, transactions, cash) is persisted per-user in Firestore.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6 |
| Backend | Express 4, `tsx` (no compile step) |
| Styling | Tailwind CSS v4 — **no config file**, uses `@import "tailwindcss"` in `src/index.css` |
| Auth + DB | Firebase (Google Auth, Firestore) |
| Market data | `yahoo-finance2` v3 |
| Charts | Recharts, TradingView widget (iframe embed) |
| AI agents | Google ADK (`@google/adk`), Gemini via `@google/genai` |
| Animations | Framer Motion |
| Notifications | Sonner |

---

## Architecture

**Single process.** `server.ts` is the entry point. It registers all Express API routes, then mounts Vite as middleware (dev) or serves `dist/` (prod). There is no separate frontend dev server to manage.

```
npm run dev  →  tsx server.ts
                ├── Express API routes  (port 3000)
                └── Vite middleware     (proxied through same port)
```

**Firebase** handles auth and per-user data. The config is read from `firebase-applet-config.json` (not env vars). `src/firebase.ts` exports `auth` and `db`.

**Market data** is always fetched on demand — nothing is cached server-side. All frontend market calls go through `src/services/stockService.ts`.

---

## Environment

Create a `.env` file at the repo root:

```
GEMINI_API_KEY=your_gemini_key   # required for AI agent features
FINNHUB_API_KEY=                 # optional fallback, mostly unused now
```

`firebase-applet-config.json` must also be present (contains Firebase project credentials). Do not commit either file.

---

## File Structure

```
server.ts                        # Express server + all API routes
agents/
  index.ts                       # Google ADK agent definitions (portfolio report, chat)
  tools.ts                       # Agent tool implementations
  prompts.ts                     # Agent system prompts
src/
  App.tsx                        # Root component — tab routing, KPI header, global state
  types.ts                       # All shared TypeScript interfaces
  firebase.ts                    # Firebase init (auth + db)
  main.tsx                       # React entry point
  index.css                      # Tailwind import + custom utilities (custom-scrollbar, etc.)
  contexts/
    PrivacyContext.tsx            # Global privacy toggle (isHidden bool + HIDDEN constant)
  hooks/
    useAuth.ts                   # Firebase auth state
    usePortfolio.ts              # Firestore holdings/transactions/cash CRUD
    useAgentStream.ts            # SSE stream consumer for agent responses
    useChatSessions.ts           # Chat session management
  services/
    stockService.ts              # All frontend → backend market data fetches
    geminiService.ts             # Direct Gemini calls (unused by agent flow)
  lib/
    utils.ts                     # cn() helper (clsx + tailwind-merge)
    portfolio.ts                 # Financial computations (YTD TWR)
  components/
    tabs/                        # One component per main tab
      OverviewTab.tsx            # Holdings table, treemap, sector donut
      TransactionsTab.tsx        # Transaction history + CRUD
      PerformanceTab.tsx         # Portfolio value chart, $10k growth, per-stock performance
      ResearchTab.tsx            # Stock research — orchestrates all research sub-components
      InsightsTab.tsx            # AI agent chat interface
    research/                    # Sub-components used only by ResearchTab
      ScreenerView.tsx           # Default idle state — 6 tabbed market screeners
      StockHero.tsx              # Ticker header (name, price, exchange, sector badges)
      StockStatsTable.tsx        # Left-column stats: Trading Snapshot, Fundamentals,
                                 #   Company, Technical Outlook, Key Technicals
      StockSearchBar.tsx         # Ticker search input
      TradingViewChart.tsx       # TradingView chart iframe embed
      FinancialsChart.tsx        # Revenue/profit/cashflow bar charts (Recharts)
      InsightsStrip.tsx          # Analyst rating + valuation strip
      BullBearPanel.tsx          # Bull/bear case bullet points
      TechnicalOutlook.tsx       # Standalone component (currently unused — integrated
                                 #   into StockStatsTable instead)
      PortfolioCallout.tsx       # "You hold X shares" callout if ticker is in portfolio
    shared/
      TickerLogo.tsx             # Company logo via Parqet CDN, FMP fallback
    agent/                       # AI agent UI components
      AgentChat.tsx
      AgentMessage.tsx
      SessionSidebar.tsx
      PortfolioRiskReport.tsx
      DCFResultCard.tsx
      MentionInput.tsx
    Sidebar.tsx                  # Left nav (tab icons, refresh, logout)
    TransactionModal.tsx         # Buy/sell/deposit/withdrawal form
    CashBalanceModal.tsx
    ConfirmDialog.tsx
    AssetDetailPanel.tsx         # Slide-out panel for per-asset transaction history
    ImportGuidePanel.tsx         # eToro / IBKR import wizard
```

---

## API Routes (server.ts)

| Method | Path | Description |
|---|---|---|
| GET | `/api/stock/:ticker` | Quote + 7-day sparkline (catch-all — must stay last) |
| GET | `/api/stock/detail/:ticker` | Full research data (quote, fundamentals, financials history) |
| GET | `/api/stock/insights/:ticker` | Yahoo Finance insights (recommendation, valuation, technicals, bull/bear) |
| POST | `/api/price-history` | Monthly close prices for multiple tickers |
| GET | `/api/screener/:screenerId` | Yahoo Finance screener (10 results) |
| GET | `/api/market/sp500-ytd` | S&P 500 YTD return |
| GET | `/api/market/fx-rates` | Live USD→INR and USD→AUD rates |
| GET | `/api/stock-ai/:ticker` | Gemini AI fallback quote (rarely hit) |
| POST | `/api/insights` | Gemini portfolio analysis |
| POST | `/api/agent/session` | Create ADK agent chat session |
| POST | `/api/agent/report` | Portfolio risk report (SSE stream) |
| POST | `/api/agent/chat` | Agent chat turn (SSE stream) |
| POST | `/api/import/etoro` | Parse eToro XLSX export |
| POST | `/api/import/ibkr` | Parse IBKR Flex Query XML |

**Route order is load-bearing.** `/api/stock/detail/:ticker` and `/api/stock/insights/:ticker` must be registered before `/api/stock/:ticker` or Express will swallow them.

---

## Data Flow

```
User action
  → stockService.ts (fetch)
    → Express route (server.ts)
      → yahoo-finance2
        → JSON response
          → React state (useState in App.tsx or tab component)
            → rendered UI
```

User portfolio data (holdings, transactions, cash) flows through `usePortfolio.ts` → Firestore → real-time listeners back to the hook.

---

## Key Conventions

### Styling
- **Dark theme only.** Background: `bg-zinc-950` (app) / `bg-zinc-900` (cards). Borders: `border-zinc-800`. Muted text: `text-zinc-500`.
- **Tailwind v4** — no `tailwind.config.js`. Arbitrary values work fine: `grid-cols-[1fr_3fr]`, `text-[10px]`, etc.
- **Custom scrollbar** — apply `custom-scrollbar` class to any scrollable container that needs dark-themed scrollbars (defined in `index.css`).
- Typography scale for labels: `text-[9px]` or `text-[10px]` + `font-bold uppercase tracking-widest text-zinc-500`.

### Privacy masking
A global eye-toggle in the KPI header hides sensitive values. Use the pattern everywhere dollar amounts appear:
```tsx
import { usePrivacy, HIDDEN } from '../../contexts/PrivacyContext';
const isHidden = usePrivacy();
// In JSX:
{isHidden ? HIDDEN : `$${value.toLocaleString()}`}
```
**Mask:** dollar amounts, share counts, portfolio values.
**Do not mask:** percentages (day change %, gain %, YTD), public market prices, sector names.

### Comments
Write no comments by default. Only add one when the WHY is non-obvious — a hidden constraint, a workaround, a subtle invariant. Never describe what the code does; well-named identifiers do that.

### No over-engineering
Don't add abstractions, error handling, or features beyond what the task requires. Three similar lines is better than a premature abstraction.

---

## Critical Gotchas

**1. Server does not hot-reload.**
`tsx server.ts` does not watch for changes. Any edit to `server.ts` or `agents/` requires killing and restarting the process. The Vite frontend does hot-reload independently.

**2. Yahoo Finance2 typing.**
Many `yahoo-finance2` modules aren't fully typed. Cast the instance when needed:
```typescript
const result = await (yahooFinance as any).screener({ scrIds: 'day_gainers', count: 10 });
```

**3. Screener IDs are lowercase.**
Yahoo Finance screener IDs use underscored lowercase: `day_gainers`, `most_actives`, `undervalued_large_caps`. Uppercase variants throw `InvalidOptionsError`.

**4. Tailwind v4 syntax.**
No `theme.extend`, no `tailwind.config.js`. Don't add one. Arbitrary values work everywhere. The entry point is `@import "tailwindcss"` in `src/index.css`.

**5. Research tab layout.**
`ResearchTab` sets `overflow-hidden` on its container (unlike all other tabs which scroll). The left stats column and right charts column each scroll independently. Don't add overflow to the outer wrapper.

**6. `toLocaleString` decimals.**
Always pass both `minimumFractionDigits` and `maximumFractionDigits` to avoid trailing decimal bloat:
```typescript
value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
```

---

## Development Workflow

```bash
npm run dev      # start server + Vite (port 3000)
npm run lint     # tsc --noEmit (type-check only, no build)
npm run build    # production Vite build → dist/
```

After editing `server.ts`: `Ctrl+C` → `npm run dev`.

The app requires a logged-in Firebase user. Google Sign-In works in both dev and prod.
