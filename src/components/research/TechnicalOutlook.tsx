import { StockInsights, InsightsOutlook, InsightsDirection } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  insights: StockInsights;
}

const DIRECTION_STYLE: Record<InsightsDirection, { badge: string; dot: string }> = {
  Bullish: { badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-500' },
  Bearish: { badge: 'text-rose-400 bg-rose-500/10 border-rose-500/30',          dot: 'bg-rose-500' },
  Neutral: { badge: 'text-zinc-400 bg-zinc-700/40 border-zinc-600/40',          dot: 'bg-zinc-500' },
};

function OutlookRow({ label, outlook }: { label: string; outlook: InsightsOutlook }) {
  const style = DIRECTION_STYLE[outlook.direction];
  const filled = Math.min(5, Math.max(0, Math.round(outlook.score)));
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="w-24 shrink-0 text-[9px] font-black uppercase tracking-widest text-zinc-500">{label}</div>
      <span className={cn('px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest shrink-0', style.badge)}>
        {outlook.direction}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={cn('w-1.5 h-1.5 rounded-full', i < filled ? style.dot : 'bg-zinc-700')}
          />
        ))}
      </div>
      <span className="text-[10px] text-zinc-500 leading-snug">{outlook.scoreDescription}</span>
    </div>
  );
}

export default function TechnicalOutlook({ insights }: Props) {
  const { technicalEvents, keyTechnicals } = insights;
  if (!technicalEvents && !keyTechnicals) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Technical Outlook</div>
      {technicalEvents?.shortTermOutlook?.stateDescription && (
        <p className="text-[10px] text-zinc-600 mb-4 leading-relaxed">
          {technicalEvents.shortTermOutlook.stateDescription}
        </p>
      )}

      {technicalEvents && (
        <div className="divide-y divide-zinc-800">
          <OutlookRow label="Short Term"    outlook={technicalEvents.shortTermOutlook} />
          <OutlookRow label="Intermediate"  outlook={technicalEvents.intermediateTermOutlook} />
          <OutlookRow label="Long Term"     outlook={technicalEvents.longTermOutlook} />
        </div>
      )}

      {keyTechnicals && (
        <div className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-3 gap-3">
          {[
            { label: 'Support',    value: keyTechnicals.support },
            { label: 'Resistance', value: keyTechnicals.resistance },
            { label: 'Stop Loss',  value: keyTechnicals.stopLoss },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">{label}</div>
              <div className="font-mono text-sm font-bold text-white">
                {value != null ? `$${value.toFixed(2)}` : '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      {technicalEvents && (
        <div className="mt-3 text-[8px] text-zinc-700 uppercase tracking-widest">
          Source: Trading Central
        </div>
      )}
    </div>
  );
}
