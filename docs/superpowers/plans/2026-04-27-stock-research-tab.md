# Stock Research Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Research" sidebar tab where the user types any stock ticker and sees a full company overview — TradingView price chart, key stats table, financials bar chart, and a portfolio callout if they hold the stock.

**Architecture:** New `GET /api/stock/detail/:ticker` backend route fetches rich Yahoo Finance data (quote + six quoteSummary modules) and returns a single `StockDetail` object. The frontend renders this in `ResearchTab` across seven focused sub-components. No new state management — all data lives in `ResearchTab` local state.

**Tech Stack:** React + TypeScript + Tailwind CSS v4, Express + yahoo-finance2, TradingView embeddable widget (free, script injection), Recharts (already installed).

**Note:** No test framework is configured in this project. Each task ends with a manual verification step using the dev server (`npm run dev`).

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/types.ts` | Modify | Add `FinancialPeriod`, `StockDetail` |
| `server.ts` | Modify | Add `GET /api/stock/detail/:ticker` |
| `src/services/stockService.ts` | Modify | Add `fetchStockDetail` |
| `src/components/shared/TickerLogo.tsx` | Create | Extracted logo component (FMP→Parqet→initials) |
| `src/components/tabs/TransactionsTab.tsx` | Modify | Import `TickerLogo` from shared instead of inline |
| `src/components/Sidebar.tsx` | Modify | Add Research nav item |
| `src/App.tsx` | Modify | Add `'research'` tab type + render `<ResearchTab>` |
| `src/components/tabs/ResearchTab.tsx` | Create | Top-level tab — search state, fetch, layout |
| `src/components/research/StockSearchBar.tsx` | Create | Controlled ticker input |
| `src/components/research/StockHero.tsx` | Create | Logo, name, pills, price, day change |
| `src/components/research/PortfolioCallout.tsx` | Create | Holdings banner (conditional) |
| `src/components/research/TradingViewChart.tsx` | Create | TradingView widget with timeframe tabs |
| `src/components/research/StockStatsTable.tsx` | Create | Three-section key/value stats table |
| `src/components/research/FinancialsChart.tsx` | Create | Recharts bar chart with period + metric toggles |

---

## Task 1: Add types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add `FinancialPeriod` and `StockDetail` to `src/types.ts`**

Open `src/types.ts` and append after the last export:

```typescript
export interface FinancialPeriod {
  label: string;  // e.g. "FY2024" or "Q3 2024"
  value: number;  // raw dollars
}

export interface StockDetail {
  // Identity
  ticker: string;
  companyName: string;
  exchange: string;          // human-readable, e.g. "NASDAQ"
  tvSymbol: string;          // TradingView format, e.g. "NASDAQ:AAPL"
  sector: string;
  industry: string;
  country: string;
  website: string;
  fullTimeEmployees: number;
  longBusinessSummary: string;

  // Price
  price: number;
  change: number;
  changePercent: number;

  // Trading snapshot
  marketCap: number | null;
  volume: number | null;
  averageVolume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  beta: number | null;

  // Fundamentals
  trailingPE: number | null;
  forwardPE: number | null;
  trailingEps: number | null;
  dividendYield: number | null;
  profitMargins: number | null;
  operatingMargins: number | null;
  returnOnEquity: number | null;
  freeCashflow: number | null;

  // Financial history (for bar chart)
  annualRevenue: FinancialPeriod[];
  annualNetIncome: FinancialPeriod[];
  annualFreeCashFlow: FinancialPeriod[];
  quarterlyRevenue: FinancialPeriod[];
  quarterlyNetIncome: FinancialPeriod[];
  quarterlyFreeCashFlow: FinancialPeriod[];
}
```

- [ ] **Step 2: Verify TypeScript is happy**

Run: `npx tsc --noEmit`
Expected: no errors related to the new types (pre-existing errors are fine to ignore)

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add StockDetail and FinancialPeriod types"
```

---

## Task 2: Backend route

**Files:**
- Modify: `server.ts` (add route after the existing `/api/stock/:ticker` route, around line 72)

- [ ] **Step 1: Add the exchange map and helper above `startServer()`**

Find the line `async function startServer() {` in `server.ts`. Insert this block immediately before it:

