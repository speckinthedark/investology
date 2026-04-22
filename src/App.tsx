/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc, 
  addDoc, 
  deleteDoc, 
  query, 
  orderBy,
  getDocFromServer,
  getDocs
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, Holding, Transaction, StockData, Persona } from './types';
import { getStockData, getPortfolioInsights } from './services/geminiService';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  Treemap,
  PieChart, 
  Pie, 
  Cell,
  BarChart,
  Bar
} from 'recharts';
import { 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  LogOut, 
  RefreshCw, 
  PieChart as PieChartIcon, 
  History, 
  Search,
  Trash2,
  Pencil,
  AlertCircle,
  BrainCircuit,
  Calendar,
  DollarSign,
  Download,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  PieChart as PieChartRecharts,
  X,
  LayoutDashboard,
  ListOrdered,
  BarChart3
} from 'lucide-react';
import { cn } from './lib/utils';
import { format } from 'date-fns';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

// --- Error Boundary Component ---
function ErrorBoundary({ error, reset }: { error: string; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-red-100">
        <div className="flex items-center gap-3 text-red-600 mb-4">
          <AlertCircle className="w-8 h-8" />
          <h2 className="text-xl font-bold">Something went wrong</h2>
        </div>
        <pre className="bg-gray-100 p-4 rounded-lg text-xs overflow-auto mb-6 max-h-48 text-gray-700">
          {error}
        </pre>
        <button 
          onClick={reset}
          className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

const getColor = (change: number) => {
  if (change <= -3) return '#991b1b'; // red-800
  if (change <= -1.5) return '#ef4444'; // red-500
  if (change < 0) return '#fca5a5'; // red-300
  if (change === 0) return '#e4e4e7'; // zinc-200
  if (change <= 1.5) return '#86efac'; // green-300
  if (change <= 3) return '#22c55e'; // green-500
  return '#15803d'; // green-700
};

const getTextColor = (change: number) => {
  if (Math.abs(change) >= 1.5) return '#ffffff';
  return '#1a1a1a';
};

const CustomizedContent = (props: any) => {
  const { x, y, width, height, name, change, sector } = props;
  const bgColor = getColor(change);
  const textColor = getTextColor(change);

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: bgColor,
          stroke: '#fff',
          strokeWidth: 1,
        }}
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: 'url(#cellGradient)',
          pointerEvents: 'none'
        }}
      />
      {width > 30 && height > 30 && (
        <foreignObject x={x} y={y} width={width} height={height}>
          <div 
            className="w-full h-full p-2 flex flex-col justify-between select-none overflow-hidden"
            style={{ color: textColor }}
          >
            <div className="flex flex-col">
              <div className="font-black text-xs sm:text-sm md:text-base leading-none tracking-tighter uppercase truncate">
                {name}
              </div>
              {height > 50 && (
                <div className="text-[8px] uppercase font-bold opacity-50 truncate mt-0.5">
                  {sector}
                </div>
              )}
            </div>
            <div className="flex items-baseline justify-end">
              <div className="font-mono text-[9px] sm:text-xs font-bold bg-black/5 px-1 rounded backdrop-blur-[2px]">
                {(change || 0) >= 0 ? '+' : ''}{(change || 0).toFixed(2)}%
              </div>
            </div>
          </div>
        </foreignObject>
      )}
    </g>
  );
};

