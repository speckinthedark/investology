import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  collection, onSnapshot, doc, setDoc, addDoc,
  deleteDoc, query, orderBy, getDocs, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Holding, Transaction } from '../types';
import { toast } from 'sonner';

const SETTINGS_DOC = 'portfolio';

export function usePortfolio(user: User | null) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cashBalance, setCashBalanceState] = useState(0);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setHoldings([]);
      setTransactions([]);
      setCashBalanceState(0);
      return;
    }

    const onError = (err: Error) => {
      console.error('Firestore error:', err);
      setFirestoreError(err.message);
    };

    const holdingsUnsub = onSnapshot(
      collection(db, 'users', user.uid, 'holdings'),
      (snap) => setHoldings(snap.docs.map((d) => d.data() as Holding)),
      onError
    );

    const txUnsub = onSnapshot(
      query(collection(db, 'users', user.uid, 'transactions'), orderBy('timestamp', 'desc')),
      (snap) => setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction))),
      onError
    );

    const settingsUnsub = onSnapshot(
      doc(db, 'users', user.uid, 'settings', SETTINGS_DOC),
      (snap) => setCashBalanceState(snap.data()?.cashBalance ?? 0),
      onError
    );

    return () => {
      holdingsUnsub();
      txUnsub();
      settingsUnsub();
    };
  }, [user]);

  const setCashBalance = async (amount: number) => {
    if (!user) return;
    await setDoc(
      doc(db, 'users', user.uid, 'settings', SETTINGS_DOC),
      { cashBalance: amount },
      { merge: true }
    );
  };

  const recalcHolding = async (ticker: string) => {
    if (!user) return;
    const snap = await getDocs(
      query(collection(db, 'users', user.uid, 'transactions'), orderBy('timestamp', 'asc'))
    );
    const tickerTxs = snap.docs
      .map((d) => d.data() as Transaction)
      .filter((tx) => tx.ticker === ticker);

    let shares = 0;
    let avgPrice = 0;
    tickerTxs.forEach((tx) => {
      if (tx.type === 'buy') {
        const newShares = shares + tx.shares;
        avgPrice = (shares * avgPrice + tx.shares * tx.price) / newShares;
        shares = newShares;
      } else if (tx.type === 'sell') {
        shares = Math.max(0, shares - tx.shares);
        if (shares === 0) avgPrice = 0;
      }
    });

    const ref = doc(db, 'users', user.uid, 'holdings', ticker);
    if (shares > 0) {
      await setDoc(ref, { ticker, shares, averagePrice: avgPrice });
    } else {
      await deleteDoc(ref);
    }
  };

  const addTransaction = async (
    ticker: string,
    shares: number,
    price: number,
    type: Transaction['type'],
    date: string,
    id?: string
  ) => {
    if (!user) return;
    const tickerUpper = (ticker || 'CASH').toUpperCase();
    const txData = {
      ticker: tickerUpper,
      type,
      shares: type === 'deposit' || type === 'withdrawal' ? 1 : shares,
      price,
      timestamp: new Date(date).toISOString(),
    };

    if (id) {
      await setDoc(doc(db, 'users', user.uid, 'transactions', id), txData);
    } else {
      await addDoc(collection(db, 'users', user.uid, 'transactions'), txData);
    }

    if (type === 'buy' || type === 'sell') {
      await recalcHolding(tickerUpper);
    }
  };

  const deleteTransaction = async (id: string, ticker: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'transactions', id));
    if (ticker !== 'CASH') await recalcHolding(ticker);
    toast.success('Transaction deleted');
  };

  const deleteHolding = async (ticker: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'holdings', ticker));
    toast.success('Holding deleted');
  };

  const bulkImportTransactions = async (newTxs: Omit<Transaction, 'id'>[]) => {
    if (!user) return;

    // Append all new transaction docs in batches of 500
    for (let i = 0; i < newTxs.length; i += 500) {
      const batch = writeBatch(db);
      newTxs.slice(i, i + 500).forEach((tx) => {
        const ref = doc(collection(db, 'users', user.uid, 'transactions'));
        batch.set(ref, {
          ticker: tx.ticker.toUpperCase(),
          type: tx.type,
          shares: tx.type === 'deposit' || tx.type === 'withdrawal' ? 1 : tx.shares,
          price: tx.price,
          timestamp: new Date(tx.timestamp).toISOString(),
        });
      });
      await batch.commit();
    }

    // Replay ALL transactions (existing + newly added) to compute combined holdings
    const snap = await getDocs(
      query(collection(db, 'users', user.uid, 'transactions'), orderBy('timestamp', 'asc'))
    );
    const allTxs = snap.docs.map((d) => d.data() as Transaction);
    const positions: Record<string, { shares: number; avgPrice: number }> = {};
    for (const tx of allTxs) {
      if (tx.type !== 'buy' && tx.type !== 'sell') continue;
      const pos = positions[tx.ticker] ?? { shares: 0, avgPrice: 0 };
      if (tx.type === 'buy') {
        const newShares = pos.shares + tx.shares;
        pos.avgPrice = (pos.shares * pos.avgPrice + tx.shares * tx.price) / newShares;
        pos.shares = newShares;
      } else {
        pos.shares -= tx.shares;
        if (pos.shares <= 0) pos.avgPrice = 0;
      }
      positions[tx.ticker] = pos;
    }

    // Delete stale holdings and write freshly computed ones
    const existingSnap = await getDocs(collection(db, 'users', user.uid, 'holdings'));
    const holdingsBatch = writeBatch(db);
    existingSnap.docs.forEach((d) => holdingsBatch.delete(d.ref));
    for (const [ticker, { shares, avgPrice }] of Object.entries(positions)) {
      if (shares > 0.0001) {
        holdingsBatch.set(doc(db, 'users', user.uid, 'holdings', ticker), {
          ticker, shares, averagePrice: avgPrice,
        });
      }
    }
    await holdingsBatch.commit();
    toast.success(`Imported ${newTxs.length} transactions`);
  };

  const clearAllTransactions = async () => {
    if (!user) return;
    const [txSnap, holdingsSnap] = await Promise.all([
      getDocs(collection(db, 'users', user.uid, 'transactions')),
      getDocs(collection(db, 'users', user.uid, 'holdings')),
    ]);
    const allDocs = [...txSnap.docs, ...holdingsSnap.docs];
    // Firestore batch limit is 500 operations
    for (let i = 0; i < allDocs.length; i += 500) {
      const batch = writeBatch(db);
      allDocs.slice(i, i + 500).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    toast.success('Transaction log cleared');
  };

  return {
    holdings,
    transactions,
    cashBalance,
    firestoreError,
    setCashBalance,
    addTransaction,
    bulkImportTransactions,
    deleteTransaction,
    deleteHolding,
    clearAllTransactions,
  };
}
