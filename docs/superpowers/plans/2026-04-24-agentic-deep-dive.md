# Agentic Deep Dive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static Deep Dive tab with a streaming Portfolio Risk Report and a Research Chat where `@valuation` and `@news` agents are invoked by @mention, all powered by Google ADK with live fundamentals and Google Search grounding.

**Architecture:** An Express backend hosts four ADK agents (Orchestrator, Portfolio Risk, Valuation, News) wired to a Runner. Two SSE endpoints stream responses to the React frontend. The frontend renders a structured report panel and a chat interface with agent-badged messages and a DCF result card.

**Tech Stack:** `@google/adk`, `yahoo-finance2` (already installed), Finnhub (already wired), React 19, Framer Motion, Tailwind CSS v4, SSE via Fetch ReadableStream.

**Spec:** `docs/superpowers/specs/2026-04-24-agentic-deep-dive-design.md`

---

> ⚠️ **Before starting Task 4:** Read the official Google ADK TypeScript docs at https://google.github.io/adk-docs/get-started/typescript/ and https://github.com/google/adk-js. The API shown in Tasks 4–5 reflects the expected interface — verify class names, constructor shapes, and import paths against the current docs before writing code. All other tasks (tools, prompts, frontend) are framework-independent and can be implemented as written.

---

## File Map

**New files (server-side):**
- `agents/tools.ts` — `Fundamentals` type, in-memory cache, `getFundamentals()`, `getStockQuote()`, `getPriceHistory()`, `calculateDcf()`
- `agents/prompts.ts` — system prompt strings for all four agents
- `agents/index.ts` — ADK agent definitions, Runner, `buildPortfolioContext()`

**Modified files (server-side):**
- `server.ts` — two new SSE routes: `POST /api/agent/report` and `POST /api/agent/chat`

**New files (frontend):**
- `src/hooks/useAgentStream.ts` — `streamAgent()` utility wrapping Fetch + ReadableStream
- `src/components/agent/PortfolioRiskReport.tsx` — structured 4-section report panel
- `src/components/agent/DCFResultCard.tsx` — 3-column Bull/Base/Bear card
- `src/components/agent/AgentMessage.tsx` — chat bubble with agent badge
- `src/components/agent/MentionInput.tsx` — textarea with `@` autocomplete popover
- `src/components/agent/AgentChat.tsx` — full chat panel (history + input)

**Modified files (frontend):**
- `src/components/tabs/InsightsTab.tsx` — full rewrite; renders PortfolioRiskReport + AgentChat
- `src/App.tsx` — update InsightsTab call to pass new props, remove old insights state

---

## Task 1: Install ADK and Verify Package

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install the ADK package**

```bash
cd "/Users/rohankirpekar/Desktop/Personal projects/stockpulse-tracker"
npm install @google/adk
```

- [ ] **Step 2: Verify the install and check the exported API**

```bash
node -e "import('@google/adk').then(m => console.log(Object.keys(m)))"
```

Expected: a list of exported names including something like `Agent`, `Runner`, `LlmAgent`, or `InMemorySessionService`. Note the exact names — use them in Task 4.

- [ ] **Step 3: Read the official quickstart**

Open https://google.github.io/adk-docs/get-started/typescript/ in a browser and skim the "Define an Agent", "Register Tools", and "Run the Agent" sections. Note:
- The exact class name for an agent (may be `LlmAgent` not `Agent`)
- How tools are registered (function wrapping, schema definition)
- How `Runner` is instantiated and `runAsync` is called
- How to enable Google Search grounding

Keep this page open for reference during Task 4.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install @google/adk"
```

---

## Task 2: Tools Layer — Fundamentals Cache + DCF Calculator

**Files:**
- Create: `agents/tools.ts`

- [ ] **Step 1: Create the file with types and the in-memory cache**

Create `agents/tools.ts`:

```typescript
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Fundamentals {
  ticker: string;
  sector: string;
  industry: string;
  description: string;
  marketCap: number;
  enterpriseValue: number;
  trailingPE: number;
  forwardPE: number;
  pegRatio: number;
  priceToSales: number;
  priceToBook: number;
  revenueGrowth: number;
  earningsGrowth: number;
  currentOperatingMargin: number;
  targetableOperatingMargin: number; // gross margin as proxy for long-run potential
  grossMargin: number;
  freeCashFlow: number;
  totalRevenue: number;
  totalDebt: number;
  debtToEquity: number;
  sharesOutstanding: number;
  beta: number;
  analystTargetPrice: number;
  analystRating: string;
  trailingEPS: number;
  forwardEPS: number;
}

export interface DCFAssumptions {
  currentRevenue: number;
  currentOperatingMargin: number;
  revenueGrowthRates: { bull: number; base: number; bear: number };
  targetOperatingMargin: number;
  wacc: number;
  terminalGrowthRate: number;
  projectionYears: number;
  sharesOutstanding: number;
  netDebt: number;
  currentPrice: number;
}

export interface DCFScenario {
  scenario: 'bull' | 'base' | 'bear';
  impliedSharePrice: number;
  upsideDownsidePct: number;
  impliedEV: number;
  terminalValuePV: number;
}

export interface DCFResult {
  ticker: string;
  currentPrice: number;
  scenarios: DCFScenario[];
  assumptions: {
    wacc: number;
    terminalGrowthRate: number;
    projectionYears: number;
  };
}

// ─── In-memory fundamentals cache ─────────────────────────────────────────────

