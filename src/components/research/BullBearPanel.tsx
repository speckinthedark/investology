import { StockInsights } from '../../types';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  insights: StockInsights;
}

export default function BullBearPanel({ insights }: Props) {
  const bull = insights.upsell?.bullishSummary;
  const bear = insights.upsell?.bearishSummary;

  if ((!bull || bull.length === 0) && (!bear || bear.length === 0)) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {bull && bull.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Bull Case</span>
            </div>
            <ul className="space-y-2.5">
              {bull.map((point, i) => (
                <li key={i} className="flex gap-2.5 text-xs text-zinc-300 leading-relaxed">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-emerald-500 shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}
        {bear && bear.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <TrendingDown className="w-4 h-4 text-rose-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-400">Bear Case</span>
            </div>
            <ul className="space-y-2.5">
              {bear.map((point, i) => (
                <li key={i} className="flex gap-2.5 text-xs text-zinc-300 leading-relaxed">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-rose-500 shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
