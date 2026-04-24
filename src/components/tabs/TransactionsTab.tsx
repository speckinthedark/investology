import { format } from 'date-fns';
import { Pencil, Trash2, FolderUp, Download, Eraser } from 'lucide-react';
import { Transaction, TransactionType } from '../../types';
import { cn } from '../../lib/utils';

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

const TYPE_BADGE: Record<TransactionType, { label: string; classes: string }> = {
  buy:        { label: 'BUY',  classes: 'bg-emerald-900/50 text-emerald-400' },
  sell:       { label: 'SELL', classes: 'bg-rose-900/50 text-rose-400' },
  deposit:    { label: 'DEP',  classes: 'bg-blue-900/50 text-blue-400' },
  withdrawal: { label: 'W/D',  classes: 'bg-amber-900/50 text-amber-400' },
};

export default function TransactionsTab({ transactions, onEdit, onDelete, onAddTrade, onAddCash, onImport, onExport, onClearAll }: Props) {
  return (
    <div className="bg-zinc-900 rounded-[32px] p-8 border border-zinc-800 min-h-[500px]">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xl font-bold italic text-white">Transaction Log</h3>
        <div className="flex gap-2">
          <button
            onClick={onExport}
            disabled={transactions.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button
            onClick={onClearAll}
            disabled={transactions.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 bg-rose-950/40 text-rose-400 border border-rose-900/50 hover:bg-rose-950 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Eraser className="w-3.5 h-3.5" />
            Clear Log
          </button>
          <button
            onClick={onImport}
            className="flex items-center gap-1.5 px-4 py-2 bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            <FolderUp className="w-3.5 h-3.5" />
            Import
          </button>
          <button
            onClick={onAddTrade}
            className="px-4 py-2 bg-white text-zinc-900 hover:bg-zinc-100 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            Trade Asset
          </button>
          <button
            onClick={onAddCash}
            className="px-4 py-2 bg-blue-950/50 text-blue-400 border border-blue-900/50 hover:bg-blue-950 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            Transfer Cash
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {transactions.map((tx) => {
          const badge = TYPE_BADGE[tx.type];
          const isCash = tx.type === 'deposit' || tx.type === 'withdrawal';
          return (
            <div
              key={tx.id}
              className="flex items-center justify-between p-4 rounded-2xl bg-zinc-800 border border-zinc-700 group hover:border-zinc-600 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className={cn('w-11 h-11 rounded-full flex items-center justify-center font-bold text-[10px] uppercase shrink-0', badge.classes)}>
                  {badge.label}
                </div>
                <div>
                  <div className="font-black tracking-tighter text-base text-white">{tx.ticker}</div>
                  <div className="text-[10px] text-zinc-500 font-bold uppercase">
                    {format(new Date(tx.timestamp), 'MMM d, yyyy · HH:mm')}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="font-mono text-sm font-bold text-white">
                    {isCash
                      ? `$${(tx.price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      : `${tx.shares} shares`}
                  </div>
                  {!isCash && (
                    <div className="text-[10px] text-zinc-500 font-bold uppercase">@ ${(tx.price ?? 0).toFixed(2)}</div>
                  )}
                  {isCash && (
                    <div className="text-[10px] text-zinc-500 font-bold uppercase">Cash Transfer</div>
                  )}
                </div>

                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEdit(tx)}
                    className="p-1.5 text-zinc-500 hover:text-blue-400 transition-colors bg-zinc-700 rounded-lg border border-zinc-600"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(tx.id!, tx.ticker)}
                    className="p-1.5 text-zinc-500 hover:text-rose-400 transition-colors bg-zinc-700 rounded-lg border border-zinc-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {transactions.length === 0 && (
          <div className="text-center py-16 text-zinc-500 italic text-sm">
            No activity yet. Your transaction log is empty.
          </div>
        )}
      </div>
    </div>
  );
}