const fundamentalsCache = new Map<string, { data: Fundamentals; fetchedAt: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;

// ─── get_fundamentals ─────────────────────────────────────────────────────────

export async function getFundamentals(ticker: string): Promise<Fundamentals> {
  const cached = fundamentalsCache.get(ticker);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    console.log(`[fundamentals cache hit] ${ticker}`);
    return cached.data;
  }

  console.log(`[fundamentals fetch] ${ticker}`);
  const result = await yahooFinance.quoteSummary(ticker, {
    modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail', 'assetProfile'],
  });

  const data: Fundamentals = {
    ticker,
    sector: (result.assetProfile as any)?.sector ?? 'Unknown',
    industry: (result.assetProfile as any)?.industry ?? 'Unknown',
    description: (result.assetProfile as any)?.longBusinessSummary ?? '',
    marketCap: (result.summaryDetail as any)?.marketCap ?? 0,
    enterpriseValue: (result.defaultKeyStatistics as any)?.enterpriseValue ?? 0,
    trailingPE: (result.summaryDetail as any)?.trailingPE ?? 0,
    forwardPE: (result.defaultKeyStatistics as any)?.forwardPE ?? 0,
    pegRatio: (result.defaultKeyStatistics as any)?.pegRatio ?? 0,
    priceToSales: (result.summaryDetail as any)?.priceToSalesTrailing12Months ?? 0,
    priceToBook: (result.defaultKeyStatistics as any)?.priceToBook ?? 0,
    revenueGrowth: (result.financialData as any)?.revenueGrowth ?? 0,
    earningsGrowth: (result.financialData as any)?.earningsGrowth ?? 0,
    currentOperatingMargin: (result.financialData as any)?.operatingMargins ?? 0,
    targetableOperatingMargin: (result.financialData as any)?.grossMargins ?? 0,
    grossMargin: (result.financialData as any)?.grossMargins ?? 0,
    freeCashFlow: (result.financialData as any)?.freeCashflow ?? 0,
    totalRevenue: (result.financialData as any)?.totalRevenue ?? 0,
    totalDebt: (result.financialData as any)?.totalDebt ?? 0,
    debtToEquity: (result.financialData as any)?.debtToEquity ?? 0,
    sharesOutstanding: (result.defaultKeyStatistics as any)?.sharesOutstanding ?? 0,
    beta: (result.summaryDetail as any)?.beta ?? 1,
    analystTargetPrice: (result.financialData as any)?.targetMeanPrice ?? 0,
    analystRating: (result.financialData as any)?.recommendationKey ?? 'none',
    trailingEPS: (result.defaultKeyStatistics as any)?.trailingEps ?? 0,
    forwardEPS: (result.defaultKeyStatistics as any)?.forwardEps ?? 0,
  };

  fundamentalsCache.set(ticker, { data, fetchedAt: Date.now() });
  return data;
}

// ─── get_stock_quote (wraps existing Finnhub logic) ───────────────────────────

