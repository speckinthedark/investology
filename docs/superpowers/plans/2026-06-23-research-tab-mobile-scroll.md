# Research Tab Mobile Scroll Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Research tab's content being permanently fixed (non-scrollable) on mobile by aligning `App.tsx`'s outer tab-content wrapper's overflow breakpoint with `ResearchTab.tsx`'s own existing `lg:` breakpoint.

**Architecture:** A single CSS breakpoint correction in `App.tsx` (the outer wrapper currently clips Research at every width instead of only at `lg`+) plus a defensive `-webkit-overflow-scrolling: touch` addition to `ResearchTab.tsx`'s existing scrollable containers, matching an established codebase convention.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (arbitrary value syntax `[-webkit-overflow-scrolling:touch]`).

---

## File Map

| File | Change |
|---|---|
| `src/App.tsx` | Line 286: outer tab-content wrapper's overflow logic made breakpoint-aware for Research |
| `src/components/tabs/ResearchTab.tsx` | Add `[-webkit-overflow-scrolling:touch]` to 3 existing scrollable containers |

---

## Task 1: Fix App.tsx's overflow breakpoint mismatch for Research

**Files:**
- Modify: `src/App.tsx:286`

- [ ] **Step 1: Make the wrapper's overflow breakpoint-aware**

Find (line 286):

```tsx
            className={cn('flex-1 min-h-0 custom-scrollbar pb-16 md:pb-0', activeTab === 'research' ? 'overflow-hidden' : 'overflow-y-auto')}
```

Replace with:

```tsx
            className={cn(
              'flex-1 min-h-0 custom-scrollbar pb-16 md:pb-0 overflow-y-auto',
              activeTab === 'research' && 'lg:overflow-hidden'
            )}
```

`overflow-y-auto` is now the universal base for every tab, including Research. Research additionally gets `lg:overflow-hidden` so the existing desktop two-independently-scrolling-columns layout is unchanged at `lg` (1024px) and above — only the breakpoint at which clipping starts changes, from "always" to matching `ResearchTab.tsx`'s own `lg:` convention.

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "fix: align Research tab's overflow breakpoint with its own lg: layout convention"
```

---

## Task 2: Add iOS touch-scroll hint to ResearchTab's scrollable containers

**Files:**
- Modify: `src/components/tabs/ResearchTab.tsx:81`, `src/components/tabs/ResearchTab.tsx:128`, `src/components/tabs/ResearchTab.tsx:130`

- [ ] **Step 1: Add the hint to the idle-state screener wrapper**

Find (line 81):

```tsx
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
```

Replace with:

```tsx
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar [-webkit-overflow-scrolling:touch]">
```

- [ ] **Step 2: Add the hint to the success-state outer scroll wrapper**

Find (line 128):

```tsx
          <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
```

Replace with:

```tsx
          <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden [-webkit-overflow-scrolling:touch]">
```

- [ ] **Step 3: Add the hint to the stats column**

Find (line 130):

```tsx
              <div className="lg:overflow-y-auto custom-scrollbar">
```

Replace with:

```tsx
              <div className="lg:overflow-y-auto custom-scrollbar [-webkit-overflow-scrolling:touch]">
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

This change can't be fully verified without a real device or browser devtools mobile emulation (no browser/screenshot tool is available in this implementation environment) — do a best-effort code-level check: confirm the dev server starts cleanly with no console/compile errors, and confirm by reading the rendered/transpiled output that the new classes are present. Flag clearly in the report that a human still needs to open the Research tab on a real phone (or mobile-emulated devtools), search a ticker, and confirm the whole page — ticker header through bull/bear panel — scrolls as one unit with nothing clipped or fixed in place.

- [ ] **Step 6: Commit**

```bash
git add src/components/tabs/ResearchTab.tsx
git commit -m "fix: add iOS touch-scroll hint to ResearchTab's scrollable containers"
```

---

## Out of Scope (per design spec)

- Changing the `min-h-[500px]`/`min-h-[300px]` per-section fallback heights on mobile.
- Any redesign of `ResearchTab.tsx`'s layout structure, column split, or scroll-snap behavior at `lg`+.
- Any change to other tabs.
- If scrolling still doesn't work after this fix on real-device testing, that means another factor is involved and needs a follow-up investigation — this plan only addresses the breakpoint mismatch identified during design.
