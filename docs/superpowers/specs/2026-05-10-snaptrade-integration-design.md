# SnapTrade Brokerage Integration — Design Spec

## Goal

Replace manual eToro XLSX and IBKR XML imports with live brokerage connections via SnapTrade. Transactions and holdings sync automatically on app load and on demand, with no manual file exports required.

---

## Architecture

**Approach:** Server-side SnapTrade proxy with client-side Firestore writes.

- SnapTrade API keys (`SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`) live in `.env`, never exposed to the client.
- Each user's SnapTrade credentials (`snaptradeUserId` + `userSecret`) are stored in Firestore under `users/{uid}/settings/snaptrade`, protected by existing security rules.
- All SnapTrade API calls go through Express routes. The server fetches data and returns it to the client, which writes to Firestore using the existing `bulkImportTransactions()` hook — consistent with how eToro and IBKR imports already work.
- No Firebase Admin SDK required.

**Tech added:**
- `snaptrade-typescript-sdk` (npm) — server-side only
- Two new `.env` vars: `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`

---

## Data Flow

### First-time registration
1. User opens Connections tab with no existing credentials.
2. Client calls `POST /api/snaptrade/register`.
3. Server registers the user with SnapTrade, returns `{ snaptradeUserId, userSecret }`.
4. Client writes to `users/{uid}/settings/snaptrade`: `{ snaptradeUserId, userSecret, connectedAt, lastSyncedAt: null, accounts: [] }`.

### Brokerage connection
1. User clicks "Add Brokerage" (or "Connect Brokerage" on empty state).
2. Client calls `POST /api/snaptrade/connect-url` with credentials + `redirectUri` (app URL).
3. Server returns a SnapTrade portal URL. The `redirectUri` is set to the app's origin with `?snaptrade_auth=success` appended.
4. Client opens URL in a new tab. User authenticates with eToro or IBKR.
5. SnapTrade redirects back to the app with `?snaptrade_auth=success` in the URL.
6. `ConnectionsTab` detects this query param on mount, removes it from the URL (via `history.replaceState`), and automatically calls `refreshAccounts()`.
7. Client calls `POST /api/snaptrade/accounts` to fetch the updated account list and merges into `users/{uid}/settings/snaptrade`.

### Sync
1. Client calls `POST /api/snaptrade/sync` with `{ snaptradeUserId, userSecret }`.
2. Server fetches all activities across all connected accounts via SnapTrade SDK.
3. Server maps activities to `Transaction[]` (see Transaction Mapping below).
4. Server returns `{ transactions: Transaction[] }`.
5. Client calls `bulkImportTransactions(transactions)` — full replace-and-recompute of Firestore holdings + transactions.
6. Client writes `lastSyncedAt: new Date().toISOString()` to `users/{uid}/settings/snaptrade`.

### Auto-sync
`useSnaptrade` fires `sync()` automatically on mount when:
- Credentials exist, AND
- `lastSyncedAt` is `null` OR older than 1 hour.

---

## Firestore Schema

**New document** (merged into existing `settings` sub-collection):

```
users/{uid}/settings/snaptrade
  snaptradeUserId  string          SnapTrade-assigned user ID
  userSecret       string          SnapTrade-assigned per-user secret
  connectedAt      string          ISO timestamp of first registration
  lastSyncedAt     string | null   ISO timestamp of last successful sync
  accounts         {               Updated after every connect/refresh
    id:         string             SnapTrade account ID
    name:       string             e.g. "eToro - Main Account"
    brokerage:  string             e.g. "eToro", "Interactive Brokers"
  }[]
```

No new collections. Existing `users/{uid}/transactions` and `users/{uid}/holdings` are unchanged — they continue to be the source of truth, written by `bulkImportTransactions()` as before.

---

## Server Routes

