# Earnings Prep Design Spec

**Date:** 2026-06-23
**Branch:** `feat/earnings-prep`
**Status:** Approved

---

## Motivation

Before an earnings call, the user wants to prepare a set of "Stories" per portfolio company — each Story is a thesis question (e.g. for Meta: "AI Capex" / "Is the AI capex creating capturable value or leaking out to advertisers and chipmakers?") plus a list of metrics to check against the actual results to validate or invalidate that thesis. Once prepped, the user wants to read a compiled, clean document (rendered markdown) for that company before the call.

---

## Decision Summary

- **New standalone tab**, "Earnings Prep" — desktop sidebar entry and a 6th mobile bottom-nav icon.
- **Portfolio holdings only** — Stories can only be created for tickers currently held, not arbitrary searched tickers (unlike Research).
- **Structured data, markdown is a derived view** — Stories and Metrics are proper Firestore-backed fields (title, question, metric/baseline/what-to-watch/why), not freeform markdown notes. A pure function compiles them into a markdown document for reading.
- **One combined markdown document per ticker** — compiling renders every Story for that ticker together, not one document per Story.
- **No new dependencies** — `react-markdown` + `remark-gfm` are already installed and already used (`AgentMessage.tsx`); this feature reuses them as-is.
- **Mobile-first, single-column flow** — no side-by-side panes, no `lg:`-gated layout branching, given the repeated mobile-layout pain this app has hit with two-column designs (Research tab).
- **Archived tickers are derived, not stored** — a ticker with Stories that's no longer in `holdings` (e.g. fully sold) shows up in a separate "Archived" section instead of disappearing. No new Firestore field; computed client-side every render from `stories` vs. `holdings`.

---

## Data Model

```ts
export interface EarningsMetric {
  id: string;
  metric: string;       // e.g. "Capex as % of revenue"
  baseline: string;     // last known value, e.g. "32% in Q2 2025"
  whatToWatch: string;  // what to look for in the upcoming report
  why: string;          // why it matters to the thesis
}

export interface EarningsStory {
  id: string;
  ticker: string;
  title: string;       // e.g. "AI Capex"
  question: string;    // the thesis question
  metrics: EarningsMetric[];
  createdAt: string;
  updatedAt: string;
}
```

A Story can have any number of metrics (confirmed: "each story can have multiple metrics to track"). Metrics are embedded as an array field within the Story document — not a Firestore subcollection — since they're small, always edited together with their parent Story, and don't need independent real-time listening.

Firestore path: `users/{uid}/earningsStories/{storyId}`, one document per Story, with `ticker` as a field (not part of the path) so a single collection listener covers every ticker — the per-ticker view filters client-side, the same way `usePortfolio.ts`'s `holdings`/`transactions` collections are flat and filtered/grouped in the UI layer.

---

## Navigation & File Structure

| File | Change |
|---|---|
| `src/components/Sidebar.tsx` | `Tab` type gains `'earnings-prep'`; `NAV_ITEMS` gains `{ id: 'earnings-prep', label: 'Earnings Prep', icon: Newspaper }` |
| `src/components/MobileBottomNav.tsx` | Gains the same entry as a 6th bottom-nav icon |
| `src/App.tsx` | New render branch for `activeTab === 'earnings-prep'`; wires up `useEarningsStories` |
| `src/types.ts` | Adds `EarningsMetric` and `EarningsStory` interfaces |
| `src/hooks/useEarningsStories.ts` | New — Firestore CRUD hook, mirrors `usePortfolio.ts`'s `onSnapshot` + create/update/delete pattern |
| `src/lib/earningsMarkdown.ts` | New — pure function `compileTickerMarkdown(ticker: string, stories: EarningsStory[]): string` |
| `src/components/tabs/EarningsPrepTab.tsx` | New — top-level tab: grid of portfolio holdings with story counts |
| `src/components/earnings-prep/TickerStoriesView.tsx` | New — per-ticker drill-down: Story list, Edit/Markdown toggle, "+ Add Story" |
| `src/components/earnings-prep/StoryEditor.tsx` | New — create/edit a Story and its metrics |

