import { z } from 'zod';
import { LlmAgent, Runner, InMemorySessionService, FunctionTool, GOOGLE_SEARCH } from '@google/adk';
import type { Holding } from '../src/types.js';
import { getFundamentals, getStockQuote, getPriceHistory, calculateDcf } from './tools.js';
import { ORCHESTRATOR_PROMPT, PORTFOLIO_RISK_PROMPT, VALUATION_PROMPT, NEWS_PROMPT } from './prompts.js';

// ─── Tool wrappers ─────────────────────────────────────────────────────────────

// ─── Tool factories (new instances per agent to avoid duplicate-name conflict) ──

function makeFundamentalsTool() {
  return new FunctionTool({
    name: 'get_fundamentals',
    description: 'Fetch company fundamentals (PE, margins, FCF, etc.) from Yahoo Finance.',
    execute: async ({ ticker }: { ticker: string }) => getFundamentals(ticker),
  });
}

function makeStockQuoteTool() {
  return new FunctionTool({
    name: 'get_stock_quote',
    description: 'Fetch the current real-time stock quote from Finnhub.',
    execute: async ({ ticker }: { ticker: string }) =>
      getStockQuote(ticker, process.env.FINNHUB_API_KEY ?? ''),
  });
}

function makePriceHistoryTool() {
  return new FunctionTool({
    name: 'get_price_history',
    description: 'Fetch monthly price history for a ticker from Yahoo Finance.',
    execute: async ({ ticker, from }: { ticker: string; from: string }) =>
      getPriceHistory(ticker, from),
  });
}

const dcfSchema = z.object({
  ticker: z.string().describe('Stock ticker symbol'),
  currentRevenue: z.number().describe('Annual revenue in dollars'),
  currentOperatingMargin: z.number().describe('Current operating margin as decimal (e.g. 0.30)'),
  bullRevenueGrowth: z.number().describe('Bull case annual revenue growth as decimal (e.g. 0.25)'),
  baseRevenueGrowth: z.number().describe('Base case annual revenue growth as decimal'),
  bearRevenueGrowth: z.number().describe('Bear case annual revenue growth as decimal'),
  targetOperatingMargin: z.number().describe('Long-run target operating margin as decimal'),
  wacc: z.number().describe('WACC as decimal (e.g. 0.09 for 9%)'),
  terminalGrowthRate: z.number().describe('Terminal growth rate as decimal (e.g. 0.025)'),
  projectionYears: z.number().describe('Number of projection years (5 or 10)'),
  sharesOutstanding: z.number().describe('Total shares outstanding'),
  netDebt: z.number().describe('Total debt minus cash in dollars (negative = net cash)'),
  currentPrice: z.number().describe('Current stock price in dollars from get_stock_quote'),
});

function makeCalculateDcfTool() {
  return new FunctionTool({
    name: 'calculate_dcf',
    description: 'Calculate DCF valuation with bull/base/bear scenarios. All rates must be decimals.',
    parameters: dcfSchema,
    execute: async ({
      ticker, currentRevenue, currentOperatingMargin,
      bullRevenueGrowth, baseRevenueGrowth, bearRevenueGrowth,
      targetOperatingMargin, wacc, terminalGrowthRate,
      projectionYears, sharesOutstanding, netDebt, currentPrice,
    }) => calculateDcf(ticker, {
      currentRevenue,
      currentOperatingMargin,
      revenueGrowthRates: { bull: bullRevenueGrowth, base: baseRevenueGrowth, bear: bearRevenueGrowth },
      targetOperatingMargin,
      wacc,
      terminalGrowthRate,
      projectionYears,
      sharesOutstanding,
      netDebt,
      currentPrice,
    }),
  });
}

// ─── Agent factories (fresh instances per call to avoid parent-conflict error) ──

function buildNewsAgent() {
  return new LlmAgent({
    name: 'news_agent',
    model: 'gemini-3-flash-preview',
    instruction: NEWS_PROMPT,
    tools: [makeFundamentalsTool(), makeStockQuoteTool(), GOOGLE_SEARCH],
    generateContentConfig: { toolConfig: { includeServerSideToolInvocations: true } },
  });
}

function buildValuationAgent() {
  return new LlmAgent({
    name: 'valuation_agent',
    model: 'gemini-3-flash-preview',
    instruction: VALUATION_PROMPT,
    tools: [makeFundamentalsTool(), makeStockQuoteTool(), makePriceHistoryTool(), makeCalculateDcfTool()],
  });
}

function buildPortfolioRiskAgent() {
  return new LlmAgent({
    name: 'portfolio_risk_agent',
    model: 'gemini-3-flash-preview',
    instruction: PORTFOLIO_RISK_PROMPT,
    tools: [makeFundamentalsTool(), makeStockQuoteTool(), GOOGLE_SEARCH],
    generateContentConfig: { toolConfig: { includeServerSideToolInvocations: true } },
  });
}

