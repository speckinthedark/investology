import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, BrainCircuit, Eye, EyeOff } from 'lucide-react';
import { Toaster, toast } from 'sonner';

import { useAuth } from './hooks/useAuth';
import { usePortfolio } from './hooks/usePortfolio';
import { fetchStockData, fetchPriceHistory, fetchSP500YTD, fetchFXRates } from './services/stockService';

import LoginPage from './components/LoginPage';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar, { Tab } from './components/Sidebar';
import MobileBottomNav from './components/MobileBottomNav';
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
import ResearchTab from './components/tabs/ResearchTab';
import ConnectionsTab from './components/tabs/ConnectionsTab';
import { useSnaptrade } from './hooks/useSnaptrade';

import { StockData, Transaction, TransactionType, PriceHistory } from './types';
import { cn } from './lib/utils';
import { PrivacyContext, HIDDEN } from './contexts/PrivacyContext';
import { computeYTDTWR } from './lib/portfolio';

export default function App() {
  const { user, isReady, login, logout } = useAuth();
  const { holdings, transactions, cashBalance, firestoreError, setCashBalance, addTransaction, bulkImportTransactions, deleteTransaction, deleteHolding, clearAllTransactions } = usePortfolio(user);
  const snaptrade = useSnaptrade(user);

  const [stockPrices, setStockPrices] = useState<Record<string, StockData>>({});
  const [priceHistory, setPriceHistory] = useState<PriceHistory>({});
  const [isPriceHistoryLoading, setIsPriceHistoryLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [isHidden, setIsHidden] = useState(false);
  const [researchTicker, setResearchTicker] = useState<string | null>(null);
  const [sp500YTD, setSP500YTD] = useState<number | null>(null);
  const [currency, setCurrency] = useState<'USD' | 'INR' | 'AUD'>('USD');
  const [fxRates, setFxRates] = useState<{ INR: number | null; AUD: number | null }>({ INR: null, AUD: null });
  const [showCashModal, setShowCashModal] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; type: TransactionType; editing?: Transaction }>({ open: false, type: 'buy' });
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [showImportGuide, setShowImportGuide] = useState(false);
  const pendingSnaptradeAuth = useRef(false);

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

  useEffect(() => { fetchSP500YTD().then(setSP500YTD); }, []);
  useEffect(() => { fetchFXRates().then(setFxRates); }, []);

  // Detect OAuth redirect back from SnapTrade portal — set flag immediately, flush when credentials load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('snaptrade_auth') === 'success') {
      history.replaceState(null, '', window.location.pathname);
      setActiveTab('connections');
      pendingSnaptradeAuth.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncFromSnaptrade = async (txs: Omit<import('./types').Transaction, 'id'>[]) => {
    await clearAllTransactions();
    await bulkImportTransactions(txs);
  };

  useEffect(() => {
    if (!snaptrade.credentials) return;
    if (pendingSnaptradeAuth.current) {
      pendingSnaptradeAuth.current = false;
      snaptrade.refreshAccounts();
      snaptrade.sync(syncFromSnaptrade);
      return;
    }
    const lastSync = snaptrade.lastSyncedAt ? new Date(snaptrade.lastSyncedAt) : null;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (!lastSync || lastSync < oneHourAgo) {
      snaptrade.sync(syncFromSnaptrade);
    }
  // snaptrade.sync is a new reference every render; adding it would loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snaptrade.credentials]);

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

  const ytdTWR = useMemo(
    () => computeYTDTWR(transactions, priceHistory, stockPrices),
    [transactions, priceHistory, stockPrices],
  );

  const connectionStatus: 'connected' | 'error' | 'disconnected' = snaptrade.syncError
    ? 'error'
    : snaptrade.accounts.length > 0
    ? 'connected'
    : 'disconnected';

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
    <PrivacyContext.Provider value={isHidden}>
      <div className="grid grid-cols-1 md:grid-cols-[64px_1fr] h-screen">
        <Toaster position="top-center" theme="dark" richColors />

        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onLogout={logout}
          user={user}
          isRefreshing={isRefreshing}
          onRefresh={refreshPrices}
          connectionStatus={connectionStatus}
        />

        {/* Main column */}
        <div className="flex flex-col overflow-hidden">
          <Topbar
            user={user}
            isRefreshing={isRefreshing}
            onRefresh={refreshPrices}
            onLogout={logout}
            snaptradeAccounts={snaptrade.accounts}
            snaptradeLastSyncedAt={snaptrade.lastSyncedAt}
            snaptradeSyncing={snaptrade.isSyncing}
            snaptradeSyncError={snaptrade.syncError}
            onNavigateToConnections={() => setActiveTab('connections')}
          />
          {firestoreError && (
            <div className="bg-rose-950/80 border-b border-rose-800 px-4 py-3 text-sm text-rose-300 flex items-start gap-2 shrink-0">
              <span className="font-bold shrink-0">Firestore error:</span>
              <span className="font-mono text-xs">{firestoreError}</span>
            </div>
          )}

          {/* Persistent KPI header */}
          <div className="bg-zinc-900 border-b border-zinc-800 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Total Portfolio Value</div>
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <div className="text-3xl sm:text-6xl font-light tracking-tighter text-white">
                  {isHidden ? HIDDEN : (() => {
                    const rate = currency === 'INR' ? fxRates.INR : currency === 'AUD' ? fxRates.AUD : 1;
                    if (rate == null) return `$${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    const converted = totalPortfolioValue * rate;
                    if (currency === 'INR') return `₹${converted.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    if (currency === 'AUD') return `A$${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    return `$${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  })()}
                </div>
                <div className="flex items-center gap-1.5 shrink-0 self-end mb-1 sm:mb-2">
                  <button
                    onClick={() => setCurrency((c) => c === 'USD' ? 'INR' : c === 'INR' ? 'AUD' : 'USD')}
                    className="px-1.5 py-0.5 rounded text-[9px] font-black tracking-widest text-zinc-500 hover:text-zinc-300 border border-zinc-700/60 hover:border-zinc-500 transition-colors"
                    title="Toggle currency"
                  >
                    {currency}
                  </button>
                  <button
                    onClick={() => setIsHidden((h) => !h)}
                    className="p-1.5 text-zinc-600 hover:text-zinc-400 transition-colors"
                    title={isHidden ? 'Show values' : 'Hide values'}
                  >
                    {isHidden ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-4 overflow-x-auto md:overflow-visible md:flex-wrap md:gap-8 [-webkit-overflow-scrolling:touch]">
                <button
                  onClick={() => setShowCashModal(true)}
                  className="text-left hover:bg-zinc-800/50 rounded-lg transition-colors px-2 py-1 -mx-2 -my-1 shrink-0"
                >
                  <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">Cash</div>
                  <div className="text-base font-black text-blue-400">
                    {isHidden ? HIDDEN : `$${cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                  </div>
                </button>
                <div className="shrink-0">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">Total Gain</div>
                  <div className={cn('text-base font-black', totalPortfolioGain >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {isHidden
                      ? HIDDEN
                      : `${totalPortfolioGain >= 0 ? '+' : ''}$${Math.abs(totalPortfolioGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${totalPortfolioGainPct.toFixed(2)}%)`}
                  </div>
                </div>
                <div className="shrink-0">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">Today</div>
                  <div className={cn('text-base font-black', totalDayChange >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {isHidden
                      ? HIDDEN
                      : `${totalDayChange >= 0 ? '+' : ''}$${Math.abs(totalDayChange).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${totalDayChangePct.toFixed(2)}%)`}
                  </div>
                </div>
                {ytdTWR !== null && !isPriceHistoryLoading && (
                  <div className="shrink-0">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">YTD Return</div>
                    <div className={cn('text-base font-black', ytdTWR >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                      {isHidden ? HIDDEN : `${ytdTWR >= 0 ? '+' : ''}${ytdTWR.toFixed(2)}%`}
                    </div>
                  </div>
                )}
                {sp500YTD !== null && (
                  <div className="shrink-0">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">S&amp;P 500 YTD</div>
                    <div className={cn('text-base font-black', sp500YTD >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                      {`${sp500YTD >= 0 ? '+' : ''}${sp500YTD.toFixed(2)}%`}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Scrollable tab content */}
          <div className={cn('flex-1 min-h-0 custom-scrollbar pb-16 md:pb-0', activeTab === 'research' ? 'overflow-hidden' : 'overflow-y-auto')}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className={activeTab === 'research' ? 'h-full' : 'p-6'}
              >
                {activeTab === 'overview' && (
                  <OverviewTab
                    holdings={holdings}
                    stockPrices={stockPrices}
                    cashBalance={cashBalance}
                    totalPortfolioValue={totalPortfolioValue}
                    onDeleteHolding={handleDeleteHolding}
                    onSelectAsset={setSelectedAsset}
                    onResearchTicker={(ticker) => { setResearchTicker(ticker); setActiveTab('research'); }}
                  />
                )}
                {activeTab === 'transactions' && (
                  <TransactionsTab
                    transactions={transactions}
                    onEdit={(tx) => openModal(tx.type, tx)}
                    onDelete={handleDeleteTransaction}
                    onAddTrade={() => openModal('buy')}
                    onAddCash={() => openModal('deposit')}
                    onExport={handleExport}
                    onClearAll={handleClearAll}
                  />
                )}
                {activeTab === 'performance' && (
                  <PerformanceTab
                    holdings={holdings}
                    stockPrices={stockPrices}
                    totalStockValue={totalValue}
                    totalCostBasis={totalCostBasis}
                  />
                )}
                {activeTab === 'deep-dive' && (
                  <div className="flex flex-col items-center justify-center h-full gap-8 text-center px-8 select-none">
                    <div className="relative">
                      <div className="w-20 h-20 rounded-3xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center">
                        <BrainCircuit className="w-9 h-9 text-zinc-600" />
                      </div>
                      <div className="absolute -top-1.5 -right-1.5 text-[8px] font-black uppercase tracking-widest text-zinc-400 bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded-full">
                        Soon
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 max-w-sm">
                      <h2 className="text-2xl font-black text-zinc-300 tracking-tight">
                        Deep Dive is on its way.
                      </h2>
                      <p className="text-sm text-zinc-500 leading-relaxed">
                        DCF models, earnings call summaries, scenario analysis, and AI-powered stock breakdowns.
                        The toolkit serious investors actually need — being built right now.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 items-center">
                      {['Discounted Cash Flow models', 'Earnings call AI summaries', 'Bear / base / bull scenario builder', 'Comparable company analysis'].map((feature) => (
                        <div key={feature} className="flex items-center gap-2 text-xs text-zinc-600">
                          <div className="w-1 h-1 rounded-full bg-zinc-700" />
                          {feature}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {activeTab === 'research' && (
                  <ResearchTab
                    holdings={holdings}
                    initialTicker={researchTicker}
                    onInitialTickerConsumed={() => setResearchTicker(null)}
                  />
                )}
                {activeTab === 'connections' && (
                  <ConnectionsTab
                    credentials={snaptrade.credentials}
                    accounts={snaptrade.accounts}
                    lastSyncedAt={snaptrade.lastSyncedAt}
                    isSyncing={snaptrade.isSyncing}
                    syncError={snaptrade.syncError}
                    onRegister={snaptrade.register}
                    onGetConnectUrl={snaptrade.getConnectUrl}
                    onSync={() => snaptrade.sync(syncFromSnaptrade)}
                    onDisconnect={snaptrade.disconnect}
                    onClearApiKeys={snaptrade.clearApiKeys}
                    onShowCsvImport={() => setShowImportGuide(true)}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          connectionStatus={connectionStatus}
        />

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
    </PrivacyContext.Provider>
    </ErrorBoundary>
  );
}
