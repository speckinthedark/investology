# Agentic Deep Dive — Design Spec
**Date:** 2026-04-24
**Status:** Approved for implementation

---

## Context

The current Deep Dive tab sends a single Gemini call with a holdings list and returns 2–3 sentences of free-form text. It has no tool access, no interactivity, no structure, and no ability to answer follow-up questions. The user is a sophisticated investor who wants a research platform, not generic AI commentary.

This spec defines a full replacement: an auto-generated portfolio risk report backed by live fundamentals and news, plus a conversational chat interface where specialist agents can be invoked by @mention for deep analysis tasks (valuation, news/sentiment).

---

## Goals

- Replace the static insights panel with a **streaming, structured Portfolio Risk Report** that runs automatically on tab open
- Add a **Research Chat** below the report where the user can invoke specialist agents via `@mention`
- First specialist agents: **@valuation** (DCF with bull/bear/base scenarios) and **@news** (bull/bear news breakdown with sourced articles)
- All agents have access to **live fundamentals** (yahoo-finance2), **real-time quotes** (Finnhub), and **Google Search** (ADK native grounding)
- Advisory framing only — surface risks and research, not specific buy/sell advice

---

## Tech Stack Additions

| Addition | Purpose |
|---|---|
| `@google/adk` | Agent orchestration, tool calling, Google Search grounding |

No other new packages. `yahoo-finance2` (fundamentals) and the Gemini SDK are already installed. The fundamentals cache uses a server-side `Map` — no new database dependency.

> **Note:** Verify the exact ADK package name and version before installing — Google's TypeScript ADK is still evolving and may ship under a different npm identifier (e.g. `@google-labs/agent-dev-kit`). Check the official ADK docs at time of implementation.

---

## Architecture

```
InsightsTab (React)
  ├── PortfolioRiskReport  → POST /api/agent/report  (SSE)
  └── AgentChat            → POST /api/agent/chat    (SSE)

Express Backend (server.ts)
  ├── POST /api/agent/report  → Portfolio Risk Agent
  └── POST /api/agent/chat    → Orchestrator
                                  ├── @valuation → Valuation Agent
                                  └── @news      → News Agent

ADK Layer (agents/)
  ├── Orchestrator         — routes @mentions, answers general questions
  ├── Portfolio Risk Agent — auto-report (concentration, news flags)
  ├── Valuation Agent      — method recommendation + DCF calculation
  └── News Agent           — bull/bear news with Google Search grounding

Tools (agents/tools.ts)
  ├── get_fundamentals(ticker)      — yahoo-finance2 + in-memory cache
  ├── get_stock_quote(ticker)       — Finnhub (existing logic)
  ├── get_price_history(ticker)     — Yahoo Finance monthly (existing logic)
  ├── calculate_dcf(assumptions)    — pure TypeScript function
  └── search_news                   — ADK native Google Search grounding
```

Portfolio context (holdings, cashBalance) is passed in the request body on each call and injected as session context. The server remains stateless — no session storage needed server-side.

---

## Agents

### Orchestrator
- Receives all chat messages
- Transfers to sub-agents when `@valuation` or `@news` detected in message
- Handles general portfolio questions directly using injected portfolio context
- Persona (Buffett / Lynch) is injected into its system prompt, colouring advisory framing

### Portfolio Risk Agent
Runs automatically when the tab opens. Makes parallel tool calls for all holdings, then streams a structured report in four sections.

**Tools:** `get_fundamentals`, `get_stock_quote`, Google Search grounding (holdings >5% of portfolio)

**Report sections:**
1. **Portfolio Health** — 1–2 sentence overall summary
2. **Concentration Flags** — sector weight, single-position weight, top-3 concentration
3. **News Red Flags** — negative news per material holding, sourced
4. **Notable Signals** — upcoming earnings, significant YTD underperformance vs sector, insider activity

Output is structured JSON per section so the frontend renders cards, not markdown prose.

### Valuation Agent (@valuation)
Multi-turn conversational agent. Fetches company profile first, recommends valuation method, then guides the user through assumptions before running the calculation.

**Tools:** `get_fundamentals`, `get_price_history`, `calculate_dcf`

**Method selection logic:**
- FCF positive + mature → DCF (traditional)
- FCF negative + high revenue growth → DCF (path-to-profitability model)
- Asset-heavy → EV/EBITDA *(future method)*
- Pre-revenue → P/S ratio *(future method)*

**Conversation flow:**
1. Fetch fundamentals → profile company
2. Recommend method + one-sentence rationale
3. Propose bull/bear/base assumptions (from fundamentals/analyst consensus as defaults)
4. User confirms or adjusts
5. Run `calculate_dcf()` → return structured result card

### News & Sentiment Agent (@news)
Uses ADK's native Google Search grounding — no external news API required.

**Tools:** Google Search grounding, `get_fundamentals`, `get_stock_quote`

**Output structure:**
- Bull Case: sourced points driving optimism
- Bear Case: sourced points driving concern
- Analyst Consensus: rating + price target range (if found)
- Sentiment Score: qualitative (Strong Bull / Mixed / Strong Bear)

---

## Tools Layer

### `get_fundamentals(ticker: string)` — with in-memory cache

```typescript
interface Fundamentals {
  ticker: string;
  sector: string; industry: string; description: string;
  marketCap: number; enterpriseValue: number;
  trailingPE: number; forwardPE: number; pegRatio: number;
  priceToSales: number; priceToBook: number;
  revenueGrowth: number; earningsGrowth: number;
  operatingMargin: number; grossMargin: number;
  freeCashFlow: number; totalDebt: number; debtToEquity: number;
  sharesOutstanding: number; beta: number;
  analystTargetPrice: number; analystRating: string;
  trailingEPS: number; forwardEPS: number;
}
```

