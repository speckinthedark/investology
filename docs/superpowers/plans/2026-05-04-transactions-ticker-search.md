# Transactions Ticker Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline ticker search bar with autocomplete dropdown to the Transactions tab header, filtering the transaction list by prefix match against the active type pill.

**Architecture:** All changes are self-contained in `TransactionsTab.tsx`. A `wrapperRef` + document `mousedown` listener handles click-outside. The filtering pipeline splits into a `typeFiltered` intermediate to feed both the suggestions list and the final `filtered` list.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, lucide-react

---

## File Map

| Action | File |
|---|---|
| Modify | `src/components/tabs/TransactionsTab.tsx` |

---

### Task 1: Add state, ref, effect, and split filtering pipeline

**Files:**
- Modify: `src/components/tabs/TransactionsTab.tsx:1-49`

- [ ] **Step 1: Update React and lucide-react imports**

Replace line 1 and line 3 in `TransactionsTab.tsx`:

```tsx
import { useState, useRef, useEffect } from 'react';
```

```tsx
import { Pencil, Trash2, FolderUp, Download, ArrowUpDown, CreditCard, Search, X } from 'lucide-react';
```

- [ ] **Step 2: Add state, ref, and click-outside effect**

After `const [filter, setFilter] = useState<Filter>('all');` (line 40), add:

```tsx
const [tickerSearch, setTickerSearch] = useState('');
const [showSuggestions, setShowSuggestions] = useState(false);
const wrapperRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  function handleMouseDown(e: MouseEvent) {
    if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
      setShowSuggestions(false);
    }
  }
  document.addEventListener('mousedown', handleMouseDown);
  return () => document.removeEventListener('mousedown', handleMouseDown);
}, []);
```

- [ ] **Step 3: Split the filtering pipeline**

Replace the existing `const filtered = ...` block (lines 42–49) with:

```tsx
const typeFiltered = [...transactions].filter((tx) => {
  if (filter === 'buy')  return tx.type === 'buy';
  if (filter === 'sell') return tx.type === 'sell';
  if (filter === 'cash') return tx.type === 'deposit' || tx.type === 'withdrawal';
  return true;
});

const suggestions = [...new Set(typeFiltered.map((tx) => tx.ticker))]
  .filter((t) => !tickerSearch || t.startsWith(tickerSearch))
  .sort();

const filtered = typeFiltered
  .filter((tx) => !tickerSearch || tx.ticker.startsWith(tickerSearch))
  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
```

- [ ] **Step 4: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/tabs/TransactionsTab.tsx
git commit -m "feat: split transactions filtering pipeline and add ticker search state"
```

---

### Task 2: Add search widget JSX and verify in browser

**Files:**
- Modify: `src/components/tabs/TransactionsTab.tsx` (header section)

- [ ] **Step 1: Add search widget between filter pills and Export button**

In the header's `<div className="flex items-center gap-2 flex-wrap">`, insert the following block immediately after the closing `</div>` of the filter pills group (after the `mr-1` pill container) and before the Export `<button>`:

```tsx
{/* Ticker search */}
<div ref={wrapperRef} className="relative">
  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg w-40">
    <Search className="w-3 h-3 text-zinc-500 shrink-0" />
    <input
      type="text"
      value={tickerSearch}
      placeholder="SEARCH TICKER"
      className="bg-transparent text-[10px] font-bold uppercase tracking-widest text-zinc-300 placeholder:text-zinc-600 outline-none w-full"
      onChange={(e) => setTickerSearch(e.target.value.toUpperCase())}
      onFocus={() => setShowSuggestions(true)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setTickerSearch('');
          setShowSuggestions(false);
        }
      }}
    />
    {tickerSearch && (
      <button
        onClick={() => { setTickerSearch(''); setShowSuggestions(false); }}
        className="text-zinc-500 hover:text-zinc-300 shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    )}
  </div>
  {showSuggestions && suggestions.length > 0 && (
    <div className="absolute top-full mt-1 left-0 w-full bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-10 overflow-hidden">
      {suggestions.map((ticker) => (
        <button
          key={ticker}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 transition-colors text-left"
          onClick={() => {
            setTickerSearch(ticker);
            setShowSuggestions(false);
          }}
        >
          <TickerLogo ticker={ticker} />
          <span className="text-sm font-bold text-white">{ticker}</span>
        </button>
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Verify in browser**

Open http://localhost:3000 and navigate to the Transactions tab. Check:

1. Search bar appears inline between the ALL/BUY/SELL pills and the Export button
2. Clicking the search bar opens a dropdown listing all tickers present in the transaction list
3. Typing narrows suggestions to prefix matches in real time
4. Clicking a suggestion sets the input value, closes the dropdown, and filters the table
5. Pressing Escape clears the input and closes the dropdown
6. Clicking outside the search widget closes the dropdown without clearing the input
7. The X clear button appears only when there is input, and clicking it clears the filter
8. Switching the type pill (BUY / SELL) with a search active re-filters both the table and suggestions correctly

- [ ] **Step 4: Commit**

```bash
git add src/components/tabs/TransactionsTab.tsx
git commit -m "feat: add ticker search bar with autocomplete to Transactions tab"
```