function buildOrchestrator(persona: string): LlmAgent {
  return new LlmAgent({
    name: 'orchestrator',
    model: 'gemini-3-flash-preview',
    instruction: ORCHESTRATOR_PROMPT(persona),
    subAgents: [buildNewsAgent(), buildValuationAgent()],
  });
}

// ─── Session service (shared across chat sessions) ─────────────────────────────

const sessionService = new InMemorySessionService();
const APP_NAME = 'stockpulse';

// ─── buildPortfolioContext ─────────────────────────────────────────────────────

export function buildPortfolioContext(holdings: Holding[], cashBalance: number): string {
  const holdingsStr = holdings
    .map(
      (h) =>
        `${h.ticker}: ${h.shares.toFixed(4)} shares @ avg $${h.averagePrice.toFixed(2)}`,
    )
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

// ─── createChatSession ─────────────────────────────────────────────────────────

export async function createChatSession(uid: string, persona: string): Promise<string> {
  const orchestrator = buildOrchestrator(persona);
  // Runner is created to satisfy the API, but the shared sessionService drives session storage
  const _runner = new Runner({ appName: APP_NAME, agent: orchestrator, sessionService });
  const session = await sessionService.createSession({ appName: APP_NAME, userId: uid });
  return session.id;
}

// ─── runPortfolioReport ────────────────────────────────────────────────────────

export async function* runPortfolioReport(
  uid: string,
  holdings: Holding[],
  cashBalance: number,
  persona: string,
): AsyncGenerator<{ text?: string; structured?: unknown; error?: string }> {
  const context = buildPortfolioContext(holdings, cashBalance);
  const reportSessionService = new InMemorySessionService();
  const runner = new Runner({
    appName: APP_NAME + '_report',
    agent: buildPortfolioRiskAgent(),
    sessionService: reportSessionService,
  });
  const session = await reportSessionService.createSession({
    appName: APP_NAME + '_report',
    userId: uid,
  });

  // persona is available if the prompt ever needs it in future; suppress unused warning
  void persona;

  let fullText = '';
  for await (const event of runner.runAsync({
    userId: uid,
    sessionId: session.id,
    newMessage: {
      role: 'user',
      parts: [{ text: `${context}\n\nGenerate the portfolio risk report now.` }],
    },
  })) {
    const parts = (event.content?.parts ?? []) as Array<{ text?: string }>;
    for (const part of parts) {
      if (part.text) fullText += part.text;
    }
  }

  try {
    // Strip any markdown code fences the model may have added
    const cleaned = fullText
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    const json = JSON.parse(cleaned);
    yield { structured: { type: 'report', ...json } };
  } catch (e) {
    console.warn('[runPortfolioReport] Failed to parse JSON report:', e);
    yield { text: fullText };
  }
}

// ─── runChat ───────────────────────────────────────────────────────────────────

export async function* runChat(
  uid: string,
  sessionId: string,
  message: string,
  holdings: Holding[],
  cashBalance: number,
  persona: string,
): AsyncGenerator<{ text?: string; structured?: unknown; agent?: string; error?: string }> {
  const orchestrator = buildOrchestrator(persona);
  const runner = new Runner({ appName: APP_NAME, agent: orchestrator, sessionService });

  let activeAgent = 'orchestrator';
  let dcfResult: unknown = null;

  for await (const event of runner.runAsync({
    userId: uid,
    sessionId,
    newMessage: {
      role: 'user',
      parts: [{ text: `${buildPortfolioContext(holdings, cashBalance)}\n\nUser question: ${message}` }],
    },
  })) {
    const author = event.author;
    if (author) activeAgent = author;

    const parts = (event.content?.parts ?? []) as Array<{
      text?: string;
      functionResponse?: { name: string; response: unknown };
    }>;

    for (const part of parts) {
      // Capture calculate_dcf tool result directly from the event stream — more reliable
      // than asking the LLM to faithfully copy it into a delimiter block.
      if (part.functionResponse?.name === 'calculate_dcf') {
        dcfResult = part.functionResponse.response;
      }

      if (part.text) {
        // Strip any ---DCF_RESULT--- delimiter block the LLM may have added before yielding
        const cleaned = part.text.replace(/---DCF_RESULT---[\s\S]*?---END_DCF_RESULT---/g, '').trimEnd();
        if (cleaned) yield { text: cleaned, agent: activeAgent };
      }
    }
  }

  if (dcfResult) {
    yield { structured: { type: 'dcf', ...(dcfResult as Record<string, unknown>) }, agent: 'valuation_agent' };
  }
}
