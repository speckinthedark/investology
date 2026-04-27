import { useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
import { ScreenerQuote } from '../../types';
import { fetchScreener } from '../../services/stockService';
import TickerLogo from '../shared/TickerLogo';
import { cn } from '../../lib/utils';

interface Props {
  onSearch: (ticker: string) => void;
}

const SCREENERS = [
  { id: 'day_gainers',               label: 'Day Gainers' },
  { id: 'day_losers',                label: 'Day Losers' },
  { id: 'most_actives',              label: 'Most Active' },
  { id: 'growth_technology_stocks',  label: 'Growth Tech' },
  { id: 'undervalued_growth_stocks', label: 'Undervalued Growth' },
  { id: 'undervalued_large_caps',    label: 'Undervalued Caps' },
];

function fmtPrice(n: number | null) {
  if (n == null) return '—';
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number | null) {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function fmtMktCap(n: number | null) {
  if (n == null) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtVolRatio(vol: number | null, avg: number | null) {
  if (vol == null || avg == null || avg === 0) return '—';
  return `${(vol / avg).toFixed(1)}×`;
}

function fmtPE(n: number | null) {
  if (n == null || n <= 0) return '—';
  return `${n.toFixed(1)}x`;
}

export default function ScreenerView({ onSearch }: Props) {
  const [activeTab, setActiveTab] = useState(SCREENERS[0].id);
  const [cache, setCache] = useState<Record<string, ScreenerQuote[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache[activeTab]) return;
    setLoading(true);
    setError(null);
    fetchScreener(activeTab)
      .then((quotes) => setCache((prev) => ({ ...prev, [activeTab]: quotes })))
      .catch(() => setError('Failed to load screener data.'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const quotes = cache[activeTab] ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Market Screeners</span>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-zinc-800 overflow-x-auto">
          {SCREENERS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'px-4 py-3 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap shrink-0 border-b-2 transition-colors',
                activeTab === id
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex flex-col gap-2 p-4 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-zinc-800/60 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-rose-400">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-800/50 text-[9px] uppercase font-bold tracking-widest text-zinc-500">
                  <th className="px-4 py-3">Ticker</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Day %</th>
                  <th className="px-4 py-3 text-right">52W %</th>
                  <th className="px-4 py-3 text-right">Mkt Cap</th>
                  <th className="px-4 py-3 text-right">Vol / Avg</th>
                  <th className="px-4 py-3 text-right">P/E</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {quotes.map((q) => {
                  const dayUp = (q.regularMarketChangePercent ?? 0) >= 0;
                  const yrUp  = (q.fiftyTwoWeekChangePercent  ?? 0) >= 0;
                  return (
                    <tr
                      key={q.symbol}
                      className="hover:bg-zinc-800/40 transition-colors cursor-pointer group"
                      onClick={() => onSearch(q.symbol)}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <TickerLogo ticker={q.symbol} size="circle" />
                          <div>
                            <div className="text-sm font-black text-white group-hover:text-blue-400 transition-colors">{q.symbol}</div>
                            <div className="text-[10px] text-zinc-500 truncate max-w-[160px]">{q.shortName}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-sm text-white">{fmtPrice(q.regularMarketPrice)}</td>
                      <td className={cn('px-4 py-3.5 text-right font-mono text-sm font-bold', dayUp ? 'text-emerald-400' : 'text-rose-400')}>
                        {fmtPct(q.regularMarketChangePercent)}
                      </td>
                      <td className={cn('px-4 py-3.5 text-right font-mono text-sm', yrUp ? 'text-emerald-400' : 'text-rose-400')}>
                        {fmtPct(q.fiftyTwoWeekChangePercent)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-sm text-zinc-300">{fmtMktCap(q.marketCap)}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-sm text-zinc-300">{fmtVolRatio(q.regularMarketVolume, q.averageDailyVolume3Month)}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-sm text-zinc-300">{fmtPE(q.trailingPE)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
