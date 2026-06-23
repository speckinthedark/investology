# Mobile Topbar Removal Design Spec

**Date:** 2026-06-23
**Branch:** `feat/mobile-nav-shell`
**Status:** Approved

---

## Motivation

The mobile nav shell work left `Topbar` visible on mobile (showing Refresh, account avatar, and Sign out) even after removing it from desktop, since at the time it was the only access point for those actions on mobile. The more persistent chrome stacked above the tab content, the less vertical space mobile screens have for the tab itself. This sub-project removes `Topbar` from mobile too, relocating its two pieces of functionality into less space-hungry forms: Refresh becomes a pull-to-refresh gesture, and account/Sign out becomes a tap-to-reveal menu tucked into the KPI header (which is already persistent and not going away).

---

## Decision Summary

- **`Topbar.tsx` is deleted entirely.** After Refresh and account/Sign out relocate, it has nothing left to show at any breakpoint (it was already empty on desktop since the prior mobile-nav-shell work).
- **Refresh becomes pull-to-refresh**, scoped to Overview, Transactions, and Performance tabs only — the tabs sharing the existing outer scroll wrapper and showing price-derived data. Connections (not price-related) and Research (different scroll architecture) are excluded.
- **Account/Sign out becomes a tap-to-reveal menu** (`AccountMenu`), mobile-only (`md:hidden`), placed next to `SnaptradeStatusPill` in the KPI header's top-right corner. Desktop is untouched — `Sidebar` already has avatar/email/Logout there.
- **No new dependencies.** Pull-to-refresh is hand-built using raw touch events for gesture detection (gated on `scrollTop === 0`) plus Framer Motion (already a dependency) for the indicator's animation. Framer Motion's generic `drag` prop is not used, since it's designed for free-floating draggable elements, not "only pull when already at the top of a scrollable list."
- **No elastic/rubber-band physics.** The pull is a capped linear distance with a fixed trigger threshold — functional, not pixel-perfect-native. Out of scope for this round.

---

## Pull-to-Refresh

### New: `src/components/PullToRefresh.tsx`

Renders the scrollable container itself (replacing the raw `<div>` in `App.tsx` that all tabs currently share), so it owns both the scroll behavior and the gesture detection on the same element.

```ts
interface Props {
  onRefresh: () => void;
  isRefreshing: boolean;
  disabled: boolean;
  className?: string;
  children: React.ReactNode;
}
```

Behavior:
- A `ref` to the scrollable element tracks `scrollTop`. Touch handlers (`onTouchStart`, `onTouchMove`, `onTouchEnd`) are attached to the container.
- A pull gesture is only recognized if the touch **starts** while `scrollTop === 0` and the **first move** is downward. Once recognized, `touchmove`'s default scroll is suppressed and pull distance is tracked in state, capped at a max of 100px.
- A `RefreshCw` icon (same icon/spin convention as the old Sidebar/Topbar refresh button) renders above the content, inside the same relatively-positioned wrapper. Its rotation is driven by pull progress (0–180° as pull distance approaches the threshold) and its opacity fades in with pull distance. This uses a Framer Motion `useMotionValue`/`motion.div style` for smooth, non-reflowing updates on every `touchmove`, not React state-driven re-renders of the icon itself.
- **Threshold: 70px.** On `touchend`, if pull distance ≥ 70px, call `onRefresh()` and keep the icon spinning continuously (`animate-spin`, ignoring pull-progress rotation) until the parent's `isRefreshing` prop goes false, then animate the indicator back to hidden. If pull distance < 70px on release, snap back immediately with no refresh call.
- When `disabled` is true, no touch listeners are attached at all — scrolling behaves exactly as it does today, with zero performance/event overhead.

### `src/App.tsx` integration

Replaces the existing scroll container:

```tsx
<div className={cn('flex-1 min-h-0 custom-scrollbar pb-16 md:pb-0', activeTab === 'research' ? 'overflow-hidden' : 'overflow-y-auto')}>
```

with:

```tsx
<PullToRefresh
  className={cn('flex-1 min-h-0 custom-scrollbar pb-16 md:pb-0', activeTab === 'research' ? 'overflow-hidden' : 'overflow-y-auto')}
  onRefresh={refreshPrices}
  isRefreshing={isRefreshing}
  disabled={!['overview', 'transactions', 'performance'].includes(activeTab)}
>
  <AnimatePresence mode="wait">
    {/* unchanged */}
  </AnimatePresence>
</PullToRefresh>
```

`refreshPrices` and `isRefreshing` already exist in `App.tsx` (currently wired to `Sidebar`'s desktop refresh button) — `PullToRefresh` reuses them directly rather than tracking its own refresh state.

---

## Account Menu

### New: `src/components/AccountMenu.tsx`

```ts
interface Props {
  user: User; // firebase/auth
  onLogout: () => void;
}
```

A small avatar-initials `<button>` (same initials-derivation logic `Topbar` used: first letters of the email/display-name segments split on `[@.\s]`). Clicking toggles an open/closed `useState`, rendering a dropdown below-right of the avatar containing the user's email (truncated) and a "Sign out" button. Closes on outside-click, using a `wrapperRef` + `document.addEventListener('mousedown', ...)` — the same click-outside pattern already used for the ticker-search suggestions dropdown in `TransactionsTab.tsx`.

### `src/App.tsx` integration

Mounted inside the KPI header's existing absolutely-positioned top-right container, next to `SnaptradeStatusPill`, wrapped in `md:hidden` so it only renders on mobile:

```tsx
<div className="absolute top-3 right-4 sm:right-6 flex items-center gap-2">
  <SnaptradeStatusPill ... />
  <div className="md:hidden">
    <AccountMenu user={user} onLogout={logout} />
  </div>
</div>
```

---

## Topbar Removal

`src/components/Topbar.tsx` is deleted. In `src/App.tsx`:
- Remove the `import Topbar from './components/Topbar';` line.
- Remove the `<Topbar user={user} isRefreshing={isRefreshing} onRefresh={refreshPrices} onLogout={logout} />` render block.

`isRefreshing`/`refreshPrices`/`user`/`logout` all remain in use elsewhere (`PullToRefresh`, `AccountMenu`, `Sidebar`), so no other cleanup is needed beyond removing `Topbar` itself.

---

## Files Changed

| File | Change |
|---|---|
| `src/components/PullToRefresh.tsx` | New — touch-gesture pull-to-refresh wrapper around the scrollable tab-content container |
| `src/components/AccountMenu.tsx` | New — mobile-only avatar button + tap-to-reveal email/Sign out dropdown |
| `src/components/Topbar.tsx` | Deleted |
| `src/App.tsx` | Remove `Topbar` import/render; wrap scroll container with `PullToRefresh`; mount `AccountMenu` next to `SnaptradeStatusPill` |

---

## Out of Scope

- Elastic/rubber-band pull physics (native iOS-style resistance curve) — linear capped pull only.
- Pull-to-refresh on Connections or Research tabs.
- Any change to `Sidebar`'s existing desktop avatar/email/Logout section.
- Any change to what `refreshPrices()` actually fetches (still stock prices only, via `fetchStockData` per holding).
