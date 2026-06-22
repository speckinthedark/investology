# SnapTrade Bring-Your-Own-Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared, env-var-configured SnapTrade developer credentials with per-user credentials that each user enters themselves, so brokerage connection quotas are independent per user instead of shared across the whole app.

**Architecture:** The backend stops holding a single module-scoped `Snaptrade` SDK client built from env vars; instead each of the 5 SnapTrade routes builds a request-scoped client from `clientId`/`consumerKey` passed in the request body. The frontend stores each user's own `clientId`/`consumerKey` in their existing Firestore settings doc (same doc as `snaptradeUserId`/`userSecret`) and threads them through every SnapTrade API call. A new form in the Connections tab collects the keys before any brokerage connection can happen.

**Tech Stack:** React 19, TypeScript, Express 4, Firestore (client SDK), `snaptrade-typescript-sdk`.

---

## File Map

| File | Change |
|---|---|
| `src/types.ts` | Add `clientId`, `consumerKey` to `SnaptradeSettings` |
| `server.ts` | Remove shared `snaptrade` instance + env vars; add `snaptradeClient()` helper; update 5 routes |
| `src/hooks/useSnaptrade.ts` | `register()` takes user keys; `credentials` memo includes them; add `clearApiKeys()` |
| `src/components/tabs/ConnectionsTab.tsx` | Add `SnapTradeKeysForm` sub-component + edit/confirm flow |
| `src/App.tsx` | Wire `onClearApiKeys` prop |
| `CLAUDE.md`, `README.md` | Remove `SNAPTRADE_CLIENT_ID`/`SNAPTRADE_CONSUMER_KEY` env docs, note BYO-keys model |

---

## Task 1: Extend SnaptradeSettings type

**Files:**
- Modify: `src/types.ts:227-233`

- [ ] **Step 1: Add clientId and consumerKey fields**

In `src/types.ts`, find:

```ts
export interface SnaptradeSettings {
  snaptradeUserId: string;
  userSecret: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  accounts: SnaptradeAccount[];
}
```

Replace with:

```ts
export interface SnaptradeSettings {
  clientId: string;
  consumerKey: string;
  snaptradeUserId: string;
  userSecret: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  accounts: SnaptradeAccount[];
}
```

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: zero errors. `setDoc()` calls in this codebase use an untyped `DocumentReference<DocumentData>` (no Firestore converter), so widening `SnaptradeSettings` doesn't surface as a compile error anywhere yet — it only takes effect once Tasks 3 and 4 read/write the new fields explicitly.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add clientId and consumerKey to SnaptradeSettings"
```

---

## Task 2: Replace shared SnapTrade client with per-request client in server.ts

**Files:**
- Modify: `server.ts:27-32` (remove shared instance)
- Modify: `server.ts:624-785` (5 routes)

- [ ] **Step 1: Remove the shared module-scoped client**

In `server.ts`, find:

```ts
const snaptrade = process.env.SNAPTRADE_CLIENT_ID && process.env.SNAPTRADE_CONSUMER_KEY
  ? new Snaptrade({
      clientId: process.env.SNAPTRADE_CLIENT_ID,
      consumerKey: process.env.SNAPTRADE_CONSUMER_KEY,
    })
  : null;
```

Delete it entirely. The `import { Snaptrade } from 'snaptrade-typescript-sdk';` line stays — it's used by the new helper below.

- [ ] **Step 2: Add the per-request client helper**

Find the `// --- SnapTrade routes ---` comment (around line 624) and add this helper immediately above it:

```ts
function snaptradeClient(clientId: string, consumerKey: string) {
  return new Snaptrade({ clientId, consumerKey });
}

// --- SnapTrade routes ---
```

- [ ] **Step 3: Update the register route**

Find:

