# Performance Tab Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add buy/sell transaction markers to the Portfolio Value area chart and replace the simple month-over-month return with Modified Dietz time-weighted return.

**Architecture:** Both changes are isolated to `src/components/tabs/PerformanceTab.tsx`. Task 1 adds a `modifiedDietz` pure helper function and updates the `monthlyReturns` useMemo. Task 2 adds a `txsByMonth` lookup map and a custom `dot` render prop on the `Area` chart component.

**Tech Stack:** React, TypeScript, Recharts (`AreaChart`, `Area`), date-fns already imported.

---

## File Map

| Action | Path |
|--------|------|
| **Modify** | `src/components/tabs/PerformanceTab.tsx` |

---

## Task 1: Modified Dietz time-weighted monthly returns

**Files:**
- Modify: `src/components/tabs/PerformanceTab.tsx`

**Context:** The current `monthlyReturns` useMemo (lines 96–104) calculates `(end - start) / start`, which inflates returns in months where new shares were bought. The Modified Dietz formula corrects for this by subtracting net cash flows from the numerator and weighting them in the denominator by how long they were deployed in the month.

- [ ] **Step 1: Add the `modifiedDietz` helper function**

Insert this function after the `fmt$` arrow function (after line 39, before `export default function PerformanceTab`):

```typescript
function modifiedDietz(
  vStart: number,
  vEnd: number,
  txs: Transaction[],
  yearMonth: string,
): number {
  const [y, m] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();

  let cf = 0;
  let weightedCf = 0;

  for (const tx of txs) {
    if (tx.type !== 'buy' && tx.type !== 'sell') continue;
    const amount = (tx.shares ?? 0) * (tx.price ?? 0);
    const sign = tx.type === 'buy' ? 1 : -1;
    const day = new Date(tx.timestamp).getDate();
    const w = (daysInMonth - day) / daysInMonth;
    cf += sign * amount;
    weightedCf += sign * amount * w;
  }

  const denominator = vStart + weightedCf;
  if (denominator <= 0) return 0;
  return ((vEnd - vStart - cf) / denominator) * 100;
}
```

- [ ] **Step 2: Replace the `monthlyReturns` useMemo**

Find this block (currently lines 96–104):

```typescript
  // Month-over-month return %
  const monthlyReturns = useMemo(
    () =>
      chartData.slice(1).map((m, i) => {
        const prev = chartData[i];
        const pct = prev.value > 0 ? ((m.value - prev.value) / prev.value) * 100 : 0;
        return { label: m.label, date: m.date, returnPct: pct };
      }),
    [chartData],
  );
```

Replace it with:

```typescript
  // Month-over-month return % — Modified Dietz TWR
  const monthlyReturns = useMemo(
    () =>
      chartData.slice(1).map((m, i) => {
        const prev = chartData[i];
        const yearMonth = m.date.slice(0, 7);
        const txsInMonth = sortedTxs.filter(
          (tx) => tx.timestamp.slice(0, 7) === yearMonth,
        );
        const returnPct = modifiedDietz(prev.value, m.value, txsInMonth, yearMonth);
        return { label: m.label, date: m.date, returnPct };
      }),
    [chartData, sortedTxs],
  );
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/rohankirpekar/Desktop/Personal projects/stockpulse-tracker"
npx tsc --noEmit 2>&1
```

Expected: no output (zero errors).

- [ ] **Step 4: Commit**

```bash
git add src/components/tabs/PerformanceTab.tsx
git commit -m "feat: use Modified Dietz TWR for monthly returns in PerformanceTab"
```

---

## Task 2: Buy/sell markers on the Portfolio Value chart

**Files:**
- Modify: `src/components/tabs/PerformanceTab.tsx`

**Context:** The Area chart uses `dot={false}` (no dots on the line). We'll replace this with a custom `dot` render function that draws green circles for buys and red circles for sells at each month's data point. Multiple transactions in the same month are stacked vertically, offset by 14px each, centred on the portfolio value line. A `txsByMonth` map pre-indexes transactions by `"YYYY-MM"` so the dot function can look up transactions in O(1) per data point.

