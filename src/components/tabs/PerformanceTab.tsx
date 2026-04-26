import { useMemo, useState, useEffect, ElementType } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, ComposedChart, Bar, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot, Line,
} from 'recharts';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown, Calendar, BarChart3 } from 'lucide-react';
import { Transaction, PriceHistory } from '../../types';
import { cn } from '../../lib/utils';
import { fetchPriceHistory } from '../../services/stockService';

interface Props {
  transactions: Transaction[];
  priceHistory: PriceHistory;
  isPriceHistoryLoading: boolean;
  totalStockValue: number;
  totalCostBasis: number;
}

type Period = '6m' | '1y' | 'all';
type Benchmark = 'SPY' | 'QQQ';

const GRID = '#27272a';
const TICK = '#71717a';

const BENCHMARK_META: Record<Benchmark, { label: string; color: string }> = {
  SPY: { label: 'S&P 500', color: '#f59e0b' },
  QQQ: { label: 'NDX 100', color: '#60a5fa' },
};

function getSharesAt(txs: Transaction[], cutoff: Date): Record<string, number> {
  const shares: Record<string, number> = {};
  for (const tx of txs) {
    if (new Date(tx.timestamp) > cutoff) break;
    const s = tx.shares ?? 0;
    if (tx.type === 'buy')  shares[tx.ticker] = (shares[tx.ticker] ?? 0) + s;
    if (tx.type === 'sell') shares[tx.ticker] = (shares[tx.ticker] ?? 0) - s;
  }
  return shares;
}

const fmt$ = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
};

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

function computeBenchmarkReturns(
  history: { date: string; close: number }[],
  targetMonths: { date: string }[],
): Record<string, number> {
  const byMonth: Record<string, number> = {};
  for (const h of history) {
    byMonth[h.date.slice(0, 7)] = h.close;
  }
  const result: Record<string, number> = {};
  for (const m of targetMonths) {
    const ym = m.date.slice(0, 7);
    const [y, mo] = ym.split('-').map(Number);
    const prevYm = mo === 1
      ? `${y - 1}-12`
      : `${y}-${String(mo - 1).padStart(2, '0')}`;
    const end = byMonth[ym];
    const start = byMonth[prevYm];
    if (end != null && start != null && start > 0) {
      result[ym] = ((end - start) / start) * 100;
    }
  }
  return result;
}

