# Performance Tab Revamp — Design Spec

**Date:** 2026-06-03  
**Branch:** feat/update-performance-tab  
**Status:** Approved

---

## Motivation

Now that holdings can be imported from eToro and IBKR, we can no longer assume full transaction history is present. The existing portfolio value chart reconstructs historical portfolio value by replaying transactions against Yahoo Finance price history — this breaks silently for imported portfolios. The tab needs to shift from time-series performance to snapshot-based, per-holding analytics.

---

## What's Removed

- Portfolio Value area chart (and all supporting computation: `monthlyValues`, `chartData`, `periodData`, `getSharesAt`, `modifiedDietz`)
- Monthly Returns bar chart (and `benchmarkMonthlyReturns`, `enrichedReturns`, `computeBenchmarkReturns`)
- $10k hypothetical card and `tenKCard` computation
- YTD, Best Month, Worst Month stat cards and `ytdReturn`, `bestMonth`, `worstMonth` derivations
- Period selector (6M / 1Y / All) and `period` state
- Benchmark overlay toggles (SPY / QQQ) and `activeBenchmarks`, `benchmarkHistory` state
- `priceHistory`, `isPriceHistoryLoading`, `transactions` props

---

## New Component Interface

```ts
interface Props {
  holdings: Holding[];
  stockPrices: Record<string, StockData>;
  totalStockValue: number;
  totalCostBasis: number;
}
```

`holdings` and `stockPrices` are already available in `App.tsx` but not currently passed to `PerformanceTab`. No new data fetching is needed in App — only the prop threading changes.

---

## Layout

**Single scroll column:**

```
[ Stat Cards — 5 columns ]

[ Holdings Table (60%) | Attribution Panel (40%) ]
```

The two-column body uses a fixed `grid-cols-[3fr_2fr]` split. Both columns scroll independently if content overflows (like the Research tab pattern).

---

## Stat Cards (5, single row)

| Card | Value | Sub-label |
|---|---|---|
| Unrealized P/L | Dollar gain/loss (privacy masked) | cost basis (privacy masked) |
| Total Gain % | `(totalStockValue − totalCostBasis) / totalCostBasis × 100` | "vs cost basis" |
| Best Performer | Ticker + `+XX.X%` | gain % label |
| Worst Performer | Ticker + `−XX.X%` | gain % label |
| Portfolio Beta | Weighted avg beta (1 decimal) | "weighted by mkt value" |

**Portfolio Beta formula:**  
`β_portfolio = Σ(marketValue_i / totalStockValue × beta_i)`  
Beta per stock comes from `stockPrices[ticker].beta`. `beta` is returned by `yahooFinance.quote()` but not currently included in the `/api/stock/:ticker` response or `StockData` type — requires the server change below. If `beta` is null for a stock, exclude it from the weighted average. Show `—` if no betas are available.

---

## Holdings Table (left column, 60%)

### Columns

| Column | Content | Privacy |
|---|---|---|
| Logo + Ticker | `TickerLogo` + ticker symbol | — |
| Gain % | Bold colored number + proportional mini bar (green for positive, red for negative). Bar width scaled relative to max absolute gain % across all holdings. | — |
| Unrealized P/L | `(currentPrice − avgPrice) × shares` | masked |
| Market Value | `currentPrice × shares` | masked |
| Weight % | `marketValue / totalStockValue × 100` | — |
| 21D Sparkline | Mini area chart from `stockPrices[ticker].history` (21-day price array already in `StockData`) | — |

### Sorting

Default: Gain % descending. Clicking any column header toggles asc/desc sort on that column. Active sort column highlighted with an arrow indicator.

### Empty / loading states

- No holdings: show "Add holdings to see performance breakdown."
- `stockPrices` not yet populated for a ticker: show a skeleton row.

---

## Attribution Panel (right column, 40%)

Two stacked cards.

### Card 1 — Top Contributors

**Title:** "Top Contributors"  
**Subtitle:** "Dollar P/L · top 3 winners & bottom 2 losers"

Diverging horizontal bar chart:
- Top 3 holdings by dollar P/L — bars extend **right** (green)
- Bottom 2 holdings by dollar P/L — bars extend **left** (red)
- Centre axis at 50% of panel width
- Each row: Ticker label · bar · dollar P/L value (privacy masked)
- Thin horizontal rule separating winners from losers
- Bar widths scaled: max-gain holding = full half-width; others proportional

### Card 2 — Sector Breakdown

**Title:** "Sector Breakdown"  
**Layout:** Donut chart (Recharts `PieChart` with inner radius) + legend

- Grouped by sector, weighted by market value
- Sectors coloured with a fixed palette (Technology → violet, Financials → blue, Healthcare → emerald, Energy → amber, Consumer → rose, Industrials → orange, Other → zinc)
- Legend shows sector name + weight %
- "Unknown" bucket for tickers where sector is not available

**Data source for sector:** Requires a `server.ts` change — add `sector` field to the `/api/stock/:ticker` quote response. `yahooFinance.quote()` does not include sector in default modules; need to add `quoteType` or fetch from `summaryProfile`. The simplest approach: when building the quote response in the route handler, include `result.sector ?? null` (already present on the `Quote` type from yahoo-finance2 for equities).

---

## Server Change (minor)

In the `GET /api/stock/:ticker` route handler in `server.ts`, add `beta` to the JSON response object:

```ts
beta: (quote as any).beta ?? null,
```

`sector` is already returned by this endpoint. This is the only backend change required.

Also add `beta: number | null` to the `StockData` interface in `src/types.ts`.

---

## Privacy Masking

Apply `usePrivacy` / `HIDDEN` to:
- Unrealized P/L (stat card + table column + contributors bar labels)
- Market Value (table column)
- Cost basis sub-label on Unrealized P/L card

Do **not** mask: Gain %, Weight %, Beta, sector names, ticker symbols.

---

## What Stays

- `StatCard` sub-component (reused, minor label changes)
- `TickerLogo` for the table ticker column
- `usePrivacy` / `HIDDEN` privacy pattern
- Dark theme conventions (`bg-zinc-900`, `border-zinc-800`, etc.)
- `cn()` utility

---

## Files Changed

| File | Change |
|---|---|
| `src/components/tabs/PerformanceTab.tsx` | Full rewrite — remove charts, add holdings table + attribution panel |
| `src/App.tsx` | Pass `holdings` and `stockPrices` props to `PerformanceTab`; remove `priceHistory` / `isPriceHistoryLoading` / `transactions` props |
| `server.ts` | Add `sector` field to `/api/stock/:ticker` response |
| `src/types.ts` | Add `beta: number \| null` to `StockData` interface |