Note: `periodData` items use two date formats:
- Historical months: `date = "YYYY-MM"` (e.g. `"2025-04"`)
- The live "Now" point: `date = "2026-04-26"` (full ISO date)

Both cases normalise to `"YYYY-MM"` via `.slice(0, 7)`.

- [ ] **Step 1: Add the `txsByMonth` useMemo**

Insert this useMemo directly after the `monthlyReturns` useMemo block:

```typescript
  // Pre-index buy/sell transactions by month for O(1) marker lookup
  const txsByMonth = useMemo(() => {
    const map: Record<string, Transaction[]> = {};
    for (const tx of sortedTxs) {
      if (tx.type !== 'buy' && tx.type !== 'sell') continue;
      const ym = tx.timestamp.slice(0, 7);
      if (!map[ym]) map[ym] = [];
      map[ym].push(tx);
    }
    return map;
  }, [sortedTxs]);
```

- [ ] **Step 2: Update the `Area` component's `dot` prop**

Find this `Area` element inside the `AreaChart` (currently around line 248):

```typescript
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#a78bfa"
                  strokeWidth={2.5}
                  fill="url(#portfolioGrad)"
                  dot={false}
                  activeDot={{ r: 5, fill: '#a78bfa', stroke: '#09090b', strokeWidth: 2 }}
                />
```

Replace it with:

```typescript
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#a78bfa"
                  strokeWidth={2.5}
                  fill="url(#portfolioGrad)"
                  dot={(dotProps: any) => {
                    const { cx, cy, payload } = dotProps as {
                      cx: number;
                      cy: number;
                      payload: { date: string };
                    };
                    const txs = txsByMonth[payload.date.slice(0, 7)] ?? [];
                    if (txs.length === 0) return <g />;
                    return (
                      <g>
                        {txs.map((tx, idx) => {
                          const offset = (idx - (txs.length - 1) / 2) * 14;
                          return (
                            <circle
                              key={idx}
                              cx={cx}
                              cy={cy + offset}
                              r={5}
                              fill={tx.type === 'buy' ? '#34d399' : '#f87171'}
                              stroke="#09090b"
                              strokeWidth={1.5}
                            />
                          );
                        })}
                      </g>
                    );
                  }}
                  activeDot={{ r: 5, fill: '#a78bfa', stroke: '#09090b', strokeWidth: 2 }}
                />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/rohankirpekar/Desktop/Personal projects/stockpulse-tracker"
npx tsc --noEmit 2>&1
```

Expected: no output (zero errors).

- [ ] **Step 4: Commit**

```bash
git add src/components/tabs/PerformanceTab.tsx
git commit -m "feat: add buy/sell markers to portfolio value chart"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|-------------|------|
| Green circles for buys, red for sells on area chart | Task 2 (dot render function) |
| Stack markers at monthly level | Task 2 (offset formula centred on cy) |
| Replace simple return with TWR | Task 1 (modifiedDietz helper + useMemo) |
| Deposits/withdrawals excluded from TWR cash flows | Task 1 (`tx.type !== 'buy' && tx.type !== 'sell'` guard) |
| Denominator ≤ 0 edge case | Task 1 (`if (denominator <= 0) return 0`) |
| Markers respect period selector | Task 2 (dot runs on `periodData`, already period-filtered) |
| Date format normalisation (`"YYYY-MM"` and full ISO) | Task 2 (`.slice(0, 7)` on both sides) |

### Type Consistency

- `modifiedDietz(vStart, vEnd, txs: Transaction[], yearMonth: string)` — `Transaction` is imported from `../../types` ✓
- `txsByMonth: Record<string, Transaction[]>` — keyed by `"YYYY-MM"`, same slice used in dot function ✓
- `dotProps as { cx: number; cy: number; payload: { date: string } }` — `date` is on every `chartData` entry ✓
- `tx.type === 'buy' ? '#34d399' : '#f87171'` — `tx.type` is narrowed to `'buy' | 'sell'` by the map filter ✓
