# Stock Price Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the TradingView iframe embed with an in-house Recharts area chart powered by `yahoo-finance2`, with a synced volume panel and toggleable MA overlays (21d/50d/200d).

**Architecture:** A new `GET /api/stock/chart/:ticker?range=1M&interval=1d` Express route calls `yahooFinance.chart()` and returns filtered OHLCV data. `StockPriceChart.tsx` fetches lazily per range/interval change, computes MAs client-side, and renders a two-panel Recharts layout (ComposedChart for price + MAs, BarChart for volume) with `syncId` keeping crosshairs in sync.

**Tech Stack:** React 19, TypeScript, Recharts, yahoo-finance2, Express 4, Tailwind v4

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/types.ts` | Modify | Add `ChartQuote`, `StockChartData` types; remove `tvSymbol` from `StockDetail` |
| `src/services/stockService.ts` | Modify | Add `fetchStockChart(ticker, range, interval)` |
| `server.ts` | Modify | Add `GET /api/stock/chart/:ticker` route; remove `tvSymbol` from detail response |
| `src/components/research/StockPriceChart.tsx` | Create | Full chart component: controls, price panel, volume panel, tooltip, MA computation |
| `src/components/research/TradingViewChart.tsx` | Delete | Replaced by StockPriceChart |
| `src/components/tabs/ResearchTab.tsx` | Modify | Swap import + prop (`detail.tvSymbol` → `detail.ticker`) |

---

## Task 1: Add types and service function

**Files:**
- Modify: `src/types.ts`
- Modify: `src/services/stockService.ts`

- [ ] **Step 1: Add `ChartQuote` and `StockChartData` to `src/types.ts`**

Add these two interfaces at the end of the file (after the existing `ScreenerQuote` interface):

```ts
export interface ChartQuote {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface StockChartData {
  quotes: ChartQuote[];
  meta: {
    currency: string;
    regularMarketPrice: number;
    chartPreviousClose: number;
  };
}
```

- [ ] **Step 2: Add `fetchStockChart` to `src/services/stockService.ts`**

Add this import at the top of the file alongside the existing import:

```ts
import { StockData, PriceHistory, StockDetail, StockInsights, ScreenerQuote, StockChartData } from '../types';
```

Then add this function at the end of the file:

```ts
export async function fetchStockChart(ticker: string, range: string, interval: string): Promise<StockChartData> {
  const res = await fetch(
    `/api/stock/chart/${encodeURIComponent(ticker.toUpperCase())}?range=${range}&interval=${interval}`
  );
  if (!res.ok) throw new Error('Failed to fetch chart data');
  return res.json();
}
```

- [ ] **Step 3: Type-check**

```bash
npm run lint
```

Expected: no errors. If `StockChartData` import fails, verify the interface was exported correctly in `types.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/services/stockService.ts
git commit -m "feat: add ChartQuote/StockChartData types and fetchStockChart service"
```

---

## Task 2: Add API route to server.ts

**Files:**
- Modify: `server.ts`

The new route must be registered **before** the catch-all `app.get('/api/stock/:ticker', ...)`. In the current file, the catch-all is preceded by a comment `// NOTE: This catch-all must remain BELOW...` — insert the new route immediately before that comment block.

- [ ] **Step 1: Add the range-days map and route handler to `server.ts`**

Find the comment line `// NOTE: This catch-all must remain BELOW...` (around line 269) and insert the following block immediately **above** it:

```ts
  // --- OHLCV chart data for StockPriceChart ---
  const CHART_RANGE_DAYS: Record<string, number> = {
    '1W': 10,
    '1M': 35,
    '3M': 100,
    '1Y': 370,
    '5Y': 1830,
  };

  app.get('/api/stock/chart/:ticker', async (req, res) => {
    const ticker = (req.params.ticker as string).toUpperCase();
    const range = (req.query.range as string) || '1M';
    const interval = (req.query.interval as string) || '1d';
    const days = CHART_RANGE_DAYS[range] ?? 35;
    const from = new Date(Date.now() - days * 86400000);

    try {
      const chartData = await (yahooFinance as any).chart(ticker, { period1: from, interval });
      const quotes = (chartData?.quotes ?? [])
        .filter((q: any) => q.close != null)
        .map((q: any) => ({
          date: new Date(q.date).toISOString().split('T')[0],
          open: q.open ?? null,
          high: q.high ?? null,
          low: q.low ?? null,
          close: parseFloat((q.close as number).toFixed(2)),
          volume: q.volume ?? null,
        }));

      res.json({
        quotes,
        meta: {
          currency: chartData?.meta?.currency ?? 'USD',
          regularMarketPrice: chartData?.meta?.regularMarketPrice ?? 0,
          chartPreviousClose: chartData?.meta?.chartPreviousClose ?? 0,
        },
      });
    } catch (e) {
      console.error('Chart error:', e);
      res.status(500).json({ error: 'Failed to fetch chart data' });
    }
  });

```

- [ ] **Step 2: Restart the server**

```bash
# Kill the running server then restart
pkill -f "tsx server.ts"; npm run dev
```

- [ ] **Step 3: Smoke-test the route**

```bash
curl "http://localhost:3000/api/stock/chart/AAPL?range=1M&interval=1d" | head -c 300
```

Expected: JSON with `quotes` array (each entry has `date`, `open`, `high`, `low`, `close`, `volume`) and a `meta` object. No `error` field.

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "feat: add GET /api/stock/chart/:ticker route with range and interval params"
```

---

## Task 3: Create StockPriceChart component

**Files:**
- Create: `src/components/research/StockPriceChart.tsx`

- [ ] **Step 1: Create `src/components/research/StockPriceChart.tsx`**

```tsx
import { useState, useEffect } from 'react';
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar,
  Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { cn } from '../../lib/utils';
import { fetchStockChart } from '../../services/stockService';
import { ChartQuote } from '../../types';

type Range = '1W' | '1M' | '3M' | '1Y' | '5Y';
type Interval = '1d' | '1wk';

interface ChartDataPoint extends ChartQuote {
  ma21: number | null;
  ma50: number | null;
  ma200: number | null;
}

interface MADef {
  key: 'ma21' | 'ma50' | 'ma200';
  label: string;
  color: string;
  n: number;
}

const MA_DEFS: MADef[] = [
  { key: 'ma21',  label: 'MA21',  color: '#f59e0b', n: 21  },
  { key: 'ma50',  label: 'MA50',  color: '#22d3ee', n: 50  },
  { key: 'ma200', label: 'MA200', color: '#f87171', n: 200 },
];

const RANGES: Range[] = ['1W', '1M', '3M', '1Y', '5Y'];
const INTERVALS: { label: string; value: Interval }[] = [
  { label: '1D', value: '1d' },
  { label: '1WK', value: '1wk' },
];

function computeMA(closes: (number | null)[], n: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < n - 1) return null;
    const window = closes.slice(i - n + 1, i + 1);
    if (window.some((v) => v == null)) return null;
    return window.reduce((s, v) => s + v!, 0) / n;
  });
}

function fmtVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return `${v}`;
}

function fmtPrice(v: number): string {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtAxis(v: number): string {
  return `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`;
}

function fmtDateLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtXTick(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload: ChartDataPoint }[];
  label?: string;
  showMA21: boolean;
  showMA50: boolean;
  showMA200: boolean;
}

function TooltipContent({ active, payload, label, showMA21, showMA50, showMA200 }: TooltipProps) {
  if (!active || !payload?.length || !label) return null;
  const d = payload[0].payload;
  const anyMA = showMA21 || showMA50 || showMA200;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl min-w-[160px]">
      <div className="font-bold text-white mb-2">{fmtDateLabel(label)}</div>
      <div className="flex flex-col gap-0.5 mb-1">
        {[
          { label: 'Close',  val: d.close  },
          { label: 'Open',   val: d.open   },
          { label: 'High',   val: d.high   },
          { label: 'Low',    val: d.low    },
        ].map(({ label: l, val }) => (
          <div key={l} className="flex justify-between gap-4">
            <span className="text-zinc-400">{l}</span>
            <span className="text-white font-bold">{val != null ? fmtPrice(val) : '—'}</span>
          </div>
        ))}
        <div className="flex justify-between gap-4">
          <span className="text-zinc-400">Volume</span>
          <span className="text-white font-bold">{d.volume != null ? fmtVolume(d.volume) : '—'}</span>
        </div>
      </div>
      {anyMA && (
        <>
          <div className="border-t border-zinc-700 my-1.5" />
          <div className="flex flex-col gap-0.5">
            {showMA21  && d.ma21  != null && <div className="flex justify-between gap-4"><span style={{ color: '#f59e0b' }}>MA21</span><span className="text-white">{fmtPrice(d.ma21)}</span></div>}
            {showMA50  && d.ma50  != null && <div className="flex justify-between gap-4"><span style={{ color: '#22d3ee' }}>MA50</span><span className="text-white">{fmtPrice(d.ma50)}</span></div>}
            {showMA200 && d.ma200 != null && <div className="flex justify-between gap-4"><span style={{ color: '#f87171' }}>MA200</span><span className="text-white">{fmtPrice(d.ma200)}</span></div>}
          </div>
        </>
      )}
    </div>
  );
}