```ts
  app.post('/api/snaptrade/register', async (req, res) => {
    if (!snaptrade) return res.status(503).json({ error: 'SnapTrade not configured' });
    const { firebaseUid } = req.body as { firebaseUid: string };
    if (!firebaseUid) return res.status(400).json({ error: 'firebaseUid required' });
    const doRegister = () => snaptrade!.authentication.registerSnapTradeUser({ userId: firebaseUid });
    try {
      const response = await doRegister();
      const { userId: snaptradeUserId, userSecret } = response.data as { userId: string; userSecret: string };
      res.json({ snaptradeUserId, userSecret });
    } catch (e: any) {
      if (e?.status === 400) {
        // User already exists in SnapTrade — delete and re-register to get a fresh secret
        try {
          await snaptrade.authentication.deleteSnapTradeUser({ userId: firebaseUid });
          const response = await doRegister();
          const { userId: snaptradeUserId, userSecret } = response.data as { userId: string; userSecret: string };
          return res.json({ snaptradeUserId, userSecret });
        } catch (e2: any) {
          console.error('SnapTrade re-register error:', e2);
          const detail = e2?.responseBody ? JSON.parse(e2.responseBody)?.detail : null;
          return res.status(500).json({ error: detail ?? 'Registration failed — delete existing users from the SnapTrade dashboard and try again' });
        }
      }
      console.error('SnapTrade register error:', e);
      res.status(500).json({ error: 'Registration failed' });
    }
  });
```

Replace with:

```ts
  app.post('/api/snaptrade/register', async (req, res) => {
    const { firebaseUid, clientId, consumerKey } = req.body as { firebaseUid: string; clientId: string; consumerKey: string };
    if (!firebaseUid || !clientId || !consumerKey) {
      return res.status(400).json({ error: 'firebaseUid, clientId, and consumerKey required' });
    }
    const client = snaptradeClient(clientId, consumerKey);
    const doRegister = () => client.authentication.registerSnapTradeUser({ userId: firebaseUid });
    try {
      const response = await doRegister();
      const { userId: snaptradeUserId, userSecret } = response.data as { userId: string; userSecret: string };
      res.json({ snaptradeUserId, userSecret });
    } catch (e: any) {
      if (e?.status === 400) {
        // User already exists in SnapTrade — delete and re-register to get a fresh secret
        try {
          await client.authentication.deleteSnapTradeUser({ userId: firebaseUid });
          const response = await doRegister();
          const { userId: snaptradeUserId, userSecret } = response.data as { userId: string; userSecret: string };
          return res.json({ snaptradeUserId, userSecret });
        } catch (e2: any) {
          console.error('SnapTrade re-register error:', e2);
          const detail = e2?.responseBody ? JSON.parse(e2.responseBody)?.detail : null;
          return res.status(500).json({ error: detail ?? 'Registration failed — delete existing users from the SnapTrade dashboard and try again' });
        }
      }
      console.error('SnapTrade register error:', e);
      res.status(500).json({ error: 'Registration failed' });
    }
  });
```

- [ ] **Step 4: Update the connect-url route**

Find:

```ts
  app.post('/api/snaptrade/connect-url', async (req, res) => {
    if (!snaptrade) return res.status(503).json({ error: 'SnapTrade not configured' });
    const { snaptradeUserId, userSecret } = req.body as {
      snaptradeUserId: string;
      userSecret: string;
    };
    if (!snaptradeUserId || !userSecret) {
      return res.status(400).json({ error: 'snaptradeUserId and userSecret required' });
    }
    const redirectUri = `${req.headers.origin ?? ''}?snaptrade_auth=success`;
    try {
      const response = await snaptrade.authentication.loginSnapTradeUser({
        userId: snaptradeUserId,
        userSecret,
        customRedirect: redirectUri,
      });
      const { redirectURI } = response.data as { redirectURI: string };
      res.json({ redirectUri: redirectURI });
    } catch (e) {
      console.error('SnapTrade connect-url error:', e);
      res.status(500).json({ error: 'Failed to generate connect URL' });
    }
  });
```

Replace with:

