import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

interface Props {
  onSearch: (ticker: string) => void;
  isLoading: boolean;
}

export default function StockSearchBar({ onSearch, isLoading }: Props) {
  const [value, setValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim() && !isLoading) {
      onSearch(value.trim());
    }
  };

  return (
    <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
      {isLoading
        ? <Loader2 className="w-4 h-4 text-zinc-500 shrink-0 animate-spin" />
        : <Search className="w-4 h-4 text-zinc-500 shrink-0" />
      }
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        onKeyDown={handleKeyDown}
        placeholder="Search ticker — e.g. AAPL, MSFT, NVDA"
        disabled={isLoading}
        className="flex-1 bg-transparent text-white placeholder:text-zinc-600 text-sm font-medium outline-none disabled:opacity-50"
      />
      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Enter</span>
    </div>
  );
}
