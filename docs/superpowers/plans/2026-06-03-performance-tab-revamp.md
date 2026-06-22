# Performance Tab Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the time-series portfolio value chart with snapshot-based per-holding analytics: 5 stat cards, a sortable holdings table with mini gain bars and sparklines, and an attribution panel with diverging dollar P/L bars and a sector donut.

**Architecture:** All data is derived from `holdings` + `stockPrices` (already available in App.tsx) — no new fetches. One minor server change adds `beta` to the existing `/api/stock/:ticker` response. The component is a single-file rewrite with inline sub-components following the existing tab pattern.

**Tech Stack:** React 19, TypeScript, Recharts (AreaChart for sparklines, PieChart for sector donut), Tailwind v4, Lucide icons, existing `TickerLogo` and `usePrivacy` utilities.

---

## File Map

| File | Change |
|---|---|
| `src/types.ts` | Add `beta: number \| null` to `StockData` |
| `server.ts` | Add `beta` field to `/api/stock/:ticker` JSON response |
| `src/App.tsx` | Update `<PerformanceTab>` call: remove 3 old props, add `holdings` + `stockPrices` |
| `src/components/tabs/PerformanceTab.tsx` | Full rewrite — ~400 lines replacing ~600 lines |

---

## Task 1: Add beta to StockData type and server response

**Files:**
- Modify: `src/types.ts:22-29`
- Modify: `server.ts:349-356`

- [ ] **Step 1: Add `beta` to StockData interface**

In `src/types.ts`, update `StockData`:

```ts
export interface StockData {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  sector: string;
  history: { date: string; price: number }[];
  beta: number | null;
}
```

- [ ] **Step 2: Add `beta` to server quote response**

In `server.ts`, find the `res.json({...})` block inside `app.get('/api/stock/:ticker', ...)` (around line 349). Add `beta`:

```ts
res.json({
  ticker,
  price,
  change: (quote as any).regularMarketChange ?? 0,
  changePercent: (quote as any).regularMarketChangePercent ?? 0,
  sector: (summary as any)?.assetProfile?.sector ?? 'Other',
  history,
  beta: (quote as any).beta ?? null,
});
```

- [ ] **Step 3: Restart server and verify beta is returned**

```bash
# Kill the running server (Ctrl+C), then:
PORT=3008 npm run dev
```

In a separate terminal:
```bash
curl -s http://localhost:3008/api/stock/AAPL | python3 -m json.tool | grep beta
```

Expected output:
```
"beta": 1.2,
```
(exact value will differ; any number or `null` is correct — the key must be present)

- [ ] **Step 4: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts server.ts
git commit -m "feat: add beta to stock quote response and StockData type"
```

---

## Task 2: Update App.tsx prop threading

**Files:**
- Modify: `src/App.tsx:357-365`

- [ ] **Step 1: Replace PerformanceTab props in App.tsx**

Find the `<PerformanceTab ... />` block (around line 357–365) and replace it:

```tsx
{activeTab === 'performance' && (
  <PerformanceTab
    holdings={holdings}
    stockPrices={stockPrices}
    totalStockValue={totalValue}
    totalCostBasis={totalCostBasis}
  />
)}
```

The `holdings` and `stockPrices` variables are already in scope in App.tsx — no new state needed. `priceHistory`, `isPriceHistoryLoading`, and `transactions` remain in App.tsx since they're used elsewhere (KPI header, computeYTDTWR, TransactionsTab).

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: TypeScript will error on `PerformanceTab` because its props interface still expects the old shape. That's expected — it will be resolved in Task 3.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: update App.tsx to pass holdings + stockPrices to PerformanceTab"
```

---

## Task 3: Rewrite PerformanceTab — interface, computations, and stat cards

**Files:**
- Modify: `src/components/tabs/PerformanceTab.tsx` (full rewrite)

This task replaces the entire file with the new scaffold: updated imports, types, all data computations, and the 5 stat cards. The two-column body is left as a placeholder div — filled in Tasks 4 and 5.

- [ ] **Step 1: Replace PerformanceTab.tsx with new scaffold**

