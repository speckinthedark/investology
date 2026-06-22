# SnapTrade Bring-Your-Own-Keys Design Spec

**Date:** 2026-06-09
**Branch:** `feat/byo-snaptrade-keys-flow`
**Status:** Approved

---

## Motivation

SnapTrade's free tier caps the number of brokerage connections allowed per developer account (`clientId`/`consumerKey`). The app currently shares one set of credentials (via `SNAPTRADE_CLIENT_ID`/`SNAPTRADE_CONSUMER_KEY` env vars) across every user, so all connections count against a single shared quota. If each user instead registers their own free SnapTrade developer account and supplies their own `clientId`/`consumerKey`, each person's connections count against their own independent quota.

There are no live brokerage connections today, so this is a clean swap with no migration required.

---

## Decision Summary

- **No shared fallback.** The app requires every user to bring their own SnapTrade `clientId`/`consumerKey`. The `SNAPTRADE_CLIENT_ID`/`SNAPTRADE_CONSUMER_KEY` env vars and the module-scoped shared `Snaptrade` client in `server.ts` are removed entirely.
- **Dedicated settings form.** Credentials are entered in a standalone "SnapTrade API Keys" card at the top of `ConnectionsTab.tsx`, separate from the brokerage-connection UI below it.
- **Save and register are one action.** Entering keys and clicking through immediately validates them via SnapTrade's register call — bad keys are never silently persisted.

---

## Data Model

`src/types.ts` — extend `SnaptradeSettings`:

```ts
export interface SnaptradeSettings {
  clientId: string;       // NEW — user's own SnapTrade dev app clientId
  consumerKey: string;    // NEW — user's own SnapTrade dev app consumerKey
  snaptradeUserId: string;
  userSecret: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  accounts: SnaptradeAccount[];
}
```

Stored in the same Firestore doc (`/users/{uid}/settings/snaptrade`) as today. Same trust model as the existing `userSecret` field — no new storage mechanism, no Firebase Admin SDK introduced on the backend.

---

## Frontend Changes

### `src/hooks/useSnaptrade.ts`

- `register(clientId, consumerKey)` — signature changes to accept the user's own keys. On success, persists `{ clientId, consumerKey, snaptradeUserId, userSecret, connectedAt, lastSyncedAt: null, accounts: [] }` to Firestore in a single `setDoc`, exactly as today's `register()` does (just with two more fields). On failure (SnapTrade rejects the keys), nothing is persisted — the existing `toast.error` + `throw e` pattern is preserved.
- `getConnectUrl()`, `refreshAccounts()`, `sync()`, `disconnect()` — each adds `clientId` and `consumerKey` (read from `settings`) to its request body, alongside the `snaptradeUserId`/`userSecret` they already send.
- `credentials` memo extends to include `clientId`/`consumerKey`:
  ```ts
  const credentials = useMemo(
    () => settings
      ? { clientId: settings.clientId, consumerKey: settings.consumerKey, snaptradeUserId: settings.snaptradeUserId, userSecret: settings.userSecret }
      : null,
    [settings?.clientId, settings?.consumerKey, settings?.snaptradeUserId, settings?.userSecret],
  );
  ```
- New `clearApiKeys()` function — deletes the entire `/users/{uid}/settings/snaptrade` doc (every field gets recreated fresh by the next `register()` call). Used by the Edit/rotate flow below to reset the user back to the "no keys" state.

### `src/components/tabs/ConnectionsTab.tsx`

Two top-level states, driven by whether `credentials` (from the hook) is `null`:

**A. No saved keys (`credentials === null`):**
- Renders a "SnapTrade API Keys" card:
  - `clientId` text input
  - `consumerKey` password-style input (masked, like a secret)
  - Help text + link to SnapTrade's developer signup page, explaining why bringing your own keys avoids shared usage limits
  - Single "Save & Connect" button
- On submit: validates both fields are non-empty, calls `register(clientId, consumerKey)`. On success, immediately continues into the existing connect flow (`getConnectUrl()` + `window.open(...)`), matching today's behavior where clicking "Connect Brokerage" lazily registers first.
- On failure: `toast.error` surfaces the SnapTrade error (existing pattern); form stays visible, user can retry.

**B. Saved keys exist (`credentials !== null`):**
- The API Keys form is hidden. Existing brokerage list / empty-state UI renders exactly as it does today.
- A small line near the header reads "Using your own SnapTrade keys · Edit".
- Clicking "Edit" opens the existing `ConfirmDialog` component with a warning that switching keys will disconnect any brokerage accounts linked under the current keys (because `snaptradeUserId`/`userSecret` are tied to the specific SnapTrade developer account that created them — this is a SnapTrade-side constraint, not something the app can work around).
- Confirming calls `clearApiKeys()`, which resets to state A and re-shows the form.

---

## Backend Changes

### `server.ts`

Remove:
- The module-scoped `snaptrade` instance (currently built at module load from `process.env.SNAPTRADE_CLIENT_ID`/`SNAPTRADE_CONSUMER_KEY`)
- Reads of `SNAPTRADE_CLIENT_ID`/`SNAPTRADE_CONSUMER_KEY` from `process.env`
- The `if (!snaptrade) return res.status(503).json({ error: 'SnapTrade not configured' })` guard in each of the 5 routes (there's no shared instance left to be unconfigured)

Add:
```ts
function snaptradeClient(clientId: string, consumerKey: string) {
  return new Snaptrade({ clientId, consumerKey });
}
```

Each of the 5 SnapTrade routes (`/api/snaptrade/register`, `/connect-url`, `/accounts`, `/disconnect`, `/sync`) — add `clientId`/`consumerKey` to the destructured `req.body`, validate non-empty (400 if missing, joining the existing field-presence checks), and replace every `snaptrade.xxx(...)` / `snaptrade!.xxx(...)` call with `snaptradeClient(clientId, consumerKey).xxx(...)`.

---

## Documentation Updates

`CLAUDE.md` and `README.md` currently list `SNAPTRADE_CLIENT_ID`/`SNAPTRADE_CONSUMER_KEY` as required `.env` vars. Update both:
- Remove the two env vars from the `.env` example and the variables table
- Add a note that brokerage sync requires each user to enter their own SnapTrade `clientId`/`consumerKey` in the Connections tab (no server-side configuration needed)

---

## Files Changed

| File | Change |
|---|---|
| `src/types.ts` | Add `clientId`, `consumerKey` to `SnaptradeSettings` |
| `src/hooks/useSnaptrade.ts` | `register()` takes user keys; all calls send `clientId`/`consumerKey`; add `clearApiKeys()` |
| `src/components/tabs/ConnectionsTab.tsx` | Add "SnapTrade API Keys" form + saved/edit states, gated on `credentials` |
| `server.ts` | Remove shared `snaptrade` instance + env vars; add `snaptradeClient()` helper; update 5 routes |
| `CLAUDE.md` | Remove `SNAPTRADE_CLIENT_ID`/`SNAPTRADE_CONSUMER_KEY` from env table; note BYO-keys model |
| `README.md` | Same doc updates as CLAUDE.md |

---

## Out of Scope

- Migration of existing connections (none exist today)
- A shared-fallback / hybrid mode (explicitly rejected — BYO-only)
- Server-side credential storage via Firebase Admin SDK (would require introducing a new backend capability disproportionate to this app's scale; client-side Firestore storage matches the existing `userSecret` trust model)
