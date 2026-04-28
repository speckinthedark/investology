# Yahoo Finance Insights Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the yahoo-finance2 `insights` API into the Research tab to surface an analyst recommendation strip, a bull/bear thesis panel, and a technical outlook block for any searched stock.

**Architecture:** A new Express route `/api/stock/insights/:ticker` calls `yahooFinance.insights()` server-side and returns a trimmed JSON payload. The frontend fetches this in parallel with the existing `fetchStockDetail` call in `ResearchTab.tsx` and passes the result down to three new display-only components: `InsightsStrip` (analyst rating + valuation), `BullBearPanel` (bull/bear bullets), and `TechnicalOutlook` (3-term outlook bars + key levels).

**Tech Stack:** Express + yahoo-finance2 (server), React + Tailwind CSS v4 (frontend), TypeScript throughout. No new npm packages needed — yahoo-finance2 is already installed.

---

## File Structure

**Modified:**
- `server.ts` — add `/api/stock/insights/:ticker` route (after the existing `/api/stock/detail/:ticker` block)
- `src/types.ts` — add `StockInsights` interface
- `src/services/stockService.ts` — add `fetchStockInsights(ticker)` function
- `src/components/tabs/ResearchTab.tsx` — fetch insights in parallel with detail, render 3 new components

**Created:**
- `src/components/research/InsightsStrip.tsx` — Block 1: analyst rating badge + target price + valuation description + discount
- `src/components/research/BullBearPanel.tsx` — Block 2: bull/bear bullet list from `upsell.msBullishSummary/msBearishSummary`
- `src/components/research/TechnicalOutlook.tsx` — Block 3: short/intermediate/long outlook rows + support/resistance/stop-loss

---

## Task 1: Backend route — `/api/stock/insights/:ticker`

**Files:**
- Modify: `server.ts` (after line 195, after the `/api/stock/detail/:ticker` block)

- [ ] **Step 1: Add the route**

In `server.ts`, insert the following block immediately after the closing `});` of the `/api/stock/detail/:ticker` route (around line 195):

```typescript
  // --- Yahoo Finance Insights for Research tab ---
  app.get('/api/stock/insights/:ticker', async (req, res) => {
    const ticker = (req.params.ticker as string).toUpperCase();
    try {
      const raw = await yahooFinance.insights(ticker, { reportsCount: 0 });

      res.json({
        recommendation: raw.recommendation
          ? {
              rating: raw.recommendation.rating,
              targetPrice: raw.recommendation.targetPrice ?? null,
              provider: raw.recommendation.provider,
            }
          : null,
        valuation: raw.instrumentInfo?.valuation
          ? {
              description: raw.instrumentInfo.valuation.description ?? null,
              discount: raw.instrumentInfo.valuation.discount ?? null,
              relativeValue: raw.instrumentInfo.valuation.relativeValue ?? null,
              provider: raw.instrumentInfo.valuation.provider,
            }
          : null,
        technicalEvents: raw.instrumentInfo?.technicalEvents
          ? {
              shortTermOutlook: raw.instrumentInfo.technicalEvents.shortTermOutlook,
              intermediateTermOutlook: raw.instrumentInfo.technicalEvents.intermediateTermOutlook,
              longTermOutlook: raw.instrumentInfo.technicalEvents.longTermOutlook,
            }
          : null,
        keyTechnicals: raw.instrumentInfo?.keyTechnicals
          ? {
              support: raw.instrumentInfo.keyTechnicals.support ?? null,
              resistance: raw.instrumentInfo.keyTechnicals.resistance ?? null,
              stopLoss: raw.instrumentInfo.keyTechnicals.stopLoss ?? null,
              provider: raw.instrumentInfo.keyTechnicals.provider,
            }
          : null,
        upsell: raw.upsell
          ? {
              bullishSummary: raw.upsell.msBullishSummary ?? null,
              bearishSummary: raw.upsell.msBearishSummary ?? null,
              companyName: raw.upsell.companyName ?? null,
            }
          : null,
      });
    } catch (e) {
      console.error('Insights error:', e);
      res.status(500).json({ error: 'Failed to fetch insights' });
    }
  });
```

- [ ] **Step 2: Verify the route returns data**

Start the server (`npm run dev`) and in a separate terminal run:
```bash
curl http://localhost:5173/api/stock/insights/AAPL | python3 -m json.tool
```
Expected: JSON object with `recommendation`, `valuation`, `technicalEvents`, `keyTechnicals`, `upsell` keys. Some may be null for non-US tickers, that's fine.

- [ ] **Step 3: Commit**

```bash
git add server.ts
git commit -m "feat: add /api/stock/insights/:ticker endpoint"
```

---

## Task 2: Types

**Files:**
- Modify: `src/types.ts` (append at end of file)

