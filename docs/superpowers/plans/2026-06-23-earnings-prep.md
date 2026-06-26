# Earnings Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Earnings Prep" tab where the user creates per-holding "Stories" (a thesis question plus metrics to track) and reads them back as a compiled markdown document before an earnings call.

**Architecture:** A new Firestore collection (`earningsStories`) backed by a hook mirroring `usePortfolio.ts`'s pattern, a pure markdown-compiling function, and three new components (top-level ticker grid → per-ticker story list/markdown toggle → story editor modal), wired into the existing tab navigation in `Sidebar.tsx`, `MobileBottomNav.tsx`, and `App.tsx`.

**Tech Stack:** React 19, TypeScript, Firebase/Firestore, `react-markdown` + `remark-gfm` (already installed, already used in `AgentMessage.tsx`), `lucide-react`, `framer-motion`, Tailwind v4.

## Global Constraints

- No new dependencies — use only already-installed `react-markdown`, `remark-gfm`, `lucide-react`, `framer-motion`, `firebase`.
- Stories scoped to portfolio holdings only — no arbitrary ticker search (unlike Research).
- Mobile-first, single-column flow — no `lg:`-gated layout branching anywhere in this feature.
- No test runner exists in this project — verification is via `npm run lint` (`tsc --noEmit`) plus manual dev-server checks.

---

## File Map

| File | Change |
|---|---|
| `src/types.ts` | Add `EarningsMetric`, `EarningsStory`, `SaveStoryInput` |
| `src/hooks/useEarningsStories.ts` | New — Firestore CRUD hook |
| `src/lib/earningsMarkdown.ts` | New — `compileTickerMarkdown` pure function |
| `src/components/earnings-prep/StoryEditor.tsx` | New — create/edit modal |
| `src/components/earnings-prep/TickerStoriesView.tsx` | New — per-ticker story list + markdown toggle |
| `src/components/tabs/EarningsPrepTab.tsx` | New — top-level ticker grid |
| `src/components/Sidebar.tsx` | Add `'earnings-prep'` tab + nav item |
| `src/components/MobileBottomNav.tsx` | Add same nav item |
| `src/App.tsx` | Wire hook + new tab's render branch |

---

## Task 1: Add types and the Firestore hook

**Files:**
- Modify: `src/types.ts`
- Create: `src/hooks/useEarningsStories.ts`

**Interfaces:**
- Produces: `EarningsMetric { id, metric, baseline, whatToWatch, why: string }`; `EarningsStory { id, ticker, title, question, metrics: EarningsMetric[], createdAt, updatedAt: string }`; `SaveStoryInput { id?: string, ticker, title, question: string, metrics: EarningsMetric[] }`; `useEarningsStories(user: User | null): { stories: EarningsStory[]; saveStory: (story: SaveStoryInput) => Promise<void>; deleteStory: (id: string) => Promise<void> }`.

- [ ] **Step 1: Add the types**

Append to the end of `src/types.ts`:

```ts
export interface EarningsMetric {
  id: string;
  metric: string;
  baseline: string;
  whatToWatch: string;
  why: string;
}

export interface EarningsStory {
  id: string;
  ticker: string;
  title: string;
  question: string;
  metrics: EarningsMetric[];
  createdAt: string;
  updatedAt: string;
}

export type SaveStoryInput = {
  id?: string;
  ticker: string;
  title: string;
  question: string;
  metrics: EarningsMetric[];
};
```

- [ ] **Step 2: Create the hook**

Create `src/hooks/useEarningsStories.ts`:

```ts
import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  collection, onSnapshot, doc, setDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';
import { EarningsStory, SaveStoryInput } from '../types';

export function useEarningsStories(user: User | null) {
  const [stories, setStories] = useState<EarningsStory[]>([]);

  useEffect(() => {
    if (!user) {
      setStories([]);
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'users', user.uid, 'earningsStories'),
      (snap) => setStories(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EarningsStory))),
      (err) => console.error('Firestore error (earningsStories):', err)
    );

    return () => unsub();
  }, [user]);

  const saveStory = async (story: SaveStoryInput) => {
    if (!user) return;
    const now = new Date().toISOString();
    const ref = story.id
      ? doc(db, 'users', user.uid, 'earningsStories', story.id)
      : doc(collection(db, 'users', user.uid, 'earningsStories'));
    const existing = stories.find((s) => s.id === story.id);
    await setDoc(ref, {
      ticker: story.ticker,
      title: story.title,
      question: story.question,
      metrics: story.metrics,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  };

  const deleteStory = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'earningsStories', id));
    toast.success('Story deleted');
  };

  return { stories, saveStory, deleteStory };
}
```

