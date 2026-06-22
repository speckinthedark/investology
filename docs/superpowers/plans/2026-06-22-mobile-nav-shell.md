# Mobile Nav Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app's navigation shell and KPI header usable on a phone — a fixed bottom tab bar replaces the desktop sidebar below the `md` breakpoint, the KPI header's stat row scrolls horizontally instead of wrapping, and manual trade/cash-entry buttons are removed app-wide in favor of tapping the Cash stat to edit the balance.

**Architecture:** Pure Tailwind responsive classes (`md:` breakpoint at 768px) — no JS media-query hooks. The existing desktop `Sidebar` is hidden below `md` via `hidden md:flex`; a new `MobileBottomNav` component is shown only below `md` via `md:hidden`. Both read/write the same `activeTab` state already in `App.tsx`, so there's no new state management.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4 (no config file — arbitrary values like `[-webkit-overflow-scrolling:touch]` work directly), Lucide icons.

---

## File Map

| File | Change |
|---|---|
| `src/components/MobileBottomNav.tsx` | New — fixed bottom tab bar, 5 tabs, `md:hidden` |
| `src/App.tsx` | Responsive root grid; mount `MobileBottomNav`; KPI header scroll row; remove Trade Asset/Edit Cash buttons; Cash block becomes click target |
| `src/components/Sidebar.tsx` | Hide below `md` |
| `src/components/shared/SnaptradeStatusPill.tsx` | Compact dot-only variant below `md` |
| `src/components/tabs/TransactionsTab.tsx` | Remove Trade Asset/Transfer Cash buttons and related props |

---

## Task 1: Create MobileBottomNav component

**Files:**
- Create: `src/components/MobileBottomNav.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { LayoutDashboard, ArrowUpDown, TrendingUp, Search, Link } from 'lucide-react';
import { cn } from '../lib/utils';
import { Tab } from './Sidebar';

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
  connectionStatus: DotStatus;
}

export default function MobileBottomNav({ activeTab, onTabChange, connectionStatus }: Props) {
  const dotColorClass =
    connectionStatus === 'connected' ? 'bg-emerald-500' :
    connectionStatus === 'error'     ? 'bg-amber-500' :
                                       'bg-zinc-600';

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-900 border-t border-zinc-800 flex items-center justify-around z-20">
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const isActive = activeTab === id;
        const isConnections = id === 'connections';
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={cn(
              'flex flex-col items-center gap-1 px-2 py-1.5 transition-colors',
              isActive ? 'text-violet-400' : 'text-zinc-500',
            )}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {isConnections && (
                <span className={cn('absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-zinc-900', dotColorClass)} />
              )}
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
```

This mirrors `Sidebar.tsx`'s `NAV_ITEMS` list, icons, and connection-dot logic — same 5 tabs, same dot-status coloring, just laid out horizontally instead of vertically. `Tab` is imported from `Sidebar.tsx` rather than redefined, so the two components can't drift out of sync on what tabs exist.

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors. The component isn't imported anywhere yet, so this only verifies the new file itself compiles.

- [ ] **Step 3: Commit**

```bash
git add src/components/MobileBottomNav.tsx
git commit -m "feat: add MobileBottomNav component for mobile tab navigation"
```

---

## Task 2: Wire mobile shell into App.tsx and hide Sidebar below md

**Files:**
- Modify: `src/App.tsx:1-30` (imports), `src/App.tsx:199` (root grid), `src/App.tsx:325` (scroll container), `src/App.tsx:419` (mount point)
- Modify: `src/components/Sidebar.tsx:56-65` (root container classes)

- [ ] **Step 1: Import MobileBottomNav in App.tsx**

In `src/App.tsx`, add the import after the existing `Sidebar` import (around line 12):

```tsx
import Sidebar, { Tab } from './components/Sidebar';
import MobileBottomNav from './components/MobileBottomNav';
```

- [ ] **Step 2: Make the root layout responsive**

