import { useState } from 'react';
import TickerLogo from '../shared/TickerLogo';
import {
  ResponsiveContainer, Treemap, Tooltip, PieChart, Pie, Cell, Sector, LineChart, Line,
} from 'recharts';
import { Download, Trash2, Search, ArrowUpDown, ChevronUp, ChevronDown, PieChart as PieChartIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Holding, StockData, SortConfig } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  holdings: Holding[];
  stockPrices: Record<string, StockData>;
  cashBalance: number;
  totalPortfolioValue: number;
  onDeleteHolding: (ticker: string) => void;
  onSelectAsset: (ticker: string) => void;
}

type TreemapView = 'day' | 'total' | 'invested';

const SECTOR_COLORS = ['#60a5fa', '#818cf8', '#c084fc', '#2dd4bf', '#4ade80', '#a3e635', '#fbbf24', '#f87171', '#94a3b8', '#fb923c', '#e879f9', '#38bdf8'];

const getReturnColor = (change: number) => {
  if (change <= -3)  return '#7f1d1d';
  if (change <= -1.5) return '#b91c1c';
  if (change < 0)    return '#dc2626';
  if (change === 0)  return '#3f3f46';
  if (change <= 1.5) return '#15803d';
  if (change <= 3)   return '#16a34a';
  return '#4ade80';
};

const getInvestedColor = (sharePct: number) => {
  if (sharePct <= 2)  return '#1e3a8a';
  if (sharePct <= 5)  return '#1d4ed8';
  if (sharePct <= 15) return '#2563eb';
  if (sharePct <= 30) return '#3b82f6';
  return '#60a5fa';
};