This mirrors `src/hooks/usePortfolio.ts`'s pattern exactly: an `onSnapshot` real-time listener populating state, plus async functions that write directly to Firestore. `ticker` is a field on each document (not part of the Firestore path), so a single collection listener covers every ticker — per-ticker filtering happens client-side in later tasks, the same way `usePortfolio.ts`'s flat `holdings`/`transactions` collections are filtered/grouped in the UI layer.

- [ ] **Step 3: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/hooks/useEarningsStories.ts
git commit -m "feat: add Earnings Prep types and Firestore hook"
```

---

## Task 2: Create the markdown compiler

**Files:**
- Create: `src/lib/earningsMarkdown.ts`

**Interfaces:**
- Consumes: `EarningsStory` from `src/types.ts` (Task 1).
- Produces: `compileTickerMarkdown(ticker: string, stories: EarningsStory[]): string`.

- [ ] **Step 1: Write the function**

Create `src/lib/earningsMarkdown.ts`:

```ts
import { EarningsStory } from '../types';

export function compileTickerMarkdown(ticker: string, stories: EarningsStory[]): string {
  const header = `# ${ticker} — Earnings Prep`;

  if (stories.length === 0) {
    return `${header}\n\nNo stories yet.`;
  }

  const sections = stories.map((story) => {
    const metricsBlock = story.metrics.length === 0
      ? '_No metrics added yet._'
      : story.metrics.map((m) => [
          `**${m.metric}**`,
          `- Baseline: ${m.baseline}`,
          `- What to watch: ${m.whatToWatch}`,
          `- Why: ${m.why}`,
        ].join('\n')).join('\n\n');

    return [
      `## ${story.title}`,
      `**Question:** ${story.question}`,
      '',
      '### Metrics to Watch',
      '',
      metricsBlock,
    ].join('\n');
  });

  return `${header}\n\n${sections.join('\n\n---\n\n')}`;
}
```

A pure, synchronous string-building function — no I/O, no React, no Firestore. Given `ticker = 'AMZN'` and one story titled `'AI Capex'` with question `'Is the AI capex creating capturable value...'` and one metric (`metric: 'Capex as % of revenue'`, `baseline: '32% in Q2 2025'`, `whatToWatch: 'Whether guidance increases again'`, `why: 'Validates whether AI infra spend is being monetized or just cost'`), this produces:

```
# AMZN — Earnings Prep

## AI Capex
**Question:** Is the AI capex creating capturable value...

### Metrics to Watch

**Capex as % of revenue**
- Baseline: 32% in Q2 2025
- What to watch: Whether guidance increases again
- Why: Validates whether AI infra spend is being monetized or just cost
```

With a second story, a `\n\n---\n\n` horizontal-rule separator appears between the two story sections (not before the first one).

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/earningsMarkdown.ts
git commit -m "feat: add earnings prep markdown compiler"
```

---

## Task 3: Create the StoryEditor modal

**Files:**
- Create: `src/components/earnings-prep/StoryEditor.tsx`

**Interfaces:**
- Consumes: `EarningsStory`, `EarningsMetric`, `SaveStoryInput` from `src/types.ts` (Task 1).
- Produces: `<StoryEditor ticker: string, editingStory?: EarningsStory, onSave: (story: SaveStoryInput) => Promise<void>, onClose: () => void />`.

- [ ] **Step 1: Write the component**

Create `src/components/earnings-prep/StoryEditor.tsx`:

```tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Plus, X } from 'lucide-react';
import { EarningsStory, EarningsMetric, SaveStoryInput } from '../../types';

interface Props {
  ticker: string;
  editingStory?: EarningsStory;
  onSave: (story: SaveStoryInput) => Promise<void>;
  onClose: () => void;
}

function emptyMetric(): EarningsMetric {
  return { id: crypto.randomUUID(), metric: '', baseline: '', whatToWatch: '', why: '' };
}

export default function StoryEditor({ ticker, editingStory, onSave, onClose }: Props) {
  const [title, setTitle] = useState(editingStory?.title ?? '');
  const [question, setQuestion] = useState(editingStory?.question ?? '');
  const [metrics, setMetrics] = useState<EarningsMetric[]>(editingStory?.metrics ?? [emptyMetric()]);
  const [saving, setSaving] = useState(false);

  const isValid = title.trim().length > 0 && question.trim().length > 0;

  const updateMetric = (id: string, field: keyof Omit<EarningsMetric, 'id'>, value: string) => {
    setMetrics((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const addMetricRow = () => setMetrics((prev) => [...prev, emptyMetric()]);
  const removeMetricRow = (id: string) => setMetrics((prev) => prev.filter((m) => m.id !== id));

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    await onSave({
      id: editingStory?.id,
      ticker,
      title: title.trim(),
      question: question.trim(),
      metrics: metrics.filter((m) => m.metric.trim().length > 0),
    });
    setSaving(false);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={saving ? undefined : onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 sm:p-8 max-w-lg w-full shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-xl font-bold mb-1 text-white">{editingStory ? 'Edit Story' : 'New Story'}</h3>
          <p className="text-xs text-zinc-500 mb-6">{ticker}</p>

          <div className="flex flex-col gap-4 mb-6">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. AI Capex"
                autoFocus
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Question</label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Is the AI capex creating capturable value or leaking out to advertisers and chipmakers?"
                rows={2}
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Metrics to Watch</label>
            <button
              onClick={addMetricRow}
              className="flex items-center gap-1 text-xs font-bold text-zinc-400 hover:text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Metric
            </button>
          </div>

          <div className="flex flex-col gap-4 mb-6">
            {metrics.map((m) => (
              <div key={m.id} className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 relative">
                <button
                  onClick={() => removeMetricRow(m.id)}
                  className="absolute top-3 right-3 text-zinc-600 hover:text-rose-400 transition-colors"
                  title="Remove metric"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex flex-col gap-2.5 pr-6">
                  <input
                    type="text"
                    value={m.metric}
                    onChange={(e) => updateMetric(m.id, 'metric', e.target.value)}
                    placeholder="Metric (e.g. Capex as % of revenue)"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors"
                  />
                  <input
                    type="text"
                    value={m.baseline}
                    onChange={(e) => updateMetric(m.id, 'baseline', e.target.value)}
                    placeholder="Baseline (last known value)"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors"
                  />
                  <input
                    type="text"
                    value={m.whatToWatch}
                    onChange={(e) => updateMetric(m.id, 'whatToWatch', e.target.value)}
                    placeholder="What to watch"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors"
                  />
                  <input
                    type="text"
                    value={m.why}
                    onChange={(e) => updateMetric(m.id, 'why', e.target.value)}
                    placeholder="Why it matters"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-3 rounded-xl font-bold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isValid || saving}
              className="flex-1 py-3 rounded-xl font-bold bg-white text-zinc-900 hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Story'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
```

This follows `src/components/CashBalanceModal.tsx`'s exact modal pattern (fixed overlay + `AnimatePresence`/`motion.div`, disabled-while-saving, `Loader2` spinner). The card itself scrolls (`max-h-[85vh] overflow-y-auto custom-scrollbar`) since the metrics list can grow long — this avoids the kind of clipped/unscrollable content this app has run into before on narrow screens.

Empty metric rows (where the user added a row but left the "Metric" field blank) are filtered out on save, so only metrics with an actual name get persisted.

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors. The component isn't imported anywhere yet, so this only verifies the new file itself compiles.

- [ ] **Step 3: Commit**

```bash
git add src/components/earnings-prep/StoryEditor.tsx
git commit -m "feat: add StoryEditor component"
```

---

## Task 4: Create the TickerStoriesView component

**Files:**
- Create: `src/components/earnings-prep/TickerStoriesView.tsx`

**Interfaces:**
- Consumes: `EarningsStory`, `SaveStoryInput` from `src/types.ts` (Task 1); `compileTickerMarkdown` from `src/lib/earningsMarkdown.ts` (Task 2); `StoryEditor` from Task 3; existing `src/components/ConfirmDialog.tsx`.
- Produces: `<TickerStoriesView ticker: string, stories: EarningsStory[], canAddStory: boolean, onSave: (story: SaveStoryInput) => Promise<void>, onDelete: (id: string) => Promise<void>, onBack: () => void />`.

