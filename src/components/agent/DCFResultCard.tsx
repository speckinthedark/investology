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

export default function DCFResultCard({ data }: Props) {
  return (
    <div className="mt-3 bg-zinc-950 border border-zinc-700 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-widest text-emerald-400">DCF Valuation — {data.ticker}</span>
        <span className="text-[10px] text-zinc-600">Current price: ${data.currentPrice.toFixed(2)}</span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-zinc-800">
        {data.scenarios.map((s) => {
          const isPositive = s.upsideDownsidePct >= 0;
          return (
            <div key={s.scenario} className="p-4 flex flex-col gap-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 capitalize">{s.scenario}</div>
              <div className="text-xl font-light tracking-tighter text-white">${s.impliedSharePrice.toFixed(2)}</div>
              <div className={cn('text-xs font-bold', isPositive ? 'text-emerald-400' : 'text-rose-400')}>
                {isPositive ? '+' : ''}{s.upsideDownsidePct.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-5 py-2.5 border-t border-zinc-800 flex gap-4">
        <span className="text-[10px] text-zinc-600">WACC {(data.assumptions.wacc * 100).toFixed(1)}%</span>
        <span className="text-[10px] text-zinc-600">Terminal {(data.assumptions.terminalGrowthRate * 100).toFixed(1)}%</span>
        <span className="text-[10px] text-zinc-600">{data.assumptions.projectionYears}yr projection</span>
      </div>
    </div>
  );
}

export type { DCFResultData };
