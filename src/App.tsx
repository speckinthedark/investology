import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, ListOrdered, BarChart3, BrainCircuit, RefreshCw } from 'lucide-react';
import { Toaster, toast } from 'sonner';

import { useAuth } from './hooks/useAuth';
import { usePortfolio } from './hooks/usePortfolio';
import { fetchStockData, fetchPriceHistory } from './services/stockService';

import LoginPage from './components/LoginPage';
import ErrorBoundary from './components/ErrorBoundary';
import Nav from './components/Nav';
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

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',     label: 'Overview',     icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ListOrdered },
  { id: 'performance',  label: 'Performance',  icon: BarChart3 },
  { id: 'deep-dive',    label: 'Deep Dive',    icon: BrainCircuit },
];

export default function App() {
  const { user, isReady, selectedPersona, login, logout, updatePersona } = useAuth();
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

  const handlePersonaChange = async (persona: typeof selectedPersona) => {
    await updatePersona(persona);
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
    <div className="min-h-screen bg-zinc-950 text-white font-sans">
      <Toaster position="top-center" theme="dark" richColors />

      {firestoreError && (
        <div className="bg-rose-950/80 border-b border-rose-800 px-4 py-3 text-sm text-rose-300 flex items-start gap-2">
          <span className="font-bold shrink-0">Firestore error:</span>
          <span className="font-mono text-xs">{firestoreError}</span>
        </div>
      )}

      <Nav user={user} isRefreshing={isRefreshing} onRefresh={refreshPrices} onLogout={logout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Portfolio Header */}
        <div className="bg-zinc-900 rounded-[32px] p-6 sm:p-8 border border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Total Portfolio Value</div>
            <div className="text-4xl md:text-5xl font-light tracking-tighter mb-4">
              ${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold block">Cash</span>
                <span className="text-lg font-black tracking-tighter text-blue-400">
                  ${cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className={cn('flex flex-col', totalPortfolioGain >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Total Gain</span>
                <span className="font-semibold">
                  {totalPortfolioGain >= 0 ? '+' : ''}${Math.abs(totalPortfolioGain).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  {' '}({totalPortfolioGainPct.toFixed(2)}%)
                </span>
              </div>
              <div className={cn('flex flex-col', totalDayChange >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Today</span>
                <span className="font-semibold">
                  {totalDayChange >= 0 ? '+' : ''}${Math.abs(totalDayChange).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  {' '}({totalDayChangePct.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <button
              onClick={() => openModal('buy')}
              className="flex-1 md:flex-none px-6 py-3 bg-white text-zinc-900 rounded-2xl font-bold hover:bg-zinc-100 transition-all text-xs uppercase tracking-widest"
            >
              Trade Asset
            </button>
            <button
              onClick={() => setShowCashModal(true)}
              className="flex-1 md:flex-none px-6 py-3 bg-blue-950/50 text-blue-400 border border-blue-900/50 rounded-2xl font-bold hover:bg-blue-950 transition-all text-xs uppercase tracking-widest"
            >
              Edit Cash
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto gap-1.5 border-b border-zinc-800 pb-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all outline-none',
                activeTab === id
                  ? 'bg-white text-zinc-900 shadow-lg'
                  : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
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
              <InsightsTab
                uid={user.uid}
                holdings={holdings}
                cashBalance={cashBalance}
                selectedPersona={selectedPersona}
                onPersonaChange={handlePersonaChange}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

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