- [ ] **Step 1: Add the `StockInsights` type**

Append to the end of `src/types.ts`:

```typescript
export type InsightsDirection = 'Bearish' | 'Bullish' | 'Neutral';

export interface InsightsOutlook {
  stateDescription: string;
  direction: InsightsDirection;
  score: number;
  scoreDescription: string;
  sectorDirection?: InsightsDirection;
  sectorScore?: number;
  sectorScoreDescription?: string;
  indexDirection: InsightsDirection;
  indexScore: number;
  indexScoreDescription: string;
}

export interface StockInsights {
  recommendation: {
    rating: 'BUY' | 'SELL' | 'HOLD';
    targetPrice: number | null;
    provider: string;
  } | null;
  valuation: {
    description: string | null;
    discount: string | null;
    relativeValue: string | null;
    provider: string;
  } | null;
  technicalEvents: {
    shortTermOutlook: InsightsOutlook;
    intermediateTermOutlook: InsightsOutlook;
    longTermOutlook: InsightsOutlook;
  } | null;
  keyTechnicals: {
    support: number | null;
    resistance: number | null;
    stopLoss: number | null;
    provider: string;
  } | null;
  upsell: {
    bullishSummary: string[] | null;
    bearishSummary: string[] | null;
    companyName: string | null;
  } | null;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add StockInsights type"
```

---

## Task 3: Service function

**Files:**
- Modify: `src/services/stockService.ts` (append after `fetchStockDetail`)

- [ ] **Step 1: Add `fetchStockInsights`**

Append after the `fetchStockDetail` function in `src/services/stockService.ts`:

```typescript
export async function fetchStockInsights(ticker: string): Promise<StockInsights> {
  const res = await fetch(`/api/stock/insights/${encodeURIComponent(ticker.toUpperCase())}`);
  if (!res.ok) throw new Error('Failed to fetch insights');
  return res.json();
}
```

Also add `StockInsights` to the import at the top of the file:

```typescript
import { StockData, PriceHistory, StockDetail, StockInsights } from '../types';
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/stockService.ts
git commit -m "feat: add fetchStockInsights service function"
```

---

## Task 4: `InsightsStrip` component (Block 1)

**Files:**
- Create: `src/components/research/InsightsStrip.tsx`

This component renders a horizontal strip showing the analyst recommendation rating, target price, valuation label, and discount. All data is optional — only render what's present.

- [ ] **Step 1: Create the component**

```tsx
import { StockInsights } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  insights: StockInsights;
  currentPrice: number | null;
}

const RATING_STYLE: Record<'BUY' | 'SELL' | 'HOLD', { bg: string; text: string; border: string }> = {
  BUY:  { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/40' },
  SELL: { bg: 'bg-rose-500/15',    text: 'text-rose-400',    border: 'border-rose-500/40' },
  HOLD: { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/40' },
};

export default function InsightsStrip({ insights, currentPrice }: Props) {
  const { recommendation, valuation } = insights;
  if (!recommendation && !valuation) return null;

  const ratingStyle = recommendation ? RATING_STYLE[recommendation.rating] : null;
  const upside =
    recommendation?.targetPrice && currentPrice && currentPrice > 0
      ? ((recommendation.targetPrice - currentPrice) / currentPrice) * 100
      : null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3 flex flex-wrap items-center gap-4">
      {recommendation && ratingStyle && (
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'px-3 py-1 rounded-lg border text-[11px] font-black uppercase tracking-widest',
              ratingStyle.bg, ratingStyle.text, ratingStyle.border,
            )}
          >
            {recommendation.rating}
          </span>
          {recommendation.targetPrice != null && (
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Target</span>
              <span className="text-sm font-bold text-white font-mono">
                ${recommendation.targetPrice.toFixed(2)}
                {upside != null && (
                  <span className={cn('ml-1.5 text-[10px]', upside >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    ({upside >= 0 ? '+' : ''}{upside.toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>
          )}
          <span className="text-[9px] text-zinc-600 uppercase tracking-widest">{recommendation.provider}</span>
        </div>
      )}

      {recommendation && valuation && (
        <div className="w-px h-8 bg-zinc-800 shrink-0" />
      )}

      {valuation && (valuation.description || valuation.discount) && (
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Valuation</span>
            <span className="text-sm font-bold text-white">
              {valuation.description ?? valuation.relativeValue ?? '—'}
              {valuation.discount && (
                <span className="ml-1.5 text-[10px] text-zinc-400 font-normal">{valuation.discount} discount</span>
              )}
            </span>
          </div>
          <span className="text-[9px] text-zinc-600 uppercase tracking-widest">{valuation.provider}</span>
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
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/research/InsightsStrip.tsx
git commit -m "feat: add InsightsStrip component"
```

---

## Task 5: `BullBearPanel` component (Block 2)

