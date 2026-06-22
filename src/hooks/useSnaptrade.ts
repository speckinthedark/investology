import { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { doc, deleteDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { SnaptradeAccount, SnaptradeSettings, Transaction } from '../types';
import { toast } from 'sonner';

const SNAPTRADE_DOC = 'snaptrade';

export function useSnaptrade(user: User | null) {
  const [settings, setSettings] = useState<SnaptradeSettings | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);

  useEffect(() => {
    if (!user) { setSettings(null); return; }
    const unsub = onSnapshot(
      doc(db, 'users', user.uid, 'settings', SNAPTRADE_DOC),
      (snap) => setSettings(snap.exists() ? (snap.data() as SnaptradeSettings) : null),
      (err) => console.error('useSnaptrade snapshot error:', err),
    );
    return unsub;
  }, [user]);

  const credentials = useMemo(
    () => settings
      ? {
          clientId: settings.clientId,
          consumerKey: settings.consumerKey,
          snaptradeUserId: settings.snaptradeUserId,
          userSecret: settings.userSecret,
        }
      : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings?.clientId, settings?.consumerKey, settings?.snaptradeUserId, settings?.userSecret],
  );

  const register = async (clientId: string, consumerKey: string) => {
    if (!user) return;
    try {
      const res = await fetch('/api/snaptrade/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseUid: user.uid, clientId, consumerKey }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const { snaptradeUserId, userSecret } = await res.json() as { snaptradeUserId: string; userSecret: string };
      await setDoc(
        doc(db, 'users', user.uid, 'settings', SNAPTRADE_DOC),
        {
          clientId,
          consumerKey,
          snaptradeUserId,
          userSecret,
          connectedAt: new Date().toISOString(),
          lastSyncedAt: null,
          accounts: [],
        },
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to register with SnapTrade');
      throw e;
    }
  };

  const getConnectUrl = async (): Promise<string> => {
    if (!credentials) throw new Error('Not registered');
    const res = await fetch('/api/snaptrade/connect-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const { redirectUri } = await res.json() as { redirectUri: string };
    return redirectUri;
  };

  const refreshAccounts = async () => {
    if (!user || !credentials) return;
    try {
      const res = await fetch('/api/snaptrade/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const { accounts } = await res.json() as { accounts: SnaptradeAccount[] };
      await setDoc(
        doc(db, 'users', user.uid, 'settings', SNAPTRADE_DOC),
        { accounts },
        { merge: true },
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to refresh accounts');
    }
  };

  const sync = async (onData: (txs: Omit<Transaction, 'id'>[]) => Promise<void>) => {
    if (!user || !credentials) return;
    setIsSyncing(true);
    setSyncError(false);
    try {
      const accountIds = (settings?.accounts ?? []).map((a) => a.id);
      const res = await fetch('/api/snaptrade/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, accountIds }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const { transactions } = await res.json() as { transactions: Omit<Transaction, 'id'>[] };
      await onData(transactions);
      await setDoc(
        doc(db, 'users', user.uid, 'settings', SNAPTRADE_DOC),
        { lastSyncedAt: new Date().toISOString() },
        { merge: true },
      );
      toast.success(`Synced ${transactions.length} transactions`);
    } catch (e: unknown) {
      setSyncError(true);
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const disconnect = async (accountId: string) => {
    if (!user || !credentials) return;
    const authorizationId = (settings?.accounts ?? []).find((a) => a.id === accountId)?.authorizationId ?? '';
    try {
      const res = await fetch('/api/snaptrade/disconnect', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, authorizationId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await setDoc(
        doc(db, 'users', user.uid, 'settings', SNAPTRADE_DOC),
        { accounts: (settings?.accounts ?? []).filter((a) => a.id !== accountId) },
        { merge: true },
      );
      toast.success('Brokerage disconnected');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to disconnect');
    }
  };

  const clearApiKeys = async () => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'settings', SNAPTRADE_DOC));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to clear SnapTrade keys');
    }
  };

  return {
    credentials,
    accounts: settings?.accounts ?? [],
    lastSyncedAt: settings?.lastSyncedAt ?? null,
    isSyncing,
    syncError,
    register,
    getConnectUrl,
    refreshAccounts,
    sync,
    disconnect,
    clearApiKeys,
  };
}
