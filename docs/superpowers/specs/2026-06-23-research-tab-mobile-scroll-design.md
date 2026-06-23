# Research Tab Mobile Scroll Fix Design Spec

**Date:** 2026-06-23
**Branch:** `feat/mobile-nav-shell`
**Status:** Approved

---

## Motivation

On mobile, the Research tab's content (ticker header, stats table, price chart, financials chart, bull/bear panel, etc.) appears permanently fixed on screen — none of it scrolls. `ResearchTab.tsx` already has CSS intended to make this work: below the `lg` (1024px) breakpoint it switches from the desktop two-column independently-scrolling layout to a single stacked column with `overflow-y-auto`, and each section gets a `min-h-[...]` fallback height so charts still render with a sane aspect ratio without the desktop fixed-height layout.

The bug is one level up. `App.tsx`'s wrapper around all tab content hardcodes `overflow-hidden` for the Research tab at every screen width, not just desktop (`src/App.tsx:286`). `ResearchTab.tsx`'s own mobile-friendly `lg:` breakpoint logic never gets a chance to take effect because its ancestor clips it regardless of viewport size.

---

## Fix

### `src/App.tsx:286` — make the outer wrapper breakpoint-aware

Current:

```tsx
className={cn('flex-1 min-h-0 custom-scrollbar pb-16 md:pb-0', activeTab === 'research' ? 'overflow-hidden' : 'overflow-y-auto')}
```

New:

```tsx
className={cn(
  'flex-1 min-h-0 custom-scrollbar pb-16 md:pb-0 overflow-y-auto',
  activeTab === 'research' && 'lg:overflow-hidden'
)}
```

`overflow-y-auto` becomes the universal base (matching every other tab). Research additionally gets `lg:overflow-hidden` so the existing desktop two-independently-scrolling-columns layout is unaffected at `lg` and above — only the breakpoint at which clipping kicks in changes, from "always" to "matching `ResearchTab.tsx`'s own `lg:` convention."

Nothing else in this line changes — `flex-1 min-h-0 custom-scrollbar pb-16 md:pb-0` stays as-is for every tab.

### `src/components/tabs/ResearchTab.tsx` — add iOS touch-scroll hint to mobile-relevant scroll containers

The codebase already uses `[-webkit-overflow-scrolling:touch]` for reliable touch/momentum scrolling on a horizontally-scrolling container (`src/App.tsx:246`, the KPI stat row). `ResearchTab.tsx`'s scrollable containers don't have it. Add it to the three relevant `overflow-y-auto` containers:

1. Line 81 (idle-state screener wrapper):
```tsx
<div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar [-webkit-overflow-scrolling:touch]">
```

2. Line 128 (success-state outer scroll wrapper):
```tsx
<div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden [-webkit-overflow-scrolling:touch]">
```

3. Line 130 (stats column, only scrolls independently at `lg`+, but harmless to include the hint unconditionally since it only affects touch-scroll behavior when the element is actually scrolling):
```tsx
<div className="lg:overflow-y-auto custom-scrollbar [-webkit-overflow-scrolling:touch]">
```

No other lines in `ResearchTab.tsx` change. The `min-h-[500px]` / `min-h-[500px]` / `min-h-[300px]` per-section fallback heights (price chart, financials chart, bull/bear panel) are left exactly as they are.

---

## Verification

This fix is reasoned from a full trace of the height/overflow chain (`html`/`body` → App.tsx grid root → Main column → the wrapper being changed → `ResearchTab.tsx`'s own internal flex/overflow chain) but has not been visually verified in a real mobile viewport, since no browser/screenshot tool is available in this environment. After implementation, the change needs manual confirmation on a real phone (or browser devtools mobile emulation): open the Research tab, search a ticker, and confirm the whole page (ticker header through bull/bear panel) scrolls as one unit with no clipped/fixed content. If scrolling still doesn't work after this fix, that means another factor is involved and needs a follow-up investigation — this spec only addresses the breakpoint mismatch identified during design.

---

## Files Changed

| File | Change |
|---|---|
| `src/App.tsx` | Line 286: outer tab-content wrapper's overflow logic made breakpoint-aware for Research (`overflow-y-auto` base, `lg:overflow-hidden` added only for Research) |
| `src/components/tabs/ResearchTab.tsx` | Add `[-webkit-overflow-scrolling:touch]` to 3 existing scrollable containers (lines 81, 128, 130) |

---

## Out of Scope

- Changing the `min-h-[...]` per-section fallback heights on mobile (explicitly confirmed: leave as-is).
- Any redesign of `ResearchTab.tsx`'s layout structure, column split, or scroll-snap behavior at `lg`+.
- Any change to other tabs.
