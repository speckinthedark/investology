import { useMemo, useState, ElementType } from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
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
    if (withBeta.length === 0) return null;
    const withBetaValue = withBeta.reduce((s, h) => s + h.marketValue, 0);
    if (withBetaValue === 0) return null;
    return withBeta.reduce((sum, h) => sum + (h.marketValue / withBetaValue) * h.beta!, 0);
  }, [enriched]);

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
                <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">History</div>
              </div>
              {sorted.map((h) => (
                <HoldingRow key={h.ticker} holding={h} isHidden={isHidden} maxAbsGainPct={maxAbsGainPct} />
              ))}
            </div>
          )}
        </div>
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