interface Props {
  ticker: string;
}

export default function StockPriceChart({ ticker }: Props) {
  const [range,          setRange]          = useState<Range>('1M');
  const [chartInterval,  setChartInterval]  = useState<Interval>('1d');
  const [showMA21,  setShowMA21]  = useState(false);
  const [showMA50,  setShowMA50]  = useState(false);
  const [showMA200, setShowMA200] = useState(false);
  const [data,    setData]    = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchStockChart(ticker, range, chartInterval)
      .then((result) => {
        if (cancelled) return;
        const closes = result.quotes.map((q) => q.close);
        const ma21   = computeMA(closes, 21);
        const ma50   = computeMA(closes, 50);
        const ma200  = computeMA(closes, 200);
        setData(result.quotes.map((q, i) => ({ ...q, ma21: ma21[i], ma50: ma50[i], ma200: ma200[i] })));
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load chart data');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ticker, range, chartInterval]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col flex-1 min-h-0">

      {/* Controls bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 gap-3 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 shrink-0">Price Chart</span>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Range pills */}
          <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  'px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all',
                  range === r ? 'bg-white text-zinc-900' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Interval pills */}
          <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
            {INTERVALS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setChartInterval(value)}
                className={cn(
                  'px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all',
                  chartInterval === value ? 'bg-white text-zinc-900' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* MA toggles */}
        <div className="flex items-center gap-4">
          {MA_DEFS.map(({ key, label, color }) => {
            const active = key === 'ma21' ? showMA21 : key === 'ma50' ? showMA50 : showMA200;
            const toggle = key === 'ma21' ? setShowMA21 : key === 'ma50' ? setShowMA50 : setShowMA200;
            return (
              <button key={key} onClick={() => toggle(!active)} className="flex items-center gap-1.5 select-none">
                <div
                  className="w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 transition-all"
                  style={active
                    ? { backgroundColor: color, borderColor: color }
                    : { backgroundColor: 'transparent', borderColor: '#52525b' }}
                >
                  {active && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                      <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: active ? color : '#52525b' }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart body */}
      {loading ? (
        <div className="flex-1 min-h-0 animate-pulse bg-zinc-800/60 m-3 rounded-lg" />
      ) : error ? (
        <div className="flex-1 min-h-0 flex items-center justify-center text-zinc-500 text-xs">{error}</div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">

          {/* Price panel — ~72% */}
          <div className="flex-[7] min-h-0 px-2 pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }} syncId="stock-chart">
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#27272a" strokeDasharray="3 6" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#71717a' }}
                  tickFormatter={fmtXTick}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 9, fill: '#52525b' }}
                  tickFormatter={fmtAxis}
                  width={52}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  content={
                    <TooltipContent showMA21={showMA21} showMA50={showMA50} showMA200={showMA200} />
                  }
                  cursor={{ stroke: '#52525b', strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  fill="url(#priceGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#a78bfa', stroke: '#09090b', strokeWidth: 2 }}
                />
                {showMA21 && (
                  <Line type="monotone" dataKey="ma21" stroke="#f59e0b" strokeWidth={1.5}
                    dot={false} activeDot={false} strokeDasharray="5 3" connectNulls={false} />
                )}
                {showMA50 && (
                  <Line type="monotone" dataKey="ma50" stroke="#22d3ee" strokeWidth={1.5}
                    dot={false} activeDot={false} strokeDasharray="5 3" connectNulls={false} />
                )}
                {showMA200 && (
                  <Line type="monotone" dataKey="ma200" stroke="#f87171" strokeWidth={1.5}
                    dot={false} activeDot={false} strokeDasharray="5 3" connectNulls={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Volume panel — ~28% */}
          <div className="flex-[3] min-h-0 px-2 pb-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 4 }} syncId="stock-chart">
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={false} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 8, fill: '#52525b' }}
                  tickFormatter={fmtVolume}
                  width={52}
                />
                <Tooltip content={() => null} cursor={{ fill: '#27272a', fillOpacity: 0.5 }} />
                <Bar dataKey="volume" fill="#7c3aed" fillOpacity={0.35} radius={[2, 2, 0, 0]} maxBarSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>

        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors. Common issues to fix if they appear:
- `Cannot find module '../../types'` → verify `ChartQuote` is exported from `types.ts`
- `Property 'payload' does not exist` → the `TooltipProps` interface already handles this; check the import

- [ ] **Step 3: Commit**

```bash
git add src/components/research/StockPriceChart.tsx
git commit -m "feat: add StockPriceChart component with area line, MA overlays and volume panel"
```

---

## Task 4: Wire into ResearchTab and clean up

**Files:**
- Modify: `src/components/tabs/ResearchTab.tsx`
- Delete: `src/components/research/TradingViewChart.tsx`
- Modify: `src/types.ts` (remove `tvSymbol` from `StockDetail`)
- Modify: `server.ts` (remove `tvSymbol` from detail response)

- [ ] **Step 1: Update the import in `ResearchTab.tsx`**

Replace:

```tsx
import TradingViewChart from '../research/TradingViewChart';
```

With:

```tsx
import StockPriceChart from '../research/StockPriceChart';
```

- [ ] **Step 2: Update the JSX in `ResearchTab.tsx`**

Replace (around line 135):

```tsx
<TradingViewChart tvSymbol={detail.tvSymbol} />
```

With:

```tsx
<StockPriceChart ticker={detail.ticker} />
```

- [ ] **Step 3: Delete `TradingViewChart.tsx`**

```bash
rm src/components/research/TradingViewChart.tsx
```

- [ ] **Step 4: Remove `tvSymbol` from `StockDetail` in `src/types.ts`**

Delete this line from the `StockDetail` interface:

```ts
tvSymbol: string;          // TradingView format, e.g. "NASDAQ:AAPL"
```

- [ ] **Step 5: Remove `tvSymbol` from the detail route in `server.ts`**

In the `res.json({...})` block of `app.get('/api/stock/detail/:ticker', ...)`, remove these two lines:

```ts
      const tvSymbol = exchange ? `${exchange}:${ticker}` : ticker;
```

and from inside the `res.json({...})` call:

```ts
        tvSymbol,
```

- [ ] **Step 6: Type-check**

```bash
npm run lint
```

Expected: no errors. If `tvSymbol` is referenced anywhere else (e.g. other components importing `StockDetail`), remove those references too — grep to check:

```bash
grep -r "tvSymbol" src/
```

Expected: no output.

- [ ] **Step 7: Verify in browser**

Navigate to the app at `http://localhost:3000`, log in, go to the Research tab, search for any ticker (e.g. AAPL). Confirm:
1. Price chart loads with purple area line and volume bars below
2. Range buttons (1W/1M/3M/1Y/5Y) switch data correctly — a loading skeleton appears briefly then new data renders
3. Interval toggle (1D/1WK) refetches and re-renders correctly
4. Toggling MA21/MA50/MA200 shows/hides the dashed overlay lines
5. Hovering the chart shows the custom tooltip with OHLCV values and any active MA values
6. No TradingView script is loaded (check Network tab — no requests to `s3.tradingview.com`)

- [ ] **Step 8: Commit**

```bash
git add src/components/tabs/ResearchTab.tsx src/types.ts server.ts
git commit -m "feat: wire StockPriceChart into ResearchTab, remove TradingViewChart and tvSymbol"
```
