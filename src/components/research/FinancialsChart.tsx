import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LabelList, CartesianGrid, ReferenceLine,
} from 'recharts';
import { StockDetail, FinancialPeriod } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  detail: StockDetail;
}

type Tab = 'income' | 'balanceSheet' | 'cashFlow';
type Period = 'annual' | 'quarterly';

interface MetricDef {
  key: string;
  label: string;
  color: string;
  annualField: keyof StockDetail;
  quarterlyField: keyof StockDetail;
  negate?: boolean;
}

const TAB_METRICS: Record<Tab, MetricDef[]> = {
  income: [
    { key: 'revenue',     label: 'Revenue',      color: '#7c3aed', annualField: 'annualRevenue',    quarterlyField: 'quarterlyRevenue' },
    { key: 'grossProfit', label: 'Gross Profit',  color: '#0ea5e9', annualField: 'annualGrossProfit', quarterlyField: 'quarterlyGrossProfit' },
    { key: 'netIncome',   label: 'Net Income',    color: '#10b981', annualField: 'annualNetIncome',   quarterlyField: 'quarterlyNetIncome' },
  ],
  balanceSheet: [
    { key: 'totalAssets',      label: 'Total Assets',      color: '#10b981', annualField: 'annualTotalAssets',      quarterlyField: 'quarterlyTotalAssets' },
    { key: 'totalLiabilities', label: 'Total Liabilities', color: '#f87171', annualField: 'annualTotalLiabilities', quarterlyField: 'quarterlyTotalLiabilities', negate: true },
    { key: 'netCash',          label: 'Net Cash',          color: '#0ea5e9', annualField: 'annualNetCash',          quarterlyField: 'quarterlyNetCash' },
  ],
  cashFlow: [
    { key: 'freeCashFlow',      label: 'Free Cash Flow', color: '#7c3aed', annualField: 'annualFreeCashFlow',      quarterlyField: 'quarterlyFreeCashFlow' },
    { key: 'operatingCashFlow', label: 'Operating CF',   color: '#10b981', annualField: 'annualOperatingCashFlow', quarterlyField: 'quarterlyOperatingCashFlow' },
    { key: 'investingCashFlow', label: 'Investing CF',   color: '#f59e0b', annualField: 'annualInvestingCashFlow', quarterlyField: 'quarterlyInvestingCashFlow' },
    { key: 'financingCashFlow', label: 'Financing CF',   color: '#0ea5e9', annualField: 'annualFinancingCashFlow', quarterlyField: 'quarterlyFinancingCashFlow' },
  ],
};

const ALL_ANNUAL_COUNTS    = [{ label: '3Y', value: 3 }, { label: '5Y', value: 5 }, { label: '10Y', value: 10 }];
const ALL_QUARTERLY_COUNTS = [{ label: '4Q', value: 4 }, { label: '8Q', value: 8 }, { label: '12Q', value: 12 }];

function fmtAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (abs >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

function fmtLabel(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9)  return `$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `$${(abs / 1e6).toFixed(0)}M`;
  return `$${abs.toLocaleString()}`;
}

const TooltipContent = ({ active, payload, label, metrics }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="font-bold text-white mb-1.5">{label}</div>
      {payload.map((p: any) => {
        const m = (metrics as MetricDef[]).find((m) => m.key === p.dataKey);
        if (!m) return null;
        return (
          <div key={p.dataKey} className="flex items-center gap-2 mb-0.5 last:mb-0">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: m.color }} />
            <span className="text-zinc-400">{m.label}:</span>
            <span className="text-white font-bold">{fmtLabel(p.value)}</span>
          </div>
        );
      })}
    </div>
  );
};

export default function FinancialsChart({ detail }: Props) {
  const [tab, setTab]                     = useState<Tab>('income');
  const [period, setPeriod]               = useState<Period>('annual');
  const [dataCount, setDataCount]         = useState(5);
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(
    new Set([TAB_METRICS.income[0].key]),
  );

  const switchTab = (newTab: Tab) => {
    setTab(newTab);
    setSelectedMetrics(new Set([TAB_METRICS[newTab][0].key]));
  };

  const switchPeriod = (p: Period) => {
    setPeriod(p);
    setDataCount(p === 'annual' ? 5 : 4);
  };

  const toggleMetric = (key: string) => {
    setSelectedMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size === 1) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Compute count options from actual data length so we never show a button that has no effect
  const maxAnnual    = detail.annualRevenue?.length ?? 0;
  const maxQuarterly = detail.quarterlyRevenue?.length ?? 0;
  const maxCount     = period === 'annual' ? maxAnnual : maxQuarterly;
  const suffix       = period === 'annual' ? 'Y' : 'Q';
  const allOpts      = period === 'annual' ? ALL_ANNUAL_COUNTS : ALL_QUARTERLY_COUNTS;
  const countOptions = maxCount > 0
    ? (() => {
        const smaller  = allOpts.filter((o) => o.value < maxCount);
        const exact    = allOpts.find((o) => o.value === maxCount);
        const last     = exact ?? { label: `${maxCount}${suffix}`, value: maxCount };
        return [...smaller, last];
      })()
    : allOpts;
  const validCount = countOptions.some((o) => o.value === dataCount)
    ? dataCount
    : (countOptions.at(-1)?.value ?? maxCount);
  const metrics      = TAB_METRICS[tab];
  const activeMetrics = metrics.filter((m) => selectedMetrics.has(m.key));

  const chartData = useMemo(() => {
    const active = TAB_METRICS[tab].filter((m) => selectedMetrics.has(m.key));
    const metricSeries = active.map((m) => {
      const raw = (detail[period === 'annual' ? m.annualField : m.quarterlyField] as FinancialPeriod[] | undefined) ?? [];
      return { metric: m, data: raw.slice(-validCount) };
    });

    const allLabels = [...new Set(metricSeries.flatMap((s) => s.data.map((d) => d.label)))];

    return allLabels.map((label) => {
      const row: Record<string, any> = { label };
      for (const { metric, data } of metricSeries) {
        const point = data.find((d) => d.label === label);
        if (point != null) {
          row[metric.key] = metric.negate ? -Math.abs(point.value) : point.value;
        }
      }
      return row;
    });
  }, [detail, tab, period, validCount, selectedMetrics]);

  const hasData    = chartData.length > 0;
  const showLabels = activeMetrics.length === 1;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col flex-1 min-h-0">

      {/* Row 1: Tab switcher + Period toggle + Count selector */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 gap-3 flex-wrap">
        <div className="flex items-center bg-zinc-800 rounded-lg p-0.5 overflow-x-auto max-w-full">
          {(['income', 'balanceSheet', 'cashFlow'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={cn(
                'px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap',
                tab === t ? 'bg-white text-zinc-900' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {t === 'income' ? 'Income' : t === 'balanceSheet' ? 'Balance Sheet' : 'Cash Flow'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
            {(['annual', 'quarterly'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => switchPeriod(p)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all',
                  period === p ? 'bg-zinc-600 text-white' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {p === 'annual' ? 'Annual' : 'Quarterly'}
              </button>
            ))}
          </div>
          <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
            {countOptions.map((o) => (
              <button
                key={o.value}
                onClick={() => setDataCount(o.value)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all',
                  validCount === o.value ? 'bg-zinc-600 text-white' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Metric checkboxes */}
      <div className="flex items-center gap-4 flex-wrap px-4 py-2.5 border-b border-zinc-800">
        {metrics.map((m) => {
          const active = selectedMetrics.has(m.key);
          return (
            <button
              key={m.key}
              onClick={() => toggleMetric(m.key)}
              className="flex items-center gap-1.5 select-none"
            >
              <div
                className="w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 transition-all"
                style={active
                  ? { backgroundColor: m.color, borderColor: m.color }
                  : { backgroundColor: 'transparent', borderColor: '#52525b' }
                }
              >
                {active && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                    <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: active ? m.color : '#52525b' }}
              >
                {m.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 px-2 pt-3 pb-3">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: showLabels ? 20 : 8, right: 12, bottom: 0, left: 4 }}
              barGap={2}
              barCategoryGap="25%"
            >
              <CartesianGrid vertical={false} stroke="#27272a" strokeDasharray="3 6" />
              <ReferenceLine y={0} stroke="#3f3f46" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 700, fill: '#71717a' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 9, fill: '#52525b' }}
                tickFormatter={fmtAxis}
                width={56}
              />
              <Tooltip
                content={<TooltipContent metrics={activeMetrics} />}
                cursor={{ fill: '#27272a', fillOpacity: 0.5 }}
              />
              {activeMetrics.map((m) => (
                <Bar key={m.key} dataKey={m.key} fill={m.color} fillOpacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={36}>
                  {showLabels && (
                    <LabelList
                      dataKey={m.key}
                      position="top"
                      formatter={fmtLabel}
                      style={{ fontSize: 9, fontWeight: 700, fill: '#a1a1aa' }}
                    />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-600 text-xs">
            No financial data available
          </div>
        )}
      </div>
    </div>
  );
}
