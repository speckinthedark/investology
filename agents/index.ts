import { LlmAgent, Runner, InMemorySessionService, FunctionTool, GOOGLE_SEARCH } from '@google/adk';
import type { Holding } from '../src/types.js';
import { getFundamentals, getStockQuote, getPriceHistory, calculateDcf } from './tools.js';
import type { DCFAssumptions } from './tools.js';
import { ORCHESTRATOR_PROMPT, PORTFOLIO_RISK_PROMPT, VALUATION_PROMPT, NEWS_PROMPT } from './prompts.js';

// ─── Tool wrappers ─────────────────────────────────────────────────────────────

const toolGetFundamentals = new FunctionTool({
  description: 'Fetch company fundamentals (PE, margins, FCF, etc.) from Yahoo Finance.',
  execute: async ({ ticker }: { ticker: string }) => getFundamentals(ticker),
});

const toolGetStockQuote = new FunctionTool({
  description: 'Fetch the current real-time stock quote from Finnhub.',
  execute: async ({ ticker }: { ticker: string }) =>
    getStockQuote(ticker, process.env.FINNHUB_API_KEY ?? ''),
});

const toolGetPriceHistory = new FunctionTool({
  description: 'Fetch monthly price history for a ticker from Yahoo Finance.',
  execute: async ({ ticker, from }: { ticker: string; from: string }) =>
    getPriceHistory(ticker, from),
});

const toolCalculateDcf = new FunctionTool({
  description:
    'Calculate DCF valuation with bull/base/bear scenarios. Returns implied share prices.',
  execute: async ({
    ticker,
    assumptions,
  }: {
    ticker: string;
    assumptions: DCFAssumptions;
  }) => calculateDcf(ticker, assumptions),
});

// ─── Agent definitions ─────────────────────────────────────────────────────────

const newsAgent = new LlmAgent({
  name: 'news_agent',
  model: 'gemini-2.0-flash',
  instruction: NEWS_PROMPT,
  tools: [toolGetFundamentals, toolGetStockQuote, GOOGLE_SEARCH],
});

const valuationAgent = new LlmAgent({
  name: 'valuation_agent',
  model: 'gemini-2.0-flash',
  instruction: VALUATION_PROMPT,
  tools: [toolGetFundamentals, toolGetPriceHistory, toolCalculateDcf],
});

const portfolioRiskAgent = new LlmAgent({
  name: 'portfolio_risk_agent',
  model: 'gemini-2.0-flash',
  instruction: PORTFOLIO_RISK_PROMPT,
  tools: [toolGetFundamentals, toolGetStockQuote, GOOGLE_SEARCH],
});

function buildOrchestrator(persona: string): LlmAgent {
  return new LlmAgent({
    name: 'orchestrator',
    model: 'gemini-2.0-flash',
    instruction: ORCHESTRATOR_PROMPT(persona),
    subAgents: [newsAgent, valuationAgent],
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
    agent: portfolioRiskAgent,
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

  let fullText = '';
  let activeAgent = 'orchestrator';

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

    const parts = (event.content?.parts ?? []) as Array<{ text?: string }>;
    for (const part of parts) {
      if (part.text) {
        fullText += part.text;
        yield { text: part.text, agent: activeAgent };
      }
    }
  }

  // Detect DCF result delimiter in full response
  const dcfMatch = fullText.match(/---DCF_RESULT---\s*([\s\S]*?)\s*---END_DCF_RESULT---/);
  if (dcfMatch) {
    try {
      const dcfData = JSON.parse(dcfMatch[1]);
      yield { structured: { type: 'dcf', ...dcfData }, agent: 'valuation_agent' };
    } catch {
      // ignore parse errors
    }
  }
}
