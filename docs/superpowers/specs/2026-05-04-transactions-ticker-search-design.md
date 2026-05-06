# Transactions Tab — Ticker Search Bar

**Date:** 2026-05-04

## Summary

Add an inline search bar with autocomplete suggestions to the Transactions tab, allowing users to filter the transaction list by a specific ticker.

---

## Placement

The search widget sits **inline in the header row**, between the filter pill group (ALL / BUY / SELL) and the Export button. Width: `w-40`. Styled to match the existing zinc aesthetic (`bg-zinc-800`, `border-zinc-700`, `text-zinc-300`). Includes a `Search` icon (lucide-react) as a left adornment.

---

## State

Two new `useState` vars added inside `TransactionsTab`:

| Name | Type | Purpose |
|---|---|---|
| `tickerSearch` | `string` | Current input value |
| `showSuggestions` | `boolean` | Dropdown visibility |

---

## Filtering Logic

The existing `filtered` pipeline gains one step:

```
transactions
  → filter by type pill       (existing)
  → filter by ticker search   (new)
  → sort by date desc         (existing)
```

Ticker filtering: case-insensitive prefix match on `tx.ticker`. Empty `tickerSearch` passes all rows through.

**Suggestions** are derived from the type-pill-filtered list (before the ticker search step) — unique tickers, narrowed by the current input string. This ensures suggestions only reflect the active type pill.

---

## Dropdown

- Absolutely positioned below the input, same width
- Styled: `bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-10`
- Each row: `TickerLogo` + ticker text (`text-sm font-bold text-white`)
- Hover state: `hover:bg-zinc-800`
- No keyboard arrow-navigation (portfolio tickers rarely exceed 10–15 items)

---

## Interactions

| Trigger | Behaviour |
|---|---|
| Focus (empty input) | Open dropdown showing all type-filtered tickers |
| Focus (non-empty input) | Open dropdown showing matching tickers |
| Type | Suggestions narrow in real time (prefix match) |
| Click suggestion | Set input value, close dropdown, list filters |
| Escape | Clear input, close dropdown |
| Click outside | Close dropdown via `mousedown` listener on wrapper ref |
| Clear input | All transactions for active type pill shown again |

---

## Scope

All changes are contained within `TransactionsTab.tsx`. No new files, no new dependencies.
