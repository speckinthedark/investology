import { useState, useRef, useMemo, ReactNode, DragEvent, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, CheckCircle2, AlertTriangle, Loader2, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { Transaction } from '../types';
import { format } from 'date-fns';

type Broker = 'stockpulse';

type PreviewTx = Omit<Transaction, 'id'> & { selected: boolean };

type UploadState = 'idle' | 'uploading' | 'preview' | 'saving' | 'cash-entry' | 'done' | 'error';

export default function ImportGuidePanel({
  onClose,
  onImportTransactions,
  onSetCash,
  existingHoldings = [],
}: {
  onClose: () => void;
  onImportTransactions: (txs: Omit<Transaction, 'id'>[]) => Promise<void>;
  onSetCash: (amount: number) => Promise<void>;
  existingHoldings?: Array<{ ticker: string; shares: number; averagePrice: number }>;
}) {
  const [broker] = useState<Broker>('stockpulse');
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [preview, setPreview] = useState<PreviewTx[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [cashInput, setCashInput] = useState('');
  const [savingCash, setSavingCash] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseStockPulseCSV = (text: string): Omit<Transaction, 'id'>[] => {
    const lines = text.replace(/^﻿/, '').trim().split('\n');
    return lines.slice(1).flatMap((line) => {
      const [timestamp, type, ticker, shares, price] = line.split(',');
      const trimmedType = type?.trim();
      if (trimmedType !== 'buy' && trimmedType !== 'sell') return [];
      const s = parseFloat(shares);
      const p = parseFloat(price);
      if (isNaN(s) || isNaN(p) || !ticker?.trim() || !timestamp?.trim()) return [];
      return [{ timestamp: timestamp.trim(), type: trimmedType, ticker: ticker.trim().toUpperCase(), shares: s, price: p }];
    });
  };

  const handleFile = async (file: File) => {
    setUploadState('uploading');
    setErrorMsg('');
    try {
      if (!file.name.endsWith('.csv')) {
        throw new Error('Please upload a CSV file exported from StockPulse.');
      }
      const text = await file.text();
      const txs = parseStockPulseCSV(text);
      if (txs.length === 0) throw new Error('No valid transactions found. Make sure this is a StockPulse export file.');
      setPreview(txs.map((tx) => ({ ...tx, selected: true })));
      setUploadState('preview');
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to parse file');
      setUploadState('error');
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const toggleAll = (selected: boolean) => setPreview((p) => p.map((tx) => ({ ...tx, selected })));
  const toggleRow = (i: number) => setPreview((p) => p.map((tx, j) => (j === i ? { ...tx, selected: !tx.selected } : tx)));

  const selectedCount = preview.filter((tx) => tx.selected).length;

  const holdingsSummary = useMemo(() => {
    // Seed from existing holdings so the preview shows the combined result
    const positions: Record<string, { shares: number; totalCost: number }> = {};
    for (const h of existingHoldings.filter((h) => h.ticker !== 'CASH')) {
      positions[h.ticker] = { shares: h.shares, totalCost: h.shares * h.averagePrice };
    }
    const selected = preview.filter((tx) => tx.selected);
    for (const tx of selected) {
      if (tx.type === 'buy') {
        if (!positions[tx.ticker]) positions[tx.ticker] = { shares: 0, totalCost: 0 };
        positions[tx.ticker].shares += tx.shares;
        positions[tx.ticker].totalCost += tx.shares * tx.price;
      } else if (tx.type === 'sell') {
        if (!positions[tx.ticker]) positions[tx.ticker] = { shares: 0, totalCost: 0 };
        positions[tx.ticker].shares -= tx.shares;
      }
    }
    const open = Object.entries(positions)
      .filter(([, v]) => v.shares > 0.0001)
      .map(([ticker, v]) => ({ ticker, shares: v.shares, avgCost: v.totalCost / v.shares }))
      .sort((a, b) => b.shares * b.avgCost - a.shares * a.avgCost);
    const negative = Object.entries(positions)
      .filter(([, v]) => v.shares < -0.0001)
      .map(([ticker, v]) => ({ ticker, shares: v.shares }));
    const closedCount = Object.values(positions).filter((v) => Math.abs(v.shares) <= 0.0001).length;
    return { open, negative, closedCount };
  }, [preview, existingHoldings]);

  const handleConfirm = async () => {
    setUploadState('saving');
    const toSave = preview.filter((tx) => tx.selected).map(({ selected: _, ...tx }) => tx);
    await onImportTransactions(toSave);
    setUploadState('cash-entry');
  };

  const handleSaveCash = async () => {
    const amount = parseFloat(cashInput);
    if (!isNaN(amount) && amount >= 0) {
      setSavingCash(true);
      await onSetCash(amount);
      setSavingCash(false);
    }
    setUploadState('done');
  };

  const reset = () => {
    setUploadState('idle');
    setPreview([]);
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const TYPE_BADGE: Record<string, string> = {
    buy: 'bg-emerald-900/50 text-emerald-400',
    sell: 'bg-rose-900/50 text-rose-400',
    deposit: 'bg-blue-900/50 text-blue-400',
    withdrawal: 'bg-amber-900/50 text-amber-400',
  };
  const TYPE_LABEL: Record<string, string> = { buy: 'BUY', sell: 'SELL', deposit: 'DEP', withdrawal: 'W/D' };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-end"
        onClick={uploadState === 'saving' || uploadState === 'cash-entry' ? undefined : onClose}
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 220 }}
          className="bg-zinc-900 border-l border-zinc-800 h-full w-full max-w-[620px] shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-8 py-7 border-b border-zinc-800 flex items-start justify-between shrink-0">
            <div>
              <h2 className="text-2xl font-black tracking-tighter text-white">Import Trade History</h2>
              <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed max-w-sm">
                Follow the steps below to export your full trade history from your broker, then upload it here.
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={uploadState === 'saving' || uploadState === 'cash-entry'}
              className="p-2 bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors mt-1 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-6 space-y-5">
            <Callout type="info" icon={<CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}>
              Re-import a CSV you previously exported from StockPulse. All transaction types are preserved — buys, sells, deposits, and withdrawals.
            </Callout>
            <Callout type="warn" icon={<AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}>
              Importing a backup into an account that already has transactions will <strong>duplicate</strong> them. Use this on a fresh account or after clearing your existing transaction log.
            </Callout>
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <div className="px-5 py-4">
                <p className="text-xs font-bold text-zinc-300 mb-1">CSV format</p>
                <pre className="text-[11px] text-emerald-400 font-mono leading-relaxed">
{`date,type,ticker,shares,price
2024-03-09T10:22:00.000Z,buy,AAPL,5,172.30
2024-03-09T10:22:00.000Z,deposit,CASH,1,1000.00`}
                </pre>
              </div>
            </div>
          </div>

          {/* Upload zone / preview footer */}
          <div className="px-8 py-6 border-t border-zinc-800 shrink-0">

            {/* Upload — idle state */}
            {uploadState === 'idle' && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 text-center cursor-pointer transition-all',
                  isDragOver ? 'border-white/40 bg-zinc-800' : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/40',
                )}
              >
                <Upload className="w-6 h-6 text-zinc-400" />
                <p className="text-sm font-bold text-zinc-300">Drop your StockPulse backup here</p>
                <p className="text-[11px] text-zinc-500">or click to browse · CSV</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleInputChange}
                />
              </div>
            )}

            {uploadState === 'uploading' && (
              <div className="border-2 border-dashed border-zinc-700 rounded-lg p-6 flex flex-col items-center gap-3 text-center">
                <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
                <p className="text-sm font-bold text-zinc-400">Parsing your statement…</p>
              </div>
            )}

            {uploadState === 'error' && (
              <div className="space-y-3">
                <div className="border-2 border-rose-800/60 bg-rose-950/20 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-300 leading-relaxed">{errorMsg}</p>
                </div>
                <button onClick={reset} className="w-full px-4 py-2.5 bg-zinc-800 text-zinc-300 rounded-xl text-xs font-bold hover:bg-zinc-700 transition-colors">
                  Try again
                </button>
              </div>
            )}

            {uploadState === 'preview' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-300">
                    {preview.length} transactions found · {selectedCount} selected
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => toggleAll(true)} className="text-[10px] font-bold text-zinc-400 hover:text-white transition-colors uppercase tracking-widest">All</button>
                    <span className="text-zinc-700">·</span>
                    <button onClick={() => toggleAll(false)} className="text-[10px] font-bold text-zinc-400 hover:text-white transition-colors uppercase tracking-widest">None</button>
                    <span className="text-zinc-700">·</span>
                    <button onClick={reset} className="text-[10px] font-bold text-zinc-400 hover:text-rose-400 transition-colors uppercase tracking-widest">Clear</button>
                  </div>
                </div>

                {/* Preview table */}
                <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-800 divide-y divide-zinc-800/60 custom-scrollbar">
                  {preview.map((tx, i) => (
                    <div
                      key={i}
                      onClick={() => toggleRow(i)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                        tx.selected ? 'bg-zinc-800/60 hover:bg-zinc-800' : 'opacity-40 hover:opacity-60',
                      )}
                    >
                      <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', tx.selected ? 'bg-emerald-500' : 'bg-zinc-600')} />
                      <div className={cn('text-[9px] font-black px-2 py-0.5 rounded-full shrink-0', TYPE_BADGE[tx.type])}>
                        {TYPE_LABEL[tx.type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-white">{tx.ticker}</span>
                        {tx.type !== 'deposit' && tx.type !== 'withdrawal' && (
                          <span className="text-[10px] text-zinc-500 ml-2">{tx.shares.toFixed(4)} sh @ ${tx.price.toFixed(2)}</span>
                        )}
                        {(tx.type === 'deposit' || tx.type === 'withdrawal') && (
                          <span className="text-[10px] text-zinc-500 ml-2">${tx.price.toFixed(2)}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-600 shrink-0">{format(new Date(tx.timestamp), 'dd MMM yy')}</span>
                    </div>
                  ))}
                </div>

                {/* Holdings preview */}
                <div className="rounded-lg border border-zinc-800 overflow-hidden">
                  <div className="px-4 py-2.5 bg-zinc-800/50 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                      {existingHoldings.length > 0 ? 'Combined portfolio after import' : 'Resulting portfolio'}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {holdingsSummary.closedCount} closed · {holdingsSummary.open.length} open
                    </span>
                  </div>

                  {/* Negative position warnings */}
                  {holdingsSummary.negative.length > 0 && (
                    <div className="px-4 py-3 bg-rose-950/20 border-b border-zinc-800 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-rose-300 leading-relaxed">
                        {holdingsSummary.negative.map((n) => n.ticker).join(', ')} would have negative shares — some buy transactions may be missing or deselected.
                      </p>
                    </div>
                  )}

                  {/* Open positions */}
                  {holdingsSummary.open.length > 0 ? (
                    <div className="divide-y divide-zinc-800/60 max-h-36 overflow-y-auto custom-scrollbar">
                      {holdingsSummary.open.map(({ ticker, shares, avgCost }) => (
                        <div key={ticker} className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-xs font-bold text-white">{ticker}</span>
                          <div className="text-right">
                            <span className="text-xs font-mono text-zinc-300">{shares.toFixed(4)} sh</span>
                            <span className="text-[10px] text-zinc-500 ml-2">avg ${avgCost.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-3 text-[11px] text-zinc-500 italic">
                      No open positions — all trades are fully closed round-trips.
                    </div>
                  )}

                </div>

                <button
                  onClick={handleConfirm}
                  disabled={selectedCount === 0}
                  className="w-full px-4 py-3 bg-white text-zinc-900 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Import {selectedCount} Transaction{selectedCount !== 1 ? 's' : ''}
                </button>
              </div>
            )}

            {uploadState === 'saving' && (
              <div className="border-2 border-dashed border-zinc-700 rounded-lg p-6 flex flex-col items-center gap-3 text-center">
                <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
                <p className="text-sm font-bold text-zinc-400">Saving {selectedCount} transactions…</p>
              </div>
            )}

            {uploadState === 'cash-entry' && (
              <div className="space-y-4">
                <div className="border border-emerald-800/60 bg-emerald-950/20 rounded-lg p-4 flex items-center gap-3">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <p className="text-xs text-emerald-300 font-bold">{selectedCount} transactions imported successfully.</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-white mb-1">Set your cash balance</p>
                  <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
                    Enter your current available cash. This is shown separately and does not affect performance calculations.
                  </p>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-sm select-none">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={cashInput}
                      onChange={(e) => setCashInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveCash()}
                      placeholder="0.00"
                      autoFocus
                      className="w-full pl-8 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-zinc-500 transition-colors"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setUploadState('done')}
                    disabled={savingCash}
                    className="flex-1 py-3 bg-zinc-800 text-zinc-400 rounded-xl text-xs font-bold hover:bg-zinc-700 transition-colors uppercase tracking-widest disabled:opacity-40"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleSaveCash}
                    disabled={savingCash}
                    className="flex-1 py-3 bg-white text-zinc-900 rounded-xl text-xs font-black hover:bg-zinc-100 transition-colors uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {savingCash ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Cash Balance'}
                  </button>
                </div>
              </div>
            )}

            {uploadState === 'done' && (
              <div className="border-2 border-emerald-800/60 bg-emerald-950/20 rounded-lg p-6 flex flex-col items-center gap-2 text-center">
                <Check className="w-6 h-6 text-emerald-400" />
                <p className="text-sm font-bold text-emerald-300">Import complete</p>
                <p className="text-[11px] text-zinc-500">Your transactions have been saved to your portfolio.</p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Callout({ type, icon, children }: { type: 'info' | 'warn'; icon: ReactNode; children: ReactNode }) {
  const classes = type === 'info'
    ? 'bg-blue-950/30 border-blue-900/40 text-blue-300'
    : 'bg-amber-950/30 border-amber-900/40 text-amber-300';
  return (
    <div className={cn('p-4 rounded-lg border flex items-start gap-3', classes)}>
      {icon}
      <p className="text-xs leading-relaxed">{children}</p>
    </div>
  );
}