**Files:**
- Create: `src/components/research/BullBearPanel.tsx`

Renders two columns: bull case bullets (emerald) on the left, bear case bullets (rose) on the right. Only renders if at least one side has content.

- [ ] **Step 1: Create the component**

```tsx
import { StockInsights } from '../../types';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  insights: StockInsights;
}

export default function BullBearPanel({ insights }: Props) {
  const bull = insights.upsell?.bullishSummary;
  const bear = insights.upsell?.bearishSummary;

  if ((!bull || bull.length === 0) && (!bear || bear.length === 0)) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {bull && bull.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Bull Case</span>
            </div>
            <ul className="space-y-2.5">
              {bull.map((point, i) => (
                <li key={i} className="flex gap-2.5 text-xs text-zinc-300 leading-relaxed">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-emerald-500 shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}
        {bear && bear.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <TrendingDown className="w-4 h-4 text-rose-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-400">Bear Case</span>
            </div>
            <ul className="space-y-2.5">
              {bear.map((point, i) => (
                <li key={i} className="flex gap-2.5 text-xs text-zinc-300 leading-relaxed">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-rose-500 shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/research/BullBearPanel.tsx
git commit -m "feat: add BullBearPanel component"
```

---

## Task 6: `TechnicalOutlook` component (Block 3)

**Files:**
- Create: `src/components/research/TechnicalOutlook.tsx`

Renders a card with three outlook rows (Short / Intermediate / Long term) each showing a direction badge, score bar (filled dots out of 5), and description. Below that, three key technical levels: Support, Resistance, Stop Loss.

- [ ] **Step 1: Create the component**

```tsx
import { StockInsights, InsightsOutlook, InsightsDirection } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  insights: StockInsights;
}

const DIRECTION_STYLE: Record<InsightsDirection, { badge: string; dot: string }> = {
  Bullish: { badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-500' },
  Bearish: { badge: 'text-rose-400 bg-rose-500/10 border-rose-500/30',          dot: 'bg-rose-500' },
  Neutral: { badge: 'text-zinc-400 bg-zinc-700/40 border-zinc-600/40',          dot: 'bg-zinc-500' },
};

function OutlookRow({ label, outlook }: { label: string; outlook: InsightsOutlook }) {
  const style = DIRECTION_STYLE[outlook.direction];
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="w-24 shrink-0 text-[9px] font-black uppercase tracking-widest text-zinc-500">{label}</div>
      <span className={cn('px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest shrink-0', style.badge)}>
        {outlook.direction}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={cn('w-1.5 h-1.5 rounded-full', i < outlook.score ? style.dot : 'bg-zinc-700')}
          />
        ))}
      </div>
      <span className="text-[10px] text-zinc-500 leading-snug">{outlook.scoreDescription}</span>
    </div>
  );
}

export default function TechnicalOutlook({ insights }: Props) {
  const { technicalEvents, keyTechnicals } = insights;
  if (!technicalEvents && !keyTechnicals) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Technical Outlook</div>
      {technicalEvents?.shortTermOutlook?.stateDescription && (
        <p className="text-[10px] text-zinc-600 mb-4 leading-relaxed">
          {technicalEvents.shortTermOutlook.stateDescription}
        </p>
      )}

      {technicalEvents && (
        <div className="divide-y divide-zinc-800">
          <OutlookRow label="Short Term"    outlook={technicalEvents.shortTermOutlook} />
          <OutlookRow label="Intermediate"  outlook={technicalEvents.intermediateTermOutlook} />
          <OutlookRow label="Long Term"     outlook={technicalEvents.longTermOutlook} />
        </div>
      )}

      {keyTechnicals && (
        <div className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-3 gap-3">
          {[
            { label: 'Support',    value: keyTechnicals.support },
            { label: 'Resistance', value: keyTechnicals.resistance },
            { label: 'Stop Loss',  value: keyTechnicals.stopLoss },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">{label}</div>
              <div className="font-mono text-sm font-bold text-white">
                {value != null ? `$${value.toFixed(2)}` : '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      {technicalEvents && (
        <div className="mt-3 text-[8px] text-zinc-700 uppercase tracking-widest">
          Source: Trading Central
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
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/research/TechnicalOutlook.tsx
git commit -m "feat: add TechnicalOutlook component"
```

---

## Task 7: Wire up `ResearchTab.tsx`

**Files:**
- Modify: `src/components/tabs/ResearchTab.tsx`

Fetch insights in parallel with `fetchStockDetail`. Show a separate skeleton row for insights (since it may resolve at a different time). Render `InsightsStrip` below `PortfolioCallout`, `TechnicalOutlook` at the bottom of the right column, and `BullBearPanel` below the whole grid.

