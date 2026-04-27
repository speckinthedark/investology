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
    <div className="flex flex-col gap-4">
      <StockSearchBar onSearch={handleSearch} isLoading={status === 'loading'} />

      {status === 'idle' && (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-zinc-600">
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
          <div className="h-[432px] bg-zinc-800/60 rounded-xl" />
          <div className="grid gap-4" style={{ gridTemplateColumns: '5fr 8fr' }}>
            <div className="h-96 bg-zinc-800/60 rounded-xl" />
            <div className="h-96 bg-zinc-800/60 rounded-xl" />
          </div>
        </div>
      )}

      {status === 'success' && detail && (
        <>
          <StockHero detail={detail} />
          <PortfolioCallout holding={holding} currentPrice={detail.price} />
          <TradingViewChart tvSymbol={detail.tvSymbol} />
          <div className="grid gap-4" style={{ gridTemplateColumns: '5fr 8fr' }}>
            <StockStatsTable detail={detail} />
            <FinancialsChart detail={detail} />
          </div>
        </>
      )}
    </div>
  );
}