Find the root grid div (around line 199):

```tsx
<div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', height: '100vh' }}>
```

Replace with:

```tsx
<div className="grid grid-cols-1 md:grid-cols-[64px_1fr] h-screen">
```

- [ ] **Step 3: Hide Sidebar below md**

In `src/components/Sidebar.tsx`, find the root container (around line 56):

```tsx
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
```

Replace with (note `flex flex-col` moves behind the `md:` prefix so there's no unprefixed `flex` utility competing with `hidden` at the same specificity):

```tsx
<div
  className={cn(
    'group hidden md:flex fixed left-0 top-0 h-full z-20',
    'bg-zinc-900 border-r border-zinc-800',
    'md:flex-col',
    pinned ? 'w-[220px]' : 'w-16 hover:w-[220px]',
    'transition-[width] duration-200 ease-in-out',
    'overflow-hidden',
  )}
>
```

- [ ] **Step 4: Add bottom padding to the scrollable tab-content container**

In `src/App.tsx`, find the scroll container (around line 325):

```tsx
<div className={cn('flex-1 min-h-0 custom-scrollbar', activeTab === 'research' ? 'overflow-hidden' : 'overflow-y-auto')}>
```

Replace with:

```tsx
<div className={cn('flex-1 min-h-0 custom-scrollbar pb-16 md:pb-0', activeTab === 'research' ? 'overflow-hidden' : 'overflow-y-auto')}>
```

This keeps tab content from sitting under the fixed bottom nav on mobile; `md:pb-0` removes the padding once the bottom nav disappears at desktop widths.

- [ ] **Step 5: Mount MobileBottomNav**

In `src/App.tsx`, find the closing tag of the "Main column" div (around line 419 — the `</div>` that closes the `<div className="flex flex-col overflow-hidden">` opened around line 213). Add `MobileBottomNav` as the next sibling, before the `{modal.open && (...)}` block:

```tsx
        </div>

        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          connectionStatus={connectionStatus}
        />

        {modal.open && (
```

`connectionStatus` is already computed earlier in `App.tsx` (used today by `<Sidebar>`), so no new computation is needed.

- [ ] **Step 6: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 7: Manual visual check**

```bash
PORT=3008 npm run dev
```

Open `http://localhost:3008` in a browser, open devtools, and toggle a mobile viewport (e.g. 375×812). Confirm: the desktop sidebar is gone, a bottom tab bar with 5 icons appears, tapping each one switches tabs, and the active tab is highlighted violet. Resize back to a desktop width and confirm the sidebar reappears and the bottom bar disappears.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/components/Sidebar.tsx
git commit -m "feat: hide desktop sidebar and mount mobile bottom nav below md breakpoint"
```

---

## Task 3: Compact SnaptradeStatusPill on mobile

**Files:**
- Modify: `src/components/shared/SnaptradeStatusPill.tsx:48-60`

- [ ] **Step 1: Collapse the pill to a dot-only button below md**

Find the return block (around line 48):

```tsx
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
```

Replace with:

```tsx
return (
  <button
    onClick={onNavigateToConnections}
    className="flex items-center gap-2 bg-zinc-800/80 border border-zinc-700/60 hover:border-zinc-600 rounded-full px-1.5 py-1.5 md:px-3 transition-all"
  >
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
    <span className="hidden md:inline text-[11px] font-semibold text-zinc-300 whitespace-nowrap">{label}</span>
    {sublabel && (
      <span className="hidden md:inline text-[10px] text-zinc-500 whitespace-nowrap">{sublabel}</span>
    )}
  </button>
);
```

Below `md`, only the colored dot renders inside a small circular button (tighter padding, no text). At `md` and above, the full pill with broker name and sync time is unchanged.

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Manual visual check**

With the dev server running (`PORT=3008 npm run dev`), open the app in a mobile viewport. In the top bar, confirm the SnapTrade status indicator now shows as a small dot-only circle (no broker text), and tapping it still navigates to the Connections tab. Resize to desktop width and confirm the full pill with text returns.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/SnaptradeStatusPill.tsx
git commit -m "feat: collapse SnaptradeStatusPill to dot-only on mobile"
```

---

## Task 4: Make the KPI stat row scroll horizontally on mobile

**Files:**
- Modify: `src/App.tsx:264-303`

- [ ] **Step 1: Make the stat row scrollable below md**

Find the stat row container (around line 264):

```tsx
<div className="flex items-center gap-4 sm:gap-8 flex-wrap">
```

Replace with:

```tsx
<div className="flex items-center gap-4 overflow-x-auto md:overflow-visible md:flex-wrap md:gap-8 [-webkit-overflow-scrolling:touch]">
```

- [ ] **Step 2: Prevent stat blocks from shrinking in the scroll container**

Three of the four remaining plain `<div>` stat blocks need `shrink-0` so they don't compress when the row scrolls (the Cash block becomes a button with its own `shrink-0` in Task 5 — skip it here). Find the "Total Gain" block (around line 271):

```tsx
<div>
  <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">Total Gain</div>
```

Replace its opening tag with:

```tsx
<div className="shrink-0">
  <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">Total Gain</div>
```

Find the "Today" block (around line 279):

```tsx
<div>
  <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">Today</div>
```

Replace its opening tag with:

```tsx
<div className="shrink-0">
  <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">Today</div>
```

Find the "YTD Return" block (around line 288):

```tsx
{ytdTWR !== null && !isPriceHistoryLoading && (
  <div>
    <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">YTD Return</div>
```

Replace with:

```tsx
{ytdTWR !== null && !isPriceHistoryLoading && (
  <div className="shrink-0">
    <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">YTD Return</div>
```

Find the "S&P 500 YTD" block (around line 296):

```tsx
{sp500YTD !== null && (
  <div>
    <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">S&amp;P 500 YTD</div>
```

Replace with:

```tsx
{sp500YTD !== null && (
  <div className="shrink-0">
    <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">S&amp;P 500 YTD</div>
```

- [ ] **Step 3: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Manual visual check**

In a mobile viewport, confirm the 4-5 stat pills (Cash, Total Gain, Today, YTD Return, S&P 500 YTD) sit in a single row that scrolls horizontally with a swipe instead of wrapping to multiple lines. At desktop width, confirm the row still wraps as it does today.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: make KPI stat row horizontally scrollable on mobile"
```

---

## Task 5: Remove Trade Asset/Edit Cash buttons; Cash block opens CashBalanceModal

**Files:**
- Modify: `src/App.tsx:3` (imports), `src/App.tsx:265-270` (Cash block), `src/App.tsx:306-321` (action buttons)

- [ ] **Step 1: Remove the action buttons block**

Find and delete this entire block (around line 306):

```tsx
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => openModal('buy')}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-xl font-bold hover:bg-zinc-700 transition-all text-[11px] uppercase tracking-widest"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                Trade Asset
              </button>
              <button
                onClick={() => setShowCashModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-all text-[11px] uppercase tracking-widest"
              >
                <CreditCard className="w-3.5 h-3.5" />
                Edit Cash
              </button>
            </div>
```

`showCashModal` state and the `<CashBalanceModal>` render block further down stay untouched — only this trigger is removed for now (Step 2 gives the Cash stat block the same trigger).

- [ ] **Step 2: Make the Cash stat block clickable**

Find the Cash block (around line 265):

```tsx
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">Cash</div>
                  <div className="text-base font-black text-blue-400">
                    {isHidden ? HIDDEN : `$${cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                  </div>
                </div>
```

Replace with:

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

- [ ] **Step 3: Remove the now-unused icon imports**

In `src/App.tsx`, find the lucide-react import (line 3):

```tsx
import { RefreshCw, ArrowUpDown, CreditCard, BrainCircuit, Eye, EyeOff } from 'lucide-react';
```

Replace with:

```tsx
import { RefreshCw, BrainCircuit, Eye, EyeOff } from 'lucide-react';
```

- [ ] **Step 4: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Manual visual check**

In the browser, confirm the "Trade Asset" and "Edit Cash" buttons are gone from the KPI header at both mobile and desktop widths, and clicking/tapping the Cash stat opens the existing cash-balance modal (same modal as before — verify it still saves correctly).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: remove manual Trade Asset/Edit Cash buttons, make Cash stat clickable"
```

---

## Task 6: Remove manual entry buttons from TransactionsTab

**Files:**
- Modify: `src/components/tabs/TransactionsTab.tsx:1-17,36,159-172`
- Modify: `src/App.tsx:346-356`

- [ ] **Step 1: Remove unused props from TransactionsTab's interface**

In `src/components/tabs/TransactionsTab.tsx`, find the `Props` interface (around line 9):

```tsx
interface Props {
  transactions: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string, ticker: string) => void;
  onAddTrade: () => void;
  onAddCash: () => void;
  onExport: () => void;
  onClearAll: () => void;
}
```

Replace with:

```tsx
interface Props {
  transactions: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string, ticker: string) => void;
  onExport: () => void;
  onClearAll: () => void;
}
```

- [ ] **Step 2: Remove the props from the destructured parameter list**

Find (around line 35):

```tsx
export default function TransactionsTab({
  transactions, onEdit, onDelete, onAddTrade, onAddCash, onExport, onClearAll,
}: Props) {
```

Replace with:

```tsx
export default function TransactionsTab({
  transactions, onEdit, onDelete, onExport, onClearAll,
}: Props) {
```

- [ ] **Step 3: Remove the two buttons**

Find and delete this block (around line 159):

```tsx
          <button
            onClick={onAddTrade}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 text-white hover:bg-zinc-700 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            Trade Asset
          </button>
          <button
            onClick={onAddCash}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            <CreditCard className="w-3.5 h-3.5" />
            Transfer Cash
          </button>
```

The Export and Clear Log buttons immediately above this block stay untouched.

- [ ] **Step 4: Remove the now-unused icon imports**

Find (line 3):

```tsx
import { Pencil, Trash2, Download, ArrowUpDown, CreditCard, Search, X } from 'lucide-react';
```

Replace with:

```tsx
import { Pencil, Trash2, Download, Search, X } from 'lucide-react';
```

- [ ] **Step 5: Remove the corresponding wiring in App.tsx**

In `src/App.tsx`, find the `<TransactionsTab>` call (around line 346):

```tsx
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
```

Replace with:

```tsx
                {activeTab === 'transactions' && (
                  <TransactionsTab
                    transactions={transactions}
                    onEdit={(tx) => openModal(tx.type, tx)}
                    onDelete={handleDeleteTransaction}
                    onExport={handleExport}
                    onClearAll={handleClearAll}
                  />
                )}
```

- [ ] **Step 6: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 7: Manual visual check**

In the browser, open the Transactions tab and confirm "Trade Asset" and "Transfer Cash" buttons are gone (Export and Clear Log remain), and that editing (pencil icon) and deleting (trash icon) existing rows still works.

- [ ] **Step 8: Commit**

```bash
git add src/components/tabs/TransactionsTab.tsx src/App.tsx
git commit -m "feat: remove manual Trade Asset/Transfer Cash buttons from Transactions tab"
```

---

## Out of Scope (per design spec)

- Per-tab mobile layouts (Overview, Performance, Research, etc.) — separate plans.
- Any change to `TransactionModal`'s edit flow, `CashBalanceModal`, or the import wizard.
- Removing `TransactionType`'s `buy`/`sell`/`deposit`/`withdrawal` values or any backend/Firestore schema change.
- A "More" overflow pattern for the bottom nav.
