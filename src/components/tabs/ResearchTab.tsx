import { useState } from 'react';
import { Search } from 'lucide-react';
import { Holding, StockDetail } from '../../types';
import { fetchStockDetail } from '../../services/stockService';
import StockSearchBar from '../research/StockSearchBar';
import StockHero from '../research/StockHero';
import PortfolioCallout from '../research/PortfolioCallout';
import TradingViewChart from '../research/TradingViewChart';
import StockStatsTable from '../research/StockStatsTable';
import FinancialsChart from '../research/FinancialsChart';

interface Props {
  holdings: Holding[];
}

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function ResearchTab({ holdings }: Props) {
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSearch = async (ticker: string) => {
    setStatus('loading');
    setErrorMsg('');
    try {
      const data = await fetchStockDetail(ticker);
      setDetail(data);
      setStatus('success');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Failed to load data. Try again.');
      setStatus('error');
    }
  };

  const holding = detail
    ? holdings.find((h) => h.ticker === detail.ticker)
    : undefined;

  return (
    <div className="h-full flex flex-col p-6 gap-4 min-h-0">
      <div className="shrink-0">
        <StockSearchBar onSearch={handleSearch} isLoading={status === 'loading'} />
      </div>

      {status === 'idle' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-600">
          <Search className="w-8 h-8 opacity-30" />
          <p className="text-sm font-medium">Search any ticker to get started</p>
          <p className="text-xs opacity-60">Try AAPL, MSFT, NVDA, TSLA…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl px-5 py-4 text-sm text-rose-300">
          {errorMsg}
        </div>
      )}

      {status === 'loading' && (
        <div className="flex flex-col gap-4 animate-pulse">
          <div className="h-20 bg-zinc-800/60 rounded-xl" />
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_3fr]">
            <div className="h-[400px] bg-zinc-800/60 rounded-xl" />
            <div className="flex flex-col gap-4 h-[400px]">
              <div className="flex-1 bg-zinc-800/60 rounded-xl" />
              <div className="flex-1 bg-zinc-800/60 rounded-xl" />
            </div>
          </div>
        </div>
      )}

      {status === 'success' && detail && (
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          <div className="shrink-0">
            <StockHero detail={detail} />
          </div>
          {holding && (
            <div className="shrink-0">
              <PortfolioCallout holding={holding} currentPrice={detail.price} />
            </div>
          )}
          {/* Grid fills remaining height; on mobile it scrolls, on desktop it's clamped */}
          <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_3fr] lg:h-full">
              {/* Left: stats table — scrolls internally on desktop */}
              <div className="lg:overflow-y-auto custom-scrollbar">
                <StockStatsTable detail={detail} />
              </div>
              {/* Right: charts — min-h on mobile so they aren't collapsed */}
              <div className="flex flex-col gap-4 min-h-[600px] lg:min-h-0">
                <TradingViewChart tvSymbol={detail.tvSymbol} />
                <FinancialsChart detail={detail} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
