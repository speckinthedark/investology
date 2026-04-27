# Stock Research Tab — Design Spec

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Add a dedicated "Research" sidebar tab where the user types any stock ticker and sees a comprehensive overview — price chart, key stats, financials history, and a portfolio callout if they already hold the stock.

**Architecture:** New sidebar tab (`research`) with a search bar at the top. On valid ticker submission, a new backend endpoint fetches rich Yahoo Finance data (quote + quoteSummary) and returns it as a single `StockDetail` object. The frontend renders this across four sections: hero, TradingView price chart, stats table, and a Recharts financials bar chart.

**Tech Stack:** React + TypeScript + Tailwind CSS, Express backend, `yahoo-finance2`, TradingView embeddable widget (free), Recharts (already in project).

---

## Data Model

New type in `src/types.ts`:

```typescript
export interface FinancialPeriod {
  label: string;   // "FY2024" or "Q3 2024"
  value: number;   // raw number in dollars
}

export interface StockDetail {
  // Identity
  ticker: string;
  companyName: string;
  exchange: string;          // "NASDAQ", "NYSE", etc.
  sector: string;
  industry: string;
  country: string;
  website: string;
  fullTimeEmployees: number;
  longBusinessSummary: string;

  // Price
  price: number;
  change: number;
  changePercent: number;

  // Trading snapshot
  marketCap: number;
  volume: number;
  averageVolume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  beta: number;

  // Fundamentals
  trailingPE: number | null;
  forwardPE: number | null;
  trailingEps: number | null;
  dividendYield: number | null;
  profitMargins: number | null;
  operatingMargins: number | null;
  returnOnEquity: number | null;
  freeCashflow: number | null;

  // Financial history (for bar chart)
  annualRevenue: FinancialPeriod[];
  annualNetIncome: FinancialPeriod[];
  annualFreeCashFlow: FinancialPeriod[];
  quarterlyRevenue: FinancialPeriod[];
  quarterlyNetIncome: FinancialPeriod[];
  quarterlyFreeCashFlow: FinancialPeriod[];
}
```

---

## Backend

### New route: `GET /api/stock/detail/:ticker`

Calls `yahoo-finance2` with multiple quoteSummary modules in parallel:

```typescript
const [quote, summary, incomeAnnual, incomeQuarterly, cashflowAnnual, cashflowQuarterly] =
  await Promise.all([
    yahooFinance.quote(ticker),
    yahooFinance.quoteSummary(ticker, {
      modules: ['assetProfile', 'summaryDetail', 'defaultKeyStatistics', 'financialData'],
    }),
    yahooFinance.quoteSummary(ticker, { modules: ['incomeStatementHistory'] }),
    yahooFinance.quoteSummary(ticker, { modules: ['incomeStatementHistoryQuarterly'] }),
    yahooFinance.quoteSummary(ticker, { modules: ['cashflowStatementHistory'] }),
    yahooFinance.quoteSummary(ticker, { modules: ['cashflowStatementHistoryQuarterly'] }),
  ]);
```

Free Cash Flow = `totalCashFromOperatingActivities` − `capitalExpenditures` (both negative in Yahoo data — subtract accordingly).

Returns a `StockDetail` JSON object. Responds `400` with `{ error: 'Ticker not found' }` if `quote.regularMarketPrice` is null/undefined.

New service function in `src/services/stockService.ts`:

```typescript
export async function fetchStockDetail(ticker: string): Promise<StockDetail>
```

---

## Frontend

### Files to create

| File | Responsibility |
|---|---|
| `src/components/tabs/ResearchTab.tsx` | Top-level tab — owns search state, fetched data, loading/error states |
| `src/components/research/StockSearchBar.tsx` | Controlled text input, fires `onSearch(ticker)` on Enter |
| `src/components/research/StockHero.tsx` | Logo, company name, exchange/sector pills, price, day change |
| `src/components/research/PortfolioCallout.tsx` | Indigo banner — shares held, avg cost, current value, unrealised gain/loss |
| `src/components/research/StockStatsTable.tsx` | Three-section key/value table (Trading Snapshot, Fundamentals, Company) |
| `src/components/research/TradingViewChart.tsx` | TradingView widget embed, re-mounts on ticker or timeframe change |
| `src/components/research/FinancialsChart.tsx` | Recharts BarChart with Annual/Quarterly toggle + Revenue/Net Income/FCF metric tabs |

### Files to modify

| File | Change |
|---|---|
| `src/types.ts` | Add `StockDetail`, `FinancialPeriod` |
| `src/services/stockService.ts` | Add `fetchStockDetail` |
| `server.ts` | Add `GET /api/stock/detail/:ticker` route |
| `src/App.tsx` | Add `'research'` to `Tab` type, render `<ResearchTab>` |
| `src/components/Sidebar.tsx` | Add Research nav item with `Search` icon |

---

## Component Details

### `ResearchTab`

