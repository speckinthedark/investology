# Research Tab Mobile Scroll Fix v2 Design Spec

**Date:** 2026-06-23
**Branch:** `feat/mobile-nav-shell`
**Status:** Approved

---

## Motivation

A prior fix (see `2026-06-23-research-tab-mobile-scroll-design.md`) corrected a breakpoint mismatch in `App.tsx`'s outer wrapper, but real-device testing showed the Research tab is still mostly unscrollable on mobile: the ticker hero, portfolio-holding callout, and analyst-target/valuation strip stay pinned at the top, eating most of the viewport, while only a small region below them (containing the stats table) scrolls within its own bounded box.

The actual root cause: `ResearchTab.tsx`'s outer containers — and the `App.tsx` wrapper around it — force an unconditional `h-full` (fixed, viewport-bounded height) at *every* screen width, not just desktop. That's what creates the "pinned header + small internal scroll box" structure: the header sections are flex children with `shrink-0` inside a height-bounded flex column, and only one descendant (`ResearchTab.tsx:128`) gets its own internal `overflow-y-auto`, scrolling within whatever space the pinned siblings left behind. The desktop two-independently-scrolling-columns layout genuinely needs this height-bounding (so each column can scroll within a fixed viewport-height box) — but it should only apply at `lg` (1024px) and above. Below `lg`, nothing should be height-bounded; content should flow naturally and the page should scroll as one unit via the outer wrapper (already fixed to do this in the prior pass).

---

## Fix

### `src/App.tsx` — motion.div wrapping Research content

Current (~line 301):

```tsx
className={activeTab === 'research' ? 'h-full' : 'p-6'}
```

New:

```tsx
className={activeTab === 'research' ? 'lg:h-full' : 'p-6'}
```

Below `lg`, Research's content wrapper gets no height constraint at all (it can grow taller than the viewport, which is exactly what lets the ancestor's `overflow-y-auto` — fixed in the prior pass — actually have something to scroll). At `lg`+, `h-full` is restored, identical to current desktop behavior.

### `src/components/tabs/ResearchTab.tsx` — four containers move their height/overflow utilities behind `lg:`

1. Root container, current (line 75):
```tsx
<div className="h-full flex flex-col p-6 gap-4 min-h-0">
```
New:
```tsx
<div className="flex flex-col p-6 gap-4 lg:h-full lg:min-h-0">
```

2. Idle-state (screener) wrapper, current (line 81):
```tsx
<div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar [-webkit-overflow-scrolling:touch]">
```
New:
```tsx
<div className="custom-scrollbar lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:[-webkit-overflow-scrolling:touch]">
```
(`custom-scrollbar` is a plain CSS class, not a Tailwind-registered utility — it can't take a `lg:` variant and has no visible effect without active overflow, so it's left unprefixed; the touch-scroll hint and overflow utilities, which Tailwind does recognize for variants, move behind `lg:`.)

3. Success-state wrapper, current (line 107):
```tsx
<div className="flex-1 min-h-0 flex flex-col gap-4">
```
New:
```tsx
<div className="flex flex-col gap-4 lg:flex-1 lg:min-h-0">
```

4. Inner grid wrapper (the one whose `overflow-y-auto` previously created the small bounded scroll box), current (line 128):
```tsx
<div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden [-webkit-overflow-scrolling:touch]">
```
New:
```tsx
<div className="lg:flex-1 lg:min-h-0 lg:overflow-hidden">
```
Below `lg` this div now has no flex/height/overflow treatment at all — it just contributes its natural content height to the page. The `overflow-y-auto`/touch-scroll-hint are removed entirely here (not just re-prefixed), since at `lg`+ this div was always `overflow-hidden` (never `auto`) — the touch-scroll hint only ever applied to the mobile-only behavior being eliminated.

### What does NOT change

- The grid at line 129 (`grid-cols-1 ... lg:grid-cols-[1fr_3fr] lg:h-full`), the stats-table column (line 130, `lg:overflow-y-auto`), the charts column (line 133, `lg:h-full lg:overflow-y-auto ... scroll-snap`), and the three per-section chart/panel wrappers (lines 134, 137, 141, `min-h-[...] lg:min-h-0 lg:h-full ...`) are already correctly `lg:`-scoped and degrade to plain `min-h-[...]` content blocks below `lg`. No changes needed.
- `shrink-0` on the header item wrappers (search bar, back-button/hero, callout, insights strip) is left as-is — it's a no-op without a height-bounded flex ancestor, so it's harmless below `lg` and still correct at `lg`+.
- The loading-state skeleton (lines 92-104) and error-state block use fixed pixel heights or no height constraint at all already — unaffected by this change.
- Nothing about the `lg`+ (desktop) rendering changes: every utility that currently applies unconditionally at `lg`+ still applies, just now expressed with an explicit `lg:` prefix instead of being unconditional.

### Side effect (confirmed acceptable)

The idle "browse screeners" view currently keeps its search bar pinned at the top while the screener list scrolls in its own small box, via the same root-cause mechanism. This fix removes that too — below `lg`, the search bar scrolls away with the rest of the page instead of staying pinned, for consistency with the rest of this fix.

---

## Verification

Same caveat as the prior pass: this is reasoned from a full trace of the height/overflow chain, not visually verified in a browser (no browser/screenshot tool available in this environment). After implementation, needs manual confirmation on a real phone or devtools mobile emulation: open Research, search a ticker, and confirm the entire page — search bar/back button, ticker hero, holding callout, analyst strip, stats table, price chart, financials chart, bull/bear panel — scrolls together as one continuous page with nothing pinned or clipped. Also confirm desktop (`lg`+) rendering is pixel-identical to before this change.

---

## Files Changed

| File | Change |
|---|---|
| `src/App.tsx` | `motion.div` wrapping Research content: `h-full` → `lg:h-full` |
| `src/components/tabs/ResearchTab.tsx` | 4 containers (root, idle wrapper, success wrapper, inner grid wrapper) move their flex/height/overflow utilities behind `lg:` |

---

## Out of Scope

- Any change to the desktop (`lg`+) layout, column split, or scroll-snap behavior.
- Any change to the `min-h-[...]` per-section fallback heights (already addressed/confirmed in the prior pass).
- Any change to other tabs.