```typescript
const EXCHANGE_MAP: Record<string, string> = {
  NMS: 'NASDAQ', NasdaqGS: 'NASDAQ', NasdaqGM: 'NASDAQ', NCM: 'NASDAQ',
  NYQ: 'NYSE', NYSE: 'NYSE',
  PCX: 'AMEX', ASE: 'AMEX',
};

function buildFinancialPeriods(
  statements: any[],
  valueKey: string,
  secondKey?: string,
  mode: 'annual' | 'quarterly' = 'annual',
): { label: string; value: number }[] {
  return statements
    .slice(0, mode === 'annual' ? 4 : 8)
    .map((s: any) => {
      const date = s.endDate instanceof Date ? s.endDate : new Date(s.endDate);
      const year = date.getFullYear();
      const quarter = Math.ceil((date.getMonth() + 1) / 3);
      const label = mode === 'annual' ? `FY${year}` : `Q${quarter} ${year}`;
      const raw = s[valueKey] ?? 0;
      const raw2 = secondKey ? (s[secondKey] ?? 0) : 0;
      // For FCF: operatingCashFlow - abs(capex). Yahoo reports capex as negative.
      const value = secondKey ? raw + raw2 : raw;
      return { label, value };
    })
    .reverse();
}
```

- [ ] **Step 2: Add the route inside `startServer()`, after the `/api/price-history` route**

Find the comment `// --- Gemini AI stock data fallback ---` in `server.ts`. Insert this block immediately before it:

```typescript
  // --- Rich stock detail for Research tab ---
  app.get('/api/stock/detail/:ticker', async (req, res) => {
    const ticker = (req.params.ticker as string).toUpperCase();
    try {
      const [quote, summary, incAnnual, incQuarterly, cfAnnual, cfQuarterly] = await Promise.all([
        yahooFinance.quote(ticker),
        yahooFinance.quoteSummary(ticker, {
          modules: ['assetProfile', 'summaryDetail', 'defaultKeyStatistics', 'financialData'] as any,
        }).catch(() => null),
        yahooFinance.quoteSummary(ticker, { modules: ['incomeStatementHistory'] as any }).catch(() => null),
        yahooFinance.quoteSummary(ticker, { modules: ['incomeStatementHistoryQuarterly'] as any }).catch(() => null),
        yahooFinance.quoteSummary(ticker, { modules: ['cashflowStatementHistory'] as any }).catch(() => null),
        yahooFinance.quoteSummary(ticker, { modules: ['cashflowStatementHistoryQuarterly'] as any }).catch(() => null),
      ]);

      const price = (quote as any).regularMarketPrice ?? 0;
      if (!price) return res.status(400).json({ error: `Ticker not found: ${ticker}` });

      const profile  = (summary as any)?.assetProfile ?? {};
      const detail   = (summary as any)?.summaryDetail ?? {};
      const keyStats = (summary as any)?.defaultKeyStatistics ?? {};
      const finData  = (summary as any)?.financialData ?? {};

      const rawExchange = (quote as any).exchange ?? '';
      const exchange = EXCHANGE_MAP[rawExchange] ?? (quote as any).fullExchangeName ?? rawExchange;
      const tvSymbol = exchange ? `${exchange}:${ticker}` : ticker;

      const incStmtsAnnual     = (incAnnual as any)?.incomeStatementHistory?.incomeStatementHistory ?? [];
      const incStmtsQuarterly  = (incQuarterly as any)?.incomeStatementHistoryQuarterly?.incomeStatementHistoryQuarterly ?? [];
      const cfStmtsAnnual      = (cfAnnual as any)?.cashflowStatementHistory?.cashflowStatements ?? [];
      const cfStmtsQuarterly   = (cfQuarterly as any)?.cashflowStatementHistoryQuarterly?.cashflowStatementsQuarterly ?? [];

      res.json({
        ticker,
        companyName: (quote as any).longName ?? (quote as any).shortName ?? ticker,
        exchange,
        tvSymbol,
        sector:              profile.sector ?? 'Other',
        industry:            profile.industry ?? '',
        country:             profile.country ?? '',
        website:             profile.website ?? '',
        fullTimeEmployees:   profile.fullTimeEmployees ?? 0,
        longBusinessSummary: profile.longBusinessSummary ?? '',

        price,
        change:        (quote as any).regularMarketChange ?? 0,
        changePercent: (quote as any).regularMarketChangePercent ?? 0,

        marketCap:       (quote as any).marketCap ?? detail.marketCap ?? null,
        volume:          (quote as any).regularMarketVolume ?? null,
        averageVolume:   detail.averageVolume ?? null,
        fiftyTwoWeekHigh: detail.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow:  detail.fiftyTwoWeekLow ?? null,
        beta:             detail.beta ?? keyStats.beta ?? null,

        trailingPE:       detail.trailingPE ?? null,
        forwardPE:        detail.forwardPE ?? null,
        trailingEps:      keyStats.trailingEps ?? null,
        dividendYield:    detail.dividendYield ?? null,
        profitMargins:    finData.profitMargins ?? null,
        operatingMargins: finData.operatingMargins ?? null,
        returnOnEquity:   finData.returnOnEquity ?? null,
        freeCashflow:     finData.freeCashflow ?? null,

        annualRevenue:       buildFinancialPeriods(incStmtsAnnual, 'totalRevenue', undefined, 'annual'),
        annualNetIncome:     buildFinancialPeriods(incStmtsAnnual, 'netIncome', undefined, 'annual'),
        annualFreeCashFlow:  buildFinancialPeriods(cfStmtsAnnual, 'totalCashFromOperatingActivities', 'capitalExpenditures', 'annual'),
        quarterlyRevenue:    buildFinancialPeriods(incStmtsQuarterly, 'totalRevenue', undefined, 'quarterly'),
        quarterlyNetIncome:  buildFinancialPeriods(incStmtsQuarterly, 'netIncome', undefined, 'quarterly'),
        quarterlyFreeCashFlow: buildFinancialPeriods(cfStmtsQuarterly, 'totalCashFromOperatingActivities', 'capitalExpenditures', 'quarterly'),
      });
    } catch (e) {
      console.error('Stock detail error:', e);
      res.status(500).json({ error: 'Failed to fetch stock data' });
    }
  });
```

