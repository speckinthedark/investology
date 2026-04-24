import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import { Transaction, TransactionType } from '../types';
import { format } from 'date-fns';

interface Props {
  initialType?: TransactionType;
  editingTransaction?: Transaction | null;
  onSubmit: (
    ticker: string,
    shares: number,
    price: number,
    type: TransactionType,
    date: string,
    id?: string
  ) => Promise<void>;
  onClose: () => void;
}

const TYPE_LABELS: Record<TransactionType, string> = {
  buy: 'BUY',
  sell: 'SELL',
  deposit: 'DEPOSIT CASH',
  withdrawal: 'WITHDRAW CASH',
};

export default function TransactionModal({ initialType = 'buy', editingTransaction, onSubmit, onClose }: Props) {
  const [type, setType] = useState<TransactionType>(editingTransaction?.type ?? initialType);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isCash = type === 'deposit' || type === 'withdrawal';
  const today = format(new Date(), 'yyyy-MM-dd');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setIsSubmitting(true);
    try {
      await onSubmit(
        fd.get('ticker') as string,
        Number(fd.get('shares')),
        Number(fd.get('price')),
        type,
        fd.get('date') as string,
        editingTransaction?.id
      );
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = 'w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/30 font-bold text-sm';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 max-w-md w-full shadow-2xl">
        <h2 className="text-2xl font-black tracking-tighter uppercase italic mb-6 text-white">
          {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as TransactionType)}
                className={inputClass + ' cursor-pointer'}
              >
                {Object.entries(TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val} className="bg-zinc-800">{label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                {isCash ? 'Reference' : 'Ticker Symbol'}
              </label>
              <input
                name="ticker"
                required
                defaultValue={editingTransaction?.ticker ?? (isCash ? 'CASH' : '')}
                placeholder={isCash ? 'CASH' : 'AAPL'}
                className={inputClass + ' uppercase'}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                {isCash ? 'Qty' : 'Shares'}
              </label>
              <input
                name="shares"
                type="number"
                step="any"
                min="0"
                required
                defaultValue={editingTransaction?.shares ?? (isCash ? 1 : '')}
                placeholder="10"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                {isCash ? 'Amount ($)' : 'Price per Share'}
              </label>
              <input
                name="price"
                type="number"
                step="any"
                min="0"
                required
                defaultValue={editingTransaction?.price ?? ''}
                placeholder="150.00"
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Date</label>
            <div className="relative">
              <input
                name="date"
                type="date"
                required
                defaultValue={
                  editingTransaction
                    ? new Date(editingTransaction.timestamp).toISOString().split('T')[0]
                    : today
                }
                className={inputClass}
              />
              <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl font-bold text-zinc-400 hover:bg-zinc-800 transition-all text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-white text-zinc-900 py-3 rounded-xl font-bold hover:bg-zinc-100 transition-all disabled:opacity-50 text-sm"
            >
              {isSubmitting ? 'Saving…' : editingTransaction ? 'Update' : 'Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