```ts
  app.post('/api/snaptrade/connect-url', async (req, res) => {
    const { snaptradeUserId, userSecret, clientId, consumerKey } = req.body as {
      snaptradeUserId: string;
      userSecret: string;
      clientId: string;
      consumerKey: string;
    };
    if (!snaptradeUserId || !userSecret || !clientId || !consumerKey) {
      return res.status(400).json({ error: 'snaptradeUserId, userSecret, clientId, and consumerKey required' });
    }
    const redirectUri = `${req.headers.origin ?? ''}?snaptrade_auth=success`;
    try {
      const response = await snaptradeClient(clientId, consumerKey).authentication.loginSnapTradeUser({
        userId: snaptradeUserId,
        userSecret,
        customRedirect: redirectUri,
      });
      const { redirectURI } = response.data as { redirectURI: string };
      res.json({ redirectUri: redirectURI });
    } catch (e) {
      console.error('SnapTrade connect-url error:', e);
      res.status(500).json({ error: 'Failed to generate connect URL' });
    }
  });
```

- [ ] **Step 5: Update the accounts route**

Find:

```ts
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
      const raw = response.data as { id: string; name: string; institution_name: string; brokerage_authorization?: string }[];
      const accounts = raw.map((a) => ({
        id: a.id,
        name: a.name ?? a.institution_name ?? 'Account',
        brokerage: a.institution_name ?? 'Unknown',
        authorizationId: a.brokerage_authorization ?? '',
      }));
      res.json({ accounts });
    } catch (e) {
      console.error('SnapTrade accounts error:', e);
      res.status(500).json({ error: 'Failed to fetch accounts' });
    }
  });
```

Replace with:

```ts
  app.post('/api/snaptrade/accounts', async (req, res) => {
    const { snaptradeUserId, userSecret, clientId, consumerKey } = req.body as {
      snaptradeUserId: string;
      userSecret: string;
      clientId: string;
      consumerKey: string;
    };
    if (!snaptradeUserId || !userSecret || !clientId || !consumerKey) {
      return res.status(400).json({ error: 'snaptradeUserId, userSecret, clientId, and consumerKey required' });
    }
    try {
      const response = await snaptradeClient(clientId, consumerKey).accountInformation.listUserAccounts({
        userId: snaptradeUserId,
        userSecret,
      });
      const raw = response.data as { id: string; name: string; institution_name: string; brokerage_authorization?: string }[];
      const accounts = raw.map((a) => ({
        id: a.id,
        name: a.name ?? a.institution_name ?? 'Account',
        brokerage: a.institution_name ?? 'Unknown',
        authorizationId: a.brokerage_authorization ?? '',
      }));
      res.json({ accounts });
    } catch (e) {
      console.error('SnapTrade accounts error:', e);
      res.status(500).json({ error: 'Failed to fetch accounts' });
    }
  });
```

- [ ] **Step 6: Update the disconnect route**

Find:

```ts
  app.delete('/api/snaptrade/disconnect', async (req, res) => {
    if (!snaptrade) return res.status(503).json({ error: 'SnapTrade not configured' });
    const { snaptradeUserId, userSecret, authorizationId } = req.body as {
      snaptradeUserId: string;
      userSecret: string;
      authorizationId: string;
    };
    if (!snaptradeUserId || !userSecret || !authorizationId) {
      return res.status(400).json({ error: 'snaptradeUserId, userSecret, authorizationId required' });
    }
    try {
      await snaptrade.connections.removeBrokerageAuthorization({
        authorizationId,
        userId: snaptradeUserId,
        userSecret,
      });
      res.json({ ok: true });
    } catch (e) {
      console.error('SnapTrade disconnect error:', e);
      res.status(500).json({ error: 'Failed to disconnect' });
    }
  });
```

Replace with:

```ts
  app.delete('/api/snaptrade/disconnect', async (req, res) => {
    const { snaptradeUserId, userSecret, authorizationId, clientId, consumerKey } = req.body as {
      snaptradeUserId: string;
      userSecret: string;
      authorizationId: string;
      clientId: string;
      consumerKey: string;
    };
    if (!snaptradeUserId || !userSecret || !authorizationId || !clientId || !consumerKey) {
      return res.status(400).json({ error: 'snaptradeUserId, userSecret, authorizationId, clientId, and consumerKey required' });
    }
    try {
      await snaptradeClient(clientId, consumerKey).connections.removeBrokerageAuthorization({
        authorizationId,
        userId: snaptradeUserId,
        userSecret,
      });
      res.json({ ok: true });
    } catch (e) {
      console.error('SnapTrade disconnect error:', e);
      res.status(500).json({ error: 'Failed to disconnect' });
    }
  });
```

- [ ] **Step 7: Update the sync route**

Find:

```ts
  app.post('/api/snaptrade/sync', async (req, res) => {
    if (!snaptrade) return res.status(503).json({ error: 'SnapTrade not configured' });
    const { snaptradeUserId, userSecret, accountIds } = req.body as {
      snaptradeUserId: string;
      userSecret: string;
      accountIds: string[];
    };
    if (!snaptradeUserId || !userSecret) {
      return res.status(400).json({ error: 'snaptradeUserId and userSecret required' });
    }
    if (!accountIds?.length) {
      return res.json({ transactions: [] });
    }
    try {
      type RawPosition = {
        symbol?: { symbol?: { symbol?: string; raw_symbol?: string } };
        units?: number | null;
        average_purchase_price?: number | null;
        price?: number | null;
      };

      const positionMap = new Map<string, { shares: number; price: number }>();

      for (const accountId of accountIds) {
        const response = await snaptrade!.accountInformation.getUserAccountPositions({
          accountId,
          userId: snaptradeUserId,
          userSecret,
        });
```

(That last block continues — only the lines shown above change. The rest of the route body, from `const positions = response.data as RawPosition[];` through the closing `});`, stays exactly as-is.)

Replace the shown lines with:

```ts
  app.post('/api/snaptrade/sync', async (req, res) => {
    const { snaptradeUserId, userSecret, accountIds, clientId, consumerKey } = req.body as {
      snaptradeUserId: string;
      userSecret: string;
      accountIds: string[];
      clientId: string;
      consumerKey: string;
    };
    if (!snaptradeUserId || !userSecret || !clientId || !consumerKey) {
      return res.status(400).json({ error: 'snaptradeUserId, userSecret, clientId, and consumerKey required' });
    }
    if (!accountIds?.length) {
      return res.json({ transactions: [] });
    }
    const client = snaptradeClient(clientId, consumerKey);
    try {
      type RawPosition = {
        symbol?: { symbol?: { symbol?: string; raw_symbol?: string } };
        units?: number | null;
        average_purchase_price?: number | null;
        price?: number | null;
      };

      const positionMap = new Map<string, { shares: number; price: number }>();

      for (const accountId of accountIds) {
        const response = await client.accountInformation.getUserAccountPositions({
          accountId,
          userId: snaptradeUserId,
          userSecret,
        });
```

- [ ] **Step 8: Type-check**

```bash
npm run lint
```

Expected: zero errors. `useSnaptrade.ts` calls `fetch()` with a plain JS object body, which isn't type-checked against `server.ts`'s `req.body` shape, so it won't surface a mismatch yet — that's covered by manual verification in Step 9 instead.

- [ ] **Step 9: Restart server and verify a route rejects missing keys**

```bash
lsof -ti:3008 | xargs kill -9 2>/dev/null || true
PORT=3008 npm run dev > /tmp/stockpulse-dev.log 2>&1 &
sleep 5
curl -s -X POST http://localhost:3008/api/snaptrade/register \
  -H "Content-Type: application/json" \
  -d '{"firebaseUid":"test123"}'
```

Expected output:
```json
{"error":"firebaseUid, clientId, and consumerKey required"}
```

This confirms the 503 "not configured" guard is gone and the route now validates the new required fields instead.

- [ ] **Step 10: Commit**

```bash
git add server.ts
git commit -m "feat: build SnapTrade client per-request from request body instead of shared env-var instance"
```

---