`Newspaper` is imported from `lucide-react` (already a dependency, used throughout the existing nav icons).

---

## UI/UX Flow

**Top level (`EarningsPrepTab`):** a grid of the user's current portfolio holdings, reusing the existing `TickerLogo` shared component, each card showing ticker, company name, and a story count badge ("3 stories" / "No stories yet"). Tapping a card drills into that ticker's view. An empty portfolio (no holdings) shows a brief empty state pointing the user to Connections/Overview.

Below the holdings grid, an **Archived** section appears only when at least one ticker has Stories but is no longer in `holdings` (e.g. the position was fully sold). This addresses a real consequence of how brokerage resync works: `clearAllTransactions`/`bulkImportTransactions` (used by both manual refresh and SnapTrade resync) fully delete and recreate the `holdings` and `transactions` Firestore collections on every sync. `EarningsStory` documents live in a separate collection and reference a company only via a plain `ticker` string field, never a document reference into `holdings` — so resync can never delete or corrupt Story data — but a sold-out ticker does drop out of the holdings grid the UI shows. The Archived section is computed client-side every render (`stories`' distinct tickers minus `holdings`' tickers) — no new Firestore field, no risk of a stored flag drifting out of sync. Archived cards use the same layout as active holdings cards but visually dimmed (matching this app's existing muted/disabled styling, e.g. the "Deep Dive" nav item's reduced opacity), with the same story-count badge.

**Ticker view (`TickerStoriesView`):** a back button to the grid, the ticker header, then a toggle between two views:
- **Edit** (default): Story cards — title + question preview, expandable to reveal its metrics — plus per-story edit/delete icons. Delete reuses the existing `ConfirmDialog` component (the same pattern already used for deleting holdings/transactions elsewhere in the app). A "+ Add Story" button appears only when the ticker is currently held — archived tickers can still have their existing Stories viewed, edited, and deleted, just not added to, consistent with the "Stories can only be created for tickers currently held" rule.
- **Markdown**: the compiled document for every Story on this ticker, rendered read-only via the existing `ReactMarkdown` component (same usage pattern as `AgentMessage.tsx`). This is the actual "prep sheet" read before the call.

**Story editor (`StoryEditor`):** opened from "+ Add Story" or a Story's edit icon. Fields: Title (text input), Question (textarea), then a repeatable Metrics section — each row has four plain text inputs (Metric, Baseline, What to watch, Why) with add/remove-row controls. Saving writes the whole Story document back to Firestore via the hook's update/create function.

This flow is intentionally single-column and mobile-first: one focused view at a time, no `lg:`-gated layout branching anywhere in this feature.

---

## Markdown Compilation

`compileTickerMarkdown(ticker, stories)` is a pure, synchronous string-building function (no I/O), producing one document combining every Story for that ticker:

```markdown
# AMZN — Earnings Prep

## AI Capex
**Question:** Is the AI capex creating capturable value or leaking out to advertisers and chipmakers?

### Metrics to Watch

**Capex as % of revenue**
- Baseline: 32% in Q2 2025
- What to watch: Whether guidance increases again
- Why: Validates whether AI infra spend is being monetized or just cost

---

## [Next Story Title]
...
```

Each Story renders as an `## <title>` section with its question as bold lead text, followed by a `### Metrics to Watch` section listing each metric as a `**<metric>**` heading with Baseline/What to watch/Why as a bullet list. Multiple Stories are separated by a horizontal rule (`---`).

---

## Out of Scope

- Numeric target/threshold fields or confirmed/refuted status tracking on metrics (explicitly deferred — v1 is freeform text only, per the "Metric + Baseline + What to watch + Why, all freeform" decision).
- Creating *new* Stories for tickers not currently held in the portfolio (viewing/editing/deleting existing Stories for archived — fully sold — tickers is in scope, per the Archived section).
- A portfolio-wide combined markdown document (only one-doc-per-ticker is in scope).
- Any automatic pulling of live metric values from Yahoo Finance into a Story — metrics are entirely user-authored notes.
- Any change to the existing "Deep Dive" placeholder tab.
