import { useState } from 'react';
import { Holding, EarningsStory, SaveStoryInput } from '../../types';
import TickerLogo from '../shared/TickerLogo';
import TickerStoriesView from '../earnings-prep/TickerStoriesView';

interface Props {
  holdings: Holding[];
  stories: EarningsStory[];
  onSaveStory: (story: SaveStoryInput) => Promise<void>;
  onDeleteStory: (id: string) => Promise<void>;
}

function TickerCard({ ticker, count, dimmed, onClick }: { ticker: string; count: number; dimmed: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors text-center ${dimmed ? 'opacity-50 hover:opacity-75' : ''}`}
    >
      <TickerLogo ticker={ticker} size="md" />
      <div className="font-bold text-white text-sm">{ticker}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
        {count === 0 ? 'No stories yet' : `${count} ${count === 1 ? 'story' : 'stories'}`}
      </div>
    </button>
  );
}

export default function EarningsPrepTab({ holdings, stories, onSaveStory, onDeleteStory }: Props) {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const holdingTickers = new Set(holdings.map((h) => h.ticker));
  const archivedTickers = [...new Set(stories.map((s) => s.ticker))].filter((t) => !holdingTickers.has(t));

  if (selectedTicker) {
    return (
      <TickerStoriesView
        ticker={selectedTicker}
        stories={stories.filter((s) => s.ticker === selectedTicker)}
        canAddStory={holdingTickers.has(selectedTicker)}
        onSave={onSaveStory}
        onDelete={onDeleteStory}
        onBack={() => setSelectedTicker(null)}
      />
    );
  }

  if (holdings.length === 0 && archivedTickers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-2 py-16">
        <div className="text-zinc-400 font-bold">No holdings yet</div>
        <p className="text-sm text-zinc-600 max-w-sm">
          Add holdings via Connections or a manual import to start prepping earnings stories for your portfolio.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {holdings.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {holdings.map((h) => (
            <TickerCard
              key={h.ticker}
              ticker={h.ticker}
              count={stories.filter((s) => s.ticker === h.ticker).length}
              dimmed={false}
              onClick={() => setSelectedTicker(h.ticker)}
            />
          ))}
        </div>
      )}

      {archivedTickers.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Archived</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {archivedTickers.map((ticker) => (
              <TickerCard
                key={ticker}
                ticker={ticker}
                count={stories.filter((s) => s.ticker === ticker).length}
                dimmed
                onClick={() => setSelectedTicker(ticker)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
