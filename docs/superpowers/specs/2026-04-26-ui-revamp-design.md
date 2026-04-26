# UI Revamp Design Spec

**Date:** 2026-04-26

## Goal

Targeted layout and navigation revamp: replace the current top-tab navigation with a hover-expand sidebar rail, add a slim persistent topbar, keep the KPI header always visible below the topbar, and redesign the Deep Dive tab to match the design handover reference (without any persona/lens system).

Color system (zinc-based dark theme + violet accent) is **unchanged**.

---

## 1. App Shell

### Layout

Switch from a vertical stack to a two-column CSS grid:

```
┌──────────┬──────────────────────────────────────────┐
│          │  Topbar (56px)                           │
│ Sidebar  ├──────────────────────────────────────────┤
│ 64px     │  KPI Header (persistent)                 │
│ (→220px  ├──────────────────────────────────────────┤
│ on hover)│  Tab content (scrollable)                │
└──────────┴──────────────────────────────────────────┘
```

- `html, body, #root`: `height: 100%; overflow: hidden` — viewport-locked
- Shell: `display: grid; grid-template-columns: 64px 1fr; height: 100vh`
- The sidebar column is always 64px wide. When expanded it **overlays** (not pushes) the content via `position: fixed` or `absolute` + `z-index: 20`, so the main content column never reflows
- The main column (right of sidebar) is a vertical flex column: topbar → KPI header → scrollable tab content
- Tab content area: `overflow-y: auto; flex: 1`
- Breakpoint `< 768px`: sidebar hidden, content goes full width (mobile out of scope for this revamp but should not break)

### Files changed

| Action | File |
|--------|------|
| Modify | `src/App.tsx` |
| Replace | `src/components/Nav.tsx` → `src/components/Topbar.tsx` |
| Create | `src/components/Sidebar.tsx` |
| Modify | `src/index.css` |

---

## 2. Sidebar

### Structure

```
┌──────────────────┐
│  Logo mark       │  ← 32px square, app initials or mark
│  [word logo]     │  ← fades in when expanded
├──────────────────┤
│  Overview        │  ← icon + label
│  Transactions    │
│  Performance     │
│  Deep Dive       │
├──────────────────┤
│  (spacer)        │
│  Sign out        │  ← pinned to bottom
└──────────────────┘
```

### Behaviour

- Default: `width: 64px`, icons centered, labels hidden
- On `mouseenter`: width transitions to `220px` over `200ms ease`; labels fade in with `opacity: 0 → 1` over `150ms ease`
- On `mouseleave`: reverses
- Sidebar overlays main content (fixed/absolute, full height, `z-index: 20`) so content column never shifts
- Sidebar background: `bg-zinc-900`, right border: `border-r border-zinc-800`

### Nav items

| Tab | Lucide Icon |
|-----|-------------|
| Overview | `LayoutDashboard` |
| Transactions | `ArrowUpDown` |
| Performance | `TrendingUp` |
| Deep Dive | `BrainCircuit` |

### Active item styling

- Background: `bg-zinc-800`
- Left accent: `box-shadow: inset 3px 0 0 #a78bfa` (violet, matches existing accent)
- Text: `text-white`

### Inactive item styling

- Text: `text-zinc-500`
- Hover: `bg-zinc-800/50 text-zinc-300`
- Icon always visible at `20px`

### Sign-out

- Pinned to bottom with `mt-auto`
- Same styling as inactive nav item
- Icon: `LogOut`

---

## 3. Topbar

- Height: `56px`, `bg-zinc-900`, `border-b border-zinc-800`
- Sits at the top of the main column (not spanning the sidebar)
- No search bar
- **Left**: app name in small text or empty (branding lives in sidebar logo block)
- **Right cluster** (flex row, gap-3):
  - Refresh button (existing logic, `RefreshCw` icon, shows spinner when refreshing)
  - Avatar circle (initials from user email, `bg-zinc-700`)
  - Sign-out icon button (`LogOut`)

The existing `Nav.tsx` component is replaced by `Topbar.tsx`. The refresh handler, auth state, and user display are moved from `Nav` into `Topbar` with the same props interface.

---

## 4. KPI Header (Persistent)

- Sits below the topbar, above tab content — visible on every tab
- A single horizontal band, `bg-zinc-900`, `border-b border-zinc-800`, `px-6 py-4`
- No card/rounded treatment — flush edge-to-edge within the main column
- **Left group**: portfolio value large (`text-3xl font-bold text-white`), day change below it (emerald/rose)
- **Right group**: three secondary stats in a row — Cash · Total Invested · Unrealized P/L — each as a small label + value
- **Far right**: "Add Trade" and "Edit Cash" action buttons (moved from current header card)

