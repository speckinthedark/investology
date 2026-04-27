import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Holding, StockDetail, StockInsights } from '../../types';
import { fetchStockDetail, fetchStockInsights } from '../../services/stockService';
import StockSearchBar from '../research/StockSearchBar';
import StockHero from '../research/StockHero';
import PortfolioCallout from '../research/PortfolioCallout';
import TradingViewChart from '../research/TradingViewChart';
import StockStatsTable from '../research/StockStatsTable';
import FinancialsChart from '../research/FinancialsChart';
import InsightsStrip from '../research/InsightsStrip';
import BullBearPanel from '../research/BullBearPanel';
import ScreenerView from '../research/ScreenerView';

interface Props {
  holdings: Holding[];
  initialTicker?: string | null;
  onInitialTickerConsumed?: () => void;
}

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function ResearchTab({ holdings, initialTicker, onInitialTickerConsumed }: Props) {
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [insights, setInsights] = useState<StockInsights | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSearch = async (ticker: string) => {
    setStatus('loading');
    setErrorMsg('');
    setDetail(null);
    setInsights(null);
    try {
      const [detailData, insightsData] = await Promise.allSettled([
        fetchStockDetail(ticker),
        fetchStockInsights(ticker),
      ]);

      if (detailData.status === 'rejected') {
        throw new Error((detailData.reason as Error)?.message ?? 'Failed to load data. Try again.');
      }

      setDetail(detailData.value);
      if (insightsData.status === 'fulfilled') {
        setInsights(insightsData.value);
      } else {
        console.warn('Insights fetch failed (non-critical):', insightsData.reason);
      }
      setStatus('success');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to load data. Try again.');
      setStatus('error');
    }
  };

  useEffect(() => {
    if (initialTicker) {
      handleSearch(initialTicker);
      onInitialTickerConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTicker]);

  const handleBack = () => {
    setDetail(null);
    setInsights(null);
    setStatus('idle');
    setErrorMsg('');
  };

  const holding = detail ? holdings.find((h) => h.ticker === detail.ticker) : undefined;

  return (
    <div className="h-full flex flex-col p-6 gap-4 min-h-0">
      <div className="shrink-0">
        <StockSearchBar onSearch={handleSearch} isLoading={status === 'loading'} />
      </div>

      {status === 'idle' && (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <ScreenerView onSearch={handleSearch} />
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
          <div className="h-10 bg-zinc-800/60 rounded-xl" />
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
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Screeners
            </button>
            <StockHero detail={detail} />
          </div>
          {holding && (
            <div className="shrink-0">
              <PortfolioCallout holding={holding} currentPrice={detail.price} />
            </div>
          )}
          {insights && (
            <div className="shrink-0">
              <InsightsStrip insights={insights} currentPrice={detail.price} />
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_3fr] lg:h-full">
              <div className="lg:overflow-y-auto custom-scrollbar">
                <StockStatsTable detail={detail} insights={insights} />
              </div>
              <div className="flex flex-col gap-4 lg:h-full lg:overflow-y-auto custom-scrollbar">
                <div className="flex flex-col gap-4 min-h-[600px] lg:min-h-full">
                  <TradingViewChart tvSymbol={detail.tvSymbol} />
                  <FinancialsChart detail={detail} />
                </div>
                {insights && <BullBearPanel insights={insights} />}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