The final layout when `status === 'success'`:
```
StockHero
PortfolioCallout  (if holding)
InsightsStrip     (if insights loaded and has recommendation/valuation)
[grid]
  Left:  StockStatsTable
  Right: TradingViewChart
         FinancialsChart
         TechnicalOutlook  (if insights loaded and has technicalEvents/keyTechnicals)
[/grid]
BullBearPanel     (if insights loaded and has bullish/bearish summary)
```

- [ ] **Step 1: Rewrite `ResearchTab.tsx` to the following**

```tsx
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Holding, StockDetail, StockInsights } from '../../types';
import { fetchStockDetail, fetchStockInsights } from '../../services/stockService';
import StockSearchBar from '../research/StockSearchBar';
import StockHero from '../research/StockHero';
import PortfolioCallout from '../research/PortfolioCallout';
import TradingViewChart from '../research/TradingViewChart';
import StockStatsTable from '../research/StockStatsTable';
import FinancialsChart from '../research/FinancialsChart';
import InsightsStrip from '../research/InsightsStrip';
import BullBearPanel from '../research/BullBearPanel';
import TechnicalOutlook from '../research/TechnicalOutlook';

interface Props {
  holdings: Holding[];
}

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function ResearchTab({ holdings }: Props) {
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [insights, setInsights] = useState<StockInsights | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSearch = async (ticker: string) => {
    setStatus('loading');
    setErrorMsg('');
    setInsights(null);
    try {
      const [detailData, insightsData] = await Promise.allSettled([
        fetchStockDetail(ticker),
        fetchStockInsights(ticker),
      ]);

      if (detailData.status === 'rejected') {
        throw new Error((detailData.reason as Error)?.message ?? 'Failed to load data. Try again.');
      }

      setDetail(detailData.value);
      if (insightsData.status === 'fulfilled') setInsights(insightsData.value);
      setStatus('success');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Failed to load data. Try again.');
      setStatus('error');
    }
  };

  const holding = detail ? holdings.find((h) => h.ticker === detail.ticker) : undefined;

  return (
    <div className="h-full flex flex-col p-6 gap-4 min-h-0">
      <div className="shrink-0">
        <StockSearchBar onSearch={handleSearch} isLoading={status === 'loading'} />
      </div>

      {status === 'idle' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-600">
          <Search className="w-8 h-8 opacity-30" />
          <p className="text-sm font-medium">Search any ticker to get started</p>
          <p className="text-xs opacity-60">Try AAPL, MSFT, NVDA, TSLA…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl px-5 py-4 text-sm text-rose-300">
          {errorMsg}
        </div>
      )}

      {status === 'loading' && (
        <div className="flex flex-col gap-4 animate-pulse">
          <div className="h-20 bg-zinc-800/60 rounded-xl" />
          <div className="h-10 bg-zinc-800/60 rounded-xl" />
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_3fr]">
            <div className="h-[400px] bg-zinc-800/60 rounded-xl" />
            <div className="flex flex-col gap-4 h-[400px]">
              <div className="flex-1 bg-zinc-800/60 rounded-xl" />
              <div className="flex-1 bg-zinc-800/60 rounded-xl" />
            </div>
          </div>
        </div>
      )}

      {status === 'success' && detail && (
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          <div className="shrink-0">
            <StockHero detail={detail} />
          </div>
          {holding && (
            <div className="shrink-0">
              <PortfolioCallout holding={holding} currentPrice={detail.price} />
            </div>
          )}
          {insights && (
            <div className="shrink-0">
              <InsightsStrip insights={insights} currentPrice={detail.price} />
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_3fr] lg:h-full">
              <div className="lg:overflow-y-auto custom-scrollbar">
                <StockStatsTable detail={detail} />
              </div>
              <div className="flex flex-col gap-4 min-h-[600px] lg:min-h-0">
                <TradingViewChart tvSymbol={detail.tvSymbol} />
                <FinancialsChart detail={detail} />
                {insights && <TechnicalOutlook insights={insights} />}
              </div>
            </div>
          </div>
          {insights && (
            <div className="shrink-0">
              <BullBearPanel insights={insights} />
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
Expected: no errors.

- [ ] **Step 3: Verify in browser**

Start the dev server (`npm run dev`), navigate to the Research tab, search for `AAPL`:
- InsightsStrip appears below the hero with a BUY/SELL/HOLD badge and target price
- TechnicalOutlook appears below FinancialsChart in the right column with 3 outlook rows and key levels
- BullBearPanel appears below the grid with emerald/rose bullet lists

Search for a ticker with no insights data (some non-US tickers): confirm the page still loads correctly with no crashes — all three blocks simply don't render.

- [ ] **Step 4: Commit**

```bash
git add src/components/tabs/ResearchTab.tsx
git commit -m "feat: wire insights API into Research tab with InsightsStrip, BullBearPanel, TechnicalOutlook"
```
