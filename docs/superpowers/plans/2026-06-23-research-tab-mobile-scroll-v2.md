# Research Tab Mobile Scroll Fix v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Research tab's content scroll as one continuous page on mobile — currently the ticker hero, holding callout, and analyst strip stay pinned at the top while only a small region below them scrolls in its own bounded box.

**Architecture:** `ResearchTab.tsx` and the `App.tsx` wrapper around it currently force an unconditional `h-full` (viewport-bounded height) at every screen width. That's what creates the pinned-header-plus-small-internal-scroll-box structure. This plan moves that height-bounding behind the `lg:` breakpoint throughout the chain, so below `lg` everything is normal flowing content scrolled by the outer page wrapper, while desktop (`lg`+) rendering is unchanged.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (breakpoint-prefixed utilities and arbitrary properties, e.g. `lg:[-webkit-overflow-scrolling:touch]`).

---

## File Map

| File | Change |
|---|---|
| `src/App.tsx` | `motion.div` wrapping Research content: `h-full` → `lg:h-full` |
| `src/components/tabs/ResearchTab.tsx` | 4 containers move their flex/height/overflow utilities behind `lg:` |

---

## Task 1: Make App.tsx's Research content wrapper height-unconstrained below lg

**Files:**
- Modify: `src/App.tsx:301`

- [ ] **Step 1: Change the motion.div className**

Find (line 301):

```tsx
                className={activeTab === 'research' ? 'h-full' : 'p-6'}
```

Replace with:

```tsx
                className={activeTab === 'research' ? 'lg:h-full' : 'p-6'}
```

Below `lg`, Research's content wrapper now gets no height constraint at all, so it can grow taller than the viewport — which is what lets the ancestor's `overflow-y-auto` (already fixed in a prior pass) have something to actually scroll. At `lg`+, `h-full` is restored, identical to current desktop behavior.

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "fix: stop forcing h-full on Research content below the lg breakpoint"
```

---

## Task 2: Move ResearchTab.tsx's height/overflow utilities behind lg:

**Files:**
- Modify: `src/components/tabs/ResearchTab.tsx:75`, `src/components/tabs/ResearchTab.tsx:81`, `src/components/tabs/ResearchTab.tsx:107`, `src/components/tabs/ResearchTab.tsx:128`

- [ ] **Step 1: Root container**

Find (line 75):

```tsx
    <div className="h-full flex flex-col p-6 gap-4 min-h-0">
```

Replace with:

```tsx
    <div className="flex flex-col p-6 gap-4 lg:h-full lg:min-h-0">
```

- [ ] **Step 2: Idle-state (screener) wrapper**

Find (line 81):

```tsx
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar [-webkit-overflow-scrolling:touch]">
```

Replace with:

```tsx
        <div className="custom-scrollbar lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:[-webkit-overflow-scrolling:touch]">
```

`custom-scrollbar` is a plain CSS class (defined in `src/index.css` under `@layer utilities` as a regular selector, not via Tailwind's `@utility` directive), so it cannot take a `lg:` variant — Tailwind's variant system only applies to utilities it recognizes from its own registry. It's left unprefixed; since it only styles scrollbar appearance and has no visible effect without active overflow, this is harmless below `lg`.

- [ ] **Step 3: Success-state wrapper**

Find (line 107):

```tsx
        <div className="flex-1 min-h-0 flex flex-col gap-4">
```

Replace with:

```tsx
        <div className="flex flex-col gap-4 lg:flex-1 lg:min-h-0">
```

- [ ] **Step 4: Inner grid wrapper**

Find (line 128):

```tsx
          <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden [-webkit-overflow-scrolling:touch]">
```

Replace with:

```tsx
          <div className="lg:flex-1 lg:min-h-0 lg:overflow-hidden">
```

Below `lg` this div now has no flex/height/overflow treatment at all — it just contributes its natural content height to the page, which is what eliminates the small internal scroll box. The `overflow-y-auto` and touch-scroll hint are removed entirely here (not re-prefixed), since at `lg`+ this div was always `overflow-hidden` (never `auto`) — the touch-scroll hint only ever applied to the mobile-only bounded-scroll behavior being eliminated by this fix.

Everything else in the file (the grid at line 129, the stats-table column at line 130, the charts column at line 133, and the three per-section chart/panel wrappers at lines 134/137/141) is already correctly `lg:`-scoped and degrades to a plain `min-h-[...]` content block below `lg` — none of it needs to change.

- [ ] **Step 5: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Manual visual check**

```bash
PORT=3008 npm run dev
```

This can't be fully verified without a real device or browser devtools mobile emulation (no browser/screenshot tool is available in this implementation environment) — do a best-effort code-level check: confirm the dev server starts cleanly with no console/compile errors, and confirm by reading the file that all four edits are present and that lines 129/130/133/134/137/141 are unchanged. Flag clearly in the report that a human still needs to open the Research tab on a real phone (or mobile-emulated devtools), search a ticker, and confirm the entire page — search bar/back button, ticker hero, holding callout, analyst strip, stats table, price chart, financials chart, bull/bear panel — scrolls together as one continuous page with nothing pinned or clipped, and that desktop (`lg`+) rendering is unchanged from before this fix.

- [ ] **Step 7: Commit**

```bash
git add src/components/tabs/ResearchTab.tsx
git commit -m "fix: scope ResearchTab's height-bounded scroll layout to lg and above"
```

---

## Out of Scope (per design spec)

- Any change to the desktop (`lg`+) layout, column split, or scroll-snap behavior.
- Any change to the `min-h-[...]` per-section fallback heights (already addressed/confirmed in a prior pass).
- Any change to other tabs.
- If scrolling still doesn't work after this fix on real-device testing, that means another factor is involved and needs a follow-up investigation — this plan only addresses the height-bounding mechanism identified during design.