## Task 3: Update useSnaptrade.ts hook

**Files:**
- Modify: `src/hooks/useSnaptrade.ts`

- [ ] **Step 1: Add deleteDoc to the firebase/firestore import**

Find:

```ts
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
```

Replace with:

```ts
import { doc, deleteDoc, onSnapshot, setDoc } from 'firebase/firestore';
```

- [ ] **Step 2: Update the credentials memo to include clientId and consumerKey**

Find:

```ts
  const credentials = useMemo(
    () => settings ? { snaptradeUserId: settings.snaptradeUserId, userSecret: settings.userSecret } : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings?.snaptradeUserId, settings?.userSecret],
  );
```

Replace with:

```ts
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
```

This is the only change needed to thread `clientId`/`consumerKey` through `getConnectUrl`, `refreshAccounts`, `sync`, and `disconnect` — all four already build their request bodies from this `credentials` object (`JSON.stringify(credentials)` or `{ ...credentials, ... }`), so enriching the memo automatically enriches every request body.

- [ ] **Step 3: Update register() to accept and persist the user's own keys**

Find:

```ts
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
```

Replace with:

```ts
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
```

- [ ] **Step 4: Add clearApiKeys()**

Find the `disconnect` function's closing brace (the last function before the `return { ... }` block):

```ts
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
```

Add this new function immediately after it:

```ts

  const clearApiKeys = async () => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'settings', SNAPTRADE_DOC));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to clear SnapTrade keys');
    }
  };
```

- [ ] **Step 5: Add clearApiKeys to the return object**

Find:

```ts
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
```

Replace with:

```ts
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
```

- [ ] **Step 6: Type-check**

```bash
npm run lint
```

Expected: one error, in `src/App.tsx`, at the `<ConnectionsTab onRegister={snaptrade.register} ... />` line — `register` now requires two arguments (`clientId`, `consumerKey`), which isn't compatible with `ConnectionsTab`'s current `onRegister: () => Promise<void>` prop type. This is expected and gets resolved in Task 4, which updates that prop's type.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useSnaptrade.ts
git commit -m "feat: useSnaptrade accepts user-supplied clientId/consumerKey, add clearApiKeys"
```

---

## Task 4: Add SnapTrade API Keys form to ConnectionsTab.tsx

**Files:**
- Modify: `src/components/tabs/ConnectionsTab.tsx` (full rewrite)

- [ ] **Step 1: Replace the entire file**

```tsx
import { useState } from 'react';
import { Loader2, Link, Unplug, RefreshCw, Plus, KeyRound, Pencil } from 'lucide-react';
import { SnaptradeAccount } from '../../types';
import { cn } from '../../lib/utils';
import ConfirmDialog from '../ConfirmDialog';

interface Props {
  credentials: { clientId: string; consumerKey: string; snaptradeUserId: string; userSecret: string } | null;
  accounts: SnaptradeAccount[];
  lastSyncedAt: string | null;
  isSyncing: boolean;
  syncError: boolean;
  onRegister: (clientId: string, consumerKey: string) => Promise<void>;
  onGetConnectUrl: () => Promise<string>;
  onSync: () => Promise<void>;
  onDisconnect: (accountId: string) => Promise<void>;
  onClearApiKeys: () => Promise<void>;
  onShowCsvImport: () => void;
}

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function ConnectionsTab({
  credentials, accounts, lastSyncedAt, isSyncing, syncError,
  onRegister, onGetConnectUrl, onSync, onDisconnect, onClearApiKeys, onShowCsvImport,
}: Props) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [showEditConfirm, setShowEditConfirm] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
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

  if (!credentials) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
        <SnapTradeKeysForm onRegister={onRegister} onConnect={handleConnect} />
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
          <button
            onClick={() => setShowEditConfirm(true)}
            className="flex items-center gap-1 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors mt-1"
          >
            <Pencil className="w-3 h-3" />
            Using your own SnapTrade keys · Edit
          </button>
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

      {showEditConfirm && (
        <ConfirmDialog
          message="Switching SnapTrade keys will disconnect any brokerage accounts linked under your current keys — they're tied to the SnapTrade developer account that created them. You'll need to reconnect after entering new keys."
          onConfirm={async () => {
            setShowEditConfirm(false);
            await onClearApiKeys();
          }}
          onCancel={() => setShowEditConfirm(false)}
        />
      )}
    </div>
  );
}