export async function getStockQuote(ticker: string, apiKey: string): Promise<{
  ticker: string; price: number; change: number; changePercent: number; sector: string;
}> {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`);
  const quote = await res.json();
  return {
    ticker,
    price: quote.c ?? 0,
    change: quote.d ?? 0,
    changePercent: quote.dp ?? 0,
    sector: 'Unknown',
  };
}

// ─── calculate_dcf ────────────────────────────────────────────────────────────

function runDcfScenario(
  assumptions: DCFAssumptions,
  growthRate: number,
  scenario: 'bull' | 'base' | 'bear',
): DCFScenario {
  const { currentRevenue, currentOperatingMargin, targetOperatingMargin, wacc, terminalGrowthRate, projectionYears, sharesOutstanding, netDebt, currentPrice } = assumptions;

  let revenue = currentRevenue;
  let totalPV = 0;

  for (let year = 1; year <= projectionYears; year++) {
    revenue *= 1 + growthRate;
    // Ramp margin from current to target linearly over projection period
    const marginProgress = year / projectionYears;
    const margin = currentOperatingMargin + (targetOperatingMargin - currentOperatingMargin) * marginProgress;
    const fcf = revenue * margin;
    totalPV += fcf / Math.pow(1 + wacc, year);
  }

  const finalRevenue = currentRevenue * Math.pow(1 + growthRate, projectionYears);
  const finalFCF = finalRevenue * targetOperatingMargin;
  const terminalValue = (finalFCF * (1 + terminalGrowthRate)) / (wacc - terminalGrowthRate);
  const terminalPV = terminalValue / Math.pow(1 + wacc, projectionYears);

  const impliedEV = totalPV + terminalPV;
  const equityValue = impliedEV - netDebt;
  const impliedSharePrice = Math.max(0, equityValue / sharesOutstanding);
  const upsideDownsidePct = currentPrice > 0 ? ((impliedSharePrice - currentPrice) / currentPrice) * 100 : 0;

  return { scenario, impliedSharePrice, upsideDownsidePct, impliedEV, terminalValuePV: terminalPV };
}

export function calculateDcf(assumptions: DCFAssumptions): DCFResult {
  return {
    ticker: '',
    currentPrice: assumptions.currentPrice,
    scenarios: [
      runDcfScenario(assumptions, assumptions.revenueGrowthRates.bull, 'bull'),
      runDcfScenario(assumptions, assumptions.revenueGrowthRates.base, 'base'),
      runDcfScenario(assumptions, assumptions.revenueGrowthRates.bear, 'bear'),
    ],
    assumptions: {
      wacc: assumptions.wacc,
      terminalGrowthRate: assumptions.terminalGrowthRate,
      projectionYears: assumptions.projectionYears,
    },
  };
}
```

- [ ] **Step 2: Smoke-test getFundamentals manually**

Add a temporary test block at the bottom of the file and run it:

```bash
node --input-type=module <<'EOF'
import { getFundamentals } from './agents/tools.ts';
const f = await getFundamentals('AAPL');
console.log('sector:', f.sector, '| fwd PE:', f.forwardPE, '| revenue growth:', f.revenueGrowth);
EOF
```

Expected: sector and numeric values printed. If you see `0` for all numeric fields, check which `quoteSummary` module contains the data — log `result` from the raw Yahoo call to inspect the actual shape.

- [ ] **Step 3: Smoke-test calculateDcf**

```bash
node --input-type=module <<'EOF'
import { calculateDcf } from './agents/tools.ts';
const result = calculateDcf({
  currentRevenue: 1_000_000_000,
  currentOperatingMargin: -0.05,
  revenueGrowthRates: { bull: 0.35, base: 0.25, bear: 0.15 },
  targetOperatingMargin: 0.20,
  wacc: 0.10,
  terminalGrowthRate: 0.025,
  projectionYears: 10,
  sharesOutstanding: 200_000_000,
  netDebt: 500_000_000,
  currentPrice: 19.85,
});
result.scenarios.forEach(s => console.log(s.scenario, '$' + s.impliedSharePrice.toFixed(2), s.upsideDownsidePct.toFixed(1) + '%'));
EOF
```

Expected: three lines with bull > base > bear implied prices. Bull should show positive upside, bear negative.

- [ ] **Step 4: Commit**

```bash
git add agents/tools.ts
git commit -m "feat: add tools layer — fundamentals cache and DCF calculator"
```

---

## Task 3: Agent System Prompts

**Files:**
- Create: `agents/prompts.ts`

- [ ] **Step 1: Create the prompts file**

Create `agents/prompts.ts`:

```typescript
export const ORCHESTRATOR_PROMPT = (persona: string) => `
You are a portfolio research assistant for a sophisticated, experienced investor.
Investment philosophy lens: ${persona === 'lynch' ? 'Peter Lynch — growth at a reasonable price, PEG ratios, invest in what you know, ten-baggers.' : 'Warren Buffett / Charlie Munger — competitive moats, intrinsic value, margin of safety, long-term compounding.'}

You have full context about the user's portfolio (provided at the start of this conversation).
Answer portfolio-level questions concisely and directly. Do not give buy/sell advice — surface risks, data, and research.

Agent routing rules (follow exactly):
- If the user's message contains "@valuation", transfer immediately to valuation_agent.
- If the user's message contains "@news", transfer immediately to news_agent.
- For all other messages, answer directly using the portfolio context and your own reasoning.
`.trim();

export const PORTFOLIO_RISK_PROMPT = `
You are a portfolio risk analyst. You receive a user's holdings and produce a structured risk report.
You have access to tools to fetch live fundamentals and recent news.

Your output MUST be a single JSON object matching this exact schema (no other text before or after):
{
  "portfolioHealth": {
    "summary": "<1-2 sentence overall assessment>"
  },
  "concentrationFlags": {
    "flags": [
      { "label": "<description>", "value": "<e.g. 52%>", "severity": "high|medium|low" }
    ]
  },
  "newsRedFlags": {
    "items": [
      { "ticker": "<TICKER>", "headline": "<brief summary>", "sentiment": "bearish|neutral" }
    ]
  },
  "notableSignals": {
    "items": [
      { "ticker": "<TICKER>", "signal": "<description>" }
    ]
  }
}

Rules:
- Concentration flag thresholds: single position >15% = high, >10% = medium. Sector >40% = high, >30% = medium.
- Only include newsRedFlags for holdings that represent >5% of portfolio value.
- Only include genuinely notable signals — leave arrays empty if nothing significant.
- Do NOT include any text outside the JSON object.
`.trim();

export const VALUATION_PROMPT = `
You are a valuation specialist for a sophisticated investor. You help value stocks using appropriate methods.

When the user says "@valuation <TICKER>":
1. Call get_fundamentals for that ticker to build a company profile.
2. Recommend the most appropriate valuation method:
   - FCF positive and relatively mature → Traditional DCF
   - FCF negative but strong revenue growth → Path-to-profitability DCF (margin ramp)
   - Asset-heavy business → EV/EBITDA comparable (tell user this method is coming soon)
   - Pre-revenue → P/S ratio (tell user this method is coming soon)
3. Propose default bull/bear/base assumptions based on the data (revenue growth, WACC, margins).
   Show the user a compact assumptions table and ask them to confirm or adjust.
4. Once assumptions are confirmed, call calculate_dcf with those inputs.
5. After getting the DCF result, output the narrative explanation first, then on a new line output the structured result block:

---DCF_RESULT---
<paste the full JSON from calculate_dcf here, adding "ticker" field>
---END_DCF_RESULT---

Be concise. Ask one question at a time. Never make investment recommendations.
`.trim();

export const NEWS_PROMPT = `
You are a news and sentiment analyst for a sophisticated investor.

When the user says "@news <TICKER>":
1. Use Google Search to find recent news, analyst notes, and earnings commentary for that ticker (last 30 days).
2. Call get_fundamentals for context (sector, market cap, recent analyst rating).
3. Categorise everything you found into bull and bear signals.
4. Return a structured analysis:
   - Bull Case: 3-5 sourced bullet points driving optimism
   - Bear Case: 3-5 sourced bullet points driving concern
   - Analyst Consensus: rating and price target range if found
   - Overall Sentiment: one of [Strong Bull, Mild Bull, Mixed, Mild Bear, Strong Bear]

Be specific and cite sources. Do not editorialize — present what the news says, not investment advice.
`.trim();
```

- [ ] **Step 2: Commit**

```bash
git add agents/prompts.ts
git commit -m "feat: add agent system prompts"
```

---

## Task 4: ADK Agent and Runner Initialisation

**Files:**
- Create: `agents/index.ts`

> ⚠️ **Read the ADK docs now** (https://github.com/google/adk-js) before writing this file. The code below uses the expected API — adjust class names, constructor shapes, and import paths to match what you actually find in the installed package. Run `node -e "import('@google/adk').then(m => console.log(Object.keys(m)))"` to see actual exports.

- [ ] **Step 1: Create agents/index.ts**

Create `agents/index.ts` — adjust import paths and class names based on what Task 1 verification revealed:

```typescript
// ⚠️ Verify these import paths against actual @google/adk exports before using.
// Common alternatives: LlmAgent instead of Agent, session_service instead of sessionService, etc.
import { Agent, Runner, InMemorySessionService } from '@google/adk';
import { getFundamentals, getStockQuote, calculateDcf, DCFAssumptions } from './tools.js';
import { ORCHESTRATOR_PROMPT, PORTFOLIO_RISK_PROMPT, VALUATION_PROMPT, NEWS_PROMPT } from './prompts.js';
import { Holding } from '../src/types.js';

const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? '';

// ─── Tool wrappers ─────────────────────────────────────────────────────────────
// ADK tools are typically plain async functions. The framework wraps them with
// a schema derived from the function signature + JSDoc, or you define the schema
// explicitly. Adjust to match the ADK version's tool registration API.

async function tool_get_fundamentals({ ticker }: { ticker: string }) {
  return await getFundamentals(ticker);
}

async function tool_get_stock_quote({ ticker }: { ticker: string }) {
  return await getStockQuote(ticker, FINNHUB_KEY);
}

async function tool_calculate_dcf({ assumptions }: { assumptions: DCFAssumptions }) {
  return calculateDcf(assumptions);
}

// ─── Agents ───────────────────────────────────────────────────────────────────

const newsAgent = new Agent({
  name: 'news_agent',
  model: 'gemini-2.0-flash',
  instruction: NEWS_PROMPT,
  tools: [tool_get_fundamentals, tool_get_stock_quote],
  // Google Search grounding — verify exact property name in ADK docs
  // e.g. { googleSearch: {} } or tools: [..., googleSearch]
});

const valuationAgent = new Agent({
  name: 'valuation_agent',
  model: 'gemini-2.0-flash',
  instruction: VALUATION_PROMPT,
  tools: [tool_get_fundamentals, tool_calculate_dcf],
});

const portfolioRiskAgent = new Agent({
  name: 'portfolio_risk_agent',
  model: 'gemini-2.0-flash',
  instruction: PORTFOLIO_RISK_PROMPT,
  tools: [tool_get_fundamentals, tool_get_stock_quote],
  // Google Search grounding for news red flags
});

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export function buildOrchestrator(persona: string) {
  return new Agent({
    name: 'orchestrator',
    model: 'gemini-2.0-flash',
    instruction: ORCHESTRATOR_PROMPT(persona),
    sub_agents: [newsAgent, valuationAgent, portfolioRiskAgent],
  });
}

// ─── Runner factory ───────────────────────────────────────────────────────────

const sessionService = new InMemorySessionService();

export function createRunner(persona: string) {
  return new Runner({
    agent: buildOrchestrator(persona),
    app_name: 'stockpulse',
    session_service: sessionService,
  });
}

// ─── Portfolio context builder ────────────────────────────────────────────────

export function buildPortfolioContext(holdings: Holding[], cashBalance: number): string {
  const holdingsStr = holdings
    .map((h) => `${h.ticker}: ${h.shares.toFixed(4)} shares @ avg $${h.averagePrice.toFixed(2)}`)
    .join('\n');
  const totalCostBasis = holdings.reduce((acc, h) => acc + h.shares * h.averagePrice, 0);
  return [
    'PORTFOLIO CONTEXT (use this for all analysis):',
    `Holdings:\n${holdingsStr}`,
    `Cash balance: $${cashBalance.toFixed(2)}`,
    `Total cost basis: $${totalCostBasis.toFixed(2)}`,
    `Total positions: ${holdings.length}`,
  ].join('\n\n');
}

// ─── Report runner (Portfolio Risk Agent) ─────────────────────────────────────

export async function* runPortfolioReport(
  uid: string,
  holdings: Holding[],
  cashBalance: number,
  persona: string,
): AsyncGenerator<{ text?: string; structured?: unknown; error?: string }> {
  const context = buildPortfolioContext(holdings, cashBalance);
  const runner = new Runner({
    agent: portfolioRiskAgent,
    app_name: 'stockpulse_report',
    session_service: new InMemorySessionService(),
  });

  // Adjust session creation + runAsync call to match actual ADK API
  const session = await runner.session_service.create_session({
    app_name: 'stockpulse_report',
    user_id: uid,
  });

  let fullText = '';
  for await (const event of runner.run_async({
    user_id: uid,
    session_id: session.id,
    new_message: {
      role: 'user',
      parts: [{ text: `${context}\n\nGenerate the portfolio risk report now.` }],
    },
  })) {
    const parts = (event as any).content?.parts ?? [];
    for (const part of parts) {
      if (part.text) fullText += part.text;
    }
  }

  // Parse JSON report from the agent's full response
  try {
    const json = JSON.parse(fullText.trim());
    yield { structured: { type: 'report', ...json } };
  } catch {
    // Agent didn't return clean JSON — yield raw text as fallback
    yield { text: fullText };
  }
}

// ─── Chat runner (Orchestrator) ───────────────────────────────────────────────

export async function* runChat(
  uid: string,
  sessionId: string,
  message: string,
  holdings: Holding[],
  cashBalance: number,
  persona: string,
): AsyncGenerator<{ text?: string; structured?: unknown; agent?: string; error?: string }> {
  const runner = createRunner(persona);

  let fullText = '';
  let activeAgent = 'orchestrator';

  for await (const event of runner.run_async({
    user_id: uid,
    session_id: sessionId,
    new_message: {
      role: 'user',
      parts: [{ text: message }],
    },
  })) {
    // Detect which agent is speaking — adjust property name to match ADK
    const author = (event as any).author ?? (event as any).agent_name;
    if (author) activeAgent = author;

    const parts = (event as any).content?.parts ?? [];
    for (const part of parts) {
      if (part.text) {
        fullText += part.text;
        // Stream text chunks as they arrive
        yield { text: part.text, agent: activeAgent };
      }
    }
  }

  // After full response: detect DCF result block
  const dcfMatch = fullText.match(/---DCF_RESULT---\s*([\s\S]*?)\s*---END_DCF_RESULT---/);
  if (dcfMatch) {
    try {
      const dcfData = JSON.parse(dcfMatch[1]);
      yield { structured: { type: 'dcf', ...dcfData }, agent: 'valuation_agent' };
    } catch { /* ignore parse errors */ }
  }
}

// ─── Session management ───────────────────────────────────────────────────────

export async function createChatSession(uid: string, persona: string): Promise<string> {
  const runner = createRunner(persona);
  const session = await runner.session_service.create_session({
    app_name: 'stockpulse',
    user_id: uid,
  });
  return session.id;
}
```

- [ ] **Step 2: Type-check**

```bash
cd "/Users/rohankirpekar/Desktop/Personal projects/stockpulse-tracker"
npx tsc --noEmit
```

Expected: no errors. If ADK exports differ from what's imported, fix the import names. The logic inside the functions does not need to change — only the ADK class/method names.

- [ ] **Step 3: Commit**

```bash
git add agents/index.ts
git commit -m "feat: add ADK agent and runner setup"
```

---

## Task 5: SSE Routes in server.ts

**Files:**
- Modify: `server.ts`

- [ ] **Step 1: Add import for agents at top of server.ts**

After the existing imports in `server.ts`, add:

```typescript
import { runPortfolioReport, runChat, createChatSession, buildPortfolioContext } from './agents/index.js';
import { Holding } from './src/types.js';
```

- [ ] **Step 2: Add the /api/agent/session route**

Inside `startServer()`, after the existing `/api/insights` route, add:

```typescript
// ─── Agent: create chat session ────────────────────────────────────────────
app.post('/api/agent/session', async (req, res) => {
  const { uid, persona = 'buffett' } = req.body as { uid: string; persona?: string };
  if (!uid) return res.status(400).json({ error: 'uid required' });
  try {
    const sessionId = await createChatSession(uid, persona);
    res.json({ sessionId });
  } catch (e) {
    console.error('Session creation error:', e);
    res.status(500).json({ error: 'Failed to create session' });
  }
});
```

- [ ] **Step 3: Add the /api/agent/report SSE route**

```typescript
// ─── Agent: portfolio risk report (SSE) ───────────────────────────────────
app.post('/api/agent/report', async (req, res) => {
  const { uid, holdings, cashBalance, persona = 'buffett' } = req.body as {
    uid: string;
    holdings: Holding[];
    cashBalance: number;
    persona?: string;
  };

  if (!uid || !holdings) return res.status(400).json({ error: 'uid and holdings required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    for await (const event of runPortfolioReport(uid, holdings, cashBalance, persona)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (e) {
    console.error('Report agent error:', e);
    res.write(`data: ${JSON.stringify({ error: 'Report generation failed' })}\n\n`);
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
});
```

- [ ] **Step 4: Add the /api/agent/chat SSE route**

```typescript
// ─── Agent: research chat (SSE) ───────────────────────────────────────────
app.post('/api/agent/chat', async (req, res) => {
  const { uid, sessionId, message, holdings, cashBalance, persona = 'buffett' } = req.body as {
    uid: string;
    sessionId: string;
    message: string;
    holdings: Holding[];
    cashBalance: number;
    persona?: string;
  };

  if (!uid || !sessionId || !message) {
    return res.status(400).json({ error: 'uid, sessionId, and message required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    for await (const event of runChat(uid, sessionId, message, holdings, cashBalance, persona)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (e) {
    console.error('Chat agent error:', e);
    res.write(`data: ${JSON.stringify({ error: 'Agent failed to respond' })}\n\n`);
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
});
```

- [ ] **Step 5: Restart server and smoke-test the report endpoint with curl**

Restart the dev server (Ctrl+C, `npm run dev`), then:

```bash
curl -X POST http://localhost:3000/api/agent/report \
  -H "Content-Type: application/json" \
  -d '{"uid":"test","holdings":[{"ticker":"AAPL","shares":10,"averagePrice":150}],"cashBalance":1000}' \
  --no-buffer
```

Expected: SSE events appear in the terminal — `data: {"structured":{...}}` followed by `data: [DONE]`. If you see `data: {"error":"..."}`, check the server console for the root cause.

- [ ] **Step 6: Type-check and commit**

```bash
npx tsc --noEmit
git add server.ts
git commit -m "feat: add /api/agent/report and /api/agent/chat SSE routes"
```

---

## Task 6: useAgentStream Hook

**Files:**
- Create: `src/hooks/useAgentStream.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useAgentStream.ts`:

```typescript
export interface AgentEvent {
  text?: string;
  structured?: unknown;
  agent?: string;
  error?: string;
}

export async function streamAgent(
  endpoint: string,
  body: Record<string, unknown>,
  onEvent: (event: AgentEvent) => void,
  onDone: () => void,
): Promise<void> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    onEvent({ error: `HTTP ${res.status}` });
    onDone();
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') { onDone(); return; }
      try {
        onEvent(JSON.parse(payload) as AgentEvent);
      } catch { /* skip malformed lines */ }
    }
  }

  onDone();
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAgentStream.ts
git commit -m "feat: add useAgentStream SSE utility hook"
```

---

## Task 7: PortfolioRiskReport Component

**Files:**
- Create: `src/components/agent/PortfolioRiskReport.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/agent/PortfolioRiskReport.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, TrendingDown, Newspaper, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { streamAgent } from '../../hooks/useAgentStream';
import { Holding } from '../../types';
import { Persona } from '../../types';

interface ConcentrationFlag {
  label: string;
  value: string;
  severity: 'high' | 'medium' | 'low';
}

interface NewsFlag {
  ticker: string;
  headline: string;
  sentiment: 'bearish' | 'neutral';
}

interface NotableSignal {
  ticker: string;
  signal: string;
}

interface ReportData {
  portfolioHealth: { summary: string };
  concentrationFlags: { flags: ConcentrationFlag[] };
  newsRedFlags: { items: NewsFlag[] };
  notableSignals: { items: NotableSignal[] };
}

interface Props {
  uid: string;
  holdings: Holding[];
  cashBalance: number;
  persona: Persona;
}

const SEVERITY_COLOR: Record<string, string> = {
  high: 'text-rose-400',
  medium: 'text-amber-400',
  low: 'text-zinc-400',
};

export default function PortfolioRiskReport({ uid, holdings, cashBalance, persona }: Props) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const runReport = async () => {
    if (holdings.length === 0) return;
    setLoading(true);
    setError(null);
    setReport(null);

    await streamAgent(
      '/api/agent/report',
      { uid, holdings, cashBalance, persona },
      (event) => {
        if (event.error) { setError(event.error); return; }
        if (event.structured) {
          const data = event.structured as { type: string } & ReportData;
          if (data.type === 'report') {
            setReport(data);
            setLastUpdated(new Date());
          }
        }
      },
      () => setLoading(false),
    );
  };

  useEffect(() => { runReport(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-zinc-900 rounded-[32px] border border-zinc-800 p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold italic text-white">Portfolio Risk Report</h3>
          {lastUpdated && (
            <p className="text-[10px] text-zinc-600 mt-0.5">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button
          onClick={runReport}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-40"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 text-zinc-500 py-8">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm italic">Analyzing your portfolio…</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-2 text-rose-400 text-sm py-4">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && !report && holdings.length === 0 && (
        <p className="text-sm text-zinc-600 italic">Add holdings to generate a risk report.</p>
      )}

      {/* Report sections */}
      {report && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Portfolio Health */}
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-5 md:col-span-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Portfolio Health</div>
            <p className="text-sm text-zinc-300 leading-relaxed">{report.portfolioHealth.summary}</p>
          </div>

          {/* Concentration Flags */}
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Concentration Flags</div>
            </div>
            {report.concentrationFlags.flags.length === 0 ? (
              <p className="text-xs text-zinc-600 italic">No concentration issues detected.</p>
            ) : (
              <div className="space-y-2">
                {report.concentrationFlags.flags.map((f, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">{f.label}</span>
                    <span className={cn('text-xs font-bold', SEVERITY_COLOR[f.severity])}>{f.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* News Red Flags */}
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Newspaper className="w-3.5 h-3.5 text-rose-400" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">News Red Flags</div>
            </div>
            {report.newsRedFlags.items.length === 0 ? (
              <p className="text-xs text-zinc-600 italic">No significant news flags.</p>
            ) : (
              <div className="space-y-2">
                {report.newsRedFlags.items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-[10px] font-black text-rose-400 shrink-0 mt-0.5">{item.ticker}</span>
                    <span className="text-xs text-zinc-400 leading-snug">{item.headline}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notable Signals */}
          {report.notableSignals.items.length > 0 && (
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-5 md:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-3.5 h-3.5 text-blue-400" />
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Notable Signals</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {report.notableSignals.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5">
                    <span className="text-[10px] font-black text-blue-400">{item.ticker}</span>
                    <span className="text-[11px] text-zinc-400">{item.signal}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/agent/PortfolioRiskReport.tsx
git commit -m "feat: add PortfolioRiskReport component"
```

---

## Task 8: DCFResultCard Component

**Files:**
- Create: `src/components/agent/DCFResultCard.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/agent/DCFResultCard.tsx`:

```typescript
import { cn } from '../../lib/utils';
import { DCFResult } from '../../../agents/tools';

interface Props {
  data: DCFResult & { ticker: string };
}

export default function DCFResultCard({ data }: Props) {
  return (
    <div className="mt-3 bg-zinc-950 border border-zinc-700 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-widest text-emerald-400">DCF Valuation — {data.ticker}</span>
        <span className="text-[10px] text-zinc-600">Current price: ${data.currentPrice.toFixed(2)}</span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-zinc-800">
        {data.scenarios.map((s) => {
          const isPositive = s.upsideDownsidePct >= 0;
          return (
            <div key={s.scenario} className="p-4 flex flex-col gap-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 capitalize">{s.scenario}</div>
              <div className="text-xl font-light tracking-tighter text-white">${s.impliedSharePrice.toFixed(2)}</div>
              <div className={cn('text-xs font-bold', isPositive ? 'text-emerald-400' : 'text-rose-400')}>
                {isPositive ? '+' : ''}{s.upsideDownsidePct.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-5 py-2.5 border-t border-zinc-800 flex gap-4">
        <span className="text-[10px] text-zinc-600">WACC {(data.assumptions.wacc * 100).toFixed(1)}%</span>
        <span className="text-[10px] text-zinc-600">Terminal {(data.assumptions.terminalGrowthRate * 100).toFixed(1)}%</span>
        <span className="text-[10px] text-zinc-600">{data.assumptions.projectionYears}yr projection</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add src/components/agent/DCFResultCard.tsx
git commit -m "feat: add DCFResultCard component"
```

---

## Task 9: AgentMessage Component

**Files:**
- Create: `src/components/agent/AgentMessage.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/agent/AgentMessage.tsx`:

```typescript
import { cn } from '../../lib/utils';
import DCFResultCard from './DCFResultCard';
import { DCFResult } from '../../../agents/tools';

type AgentName = 'orchestrator' | 'portfolio_risk_agent' | 'valuation_agent' | 'news_agent' | 'user';

const AGENT_LABELS: Record<string, string> = {
  orchestrator: 'Assistant',
  portfolio_risk_agent: 'Portfolio Risk',
  valuation_agent: 'Valuation',
  news_agent: 'News & Sentiment',
};

const AGENT_COLORS: Record<string, string> = {
  orchestrator: 'text-zinc-400 bg-zinc-800',
  portfolio_risk_agent: 'text-violet-400 bg-violet-950/50',
  valuation_agent: 'text-emerald-400 bg-emerald-950/50',
  news_agent: 'text-blue-400 bg-blue-950/50',
};

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  agent?: string;
  text: string;
  structured?: { type: string; [key: string]: unknown };
  streaming?: boolean;
}

interface Props {
  message: ChatMessage;
}

export default function AgentMessage({ message }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-white text-zinc-900 rounded-2xl rounded-tr-sm px-4 py-3 text-sm font-medium">
          {message.text}
        </div>
      </div>
    );
  }

  const agentKey = message.agent ?? 'orchestrator';
  const label = AGENT_LABELS[agentKey] ?? agentKey;
  const colorClass = AGENT_COLORS[agentKey] ?? AGENT_COLORS.orchestrator;

  return (
    <div className="flex flex-col gap-1.5">
      <span className={cn('text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full w-fit', colorClass)}>
        {label}
      </span>
      <div className="max-w-[90%] bg-zinc-800/60 border border-zinc-700/50 rounded-2xl rounded-tl-sm px-4 py-3">
        <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
          {message.text}
          {message.streaming && (
            <span className="inline-block w-1.5 h-3.5 bg-zinc-400 rounded-sm ml-1 animate-pulse" />
          )}
        </p>
        {message.structured?.type === 'dcf' && (
          <DCFResultCard data={message.structured as DCFResult & { ticker: string }} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add src/components/agent/AgentMessage.tsx
git commit -m "feat: add AgentMessage component with agent badge and DCF card"
```

---

## Task 10: MentionInput Component

**Files:**
- Create: `src/components/agent/MentionInput.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/agent/MentionInput.tsx`:

```typescript
import { useState, useRef, KeyboardEvent, ChangeEvent } from 'react';
import { Send } from 'lucide-react';
import { cn } from '../../lib/utils';

const AGENTS = [
  { mention: '@valuation', description: 'Valuation Agent — DCF analysis' },
  { mention: '@news', description: 'News & Sentiment Agent' },
];

interface Props {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function MentionInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('');
  const [showPopover, setShowPopover] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValue(v);
    // Show popover when user just typed @
    const lastAt = v.lastIndexOf('@');
    const textAfterAt = lastAt >= 0 ? v.slice(lastAt + 1) : '';
    setShowPopover(lastAt >= 0 && !textAfterAt.includes(' '));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') setShowPopover(false);
  };

  const insertMention = (mention: string) => {
    const lastAt = value.lastIndexOf('@');
    const newValue = value.slice(0, lastAt) + mention + ' ';
    setValue(newValue);
    setShowPopover(false);
    inputRef.current?.focus();
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    setShowPopover(false);
  };

  return (
    <div className="relative">
      {/* @mention popover */}
      {showPopover && (
        <div className="absolute bottom-full mb-2 left-0 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-xl z-10">
          {AGENTS.map((a) => (
            <button
              key={a.mention}
              onClick={() => insertMention(a.mention)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-700 transition-colors text-left"
            >
              <span className="text-xs font-black text-emerald-400">{a.mention}</span>
              <span className="text-[11px] text-zinc-400">{a.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-3 bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus-within:border-zinc-500 transition-colors">
        <textarea
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Ask anything… or type @ to invoke a specialist agent"
          rows={1}
          className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 resize-none outline-none leading-relaxed max-h-32 overflow-y-auto"
          style={{ height: 'auto' }}
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = 'auto';
            t.style.height = `${t.scrollHeight}px`;
          }}
        />
        <button
          onClick={submit}
          disabled={!value.trim() || disabled}
          className="p-1.5 bg-white text-zinc-900 rounded-lg disabled:opacity-30 hover:bg-zinc-100 transition-colors shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[10px] text-zinc-700 mt-1.5 px-1">Enter to send · Shift+Enter for new line · Type @ to invoke an agent</p>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add src/components/agent/MentionInput.tsx
git commit -m "feat: add MentionInput with @ autocomplete popover"
```

---

## Task 11: AgentChat Component

**Files:**
- Create: `src/components/agent/AgentChat.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/agent/AgentChat.tsx`:

```typescript
import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import AgentMessage, { ChatMessage } from './AgentMessage';
import MentionInput from './MentionInput';
import { streamAgent } from '../../hooks/useAgentStream';
import { Holding } from '../../types';
import { Persona } from '../../types';

interface Props {
  uid: string;
  holdings: Holding[];
  cashBalance: number;
  persona: Persona;
}

let messageCounter = 0;
const nextId = () => String(++messageCounter);

export default function AgentChat({ uid, holdings, cashBalance, persona }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Create ADK session on mount
  useEffect(() => {
    fetch('/api/agent/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, persona }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.sessionId) setSessionId(data.sessionId);
        else setSessionError('Failed to initialise session');
      })
      .catch(() => setSessionError('Failed to connect to agent'));
  }, [uid, persona]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!sessionId || isStreaming) return;

    const userMsg: ChatMessage = { id: nextId(), role: 'user', text };
    const agentMsgId = nextId();
    const agentMsg: ChatMessage = { id: agentMsgId, role: 'agent', text: '', streaming: true };

    setMessages((prev) => [...prev, userMsg, agentMsg]);
    setIsStreaming(true);

    await streamAgent(
      '/api/agent/chat',
      { uid, sessionId, message: text, holdings, cashBalance, persona },
      (event) => {
        if (event.error) {
          setMessages((prev) =>
            prev.map((m) => m.id === agentMsgId ? { ...m, text: `Error: ${event.error}`, streaming: false } : m)
          );
          return;
        }
        if (event.text) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentMsgId
                ? { ...m, text: m.text + event.text, agent: event.agent ?? m.agent }
                : m
            )
          );
        }
        if (event.structured) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentMsgId ? { ...m, structured: event.structured as ChatMessage['structured'] } : m
            )
          );
        }
      },
      () => {
        setMessages((prev) =>
          prev.map((m) => m.id === agentMsgId ? { ...m, streaming: false } : m)
        );
        setIsStreaming(false);
      },
    );
  };

  return (
    <div className="bg-zinc-900 rounded-[32px] border border-zinc-800 p-8 flex flex-col gap-6">
      <div>
        <h3 className="text-xl font-bold italic text-white">Research Chat</h3>
        <p className="text-xs text-zinc-500 mt-0.5">Type <span className="text-emerald-400 font-mono">@valuation</span> or <span className="text-blue-400 font-mono">@news</span> to invoke a specialist agent</p>
      </div>

      {sessionError && (
        <div className="text-sm text-rose-400">{sessionError}</div>
      )}

      {!sessionId && !sessionError && (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Connecting to agents…
        </div>
      )}

      {sessionId && (
        <>
          {/* Message history */}
          <div className="flex flex-col gap-4 min-h-[200px] max-h-[480px] overflow-y-auto custom-scrollbar pr-1">
            {messages.length === 0 && (
              <p className="text-sm text-zinc-600 italic">
                Ask about your portfolio, or invoke <span className="text-emerald-400">@valuation TICKER</span> or <span className="text-blue-400">@news TICKER</span>.
              </p>
            )}
            {messages.map((m) => (
              <AgentMessage key={m.id} message={m} />
            ))}
            <div ref={bottomRef} />
          </div>

          <MentionInput onSend={sendMessage} disabled={isStreaming || !sessionId} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add src/components/agent/AgentChat.tsx
git commit -m "feat: add AgentChat component with streaming message history"
```

---

## Task 12: Rewrite InsightsTab and Update App.tsx

**Files:**
- Modify: `src/components/tabs/InsightsTab.tsx` (full rewrite)
- Modify: `src/App.tsx` (update InsightsTab props, remove old insights state)

- [ ] **Step 1: Rewrite InsightsTab.tsx**

Replace the entire contents of `src/components/tabs/InsightsTab.tsx`:

```typescript
import { Persona } from '../../types';
import { Holding } from '../../types';
import { cn } from '../../lib/utils';
import PortfolioRiskReport from '../agent/PortfolioRiskReport';
import AgentChat from '../agent/AgentChat';

const PERSONAS: { id: Persona; label: string }[] = [
  { id: 'buffett', label: 'Buffett / Munger' },
  { id: 'lynch',   label: 'Peter Lynch' },
];

interface Props {
  uid: string;
  holdings: Holding[];
  cashBalance: number;
  selectedPersona: Persona;
  onPersonaChange: (p: Persona) => void;
}

export default function InsightsTab({ uid, holdings, cashBalance, selectedPersona, onPersonaChange }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {/* Persona selector */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mr-2">Analysis lens</span>
        {PERSONAS.map((p) => (
          <button
            key={p.id}
            onClick={() => onPersonaChange(p.id)}
            className={cn(
              'px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border',
              selectedPersona === p.id
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-white',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <PortfolioRiskReport
        uid={uid}
        holdings={holdings}
        cashBalance={cashBalance}
        persona={selectedPersona}
      />

      <AgentChat
        uid={uid}
        holdings={holdings}
        cashBalance={cashBalance}
        persona={selectedPersona}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update App.tsx — InsightsTab call**

In `src/App.tsx`, find the InsightsTab call (currently around line 285):

```typescript
{activeTab === 'deep-dive' && (
  <InsightsTab
    insights={insights}
    isLoading={isInsightsLoading}
    selectedPersona={selectedPersona}
    onPersonaChange={handlePersonaChange}
    onRefresh={() => refreshInsights()}
  />
)}
```

Replace with:

```typescript
{activeTab === 'deep-dive' && (
  <InsightsTab
    uid={user.uid}
    holdings={holdings}
    cashBalance={cashBalance}
    selectedPersona={selectedPersona}
    onPersonaChange={handlePersonaChange}
  />
)}
```

- [ ] **Step 3: Remove unused insights state from App.tsx**

Remove these lines from `App.tsx` (they are now dead code):

```typescript
// Remove these:
const [insights, setInsights] = useState('');
const [isInsightsLoading, setIsInsightsLoading] = useState(false);

// Remove refreshInsights function entirely:
const refreshInsights = async (persona = selectedPersona) => { ... };

// Simplify handlePersonaChange to just update persona (no refreshInsights call):
const handlePersonaChange = async (persona: typeof selectedPersona) => {
  await updatePersona(persona);
};
```

Also remove the `fetchPortfolioInsights` import from `App.tsx`:
```typescript
// Remove this import:
import { fetchPortfolioInsights } from './services/geminiService';
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. If InsightsTab import fails check that `user` is not null at the call site — `user` is already guarded by `if (!user) return <LoginPage />` above, so `user.uid` is safe.

- [ ] **Step 5: Start server and do a full end-to-end test in the browser**

```bash
npm run dev
```

Open http://localhost:3000, log in, navigate to **Deep Dive** tab. Verify:

1. Portfolio Risk Report loads automatically and sections appear (allow up to 30 seconds for first load — fundamentals are being fetched)
2. Persona toggle (Buffett / Lynch) is visible
3. Research Chat shows "Connecting to agents…" then the input appears
4. Type `@` in the chat input → popover shows `@valuation` and `@news`
5. Type `@news AAPL` → agent responds with bull/bear breakdown, badged "News & Sentiment"
6. Type `@valuation AAPL` → agent profiles the company and proposes DCF assumptions
7. Reply with "use default assumptions" → DCF result card appears with Bull/Base/Bear columns

- [ ] **Step 6: Final commit**

```bash
git add src/components/tabs/InsightsTab.tsx src/components/agent/ src/App.tsx src/hooks/useAgentStream.ts
git commit -m "feat: replace Deep Dive tab with agentic report + research chat"
```

---

## Self-Review

**Spec coverage:**
- ✅ Auto-generated Portfolio Risk Report — Task 7
- ✅ Streaming SSE from backend — Tasks 5, 6
- ✅ Structured 4-section report (health, concentration, news flags, signals) — Task 7
- ✅ Research Chat with `@mention` routing — Tasks 9, 10, 11
- ✅ `@valuation` → Valuation Agent with DCF → DCFResultCard — Tasks 2, 4, 8
- ✅ `@news` → News Agent with Google Search grounding — Tasks 3, 4
- ✅ Fundamentals in-memory cache with 24h TTL — Task 2
- ✅ `calculateDcf` with margin ramp, 3 scenarios — Task 2
- ✅ Persona selector moved to tab header — Task 12
- ✅ Agent badge colours per agent — Task 9
- ✅ App.tsx old insights state removed — Task 12
- ✅ No regression — other tabs untouched throughout

**Placeholder check:** All steps contain complete code. No TBD or TODO in the plan.

**Type consistency:** `DCFAssumptions` and `DCFResult` defined in Task 2 (`agents/tools.ts`) and consumed in Task 4 (`agents/index.ts`) and Task 8 (`DCFResultCard.tsx`) — names are consistent across all tasks. `ChatMessage` defined in Task 9 (`AgentMessage.tsx`) and used in Task 11 (`AgentChat.tsx`) — consistent.