- [ ] **Step 3: Manually verify the route**

Start the server: `npm run dev`
Open in browser: `http://localhost:3000/api/stock/detail/AAPL`
Expected: JSON with `ticker: "AAPL"`, `companyName: "Apple Inc."`, `tvSymbol: "NASDAQ:AAPL"`, and non-empty `annualRevenue` array.

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "feat: add GET /api/stock/detail/:ticker route"
```

---

## Task 3: Service function

**Files:**
- Modify: `src/services/stockService.ts`

- [ ] **Step 1: Add import and `fetchStockDetail` to `src/services/stockService.ts`**

Add this import at the top of the file (after the existing import):

```typescript
import { StockData, PriceHistory, StockDetail } from '../types';
```

Replace the existing `import { StockData, PriceHistory }` line with the line above.

Then append at the bottom of the file:

```typescript
export async function fetchStockDetail(ticker: string): Promise<StockDetail> {
  const res = await fetch(`/api/stock/detail/${encodeURIComponent(ticker.toUpperCase())}`);
  if (res.status === 400) {
    const data = await res.json();
    throw new Error(data.error ?? 'Ticker not found');
  }
  if (!res.ok) throw new Error('Failed to fetch stock data');
  return res.json();
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no new type errors

- [ ] **Step 3: Commit**

```bash
git add src/services/stockService.ts
git commit -m "feat: add fetchStockDetail service function"
```

---

## Task 4: Extract shared TickerLogo component

**Files:**
- Create: `src/components/shared/TickerLogo.tsx`
- Modify: `src/components/tabs/TransactionsTab.tsx`

- [ ] **Step 1: Create `src/components/shared/TickerLogo.tsx`**

```typescript
import { useState, useCallback } from 'react';

const LOGO_SOURCES = (ticker: string) => [
  `https://financialmodelingprep.com/image-stock/${ticker}.png`,
  `https://assets.parqet.com/logos/symbol/${ticker}`,
];

interface Props {
  ticker: string;
  size?: 'sm' | 'md';
}

