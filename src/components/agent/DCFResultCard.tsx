import { BarChart, Bar, Cell, ReferenceLine, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '../../lib/utils';

interface DCFScenario {
  scenario: 'bull' | 'base' | 'bear';
  impliedSharePrice: number;
  upsideDownsidePct: number;
  impliedEV: number;
  terminalValuePV: number;
}

interface DCFResultData {
  ticker: string;
  currentPrice: number;
  scenarios: DCFScenario[];
  assumptions: {
    wacc: number;
    terminalGrowthRate: number;
    projectionYears: number;
  };
}

interface Props {
  data: DCFResultData;
}

function fmt(n: number | undefined | null, decimals = 2): string {
  const v = Number(n);
  return isNaN(v) ? 'N/A' : v.toFixed(decimals);
}

const SCENARIO_ORDER: DCFScenario['scenario'][] = ['bear', 'base', 'bull'];

const COLORS = {
  bear: { bar: '#f43f5e', text: 'text-rose-400' },
  base: { bar: '#a1a1aa', text: 'text-zinc-400' },
  bull: { bar: '#34d399', text: 'text-emerald-400' },
};

interface TooltipPayload {
  payload?: {
    scenario: string;
    impliedPrice: number;
    upside: number;
  };
}

function UpsideTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.[0]?.payload) return null;
  const d = payload[0].payload;
  const isPos = d.upside >= 0;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="font-bold text-white capitalize mb-0.5">{d.scenario}</div>
      <div className="text-zinc-400">${fmt(d.impliedPrice)}</div>
      <div className={isPos ? 'text-emerald-400' : 'text-rose-400'}>
        {isPos ? '+' : ''}{fmt(d.upside, 1)}%
      </div>
    </div>
  );
}

export default function DCFResultCard({ data }: Props) {
  const currentPrice = Number(data.currentPrice);
  const wacc = Number(data.assumptions?.wacc);
  const tgr = Number(data.assumptions?.terminalGrowthRate);
  const waccPct = wacc > 1 ? wacc : wacc * 100;
  const tgrPct = tgr > 1 ? tgr : tgr * 100;

  const scenarios = data.scenarios ?? [];

  // Build chart data ordered bear → base → bull
  const chartData = SCENARIO_ORDER.map((key) => {
    const s = scenarios.find((x) => x.scenario === key);
    return {
      scenario: key,
      impliedPrice: Number(s?.impliedSharePrice ?? 0),
      upside: Number(s?.upsideDownsidePct ?? 0),
    };
  });

  // Y-axis domain: pad 20% beyond the extremes, anchor at 0
  const upsideValues = chartData.map((d) => d.upside);
  const minVal = Math.min(0, ...upsideValues);
  const maxVal = Math.max(0, ...upsideValues);
  const pad = Math.max(Math.abs(maxVal - minVal) * 0.2, 10);
  const yMin = Math.floor(minVal - pad);
  const yMax = Math.ceil(maxVal + pad);

  return (
    <div className="mt-3 bg-zinc-950 border border-zinc-700 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
          DCF Valuation — {data.ticker}
        </span>
        {!isNaN(currentPrice) && currentPrice > 0 && (
          <span className="text-[10px] text-zinc-600">Current price: ${fmt(currentPrice)}</span>
        )}
      </div>

      {/* Scenario stats row */}
      <div className="grid grid-cols-3 divide-x divide-zinc-800">
        {SCENARIO_ORDER.map((key) => {
          const s = scenarios.find((x) => x.scenario === key);
          const price = Number(s?.impliedSharePrice);
          const upside = Number(s?.upsideDownsidePct);
          const isPositive = !isNaN(upside) && upside >= 0;
          return (
            <div key={key} className="p-4 flex flex-col gap-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 capitalize">{key}</div>
              <div className="text-xl font-light tracking-tighter text-white">${fmt(price)}</div>
              <div className={cn('text-xs font-bold', COLORS[key].text)}>
                {isNaN(upside) ? 'N/A' : `${isPositive ? '+' : ''}${fmt(upside, 1)}%`}
              </div>
            </div>
          );
        })}
      </div>

      {/* Upside / downside bar chart */}
      <div className="px-4 pt-3 pb-2 border-t border-zinc-800">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2">
          Implied upside / downside vs current price
        </div>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={chartData} barCategoryGap="35%" margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="scenario"
              tick={{ fill: '#71717a', fontSize: 10, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}%`}
              tick={{ fill: '#52525b', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1} />
            <Tooltip content={<UpsideTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="upside" radius={[4, 4, 0, 0]}>
              {chartData.map((entry) => (
                <Cell key={entry.scenario} fill={COLORS[entry.scenario as DCFScenario['scenario']].bar} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Assumption footer */}
      <div className="px-5 py-2.5 border-t border-zinc-800 flex gap-4">
        {!isNaN(wacc) && <span className="text-[10px] text-zinc-600">WACC {fmt(waccPct, 1)}%</span>}
        {!isNaN(tgr) && <span className="text-[10px] text-zinc-600">Terminal {fmt(tgrPct, 1)}%</span>}
        {data.assumptions?.projectionYears && (
          <span className="text-[10px] text-zinc-600">{data.assumptions.projectionYears}yr projection</span>
        )}
      </div>
    </div>
  );
}

export type { DCFResultData };