```tsx
import { useMemo, useState, ElementType } from 'react';
import {
  ResponsiveContainer, AreaChart, Area,
  PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, TrendingDown, Activity, BarChart3 } from 'lucide-react';
import { Holding, StockData } from '../../types';
import { cn } from '../../lib/utils';
import { usePrivacy, HIDDEN } from '../../contexts/PrivacyContext';
import TickerLogo from '../shared/TickerLogo';

interface Props {
  holdings: Holding[];
  stockPrices: Record<string, StockData>;
  totalStockValue: number;
  totalCostBasis: number;
}

type EnrichedHolding = Holding & {
  price: number;
  marketValue: number;
  costBasis: number;
  gainDollar: number;
  gainPct: number;
  weight: number;
  beta: number | null;
  history: { date: string; price: number }[];
  sector: string;
};

type SortKey = 'gainPct' | 'gainDollar' | 'marketValue' | 'weight';
type SortDir = 'asc' | 'desc';

const SECTOR_COLORS: Record<string, string> = {
  Technology: '#a78bfa',
  Financials: '#60a5fa',
  Healthcare: '#34d399',
  Energy: '#f59e0b',
  'Consumer Cyclical': '#fb7185',
  'Consumer Defensive': '#f97316',
  Industrials: '#f97316',
  'Communication Services': '#22d3ee',
  'Real Estate': '#84cc16',
  Materials: '#a3e635',
  Utilities: '#facc15',
  Other: '#71717a',
};

function sectorColor(name: string): string {
  return SECTOR_COLORS[name] ?? '#71717a';
}

export default function PerformanceTab({
  holdings, stockPrices, totalStockValue, totalCostBasis,
}: Props) {
  const isHidden = usePrivacy();
  const [sortKey, setSortKey] = useState<SortKey>('gainPct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const enriched = useMemo<EnrichedHolding[]>(() => holdings.map((h) => {
    const price = stockPrices[h.ticker]?.price ?? h.averagePrice;
    const marketValue = h.shares * price;
    const costBasis = h.shares * h.averagePrice;
    const gainDollar = marketValue - costBasis;
    const gainPct = costBasis > 0 ? (gainDollar / costBasis) * 100 : 0;
    const weight = totalStockValue > 0 ? (marketValue / totalStockValue) * 100 : 0;
    return {
      ...h,
      price,
      marketValue,
      costBasis,
      gainDollar,
      gainPct,
      weight,
      beta: stockPrices[h.ticker]?.beta ?? null,
      history: stockPrices[h.ticker]?.history ?? [],
      sector: stockPrices[h.ticker]?.sector ?? 'Other',
    };
  }), [holdings, stockPrices, totalStockValue]);

  const simpleReturn = totalCostBasis > 0
    ? ((totalStockValue - totalCostBasis) / totalCostBasis) * 100
    : 0;
  const unrealizedPL = totalStockValue - totalCostBasis;

  const bestPerformer = enriched.length > 0
    ? enriched.reduce((a, b) => (b.gainPct > a.gainPct ? b : a))
    : null;
  const worstPerformer = enriched.length > 0
    ? enriched.reduce((a, b) => (b.gainPct < a.gainPct ? b : a))
    : null;

  const portfolioBeta = useMemo(() => {
    const withBeta = enriched.filter((h) => h.beta != null);
    if (withBeta.length === 0 || totalStockValue === 0) return null;
    return withBeta.reduce((sum, h) => sum + (h.marketValue / totalStockValue) * h.beta!, 0);
  }, [enriched, totalStockValue]);

  const maxAbsGainPct = useMemo(
    () => Math.max(...enriched.map((h) => Math.abs(h.gainPct)), 1),
    [enriched],
  );

  const sorted = useMemo(() => [...enriched].sort((a, b) => {
    const mul = sortDir === 'desc' ? -1 : 1;
    return mul * (a[sortKey] - b[sortKey]);
  }), [enriched, sortKey, sortDir]);

  const topContributors = useMemo(() => {
    const byGain = [...enriched].sort((a, b) => b.gainDollar - a.gainDollar);
    const winners = byGain.filter((h) => h.gainDollar > 0).slice(0, 3);
    const losers = [...byGain].filter((h) => h.gainDollar < 0).slice(-2).reverse();
    const maxAbs = Math.max(
      ...winners.map((h) => h.gainDollar),
      ...losers.map((h) => Math.abs(h.gainDollar)),
      1,
    );
    return { winners, losers, maxAbs };
  }, [enriched]);

  const sectorData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const h of enriched) {
      map[h.sector] = (map[h.sector] ?? 0) + h.marketValue;
    }
    return Object.entries(map)
      .map(([name, value]) => ({
        name,
        value,
        pct: totalStockValue > 0 ? (value / totalStockValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [enriched, totalStockValue]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const fmt$ = (v: number) =>
    `${v >= 0 ? '+' : '−'}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard
          label="Unrealized P/L"
          value={isHidden ? HIDDEN : fmt$(unrealizedPL)}
          sub={isHidden ? `${HIDDEN} cost basis` : `$${totalCostBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cost basis`}
          positive={unrealizedPL >= 0}
          icon={unrealizedPL >= 0 ? TrendingUp : TrendingDown}
        />
        <StatCard
          label="Total Gain"
          value={`${simpleReturn >= 0 ? '+' : ''}${simpleReturn.toFixed(2)}%`}
          sub="vs cost basis"
          positive={simpleReturn >= 0}
          icon={simpleReturn >= 0 ? TrendingUp : TrendingDown}
        />
        <StatCard
          label="Best Performer"
          value={bestPerformer ? `${bestPerformer.gainPct >= 0 ? '+' : ''}${bestPerformer.gainPct.toFixed(1)}%` : '—'}
          sub={bestPerformer?.ticker ?? 'No holdings'}
          positive={bestPerformer ? bestPerformer.gainPct >= 0 : null}
          icon={TrendingUp}
        />
        <StatCard
          label="Worst Performer"
          value={worstPerformer ? `${worstPerformer.gainPct >= 0 ? '+' : ''}${worstPerformer.gainPct.toFixed(1)}%` : '—'}
          sub={worstPerformer?.ticker ?? 'No holdings'}
          positive={worstPerformer ? worstPerformer.gainPct >= 0 : null}
          icon={TrendingDown}
        />
        <StatCard
          label="Portfolio Beta"
          value={portfolioBeta != null ? portfolioBeta.toFixed(2) : '—'}
          sub={portfolioBeta != null ? 'weighted by mkt value' : 'No beta data'}
          positive={null}
          icon={Activity}
        />
      </div>

      {/* ── Two-column body (filled in Tasks 4 & 5) ── */}
      <div className="grid grid-cols-[3fr_2fr] gap-6 items-start">
        {/* Left: holdings table — Task 4 */}
        <div />
        {/* Right: attribution — Task 5 */}
        <div />
      </div>

    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, positive, icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
  positive: boolean | null;
  icon: ElementType;
}) {
  const color = positive === null ? 'text-zinc-500' : positive ? 'text-emerald-400' : 'text-rose-400';
  return (
    <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</div>
        <Icon className={cn('w-4 h-4 shrink-0', color)} />
      </div>
      <div className={cn('text-3xl font-light tracking-tighter', color)}>{value}</div>
      <div className="text-[10px] text-zinc-600 leading-snug">{sub}</div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors. (The two placeholder `<div />` elements in the body are fine.)

- [ ] **Step 3: Verify stat cards render in browser**

Open `http://localhost:3008` → Performance tab. You should see 5 stat cards with real values. If stockPrices haven't loaded yet, the cards will show fallback values from `averagePrice` — that's correct behaviour.

- [ ] **Step 4: Commit**

```bash
git add src/components/tabs/PerformanceTab.tsx
git commit -m "feat: rewrite PerformanceTab scaffold with new props interface and stat cards"
```

---

## Task 4: Add sortable holdings table (left column)

**Files:**
- Modify: `src/components/tabs/PerformanceTab.tsx`

Replace the `{/* Left: holdings table — Task 4 */}` placeholder div with the full table. Also add the `Sparkline`, `HoldingRow`, and `HeaderCell` sub-components at the bottom of the file.

- [ ] **Step 1: Replace left-column placeholder with holdings table**

Replace:
```tsx
        {/* Left: holdings table — Task 4 */}
        <div />
```

With:
```tsx
        {/* Left: holdings table */}
        <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
          <h3 className="text-xl font-bold italic text-white mb-6">Holdings Performance</h3>
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 text-zinc-600 h-40">
              <BarChart3 className="w-6 h-6 opacity-30" />
              <p className="text-sm italic">Add holdings to see performance breakdown.</p>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-[1.4fr_1.8fr_1fr_1fr_0.8fr_80px] gap-3 pb-3 border-b border-zinc-800">
                <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Ticker</div>
                <HeaderCell label="Gain %" sortKey="gainPct" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <HeaderCell label="Unrealized P/L" sortKey="gainDollar" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <HeaderCell label="Mkt Value" sortKey="marketValue" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <HeaderCell label="Weight" sortKey="weight" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">21D</div>
              </div>
              {sorted.map((h) => (
                <HoldingRow key={h.ticker} holding={h} isHidden={isHidden} maxAbsGainPct={maxAbsGainPct} />
              ))}
            </div>
          )}
        </div>
```

- [ ] **Step 2: Add Sparkline, HoldingRow, and HeaderCell sub-components**

Add these after the closing `}` of `StatCard`:

```tsx
function Sparkline({ ticker, history }: { ticker: string; history: { date: string; price: number }[] }) {
  if (history.length < 2) {
    return <div className="h-6 w-full bg-zinc-800 rounded animate-pulse" />;
  }
  const first = history[0].price;
  const last = history[history.length - 1].price;
  const color = last >= first ? '#34d399' : '#f87171';
  const gradId = `spark-${ticker}`;
  return (
    <ResponsiveContainer width="100%" height={24}>
      <AreaChart data={history} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="price"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function HoldingRow({
  holding, isHidden, maxAbsGainPct,
}: {
  holding: EnrichedHolding;
  isHidden: boolean;
  maxAbsGainPct: number;
}) {
  const positive = holding.gainPct >= 0;
  const barWidth = maxAbsGainPct > 0 ? (Math.abs(holding.gainPct) / maxAbsGainPct) * 100 : 0;
  const barColor = positive ? '#34d399' : '#f87171';
  const gainLabel = isHidden
    ? HIDDEN
    : `${holding.gainDollar >= 0 ? '+' : '−'}$${Math.abs(holding.gainDollar).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const valueLabel = isHidden
    ? HIDDEN
    : `$${holding.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="grid grid-cols-[1.4fr_1.8fr_1fr_1fr_0.8fr_80px] gap-3 py-3 border-b border-zinc-800/50 last:border-0 items-center hover:bg-zinc-800/30 -mx-2 px-2 rounded-lg transition-colors">
      <div className="flex items-center gap-2">
        <TickerLogo ticker={holding.ticker} size="sm" />
        <span className="text-sm font-bold text-white">{holding.ticker}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn('text-sm font-bold w-14 flex-shrink-0', positive ? 'text-emerald-400' : 'text-rose-400')}>
          {holding.gainPct >= 0 ? '+' : ''}{holding.gainPct.toFixed(2)}%
        </span>
        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${barWidth}%`, backgroundColor: barColor, opacity: 0.75 }}
          />
        </div>
      </div>
      <div className={cn('text-sm', positive ? 'text-emerald-400' : 'text-rose-400')}>{gainLabel}</div>
      <div className="text-sm text-zinc-400">{valueLabel}</div>
      <div className="text-sm text-zinc-400">{holding.weight.toFixed(1)}%</div>
      <Sparkline ticker={holding.ticker} history={holding.history} />
    </div>
  );
}

