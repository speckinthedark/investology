# Stock Price Chart — Design Spec

**Date:** 2026-05-06  
**Replaces:** `TradingViewChart.tsx` (external iframe embed)  
**Goal:** In-house Recharts price chart powered by yahoo-finance2, with MA overlays and volume panel.

---

## Summary

Replace the TradingView widget iframe with a self-contained Recharts component that fetches OHLCV data from a new Express endpoint backed by `yahooFinance.chart()`. The chart renders a close-price area line with optional 21/50/200-day moving average overlays and a synced volume panel below.

---

## 1. New API Endpoint

```
GET /api/stock/chart/:ticker?range=1M&interval=1d
```

Registered in `server.ts` **above** the catch-all `/api/stock/:ticker` route.

### Range → period1 mapping

| `range` param | Days back | Notes |
|---|---|---|
| `1W` | 10 | Buffer for weekends/holidays |
| `1M` | 35 | ~1 trading month |
| `3M` | 100 | ~3 trading months |
| `1Y` | 370 | ~1 trading year |
| `5Y` | 1830 | ~5 trading years |

### Interval

Passed through directly to `yahooFinance.chart()`. Accepted values: `1d`, `1wk`.

### Implementation

```ts
const from = new Date(Date.now() - DAYS[range] * 86400000);
const chartData = await (yahooFinance as any).chart(ticker, {
  period1: from,
  interval,
});
```

### Response shape

```ts
{
  quotes: Array<{
    date: string;          // ISO date string
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
  }>;
  meta: {
    currency: string;
    regularMarketPrice: number;
    chartPreviousClose: number;  // used for delta coloring if needed
  };
}
```

Null OHLCV values (non-trading days) are filtered out before returning.

---

## 2. Component

**File:** `src/components/research/StockPriceChart.tsx`  
**Replaces:** `TradingViewChart.tsx` (deleted)

### Props

```ts
interface Props {
  ticker: string;  // e.g. "AAPL" — plain ticker, no exchange prefix needed
}
```

`ResearchTab.tsx` passes `detail.ticker` instead of `detail.tvSymbol`.

### State

| State | Type | Default | Description |
|---|---|---|---|
| `range` | `'1W'\|'1M'\|'3M'\|'1Y'\|'5Y'` | `'1M'` | Selected time range |
| `interval` | `'1d'\|'1wk'` | `'1d'` | Data granularity |
| `showMA21` | `boolean` | `false` | MA21 overlay toggle |
| `showMA50` | `boolean` | `false` | MA50 overlay toggle |
| `showMA200` | `boolean` | `false` | MA200 overlay toggle |
| `data` | `ChartQuote[]` | `[]` | Fetched OHLCV data |
| `loading` | `boolean` | `true` | Fetch in flight |
| `error` | `string\|null` | `null` | Fetch error message |

MA toggles default to `false` to avoid visual clutter on first load.

### Data fetch

Triggered on mount and whenever `ticker`, `range`, or `interval` changes. Uses a cancellation flag (`let cancelled = false`) to avoid stale state on rapid switches.

### MA computation

Computed client-side from the returned close prices. Moving average at index `i` = mean of the N closes ending at `i`. Indices with fewer than N preceding data points are `null` (no line rendered there).

```ts
function computeMA(closes: (number | null)[], n: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < n - 1) return null;
    const window = closes.slice(i - n + 1, i + 1);
    if (window.some((v) => v == null)) return null;
    return window.reduce((s, v) => s + v!, 0) / n;
  });
}
```

MA values are merged into the chart data array as `ma21`, `ma50`, `ma200` fields.

---

## 3. Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Price Chart  [1W][1M][3M][1Y][5Y]  [1D][1WK]  ▪MA21 ▪MA50 ▪MA200 │  ← controls bar
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Price area (ComposedChart, ~72% height)                   │
│   - Area: close price, #a78bfa gradient fill                │
│   - Line: MA21 #f59e0b dashed (if toggled)                  │
│   - Line: MA50 #22d3ee dashed (if toggled)                  │
│   - Line: MA200 #f87171 dashed (if toggled)                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│   Volume bars (BarChart, ~28% height)                       │
│   - #7c3aed, fill-opacity 0.35                              │
└─────────────────────────────────────────────────────────────┘
```

Both panels use `syncId="stock-chart"` so the crosshair cursor stays in sync. The tooltip lives on the price panel only — the volume panel sets `<Tooltip content={() => null} />` to suppress its own popup.

### Controls bar

Single row, `flex items-center justify-between`, `px-4 py-3 border-b border-zinc-800`.

- **Left:** `text-[10px] font-bold uppercase tracking-widest text-zinc-500` label "Price Chart"
- **Center:** Range pill group + Interval pill group — same `bg-zinc-800 rounded-lg p-0.5` pill style as `FinancialsChart`, active state `bg-white text-zinc-900`
- **Right:** MA checkboxes — same colored checkbox + label style as `FinancialsChart` metric toggles

### Colors

| Element | Color |
|---|---|
| Price line & gradient | `#a78bfa` (purple) |
| Price gradient fill | `#a78bfa` at 22% → 0% opacity |
| Volume bars | `#7c3aed` at 35% opacity |
| MA21 | `#f59e0b` (amber) |
| MA50 | `#22d3ee` (cyan) |
| MA200 | `#f87171` (rose) |

### Tooltip

Custom `<TooltipContent>` component showing:

```
May 5, 2026
Close   $192.45
Open    $190.12
High    $193.80
Low     $189.50
Volume  48.2M
─────────────
MA21    $188.30   ← only if toggled on
MA50    $182.10
MA200   $171.40
```

MA rows only rendered if the corresponding toggle is enabled and the value is non-null.

### Loading state

Full-height skeleton pulse div (`animate-pulse bg-zinc-800/60 rounded-xl`) sized to match the card, shown while fetch is in flight.

### Error state

`text-zinc-500 text-xs` centered message within the card bounds.

---

## 4. File changes

| File | Change |
|---|---|
| `server.ts` | Add `GET /api/stock/chart/:ticker` route above catch-all |
| `src/components/research/StockPriceChart.tsx` | New component (replaces TradingViewChart) |
| `src/components/research/TradingViewChart.tsx` | Deleted |
| `src/components/tabs/ResearchTab.tsx` | Import `StockPriceChart`, pass `detail.ticker` |
| `src/services/stockService.ts` | Add `fetchStockChart(ticker, range, interval)` |

`tvSymbol` field on `StockDetail` in `src/types.ts` can be removed if nothing else uses it (verify before deleting).

---

## 5. Out of scope

- Intraday intervals (5m, 15m, 30m, 1h) — not requested
- Candlestick chart type — user chose area line
- Dynamic green/red coloring — user chose static purple
- Zoom/pan interactions — Recharts default behavior only
- Export or save image — not needed
