# SnapTrade Brokerage Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual eToro XLSX and IBKR XML imports with live brokerage connections via SnapTrade, syncing transactions and holdings automatically on app load and on demand.

**Architecture:** All SnapTrade API calls go through Express routes (server holds the API keys); the client receives transaction data and writes to Firestore via the existing `bulkImportTransactions()` hook. Per-user SnapTrade credentials (`snaptradeUserId` + `userSecret`) are stored in Firestore under `users/{uid}/settings/snaptrade`.

**Tech Stack:** `snaptrade-typescript-sdk` (server-side only), React 19, TypeScript, Firebase Firestore, Express 4, Tailwind v4, Lucide icons, Sonner toasts.

---

### Task 1: Install SDK, add env vars, add types

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `.env`
- Modify: `src/types.ts`

- [ ] **Step 1: Install the SnapTrade TypeScript SDK**

```bash
npm install snaptrade-typescript-sdk
```

Expected: `snaptrade-typescript-sdk` appears in `package.json` dependencies.

- [ ] **Step 2: Add env vars to `.env`**

Append to `.env`:

```
SNAPTRADE_CLIENT_ID=your_client_id_here
SNAPTRADE_CONSUMER_KEY=your_consumer_key_here
```

These are obtained from the SnapTrade developer dashboard at https://app.snaptrade.com. Use placeholder values for now; replace with real keys before testing live flows.

- [ ] **Step 3: Add SnapTrade types to `src/types.ts`**

Append to the bottom of `src/types.ts`:

```typescript
export interface SnaptradeAccount {
  id: string;
  name: string;
  brokerage: string;
}

export interface SnaptradeSettings {
  snaptradeUserId: string;
  userSecret: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  accounts: SnaptradeAccount[];
}
```

- [ ] **Step 4: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/types.ts .env
git commit -m "feat: install snaptrade-typescript-sdk and add types"
```

---

### Task 2: Server — initialize SDK and add register + connect-url routes

**Files:**
- Modify: `server.ts` (add SDK init at module scope; add two routes inside `startServer()`)

The SnapTrade client must be initialized once at module scope (outside `startServer()`), alongside `EXCHANGE_MAP` and the Yahoo Finance instance. All five SnapTrade routes are added inside `startServer()`, before the existing import routes.

- [ ] **Step 1: Add SDK import and client init to `server.ts`**

Add after the existing imports (after line 10, `import { XMLParser } from 'fast-xml-parser';`):

```typescript
import { Snaptrade } from 'snaptrade-typescript-sdk';
```

Add after `dotenv.config();` (around line 14), alongside `const ai = ...`:

```typescript
const snaptrade = process.env.SNAPTRADE_CLIENT_ID && process.env.SNAPTRADE_CONSUMER_KEY
  ? new Snaptrade({
      clientId: process.env.SNAPTRADE_CLIENT_ID,
      consumerKey: process.env.SNAPTRADE_CONSUMER_KEY,
    })
  : null;
```

- [ ] **Step 2: Add `POST /api/snaptrade/register` route**

Add inside `startServer()`, before the `// --- eToro XLSX import ---` comment (around line 615):

```typescript
  // --- SnapTrade routes ---
  app.post('/api/snaptrade/register', async (req, res) => {
    if (!snaptrade) return res.status(503).json({ error: 'SnapTrade not configured' });
    const { firebaseUid } = req.body as { firebaseUid: string };
    if (!firebaseUid) return res.status(400).json({ error: 'firebaseUid required' });
    try {
      const response = await snaptrade.authentication.registerSnapTradeUser({
        userId: firebaseUid,
      });
      const { userId: snaptradeUserId, userSecret } = response.data as { userId: string; userSecret: string };
      res.json({ snaptradeUserId, userSecret });
    } catch (e: unknown) {
      console.error('SnapTrade register error:', e);
      res.status(500).json({ error: e instanceof Error ? e.message : 'Registration failed' });
    }
  });
```

- [ ] **Step 3: Add `POST /api/snaptrade/connect-url` route**