export default function TickerLogo({ ticker, size = 'sm' }: Props) {
  const [srcIndex, setSrcIndex] = useState(0);
  const sources = LOGO_SOURCES(ticker);
  const onError = useCallback(() => setSrcIndex((i) => i + 1), []);
  const dim = size === 'md' ? 'w-10 h-10 text-xs rounded-lg' : 'w-7 h-7 text-[9px] rounded-md';

  if (srcIndex >= sources.length) {
    return (
      <div className={`${dim} bg-zinc-700 flex items-center justify-center font-black text-zinc-300 shrink-0`}>
        {ticker.slice(0, 2)}
      </div>
    );
  }
  return (
    <img
      key={srcIndex}
      src={sources[srcIndex]}
      alt={ticker}
      onError={onError}
      className={`${dim} object-contain bg-zinc-800 shrink-0`}
    />
  );
}
```

- [ ] **Step 2: Update `src/components/tabs/TransactionsTab.tsx` to use the shared component**

Remove these lines from `TransactionsTab.tsx` (they're in the top section):

```typescript
const LOGO_SOURCES = (ticker: string) => [
  `https://financialmodelingprep.com/image-stock/${ticker}.png`,
  `https://assets.parqet.com/logos/symbol/${ticker}`,
];

function TickerLogo({ ticker }: { ticker: string }) {
  const [srcIndex, setSrcIndex] = useState(0);
  const sources = LOGO_SOURCES(ticker);
  const onError = useCallback(() => setSrcIndex((i) => i + 1), []);
  if (srcIndex >= sources.length) {
    return (
      <div className="w-7 h-7 rounded-md bg-zinc-700 flex items-center justify-center text-[9px] font-black text-zinc-300 shrink-0">
        {ticker.slice(0, 2)}
      </div>
    );
  }
  return (
    <img
      key={srcIndex}
      src={sources[srcIndex]}
      alt={ticker}
      onError={onError}
      className="w-7 h-7 rounded-md object-contain bg-zinc-800 shrink-0"
    />
  );
}
```

Add this import at the top of `TransactionsTab.tsx` (after existing imports):

```typescript
import TickerLogo from '../shared/TickerLogo';
```

Also remove `useState, useCallback` from the react import if they're no longer used elsewhere in the file (check first — they may still be used for the filter state). If `useState` is used for the `filter` state, keep it. Remove only `useCallback` if it was only used in the inline `TickerLogo`.

- [ ] **Step 3: Verify**

Run: `npm run dev`
Open the Transactions tab — logos should still appear exactly as before.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/TickerLogo.tsx src/components/tabs/TransactionsTab.tsx
git commit -m "refactor: extract TickerLogo to shared component"
```

---

## Task 5: Wire up sidebar and App

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add Research to Sidebar nav**

In `src/components/Sidebar.tsx`, change the import line:

```typescript
import { LayoutDashboard, ArrowUpDown, TrendingUp, BrainCircuit, LogOut, RefreshCw } from 'lucide-react';
```

to:

```typescript
import { LayoutDashboard, ArrowUpDown, TrendingUp, BrainCircuit, LogOut, RefreshCw, Search } from 'lucide-react';
```

Change the `Tab` type:

```typescript
type Tab = 'overview' | 'transactions' | 'performance' | 'deep-dive' | 'research';
```

Add to `NAV_ITEMS` array (after the `deep-dive` entry):

```typescript
  { id: 'research',     label: 'Research',     icon: Search },
```

- [ ] **Step 2: Add Research to App.tsx**

In `src/App.tsx`, change:

```typescript
type Tab = 'overview' | 'transactions' | 'performance' | 'deep-dive';
```

to:

```typescript
type Tab = 'overview' | 'transactions' | 'performance' | 'deep-dive' | 'research';
```

Add the import at the top with the other tab imports:

```typescript
import ResearchTab from './components/tabs/ResearchTab';
```

Inside the `AnimatePresence` block, after the `deep-dive` conditional, add:

```typescript
                {activeTab === 'research' && (
                  <ResearchTab holdings={holdings} />
                )}
```

- [ ] **Step 3: Create a stub `ResearchTab` so the app compiles**

Create `src/components/tabs/ResearchTab.tsx` with this stub (will be replaced in Task 11):

```typescript
import { Holding } from '../../types';

interface Props {
  holdings: Holding[];
}

export default function ResearchTab({ holdings }: Props) {
  return (
    <div className="text-zinc-500 text-sm p-6">Research tab — coming soon</div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run dev`