Cache: `Map<string, { data: Fundamentals; fetchedAt: number }>` in server memory. TTL 24 hours. On hit → return cached. On miss → `yahoo-finance2.quoteSummary()` with modules `financialData`, `defaultKeyStatistics`, `summaryDetail`, `assetProfile`.

Firestore persistence can replace the Map later without any agent code changes.

### `calculate_dcf(ticker, assumptions)`

```typescript
interface DCFAssumptions {
  currentRevenue: number;
  revenueGrowthRates: { bull: number; base: number; bear: number };
  targetOperatingMargin: number;
  wacc: number;
  terminalGrowthRate: number;   // default 2.5%
  projectionYears: number;      // default 10
  sharesOutstanding: number;
  netDebt: number;              // totalDebt - cash
}

interface DCFResult {
  scenario: 'bull' | 'base' | 'bear';
  impliedSharePrice: number;
  upsideDownsidePct: number;
  impliedEV: number;
  terminalValue: number;
}
```

Pure TypeScript — no API calls. Returns all three scenarios in one call.

### Existing tools reused as-is
- `get_stock_quote` — wraps existing Finnhub fetch logic from `server.ts`
- `get_price_history` — wraps existing Yahoo Finance monthly fetch from `server.ts`

---

## Backend Changes (`server.ts`)

Two new routes added:

```
POST /api/agent/report
  Body: { uid: string, holdings: Holding[], cashBalance: number }
  → Runs Portfolio Risk Agent, streams SSE

POST /api/agent/chat
  Body: { uid: string, message: string, holdings: Holding[], cashBalance: number }
  → Runs Orchestrator, streams SSE
```

SSE format:
```
data: {"text": "chunk of text"}\n\n
data: {"structured": { ...DCFResult or ReportSection }}\n\n
data: [DONE]\n\n
```

ADK runner imported from `agents/index.ts`. In-memory fundamentals cache initialised once at server startup.

---

## Frontend Changes

### New file structure
```
src/
├── hooks/
│   └── useAgentStream.ts           — fetch + ReadableStream SSE consumer
├── components/
│   └── agent/
│       ├── PortfolioRiskReport.tsx  — auto-report panel (4 section cards)
│       ├── AgentChat.tsx            — chat container + message history
│       ├── AgentMessage.tsx         — message bubble with agent badge
│       ├── MentionInput.tsx         — textarea + @ autocomplete popover
│       └── DCFResultCard.tsx        — structured 3-column DCF output
agents/                              — server-side, alongside server.ts
├── index.ts                         — ADK agent + runner initialisation
├── tools.ts                         — all tool functions
└── prompts.ts                       — system prompt strings per agent
```

### Modified files
- `src/components/tabs/InsightsTab.tsx` — full rewrite; renders PortfolioRiskReport + AgentChat
- `server.ts` — two new routes, ADK runner import, fundamentals cache Map
- `App.tsx` — no changes (holdings + cashBalance already passed to InsightsTab)

### UI layout
```
┌─────────────────────────────────────────────────────┐
│  Portfolio Risk Report              [↻ Refresh]      │
│  ─────────────────────────────────────────────────  │
│  Portfolio Health  │  Concentration Flags            │
│  News Red Flags    │  Notable Signals                │
├─────────────────────────────────────────────────────┤
│  Research Chat                                       │
│  ─────────────────────────────────────────────────  │
│  [scrollable message history]                        │
│                                                      │
│  ┌──────────────────────────────────┐ [Send]        │
│  │ Ask anything… or type @ to route │               │
│  └──────────────────────────────────┘               │
└─────────────────────────────────────────────────────┘
```

### Agent badge colours
| Agent | Colour |
|---|---|
| Orchestrator | Zinc |
| Portfolio Risk | Violet |
| Valuation Agent | Emerald |
| News Agent | Blue |

### @mention autocomplete
When user types `@`, a popover appears listing `@valuation` and `@news`. Clicking inserts the mention. No library needed — simple string detection on input change.

### DCF Result Card
Structured card rendered when Valuation Agent returns a DCF result JSON block. Three columns (Bull / Base / Bear) with implied share price, upside/downside % (colour-coded), and a footer row showing key assumptions.

### Persona selector
Moved from the tab header into the report header as a subtle toggle. Persona is injected into the Orchestrator's system prompt on each request — colours the advisory framing of both the auto-report and chat responses.

---

## Firestore Rules

No changes needed. The fundamentals cache lives in server memory, not Firestore. If Firestore persistence is added later, a new top-level `/fundamentals/{ticker}` collection will need a rule allowing authenticated reads and server-only writes.

---

## Verification

1. **Auto-report streams**: Open the Deep Dive tab → report sections appear progressively within ~10s
2. **@mention routing**: Type `@news AAPL` → response is badged "News Agent", contains bull/bear breakdown with sources
3. **@valuation flow**: Type `@valuation HIMS` → agent recommends DCF, proposes assumptions, user adjusts one, DCF card renders with 3 scenarios
4. **Fundamentals cache**: Hit the same ticker twice in one session → second call returns instantly (server log shows cache hit)
5. **Persona affects framing**: Switch from Buffett to Lynch → report language shifts (moats vs GARP)
6. **Fallback**: Disconnect Finnhub key → fundamentals still load from Yahoo Finance, report still generates
7. **No regression**: Overview, Transactions, Performance tabs unaffected

---

## Out of Scope (future iterations)

- Additional valuation methods (EV/EBITDA, P/S, Gordon Growth Model)
- Additional specialist agents (Technical Analysis, Peer Comparison, Earnings)
- Firestore persistence for fundamentals cache
- Proactive alerts (price targets hit, news red flags triggered without user action)
- Firebase Admin SDK for server-side Firestore writes
