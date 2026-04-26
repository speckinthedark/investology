# Performance Tab Improvements Design

**Date:** 2026-04-26

## Goal

Two targeted improvements to the Performance tab:
1. Overlay buy (green) and sell (red) circle markers on the Portfolio Value area chart at the months where transactions occurred.
2. Replace the current simple month-over-month return with a Modified Dietz time-weighted return so that capital additions/withdrawals don't inflate or deflate monthly performance figures.

## Scope

Single file: `src/components/tabs/PerformanceTab.tsx`. No new files, no new dependencies, no changes to other components or the data layer.

---

## Feature 1: Buy/Sell Markers on Portfolio Value Chart

### What it does

For each month visible in the area chart, any buy or sell transactions that occurred in that calendar month are rendered as small filled circles overlaid on the portfolio value line:
- **Green circles** for buy transactions
- **Red circles** for sell transactions
- Multiple transactions in the same month are stacked vertically, offset by ~12px per position, centered on the portfolio value at that month

Markers respect the period selector (6M / 1Y / All) — only transactions within the visible window are shown. Deposit and withdrawal transactions are ignored (they are cash flows, not equity trades).

### Implementation

**New computed value: `transactionMarkers`**

Derived from `periodData` and `sortedTxs`. For each data point in `periodData`, find all buy/sell transactions whose month matches the data point's `date` field. Note: historical points have `date` in `"YYYY-MM"` format; the live "Now" point has a full ISO date — match using `.slice(0, 7)` on both `tx.timestamp` and `dataPoint.date` to normalise to `"YYYY-MM"`. Produce one marker entry per transaction:

```
{
  label: string       // matches the x-axis dataKey, e.g. "Apr '25"
  value: number       // portfolio value at that month (the y-coordinate base)
  type: 'buy' | 'sell'
  stackIndex: number  // 0-based position within same month (for vertical offset)
  totalInMonth: number // total transactions in this month (to centre the stack)
}
```

**Rendering**

Use Recharts `ReferenceDot` components inside the existing `AreaChart`. One `ReferenceDot` per marker entry. The `y` value is `marker.value + (stackIndex - (totalInMonth - 1) / 2) * 12` to centre the stack on the line. Style: `r={5}`, filled green (`#34d399`) or red (`#f87171`), white stroke, `strokeWidth={1.5}`, `ifOverflow="extendDomain"`.

---

## Feature 2: Time-Weighted Monthly Returns (Modified Dietz)

### Problem with current calculation

`(end_value - start_value) / start_value` treats any increase in portfolio value as return — including new capital invested. If $10k is added mid-month and the market is flat, the formula shows a large positive return.

### Modified Dietz formula

```
Return = (V_end - V_start - CF) / (V_start + Σ(CF_i × W_i))
```

Where:
- `V_start` = portfolio value at start of month (prior month's `value`)
- `V_end` = portfolio value at end of month
- `CF` = net cash flow = sum of all `CF_i`
- `CF_i` = cash flow for individual transaction: `+(shares × price)` for buys, `-(shares × price)` for sells
- `W_i` = `(days_in_month - day_of_transaction) / days_in_month` — fraction of the month remaining when the cash flow occurred (range 0–1)

### Edge cases

- If the denominator ≤ 0 (e.g. portfolio was empty and no weighted inflow), return 0%.
- Deposit and withdrawal transaction types are excluded — they represent cash movements not reflected in the equity portfolio value.
- The `day_of_transaction` is extracted from `tx.timestamp` (ISO string), `days_in_month` from the month being evaluated.

### Impact

`monthlyReturns` feeds the Monthly Returns bar chart, the Best Month / Worst Month stat cards, and the YTD calculation. All three improve automatically with the corrected formula — no other changes needed.

---

## Data Flow

```
transactions (prop)
  └─ sortedTxs (sorted by timestamp, memoized)
       ├─ monthlyValues (portfolio value per month-end)
       │    └─ chartData (+ live "Now" point)
       │         ├─ periodData → AreaChart + ReferenceDots (Feature 1)
       │         └─ monthlyReturns (Modified Dietz) → periodReturns → BarChart (Feature 2)
       └─ transactionMarkers (derived from periodData + sortedTxs) → ReferenceDots (Feature 1)
```

---

## Non-Goals

- No changes to daily granularity or data fetching
- No tooltip changes for the markers (ReferenceDot has no built-in tooltip; clicking is out of scope)
- No changes to the Unrealized P/L stat card (it uses cost basis, not monthly returns)
