import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

declare global {
  interface Window { TradingView: any; }
}

const TIMEFRAMES = ['1W', '1M', '3M', '1Y', '5Y'] as const;
type Timeframe = typeof TIMEFRAMES[number];

const RANGE_MAP: Record<Timeframe, string> = {
  '1W': '5D',
  '1M': '1M',
  '3M': '3M',
  '1Y': '12M',
  '5Y': '60M',
};

interface Props {
  tvSymbol: string;  // e.g. "NASDAQ:AAPL"
}

let tvScriptLoaded = false;

function loadTVScript(): Promise<void> {
  if (tvScriptLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.onload = () => { tvScriptLoaded = true; resolve(); };
    document.head.appendChild(script);
  });
}

export default function TradingViewChart({ tvSymbol }: Props) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1M');
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    const containerId = 'tv_chart_container';
    loadTVScript().then(() => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = '';
      widgetRef.current = new window.TradingView.widget({
        autosize: true,
        symbol: tvSymbol,
        range: RANGE_MAP[timeframe],
        theme: 'dark',
        style: '1',
        locale: 'en',
        hide_top_toolbar: false,
        hide_side_toolbar: true,
        allow_symbol_change: false,
        save_image: false,
        container_id: containerId,
        toolbar_bg: '#18181b',
        backgroundColor: '#18181b',
        gridColor: '#27272a',
      });
    });
  }, [tvSymbol, timeframe]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Price Chart</span>
        <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={cn(
                'px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all',
                timeframe === tf ? 'bg-white text-zinc-900' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      <div id="tv_chart_container" ref={containerRef} style={{ height: '400px' }} />
    </div>
  );
}