Add immediately after the register route:

```typescript
  app.post('/api/snaptrade/connect-url', async (req, res) => {
    if (!snaptrade) return res.status(503).json({ error: 'SnapTrade not configured' });
    const { snaptradeUserId, userSecret, redirectUri } = req.body as {
      snaptradeUserId: string;
      userSecret: string;
      redirectUri: string;
    };
    if (!snaptradeUserId || !userSecret || !redirectUri) {
      return res.status(400).json({ error: 'snaptradeUserId, userSecret, redirectUri required' });
    }
    try {
      const response = await snaptrade.authentication.loginSnapTradeUser(
        { userId: snaptradeUserId, userSecret },
        { customRedirect: redirectUri, immediateRedirect: true },
      );
      const { redirectURI } = response.data as { redirectURI: string };
      res.json({ redirectUri: redirectURI });
    } catch (e: unknown) {
      console.error('SnapTrade connect-url error:', e);
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to generate connect URL' });
    }
  });
```

- [ ] **Step 4: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "feat: add snaptrade register and connect-url server routes"
```

---

### Task 3: Server — add accounts and disconnect routes

**Files:**
- Modify: `server.ts`

- [ ] **Step 1: Add `POST /api/snaptrade/accounts` route**

Add after the `connect-url` route:

```typescript
  app.post('/api/snaptrade/accounts', async (req, res) => {
    if (!snaptrade) return res.status(503).json({ error: 'SnapTrade not configured' });
    const { snaptradeUserId, userSecret } = req.body as { snaptradeUserId: string; userSecret: string };
    if (!snaptradeUserId || !userSecret) {
      return res.status(400).json({ error: 'snaptradeUserId and userSecret required' });
    }
    try {
      const response = await snaptrade.accountInformation.listUserAccounts({
        userId: snaptradeUserId,
        userSecret,
      });
      const raw = response.data as { id: string; name: string; institution_name: string }[];
      const accounts = raw.map((a) => ({
        id: a.id,
        name: a.name ?? a.institution_name ?? 'Account',
        brokerage: a.institution_name ?? 'Unknown',
      }));
      res.json({ accounts });
    } catch (e: unknown) {
      console.error('SnapTrade accounts error:', e);
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to fetch accounts' });
    }
  });
```

- [ ] **Step 2: Add `DELETE /api/snaptrade/disconnect` route**

Add after the accounts route:

```typescript
  app.delete('/api/snaptrade/disconnect', async (req, res) => {
    if (!snaptrade) return res.status(503).json({ error: 'SnapTrade not configured' });
    const { snaptradeUserId, userSecret, accountId } = req.body as {
      snaptradeUserId: string;
      userSecret: string;
      accountId: string;
    };
    if (!snaptradeUserId || !userSecret || !accountId) {
      return res.status(400).json({ error: 'snaptradeUserId, userSecret, accountId required' });
    }
    try {
      await snaptrade.connections.removeBrokerageAuthorization({
        authorizationId: accountId,
        userId: snaptradeUserId,
        userSecret,
      });
      res.json({ ok: true });
    } catch (e: unknown) {
      console.error('SnapTrade disconnect error:', e);
      res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to disconnect' });
    }
  });
```

- [ ] **Step 3: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "feat: add snaptrade accounts and disconnect server routes"
```

---

### Task 4: Server — add sync route with transaction mapping

**Files:**
- Modify: `server.ts`

The sync route fetches all activities from SnapTrade, filters to stock BUY/SELL only, maps to the app's `Transaction` type, and returns `{ transactions }`. Holdings are NOT computed server-side — `bulkImportTransactions()` handles that on the client.

- [ ] **Step 1: Add `POST /api/snaptrade/sync` route**

Add after the disconnect route:

```typescript
  app.post('/api/snaptrade/sync', async (req, res) => {
    if (!snaptrade) return res.status(503).json({ error: 'SnapTrade not configured' });
    const { snaptradeUserId, userSecret } = req.body as { snaptradeUserId: string; userSecret: string };
    if (!snaptradeUserId || !userSecret) {
      return res.status(400).json({ error: 'snaptradeUserId and userSecret required' });
    }
    try {
      const response = await snaptrade.transactionsAndReporting.getActivities({
        userId: snaptradeUserId,
        userSecret,
        startDate: '2010-01-01',
        endDate: new Date().toISOString().split('T')[0],
      });

      type RawActivity = {
        type?: string;
        symbol?: { symbol?: { symbol?: string } };
        units?: number | null;
        price?: number | null;
        trade_date?: string | null;
      };

      const raw = response.data as RawActivity[];

      const transactions = raw
        .filter((a) => {
          if (a.type !== 'BUY' && a.type !== 'SELL') return false;
          if (!a.symbol?.symbol?.symbol) return false;
          if (!a.units || a.units === 0) return false;
          if (a.price == null) return false;
          if (!a.trade_date) return false;
          return true;
        })
        .map((a) => ({
          ticker: a.symbol!.symbol!.symbol!.toUpperCase(),
          type: a.type === 'BUY' ? 'buy' : 'sell' as 'buy' | 'sell',
          shares: Math.abs(a.units!),
          price: a.price!,
          timestamp: new Date(a.trade_date!).toISOString(),
        }))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      res.json({ transactions });
    } catch (e: unknown) {
      console.error('SnapTrade sync error:', e);
      res.status(500).json({ error: e instanceof Error ? e.message : 'Sync failed' });
    }
  });
```

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server.ts
git commit -m "feat: add snaptrade sync route with buy/sell activity mapping"
```

---

### Task 5: `useSnaptrade` hook

**Files:**
- Create: `src/hooks/useSnaptrade.ts`

This hook subscribes to `users/{uid}/settings/snaptrade` in Firestore (real-time, same pattern as `usePortfolio`) and exposes all SnapTrade actions. The `sync()` function accepts a callback that receives the mapped transactions — App.tsx passes `bulkImportTransactions` as the callback, keeping Firestore writes out of the hook.

- [ ] **Step 1: Create `src/hooks/useSnaptrade.ts`**

```typescript
import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
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

  const credentials = settings
    ? { snaptradeUserId: settings.snaptradeUserId, userSecret: settings.userSecret }
    : null;

  const register = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/snaptrade/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseUid: user.uid }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const { snaptradeUserId, userSecret } = await res.json() as { snaptradeUserId: string; userSecret: string };
      await setDoc(
        doc(db, 'users', user.uid, 'settings', SNAPTRADE_DOC),
        {
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
    const redirectUri = `${window.location.origin}?snaptrade_auth=success`;
    const res = await fetch('/api/snaptrade/connect-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...credentials, redirectUri }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const { redirectUri: portalUrl } = await res.json() as { redirectUri: string };
    return portalUrl;
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
      const res = await fetch('/api/snaptrade/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
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
    try {
      const res = await fetch('/api/snaptrade/disconnect', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, accountId }),
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
  };
}
```

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSnaptrade.ts
git commit -m "feat: add useSnaptrade hook with Firestore subscription and all actions"
```

---

### Task 6: `SnaptradeStatusPill` component

**Files:**
- Create: `src/components/shared/SnaptradeStatusPill.tsx`

Compact pill rendered in the Topbar. Shows green/amber/gray dot + broker names + last sync time. Clicking calls `onNavigateToConnections`.

- [ ] **Step 1: Create `src/components/shared/SnaptradeStatusPill.tsx`**

```typescript
import { SnaptradeAccount } from '../../types';

interface Props {
  accounts: SnaptradeAccount[];
  lastSyncedAt: string | null;
  isSyncing: boolean;
  syncError: boolean;
  onNavigateToConnections: () => void;
}

function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function SnaptradeStatusPill({
  accounts, lastSyncedAt, isSyncing, syncError, onNavigateToConnections,
}: Props) {
  const connected = accounts.length > 0;

  const dotColor = isSyncing
    ? 'bg-amber-400 animate-pulse'
    : syncError
    ? 'bg-amber-500'
    : connected
    ? 'bg-emerald-500'
    : 'bg-zinc-600';

  const brokerNames = [...new Set(accounts.map((a) => a.brokerage))].join(' · ');

  const label = isSyncing
    ? 'Syncing…'
    : syncError
    ? 'Sync error'
    : connected
    ? brokerNames
    : 'Not connected';

  const sublabel = connected && lastSyncedAt && !isSyncing && !syncError
    ? `· synced ${fmtRelative(lastSyncedAt)}`
    : null;

  return (
    <button
      onClick={onNavigateToConnections}
      className="flex items-center gap-2 bg-zinc-800/80 border border-zinc-700/60 hover:border-zinc-600 rounded-full px-3 py-1.5 transition-all"
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span className="text-[11px] font-semibold text-zinc-300 whitespace-nowrap">{label}</span>
      {sublabel && (
        <span className="text-[10px] text-zinc-500 whitespace-nowrap">{sublabel}</span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/SnaptradeStatusPill.tsx
git commit -m "feat: add SnaptradeStatusPill topbar component"
```

---

### Task 7: `ConnectionsTab` component

**Files:**
- Create: `src/components/tabs/ConnectionsTab.tsx`

Full-page tab. Detects `?snaptrade_auth=success` on mount and calls `onRefreshAccounts`. Two states: empty (no accounts) and connected (account list).

- [ ] **Step 1: Create `src/components/tabs/ConnectionsTab.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { Loader2, Link, Unplug, RefreshCw, Plus } from 'lucide-react';
import { SnaptradeAccount } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  credentials: { snaptradeUserId: string; userSecret: string } | null;
  accounts: SnaptradeAccount[];
  lastSyncedAt: string | null;
  isSyncing: boolean;
  syncError: boolean;
  onRegister: () => Promise<void>;
  onGetConnectUrl: () => Promise<string>;
  onRefreshAccounts: () => Promise<void>;
  onSync: () => Promise<void>;
  onDisconnect: (accountId: string) => Promise<void>;
  onShowCsvImport: () => void;
}

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function ConnectionsTab({
  credentials, accounts, lastSyncedAt, isSyncing, syncError,
  onRegister, onGetConnectUrl, onRefreshAccounts, onSync, onDisconnect, onShowCsvImport,
}: Props) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  // Detect redirect back from SnapTrade portal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('snaptrade_auth') === 'success') {
      history.replaceState(null, '', window.location.pathname);
      onRefreshAccounts();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      if (!credentials) await onRegister();
      const url = await onGetConnectUrl();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // errors toasted inside hook
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    setDisconnectingId(accountId);
    try {
      await onDisconnect(accountId);
    } finally {
      setDisconnectingId(null);
    }
  };

  const isEmpty = accounts.length === 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Brokerage Connections</h1>
          {lastSyncedAt && !isEmpty && (
            <p className="text-[11px] text-zinc-500 mt-0.5">Last synced {fmtDatetime(lastSyncedAt)}</p>
          )}
          {syncError && (
            <p className="text-[11px] text-amber-400 mt-0.5">Last sync failed — try syncing again</p>
          )}
        </div>
        {!isEmpty && (
          <button
            onClick={onSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all"
          >
            {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {isSyncing ? 'Syncing…' : 'Sync Now'}
          </button>
        )}
      </div>

      {/* Empty state */}
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
            <Link className="w-6 h-6 text-zinc-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-300 mb-1">Connect your brokerages</p>
            <p className="text-xs text-zinc-500 max-w-xs">
              Link eToro or Interactive Brokers to automatically sync your transactions and holdings.
            </p>
          </div>
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all"
          >
            {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {isConnecting ? 'Opening…' : 'Connect Brokerage'}
          </button>
        </div>
      ) : (
        <>
          {/* Account list */}
          <div className="flex flex-col gap-3">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-black text-zinc-400 shrink-0 uppercase">
                    {account.brokerage.slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-200">{account.brokerage}</p>
                    <p className="text-[11px] text-zinc-500">{account.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Connected
                  </span>
                  <button
                    onClick={() => handleDisconnect(account.id)}
                    disabled={disconnectingId === account.id}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 border border-zinc-700 text-zinc-500 hover:text-rose-400 hover:border-rose-800 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all',
                      disconnectingId === account.id && 'opacity-40',
                    )}
                  >
                    <Unplug className="w-3 h-3" />
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add brokerage */}
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="flex items-center justify-center gap-2 w-full border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-500 hover:text-zinc-300 rounded-xl py-3.5 text-[11px] font-bold uppercase tracking-widest transition-all"
          >
            {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {isConnecting ? 'Opening…' : 'Add Brokerage'}
          </button>
        </>
      )}

      {/* CSV fallback */}
      <div className="border-t border-zinc-800 pt-4 text-center">
        <button
          onClick={onShowCsvImport}
          className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Or import from a StockPulse CSV backup
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/tabs/ConnectionsTab.tsx
git commit -m "feat: add ConnectionsTab with empty/connected states and portal redirect detection"
```

---

### Task 8: Sidebar — add Connections tab icon with status dot

**Files:**
- Modify: `src/components/Sidebar.tsx`

Add `'connections'` to the `Tab` type and add a new nav item using the lucide `Link` icon. The status dot is passed as a new prop.

- [ ] **Step 1: Update `src/components/Sidebar.tsx`**

Replace the full file content:

```typescript
import { useState } from 'react';
import { LayoutDashboard, ArrowUpDown, TrendingUp, BrainCircuit, LogOut, RefreshCw, Search, Link } from 'lucide-react';
import { User } from 'firebase/auth';
import { cn } from '../lib/utils';

export type Tab = 'overview' | 'transactions' | 'performance' | 'deep-dive' | 'research' | 'connections';

type DotStatus = 'connected' | 'error' | 'disconnected';

const NAV_ITEMS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',     label: 'Overview',     icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ArrowUpDown },
  { id: 'performance',  label: 'Performance',  icon: TrendingUp },
  { id: 'research',     label: 'Research',     icon: Search },
  { id: 'connections',  label: 'Connections',  icon: Link },
];

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onLogout: () => void;
  user: User;
  isRefreshing: boolean;
  onRefresh: () => void;
  connectionStatus: DotStatus;
}

export default function Sidebar({ activeTab, onTabChange, onLogout, user, isRefreshing, onRefresh, connectionStatus }: Props) {
  const [pinned, setPinned] = useState(false);

  const initials = (user.email ?? user.displayName ?? '?')
    .split(/[@.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

  const email = user.email ?? user.displayName ?? '';

  const handleTabChange = (tab: Tab) => {
    onTabChange(tab);
    setPinned(false);
  };

  const labelClass = cn(
    'text-[11px] font-bold uppercase tracking-widest whitespace-nowrap transition-opacity duration-150',
    pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
  );

  const dotColorClass =
    connectionStatus === 'connected' ? 'bg-emerald-500' :
    connectionStatus === 'error'     ? 'bg-amber-500' :
                                       'bg-zinc-600';

  return (
    <div
      className={cn(
        'group fixed left-0 top-0 h-full z-20',
        'bg-zinc-900 border-r border-zinc-800',
        'flex flex-col',
        pinned ? 'w-[220px]' : 'w-16 hover:w-[220px]',
        'transition-[width] duration-200 ease-in-out',
        'overflow-hidden',
      )}
    >
      {/* Logo block */}
      <div
        className="h-14 flex items-center px-4 shrink-0 gap-3 border-b border-zinc-800 cursor-pointer select-none"
        onClick={() => setPinned((v) => !v)}
      >
        <img src="/logo.png" alt="Investology" className="w-8 h-8 shrink-0 rounded-xl object-contain" />
        <span
          className={cn(
            'font-black text-sm tracking-tighter uppercase italic text-white',
            pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            'transition-opacity duration-150 whitespace-nowrap',
          )}
        >
          Investology
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 flex flex-col gap-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          const isConnections = id === 'connections';
          return (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              style={isActive ? { boxShadow: 'inset 3px 0 0 #a78bfa' } : undefined}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 w-full text-left transition-all',
                isActive
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300',
              )}
            >
              <div className="relative shrink-0">
                <Icon className="w-5 h-5" />
                {isConnections && (
                  <span className={cn('absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-zinc-900', dotColorClass)} />
                )}
              </div>
              <span className={labelClass}>{label}</span>
            </button>
          );
        })}

        {/* Deep Dive — coming soon */}
        <div className="flex-1" />
        <div className="mx-3 mb-1 border-t border-zinc-800/60" />
        <button
          onClick={() => handleTabChange('deep-dive')}
          className={cn(
            'flex items-center gap-3 px-4 py-2.5 w-full text-left transition-all opacity-40 hover:opacity-60',
            activeTab === 'deep-dive' && 'bg-zinc-800/50',
          )}
        >
          <BrainCircuit className="w-5 h-5 shrink-0 text-zinc-500" />
          <div className={cn(
            'flex items-center gap-2 transition-opacity duration-150',
            pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}>
            <span className="text-[11px] font-bold uppercase tracking-widest whitespace-nowrap text-zinc-500">
              Deep Dive
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded-full">
              Soon
            </span>
          </div>
        </button>
      </nav>

      {/* Bottom controls */}
      <div className="py-3 border-t border-zinc-800 flex flex-col gap-1">
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh prices"
          className="flex items-center gap-3 px-4 py-2.5 w-full text-left text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300 transition-all disabled:opacity-40"
        >
          <RefreshCw className={cn('w-5 h-5 shrink-0', isRefreshing && 'animate-spin')} />
          <span className={labelClass}>Refresh Prices</span>
        </button>

        <div className="flex items-center gap-3 px-4 py-2.5">
          <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[8px] font-black text-zinc-300 shrink-0 select-none">
            {initials}
          </div>
          <span
            className={cn(
              'text-[11px] text-zinc-400 whitespace-nowrap truncate max-w-[140px]',
              pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              'transition-opacity duration-150',
            )}
          >
            {email}
          </span>
        </div>

        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-4 py-2.5 w-full text-left text-zinc-500 hover:bg-zinc-800/50 hover:text-rose-400 transition-all"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          <span className={labelClass}>Sign out</span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: errors about `Tab` type mismatch in `App.tsx` — these will be fixed in Task 9.

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add Connections tab to sidebar with status dot badge"
```

---

### Task 9: Wire everything into `App.tsx` and `Topbar.tsx`

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Topbar.tsx`

`App.tsx` mounts `useSnaptrade`, derives the `connectionStatus` for the sidebar, handles the auto-sync on load, passes props to `ConnectionsTab` and `SnaptradeStatusPill`.

- [ ] **Step 1: Update `src/components/Topbar.tsx` to accept and render the pill**

Replace the full file:

```typescript
import { User } from 'firebase/auth';
import { RefreshCw, LogOut } from 'lucide-react';
import { cn } from '../lib/utils';
import SnaptradeStatusPill from './shared/SnaptradeStatusPill';
import { SnaptradeAccount } from '../types';

interface Props {
  user: User;
  isRefreshing: boolean;
  onRefresh: () => void;
  onLogout: () => void;
  snaptradeAccounts: SnaptradeAccount[];
  snaptradeLastSyncedAt: string | null;
  snaptradeSyncing: boolean;
  snaptradeSyncError: boolean;
  onNavigateToConnections: () => void;
}

export default function Topbar({
  user, isRefreshing, onRefresh, onLogout,
  snaptradeAccounts, snaptradeLastSyncedAt, snaptradeSyncing, snaptradeSyncError,
  onNavigateToConnections,
}: Props) {
  const initials = (user.email ?? user.displayName ?? '?')
    .split(/[@.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

  return (
    <div className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center justify-end px-6 gap-3 shrink-0">
      <SnaptradeStatusPill
        accounts={snaptradeAccounts}
        lastSyncedAt={snaptradeLastSyncedAt}
        isSyncing={snaptradeSyncing}
        syncError={snaptradeSyncError}
        onNavigateToConnections={onNavigateToConnections}
      />
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        title="Refresh prices"
        className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-full transition-colors disabled:opacity-40"
      >
        <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
      </button>
      <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-[11px] font-black text-zinc-300 select-none">
        {initials}
      </div>
      <button
        onClick={onLogout}
        title="Log out"
        className="p-2 hover:bg-rose-950/60 text-zinc-500 hover:text-rose-400 rounded-full transition-colors"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Update `src/App.tsx`**

Make the following changes to `App.tsx` (apply each change in order):

**2a — Update the `Tab` type and add new imports:**

Replace the existing `Tab` type at line 29:
```typescript
// Remove this line:
type Tab = 'overview' | 'transactions' | 'performance' | 'deep-dive' | 'research';
```

Add these imports alongside the existing ones:
```typescript
import { Tab } from './components/Sidebar';
import ConnectionsTab from './components/tabs/ConnectionsTab';
import { useSnaptrade } from './hooks/useSnaptrade';
```

**2b — Mount `useSnaptrade` and add auto-sync effect:**

After the `usePortfolio` line (line 33), add:
```typescript
  const snaptrade = useSnaptrade(user);
```

After the existing `useEffect` blocks (after line 74, the `fetchFXRates` effect), add the auto-sync effect:
```typescript
  useEffect(() => {
    if (!snaptrade.credentials) return;
    const lastSync = snaptrade.lastSyncedAt ? new Date(snaptrade.lastSyncedAt) : null;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (!lastSync || lastSync < oneHourAgo) {
      snaptrade.sync(bulkImportTransactions);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snaptrade.credentials]);
```

**2c — Derive `connectionStatus` for Sidebar:**

After the `ytdTWR` useMemo (after line 100), add:
```typescript
  const connectionStatus = snaptrade.syncError
    ? 'error'
    : snaptrade.accounts.length > 0
    ? 'connected'
    : 'disconnected';
```

**2d — Update `Sidebar` usage (around line 160):**

```tsx
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onLogout={logout}
          user={user}
          isRefreshing={isRefreshing}
          onRefresh={refreshPrices}
          connectionStatus={connectionStatus as 'connected' | 'error' | 'disconnected'}
        />
```

**2e — Remove the Topbar import of the old version and replace the Topbar usage** (the KPI header block in App.tsx does not use Topbar — the Topbar component is rendered inside `InsightsTab` layout or not used directly in App.tsx main render):

Looking at App.tsx, there is no `<Topbar />` rendered currently — the KPI header is inline in App.tsx. Add Topbar above the KPI header, just after the `firestoreError` block (around line 177):

```tsx
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
```

**2f — Add `ConnectionsTab` rendering in the tab switcher** (after the `research` tab block, around line 348):

```tsx
                {activeTab === 'connections' && (
                  <ConnectionsTab
                    credentials={snaptrade.credentials}
                    accounts={snaptrade.accounts}
                    lastSyncedAt={snaptrade.lastSyncedAt}
                    isSyncing={snaptrade.isSyncing}
                    syncError={snaptrade.syncError}
                    onRegister={snaptrade.register}
                    onGetConnectUrl={snaptrade.getConnectUrl}
                    onRefreshAccounts={snaptrade.refreshAccounts}
                    onSync={() => snaptrade.sync(bulkImportTransactions)}
                    onDisconnect={snaptrade.disconnect}
                    onShowCsvImport={() => setShowImportGuide(true)}
                  />
                )}
```

**2g — Update the overflow class** for the connections tab (the existing `activeTab === 'research'` check, around line 271):

```tsx
          <div className={cn('flex-1 min-h-0 custom-scrollbar', activeTab === 'research' ? 'overflow-hidden' : 'overflow-y-auto')}>
```

This line is already correct — `connections` tab will scroll normally since it doesn't match `'research'`. No change needed.

- [ ] **Step 3: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/Topbar.tsx
git commit -m "feat: wire useSnaptrade into App, add ConnectionsTab routing, update Topbar with status pill"
```

---

### Task 10: Remove old import UI

**Files:**
- Modify: `src/components/ImportGuidePanel.tsx`
- Modify: `src/components/tabs/TransactionsTab.tsx`
- Modify: `src/App.tsx`

Remove the eToro and IBKR tabs from `ImportGuidePanel` (keep StockPulse CSV only). Remove the `onImport` prop and Import button from `TransactionsTab`. Remove `onImport` from the `TransactionsTab` usage in App.tsx.

- [ ] **Step 1: Simplify `ImportGuidePanel` — remove eToro and IBKR broker types**

In `src/components/ImportGuidePanel.tsx`, change line 8:
```typescript
// From:
type Broker = 'stockpulse' | 'etoro' | 'ibkr';
// To:
type Broker = 'stockpulse';
```

Remove the `IBKR_STEPS`, `ETORO_STEPS`, `IBKR_FIELDS`, `ETORO_FIELDS` constants and all code that references `broker === 'ibkr'` or `broker === 'etoro'`. Remove the broker selector UI (the `(['stockpulse', 'etoro', 'ibkr'] as Broker[]).map(...)` button group). Remove the `fetch('/api/import/etoro', ...)` and `fetch('/api/import/ibkr', ...)` branches.

The simplified component should only show the StockPulse CSV tab — no broker picker, no step-by-step guides for eToro/IBKR, just the file upload for the StockPulse CSV format.

- [ ] **Step 2: Remove `onImport` from `TransactionsTab`**

In `src/components/tabs/TransactionsTab.tsx`:

Remove `onImport: () => void;` from the `Props` interface.

Remove `onImport` from the destructured props in the function signature.

Remove the Import button (lines 160–166):
```tsx
          <button
            onClick={onImport}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            <FolderUp className="w-3.5 h-3.5" />
            Import
          </button>
```

Remove `FolderUp` from the lucide import (line 2) since it's no longer used.

- [ ] **Step 3: Update `TransactionsTab` usage in `App.tsx`**

In `App.tsx`, remove `onImport={() => setShowImportGuide(true)}` from the `<TransactionsTab>` props.

- [ ] **Step 4: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ImportGuidePanel.tsx src/components/tabs/TransactionsTab.tsx src/App.tsx
git commit -m "feat: remove etoro/ibkr manual import UI, keep stockpulse csv backup only"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| POST /api/snaptrade/register | Task 2 |
| POST /api/snaptrade/connect-url | Task 2 |
| POST /api/snaptrade/accounts | Task 3 |
| DELETE /api/snaptrade/disconnect | Task 3 |
| POST /api/snaptrade/sync (BUY/SELL mapping) | Task 4 |
| `useSnaptrade` hook with Firestore subscription | Task 5 |
| Auto-sync on mount (null or >1h) | Task 9 (App.tsx useEffect) |
| `SnaptradeStatusPill` (green/amber/gray) | Task 6 |
| `ConnectionsTab` empty + connected states | Task 7 |
| Redirect detection `?snaptrade_auth=success` | Task 7 |
| Sidebar Connections icon + status dot | Task 8 |
| Topbar pill render | Task 9 |
| Remove eToro/IBKR import UI | Task 10 |
| Remove Import button from TransactionsTab | Task 10 |
| Keep StockPulse CSV import | Task 10 |
| `SnaptradeSettings` Firestore schema | Task 1 (types) + Task 5 (hook writes) |

All spec requirements are covered. No gaps found.

**Type consistency check:** `SnaptradeAccount` and `SnaptradeSettings` defined in Task 1 and used consistently in Tasks 5, 6, 7, 8, 9. `sync()` callback signature `(txs: Omit<Transaction, 'id'>[]) => Promise<void>` matches `bulkImportTransactions` signature from `usePortfolio`. `Tab` type exported from `Sidebar.tsx` in Task 8 and imported in App.tsx in Task 9 — consistent.