// --- Main App Component ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stockPrices, setStockPrices] = useState<Record<string, StockData>>({});
  const [treemapView, setTreemapView] = useState<'day' | 'total'>('day');
  const [insights, setInsights] = useState<string>("");
  const [selectedPersona, setSelectedPersona] = useState<Persona>('buffett');
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [modalType, setModalType] = useState<'buy' | 'sell' | 'deposit' | 'withdrawal'>('buy');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'marketValue', direction: 'desc' });
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'performance' | 'deep-dive'>('overview');

  // --- Auth & Initial Setup ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      
      if (currentUser) {
        // Ensure user profile exists in Firestore
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: currentUser.uid,
            displayName: currentUser.displayName || 'User',
            email: currentUser.email || '',
            currency: 'USD',
            selectedPersona: 'buffett',
            cashBalance: 0
          });
          setSelectedPersona('buffett');
        } else {
          const profile = userSnap.data() as UserProfile;
          if (profile.selectedPersona) {
            setSelectedPersona(profile.selectedPersona);
          }
        }
        
        // Test connection
        try {
          await getDocFromServer(doc(db, 'test', 'connection'));
        } catch (e) {
          if (e instanceof Error && e.message.includes('the client is offline')) {
            console.error("Firebase connection test failed: client is offline.");
          }
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // --- Real-time Data Listeners ---
  useEffect(() => {
    if (!user || !isAuthReady) return;

    const holdingsUnsubscribe = onSnapshot(
      collection(db, 'users', user.uid, 'holdings'),
      (snapshot) => {
        const data = snapshot.docs.map(doc => doc.data() as Holding);
        setHoldings(data);
      },
      (err) => handleFirestoreError(err, 'get', `users/${user.uid}/holdings`)
    );

    const transactionsUnsubscribe = onSnapshot(
      query(collection(db, 'users', user.uid, 'transactions'), orderBy('timestamp', 'desc')),
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
        setTransactions(data);
      },
      (err) => handleFirestoreError(err, 'get', `users/${user.uid}/transactions`)
    );

    return () => {
      holdingsUnsubscribe();
      transactionsUnsubscribe();
    };
  }, [user, isAuthReady]);

  // --- Fetch Stock Prices ---
  const refreshPrices = async () => {
    if (holdings.length === 0) return;
    setIsLoadingPrices(true);
    try {
      const newPrices: Record<string, StockData> = {};
      for (const holding of holdings) {
        const data = await getStockData(holding.ticker);
        newPrices[holding.ticker] = data;
      }
      setStockPrices(newPrices);
      
      const aiInsights = await getPortfolioInsights(holdings, selectedPersona);
      setInsights(aiInsights);
    } catch (e) {
      console.error("Error refreshing prices:", e);
    } finally {
      setIsLoadingPrices(false);
    }
  };

  useEffect(() => {
    if (holdings.length > 0 && Object.keys(stockPrices).length === 0) {
      refreshPrices();
    }
  }, [holdings]);

  // --- Firestore Error Handler ---
  const handleFirestoreError = (err: any, op: string, path: string) => {
    const errInfo = {
      error: err.message,
      operationType: op,
      path,
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email
      }
    };
    setError(JSON.stringify(errInfo, null, 2));
  };

  // --- Auth Handlers ---
  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error("Login failed:", e);
    }
  };

  const handleLogout = () => signOut(auth);

  const handlePersonaChange = async (newPersona: Persona) => {
    if (!user) return;
    setSelectedPersona(newPersona);
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { selectedPersona: newPersona }, { merge: true });
      // Refresh insights with new persona
      const aiInsights = await getPortfolioInsights(holdings, newPersona);
      setInsights(aiInsights);
    } catch (e) {
      console.error("Error updating persona:", e);
    }
  };

  // --- Portfolio Handlers ---
  const updateHoldingForTicker = async (ticker: string) => {
    if (!user) return;
    const tickerUpper = ticker.toUpperCase();
    const transactionsRef = collection(db, 'users', user.uid, 'transactions');
    // Fetch all transactions for this ticker to recalculate
    const q = query(transactionsRef, orderBy('timestamp', 'asc'));
    const querySnapshot = await getDocs(q);
    
    const tickerTx = querySnapshot.docs
      .map(doc => doc.data() as Transaction)
      .filter(tx => tx.ticker === tickerUpper);

    let currentShares = 0;
    let currentAvgPrice = 0;

    tickerTx.forEach(tx => {
      if (tx.type === 'buy') {
        const newTotalShares = currentShares + tx.shares;
        currentAvgPrice = ((currentShares * currentAvgPrice) + (tx.shares * tx.price)) / newTotalShares;
        currentShares = newTotalShares;
      } else {
        currentShares = Math.max(0, currentShares - tx.shares);
        if (currentShares === 0) currentAvgPrice = 0;
      }
    });

    const holdingRef = doc(db, 'users', user.uid, 'holdings', tickerUpper);
    if (currentShares > 0) {
      await setDoc(holdingRef, {
        ticker: tickerUpper,
        shares: currentShares,
        averagePrice: currentAvgPrice
      });
    } else {
      await deleteDoc(holdingRef);
    }
  };

  const addTransaction = async (ticker: string, shares: number, price: number, type: 'buy' | 'sell' | 'deposit' | 'withdrawal', date: string, id?: string) => {
    if (!user) return;
    try {
      const tickerUpper = (ticker || 'CASH').toUpperCase();
      const timestamp = new Date(date).toISOString();
      
      const txData = {
        ticker: tickerUpper,
        type,
        shares: type === 'deposit' || type === 'withdrawal' ? 1 : shares,
        price,
        timestamp
      };

      if (id) {
        await setDoc(doc(db, 'users', user.uid, 'transactions', id), txData);
      } else {
        await addDoc(collection(db, 'users', user.uid, 'transactions'), txData);
      }

      if (type === 'buy' || type === 'sell') {
        await updateHoldingForTicker(tickerUpper);
      }
      setIsAddModalOpen(false);
      setEditingTransaction(null);
    } catch (e) {
      handleFirestoreError(e, 'write', `users/${user.uid}/transactions`);
    }
  };

  const deleteTransaction = async (id: string, ticker: string) => {
    if (!user) return;
    const isCash = ticker === 'CASH';
    const message = isCash 
      ? `Are you sure you want to delete this cash transaction?`
      : `Are you sure you want to delete this transaction for ${ticker}?`;
      
    setConfirmAction({
      message,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'transactions', id));
          if (!isCash) {
            await updateHoldingForTicker(ticker);
          }
          toast.success('Transaction deleted');
        } catch (e) {
          handleFirestoreError(e, 'delete', `users/${user.uid}/transactions/${id}`);
        }
      }
    });
  };

  const deleteHolding = async (ticker: string) => {
    if (!user) return;
    setConfirmAction({
      message: `Are you sure you want to delete all data for ${ticker}? This will NOT delete individual transactions.`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'holdings', ticker));
          toast.success('Holding deleted');
        } catch (e) {
          handleFirestoreError(e, 'delete', `users/${user.uid}/holdings/${ticker}`);
        }
      }
    });
  };

  const downloadCSV = () => {
    const headers = ['Ticker', 'Sector', '# of shares', 'Avg. Cost', 'Value', 'Portfolio Share (%)'];
    
    const holdingsData = holdings.map(h => {
      const currentPrice = stockPrices[h.ticker]?.price || h.averagePrice;
      const value = h.shares * currentPrice;
      const share = totalPortfolioValue > 0 ? (value / totalPortfolioValue) * 100 : 0;
      return [
        h.ticker,
        stockPrices[h.ticker]?.sector || 'Other',
        h.shares.toString(),
        h.averagePrice.toFixed(2),
        value.toFixed(2),
        share.toFixed(2)
      ];
    });

    const cashShare = totalPortfolioValue > 0 ? (cashBalance / totalPortfolioValue) * 100 : 0;
    const cashData = [
      'USD',
      'Cash',
      '1',
      cashBalance.toFixed(2),
      cashBalance.toFixed(2),
      cashShare.toFixed(2)
    ];

    const csvRows = [
      headers.join(','),
      ...holdingsData.map(row => row.join(',')),
      cashData.join(',')
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `portfolio_holdings_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (error) return <ErrorBoundary error={error} reset={() => setError(null)} />;

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full space-y-8">
          <div className="space-y-2">
            <h1 className="text-6xl font-black tracking-tighter uppercase italic">StockPulse</h1>
            <p className="text-gray-400 text-lg">Your personal portfolio, powered by AI.</p>
          </div>
          <button 
            onClick={handleLogin}
            className="w-full bg-white text-black py-4 rounded-full font-bold text-xl hover:bg-gray-200 transition-all flex items-center justify-center gap-3"
          >
            <TrendingUp className="w-6 h-6" />
            Connect with Google
          </button>
          <div className="grid grid-cols-3 gap-4 pt-12 opacity-50">
            <div className="p-4 border border-white/20 rounded-2xl">
              <TrendingUp className="w-6 h-6 mx-auto mb-2" />
              <div className="text-[10px] uppercase font-bold">Real-time</div>
            </div>
            <div className="p-4 border border-white/20 rounded-2xl">
              <BrainCircuit className="w-6 h-6 mx-auto mb-2" />
              <div className="text-[10px] uppercase font-bold">AI Insights</div>
            </div>
            <div className="p-4 border border-white/20 rounded-2xl">
              <PieChartIcon className="w-6 h-6 mx-auto mb-2" />
              <div className="text-[10px] uppercase font-bold">Visuals</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalValue = holdings.reduce((acc, h) => acc + (h.shares * (stockPrices[h.ticker]?.price || h.averagePrice)), 0);
  const totalCost = holdings.reduce((acc, h) => acc + (h.shares * h.averagePrice), 0);
  
  const cashBalance = transactions.reduce((acc, tx) => {
    if (tx.type === 'deposit') return acc + tx.price;
    if (tx.type === 'withdrawal') return acc - tx.price;
    if (tx.type === 'buy') return acc - (tx.shares * tx.price);
    if (tx.type === 'sell') return acc + (tx.shares * tx.price);
    return acc;
  }, 0);

  const totalInvested = transactions.reduce((acc, tx) => {
    if (tx.type === 'deposit') return acc + tx.price;
    if (tx.type === 'withdrawal') return acc - tx.price;
    return acc;
  }, 0);

  const totalPortfolioValue = totalValue + cashBalance;
  const totalPortfolioGain = totalPortfolioValue - totalInvested;
  const totalPortfolioGainPercent = totalInvested > 0 ? (totalPortfolioGain / totalInvested) * 100 : 0;
  
  const totalGain = totalValue - totalCost;
  const totalGainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const totalDayChange = holdings.reduce((acc, h) => acc + (h.shares * (stockPrices[h.ticker]?.change || 0)), 0);
  const totalDayChangePercent = (totalPortfolioValue - totalDayChange) > 0 ? (totalDayChange / (totalPortfolioValue - totalDayChange)) * 100 : 0;

  const sortedHoldings = [...holdings].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    let aVal: any, bVal: any;

    switch (key) {
      case 'ticker': aVal = a.ticker; bVal = b.ticker; break;
      case 'price': aVal = stockPrices[a.ticker]?.price || a.averagePrice; bVal = stockPrices[b.ticker]?.price || b.averagePrice; break;
      case 'holdings': aVal = a.shares; bVal = b.shares; break;
      case 'avgCost': aVal = a.averagePrice; bVal = b.averagePrice; break;
      case 'marketValue': aVal = a.shares * (stockPrices[a.ticker]?.price || a.averagePrice); bVal = b.shares * (stockPrices[b.ticker]?.price || b.averagePrice); break;
      case 'gain': aVal = (a.shares * (stockPrices[a.ticker]?.price || a.averagePrice)) - (a.shares * a.averagePrice); bVal = (b.shares * (stockPrices[b.ticker]?.price || b.averagePrice)) - (b.shares * b.averagePrice); break;
      case 'share': aVal = (a.shares * (stockPrices[a.ticker]?.price || a.averagePrice)) / totalPortfolioValue; bVal = (b.shares * (stockPrices[b.ticker]?.price || b.averagePrice)) / totalPortfolioValue; break;
      default: return 0;
    }

    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig?.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ sortKey }: { sortKey: string }) => {
    if (sortConfig?.key !== sortKey) return <ArrowUpDown className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />;
  };

  // --- Calculate Portfolio History ---
  const portfolioHistory = Array.from({ length: 7 }, (_, i) => {
    let dayTotal = 0;
    const date = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    holdings.forEach(h => {
      const stockData = stockPrices[h.ticker];
      if (stockData && stockData.history[i]) {
        dayTotal += h.shares * stockData.history[i].price;
      } else {
        dayTotal += h.shares * h.averagePrice;
      }
    });
    
    return { date, value: dayTotal };
  });

  const treemapData = [
    ...holdings.map(h => {
      const currentPrice = stockPrices[h.ticker]?.price || h.averagePrice;
      const dayChange = stockPrices[h.ticker]?.changePercent || 0;
      const totalChange = h.averagePrice > 0 ? ((currentPrice - h.averagePrice) / h.averagePrice) * 100 : 0;
      const value = h.shares * currentPrice;
      
      return {
        name: h.ticker,
        value,
        change: treemapView === 'day' ? dayChange : totalChange,
        sector: stockPrices[h.ticker]?.sector || "Other",
        share: totalPortfolioValue > 0 ? (value / totalPortfolioValue) * 100 : 0
      };
    }),
    ...(cashBalance > 0 ? [{
      name: 'CASH',
      value: cashBalance,
      change: 0,
      sector: 'Cash',
      share: totalPortfolioValue > 0 ? (cashBalance / totalPortfolioValue) * 100 : 0
    }] : [])
  ].sort((a, b) => b.value - a.value);

  const sectorData = [...treemapData].reduce((acc, curr) => {
    const existing = acc.find(item => item.name === curr.sector);
    if (existing) {
      existing.value += curr.value;
    } else {
      acc.push({ name: curr.sector, value: curr.value });
    }
    return acc;
  }, [] as { name: string, value: number }[]).sort((a, b) => b.value - a.value);

  const SECTOR_COLORS = ['#1e3a8a', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#eff6ff'];

  // --- Performance Metrics Calculations ---
  const allTimeNetDeposits = transactions.reduce((acc, tx) => {
    if (tx.type === 'deposit') return acc + tx.price;
    if (tx.type === 'withdrawal') return acc - tx.price;
    return acc;
  }, 0);

  const simpleReturnRate = allTimeNetDeposits !== 0 
    ? (totalPortfolioValue / allTimeNetDeposits) - 1 
    : 0;

  const monthlyCashflowMap = transactions.reduce((acc, tx) => {
    const date = new Date(tx.timestamp);
    const monthKey = format(date, 'MMM yyyy');
    if (!acc[monthKey]) acc[monthKey] = 0;
    if (tx.type === 'deposit') acc[monthKey] += tx.price;
    if (tx.type === 'withdrawal') acc[monthKey] -= tx.price;
    return acc;
  }, {} as Record<string, number>);

  const monthlyCashflowData = Object.entries(monthlyCashflowMap)
    .map(([month, netCashflow]) => {
      const d = new Date(month); 
      return { month, netCashflow, timestamp: d.getTime() };
    })
    .sort((a,b) => a.timestamp - b.timestamp);

  return (
    <div className="min-h-screen bg-[#F5F5F4] text-[#1A1A1A] font-sans">
      <Toaster position="top-center" />
      
      <AnimatePresence>
        {confirmAction && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl"
            >
              <h3 className="text-xl font-bold mb-4">Are you sure?</h3>
              <p className="text-gray-500 mb-8">{confirmAction.message}</p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setConfirmAction(null)}
                  className="flex-1 py-3 rounded-xl font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    confirmAction.onConfirm();
                    setConfirmAction(null);
                  }}
                  className="flex-1 py-3 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {selectedAsset && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-end"
            onClick={() => setSelectedAsset(null)}
          >
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white h-full w-full max-w-md shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-black tracking-tighter">{selectedAsset}</h2>
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-400">
                    {stockPrices[selectedAsset]?.sector || 'Asset Details'}
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedAsset(null)}
                  className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-8">
                <h3 className="text-sm font-bold italic serif mb-4">Transaction History</h3>
                <div className="space-y-4">
                  {transactions.filter(tx => tx.ticker === selectedAsset).map(tx => (
                    <div key={tx.id} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs uppercase",
                          tx.type === 'buy' ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                        )}>
                          {tx.type}
                        </div>
                        <div>
                          <div className="font-bold">{tx.shares} shares</div>
                          <div className="text-[10px] text-gray-400 uppercase font-bold">
                            {format(new Date(tx.timestamp), 'MMM d, yyyy')}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold">${tx.price.toFixed(2)}</div>
                        <div className="text-[10px] text-gray-400 uppercase font-bold">Price</div>
                      </div>
                    </div>
                  ))}
                  {transactions.filter(tx => tx.ticker === selectedAsset).length === 0 && (
                    <div className="text-center text-gray-400 italic py-8">No transactions found.</div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="cellGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.05)" />
          </linearGradient>
        </defs>
      </svg>
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="font-black text-xl tracking-tighter uppercase italic">StockPulse</span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={refreshPrices}
              disabled={isLoadingPrices}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("w-5 h-5", isLoadingPrices && "animate-spin")} />
            </button>
            <div className="h-8 w-[1px] bg-gray-200 mx-2" />
            <div className="flex items-center gap-3">
              <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-gray-200" />
              <button 
                onClick={handleLogout}
                className="p-2 hover:bg-red-50 text-red-600 rounded-full transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Persistent Header */}
        <div className="bg-white rounded-[32px] p-6 sm:p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Total Portfolio Value</div>
            <div className="text-4xl md:text-5xl font-light tracking-tighter mb-4">
              ${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Cash Balance</span>
                <span className="text-xl font-black tracking-tighter text-blue-600">
                  ${cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              
              <div className={cn(
                "flex items-center gap-2 font-semibold",
                totalPortfolioGain >= 0 ? "text-emerald-600" : "text-rose-600"
              )}>
                {totalPortfolioGain >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Total Gain</span>
                  <span>
                    {totalPortfolioGain >= 0 ? '+' : ''}
                    ${Math.abs(totalPortfolioGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                    ({(totalPortfolioGainPercent || 0).toFixed(2)}%)
                  </span>
                </div>
              </div>

              <div className={cn(
                "flex items-center gap-2 font-semibold",
                totalDayChange >= 0 ? "text-emerald-600" : "text-rose-600"
              )}>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Today</span>
                  <span>
                    {totalDayChange >= 0 ? '+' : ''}
                    ${Math.abs(totalDayChange).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                    ({(totalDayChangePercent || 0).toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <button 
              onClick={() => {
                setModalType('buy');
                setIsAddModalOpen(true);
              }}
              className="flex-1 md:flex-none px-6 py-3 bg-black text-white rounded-2xl font-bold hover:bg-gray-800 transition-all text-xs uppercase tracking-widest text-center"
            >
              Trade Asset
            </button>
            <button 
              onClick={() => {
                setModalType('deposit');
                setIsAddModalOpen(true);
              }}
              className="flex-1 md:flex-none px-6 py-3 bg-blue-50 text-blue-700 rounded-2xl font-bold hover:bg-blue-100 transition-all text-xs uppercase tracking-widest text-center"
            >
              Transfer Cash
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex overflow-x-auto hide-scrollbar space-x-2 border-b border-gray-200 pb-1">
          {[
            { id: 'overview', label: 'Overview', icon: PieChartRecharts },
            { id: 'transactions', label: 'Transactions', icon: ListOrdered },
            { id: 'performance', label: 'Performance', icon: BarChart3 },
            { id: 'deep-dive', label: 'Deep Dive', icon: BrainCircuit }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold uppercase tracking-widest whitespace-nowrap transition-all outline-none",
                activeTab === tab.id 
                  ? "bg-black text-white shadow-xl" 
                  : "text-gray-500 hover:bg-gray-100 hover:text-black"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div 
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-8"
            >
              <div className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 flex flex-col min-h-[600px]">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
                  <h2 className="text-xl font-bold italic serif">Asset Allocation</h2>
                  <div className="flex flex-col items-end gap-4">
                    <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button
                      onClick={() => setTreemapView('day')}
                      className={cn(
                        "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all",
                        treemapView === 'day' ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      Day
                    </button>
                    <button
                      onClick={() => setTreemapView('total')}
                      className={cn(
                        "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all",
                        treemapView === 'total' ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      Total
                    </button>
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                      {treemapView === 'day' ? 'Day change (%)' : 'Total gain (%)'}
                    </span>
                    <div className="flex items-center gap-1">
                      {[
                        { label: '≤ -3', color: '#991b1b' },
                        { label: '-1.5', color: '#ef4444' },
                        { label: '< 0', color: '#fca5a5' },
                        { label: '0', color: '#e4e4e7' },
                        { label: '> 0', color: '#86efac' },
                        { label: '+1.5', color: '#22c55e' },
                        { label: '≥ 3', color: '#15803d' },
                      ].map((item, i) => (
                        <div key={i} className="flex flex-col items-center gap-1">
                          <div className="w-8 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-[8px] font-black text-gray-400">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 w-full rounded-[24px] overflow-hidden border border-gray-50 h-[400px]">
                {treemapData.filter(d => d.value > 0).length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <Treemap
                      data={treemapData.filter(d => d.value > 0)}
                      dataKey="value"
                      aspectRatio={16 / 9}
                      stroke="#fff"
                      content={<CustomizedContent />}
                    >
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-black/90 backdrop-blur-md text-white p-3 rounded-2xl shadow-2xl border border-white/10">
                                <div className="flex items-center justify-between gap-4 mb-2">
                                  <span className="font-black tracking-tighter uppercase text-sm">{data.name}</span>
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">{data.sector}</span>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between gap-8">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Value</span>
                                    <span className="font-mono text-xs font-bold">${data.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </div>
                                  <div className="flex justify-between gap-8">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Portfolio Share</span>
                                    <span className="font-mono text-xs font-bold text-blue-400">{(data.share || 0).toFixed(2)}%</span>
                                  </div>
                                  <div className="flex justify-between gap-8 pt-1 border-t border-white/5">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                                      {treemapView === 'day' ? 'Day Change' : 'Total Gain'}
                                    </span>
                                    <span className={cn(
                                      "font-mono text-xs font-bold",
                                      data.change >= 0 ? "text-emerald-400" : "text-rose-400"
                                    )}>
                                      {data.change >= 0 ? '+' : ''}{(data.change || 0).toFixed(2)}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </Treemap>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-400 p-8 text-center">
                    <PieChartRecharts className="w-8 h-8 mb-4 opacity-20" />
                    <p className="text-sm font-bold uppercase tracking-widest">No Asset Data</p>
                    <p className="text-xs mt-2 max-w-[250px]">Add holdings to generate your asset allocation treemap.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Sector Allocation Donut Chart */}
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row items-center min-h-[16rem] h-auto gap-8">
              <div className="w-full md:w-1/2 h-64">
                {sectorData.filter(d => d.value > 0).length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sectorData.filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {sectorData.filter(d => d.value > 0).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={SECTOR_COLORS[index % SECTOR_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-black/90 backdrop-blur-md text-white p-3 rounded-2xl shadow-2xl border border-white/10">
                                <div className="font-black tracking-tighter uppercase text-sm mb-1">{data.name}</div>
                                <div className="font-mono text-xs font-bold text-blue-400">
                                  ${(data.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-full text-gray-400">
                    <p className="text-[10px] font-bold uppercase tracking-widest">No Data</p>
                  </div>
                )}
              </div>
              <div className="w-full md:w-1/2 flex flex-col justify-center gap-3 md:pl-8 overflow-hidden">
                <h3 className="text-sm font-bold italic serif mb-2">Sector Allocation</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-x-8 gap-y-3">
                  {sectorData.map((sector, i) => (
                    <div key={sector.name} className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-500 truncate" title={sector.name}>{sector.name}</span>
                      </div>
                      <span className="font-mono text-xs font-bold shrink-0">
                        {totalPortfolioValue > 0 ? ((sector.value / totalPortfolioValue) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

        {/* Holdings Table */}
        <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xl font-bold italic serif">Your Holdings</h2>
            <div className="flex items-center gap-4">
              <button
                onClick={downloadCSV}
                className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border border-gray-200"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
              <div className="text-xs font-bold uppercase tracking-widest text-gray-400">
                {holdings.length} Positions
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50 text-[10px] uppercase font-bold tracking-widest text-gray-400">
                  <th className="px-8 py-4 cursor-pointer group" onClick={() => requestSort('ticker')}>
                    <div className="flex items-center gap-1">Ticker <SortIcon sortKey="ticker" /></div>
                  </th>
                  <th className="px-8 py-4">Sector</th>
                  <th className="px-8 py-4 cursor-pointer group" onClick={() => requestSort('price')}>
                    <div className="flex items-center gap-1">Price <SortIcon sortKey="price" /></div>
                  </th>
                  <th className="px-8 py-4 cursor-pointer group" onClick={() => requestSort('holdings')}>
                    <div className="flex items-center gap-1">Holdings <SortIcon sortKey="holdings" /></div>
                  </th>
                  <th className="px-8 py-4 cursor-pointer group" onClick={() => requestSort('avgCost')}>
                    <div className="flex items-center gap-1">Avg Cost <SortIcon sortKey="avgCost" /></div>
                  </th>
                  <th className="px-8 py-4 cursor-pointer group" onClick={() => requestSort('marketValue')}>
                    <div className="flex items-center gap-1">Market Value <SortIcon sortKey="marketValue" /></div>
                  </th>
                  <th className="px-8 py-4 cursor-pointer group" onClick={() => requestSort('share')}>
                    <div className="flex items-center gap-1">Portfolio Share <SortIcon sortKey="share" /></div>
                  </th>
                  <th className="px-8 py-4 cursor-pointer group" onClick={() => requestSort('gain')}>
                    <div className="flex items-center gap-1">Gain/Loss <SortIcon sortKey="gain" /></div>
                  </th>
                  <th className="px-8 py-4">7D Trend</th>
                  <th className="px-8 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <AnimatePresence>
                  {sortedHoldings.map((holding) => {
                    const priceData = stockPrices[holding.ticker];
                    const currentPrice = priceData?.price || holding.averagePrice;
                    const marketValue = holding.shares * currentPrice;
                    const gain = marketValue - (holding.shares * holding.averagePrice);
                    const gainPct = (gain / (holding.shares * holding.averagePrice)) * 100;
                    const portfolioShare = totalPortfolioValue > 0 ? (marketValue / totalPortfolioValue) * 100 : 0;

                    return (
                      <motion.tr 
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        key={holding.ticker} 
                        className="hover:bg-gray-50/50 transition-colors group"
                      >
                        <td className="px-8 py-6">
                          <div className="font-black text-lg tracking-tighter">{holding.ticker}</div>
                          <div className="text-[10px] text-gray-400 uppercase font-bold">Common Stock</div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">{priceData?.sector || "..."}</div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="font-mono text-sm">${(currentPrice || 0).toFixed(2)}</div>
                          {priceData && (
                            <div className={cn(
                              "text-[10px] font-bold",
                              (priceData.change || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                            )}>
                              {(priceData.change || 0) >= 0 ? '+' : ''}{(priceData.change || 0).toFixed(2)} ({(priceData.changePercent || 0).toFixed(2)}%)
                            </div>
                          )}
                        </td>
                        <td className="px-8 py-6">
                          <div className="font-mono text-sm">{holding.shares}</div>
                          <div className="text-[10px] text-gray-400 font-bold uppercase">Shares</div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="font-mono text-sm">${(holding.averagePrice || 0).toFixed(2)}</div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="font-mono text-sm font-bold">${marketValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="font-mono text-sm font-bold text-blue-600">{portfolioShare.toFixed(2)}%</div>
                        </td>
                        <td className="px-8 py-6">
                          <div className={cn(
                            "font-mono text-sm font-bold",
                            gain >= 0 ? "text-emerald-600" : "text-rose-600"
                          )}>
                            {gain >= 0 ? '+' : ''}${gain.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                          <div className={cn(
                            "text-[10px] font-bold",
                            (gain || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                          )}>
                            {(gain || 0) >= 0 ? '+' : ''}{(gainPct || 0).toFixed(2)}%
                          </div>
                        </td>
                        <td className="px-8 py-6 w-32">
                          <div className="h-10 w-24">
                            {priceData?.history && priceData.history.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={priceData.history}>
                                  <Line 
                                    type="monotone" 
                                    dataKey="price" 
                                    stroke={gain >= 0 ? '#10b981' : '#ef4444'} 
                                    strokeWidth={2} 
                                    dot={false} 
                                    isAnimationActive={false}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-300">No data</div>
                            )}
                          </div>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => setSelectedAsset(holding.ticker)}
                              className="p-2 text-gray-300 hover:text-blue-600 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Search className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => deleteHolding(holding.ticker)}
                              className="p-2 text-gray-300 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
                {holdings.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-8 py-12 text-center text-gray-400 italic">
                      No holdings yet. Add your first transaction to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sector Allocation Donut Chart */}
        <div className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row items-center min-h-[16rem] h-auto gap-8">
          <div className="w-full md:w-1/2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sectorData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {sectorData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={SECTOR_COLORS[index % SECTOR_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-black/90 backdrop-blur-md text-white p-3 rounded-2xl shadow-2xl border border-white/10">
                          <div className="font-black tracking-tighter uppercase text-sm mb-1">{data.name}</div>
                          <div className="font-mono text-xs font-bold text-blue-400">
                            ${(data.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="w-full md:w-1/2 flex flex-col justify-center gap-3 md:pl-8 overflow-hidden">
            <h3 className="text-sm font-bold italic serif mb-2">Sector Allocation</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-x-8 gap-y-3">
              {sectorData.map((sector, i) => (
                <div key={sector.name} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-500 truncate" title={sector.name}>{sector.name}</span>
                  </div>
                  <span className="font-mono text-xs font-bold shrink-0">
                    {totalPortfolioValue > 0 ? ((sector.value / totalPortfolioValue) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
            </motion.div>
          )}

          {activeTab === 'transactions' && (
            <motion.div 
              key="transactions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-8"
            >
              <div className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 min-h-[600px]">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-bold italic serif">Transaction Log</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setEditingTransaction(null);
                        setModalType('buy');
                        setIsAddModalOpen(true);
                      }}
                      className="px-4 py-2 bg-black text-white hover:bg-gray-800 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                    >
                      Trade Asset
                    </button>
                    <button 
                      onClick={() => {
                        setEditingTransaction(null);
                        setModalType('deposit');
                        setIsAddModalOpen(true);
                      }}
                      className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                    >
                      Transfer Cash
                    </button>
                  </div>
                </div>
                <div className="space-y-4">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100 group hover:border-gray-200 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center font-bold text-xs uppercase",
                          tx.type === 'buy' ? "bg-emerald-100 text-emerald-700" : 
                          tx.type === 'deposit' ? "bg-blue-100 text-blue-700" :
                          tx.type === 'withdrawal' ? "bg-orange-100 text-orange-700" :
                          "bg-rose-100 text-rose-700"
                        )}>
                          {tx.type === 'buy' ? 'BUY' : tx.type === 'sell' ? 'SELL' : tx.type === 'deposit' ? 'DEP' : 'W/D'}
                        </div>
                        <div>
                          <div className="font-black tracking-tighter text-lg">{tx.ticker}</div>
                          <div className="text-[10px] text-gray-400 font-bold uppercase">
                            {format(new Date(tx.timestamp), 'MMM d, yyyy • HH:mm')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="font-mono text-base font-bold">
                            {tx.type === 'buy' || tx.type === 'deposit' ? '+' : '-'}
                            {tx.type === 'deposit' || tx.type === 'withdrawal' ? `$${(tx.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `${tx.shares} shares`}
                          </div>
                          {tx.type !== 'deposit' && tx.type !== 'withdrawal' && (
                            <div className="text-[10px] text-gray-400 font-bold uppercase">@ ${(tx.price || 0).toFixed(2)}</div>
                          )}
                          {(tx.type === 'deposit' || tx.type === 'withdrawal') && (
                            <div className="text-[10px] text-gray-400 font-bold uppercase">Cash Transfer</div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => {
                              setEditingTransaction(tx);
                              setModalType(tx.type);
                              setIsAddModalOpen(true);
                            }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors bg-white rounded-lg shadow-sm border border-gray-100"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => deleteTransaction(tx.id!, tx.ticker)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 transition-colors bg-white rounded-lg shadow-sm border border-gray-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {transactions.length === 0 && (
                    <div className="text-center py-16 text-gray-400 italic">No activity yet. Your transaction log is empty.</div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'performance' && (
            <motion.div 
              key="performance"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-1 bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 flex flex-col justify-center">
                  <h3 className="text-xl font-bold italic serif mb-4">Total Return Summary</h3>
                  <div className="space-y-6">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">Total Net Deposits</div>
                      <div className="text-2xl font-mono">${Math.max(0, allTimeNetDeposits).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">Simple Return Rate</div>
                      <div className={cn(
                        "text-5xl font-light tracking-tighter",
                        simpleReturnRate >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {simpleReturnRate >= 0 ? '+' : ''}{(simpleReturnRate * 100).toFixed(2)}%
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Formula: 1 + SRR = EMV / (BMV + Net Cashflow)
                      </p>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 bg-white rounded-[32px] p-8 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold italic serif">Monthly Cashflow Tracking</h3>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyCashflowData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis 
                          dataKey="month" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 'bold', fill: '#9ca3af' }}
                        />
                        <YAxis 
                          hide 
                          domain={['auto', 'auto']}
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                          formatter={(value: number) => `$${value.toLocaleString()}`}
                        />
                        <Bar 
                          dataKey="netCashflow" 
                          radius={[4, 4, 4, 4]}
                        >
                          {
                            monthlyCashflowData.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={entry.netCashflow >= 0 ? '#10b981' : '#f43f5e'} />
                            ))
                          }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold italic serif">Portfolio Value Trend</h3>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={portfolioHistory}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontWeight: 'bold', fill: '#9ca3af' }}
                        tickFormatter={(val) => format(new Date(val), 'MMM d')}
                      />
                      <YAxis 
                        hide 
                        domain={['auto', 'auto']}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                        formatter={(value: number) => `$${value.toLocaleString()}`}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#000" 
                        strokeWidth={4} 
                        dot={{ r: 4, fill: '#000', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-6 p-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-800 leading-relaxed">
                    <strong>Market Note:</strong> Prices are simulated using AI based on current trends. For production use, connect a real-time market data provider.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'deep-dive' && (
            <motion.div 
              key="deep-dive"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-8"
            >
              <div className="bg-black text-white rounded-[32px] p-8 shadow-xl min-h-[500px] flex flex-col shrink-0">
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between mb-8 shrink-0 pb-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <BrainCircuit className="w-5 h-5 text-blue-400" />
                      </div>
                      <span className="text-sm font-bold uppercase tracking-widest text-blue-400">AI Portfolio Deep-Dive</span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handlePersonaChange('buffett')}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all border",
                          selectedPersona === 'buffett' ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-900/50" : "bg-transparent border-white/20 text-white/50 hover:border-white/40 hover:bg-white/5"
                        )}
                      >
                        Buffett Analysis
                      </button>
                      <button 
                        onClick={() => handlePersonaChange('lynch')}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all border",
                          selectedPersona === 'lynch' ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-900/50" : "bg-transparent border-white/20 text-white/50 hover:border-white/40 hover:bg-white/5"
                        )}
                      >
                        Lynch Analysis
                      </button>
                    </div>
                  </div>
                  
                  <div className="mb-8 shrink-0 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">
                        Primary Focus: {selectedPersona === 'buffett' ? 'Intrinsic Value & Moats (Buffett/Munger)' : 'Growth Story & Earnings (Peter Lynch)'}
                      </h4>
                      <p className="text-gray-400 text-sm">
                        {selectedPersona === 'buffett' 
                          ? "This analysis focuses on the long-term competitive advantages, consistent earning power, and value proposition of your holdings." 
                          : "This critique looks at PEG ratios, the underlying story of the companies, and potential execution of their growth strategies."}
                      </p>
                    </div>
                    <div className="flex items-center justify-start md:justify-end">
                      <button 
                        onClick={() => handlePersonaChange(selectedPersona)}
                        className="px-6 py-3 bg-white text-black hover:bg-gray-200 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-xl"
                      >
                        Refresh Analysis
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar bg-white/5 rounded-2xl p-6 md:p-8">
                    <p className="text-lg md:text-xl leading-relaxed font-light italic text-gray-200">
                      "{insights || "Analyzing your portfolio strategy! Please wait, compiling multi-factor fundamental analysis..."}"
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Add/Edit Transaction Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-[40px] p-10 max-w-lg w-full shadow-2xl animate-in fade-in zoom-in duration-300">
            <h2 className="text-3xl font-black tracking-tighter uppercase italic mb-8">
              {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
            </h2>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              addTransaction(
                formData.get('ticker') as string,
                Number(formData.get('shares')),
                Number(formData.get('price')),
                modalType,
                formData.get('date') as string,
                editingTransaction?.id
              );
            }} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-1">Type</label>
                  <select 
                    name="type" 
                    value={modalType}
                    onChange={(e) => setModalType(e.target.value as any)}
                    className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black transition-all font-bold"
                  >
                    <option value="buy">BUY</option>
                    <option value="sell">SELL</option>
                    <option value="deposit">DEPOSIT CASH</option>
                    <option value="withdrawal">WITHDRAW CASH</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-1">
                    {modalType === 'deposit' || modalType === 'withdrawal' ? 'Reference' : 'Ticker Symbol'}
                  </label>
                  <input 
                    name="ticker" 
                    required 
                    defaultValue={editingTransaction?.ticker || (modalType === 'deposit' || modalType === 'withdrawal' ? 'CASH' : '')}
                    placeholder={modalType === 'deposit' || modalType === 'withdrawal' ? 'CASH' : 'AAPL'}
                    className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black transition-all font-bold uppercase"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-1">
                    {modalType === 'deposit' || modalType === 'withdrawal' ? 'Quantity' : 'Shares'}
                  </label>
                  <input 
                    name="shares" 
                    type="number" 
                    step="any"
                    required 
                    defaultValue={editingTransaction?.shares || (modalType === 'deposit' || modalType === 'withdrawal' ? '1' : '')}
                    placeholder="10"
                    className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black transition-all font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-1">
                    {modalType === 'deposit' || modalType === 'withdrawal' ? 'Amount' : 'Price per Share'}
                  </label>
                  <input 
                    name="price" 
                    type="number" 
                    step="any"
                    required 
                    defaultValue={editingTransaction?.price || ''}
                    placeholder="150.00"
                    className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black transition-all font-bold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-1">Date</label>
                <div className="relative">
                  <input 
                    name="date" 
                    type="date" 
                    required 
                    defaultValue={editingTransaction ? new Date(editingTransaction.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
                    className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black transition-all font-bold"
                  />
                  <Calendar className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingTransaction(null);
                  }}
                  className="flex-1 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-black text-white py-4 rounded-2xl font-bold hover:bg-gray-800 transition-all"
                >
                  {editingTransaction ? 'Update Transaction' : 'Record Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