function SnapTradeKeysForm({
  onRegister, onConnect,
}: {
  onRegister: (clientId: string, consumerKey: string) => Promise<void>;
  onConnect: () => Promise<void>;
}) {
  const [clientId, setClientId] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!clientId.trim() || !consumerKey.trim()) return;
    setIsSubmitting(true);
    try {
      await onRegister(clientId.trim(), consumerKey.trim());
      await onConnect();
    } catch {
      // errors toasted inside hook
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
          <KeyRound className="w-4 h-4 text-zinc-500" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">SnapTrade API Keys</h2>
          <p className="text-[11px] text-zinc-500">Bring your own keys for an independent connection quota</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="YOUR-APP-NAME"
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-600"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Consumer Key</label>
          <input
            type="password"
            value={consumerKey}
            onChange={(e) => setConsumerKey(e.target.value)}
            placeholder="••••••••••••••••"
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-600"
          />
        </div>
      </div>

      <p className="text-[11px] text-zinc-500 leading-relaxed">
        Get free API keys from your{' '}
        <a
          href="https://dashboard.snaptrade.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-400 hover:text-violet-300 underline"
        >
          SnapTrade developer dashboard
        </a>
        . Using your own keys means your brokerage connections count against your own free-tier limit, not a shared one.
      </p>

      <button
        onClick={handleSubmit}
        disabled={isSubmitting || !clientId.trim() || !consumerKey.trim()}
        className="flex items-center justify-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all"
      >
        {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        {isSubmitting ? 'Connecting…' : 'Save & Connect'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: remaining error only in `App.tsx` (missing `onClearApiKeys` prop) — fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/components/tabs/ConnectionsTab.tsx
git commit -m "feat: add SnapTrade API Keys form and edit/confirm flow to ConnectionsTab"
```

---

## Task 5: Wire onClearApiKeys in App.tsx

**Files:**
- Modify: `src/App.tsx:402-413`

- [ ] **Step 1: Add the new prop to the ConnectionsTab call**

Find:

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
                    onSync={() => snaptrade.sync(syncFromSnaptrade)}
                    onDisconnect={snaptrade.disconnect}
                    onShowCsvImport={() => setShowImportGuide(true)}
                  />
                )}
```

Replace with:

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
                    onSync={() => snaptrade.sync(syncFromSnaptrade)}
                    onDisconnect={snaptrade.disconnect}
                    onClearApiKeys={snaptrade.clearApiKeys}
                    onShowCsvImport={() => setShowImportGuide(true)}
                  />
                )}
```

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: zero errors across the entire codebase.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire onClearApiKeys prop into ConnectionsTab"
```

---

## Task 6: Update CLAUDE.md and README.md

**Files:**
- Modify: `CLAUDE.md:43-48`
- Modify: `README.md:144-153`, `README.md:305-309`

- [ ] **Step 1: Update CLAUDE.md environment section**

Find:

```
GEMINI_API_KEY=your_gemini_key          # required for AI agent features
SNAPTRADE_CLIENT_ID=your_client_id      # required for brokerage sync (SnapTrade)
SNAPTRADE_CONSUMER_KEY=your_consumer_key
FINNHUB_API_KEY=                        # optional fallback, mostly unused now
```

Replace with:

```
GEMINI_API_KEY=your_gemini_key          # required for AI agent features
FINNHUB_API_KEY=                        # optional fallback, mostly unused now
```

Immediately below the code block, add (or update the existing line) to note:

```
`firebase-applet-config.json` must also be present (contains Firebase project credentials). Do not commit either file.

SnapTrade brokerage sync does not require server-side configuration — each user enters their own SnapTrade `clientId`/`consumerKey` in the Connections tab (stored in their Firestore settings doc).
```

- [ ] **Step 2: Update README.md environment variables**

Find:

```env
GEMINI_API_KEY=your_gemini_api_key
SNAPTRADE_CLIENT_ID=your_snaptrade_client_id
SNAPTRADE_CONSUMER_KEY=your_snaptrade_consumer_key
```

Replace with:

```env
GEMINI_API_KEY=your_gemini_api_key
```

Find:

```
| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Powers AI portfolio analysis and ADK agents |
| `SNAPTRADE_CLIENT_ID` | Yes* | SnapTrade brokerage sync (*optional if not using Connections tab) |
| `SNAPTRADE_CONSUMER_KEY` | Yes* | SnapTrade brokerage sync (*optional if not using Connections tab) |
| `FINNHUB_API_KEY` | No | Legacy — no longer used for primary data |
```

Replace with:

```
| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Powers AI portfolio analysis and ADK agents |
| `FINNHUB_API_KEY` | No | Legacy — no longer used for primary data |
```

- [ ] **Step 3: Update README.md Known Limitations**

Find:

```
- **SnapTrade**: Requires a SnapTrade developer account. The `SNAPTRADE_CLIENT_ID` and `SNAPTRADE_CONSUMER_KEY` env vars must be set; without them the Connections tab will return 503 and brokerage sync is disabled.
```

Replace with:

```
- **SnapTrade**: Each user brings their own free SnapTrade developer account (`clientId`/`consumerKey`), entered in the Connections tab. This keeps each user's brokerage connection quota independent rather than shared across everyone using the app. Switching keys later disconnects existing brokerage links, since SnapTrade ties registered users to the developer account that created them.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update env var docs for SnapTrade bring-your-own-keys model"
```

---

## Task 7: End-to-end verification

**Files:** None (verification only)

- [ ] **Step 1: Full type-check**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 2: Restart the dev server**

```bash
lsof -ti:3008 | xargs kill -9 2>/dev/null || true
PORT=3008 npm run dev > /tmp/stockpulse-dev.log 2>&1 &
sleep 5
```

- [ ] **Step 3: Verify register route requires all 3 fields**

```bash
curl -s -X POST http://localhost:3008/api/snaptrade/register \
  -H "Content-Type: application/json" \
  -d '{"firebaseUid":"test123","clientId":"fake","consumerKey":"fake"}'
```

Expected: a JSON response from SnapTrade's API (likely an auth error since `fake`/`fake` aren't real credentials) — NOT the old `{"error":"SnapTrade not configured"}` 503. This confirms the per-request client is being built and an actual API call is attempted.

