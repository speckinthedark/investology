# Mobile-Friendly Nav Shell Design Spec

**Date:** 2026-06-22
**Branch:** `feat/mobile-nav-shell`
**Status:** Approved

---

## Motivation

The app currently looks bad on phones: the root layout is a hardcoded CSS grid (`gridTemplateColumns: '64px 1fr'`) that always reserves a sidebar column regardless of viewport width, and the KPI header's stat row wraps awkwardly on narrow screens. This is the first of several mobile-friendliness sub-projects — it fixes the navigation shell and KPI header that every tab sits inside, so subsequent per-tab mobile work (Overview, Performance, Research, etc.) has a working foundation to build on.

This sub-project also folds in a related simplification: manual trade/cash entry is being removed app-wide, since the app no longer relies on users manually logging trades.

---

## Decision Summary

- **Breakpoint:** Tailwind's `md:` (768px) is the mobile/desktop split. Below `md` = mobile shell; at/above `md` = today's desktop shell, unchanged.
- **Mobile navigation:** A fixed bottom tab bar with the app's 5 active tabs (Overview, Transactions, Performance, Research, Connections). No overflow/"More" pattern needed — 5 tabs fit directly in 5 slots. "Deep Dive" (a disabled coming-soon placeholder) is omitted from mobile nav entirely.
- **Desktop `Sidebar`** is hidden below `md` (`hidden md:flex`) rather than restructured — it continues to work exactly as today at desktop widths.
- **`Topbar`** stays rendered at all breakpoints (it's already slim and icon-based); only `SnaptradeStatusPill` gets a compact mobile variant to avoid overflow from long broker-name text.
- **KPI header:** stat pills become horizontally scrollable below `md` instead of wrapping. The Total Portfolio Value block stays full-width on top at all breakpoints.
- **Manual trade/cash entry removed app-wide:** "Trade Asset" and "Edit Cash" buttons disappear from the KPI header (all breakpoints), and "Trade Asset"/"Transfer Cash" disappear from the Transactions tab (all breakpoints). Editing/deleting existing transactions is unaffected. Cash balance is now edited by clicking/tapping the Cash stat block, which opens the existing `CashBalanceModal`.

---

## Mobile Navigation

### New: `src/components/MobileBottomNav.tsx`

Fixed to the bottom of the viewport, rendered only below `md` (`md:hidden`). Five icon+label buttons, reusing the same tab list and icons as `Sidebar.tsx`'s `NAV_ITEMS` (`Overview`, `Transactions`, `Performance`, `Research`, `Connections`). Active tab gets the same violet accent treatment `Sidebar` uses today. Connections keeps its small colored status dot, driven by the same `connectionStatus` prop `Sidebar` already receives.

```ts
interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  connectionStatus: 'connected' | 'error' | 'disconnected';
}
```

### `src/components/Sidebar.tsx`

Add `hidden md:flex` to the root container's class list so it doesn't render below `md`. No other changes — desktop behavior (hover-expand, pin, bottom controls) is untouched.

### `src/App.tsx` — root layout

The root grid becomes responsive instead of a hardcoded inline style:

```tsx
<div className="grid grid-cols-1 md:grid-cols-[64px_1fr] h-screen">
```

`MobileBottomNav` renders as a sibling at the end of the tree (fixed positioning takes it out of flow), only mounted below `md`:

```tsx
<MobileBottomNav
  activeTab={activeTab}
  onTabChange={setActiveTab}
  connectionStatus={connectionStatus}
/>
```

The scrollable tab-content container (`App.tsx:325`) gets bottom padding below `md` so content doesn't sit under the fixed bar: `pb-16 md:pb-0` added alongside its existing classes.

---

## Topbar

### `src/components/shared/SnaptradeStatusPill.tsx`

Below `md`, collapse to a small circular button showing only the colored status dot (no broker-name/sync-time text) — still calls `onNavigateToConnections` on tap. At/above `md`, unchanged. Implemented with a `hidden md:inline` span around the text portion and a dot-only fallback shown via `md:hidden`.

`Topbar.tsx` itself needs no structural changes — it already renders Refresh, Avatar, and Logout as persistent icons at all widths.

---

## KPI Header (`src/App.tsx`)

### Stat row

Today's stat row (`App.tsx:264`, `flex items-center gap-4 sm:gap-8 flex-wrap`) changes to scroll horizontally below `md` instead of wrapping:

```tsx
<div className="flex items-center gap-4 overflow-x-auto md:overflow-visible md:flex-wrap md:gap-8 [-webkit-overflow-scrolling:touch]">
```

Each stat block (Cash, Total Gain, Today, YTD Return, S&P 500 YTD) gets `shrink-0` added so it doesn't compress in the scroll container. No stats are dropped — all 5 remain, reachable by horizontal swipe below `md`.

### Action buttons removed

The "Trade Asset" and "Edit Cash" buttons (`App.tsx:306-321`) are deleted entirely, along with the `openModal('buy')` trigger and the `<CreditCard>`/`<ArrowUpDown>` icon imports if they become otherwise unused. `showCashModal` state and the `<CashBalanceModal>` render block stay — only the button that used to trigger it is gone.

### Cash block becomes the new trigger

The Cash stat block becomes a `<button onClick={() => setShowCashModal(true)}>` wrapping its existing content, with a hover affordance:

```tsx
<button
  onClick={() => setShowCashModal(true)}
  className="text-left hover:bg-zinc-800/50 rounded-lg transition-colors px-2 py-1 -mx-2 -my-1 shrink-0"
>
  <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">Cash</div>
  <div className="text-base font-black text-blue-400">
    {isHidden ? HIDDEN : `$${cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
  </div>
</button>
```

This applies at all breakpoints, not just mobile.

---

## Transactions Tab (`src/components/tabs/TransactionsTab.tsx`)

Remove the "Trade Asset" and "Transfer Cash" buttons (lines 159-172) and the `onAddTrade`/`onAddCash` props (lines 13-14, 36). Remove the corresponding `onAddTrade={() => openModal('buy')}` / `onAddCash={() => openModal('deposit')}` wiring in `App.tsx`'s `<TransactionsTab>` call. Editing (pencil icon) and deleting (trash icon) existing transactions, Export, and Clear Log are unaffected — `TransactionModal` remains in use for the edit flow.

If `ArrowUpDown` and `CreditCard` icon imports become unused in `TransactionsTab.tsx` after this removal, remove those imports too.

---

## Files Changed

| File | Change |
|---|---|
| `src/components/MobileBottomNav.tsx` | New — fixed bottom tab bar, 5 tabs, `md:hidden` |
| `src/components/Sidebar.tsx` | Add `hidden md:flex` to root container |
| `src/components/Topbar.tsx` | No structural change (verify still slim at mobile widths) |
| `src/components/shared/SnaptradeStatusPill.tsx` | Add compact dot-only mobile variant below `md` |
| `src/App.tsx` | Responsive root grid; mount `MobileBottomNav`; KPI header scroll row; remove Trade Asset/Edit Cash buttons; Cash block becomes click target; bottom padding on scroll container |
| `src/components/tabs/TransactionsTab.tsx` | Remove Trade Asset/Transfer Cash buttons and related props |

---

## Out of Scope

- Per-tab mobile layouts (Overview's table/treemap, Performance's stat-card grid and two-column body, Research's fixed two-column desktop layout, etc.) — each gets its own design/plan cycle.
- Any change to `TransactionModal`'s edit flow, `CashBalanceModal`, or the import wizard.
- Removing `TransactionType`'s `buy`/`sell`/`deposit`/`withdrawal` values or any backend/Firestore schema change — only UI entry points are removed; existing data and types are untouched.
- A "More" overflow pattern for the bottom nav — not needed since exactly 5 tabs fit 5 slots.
