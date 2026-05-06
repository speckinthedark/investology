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
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`;
  if (v >= 10)   return `$${v.toFixed(0)}`;
  if (v >= 1)    return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

function fmtDateLabel(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function XTick({ x = 0, y = 0, payload, range }: { x?: number | string; y?: number | string; payload?: { value: string }; range: Range }) {
  if (!payload) return null;
  const date = new Date(payload.value + 'T00:00:00');
  const longRange = range !== '1W' && range !== '1M';
  const isNewYear = longRange && date.getMonth() === 0;
  const label = isNewYear
    ? date.getFullYear().toString()
    : date.toLocaleDateString(undefined, longRange ? { month: 'short' } : { month: 'short', day: 'numeric' });
  return (
    <text x={x} y={Number(y) + 12} textAnchor="middle" fontSize={10} fontWeight={isNewYear ? 800 : 600} fill={isNewYear ? '#a1a1aa' : '#71717a'}>
      {label}
    </text>
  );
}

function getTicks(data: ChartDataPoint[], range: Range): string[] {
  if (data.length === 0) return [];
  if (range === '1W') return data.map((d) => d.date);
  if (range === '1M') return data.filter((_, i) => i % 5 === 0).map((d) => d.date);
  // 3M / 1Y: first trading day of each month; 5Y: first of each quarter (Jan/Apr/Jul/Oct)
  const seen = new Set<string>();
  return data.filter((d) => {
    const month = new Date(d.date + 'T00:00:00').getMonth();
    if (range === '5Y' && month % 3 !== 0) return false;
    const key = d.date.slice(0, 7);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((d) => d.date);
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
  const [range, setRange]                   = useState<Range>('1Y');
  const [chartInterval, setChartInterval]   = useState<Interval>('1d');
  const [activeMA, setActiveMA] = useState<Record<string, boolean>>({ ma21: true, ma50: true, ma200: true });
  const [data,    setData]                  = useState<ChartDataPoint[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error,   setError]                 = useState<string | null>(null);

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
        const all = result.quotes.map((q, i) => ({ ...q, ma21: ma21[i], ma50: ma50[i], ma200: ma200[i] }));
        setData(all.filter((d) => d.date >= result.rangeStart));
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
            const active = activeMA[key] ?? false;
            const toggle = () => setActiveMA((prev) => ({ ...prev, [key]: !prev[key] }));
            return (
              <button key={key} onClick={toggle} className="flex items-center gap-1.5 select-none">
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
                  <linearGradient id="stockPriceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#27272a" strokeDasharray="3 6" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  ticks={getTicks(data, range)}
                  tick={(props) => <XTick {...props} range={range} />}
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
                    <TooltipContent showMA21={activeMA.ma21} showMA50={activeMA.ma50} showMA200={activeMA.ma200} />
                  }
                  cursor={{ stroke: '#52525b', strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  fill="url(#stockPriceGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#a78bfa', stroke: '#09090b', strokeWidth: 2 }}
                />
                {activeMA.ma21 && (
                  <Line type="monotone" dataKey="ma21" stroke="#f59e0b" strokeWidth={1.5}
                    dot={false} activeDot={false} strokeDasharray="5 3" connectNulls={false} />
                )}
                {activeMA.ma50 && (
                  <Line type="monotone" dataKey="ma50" stroke="#22d3ee" strokeWidth={1.5}
                    dot={false} activeDot={false} strokeDasharray="5 3" connectNulls={false} />
                )}
                {activeMA.ma200 && (
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
