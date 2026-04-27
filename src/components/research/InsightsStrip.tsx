import { StockInsights } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  insights: StockInsights;
  currentPrice: number | null;
}

const RATING_STYLE: Record<'BUY' | 'SELL' | 'HOLD', { bg: string; text: string; border: string }> = {
  BUY:  { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/40' },
  SELL: { bg: 'bg-rose-500/15',    text: 'text-rose-400',    border: 'border-rose-500/40' },
  HOLD: { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/40' },
};

export default function InsightsStrip({ insights, currentPrice }: Props) {
  const { recommendation, valuation } = insights;
  if (!recommendation && !valuation) return null;

  const ratingStyle = recommendation ? RATING_STYLE[recommendation.rating] : null;
  const upside =
    recommendation?.targetPrice && currentPrice && currentPrice > 0
      ? ((recommendation.targetPrice - currentPrice) / currentPrice) * 100
      : null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3 flex flex-wrap items-center gap-4">
      {recommendation && ratingStyle && (
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'px-3 py-1 rounded-lg border text-[11px] font-black uppercase tracking-widest',
              ratingStyle.bg, ratingStyle.text, ratingStyle.border,
            )}
          >
            {recommendation.rating}
          </span>
          {recommendation.targetPrice != null && (
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Target</span>
              <span className="text-sm font-bold text-white font-mono">
                ${recommendation.targetPrice.toFixed(2)}
                {upside != null && (
                  <span className={cn('ml-1.5 text-[10px]', upside >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    ({upside >= 0 ? '+' : ''}{upside.toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>
          )}
          <span className="text-[9px] text-zinc-600 uppercase tracking-widest">{recommendation.provider}</span>
        </div>
      )}

      {recommendation && valuation && (
        <div className="w-px h-8 bg-zinc-800 shrink-0" />
      )}

      {valuation && (valuation.description || valuation.discount) && (
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Valuation</span>
            <span className="text-sm font-bold text-white">
              {valuation.description ?? valuation.relativeValue ?? '—'}
              {valuation.discount && (
                <span className="ml-1.5 text-[10px] text-zinc-400 font-normal">{valuation.discount} discount</span>
              )}
            </span>
          </div>
          <span className="text-[9px] text-zinc-600 uppercase tracking-widest">{valuation.provider}</span>
        </div>
      )}
    </div>
  );
}