- [ ] **Step 4: Verify in browser — no saved keys**

Open `http://localhost:3008`, sign in, navigate to the Connections tab (assuming no SnapTrade settings doc exists for this user yet). Confirm:
- The "SnapTrade API Keys" form renders with Client ID and Consumer Key inputs
- The "Save & Connect" button is disabled until both fields have text
- The CSV import fallback link still appears below the form

- [ ] **Step 5: Verify in browser — after saving keys (with real SnapTrade dev credentials)**

Enter real `clientId`/`consumerKey` from a SnapTrade developer dashboard account, click "Save & Connect". Confirm:
- A new browser tab opens to the SnapTrade OAuth connect flow
- Back in the app, the "Using your own SnapTrade keys · Edit" line appears in place of the form
- The brokerage list / empty-state UI renders as before

- [ ] **Step 6: Verify the Edit/confirm flow**

Click "Using your own SnapTrade keys · Edit". Confirm:
- A `ConfirmDialog` appears with the disconnect warning message
- Clicking Cancel dismisses it with no state change
- Clicking Confirm clears the Firestore doc and returns to the "SnapTrade API Keys" form

- [ ] **Step 7: Commit (if any fixes were needed)**

Only commit if Steps 3–6 surfaced issues that required code changes. If everything passed as-is, no commit needed for this task.