export default function PerformanceTab({
  transactions, priceHistory, isPriceHistoryLoading, totalStockValue, totalCostBasis,
}: Props) {
  const [period, setPeriod] = useState<Period>('1y');
  const [activeBenchmarks, setActiveBenchmarks] = useState<Set<Benchmark>>(new Set());
  const [benchmarkHistory, setBenchmarkHistory] = useState<PriceHistory>({});

  const simpleReturn = totalCostBasis > 0 ? ((totalStockValue - totalCostBasis) / totalCostBasis) * 100 : 0;

  const sortedTxs = useMemo(
    () => [...transactions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [transactions],
  );

  // Reconstruct portfolio value at each month-end using transaction history + Yahoo Finance prices
  const monthlyValues = useMemo(() => {
    const allDates = new Set<string>();
    Object.values(priceHistory).forEach((h) => h.forEach(({ date }) => allDates.add(date)));
    const sorted = Array.from(allDates).sort();
    if (sorted.length === 0) return [];

    return sorted.map((dateStr) => {
      const [y, m] = dateStr.split('-').map(Number);
      const endOfMonth = new Date(y, m, 0, 23, 59, 59);
      const shares = getSharesAt(sortedTxs, endOfMonth);

      let equity = 0;
      for (const [ticker, sharesHeld] of Object.entries(shares)) {
        if (sharesHeld <= 0) continue;
        const point = priceHistory[ticker]?.find((h) => h.date === dateStr);
        if (point) equity += sharesHeld * point.close;
      }

      return {
        date: dateStr,
        label: format(new Date(y, m - 1, 1), "MMM ''yy"),
        value: Math.max(0, equity),
      };
    });
  }, [sortedTxs, priceHistory]);

  // Append current real-time value as the "Now" point
  const chartData = useMemo(() => {
    if (monthlyValues.length === 0) return [];
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const last = monthlyValues[monthlyValues.length - 1];
    const nowPoint = { date: new Date().toISOString().split('T')[0], label: 'Now', value: totalStockValue };
    if (last.date.startsWith(currentMonth)) {
      return [...monthlyValues.slice(0, -1), nowPoint];
    }
    return [...monthlyValues, nowPoint];
  }, [monthlyValues, totalStockValue]);

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

  // Period-filtered data for the area chart
  const periodData = useMemo(() => {
    if (period === 'all' || chartData.length === 0) return chartData;
    const n = period === '6m' ? 7 : 13;
    return chartData.slice(-n);
  }, [chartData, period]);

  const periodReturns = useMemo(() => {
    if (period === 'all' || monthlyReturns.length === 0) return monthlyReturns;
    const n = period === '6m' ? 6 : 12;
    return monthlyReturns.slice(-n);
  }, [monthlyReturns, period]);

  // Fetch SPY + QQQ eagerly so the $10k card and benchmark overlays always have data
  useEffect(() => {
    const toFetch = (['SPY', 'QQQ'] as Benchmark[]).filter((t) => !benchmarkHistory[t]);
    if (toFetch.length === 0 || chartData.length === 0) return;
    const from = chartData[0].date.slice(0, 7) + '-01';
    fetchPriceHistory(toFetch, from).then((data) => {
      setBenchmarkHistory((prev) => ({ ...prev, ...data }));
    });
  }, [chartData]); // eslint-disable-line react-hooks/exhaustive-deps

  const benchmarkMonthlyReturns = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const ticker of ['SPY', 'QQQ'] as Benchmark[]) {
      if (benchmarkHistory[ticker]) {
        result[ticker] = computeBenchmarkReturns(benchmarkHistory[ticker], periodReturns);
      }
    }
    return result;
  }, [benchmarkHistory, periodReturns]);

  const enrichedReturns = useMemo(() => {
    return periodReturns.map((m) => {
      const ym = m.date.slice(0, 7);
      return {
        ...m,
        SPY: benchmarkMonthlyReturns['SPY']?.[ym],
        QQQ: benchmarkMonthlyReturns['QQQ']?.[ym],
      };
    });
  }, [periodReturns, benchmarkMonthlyReturns]);

  // $10k hypothetical: compound $10,000 through each period's monthly returns
  const tenKCard = useMemo(() => {
    if (periodReturns.length === 0) return null;
    const portfolioFinal = periodReturns.reduce(
      (acc, m) => acc * (1 + m.returnPct / 100),
      10_000,
    );
    const compoundBenchmark = (ticker: Benchmark): number | null => {
      const values = periodReturns.map((m) => benchmarkMonthlyReturns[ticker]?.[m.date.slice(0, 7)]);
      if (values.every((r) => r == null)) return null;
      return values.reduce((acc, r) => (r != null ? acc * (1 + r / 100) : acc), 10_000);
    };
    return { portfolioFinal, spyFinal: compoundBenchmark('SPY'), qqqFinal: compoundBenchmark('QQQ') };
  }, [periodReturns, benchmarkMonthlyReturns]);

  // YTD: portfolio value at end of December previous year
  const ytdReturn = useMemo(() => {
    const prevYear = new Date().getFullYear() - 1;
    const dec = chartData.filter((m) => m.date.startsWith(`${prevYear}-12`)).at(-1);
    if (!dec || dec.value === 0) return null;
    return ((totalStockValue - dec.value) / dec.value) * 100;
  }, [chartData, totalStockValue]);

  const bestMonth  = monthlyReturns.length > 0 ? monthlyReturns.reduce((a, b) => (b.returnPct > a.returnPct ? b : a)) : null;
  const worstMonth = monthlyReturns.length > 0 ? monthlyReturns.reduce((a, b) => (b.returnPct < a.returnPct ? b : a)) : null;
  const profitableMonths = monthlyReturns.filter((m) => m.returnPct > 0).length;

  const tooltipBase = {
    contentStyle: {
      background: '#18181b',
      border: '1px solid #27272a',
      borderRadius: '16px',
      boxShadow: '0 10px 30px rgb(0 0 0 / 0.5)',
      padding: '10px 14px',
    },
    labelStyle: { color: '#71717a', fontWeight: 700, fontSize: 11, marginBottom: 4 },
    itemStyle: { color: '#fff', fontWeight: 700, fontSize: 12 },
    cursor: { stroke: '#3f3f46', strokeWidth: 1 },
  };

  const hasHistory = chartData.length > 1;

  const PERIODS: { id: Period; label: string }[] = [
    { id: '6m',  label: '6M' },
    { id: '1y',  label: '1Y' },
    { id: 'all', label: 'All' },
  ];

  const periodLabel = period === '6m' ? '6 Months' : period === '1y' ? '1 Year' : 'All Time';

  const toggleBenchmark = (ticker: Benchmark) => {
    setActiveBenchmarks((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-6">

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Unrealized P/L"
          value={`${simpleReturn >= 0 ? '+' : ''}${simpleReturn.toFixed(2)}%`}
          sub={`$${totalCostBasis.toLocaleString(undefined, { minimumFractionDigits: 2 })} cost basis`}
          positive={simpleReturn >= 0}
          icon={simpleReturn >= 0 ? TrendingUp : TrendingDown}
        />
        <StatCard
          label={`YTD ${new Date().getFullYear()}`}
          value={ytdReturn != null ? `${ytdReturn >= 0 ? '+' : ''}${ytdReturn.toFixed(2)}%` : '—'}
          sub={ytdReturn != null ? `vs Dec ${new Date().getFullYear() - 1} close` : isPriceHistoryLoading ? 'Loading…' : 'Not enough history'}
          positive={ytdReturn == null ? null : ytdReturn >= 0}
          icon={Calendar}
          loading={isPriceHistoryLoading}
        />
        <StatCard
          label="Best Month"
          value={bestMonth ? `+${bestMonth.returnPct.toFixed(2)}%` : '—'}
          sub={bestMonth?.label ?? (isPriceHistoryLoading ? 'Loading…' : 'No data yet')}
          positive={bestMonth ? true : null}
          icon={TrendingUp}
          loading={isPriceHistoryLoading}
        />
        <StatCard
          label="Worst Month"
          value={worstMonth ? `${worstMonth.returnPct.toFixed(2)}%` : '—'}
          sub={worstMonth ? `${profitableMonths}/${monthlyReturns.length} months profitable` : (isPriceHistoryLoading ? 'Loading…' : 'No data yet')}
          positive={worstMonth ? false : null}
          icon={TrendingDown}
          loading={isPriceHistoryLoading}
        />

        {/* $10k hypothetical card — full width */}
        <div className="col-span-2 lg:col-span-4 bg-zinc-900 rounded-[24px] p-6 border border-zinc-800">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-5">
            $10,000 Invested · {periodLabel}
          </div>
          <div className="grid grid-cols-3 divide-x divide-zinc-800">
            <TenKColumn
              label="My Portfolio"
              color="text-violet-400"
              value={tenKCard?.portfolioFinal ?? null}
              loading={isPriceHistoryLoading}
            />
            <TenKColumn
              label="S&P 500"
              color="text-amber-400"
              value={tenKCard?.spyFinal ?? null}
              loading={!benchmarkHistory['SPY'] && chartData.length > 0}
            />
            <TenKColumn
              label="Nasdaq 100"
              color="text-blue-400"
              value={tenKCard?.qqqFinal ?? null}
              loading={!benchmarkHistory['QQQ'] && chartData.length > 0}
            />
          </div>
        </div>
      </div>

      {/* ── Portfolio value area chart ── */}
      <div className="bg-zinc-900 rounded-xl p-8 border border-zinc-800">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold italic text-white">Portfolio Value</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Monthly closing prices · Yahoo Finance</p>
          </div>
          <div className="flex bg-zinc-800 p-1 rounded-xl">
            {PERIODS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setPeriod(id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all',
                  period === id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {isPriceHistoryLoading ? (
          <ChartSkeleton height={240} />
        ) : hasHistory ? (
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={periodData} margin={{ top: 16, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: TICK }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: TICK }}
                  tickFormatter={fmt$}
                  width={52}
                />
                <Tooltip
                  {...tooltipBase}
                  formatter={(v: number) => [`$${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Portfolio Value']}
                />
                {/* Starting value label */}
                {periodData.length > 0 && (
                  <ReferenceDot
                    x={periodData[0].label}
                    y={periodData[0].value}
                    r={0}
                    label={{
                      value: fmt$(periodData[0].value),
                      position: 'top',
                      style: { fontSize: 10, fontWeight: 700, fill: '#a78bfa' },
                    }}
                    ifOverflow="extendDomain"
                  />
                )}
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
                    const hasBuy  = txs.some((tx) => tx.type === 'buy');
                    const hasSell = txs.some((tx) => tx.type === 'sell');
                    if (!hasBuy && !hasSell) return <g />;
                    const both = hasBuy && hasSell;
                    return (
                      <g>
                        {hasBuy  && <circle cx={cx} cy={both ? cy - 8 : cy} r={5} fill="#34d399" stroke="#09090b" strokeWidth={1.5} />}
                        {hasSell && <circle cx={cx} cy={both ? cy + 8 : cy} r={5} fill="#f87171" stroke="#09090b" strokeWidth={1.5} />}
                      </g>
                    );
                  }}
                  activeDot={{ r: 5, fill: '#a78bfa', stroke: '#09090b', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <NoDataMessage height={240} message="Add holdings and refresh prices to load chart data." />
        )}
      </div>

      {/* ── Monthly returns ── */}
      <div className="bg-zinc-900 rounded-xl p-8 border border-zinc-800">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-xl font-bold italic text-white">Monthly Returns</h3>
          <div className="flex items-center gap-2">
            {(['SPY', 'QQQ'] as Benchmark[]).map((ticker) => {
              const meta = BENCHMARK_META[ticker];
              const active = activeBenchmarks.has(ticker);
              return (
                <button
                  key={ticker}
                  onClick={() => toggleBenchmark(ticker)}
                  className={cn(
                    'px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border',
                    active
                      ? ticker === 'SPY'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                        : 'bg-blue-500/15 border-blue-500/40 text-blue-400'
                      : 'bg-transparent border-zinc-700 text-zinc-600 hover:text-zinc-400 hover:border-zinc-600',
                  )}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-xs text-zinc-500 mb-6">Month-over-month change · toggle benchmarks to compare</p>

        {isPriceHistoryLoading ? (
          <ChartSkeleton height={192} />
        ) : periodReturns.length > 0 ? (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={enrichedReturns} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: TICK }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: TICK }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1} />
                <Tooltip
                  {...tooltipBase}
                  formatter={(v: number, name: string) => {
                    const labels: Record<string, string> = { returnPct: 'Portfolio', SPY: 'S&P 500', QQQ: 'NDX 100' };
                    return [`${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, labels[name] ?? name];
                  }}
                />
                <Bar dataKey="returnPct" radius={[3, 3, 3, 3]} maxBarSize={36}>
                  {enrichedReturns.map((d, i) => (
                    <Cell key={i} fill={d.returnPct >= 0 ? '#34d399' : '#f87171'} />
                  ))}
                </Bar>
                {activeBenchmarks.has('SPY') && (
                  <Line
                    type="monotone"
                    dataKey="SPY"
                    stroke={BENCHMARK_META.SPY.color}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3, fill: BENCHMARK_META.SPY.color }}
                    connectNulls={false}
                  />
                )}
                {activeBenchmarks.has('QQQ') && (
                  <Line
                    type="monotone"
                    dataKey="QQQ"
                    stroke={BENCHMARK_META.QQQ.color}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3, fill: BENCHMARK_META.QQQ.color }}
                    connectNulls={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <NoDataMessage height={192} message="Not enough history to compute monthly returns." />
        )}
      </div>

    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, positive, icon: Icon, loading,
}: {
  label: string;
  value: string;
  sub: string;
  positive: boolean | null;
  icon: ElementType;
  loading?: boolean;
}) {
  const color = positive === null ? 'text-zinc-500' : positive ? 'text-emerald-400' : 'text-rose-400';
  return (
    <div className="bg-zinc-900 rounded-[24px] p-6 border border-zinc-800 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</div>
        <Icon className={cn('w-4 h-4 shrink-0', color)} />
      </div>
      {loading ? (
        <div className="h-9 w-24 bg-zinc-800 rounded-lg animate-pulse" />
      ) : (
        <div className={cn('text-3xl font-light tracking-tighter', color)}>{value}</div>
      )}
      <div className="text-[10px] text-zinc-600 leading-snug">{sub}</div>
    </div>
  );
}

function TenKColumn({ label, color, value, loading }: {
  label: string;
  color: string;
  value: number | null;
  loading: boolean;
}) {
  const pct = value != null ? ((value - 10_000) / 10_000) * 100 : null;
  return (
    <div className="flex flex-col gap-2 px-5 first:pl-0 last:pr-0">
      <div className={cn('text-[10px] font-bold uppercase tracking-widest', color)}>{label}</div>
      {loading ? (
        <div className="h-8 w-20 bg-zinc-800 rounded-lg animate-pulse" />
      ) : (
        <div className="text-2xl font-light tracking-tighter text-white">
          {value != null ? fmt$(value) : '—'}
        </div>
      )}
      {!loading && pct != null && (
        <div className={cn('text-xs font-bold', pct >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
        </div>
      )}
    </div>
  );
}

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center gap-3 text-zinc-500" style={{ height }}>
      <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">Loading price history…</span>
    </div>
  );
}

function NoDataMessage({ height, message }: { height: number; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 text-zinc-600" style={{ height }}>
      <BarChart3 className="w-6 h-6 mb-1 opacity-30" />
      <p className="text-sm italic text-center px-4">{message}</p>
    </div>
  );
}
