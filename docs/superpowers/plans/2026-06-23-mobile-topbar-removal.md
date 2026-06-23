# Mobile Topbar Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the persistent mobile `Topbar` (Refresh, account avatar, Sign out) and replace its two functions with less space-hungry alternatives — a hand-built pull-to-refresh gesture on Overview/Transactions/Performance, and a tap-to-reveal account menu tucked into the existing KPI header.

**Architecture:** Two new standalone components (`PullToRefresh`, `AccountMenu`) are built and verified independently, then wired into `App.tsx`, after which `Topbar.tsx` has nothing left to render at any breakpoint and is deleted outright.

**Tech Stack:** React 19, TypeScript, Framer Motion (already a dependency — used only for the pull indicator's animation, not gesture detection, which uses raw touch events), Tailwind v4, Lucide icons.

---

## File Map

| File | Change |
|---|---|
| `src/components/PullToRefresh.tsx` | New — touch-gesture pull-to-refresh wrapper |
| `src/components/AccountMenu.tsx` | New — mobile-only avatar + tap-to-reveal email/Sign out dropdown |
| `src/App.tsx` | Wrap scroll container with `PullToRefresh`; mount `AccountMenu` in KPI header; remove `Topbar` import/render |
| `src/components/Topbar.tsx` | Deleted |

---

## Task 1: Create PullToRefresh component

**Files:**
- Create: `src/components/PullToRefresh.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useRef, useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

const THRESHOLD = 70;
const MAX_PULL = 100;

interface Props {
  onRefresh: () => void;
  isRefreshing: boolean;
  disabled: boolean;
  className?: string;
  children: React.ReactNode;
}

export default function PullToRefresh({ onRefresh, isRefreshing, disabled, className, children }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const wasPulling = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pull = useMotionValue(0);
  const rotate = useTransform(pull, [0, THRESHOLD], [0, 180]);
  const opacity = useTransform(pull, [0, 20], [0, 1]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled || isRefreshing) return;
    if ((scrollRef.current?.scrollTop ?? 0) > 0) {
      touchStartY.current = null;
      return;
    }
    touchStartY.current = e.touches[0].clientY;
    wasPulling.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (disabled || isRefreshing || touchStartY.current == null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta <= 0) return;
    wasPulling.current = true;
    e.preventDefault();
    const capped = Math.min(delta, MAX_PULL);
    setPullDistance(capped);
    pull.set(capped);
  };

  const handleTouchEnd = () => {
    if (disabled || isRefreshing) return;
    if (wasPulling.current && pullDistance >= THRESHOLD) {
      onRefresh();
    }
    touchStartY.current = null;
    wasPulling.current = false;
    setPullDistance(0);
    pull.set(0);
  };

  const showIndicator = isRefreshing || pullDistance > 0;

  return (
    <div
      ref={scrollRef}
      className={cn('relative', className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {showIndicator && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <motion.div
            className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center"
            style={{ opacity: isRefreshing ? 1 : opacity }}
          >
            <motion.div style={{ rotate: isRefreshing ? 0 : rotate }}>
              <RefreshCw className={cn('w-3.5 h-3.5 text-zinc-300', isRefreshing && 'animate-spin')} />
            </motion.div>
          </motion.div>
        </div>
      )}
      {children}
    </div>
  );
}
```

This is a single element doing three jobs: it's the actual scrollable container (`ref` + the caller's `className`, e.g. `overflow-y-auto`/`flex-1`/`min-h-0`, passed straight through unchanged), the touch-gesture listener, and the positioning context (`relative`) for the absolutely-positioned indicator badge. Because the gesture is only ever engaged while `scrollTop === 0` and `touchmove`'s default is suppressed for the duration of the pull, `scrollTop` never moves during a pull — so the indicator can simply be `absolute top-2`, no `sticky` or content-shifting needed.

`disabled` skips all gesture logic entirely (the touch handlers still attach but return immediately), so disabled tabs scroll exactly as they did before this component existed.

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors. The component isn't imported anywhere yet, so this only verifies the new file itself compiles.

- [ ] **Step 3: Commit**

```bash
git add src/components/PullToRefresh.tsx
git commit -m "feat: add PullToRefresh component"
```

---

## Task 2: Wire PullToRefresh into App.tsx

**Files:**
- Modify: `src/App.tsx:14` (import), `src/App.tsx:287` (opening tag), `src/App.tsx:378` (closing tag)

- [ ] **Step 1: Import PullToRefresh**

In `src/App.tsx`, add the import after the existing `Topbar` import (line 14):

```tsx
import Topbar from './components/Topbar';
import PullToRefresh from './components/PullToRefresh';
```

- [ ] **Step 2: Replace the scroll container's opening tag**

Find (around line 287):

```tsx
          <div className={cn('flex-1 min-h-0 custom-scrollbar pb-16 md:pb-0', activeTab === 'research' ? 'overflow-hidden' : 'overflow-y-auto')}>
```

Replace with:

```tsx
          <PullToRefresh
            className={cn('flex-1 min-h-0 custom-scrollbar pb-16 md:pb-0', activeTab === 'research' ? 'overflow-hidden' : 'overflow-y-auto')}
            onRefresh={refreshPrices}
            isRefreshing={isRefreshing}
            disabled={!['overview', 'transactions', 'performance'].includes(activeTab)}
          >
```

