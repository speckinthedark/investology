import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { Transaction, StockData } from '../types';
import { cn } from '../lib/utils';

interface Props {
  ticker: string;
  stockData?: StockData;
  transactions: Transaction[];
  onClose: () => void;
}

export default function AssetDetailPanel({ ticker, stockData, transactions, onClose }: Props) {
  const assetTxs = transactions.filter((tx) => tx.ticker === ticker);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-end"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 220 }}
          className="bg-zinc-900 border-l border-zinc-800 h-full w-full max-w-md shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-8 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-black tracking-tighter text-white">{ticker}</h2>
              <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mt-0.5">
                {stockData?.sector || 'Asset Details'}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">
              Transaction History
            </h3>
            <div className="space-y-3">
              {assetTxs.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-4 rounded-2xl bg-zinc-800 border border-zinc-700"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center font-bold text-[10px] uppercase',
                        tx.type === 'buy'
                          ? 'bg-emerald-900/50 text-emerald-400'
                          : 'bg-rose-900/50 text-rose-400'
                      )}
                    >
                      {tx.type}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">{tx.shares} shares</div>
                      <div className="text-[10px] text-zinc-500 uppercase font-bold">
                        {format(new Date(tx.timestamp), 'MMM d, yyyy')}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-sm text-white">${(tx.price ?? 0).toFixed(2)}</div>
                    <div className="text-[10px] text-zinc-500 uppercase font-bold">per share</div>
                  </div>
                </div>
              ))}
              {assetTxs.length === 0 && (
                <p className="text-center text-zinc-500 italic py-8 text-sm">No transactions found.</p>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
