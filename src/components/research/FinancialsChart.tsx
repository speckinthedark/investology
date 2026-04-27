import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Cell } from 'recharts';
import { StockDetail, FinancialPeriod } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  detail: StockDetail;
}

type Period = 'annual' | 'quarterly';
type Metric = 'revenue' | 'netIncome' | 'freeCashFlow';

const METRIC_LABELS: Record<Metric, string> = {
  revenue: 'Revenue',
  netIncome: 'Net Income',
  freeCashFlow: 'Free Cash Flow',
};

function fmtBar(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (abs >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

const TooltipContent = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="font-bold text-white mb-1">{label}</div>
      <div className="text-zinc-300">{fmtBar(payload[0].value)}</div>
    </div>
  );
};

export default function FinancialsChart({ detail }: Props) {
  const [period, setPeriod] = useState<Period>('annual');
  const [metric, setMetric] = useState<Metric>('revenue');

  const dataMap: Record<Period, Record<Metric, FinancialPeriod[]>> = {
    annual: {
      revenue:      detail.annualRevenue,
      netIncome:    detail.annualNetIncome,
      freeCashFlow: detail.annualFreeCashFlow,
    },
    quarterly: {
      revenue:      detail.quarterlyRevenue,
      netIncome:    detail.quarterlyNetIncome,
      freeCashFlow: detail.quarterlyFreeCashFlow,
    },
  };

  const data = dataMap[period][metric];
  const hasData = data.length > 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Financials</span>
        <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
          {(['annual', 'quarterly'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all',
                period === p ? 'bg-white text-zinc-900' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {p === 'annual' ? 'Annual' : 'Quarterly'}
            </button>
          ))}
        </div>
      </div>

      {/* Metric tabs */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800">
        {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={cn(
              'px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border transition-all',
              metric === m
                ? 'border-violet-500 text-violet-400 bg-violet-950/30'
                : 'border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600',
            )}
          >
            {METRIC_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="flex-1 px-4 pt-4 pb-3" style={{ minHeight: '260px' }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 700, fill: '#71717a' }}
              />
              <YAxis hide />
              <Tooltip content={<TooltipContent />} cursor={{ fill: '#27272a' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={64}>
                {data.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.value >= 0 ? '#7c3aed' : '#f87171'}
                    fillOpacity={i === data.length - 1 ? 1 : 0.75}
                  />
                ))}
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={fmtBar}
                  style={{ fontSize: 9, fontWeight: 700, fill: '#a1a1aa' }}
                />
              </Bar>
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