- [ ] **Step 1: Write the component**

Create `src/components/earnings-prep/TickerStoriesView.tsx`:

```tsx
import { useState } from 'react';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { EarningsStory, SaveStoryInput } from '../../types';
import { compileTickerMarkdown } from '../../lib/earningsMarkdown';
import StoryEditor from './StoryEditor';
import ConfirmDialog from '../ConfirmDialog';

interface Props {
  ticker: string;
  stories: EarningsStory[];
  canAddStory: boolean;
  onSave: (story: SaveStoryInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onBack: () => void;
}

type View = 'edit' | 'markdown';

export default function TickerStoriesView({ ticker, stories, canAddStory, onSave, onDelete, onBack }: Props) {
  const [view, setView] = useState<View>('edit');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingStory, setEditingStory] = useState<EarningsStory | 'new' | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors w-fit"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Tickers
      </button>

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-white tracking-tight">{ticker}</h2>
        <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1">
          <button
            onClick={() => setView('edit')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${view === 'edit' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Edit
          </button>
          <button
            onClick={() => setView('markdown')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${view === 'markdown' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Markdown
          </button>
        </div>
      </div>

      {view === 'edit' ? (
        <div className="flex flex-col gap-3">
          {canAddStory && (
            <button
              onClick={() => setEditingStory('new')}
              className="flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors text-sm font-bold"
            >
              <Plus className="w-4 h-4" />
              Add Story
            </button>
          )}

          {stories.length === 0 && (
            <div className="text-center text-sm text-zinc-600 py-8">No stories yet for {ticker}.</div>
          )}

          {stories.map((story) => {
            const isExpanded = expandedId === story.id;
            return (
              <div key={story.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div
                  className="flex items-start justify-between gap-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : story.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white mb-1">{story.title}</div>
                    <div className="text-xs text-zinc-500 leading-relaxed">{story.question}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingStory(story); }}
                      className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="Edit story"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(story.id); }}
                      className="p-1.5 text-zinc-500 hover:text-rose-400 transition-colors"
                      title="Delete story"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-col gap-3">
                    {story.metrics.length === 0 ? (
                      <div className="text-xs text-zinc-600">No metrics added yet.</div>
                    ) : (
                      story.metrics.map((m) => (
                        <div key={m.id} className="bg-zinc-800/50 rounded-lg p-3">
                          <div className="text-sm font-bold text-zinc-200 mb-1.5">{m.metric}</div>
                          <div className="text-xs text-zinc-500 leading-relaxed space-y-0.5">
                            <div><span className="text-zinc-400 font-semibold">Baseline:</span> {m.baseline}</div>
                            <div><span className="text-zinc-400 font-semibold">What to watch:</span> {m.whatToWatch}</div>
                            <div><span className="text-zinc-400 font-semibold">Why:</span> {m.why}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="text-sm text-zinc-300 leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 className="text-2xl font-black text-white mb-4">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-bold text-white mt-6 mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mt-4 mb-2">{children}</h3>,
                p: ({ children }) => <p className="mb-2 last:mb-0 text-zinc-300">{children}</p>,
                strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                em: ({ children }) => <em className="text-zinc-500">{children}</em>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                li: ({ children }) => <li className="text-zinc-300">{children}</li>,
                hr: () => <hr className="border-zinc-800 my-6" />,
              }}
            >
              {compileTickerMarkdown(ticker, stories)}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {editingStory && (
        <StoryEditor
          ticker={ticker}
          editingStory={editingStory === 'new' ? undefined : editingStory}
          onSave={async (story) => { await onSave(story); setEditingStory(null); }}
          onClose={() => setEditingStory(null)}
        />
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          message="Delete this story? This cannot be undone."
          onConfirm={async () => { await onDelete(confirmDeleteId); setConfirmDeleteId(null); }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
```