States: `ticker` (string), `detail` (StockDetail | null), `status` ('idle' | 'loading' | 'error'), `errorMessage` (string).

On idle: renders search bar + empty state prompt ("Search a ticker to get started").
On loading: search bar + skeleton placeholders.
On error: search bar + error message (e.g. "Ticker not found").
On success: full page layout — search bar → hero → callout (if applicable) → price chart → two-column (stats + financials).

Passes `holdings` down from App so `PortfolioCallout` can check if ticker is held.

### `StockSearchBar`

```tsx
interface Props {
  onSearch: (ticker: string) => void;
  isLoading: boolean;
}
```

- Uppercase-coerces input on change
- Fires `onSearch` on Enter if input is non-empty and not already loading
- Shows a spinner in place of the search icon while loading

### `StockHero`

Reuses the `TickerLogo` component (FMP → Parqet → initials fallback, already exists in `TransactionsTab`). Displays ticker, company name, exchange + sector + industry pills, price, and day change with green/rose colouring.

### `PortfolioCallout`

```tsx
interface Props {
  holding: Holding | undefined;
  currentPrice: number;
}
```

Renders nothing if `holding` is undefined. Otherwise shows shares held, average cost, current value, and unrealised P&L (absolute + percent), coloured green or rose.

### `TradingViewChart`

```tsx
interface Props {
  ticker: string;
  exchange: string;  // e.g. "NASDAQ"
}
```

Timeframe tabs: **1W · 1M · 3M · 1Y · 5Y** (local state, default 1M).

Tab → TradingView `range` param mapping:
- 1W → `"5D"`
- 1M → `"1M"`
- 3M → `"3M"`
- 1Y → `"12M"`
- 5Y → `"60M"`

Injects the TradingView script once via a `useEffect` that appends `<script src="https://s3.tradingview.com/tv.js">` to `document.head` if not already present. Creates the widget inside a stable container `div`. Re-creates the widget (clear container + `new TradingView.widget(...)`) whenever `ticker`, `exchange`, or `range` changes.

Widget config: `theme: "dark"`, `hide_top_toolbar: true`, `hide_legend: false`, `save_image: false`, `autosize: true`. Container height: `400px`.

Symbol format: `"${exchange}:${ticker}"` — falls back to just `ticker` if exchange is empty.

### `StockStatsTable`

Three section groups rendered as a single bordered panel:

**Trading Snapshot**: Market Cap, Volume, Avg. Volume, 52W High (green), 52W Low (rose), Beta

**Fundamentals**: P/E (TTM), Forward P/E, EPS (TTM), Profit Margin (green if > 0), Dividend Yield (muted if null → "—")

**Company**: Industry, Employees, Return on Equity, Free Cash Flow, Operating Margin, Website (muted, plain text — no link)

Null values render as `"—"` in muted zinc text.

Formatting helpers:
- Large numbers: `$3.21T`, `$108.8B`, `48.2M` (auto-scale with 2 sig figs)
- Percentages: `24.3%`
- Ratios: `32.4x`

### `FinancialsChart`

```tsx
interface Props {
  detail: StockDetail;
}
```

Local state: `period` ('annual' | 'quarterly', default 'annual'), `metric` ('revenue' | 'netIncome' | 'freeCashFlow', default 'revenue').

Derives the active data array from `detail` based on `period` + `metric`. Passes it to a Recharts `BarChart` with:
- `XAxis`: `label` field
- `YAxis`: auto-scaled, hidden tick labels (values shown in bar tooltip)
- `Bar`: violet gradient (`#6d28d9` → `#8b5cf6`), rounded top corners (`radius={[4,4,0,0]}`)
- `Tooltip`: dark zinc background, shows formatted value

Bar labels: value formatted as `$391B` / `$99.8B` rendered above each bar via `<LabelList>`.

Annual data shows last 4 fiscal years. Quarterly data shows last 8 quarters.

---

## Layout

```
[ Search bar — full width ]
[ Hero — full width ]
[ Portfolio callout — full width, conditional ]
[ TradingView price chart — full width, 400px tall ]
[ grid: 5fr | 8fr gap-6 ]
  [ StockStatsTable ]   [ FinancialsChart ]
```

Outer padding matches other tabs (`p-6`). Two-column section aligns to tops of both panels.

---

## Error & Loading States

- **Ticker not found** (400 from server): "No results for '{ticker}' — check the ticker and try again."
- **Network/server error** (500): "Failed to load data. Try again."
- **Loading**: skeleton blocks for hero, chart placeholder, table rows, and chart area.
- **Empty (idle)**: centred prompt "Search any ticker to get started" with a `Search` icon.

---

## Sidebar

Add to `NAV_ITEMS` in `Sidebar.tsx`:

```typescript
{ id: 'research', label: 'Research', icon: Search }  // lucide-react Search icon
```

Add `'research'` to the `Tab` union type in both `App.tsx` and `Sidebar.tsx`.
