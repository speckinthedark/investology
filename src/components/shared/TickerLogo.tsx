import { useState, useCallback } from 'react';

const LOGO_SOURCES = (ticker: string) => [
  `https://financialmodelingprep.com/image-stock/${ticker}.png`,
  `https://assets.parqet.com/logos/symbol/${ticker}`,
];

interface Props {
  ticker: string;
  size?: 'sm' | 'md';
}

export default function TickerLogo({ ticker, size = 'sm' }: Props) {
  const [srcIndex, setSrcIndex] = useState(0);
  const sources = LOGO_SOURCES(ticker);
  const onError = useCallback(() => setSrcIndex((i) => i + 1), []);
  const dim = size === 'md' ? 'w-10 h-10 text-xs rounded-lg' : 'w-7 h-7 text-[9px] rounded-md';

  if (srcIndex >= sources.length) {
    return (
      <div className={`${dim} bg-zinc-700 flex items-center justify-center font-black text-zinc-300 shrink-0`}>
        {ticker.slice(0, 2)}
      </div>
    );
  }
  return (
    <img
      key={srcIndex}
      src={sources[srcIndex]}
      alt={ticker}
      onError={onError}
      className={`${dim} object-contain bg-zinc-800 shrink-0`}
    />
  );
}