The `ReactMarkdown` `components` mapping is adapted from `src/components/agent/AgentMessage.tsx`'s existing usage (same library, same dark-theme styling conventions), extended with `h1`/`hr` handling since a compiled ticker document has a top-level heading and horizontal rules between stories that `AgentMessage.tsx`'s chat-bubble usage never needed. `ConfirmDialog`'s `onConfirm` prop is typed `() => void`; passing an `async () => {...}` function there type-checks fine (a function returning `Promise<void>` is assignable wherever `() => void` is expected — the same pattern already used throughout `App.tsx`, e.g. `handleDeleteHolding`).

`canAddStory` controls whether the "+ Add Story" button renders at all — it's `false` for archived tickers (no longer in the portfolio), so existing Stories for a sold position can still be viewed, edited, and deleted, but no new ones can be added for it. Task 5 computes this value.

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/earnings-prep/TickerStoriesView.tsx
git commit -m "feat: add TickerStoriesView component"
```

---

## Task 5: Create the EarningsPrepTab component

**Files:**
- Create: `src/components/tabs/EarningsPrepTab.tsx`

**Interfaces:**
- Consumes: `Holding`, `EarningsStory`, `SaveStoryInput` from `src/types.ts`; existing `src/components/shared/TickerLogo.tsx`; `TickerStoriesView` from Task 4.
- Produces: `<EarningsPrepTab holdings: Holding[], stories: EarningsStory[], onSaveStory: (story: SaveStoryInput) => Promise<void>, onDeleteStory: (id: string) => Promise<void> />`.

- [ ] **Step 1: Write the component**

Create `src/components/tabs/EarningsPrepTab.tsx`:

```tsx
import { useState } from 'react';
import { Holding, EarningsStory, SaveStoryInput } from '../../types';
import TickerLogo from '../shared/TickerLogo';
import TickerStoriesView from '../earnings-prep/TickerStoriesView';

interface Props {
  holdings: Holding[];
  stories: EarningsStory[];
  onSaveStory: (story: SaveStoryInput) => Promise<void>;
  onDeleteStory: (id: string) => Promise<void>;
}

