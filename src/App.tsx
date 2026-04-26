import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, ArrowUpDown, CreditCard } from 'lucide-react';
import { Toaster, toast } from 'sonner';

import { useAuth } from './hooks/useAuth';
import { usePortfolio } from './hooks/usePortfolio';
import { fetchStockData, fetchPriceHistory } from './services/stockService';

import LoginPage from './components/LoginPage';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import ConfirmDialog from './components/ConfirmDialog';
import CashBalanceModal from './components/CashBalanceModal';
import TransactionModal from './components/TransactionModal';
import AssetDetailPanel from './components/AssetDetailPanel';
import ImportGuidePanel from './components/ImportGuidePanel';
import OverviewTab from './components/tabs/OverviewTab';
import TransactionsTab from './components/tabs/TransactionsTab';
import PerformanceTab from './components/tabs/PerformanceTab';
import InsightsTab from './components/tabs/InsightsTab';

import { StockData, Transaction, TransactionType, PriceHistory } from './types';
import { cn } from './lib/utils';

type Tab = 'overview' | 'transactions' | 'performance' | 'deep-dive';

export default function App() {
  const { user, isReady, login, logout } = useAuth();
  const { holdings, transactions, cashBalance, firestoreError, setCashBalance, addTransaction, bulkImportTransactions, deleteTransaction, deleteHolding, clearAllTransactions } = usePortfolio(user);

  const [stockPrices, setStockPrices] = useState<Record<string, StockData>>({});
  const [priceHistory, setPriceHistory] = useState<PriceHistory>({});
  const [isPriceHistoryLoading, setIsPriceHistoryLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [showCashModal, setShowCashModal] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; type: TransactionType; editing?: Transaction }>({ open: false, type: 'buy' });
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [showImportGuide, setShowImportGuide] = useState(false);

  useEffect(() => {
    if (holdings.length > 0 && Object.keys(stockPrices).length === 0) {
      refreshPrices();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings]);

  // Re-fetch monthly history whenever the set of held tickers changes
  const holdingTickersKey = holdings.map((h) => h.ticker).sort().join(',');
  useEffect(() => {
    const tickers = holdings.map((h) => h.ticker).filter((t) => t !== 'CASH');
    if (tickers.length === 0) return;
    // Fetch from Jan 1 of the previous year to cover full YTD + last 12 months
    const from = new Date(new Date().getFullYear() - 1, 0, 1).toISOString().split('T')[0];
    setIsPriceHistoryLoading(true);
    fetchPriceHistory(tickers, from)
      .then(setPriceHistory)
      .finally(() => setIsPriceHistoryLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdingTickersKey]);

  const refreshPrices = async () => {
    if (holdings.length === 0) return;
    setIsRefreshing(true);
    try {
      const entries = await Promise.all(holdings.map((h) => fetchStockData(h.ticker).then((d) => [h.ticker, d] as const)));
      setStockPrices(Object.fromEntries(entries));
    } catch (e) {
      toast.error('Failed to refresh prices');
    } finally {
      setIsRefreshing(false);
    }
  };

  const totalValue = holdings.reduce((acc, h) => acc + h.shares * (stockPrices[h.ticker]?.price ?? h.averagePrice), 0);
  const totalPortfolioValue = totalValue + cashBalance;
  const totalCostBasis = holdings.reduce((acc, h) => acc + h.shares * h.averagePrice, 0);
  const totalPortfolioGain = totalValue - totalCostBasis;
  const totalPortfolioGainPct = totalCostBasis > 0 ? (totalPortfolioGain / totalCostBasis) * 100 : 0;
  const totalDayChange = holdings.reduce((acc, h) => acc + h.shares * (stockPrices[h.ticker]?.change ?? 0), 0);
  const totalDayChangePct = totalPortfolioValue - totalDayChange > 0 ? (totalDayChange / (totalPortfolioValue - totalDayChange)) * 100 : 0;

  const handleExport = () => {
    const sorted = [...transactions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const header = 'date,type,ticker,shares,price';
    const rows = sorted.map((tx) => `${tx.timestamp},${tx.type},${tx.ticker},${tx.shares},${tx.price}`);
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stockpulse-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openModal = (type: TransactionType, editing?: Transaction) => setModal({ open: true, type, editing });
  const closeModal = () => setModal({ open: false, type: 'buy' });

  const handleDeleteTransaction = (id: string, ticker: string) => {
    setConfirmAction({
      message: ticker === 'CASH' ? 'Delete this cash transaction?' : `Delete this ${ticker} transaction?`,
      onConfirm: () => { deleteTransaction(id, ticker); setConfirmAction(null); },
    });
  };

  const handleDeleteHolding = (ticker: string) => {
    setConfirmAction({
      message: `Remove all data for ${ticker}? Individual transactions will not be deleted.`,
      onConfirm: () => { deleteHolding(ticker); setConfirmAction(null); },
    });
  };

  const handleClearAll = () => {
    const count = transactions.length;
    setConfirmAction({
      message: `This will permanently delete all ${count} transactions and reset your portfolio to zero. Are you sure?`,
      onConfirm: () => setConfirmAction({
        message: `Second confirmation: all ${count} transactions will be gone forever. There is no undo.`,
        onConfirm: () => { clearAllTransactions(); setConfirmAction(null); },
      }),
    });
  };

  if (!isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950">
        <RefreshCw className="w-7 h-7 animate-spin text-zinc-600" />
      </div>
    );
  }

  if (!user) return <LoginPage onLogin={login} />;

  return (
    <ErrorBoundary>
      <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', height: '100vh' }}>
        <Toaster position="top-center" theme="dark" richColors />

        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onLogout={logout} />

        {/* Main column */}
        <div className="flex flex-col overflow-hidden">
          {firestoreError && (
            <div className="bg-rose-950/80 border-b border-rose-800 px-4 py-3 text-sm text-rose-300 flex items-start gap-2 shrink-0">
              <span className="font-bold shrink-0">Firestore error:</span>
              <span className="font-mono text-xs">{firestoreError}</span>
            </div>
          )}

          <Topbar user={user} isRefreshing={isRefreshing} onRefresh={refreshPrices} onLogout={logout} />

          {/* Persistent KPI header */}
          <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between shrink-0">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Total Portfolio Value</div>
              <div className="text-6xl font-light tracking-tighter text-white mb-4">
                ${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="flex items-center gap-8">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">Cash</div>
                  <div className="text-base font-black text-blue-400">
                    ${cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">Total Gain</div>
                  <div className={cn('text-base font-black', totalPortfolioGain >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {totalPortfolioGain >= 0 ? '+' : ''}${Math.abs(totalPortfolioGain).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    {' '}({totalPortfolioGainPct.toFixed(2)}%)
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">Today</div>
                  <div className={cn('text-base font-black', totalDayChange >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {totalDayChange >= 0 ? '+' : ''}${Math.abs(totalDayChange).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    {' '}({totalDayChangePct.toFixed(2)}%)
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => openModal('buy')}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-xl font-bold hover:bg-zinc-700 transition-all text-[11px] uppercase tracking-widest"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                Trade Asset
              </button>
              <button
                onClick={() => setShowCashModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-all text-[11px] uppercase tracking-widest"
              >
                <CreditCard className="w-3.5 h-3.5" />
                Edit Cash
              </button>
            </div>
          </div>

          {/* Scrollable tab content */}
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="p-6"
              >
                {activeTab === 'overview' && (
                  <OverviewTab
                    holdings={holdings}
                    stockPrices={stockPrices}
                    cashBalance={cashBalance}
                    totalPortfolioValue={totalPortfolioValue}
                    onDeleteHolding={handleDeleteHolding}
                    onSelectAsset={setSelectedAsset}
                  />
                )}
                {activeTab === 'transactions' && (
                  <TransactionsTab
                    transactions={transactions}
                    onEdit={(tx) => openModal(tx.type, tx)}
                    onDelete={handleDeleteTransaction}
                    onAddTrade={() => openModal('buy')}
                    onAddCash={() => openModal('deposit')}
                    onImport={() => setShowImportGuide(true)}
                    onExport={handleExport}
                    onClearAll={handleClearAll}
                  />
                )}
                {activeTab === 'performance' && (
                  <PerformanceTab
                    transactions={transactions}
                    priceHistory={priceHistory}
                    isPriceHistoryLoading={isPriceHistoryLoading}
                    totalStockValue={totalValue}
                    totalCostBasis={totalCostBasis}
                  />
                )}
                {activeTab === 'deep-dive' && (
                  // @ts-ignore — InsightsTab Props will be updated in a follow-up task
                  <InsightsTab
                    {...{ uid: user.uid, holdings, stockPrices, cashBalance } as any}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {modal.open && (
          <TransactionModal
            initialType={modal.type}
            editingTransaction={modal.editing}
            onSubmit={addTransaction}
            onClose={closeModal}
          />
        )}

        {confirmAction && (
          <ConfirmDialog
            message={confirmAction.message}
            onConfirm={confirmAction.onConfirm}
            onCancel={() => setConfirmAction(null)}
          />
        )}

        {selectedAsset && (
          <AssetDetailPanel
            ticker={selectedAsset}
            stockData={stockPrices[selectedAsset]}
            transactions={transactions}
            onClose={() => setSelectedAsset(null)}
          />
        )}

        {showCashModal && (
          <CashBalanceModal
            currentBalance={cashBalance}
            onSave={async (amount) => { await setCashBalance(amount); setShowCashModal(false); }}
            onClose={() => setShowCashModal(false)}
          />
        )}

        {showImportGuide && (
          <ImportGuidePanel
            onClose={() => setShowImportGuide(false)}
            onImportTransactions={async (txs) => { await bulkImportTransactions(txs); }}
            onSetCash={async (amount) => { await setCashBalance(amount); }}
            existingHoldings={holdings}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