function HeaderCell({
  label, sortKey, activeSortKey, sortDir, onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const isActive = sortKey === activeSortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
    >
      {label}
      <span className={isActive ? 'text-zinc-300' : 'text-zinc-700'}>
        {isActive ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
      </span>
    </button>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Verify table in browser**

Open `http://localhost:3008` → Performance tab. You should see:
- Holdings table on the left (right column is still an empty `<div />`)
- Rows sorted by Gain % descending
- Clicking column headers changes sort
- Privacy toggle (eye icon) masks Unrealized P/L and Mkt Value
- 21D sparklines show a tiny area chart per row

- [ ] **Step 5: Commit**

```bash
git add src/components/tabs/PerformanceTab.tsx
git commit -m "feat: add sortable holdings table with gain bar and sparklines to PerformanceTab"
```

---

## Task 5: Add attribution panel (right column)

**Files:**
- Modify: `src/components/tabs/PerformanceTab.tsx`

Replace the right-column placeholder with the two attribution panels, and add the `ContributorRow` sub-component.

- [ ] **Step 1: Replace right-column placeholder with attribution panels**

Replace:
```tsx
        {/* Right: attribution — Task 5 */}
        <div />
```

With:
```tsx
        {/* Right: attribution */}
        <div className="flex flex-col gap-6">

          {/* Top Contributors */}
          <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Top Contributors</div>
            <p className="text-xs text-zinc-600 mb-5">Dollar P/L · top 3 winners & bottom 2 losers</p>
            {topContributors.winners.length === 0 && topContributors.losers.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-zinc-600 text-sm italic">No data</div>
            ) : (
              <div className="flex flex-col gap-1">
                {topContributors.winners.map((h) => (
                  <ContributorRow key={h.ticker} holding={h} maxAbs={topContributors.maxAbs} isWinner={true} isHidden={isHidden} />
                ))}
                {topContributors.losers.length > 0 && (
                  <div className="h-px bg-zinc-800 my-1" />
                )}
                {topContributors.losers.map((h) => (
                  <ContributorRow key={h.ticker} holding={h} maxAbs={topContributors.maxAbs} isWinner={false} isHidden={isHidden} />
                ))}
              </div>
            )}
          </div>

          {/* Sector Breakdown */}
          <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-5">Sector Breakdown</div>
            {sectorData.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-zinc-600 text-sm italic">No data</div>
            ) : (
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <ResponsiveContainer width={90} height={90}>
                    <PieChart>
                      <Pie
                        data={sectorData}
                        dataKey="value"
                        cx="50%"
                        cy="50%"
                        innerRadius={28}
                        outerRadius={44}
                        strokeWidth={0}
                        isAnimationActive={false}
                      >
                        {sectorData.map((entry) => (
                          <Cell key={entry.name} fill={sectorColor(entry.name)} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 min-w-0 pt-1">
                  {sectorData.map((s) => (
                    <div key={s.name} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: sectorColor(s.name) }} />
                      <span className="text-xs text-zinc-400 truncate">{s.name}</span>
                      <span className="text-xs font-bold text-white ml-auto pl-2 flex-shrink-0">{s.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
```

- [ ] **Step 2: Add ContributorRow sub-component**

Add after `HeaderCell`:

```tsx
function ContributorRow({
  holding, maxAbs, isWinner, isHidden,
}: {
  holding: EnrichedHolding;
  maxAbs: number;
  isWinner: boolean;
  isHidden: boolean;
}) {
  const barPct = (Math.abs(holding.gainDollar) / maxAbs) * 46;
  const color = isWinner ? '#34d399' : '#f87171';
  const label = isHidden
    ? HIDDEN
    : `${isWinner ? '+' : '−'}$${Math.abs(holding.gainDollar).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="flex items-center gap-2 h-7">
      <span className="w-10 text-xs font-bold text-white flex-shrink-0">{holding.ticker}</span>
      <div className="flex-1 flex justify-end">
        {!isWinner && (
          <div className="h-3.5 rounded-sm opacity-75" style={{ width: `${barPct}%`, backgroundColor: color }} />
        )}
      </div>
      <div className="w-px h-4 bg-zinc-700 flex-shrink-0" />
      <div className="flex-1">
        {isWinner && (
          <div className="h-3.5 rounded-sm opacity-75" style={{ width: `${barPct}%`, backgroundColor: color }} />
        )}
      </div>
      <span className="w-16 text-right text-xs font-bold flex-shrink-0" style={{ color }}>{label}</span>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Verify attribution panel in browser**

Open `http://localhost:3008` → Performance tab. Check:
- Right column shows "Top Contributors" with diverging bars — winners extend right (green), losers extend left (red)
- Dollar values are privacy-masked when the eye toggle is off
- Sector donut shows coloured segments with legend
- Sector names come from real Yahoo Finance data (Technology, Financials, etc.)

- [ ] **Step 5: Commit**

```bash
git add src/components/tabs/PerformanceTab.tsx
git commit -m "feat: add attribution panel with diverging contributors chart and sector donut"
```

---

## Task 6: End-to-end verification and cleanup

**Files:**
- Modify: `src/components/tabs/PerformanceTab.tsx` (remove any unused imports)

- [ ] **Step 1: Check for unused imports**

The old PerformanceTab imported `format` from `date-fns`, `fetchPriceHistory`, `ComposedChart`, `Bar`, `ReferenceLine`, `ReferenceDot`, `Line`, `Calendar`. The rewrite removed all of these. Verify none remain:

```bash
npm run lint
```

Expected: no "unused import" or "unused variable" warnings.

- [ ] **Step 2: Verify all 5 stat cards show correct values**

In the browser, navigate to the Performance tab with a portfolio that has at least 2 holdings:
- **Unrealized P/L** matches the sum of `(currentPrice − avgPrice) × shares` across all holdings — compare against the Overview tab total gain
- **Total Gain %** is the same percentage shown in the Overview KPI header
- **Best Performer** ticker matches the highest individual gain % in the table
- **Worst Performer** ticker matches the lowest individual gain % in the table
- **Portfolio Beta** shows a decimal number (or `—` if beta data isn't available for any holding)

- [ ] **Step 3: Verify privacy masking**

Toggle the eye icon in the top bar:
- Unrealized P/L card value → `••••`
- Cost basis sub-label → `••••`
- Unrealized P/L column in table → `••••`
- Mkt Value column in table → `••••`
- Contributors bar labels → `••••`
- Gain %, Weight %, Beta, sector names → **unchanged** (these must never be masked)

- [ ] **Step 4: Verify sort behaviour**

Click each column header in the holdings table:
- First click: sorts descending (arrow ↓)
- Second click: sorts ascending (arrow ↑)
- Clicking a different column: resets to descending on that column

- [ ] **Step 5: Commit**

```bash
git add src/components/tabs/PerformanceTab.tsx
git commit -m "chore: verify and clean up PerformanceTab after revamp"
```