export default function EarningsPrepTab({ holdings, stories, onSaveStory, onDeleteStory }: Props) {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const holdingTickers = new Set(holdings.map((h) => h.ticker));
  const archivedTickers = [...new Set(stories.map((s) => s.ticker))].filter((t) => !holdingTickers.has(t));

  if (selectedTicker) {
    return (
      <TickerStoriesView
        ticker={selectedTicker}
        stories={stories.filter((s) => s.ticker === selectedTicker)}
        canAddStory={holdingTickers.has(selectedTicker)}
        onSave={onSaveStory}
        onDelete={onDeleteStory}
        onBack={() => setSelectedTicker(null)}
      />
    );
  }

  if (holdings.length === 0 && archivedTickers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-2 py-16">
        <div className="text-zinc-400 font-bold">No holdings yet</div>
        <p className="text-sm text-zinc-600 max-w-sm">
          Add holdings via Connections or a manual import to start prepping earnings stories for your portfolio.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {holdings.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {holdings.map((h) => {
            const count = stories.filter((s) => s.ticker === h.ticker).length;
            return (
              <button
                key={h.ticker}
                onClick={() => setSelectedTicker(h.ticker)}
                className="flex flex-col items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors text-center"
              >
                <TickerLogo ticker={h.ticker} size="md" />
                <div className="font-bold text-white text-sm">{h.ticker}</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  {count === 0 ? 'No stories yet' : `${count} ${count === 1 ? 'story' : 'stories'}`}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {archivedTickers.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Archived</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {archivedTickers.map((ticker) => {
              const count = stories.filter((s) => s.ticker === ticker).length;
              return (
                <button
                  key={ticker}
                  onClick={() => setSelectedTicker(ticker)}
                  className="flex flex-col items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors text-center opacity-50 hover:opacity-75"
                >
                  <TickerLogo ticker={ticker} size="md" />
                  <div className="font-bold text-white text-sm">{ticker}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    {count} {count === 1 ? 'story' : 'stories'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` is a plain responsive column count with no height-bounding or independent-scroll branching — consistent with the "no `lg:`-gated layout branching" constraint, since this only ever changes column *count*, not anything about scroll/height architecture.

`archivedTickers` is computed fresh on every render from `stories` vs. `holdings` — no stored "archived" flag anywhere, so it can never drift out of sync with reality, including across the delete-and-recreate cycle that brokerage resync puts `holdings` through. The archived grid only renders when non-empty, and its cards are visually dimmed (`opacity-50 hover:opacity-75`) to distinguish them from active holdings.

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors. The component isn't imported into `App.tsx` yet, so this only verifies the new file itself compiles.

- [ ] **Step 3: Commit**

```bash
git add src/components/tabs/EarningsPrepTab.tsx
git commit -m "feat: add EarningsPrepTab component"
```

---

## Task 6: Wire Earnings Prep into navigation

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/MobileBottomNav.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useEarningsStories` from Task 1; `EarningsPrepTab` from Task 5.

- [ ] **Step 1: Add the tab to Sidebar.tsx**

In `src/components/Sidebar.tsx`, find:

```tsx
import { LayoutDashboard, ArrowUpDown, TrendingUp, BrainCircuit, LogOut, RefreshCw, Search, Link } from 'lucide-react';
```

Replace with:

```tsx
import { LayoutDashboard, ArrowUpDown, TrendingUp, BrainCircuit, LogOut, RefreshCw, Search, Link, Newspaper } from 'lucide-react';
```

Find:

```tsx
export type Tab = 'overview' | 'transactions' | 'performance' | 'deep-dive' | 'research' | 'connections';
```

Replace with:

```tsx
export type Tab = 'overview' | 'transactions' | 'performance' | 'deep-dive' | 'research' | 'connections' | 'earnings-prep';
```

Find:

```tsx
const NAV_ITEMS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',     label: 'Overview',     icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ArrowUpDown },
  { id: 'performance',  label: 'Performance',  icon: TrendingUp },
  { id: 'research',     label: 'Research',     icon: Search },
  { id: 'connections',  label: 'Connections',  icon: Link },
];
```

Replace with:

```tsx
const NAV_ITEMS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',     label: 'Overview',     icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ArrowUpDown },
  { id: 'performance',  label: 'Performance',  icon: TrendingUp },
  { id: 'research',     label: 'Research',     icon: Search },
  { id: 'connections',  label: 'Connections',  icon: Link },
  { id: 'earnings-prep', label: 'Earnings Prep', icon: Newspaper },
];
```

- [ ] **Step 2: Add the tab to MobileBottomNav.tsx**

In `src/components/MobileBottomNav.tsx`, find:

```tsx
import { LayoutDashboard, ArrowUpDown, TrendingUp, Search, Link } from 'lucide-react';
```

Replace with:

```tsx
import { LayoutDashboard, ArrowUpDown, TrendingUp, Search, Link, Newspaper } from 'lucide-react';
```

Find:

```tsx
const NAV_ITEMS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',     label: 'Overview',     icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ArrowUpDown },
  { id: 'performance',  label: 'Performance',  icon: TrendingUp },
  { id: 'research',     label: 'Research',     icon: Search },
  { id: 'connections',  label: 'Connections',  icon: Link },
];
```

Replace with:

```tsx
const NAV_ITEMS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',     label: 'Overview',     icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ArrowUpDown },
  { id: 'performance',  label: 'Performance',  icon: TrendingUp },
  { id: 'research',     label: 'Research',     icon: Search },
  { id: 'connections',  label: 'Connections',  icon: Link },
  { id: 'earnings-prep', label: 'Earnings Prep', icon: Newspaper },
];
```

- [ ] **Step 3: Wire the hook and component into App.tsx**

In `src/App.tsx`, find:

```tsx
import { usePortfolio } from './hooks/usePortfolio';
```

Replace with:

```tsx
import { usePortfolio } from './hooks/usePortfolio';
import { useEarningsStories } from './hooks/useEarningsStories';
```

Find:

```tsx
import ConnectionsTab from './components/tabs/ConnectionsTab';
```

Replace with:

```tsx
import ConnectionsTab from './components/tabs/ConnectionsTab';
import EarningsPrepTab from './components/tabs/EarningsPrepTab';
```

Find:

```tsx
  const { holdings, transactions, cashBalance, firestoreError, setCashBalance, addTransaction, bulkImportTransactions, deleteTransaction, deleteHolding, clearAllTransactions } = usePortfolio(user);
  const snaptrade = useSnaptrade(user);
```

Replace with:

```tsx
  const { holdings, transactions, cashBalance, firestoreError, setCashBalance, addTransaction, bulkImportTransactions, deleteTransaction, deleteHolding, clearAllTransactions } = usePortfolio(user);
  const { stories, saveStory, deleteStory } = useEarningsStories(user);
  const snaptrade = useSnaptrade(user);
```

Find:

```tsx
                {activeTab === 'connections' && (
                  <ConnectionsTab
                    credentials={snaptrade.credentials}
                    accounts={snaptrade.accounts}
                    lastSyncedAt={snaptrade.lastSyncedAt}
                    isSyncing={snaptrade.isSyncing}
                    syncError={snaptrade.syncError}
                    onRegister={snaptrade.register}
                    onGetConnectUrl={snaptrade.getConnectUrl}
                    onSync={() => snaptrade.sync(syncFromSnaptrade)}
                    onDisconnect={snaptrade.disconnect}
                    onClearApiKeys={snaptrade.clearApiKeys}
                    onShowCsvImport={() => setShowImportGuide(true)}
                  />
                )}
```

Replace with:

```tsx
                {activeTab === 'connections' && (
                  <ConnectionsTab
                    credentials={snaptrade.credentials}
                    accounts={snaptrade.accounts}
                    lastSyncedAt={snaptrade.lastSyncedAt}
                    isSyncing={snaptrade.isSyncing}
                    syncError={snaptrade.syncError}
                    onRegister={snaptrade.register}
                    onGetConnectUrl={snaptrade.getConnectUrl}
                    onSync={() => snaptrade.sync(syncFromSnaptrade)}
                    onDisconnect={snaptrade.disconnect}
                    onClearApiKeys={snaptrade.clearApiKeys}
                    onShowCsvImport={() => setShowImportGuide(true)}
                  />
                )}
                {activeTab === 'earnings-prep' && (
                  <EarningsPrepTab
                    holdings={holdings}
                    stories={stories}
                    onSaveStory={saveStory}
                    onDeleteStory={deleteStory}
                  />
                )}
```

No changes are needed to the `PullToRefresh`/`overflow`/`motion.div` className logic a few lines above (around line 286-301) — `'earnings-prep'` doesn't match any of the special-cased tab names (`'research'`, or the `['overview', 'transactions', 'performance']` pull-to-refresh allow-list), so it automatically falls into the same default treatment as `'connections'`: normal `overflow-y-auto` scroll, `p-6` padding, pull-to-refresh disabled. This is correct — refreshing stock prices has no meaning for this tab.

- [ ] **Step 4: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Manual visual check**

```bash
PORT=3008 npm run dev
```

This is the first point where the whole feature becomes reachable in the running app. Confirm: "Earnings Prep" appears in the desktop sidebar and the mobile bottom nav (6 icons now, slightly narrower than before). Clicking it shows a grid of your portfolio holdings (or the empty state if you have none). Selecting a ticker shows its story list (empty initially) with a working "+ Add Story" button. Adding a story with a title, question, and at least one metric saves successfully and appears in the list; expanding it shows the metric's four fields. The "Markdown" toggle renders a compiled document matching the story's content. Editing and deleting a story both work, with delete going through the confirmation dialog. Switching back to other tabs (Overview, Research, etc.) still works normally.

Also confirm the archived-tickers behavior: add a story for a ticker, then (in Firestore directly, or by temporarily editing test data) simulate that ticker no longer being in `holdings` — it should disappear from the main grid and reappear, dimmed, in a new "Archived" section below it, with "+ Add Story" no longer shown when you drill into it, while existing stories there remain fully viewable/editable/deletable.

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar.tsx src/components/MobileBottomNav.tsx src/App.tsx
git commit -m "feat: wire Earnings Prep tab into navigation"
```

---

## Out of Scope (per design spec)

- Numeric target/threshold fields or confirmed/refuted status tracking on metrics.
- Creating *new* Stories for tickers not currently held in the portfolio (viewing/editing/deleting existing Stories for archived — fully sold — tickers is in scope).
- A portfolio-wide combined markdown document (only one-doc-per-ticker).
- Any automatic pulling of live metric values from Yahoo Finance into a Story.
- Any change to the existing "Deep Dive" placeholder tab.
