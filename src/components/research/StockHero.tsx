import { StockDetail } from '../../types';
import TickerLogo from '../shared/TickerLogo';
import { cn } from '../../lib/utils';

interface Props {
  detail: StockDetail;
}

export default function StockHero({ detail }: Props) {
  const positive = detail.change >= 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <TickerLogo ticker={detail.ticker} size="md" />
        <div>
          <div className="text-base font-bold text-white">{detail.companyName}</div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {detail.exchange && (
              <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">
                {detail.exchange}
              </span>
            )}
            {detail.sector && (
              <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">
                {detail.sector}
              </span>
            )}
            {detail.industry && (
              <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">
                {detail.industry}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="text-3xl font-light tracking-tighter text-white">
          ${detail.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className={cn('text-xs font-bold mt-0.5', positive ? 'text-emerald-400' : 'text-rose-400')}>
          {positive ? '▲' : '▼'} {positive ? '+' : '-'}${Math.abs(detail.change).toFixed(2)} ({positive ? '+' : '-'}{Math.abs(detail.changePercent).toFixed(2)}%) today
        </div>
      </div>
    </div>
  );
}
