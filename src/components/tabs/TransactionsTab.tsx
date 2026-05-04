import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { Pencil, Trash2, FolderUp, Download, ArrowUpDown, CreditCard, Search, X } from 'lucide-react';
import { Transaction, TransactionType } from '../../types';
import { cn } from '../../lib/utils';
import TickerLogo from '../shared/TickerLogo';
import { usePrivacy, HIDDEN } from '../../contexts/PrivacyContext';

interface Props {
  transactions: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string, ticker: string) => void;
  onAddTrade: () => void;
  onAddCash: () => void;
  onImport: () => void;
  onExport: () => void;
  onClearAll: () => void;
}

type Filter = 'all' | 'buy' | 'sell' | 'cash';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all',  label: 'ALL' },
  { id: 'buy',  label: 'BUY' },
  { id: 'sell', label: 'SELL' },
];

const TYPE_BADGE: Record<TransactionType, { label: string; border: string; text: string }> = {
  buy:        { label: 'BUY',  border: 'border-emerald-500', text: 'text-emerald-400' },
  sell:       { label: 'SELL', border: 'border-rose-500',    text: 'text-rose-400' },
  deposit:    { label: 'DEP',  border: 'border-blue-500',    text: 'text-blue-400' },
  withdrawal: { label: 'W/D',  border: 'border-amber-500',   text: 'text-amber-400' },
};


export default function TransactionsTab({
  transactions, onEdit, onDelete, onAddTrade, onAddCash, onImport, onExport, onClearAll,
}: Props) {
  const isHidden = usePrivacy();
  const [filter, setFilter] = useState<Filter>('all');
  const [tickerSearch, setTickerSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const typeFiltered = [...transactions].filter((tx) => {
    if (filter === 'buy')  return tx.type === 'buy';
    if (filter === 'sell') return tx.type === 'sell';
    if (filter === 'cash') return tx.type === 'deposit' || tx.type === 'withdrawal';
    return true;
  });

  const suggestions = [...new Set(typeFiltered.map((tx) => tx.ticker))]
    .filter((t) => !tickerSearch || t.startsWith(tickerSearch))
    .sort();

  const filtered = typeFiltered
    .filter((tx) => !tickerSearch || tx.ticker.startsWith(tickerSearch))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800">
      {/* Header */}
      <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-bold text-white">Transaction Log</h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Type filter pills */}
          <div className="flex items-center bg-zinc-800 rounded-lg p-0.5 mr-1">
            {FILTERS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all',
                  filter === id ? 'bg-white text-zinc-900' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Ticker search */}
          <div ref={wrapperRef} className="relative">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg w-40">
              <Search className="w-3 h-3 text-zinc-500 shrink-0" />
              <input
                type="text"
                value={tickerSearch}
                placeholder="SEARCH TICKER"
                className="bg-transparent text-[10px] font-bold uppercase tracking-widest text-zinc-300 placeholder:text-zinc-600 outline-none w-full"
                onChange={(e) => setTickerSearch(e.target.value.toUpperCase())}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setTickerSearch('');
                    setShowSuggestions(false);
                  }
                }}
              />
              {tickerSearch && (
                <button
                  onClick={() => { setTickerSearch(''); setShowSuggestions(false); }}
                  className="text-zinc-500 hover:text-zinc-300 shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full mt-1 left-0 w-full bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-10 overflow-hidden">
                {suggestions.map((ticker) => (
                  <button
                    key={ticker}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 transition-colors text-left"
                    onClick={() => {
                      setTickerSearch(ticker);
                      setShowSuggestions(false);
                    }}
                  >
                    <TickerLogo ticker={ticker} />
                    <span className="text-sm font-bold text-white">{ticker}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={onExport}
            disabled={transactions.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button
            onClick={onClearAll}
            disabled={transactions.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-rose-800 text-rose-400 hover:bg-rose-950/40 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Log
          </button>
          <button
            onClick={onImport}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            <FolderUp className="w-3.5 h-3.5" />
            Import
          </button>
          <button
            onClick={onAddTrade}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 text-white hover:bg-zinc-700 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            Trade Asset
          </button>
          <button
            onClick={onAddCash}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            <CreditCard className="w-3.5 h-3.5" />
            Transfer Cash
          </button>
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="overflow-x-auto">
          <div style={{ minWidth: '640px' }}>
          {/* Column headers */}
          <div className="grid grid-cols-[130px_80px_1fr_100px_120px_140px_64px] px-6 py-3 border-b border-zinc-800">
            {['Date', 'Type', 'Asset', 'Shares', 'Price', 'Total', ''].map((h, i) => (
              <div
                key={h || 'actions'}
                className={cn('text-[10px] font-bold uppercase tracking-widest text-zinc-500', i >= 3 && i < 6 ? 'text-right' : '')}
              >
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          {filtered.map((tx, idx) => {
            const badge = TYPE_BADGE[tx.type];
            const isCash = tx.type === 'deposit' || tx.type === 'withdrawal';
            const total = isCash ? (tx.price ?? 0) : (tx.shares ?? 0) * (tx.price ?? 0);

            return (
              <div key={tx.id}>
                <div className="grid grid-cols-[130px_80px_1fr_100px_120px_140px_64px] px-6 py-4 items-center hover:bg-zinc-800/40 transition-colors">
                  {/* Date */}
                  <div className="text-[11px] text-zinc-400 font-mono">
                    {format(new Date(tx.timestamp), 'yyyy-MM-dd')}
                  </div>

                  {/* Type badge */}
                  <div>
                    <span className={cn('px-2 py-0.5 rounded border text-[10px] font-black tracking-widest', badge.border, badge.text)}>
                      {badge.label}
                    </span>
                  </div>

                  {/* Asset */}
                  <div className="flex items-center gap-2.5">
                    <TickerLogo ticker={tx.ticker} />
                    <span className="text-sm font-bold text-white tracking-tight">{tx.ticker}</span>
                  </div>

                  {/* Shares */}
                  <div className="text-right text-sm font-mono text-zinc-300">
                    {isCash ? '–' : isHidden ? HIDDEN : (tx.shares ?? 0).toLocaleString()}
                  </div>

                  {/* Price */}
                  <div className="text-right text-sm font-mono text-zinc-300">
                    {isCash ? '–' : `$${(tx.price ?? 0).toFixed(2)}`}
                  </div>

                  {/* Total */}
                  <div className="text-right text-sm font-mono font-bold text-white">
                    {isHidden ? HIDDEN : `$${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(tx)}
                      className="p-1 text-zinc-500 hover:text-blue-400 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(tx.id!, tx.ticker)}
                      className="p-1 text-zinc-500 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {idx < filtered.length - 1 && (
                  <div className="border-b border-zinc-800/60 mx-6" />
                )}
              </div>
            );
          })}
          </div>
        </div>
      ) : (
        <div className="text-center py-16 text-zinc-500 italic text-sm">
          No transactions found.
        </div>
      )}
    </div>
  );
}