const TreemapCell = (props: any) => {
  const { x, y, width, height, name, sector, view } = props;
  const change: number = props.change ?? 0;
  if (!name) return null;

  const bg = view === 'invested' ? getInvestedColor(change) : getReturnColor(change);
  const label = view === 'invested'
    ? `${change.toFixed(1)}%`
    : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;

  return (
    <g>
      <rect
        x={x + 1} y={y + 1}
        width={Math.max(0, width - 2)} height={Math.max(0, height - 2)}
        rx={6} ry={6}
        style={{ fill: bg, stroke: '#09090b', strokeWidth: 2 }}
      />
      {width > 40 && height > 36 && (
        <foreignObject x={x} y={y} width={width} height={height}>
          <div className="w-full h-full px-2.5 py-2 flex flex-col justify-between select-none overflow-hidden text-white">
            <div>
              <div className={cn('font-black leading-none tracking-tighter uppercase truncate', width > 80 ? 'text-sm' : 'text-xs')}>
                {name}
              </div>
              {height > 55 && (
                <div className="text-[8px] uppercase font-bold opacity-40 truncate mt-0.5">{sector}</div>
              )}
            </div>
            {height > 44 && (
              <div className="flex justify-end">
                <div className="font-mono text-[9px] font-bold bg-black/25 px-1.5 py-0.5 rounded">
                  {label}
                </div>
              </div>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  );
};

const RETURN_LEGEND = [
  { label: '≤-3%', color: '#7f1d1d' },
  { label: '-1.5', color: '#b91c1c' },
  { label: '<0',   color: '#dc2626' },
  { label: '0',    color: '#3f3f46' },
  { label: '>0',   color: '#15803d' },
  { label: '+1.5', color: '#16a34a' },
  { label: '≥3%',  color: '#4ade80' },
];

const INVESTED_LEGEND = [
  { label: '≤2%',  color: '#1e3a8a' },
  { label: '≤5%',  color: '#1d4ed8' },
  { label: '≤15%', color: '#2563eb' },
  { label: '≤30%', color: '#3b82f6' },
  { label: '>30%', color: '#60a5fa' },
];

export default function OverviewTab({ holdings, stockPrices, cashBalance, totalPortfolioValue, onDeleteHolding, onSelectAsset }: Props) {
  const [treemapView, setTreemapView] = useState<TreemapView>('day');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'marketValue', direction: 'desc' });
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const totalCostBasis = holdings.reduce((acc, h) => acc + (h.shares ?? 0) * (h.averagePrice ?? 0), 0) + cashBalance;

  const treemapData = [
    ...holdings.map((h) => {
      const p = stockPrices[h.ticker];
      const price = p?.price ?? h.averagePrice;
      const avgPrice = h.averagePrice ?? 0;
      const shares = h.shares ?? 0;
      const dayChange = p?.changePercent ?? 0;
      const totalChange = avgPrice > 0 ? ((price - avgPrice) / avgPrice) * 100 : 0;
      const marketValue = shares * price;
      const costBasis = shares * avgPrice;
      const investedShare = totalCostBasis > 0 ? (costBasis / totalCostBasis) * 100 : 0;

      return {
        name: h.ticker,
        value: treemapView === 'invested' ? costBasis : marketValue,
        change: treemapView === 'day' ? dayChange : treemapView === 'total' ? totalChange : investedShare,
        sector: p?.sector ?? 'Other',
        marketValue,
        costBasis,
        investedShare,
        share: totalPortfolioValue > 0 ? (marketValue / totalPortfolioValue) * 100 : 0,
      };
    }),
    ...(cashBalance > 0 ? [{
      name: 'CASH',
      value: cashBalance,
      change: treemapView === 'invested' ? (totalCostBasis > 0 ? (cashBalance / totalCostBasis) * 100 : 0) : 0,
      sector: 'Cash',
      marketValue: cashBalance,
      costBasis: cashBalance,
      investedShare: totalCostBasis > 0 ? (cashBalance / totalCostBasis) * 100 : 0,
      share: totalPortfolioValue > 0 ? (cashBalance / totalPortfolioValue) * 100 : 0,
    }] : []),
  ].sort((a, b) => b.value - a.value);

  const sectorData = holdings.map((h) => {
    const p = stockPrices[h.ticker];
    const price = p?.price ?? h.averagePrice;
    const value = h.shares * price;
    return { name: p?.sector ?? 'Other', value };
  }).concat(cashBalance > 0 ? [{ name: 'Cash', value: cashBalance }] : [])
    .reduce((acc, curr) => {
      const ex = acc.find((s) => s.name === curr.name);
      if (ex) ex.value += curr.value;
      else acc.push({ name: curr.name, value: curr.value });
      return acc;
    }, [] as { name: string; value: number }[])
    .sort((a, b) => b.value - a.value);

  const requestSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const SortIcon = ({ sortKey }: { sortKey: string }) => {
    if (sortConfig.key !== sortKey) return <ArrowUpDown className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-400" /> : <ChevronDown className="w-3 h-3 text-blue-400" />;
  };

  const sortedHoldings = [...holdings].sort((a, b) => {
    const { key, direction } = sortConfig;
    const ap = (h: Holding) => h.averagePrice ?? 0;
    const price = (h: Holding) => stockPrices[h.ticker]?.price ?? ap(h);
    const mv = (h: Holding) => (h.shares ?? 0) * price(h);
    let aVal: any, bVal: any;
    switch (key) {
      case 'ticker':      aVal = a.ticker; bVal = b.ticker; break;
      case 'price':       aVal = price(a); bVal = price(b); break;
      case 'holdings':    aVal = a.shares ?? 0; bVal = b.shares ?? 0; break;
      case 'avgCost':     aVal = ap(a); bVal = ap(b); break;
      case 'marketValue': aVal = mv(a); bVal = mv(b); break;
      case 'gain':        aVal = mv(a) - (a.shares ?? 0) * ap(a); bVal = mv(b) - (b.shares ?? 0) * ap(b); break;
      case 'share':       aVal = mv(a) / totalPortfolioValue; bVal = mv(b) / totalPortfolioValue; break;
      default: return 0;
    }
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const downloadCSV = () => {
    const headers = ['Ticker', 'Sector', 'Shares', 'Avg Cost', 'Value', 'Portfolio Share (%)'];
    const rows = holdings.map((h) => {
      const avgPrice = h.averagePrice ?? 0;
      const price = stockPrices[h.ticker]?.price ?? avgPrice;
      const value = (h.shares ?? 0) * price;
      const share = totalPortfolioValue > 0 ? (value / totalPortfolioValue) * 100 : 0;
      return [h.ticker, stockPrices[h.ticker]?.sector ?? 'Other', h.shares ?? 0, avgPrice.toFixed(2), value.toFixed(2), share.toFixed(2)];
    });
    if (cashBalance > 0) {
      rows.push(['USD', 'Cash', '1', cashBalance.toFixed(2), cashBalance.toFixed(2), totalPortfolioValue > 0 ? ((cashBalance / totalPortfolioValue) * 100).toFixed(2) : '0']);
    }
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `portfolio_${format(new Date(), 'yyyy-MM-dd')}.csv` });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const legend = treemapView === 'invested' ? INVESTED_LEGEND : RETURN_LEGEND;

  const TABS: { id: TreemapView; label: string }[] = [
    { id: 'day',      label: 'Day Δ' },
    { id: 'total',    label: 'Total Δ' },
    { id: 'invested', label: 'Invested' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Treemap */}
      <div className="bg-zinc-900 rounded-xl p-8 border border-zinc-800">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold italic text-white">Asset Allocation</h2>
            {treemapView === 'invested' && (
              <p className="text-xs text-zinc-500 mt-1">Cell size = cost basis · Color = % of total invested</p>
            )}
            {treemapView !== 'invested' && (
              <p className="text-xs text-zinc-500 mt-1">Cell size = current market value · Color = {treemapView === 'day' ? 'day change' : 'total return'}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="flex bg-zinc-800 p-1 rounded-xl">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTreemapView(id)}
                  className={cn(
                    'px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all',
                    treemapView === id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {legend.map((item) => (
                <div key={item.label} className="flex flex-col items-center gap-1">
                  <div className="w-7 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-[8px] font-bold text-zinc-500">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="h-[380px] rounded-lg overflow-hidden border border-zinc-800">
          {treemapData.filter((d) => d.value > 0).length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={treemapData.filter((d) => d.value > 0)}
                dataKey="value"
                aspectRatio={16 / 9}
                stroke="#09090b"
                content={(props: any) => <TreemapCell {...props} view={treemapView} />}
              >
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    if (!d?.name) return null;
                    const dChange: number = d.change ?? 0;
                    const dShare: number = d.share ?? 0;
                    const dValue: number = d.value ?? 0;
                    const dCostBasis: number = d.costBasis ?? 0;
                    const dInvestedShare: number = d.investedShare ?? 0;
                    return (
                      <div className="bg-zinc-900 border border-zinc-700 text-white p-3 rounded-lg shadow-2xl text-xs min-w-[160px]">
                        <div className="flex justify-between gap-6 mb-2">
                          <span className="font-black uppercase">{d.name}</span>
                          <span className="text-zinc-500 uppercase">{d.sector}</span>
                        </div>
                        <div className="space-y-1">
                          {treemapView === 'invested' ? (
                            <>
                              <div className="flex justify-between gap-6">
                                <span className="text-zinc-500 uppercase tracking-widest">Cost Basis</span>
                                <span className="font-mono font-bold">${dCostBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between gap-6">
                                <span className="text-zinc-500 uppercase tracking-widest">Market Val</span>
                                <span className="font-mono font-bold">${d.marketValue?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between gap-6 pt-1 border-t border-zinc-700">
                                <span className="text-zinc-500 uppercase tracking-widest">% Invested</span>
                                <span className="font-mono font-bold text-blue-400">{dInvestedShare.toFixed(2)}%</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex justify-between gap-6">
                                <span className="text-zinc-500 uppercase tracking-widest">Value</span>
                                <span className="font-mono font-bold">${dValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between gap-6">
                                <span className="text-zinc-500 uppercase tracking-widest">Portfolio</span>
                                <span className="font-mono font-bold text-blue-400">{dShare.toFixed(2)}%</span>
                              </div>
                              <div className="flex justify-between gap-6 pt-1 border-t border-zinc-700">
                                <span className="text-zinc-500 uppercase tracking-widest">{treemapView === 'day' ? 'Day Δ' : 'Total Δ'}</span>
                                <span className={cn('font-mono font-bold', dChange >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                  {dChange >= 0 ? '+' : ''}{dChange.toFixed(2)}%
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  }}
                />
              </Treemap>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800/50 text-zinc-500">
              <PieChartIcon className="w-8 h-8 mb-3 opacity-20" />
              <p className="text-xs font-bold uppercase tracking-widest">No Asset Data</p>
              <p className="text-xs mt-1 text-center px-8">Add holdings to see your allocation.</p>
            </div>
          )}
        </div>
      </div>

      {/* Sector Donut */}
      {(() => {
        const filteredSectors = sectorData.filter((d) => d.value > 0);
        return (
          <div className="bg-zinc-900 rounded-xl p-8 border border-zinc-800">
            <h3 className="text-xl font-bold italic text-white">Sector Allocation</h3>
            <p className="text-xs text-zinc-500 mt-0.5 mb-8">Hover a slice to highlight</p>

            {filteredSectors.length > 0 ? (
              <div className="flex flex-col md:flex-row items-center gap-10">
                {/* Donut chart */}
                <div className="relative shrink-0" style={{ width: 300, height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={filteredSectors}
                        cx="50%"
                        cy="50%"
                        innerRadius={98}
                        outerRadius={140}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                        onMouseEnter={(_data: any, index: number) => setActiveIndex(index)}
                        onMouseLeave={() => setActiveIndex(null)}
                        {...({
                          shape: (props: any) => {
                            const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, index } = props;
                            const isActive = index === activeIndex;
                            return (
                              <Sector
                                cx={cx} cy={cy}
                                innerRadius={innerRadius}
                                outerRadius={isActive ? outerRadius + 8 : outerRadius}
                                startAngle={startAngle}
                                endAngle={endAngle}
                                fill={fill}
                              />
                            );
                          },
                        } as any)}
                      >
                        {filteredSectors.map((_, i) => (
                          <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500">Sectors</div>
                    <div className="text-5xl font-light text-white leading-none mt-0.5">{filteredSectors.length}</div>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex-1 w-full min-w-0">
                  {filteredSectors.map((s, i) => {
                    const pct = totalPortfolioValue > 0 ? ((s.value / totalPortfolioValue) * 100).toFixed(1) : '0.0';
                    const isActive = activeIndex === i;
                    const isDimmed = activeIndex !== null && !isActive;
                    return (
                      <div key={s.name}>
                        <div
                          className={cn(
                            'flex items-center justify-between py-3 cursor-default transition-opacity duration-150',
                            isDimmed ? 'opacity-25' : 'opacity-100',
                          )}
                          onMouseEnter={() => setActiveIndex(i)}
                          onMouseLeave={() => setActiveIndex(null)}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] }}
                            />
                            <span className={cn(
                              'text-[10px] font-bold uppercase tracking-widest truncate transition-colors duration-150',
                              isActive ? 'text-white' : 'text-zinc-500',
                            )}>
                              {s.name}
                            </span>
                          </div>
                          <span className={cn(
                            'font-mono text-[11px] font-bold shrink-0 ml-6 transition-colors duration-150',
                            isActive ? 'text-white' : 'text-zinc-500',
                          )}>
                            {pct}%
                          </span>
                        </div>
                        {i < filteredSectors.length - 1 && (
                          <div className="border-b border-dashed border-zinc-800" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 border-2 border-dashed border-zinc-700 rounded-lg text-zinc-600 text-[10px] font-bold uppercase tracking-widest">
                No Data
              </div>
            )}
          </div>
        );
      })()}
      </div>

      {/* Holdings Table */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <div className="px-8 py-6 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-xl font-bold italic text-white">Holdings</h2>
          <div className="flex items-center gap-4">
            <button
              onClick={downloadCSV}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border border-zinc-700"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">{holdings.length} Positions</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-zinc-800/50 text-[10px] uppercase font-bold tracking-widest text-zinc-500">
                {[
                  { key: 'ticker',      label: 'Ticker' },
                  { key: null,          label: 'Sector' },
                  { key: 'price',       label: 'Price' },
                  { key: 'holdings',    label: 'Shares' },
                  { key: 'avgCost',     label: 'Avg Cost' },
                  { key: 'marketValue', label: 'Mkt Value' },
                  { key: 'share',       label: '% Share' },
                  { key: 'gain',        label: 'Gain / Loss' },
                  { key: null,          label: '7D Trend' },
                  { key: null,          label: '' },
                ].map(({ key, label }, i) => (
                  <th
                    key={i}
                    className={cn('px-6 py-4', key && 'cursor-pointer group')}
                    onClick={key ? () => requestSort(key) : undefined}
                  >
                    {key ? (
                      <div className="flex items-center gap-1">{label} <SortIcon sortKey={key} /></div>
                    ) : label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {sortedHoldings.map((h) => {
                const p = stockPrices[h.ticker];
                const avgPrice = h.averagePrice ?? 0;
                const price = p?.price ?? avgPrice;
                const shares = h.shares ?? 0;
                const mv = shares * price;
                const cost = shares * avgPrice;
                const gain = mv - cost;
                const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
                const share = totalPortfolioValue > 0 ? (mv / totalPortfolioValue) * 100 : 0;
                const dayChange = p?.change ?? 0;
                const dayChangePct = p?.changePercent ?? 0;

                return (
                  <tr key={h.ticker} className="hover:bg-zinc-800/40 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <TickerLogo ticker={h.ticker} size="circle" />
                        <div className="font-black text-base tracking-tighter text-white">{h.ticker}</div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">{p?.sector ?? '—'}</span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-mono text-sm text-white">${price.toFixed(2)}</div>
                      {p && (
                        <div className={cn('text-[10px] font-bold', dayChange >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                          {dayChange >= 0 ? '+' : ''}{dayChange.toFixed(2)} ({dayChangePct.toFixed(2)}%)
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-mono text-sm text-white">{shares.toFixed(2)}</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-mono text-sm text-white">${avgPrice.toFixed(2)}</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-mono text-sm font-bold text-white">${mv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-mono text-sm font-bold text-blue-400">{share.toFixed(2)}%</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className={cn('font-mono text-sm font-bold', gain >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                        {gain >= 0 ? '+' : '−'}${Math.abs(gain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className={cn('text-[10px] font-bold', gain >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                        {gain >= 0 ? '+' : ''}{gainPct.toFixed(2)}%
                      </div>
                    </td>
                    <td className="px-6 py-5 w-28">
                      {p?.history && p.history.length > 0 ? (
                        <div className="h-9 w-20">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={p.history}>
                              <Line type="monotone" dataKey="price" stroke={gain >= 0 ? '#34d399' : '#f87171'} strokeWidth={2} dot={false} isAnimationActive={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <span className="text-[10px] text-zinc-600">No data</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => onSelectAsset(h.ticker)} className="p-1.5 text-zinc-600 hover:text-blue-400 transition-colors">
                          <Search className="w-4 h-4" />
                        </button>
                        <button onClick={() => onDeleteHolding(h.ticker)} className="p-1.5 text-zinc-600 hover:text-rose-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {holdings.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-8 py-12 text-center text-zinc-500 italic text-sm">
                    No holdings yet. Add your first transaction to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

