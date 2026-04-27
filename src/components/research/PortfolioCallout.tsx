import { Holding } from '../../types';
import { cn } from '../../lib/utils';
import { usePrivacy, HIDDEN } from '../../contexts/PrivacyContext';

interface Props {
  holding: Holding | undefined;
  currentPrice: number;
}

export default function PortfolioCallout({ holding, currentPrice }: Props) {
  const isHidden = usePrivacy();
  if (!holding) return null;

  const currentValue = holding.shares * currentPrice;
  const costBasis = holding.shares * holding.averagePrice;
  const gain = currentValue - costBasis;
  const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
  const positive = gain >= 0;

  return (
    <div className="bg-indigo-950/40 border border-indigo-800/50 rounded-xl px-5 py-3 flex items-center gap-3">
      <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
      <div className="text-xs text-indigo-300 flex-1">
        <span className="font-bold text-indigo-200">You hold {isHidden ? HIDDEN : holding.shares.toLocaleString()} shares</span>
        {' · '}avg. cost ${holding.averagePrice.toFixed(2)}
        {' · '}current value {isHidden ? HIDDEN : `$${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      </div>
      <div className={cn('text-xs font-bold shrink-0', positive ? 'text-emerald-400' : 'text-rose-400')}>
        {isHidden ? HIDDEN : `${positive ? '+' : ''}$${Math.abs(gain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        {' '}({positive ? '+' : ''}{gainPct.toFixed(2)}%)
      </div>
    </div>
  );
}