All routes added to `server.ts` under `/api/snaptrade/`. SnapTrade SDK initialised once at module scope using env vars.

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/api/snaptrade/register` | `{ firebaseUid }` | `{ snaptradeUserId, userSecret }` |
| `POST` | `/api/snaptrade/connect-url` | `{ snaptradeUserId, userSecret, redirectUri }` | `{ redirectUri }` (portal URL) |
| `POST` | `/api/snaptrade/accounts` | `{ snaptradeUserId, userSecret }` | `{ accounts: Account[] }` |
| `POST` | `/api/snaptrade/sync` | `{ snaptradeUserId, userSecret }` | `{ transactions: Transaction[] }` |
| `DELETE` | `/api/snaptrade/disconnect` | `{ snaptradeUserId, userSecret, accountId }` | `{ ok: true }` |

---

## Transaction Mapping

The sync route filters SnapTrade activities to stock trades only:

**Included:**
- `activity.type === 'BUY'` → `{ type: 'buy', ticker: symbol, shares: units, price: price, timestamp: trade_date }`
- `activity.type === 'SELL'` → `{ type: 'sell', ticker: symbol, shares: units, price: price, timestamp: trade_date }`

**Skipped:**
- `DIVIDEND`, `INTEREST`, `TRANSFER`, `CONTRIBUTION`, `WITHDRAWAL` — not representable in the current `Transaction` type
- Any activity where `asset_type !== 'EQUITY'` (options, FX, crypto)
- Any activity with `units === 0` or `price == null`

Holdings are recomputed from the full transaction log via `bulkImportTransactions()`, not taken directly from SnapTrade positions. This ensures cost basis matches the rest of the app exactly.

---

## New Files

| File | Purpose |
|------|---------|
| `src/hooks/useSnaptrade.ts` | Firestore subscription + all SnapTrade actions |
| `src/components/tabs/ConnectionsTab.tsx` | Full-page connections management view |
| `src/components/shared/SnaptradeStatusPill.tsx` | Compact topbar pill (brokers + last sync time) |

## Modified Files

| File | Change |
|------|--------|
| `server.ts` | 5 new `/api/snaptrade/*` routes + SDK init |
| `src/App.tsx` | Mount `useSnaptrade`, add `ConnectionsTab`, pass pill to `Topbar` |
| `src/components/Sidebar.tsx` | New Connections icon with green/amber/gray status dot |
| `src/components/Topbar.tsx` | Render `SnaptradeStatusPill`; clicking it navigates to Connections tab |
| `src/components/ImportGuidePanel.tsx` | Remove eToro and IBKR tabs; keep StockPulse CSV tab only |
| `src/components/tabs/TransactionsTab.tsx` | Remove "Import" button from toolbar |
| `.env` | Add `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY` |

---

## UI Components

### `SnaptradeStatusPill`
Compact pill in the Topbar right side, next to the existing refresh and privacy-toggle buttons. Shows:
- **Green dot** + broker names + "synced Xm ago" — all accounts healthy
- **Amber dot** + "Sync error" — last sync failed
- **Gray dot** + "Not connected" — no accounts linked

Clicking navigates to the Connections tab.

### Sidebar Connections icon
New icon in the left sidebar (lucide `Link` or `Plug`). Carries a small dot badge mirroring the pill colour. Active state matches existing sidebar icon behaviour.

### `ConnectionsTab`
Full-page tab. Two states:

**Empty (no accounts):**
- Centred call-to-action with a "Connect Brokerage" button.
- Clicking registers the SnapTrade user (if not yet registered) then opens the portal URL in a new tab.

**Connected:**
- Header: "Brokerage Connections" + last-synced timestamp + "Sync Now" button (purple, triggers manual sync with loading spinner).
- Account list: one card per connected account showing brokerage logo placeholder, account name, position count, connected status, and "Disconnect" button.
- "Add Brokerage" dashed-border button at the bottom.

---

## Error Handling

- If `POST /api/snaptrade/register` fails, show a toast and leave the empty state intact.
- If `connect-url` fails, show a toast. No state written.
- If sync fails, set an error flag in `useSnaptrade` state (not in Firestore). The pill shows amber. `lastSyncedAt` is not updated.
- Disconnect failures show a toast; the account card stays in the list.

---

## What's Removed

- eToro XLSX import tab from `ImportGuidePanel` (and the `/api/import/etoro` route can be deprecated but left in server.ts for now — no UI entry point).
- IBKR XML import tab from `ImportGuidePanel` (same — route kept, UI entry removed).
- "Import" button from the `TransactionsTab` toolbar.