Everything between this opening tag and the closing tag (the `<AnimatePresence>` block and all tab JSX inside it) stays completely unchanged — only the outer wrapper tag itself changes.

- [ ] **Step 3: Replace the scroll container's closing tag**

Find (around line 378, the line directly after `</AnimatePresence>`):

```tsx
            </AnimatePresence>
          </div>
```

Replace with:

```tsx
            </AnimatePresence>
          </PullToRefresh>
```

- [ ] **Step 4: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Manual visual check**

```bash
PORT=3008 npm run dev
```

On a real phone (or devtools mobile emulation with touch simulation), open Overview, scroll to the top, then pull down past roughly 70px and release. Confirm the small spinning-refresh badge appears near the top while pulling, spins continuously while the refresh request is in flight, and disappears once done. Confirm normal scrolling (without pulling from the very top) is unaffected. Switch to Connections or Research and confirm pulling down does nothing (gesture disabled there).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wrap scrollable tab content with PullToRefresh on Overview/Transactions/Performance"
```

---

## Task 3: Create AccountMenu component

**Files:**
- Create: `src/components/AccountMenu.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState, useRef, useEffect } from 'react';
import { User } from 'firebase/auth';
import { LogOut } from 'lucide-react';

interface Props {
  user: User;
  onLogout: () => void;
}

export default function AccountMenu({ user, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const initials = (user.email ?? user.displayName ?? '?')
    .split(/[@.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-[11px] font-black text-zinc-300 select-none"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-30">
          <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 truncate">{user.email}</div>
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-zinc-300 hover:bg-rose-950/40 hover:text-rose-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
```

The `initials` derivation and click-outside-to-close pattern (`wrapperRef` + `mousedown` listener) both mirror existing code in this repo — `Topbar.tsx`'s initials logic and `TransactionsTab.tsx`'s ticker-search suggestions dropdown, respectively.

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/AccountMenu.tsx
git commit -m "feat: add AccountMenu component"
```

---

## Task 4: Wire AccountMenu into KPI header and delete Topbar

**Files:**
- Modify: `src/App.tsx:14` (remove Topbar import, add AccountMenu import), `src/App.tsx:194-199` (remove Topbar render), `src/App.tsx:209-217` (add AccountMenu next to SnaptradeStatusPill)
- Delete: `src/components/Topbar.tsx`

- [ ] **Step 1: Swap the Topbar import for AccountMenu**

In `src/App.tsx`, find (around line 14):

```tsx
import Topbar from './components/Topbar';
import PullToRefresh from './components/PullToRefresh';
```

Replace with:

```tsx
import AccountMenu from './components/AccountMenu';
import PullToRefresh from './components/PullToRefresh';
```

- [ ] **Step 2: Remove the Topbar render block**

Find (around line 194):

```tsx
          <Topbar
            user={user}
            isRefreshing={isRefreshing}
            onRefresh={refreshPrices}
            onLogout={logout}
          />
```

Delete this block entirely.

- [ ] **Step 3: Mount AccountMenu next to SnaptradeStatusPill**

Find (around line 209):

```tsx
            <div className="absolute top-3 right-4 sm:right-6">
              <SnaptradeStatusPill
                accounts={snaptrade.accounts}
                lastSyncedAt={snaptrade.lastSyncedAt}
                isSyncing={snaptrade.isSyncing}
                syncError={snaptrade.syncError}
                onNavigateToConnections={() => setActiveTab('connections')}
              />
            </div>
```

Replace with:

```tsx
            <div className="absolute top-3 right-4 sm:right-6 flex items-center gap-2">
              <SnaptradeStatusPill
                accounts={snaptrade.accounts}
                lastSyncedAt={snaptrade.lastSyncedAt}
                isSyncing={snaptrade.isSyncing}
                syncError={snaptrade.syncError}
                onNavigateToConnections={() => setActiveTab('connections')}
              />
              <div className="md:hidden">
                <AccountMenu user={user} onLogout={logout} />
              </div>
            </div>
```

- [ ] **Step 4: Delete Topbar.tsx**

```bash
rm src/components/Topbar.tsx
```

- [ ] **Step 5: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Manual visual check**

With the dev server running, open the app in a mobile viewport. Confirm the slim top bar is completely gone (no Refresh icon, no avatar, no Sign out icon at the top). Confirm the avatar-initials circle now appears next to the SnaptradeStatusPill in the top-right of the KPI header, and tapping it opens a small dropdown showing your email and a "Sign out" button that actually logs you out. Resize to desktop width and confirm nothing changed there (Sidebar still has Refresh/avatar/Logout, and the new AccountMenu avatar does not appear since it's `md:hidden`).

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/Topbar.tsx
git commit -m "feat: replace Topbar with AccountMenu in KPI header, delete Topbar"
```

---

## Out of Scope (per design spec)

- Elastic/rubber-band pull physics — linear capped pull only.
- Pull-to-refresh on Connections or Research tabs.
- Any change to `Sidebar`'s existing desktop avatar/email/Logout section.
- Any change to what `refreshPrices()` fetches.