Click the Research nav item in the sidebar — it should highlight and show "Research tab — coming soon".

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.tsx src/App.tsx src/components/tabs/ResearchTab.tsx
git commit -m "feat: add Research tab to sidebar and App routing"
```

---

## Task 6: StockSearchBar

**Files:**
- Create: `src/components/research/StockSearchBar.tsx`

- [ ] **Step 1: Create `src/components/research/StockSearchBar.tsx`**

```typescript
import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

interface Props {
  onSearch: (ticker: string) => void;
  isLoading: boolean;
}

export default function StockSearchBar({ onSearch, isLoading }: Props) {
  const [value, setValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim() && !isLoading) {
      onSearch(value.trim().toUpperCase());
    }
  };

  return (
    <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
      {isLoading
        ? <Loader2 className="w-4 h-4 text-zinc-500 shrink-0 animate-spin" />
        : <Search className="w-4 h-4 text-zinc-500 shrink-0" />
      }
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        onKeyDown={handleKeyDown}
        placeholder="Search ticker — e.g. AAPL, MSFT, NVDA"
        disabled={isLoading}
        className="flex-1 bg-transparent text-white placeholder:text-zinc-600 text-sm font-medium outline-none disabled:opacity-50"
      />
      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Enter</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/research/StockSearchBar.tsx
git commit -m "feat: add StockSearchBar component"
```

---

## Task 7: StockHero

**Files:**
- Create: `src/components/research/StockHero.tsx`

- [ ] **Step 1: Create `src/components/research/StockHero.tsx`**

```typescript
import { StockDetail } from '../../types';
import TickerLogo from '../shared/TickerLogo';
import { cn } from '../../lib/utils';

interface Props {
  detail: StockDetail;
}

export default function StockHero({ detail }: Props) {
  const positive = detail.change >= 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <TickerLogo ticker={detail.ticker} size="md" />
        <div>
          <div className="text-base font-bold text-white">{detail.companyName}</div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {detail.exchange && (
              <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">
                {detail.exchange}
              </span>
            )}
            {detail.sector && (
              <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">
                {detail.sector}
              </span>
            )}
            {detail.industry && (
              <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">
                {detail.industry}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="text-3xl font-light tracking-tighter text-white">
          ${detail.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className={cn('text-xs font-bold mt-0.5', positive ? 'text-emerald-400' : 'text-rose-400')}>
          {positive ? '▲' : '▼'} {positive ? '+' : ''}${Math.abs(detail.change).toFixed(2)} ({positive ? '+' : ''}{detail.changePercent.toFixed(2)}%) today
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/research/StockHero.tsx
git commit -m "feat: add StockHero component"
```

---

## Task 8: PortfolioCallout

**Files:**
- Create: `src/components/research/PortfolioCallout.tsx`

- [ ] **Step 1: Create `src/components/research/PortfolioCallout.tsx`**

```typescript
import { Holding } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  holding: Holding | undefined;
  currentPrice: number;
}

export default function PortfolioCallout({ holding, currentPrice }: Props) {
  if (!holding) return null;

  const currentValue = holding.shares * currentPrice;
  const costBasis = holding.shares * holding.averagePrice;
  const gain = currentValue - costBasis;
  const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
  const positive = gain >= 0;

  return (
    <div className="bg-indigo-950/40 border border-indigo-800/50 rounded-xl px-5 py-3 flex items-center gap-3">
      <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
      <div className="text-xs text-indigo-300 flex-1">
        <span className="font-bold text-indigo-200">You hold {holding.shares.toLocaleString()} shares</span>
        {' · '}avg. cost ${holding.averagePrice.toFixed(2)}
        {' · '}current value ${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className={cn('text-xs font-bold shrink-0', positive ? 'text-emerald-400' : 'text-rose-400')}>
        {positive ? '+' : ''}${Math.abs(gain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        {' '}({positive ? '+' : ''}{gainPct.toFixed(2)}%)
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/research/PortfolioCallout.tsx
git commit -m "feat: add PortfolioCallout component"
```

---

## Task 9: TradingViewChart

**Files:**
- Create: `src/components/research/TradingViewChart.tsx`

- [ ] **Step 1: Create `src/components/research/TradingViewChart.tsx`**

```typescript
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

declare global {
  interface Window { TradingView: any; }
}

const TIMEFRAMES = ['1W', '1M', '3M', '1Y', '5Y'] as const;
type Timeframe = typeof TIMEFRAMES[number];

const RANGE_MAP: Record<Timeframe, string> = {
  '1W': '5D',
  '1M': '1M',
  '3M': '3M',
  '1Y': '12M',
  '5Y': '60M',
};

interface Props {
  tvSymbol: string;  // e.g. "NASDAQ:AAPL"
}

let tvScriptLoaded = false;

function loadTVScript(): Promise<void> {
  if (tvScriptLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.onload = () => { tvScriptLoaded = true; resolve(); };
    document.head.appendChild(script);
  });
}

export default function TradingViewChart({ tvSymbol }: Props) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1M');
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    const containerId = 'tv_chart_container';
    loadTVScript().then(() => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = '';
      widgetRef.current = new window.TradingView.widget({
        autosize: true,
        symbol: tvSymbol,
        range: RANGE_MAP[timeframe],
        theme: 'dark',
        style: '1',
        locale: 'en',
        hide_top_toolbar: false,
        hide_side_toolbar: true,
        allow_symbol_change: false,
        save_image: false,
        container_id: containerId,
        toolbar_bg: '#18181b',
        backgroundColor: '#18181b',
        gridColor: '#27272a',
      });
    });
  }, [tvSymbol, timeframe]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Price Chart</span>
        <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={cn(
                'px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all',
                timeframe === tf ? 'bg-white text-zinc-900' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      <div id="tv_chart_container" ref={containerRef} style={{ height: '400px' }} />
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run `npm run dev`, navigate to Research tab, search "AAPL". The TradingView chart should load and render. Clicking timeframe tabs should reload the chart with the new range.

- [ ] **Step 3: Commit**

```bash
git add src/components/research/TradingViewChart.tsx
git commit -m "feat: add TradingViewChart component with timeframe tabs"
```

---

## Task 10: StockStatsTable

**Files:**
- Create: `src/components/research/StockStatsTable.tsx`

- [ ] **Step 1: Create `src/components/research/StockStatsTable.tsx`**

```typescript
import { StockDetail } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  detail: StockDetail;
}

function fmtLarge(n: number | null): string {
  if (n === null || n === undefined) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtNum(n: number | null): string {
  if (n === null || n === undefined) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9)  return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3)  return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtPct(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

function fmtRatio(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(1)}x`;
}

function Row({ label, value, color }: { label: string; value: string; color?: 'green' | 'red' | 'muted' }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center px-3 py-2 border-b border-zinc-800/50 last:border-b-0">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className={cn(
        'text-[11px] font-bold text-right',
        color === 'green' ? 'text-emerald-400' :
        color === 'red'   ? 'text-rose-400' :
        color === 'muted' ? 'text-zinc-500 font-normal' :
        'text-zinc-200',
      )}>
        {value}
      </span>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 py-2 bg-zinc-800/60 border-b border-zinc-800">
      <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>
    </div>
  );
}

export default function StockStatsTable({ detail }: Props) {
  const pctPositive = (n: number | null) => n !== null && n > 0 ? 'green' : n !== null && n < 0 ? 'red' : undefined;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <SectionHeader label="Trading Snapshot" />
      <Row label="Market Cap"  value={fmtLarge(detail.marketCap)} />
      <Row label="Volume"      value={fmtNum(detail.volume)} />
      <Row label="Avg. Volume" value={fmtNum(detail.averageVolume)} color="muted" />
      <Row label="52W High"    value={detail.fiftyTwoWeekHigh !== null ? `$${detail.fiftyTwoWeekHigh.toFixed(2)}` : '—'} color="green" />
      <Row label="52W Low"     value={detail.fiftyTwoWeekLow  !== null ? `$${detail.fiftyTwoWeekLow.toFixed(2)}`  : '—'} color="red" />
      <Row label="Beta"        value={detail.beta !== null ? detail.beta.toFixed(2) : '—'} />

      <SectionHeader label="Fundamentals" />
      <Row label="P/E (TTM)"     value={fmtRatio(detail.trailingPE)} />
      <Row label="Forward P/E"   value={fmtRatio(detail.forwardPE)} />
      <Row label="EPS (TTM)"     value={detail.trailingEps !== null ? `$${detail.trailingEps.toFixed(2)}` : '—'} />
      <Row label="Profit Margin" value={fmtPct(detail.profitMargins)} color={pctPositive(detail.profitMargins)} />
      <Row label="Div. Yield"    value={detail.dividendYield !== null ? fmtPct(detail.dividendYield) : '—'} color="muted" />

      <SectionHeader label="Company" />
      <Row label="Industry"   value={detail.industry || '—'} />
      <Row label="Employees"  value={detail.fullTimeEmployees ? detail.fullTimeEmployees.toLocaleString() : '—'} />
      <Row label="ROE"        value={fmtPct(detail.returnOnEquity)} color={pctPositive(detail.returnOnEquity)} />
      <Row label="Free Cash Flow"  value={fmtLarge(detail.freeCashflow)} color={pctPositive(detail.freeCashflow)} />
      <Row label="Op. Margin" value={fmtPct(detail.operatingMargins)} color={pctPositive(detail.operatingMargins)} />
      <Row label="Website"    value={detail.website ? detail.website.replace(/^https?:\/\//, '') : '—'} color="muted" />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/research/StockStatsTable.tsx
git commit -m "feat: add StockStatsTable component"
```

---

## Task 11: FinancialsChart

**Files:**
- Create: `src/components/research/FinancialsChart.tsx`

- [ ] **Step 1: Create `src/components/research/FinancialsChart.tsx`**

```typescript
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Cell } from 'recharts';
import { StockDetail, FinancialPeriod } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  detail: StockDetail;
}

type Period = 'annual' | 'quarterly';
type Metric = 'revenue' | 'netIncome' | 'freeCashFlow';

const METRIC_LABELS: Record<Metric, string> = {
  revenue: 'Revenue',
  netIncome: 'Net Income',
  freeCashFlow: 'Free Cash Flow',
};

function fmtBar(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (abs >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

const TooltipContent = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="font-bold text-white mb-1">{label}</div>
      <div className="text-zinc-300">{fmtBar(payload[0].value)}</div>
    </div>
  );
};

export default function FinancialsChart({ detail }: Props) {
  const [period, setPeriod] = useState<Period>('annual');
  const [metric, setMetric] = useState<Metric>('revenue');

  const dataMap: Record<Period, Record<Metric, FinancialPeriod[]>> = {
    annual: {
      revenue:      detail.annualRevenue,
      netIncome:    detail.annualNetIncome,
      freeCashFlow: detail.annualFreeCashFlow,
    },
    quarterly: {
      revenue:      detail.quarterlyRevenue,
      netIncome:    detail.quarterlyNetIncome,
      freeCashFlow: detail.quarterlyFreeCashFlow,
    },
  };

  const data = dataMap[period][metric];
  const hasData = data.length > 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Financials</span>
        <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
          {(['annual', 'quarterly'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all',
                period === p ? 'bg-white text-zinc-900' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {p === 'annual' ? 'Annual' : 'Quarterly'}
            </button>
          ))}
        </div>
      </div>

      {/* Metric tabs */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800">
        {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={cn(
              'px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border transition-all',
              metric === m
                ? 'border-violet-500 text-violet-400 bg-violet-950/30'
                : 'border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600',
            )}
          >
            {METRIC_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="flex-1 px-4 pt-4 pb-3" style={{ minHeight: '260px' }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 700, fill: '#71717a' }}
              />
              <YAxis hide />
              <Tooltip content={<TooltipContent />} cursor={{ fill: '#27272a' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={64}>
                {data.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.value >= 0 ? '#7c3aed' : '#f87171'}
                    fillOpacity={i === data.length - 1 ? 1 : 0.75}
                  />
                ))}
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={fmtBar}
                  style={{ fontSize: 9, fontWeight: 700, fill: '#a1a1aa' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-600 text-xs">
            No financial data available
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/research/FinancialsChart.tsx
git commit -m "feat: add FinancialsChart component with period and metric toggles"
```

---

## Task 12: ResearchTab (final assembly)

**Files:**
- Modify: `src/components/tabs/ResearchTab.tsx` (replace the stub from Task 5)

- [ ] **Step 1: Replace the stub with the full implementation**

```typescript
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Holding, StockDetail } from '../../types';
import { fetchStockDetail } from '../../services/stockService';
import StockSearchBar from '../research/StockSearchBar';
import StockHero from '../research/StockHero';
import PortfolioCallout from '../research/PortfolioCallout';
import TradingViewChart from '../research/TradingViewChart';
import StockStatsTable from '../research/StockStatsTable';
import FinancialsChart from '../research/FinancialsChart';

interface Props {
  holdings: Holding[];
}

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function ResearchTab({ holdings }: Props) {
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSearch = async (ticker: string) => {
    setStatus('loading');
    setErrorMsg('');
    try {
      const data = await fetchStockDetail(ticker);
      setDetail(data);
      setStatus('success');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Failed to load data. Try again.');
      setStatus('error');
    }
  };

  const holding = detail
    ? holdings.find((h) => h.ticker === detail.ticker)
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <StockSearchBar onSearch={handleSearch} isLoading={status === 'loading'} />

      {status === 'idle' && (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-zinc-600">
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
          <div className="h-[432px] bg-zinc-800/60 rounded-xl" />
          <div className="grid gap-4" style={{ gridTemplateColumns: '5fr 8fr' }}>
            <div className="h-96 bg-zinc-800/60 rounded-xl" />
            <div className="h-96 bg-zinc-800/60 rounded-xl" />
          </div>
        </div>
      )}

      {status === 'success' && detail && (
        <>
          <StockHero detail={detail} />
          <PortfolioCallout holding={holding} currentPrice={detail.price} />
          <TradingViewChart tvSymbol={detail.tvSymbol} />
          <div className="grid gap-4" style={{ gridTemplateColumns: '5fr 8fr' }}>
            <StockStatsTable detail={detail} />
            <FinancialsChart detail={detail} />
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify full flow**

Run: `npm run dev`

1. Navigate to the Research tab — empty state with search icon shows.
2. Search `AAPL` — loading skeletons appear, then full layout renders.
3. TradingView chart shows. Clicking timeframe tabs (1W, 1M, 3M, 1Y, 5Y) reloads the chart.
4. Stats table shows three sections: Trading Snapshot, Fundamentals, Company.
5. Financials chart shows bars for annual revenue by default. Toggle Annual/Quarterly and Revenue/Net Income/Free Cash Flow.
6. If AAPL is in your holdings, the indigo portfolio callout appears.
7. Search a bad ticker like `ZZZZZZ` — error banner appears.

- [ ] **Step 3: Commit**

```bash
git add src/components/tabs/ResearchTab.tsx
git commit -m "feat: complete ResearchTab with full stock overview layout"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ New sidebar tab (Task 5)
- ✅ Search bar with Enter to submit (Task 6)
- ✅ Hero: logo, name, exchange/sector/industry pills, price, day change (Task 7)
- ✅ Portfolio callout when ticker held (Task 8)
- ✅ TradingView chart with 1W/1M/3M/1Y/5Y tabs (Task 9)
- ✅ Stats table: Trading Snapshot, Fundamentals, Company sections (Task 10)
- ✅ Financials bar chart: Annual/Quarterly toggle + Revenue/Net Income/FCF tabs (Task 11)
- ✅ Loading skeletons (Task 12)
- ✅ Error state for bad ticker (Task 12)
- ✅ Idle empty state (Task 12)
- ✅ `StockDetail` type + `FinancialPeriod` (Task 1)
- ✅ Backend route with all Yahoo Finance modules (Task 2)
- ✅ `fetchStockDetail` service (Task 3)
- ✅ Shared `TickerLogo` with size prop (Task 4)

**Type consistency:** `StockDetail` defined in Task 1, used identically in Tasks 7, 8, 10, 11, 12. `FinancialPeriod` defined in Task 1, used identically in Task 11. `fetchStockDetail` defined in Task 3, called in Task 12.

**FCF calculation:** `buildFinancialPeriods(cfStmts, 'totalCashFromOperatingActivities', 'capitalExpenditures')` — Yahoo Finance reports capex as a negative number, so adding it to operating cash flow yields the correct FCF (operating + negative capex = operating − |capex|).