The current large portfolio hero card in `App.tsx` is replaced by this band. The same data props flow down unchanged.

---

## 5. Deep Dive Tab (InsightsTab) Redesign

### Persona system removed

- `selectedPersona` state and `onPersonaChange` prop removed from `App.tsx` and `InsightsTab`
- `InsightsTab` no longer accepts or passes a persona
- Backend agent uses a single universal analytical voice — no persona parameter sent to `/api/agent/report` or `/api/agent/chat`
- `PortfolioRiskReport` and `AgentChat` props simplified accordingly

### Layout

Two-column layout inside the tab content area:

```
┌──────────────┬────────────────────────────────────────┐
│  Left rail   │  Right panel                           │
│  ~220px      │  (flex-1, scrollable)                  │
└──────────────┴────────────────────────────────────────┘
```

Collapses to single column below 1024px breakpoint.

### Left rail

- "New Chat" button: full width, `bg-zinc-800 hover:bg-zinc-700`, `Plus` icon
- "Risk Report" static item: shield icon + "Risk Report" label + "AI ANALYSIS" sub-label
- Chat session list below: each row has a chat bubble icon, truncated session title, relative timestamp (e.g. "2h ago")
- Active item: `bg-zinc-800`, left accent `box-shadow: inset 2px 0 0 #a78bfa`
- Width: fixed ~220px (not hover-expand — this is an inner rail, not the app sidebar)

### Right panel — Risk Report view

When "Risk Report" is selected in the left rail:

**Header row**
- Title: "Portfolio Risk Report" (`text-xl font-bold italic`)
- Sub: "Updated [date]" in `text-zinc-500 text-xs`
- Right: "Refresh" button with `RefreshCw` icon

**Portfolio Health section** *(new)*
- Section label: small dot + "Portfolio Health" uppercase label
- Short summary paragraph (from AI, same as current `portfolioHealth.summary`)
- 4-metric health bar row: Concentration · Volatility · Diversification · Total Return
  - Each metric: label, text value (e.g. "High", "Elevated", "Moderate", "Strong"), colored horizontal bar (`h-1 rounded-full`)
  - Colors: gain (emerald), loss (rose), warn (amber) based on severity
  - Bar fill width represents a 0–100% score returned by the agent

**Two-column block**
- Left: Concentration Flags (existing data, restyled as `dd-flag-row` rows)
- Right: News Red Flags (existing data, restyled)

**Notable Signals**
- Vertical list of signal rows
- Each row: ticker badge pill (colored) + one-line description text
- Restyled from current chip layout to a vertical list

**Drill into a Holding** *(new)*
- Section at bottom with `bg-zinc-800/50` background
- Scrollable horizontal row of ticker pills — one per holding
- Selecting a ticker pill reveals a 4-stat mini-card below:
  - Position Value · Avg Cost · Unrealized P/L · % of Portfolio
  - 4-column grid, each cell `bg-zinc-900 p-4`
- Ticker data sourced from existing `holdings` + `stockPrices` props passed into `InsightsTab`

**Agent data changes**
- `/api/agent/report` endpoint: remove `persona` from request body, use a fixed universal system prompt
- `PortfolioRiskReport` response shape: add `portfolioHealth.metrics` array:
  ```ts
  metrics: { label: string; value: string; score: number; tone: 'gain' | 'loss' | 'warn' }[]
  ```
- `ReportData` type updated accordingly

### Right panel — Chat view

When a chat session is selected: render existing `AgentChat` component unchanged. No persona passed.

---

## 6. What Does Not Change

- All tab content components (OverviewTab, TransactionsTab, PerformanceTab) — layout and logic unchanged
- Firebase auth, Firestore data layer
- Recharts charts, sector donut, holdings table
- Color system (zinc + violet accent + emerald/rose gain/loss)
- Toast notifications, confirm dialogs, transaction/cash modals
- Import guide panel, asset detail panel

---

## 7. Implementation Order

1. CSS: add `html, body, #root { height: 100%; overflow: hidden }` to `index.css`
2. Create `Sidebar.tsx` with hover-expand behaviour
3. Create `Topbar.tsx` (slim, no search)
4. Restructure `App.tsx` shell: grid layout, mount Sidebar + Topbar + persistent KPI header
5. Remove persona state from `App.tsx`, simplify `InsightsTab` props
6. Update `/api/agent/report` and `/api/agent/chat` to drop persona, use universal prompt
7. Redesign `InsightsTab` + `PortfolioRiskReport` to match new Deep Dive layout (health bar, drill-in section)
