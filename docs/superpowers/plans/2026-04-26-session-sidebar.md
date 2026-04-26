# Session Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stacked Deep Dive tab layout with a sidebar showing all historical chat sessions and the latest portfolio risk report, with the main panel rendering whichever item is selected.

**Architecture:** A new `useChatSessions` hook owns all Firestore reads/writes for sessions and the cached report. `InsightsTab` is rebuilt as a sidebar + main-panel layout, managing which view is active. `AgentChat` and `PortfolioRiskReport` receive their data as props and call back to persist changes, instead of managing their own storage.

**Tech Stack:** React, TypeScript, Firebase Firestore (`firebase/firestore`), Tailwind CSS, Lucide React icons. No new npm packages required.

---

## Firestore Schema

```
users/{uid}/
  chatSessions/{sessionId}          ← session metadata
    title: string                   ← first user message, truncated to 40 chars
    persona: string
    createdAt: Timestamp
    updatedAt: Timestamp            ← updated on every new message (for sidebar sort)

  chatSessions/{sessionId}/messages/{messageId}   ← subcollection
    role: 'user' | 'agent'
    text: string
    agent?: string
    structured?: object
    createdAt: Timestamp

  portfolioReport/latest            ← single doc, overwritten on every generation
    data: object                    ← full ReportData JSON
    generatedAt: Timestamp
```

## File Map

| Action | Path |
|--------|------|
| **Modify** | `src/types.ts` |
| **Create** | `src/hooks/useChatSessions.ts` |
| **Create** | `src/components/agent/SessionSidebar.tsx` |
| **Modify** | `src/components/agent/PortfolioRiskReport.tsx` |
| **Modify** | `src/components/agent/AgentChat.tsx` |
| **Modify** | `src/components/tabs/InsightsTab.tsx` |

---

## Task 1: Add session types to types.ts

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add the three new types**

Open `src/types.ts` and append these types after the existing exports:

```typescript
export interface StoredMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  agent?: string;
  structured?: { type: string; [key: string]: unknown };
}

export interface ChatSession {
  id: string;
  title: string;
  persona: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface StoredReport {
  data: Record<string, unknown>;
  generatedAt: Date;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/rohankirpekar/Desktop/Personal projects/stockpulse-tracker"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only pre-existing errors unrelated to types.ts).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add StoredMessage, ChatSession, StoredReport types"
```

---

## Task 2: Create useChatSessions hook

**Files:**
- Create: `src/hooks/useChatSessions.ts`

This hook owns all Firestore reads and writes for chat sessions and the cached portfolio report. It exposes a live `sessions` list (via `onSnapshot`) plus one-shot async helpers for loading, writing, and caching.

- [ ] **Step 1: Create the file**

Create `src/hooks/useChatSessions.ts` with the full content below:

```typescript
import { useState, useEffect } from 'react';
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  onSnapshot, orderBy, query, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { ChatSession, StoredMessage, StoredReport } from '../types';

export function useChatSessions(uid: string) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'users', uid, 'chatSessions'),
      orderBy('updatedAt', 'desc'),
    );
    return onSnapshot(q, (snap) => {
      setSessions(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title ?? 'New Chat',
            persona: data.persona ?? 'buffett',
            createdAt: (data.createdAt as Timestamp)?.toDate(),
            updatedAt: (data.updatedAt as Timestamp)?.toDate(),
          } satisfies ChatSession;
        }),
      );
    });
  }, [uid]);

  const createSession = async (persona: string): Promise<ChatSession> => {
    const ref = await addDoc(collection(db, 'users', uid, 'chatSessions'), {
      title: 'New Chat',
      persona,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: ref.id, title: 'New Chat', persona, createdAt: new Date(), updatedAt: new Date() };
  };

  const loadSessionMessages = async (sessionId: string): Promise<StoredMessage[]> => {
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, 'chatSessions', sessionId, 'messages'),
        orderBy('createdAt', 'asc'),
      ),
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        role: data.role,
        text: data.text,
        agent: data.agent,
        structured: data.structured,
      } as StoredMessage;
    });
  };

  const appendMessage = async (
    sessionId: string,
    role: 'user' | 'agent',
    text: string,
    agent?: string,
    structured?: Record<string, unknown>,
  ): Promise<void> => {
    const msg: Record<string, unknown> = { role, text, createdAt: serverTimestamp() };
    if (agent) msg.agent = agent;
    if (structured) msg.structured = structured;
    await addDoc(collection(db, 'users', uid, 'chatSessions', sessionId, 'messages'), msg);
    await setDoc(
      doc(db, 'users', uid, 'chatSessions', sessionId),
      { updatedAt: serverTimestamp() },
      { merge: true },
    );
  };

  const setSessionTitle = async (sessionId: string, title: string): Promise<void> => {
    await setDoc(
      doc(db, 'users', uid, 'chatSessions', sessionId),
      { title },
      { merge: true },
    );
  };

  const saveReport = async (data: Record<string, unknown>): Promise<void> => {
    await setDoc(doc(db, 'users', uid, 'portfolioReport', 'latest'), {
      data,
      generatedAt: serverTimestamp(),
    });
  };

  const loadReport = async (): Promise<StoredReport | null> => {
    const snap = await getDoc(doc(db, 'users', uid, 'portfolioReport', 'latest'));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      data: d.data as Record<string, unknown>,
      generatedAt: (d.generatedAt as Timestamp)?.toDate() ?? new Date(),
    };
  };

  return {
    sessions,
    createSession,
    loadSessionMessages,
    appendMessage,
    setSessionTitle,
    saveReport,
    loadReport,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/rohankirpekar/Desktop/Personal projects/stockpulse-tracker"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useChatSessions.ts
git commit -m "feat: add useChatSessions hook for Firestore session persistence"
```

---

## Task 3: Create SessionSidebar component

**Files:**
- Create: `src/components/agent/SessionSidebar.tsx`

The sidebar shows:
- A "New Chat" button at the top
- A pinned "Portfolio Risk Report" item (always visible, highlighted when active)
- A divider, then the list of historical chat sessions sorted newest-first
- Each session shows its title (truncated) and relative timestamp

- [ ] **Step 1: Create the file**

Create `src/components/agent/SessionSidebar.tsx` with the full content below:

```typescript
import { Plus, ShieldAlert, MessageSquare } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ChatSession } from '../../types';

interface Props {
  sessions: ChatSession[];
  activeView: 'report' | string;
  onSelectReport: () => void;
  onSelectSession: (session: ChatSession) => void;
  onNewSession: () => void;
  isCreating: boolean;
}

function formatAge(date?: Date): string {
  if (!date) return '';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function SessionSidebar({
  sessions,
  activeView,
  onSelectReport,
  onSelectSession,
  onNewSession,
  isCreating,
}: Props) {
  return (
    <div className="w-56 flex-shrink-0 flex flex-col gap-1.5">
      {/* New Chat button */}
      <button
        onClick={onNewSession}
        disabled={isCreating}
        className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-40 border border-zinc-700 hover:border-zinc-600 mb-1"
      >
        <Plus className="w-3.5 h-3.5 flex-shrink-0" />
        New Chat
      </button>

      {/* Pinned: Portfolio Risk Report */}
      <button
        onClick={onSelectReport}
        className={cn(
          'flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-left transition-all border',
          activeView === 'report'
            ? 'bg-violet-950/60 border-violet-700/60 text-white'
            : 'bg-transparent border-zinc-800 hover:bg-zinc-800/60 hover:border-zinc-700 text-zinc-300',
        )}
      >
        <ShieldAlert className={cn('w-4 h-4 flex-shrink-0', activeView === 'report' ? 'text-violet-400' : 'text-zinc-500')} />
        <div className="min-w-0">
          <div className="text-[11px] font-bold truncate">Risk Report</div>
          <div className="text-[9px] uppercase tracking-widest text-zinc-500 mt-0.5">AI analysis</div>
        </div>
      </button>

      {/* Divider */}
      {sessions.length > 0 && (
        <div className="h-px bg-zinc-800 my-1" />
      )}

      {/* Chat sessions */}
      {sessions.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelectSession(s)}
          className={cn(
            'flex items-start gap-2.5 w-full px-3 py-2.5 rounded-xl text-left transition-all border',
            activeView === s.id
              ? 'bg-zinc-800 border-zinc-600 text-white'
              : 'bg-transparent border-zinc-800 hover:bg-zinc-800/60 hover:border-zinc-700 text-zinc-300',
          )}
        >
          <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-zinc-500" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold truncate">{s.title}</div>
            <div className="text-[9px] text-zinc-500 mt-0.5">{formatAge(s.updatedAt)}</div>
          </div>
        </button>
      ))}

      {sessions.length === 0 && (
        <p className="text-[10px] text-zinc-600 italic px-3 pt-1">No sessions yet. Start a new chat.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/rohankirpekar/Desktop/Personal projects/stockpulse-tracker"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/agent/SessionSidebar.tsx
git commit -m "feat: add SessionSidebar component"
```

---

## Task 4: Modify PortfolioRiskReport to support caching

**Files:**
- Modify: `src/components/agent/PortfolioRiskReport.tsx`

Changes:
- Accept `initialReport` and `initialGeneratedAt` props (pre-loaded from Firestore cache)
- Accept `onReportGenerated` callback (called after a fresh generation to let the parent save it)
- If `initialReport` is provided, show it immediately without a loading spinner
- Remove the `uid` prop (no longer owns Firestore logic)
- Keep auto-generation when no `initialReport` is provided (first-time users still get a report)

- [ ] **Step 1: Replace the full file content**

Replace `src/components/agent/PortfolioRiskReport.tsx` with:

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

export interface ReportData {
  portfolioHealth: { summary: string };
  concentrationFlags: { flags: ConcentrationFlag[] };
  newsRedFlags: { items: NewsFlag[] };
  notableSignals: { items: NotableSignal[] };
}

const SEVERITY_COLOR: Record<string, string> = {
  high: 'text-rose-400',
  medium: 'text-amber-400',
  low: 'text-zinc-400',
};

interface Props {
  uid: string;
  holdings: Holding[];
  cashBalance: number;
  persona: Persona;
  initialReport: ReportData | null;
  initialGeneratedAt: Date | null;
  onReportGenerated: (data: ReportData) => void;
}

export default function PortfolioRiskReport({
  uid,
  holdings,
  cashBalance,
  persona,
  initialReport,
  initialGeneratedAt,
  onReportGenerated,
}: Props) {
  const [report, setReport] = useState<ReportData | null>(initialReport);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(initialGeneratedAt);

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
            const now = new Date();
            setLastUpdated(now);
            onReportGenerated(data);
          }
        }
      },
      () => setLoading(false),
    );
  };

  // Auto-generate only when there is no cached report
  useEffect(() => {
    if (!initialReport && holdings.length > 0) {
      runReport();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-zinc-900 rounded-[32px] border border-zinc-800 p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold italic text-white">Portfolio Risk Report</h3>
          {lastUpdated && (
            <p className="text-[10px] text-zinc-600 mt-0.5">
              Updated {lastUpdated.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/rohankirpekar/Desktop/Personal projects/stockpulse-tracker"
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors referencing `InsightsTab.tsx` (because it still passes the old props to `PortfolioRiskReport`), but no errors in `PortfolioRiskReport.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add src/components/agent/PortfolioRiskReport.tsx
git commit -m "feat: PortfolioRiskReport accepts cached report props and fires onReportGenerated callback"
```

---

## Task 5: Modify AgentChat to accept session props and persist messages

**Files:**
- Modify: `src/components/agent/AgentChat.tsx`

Changes:
- Remove internal ADK session creation (parent now creates it)
- Accept `session: ChatSession`, `initialMessages: StoredMessage[]`, `adkSessionId: string` props
- Accept `onMessageAppend` and `onTitleSet` callbacks
- Load `initialMessages` as starting state
- Write user message to Firestore immediately on send
- Write complete agent message to Firestore when streaming finishes
- Set session title from first user message if title is still "New Chat"

- [ ] **Step 1: Replace the full file content**

Replace `src/components/agent/AgentChat.tsx` with:

```typescript
import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import AgentMessage, { ChatMessage } from './AgentMessage';
import MentionInput from './MentionInput';
import { streamAgent } from '../../hooks/useAgentStream';
import { Holding, Persona, ChatSession, StoredMessage } from '../../types';

interface Props {
  uid: string;
  holdings: Holding[];
  cashBalance: number;
  persona: Persona;
  session: ChatSession;
  initialMessages: StoredMessage[];
  adkSessionId: string;
  onMessageAppend: (
    role: 'user' | 'agent',
    text: string,
    agent?: string,
    structured?: Record<string, unknown>,
  ) => Promise<void>;
  onTitleSet: (title: string) => Promise<void>;
}

let messageCounter = 0;
const nextId = () => String(++messageCounter);

function toChat(m: StoredMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role,
    text: m.text,
    agent: m.agent,
    structured: m.structured,
    streaming: false,
  };
}

export default function AgentChat({
  uid,
  holdings,
  cashBalance,
  persona,
  session,
  initialMessages,
  adkSessionId,
  onMessageAppend,
  onTitleSet,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages.map(toChat));
  const [sessionId, setSessionId] = useState<string>(adkSessionId);
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isFirstMessage = useRef(initialMessages.length === 0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!sessionId || isStreaming) return;

    // Set title from first user message
    if (isFirstMessage.current) {
      isFirstMessage.current = false;
      const title = text.length > 40 ? text.slice(0, 40) + '…' : text;
      onTitleSet(title).catch(console.error);
    }

    const userMsg: ChatMessage = { id: nextId(), role: 'user', text };
    const agentMsgId = nextId();
    const agentMsg: ChatMessage = { id: agentMsgId, role: 'agent', text: '', streaming: true };

    setMessages((prev) => [...prev, userMsg, agentMsg]);
    setIsStreaming(true);

    // Persist user message immediately
    onMessageAppend('user', text).catch(console.error);

    let finalText = '';
    let finalAgent: string | undefined;
    let finalStructured: Record<string, unknown> | undefined;

    await streamAgent(
      '/api/agent/chat',
      { uid, sessionId, message: text, holdings, cashBalance, persona },
      (event) => {
        if (event.newSessionId) {
          setSessionId(event.newSessionId);
          return;
        }
        if (event.error) {
          setMessages((prev) =>
            prev.map((m) => m.id === agentMsgId ? { ...m, text: `Error: ${event.error}`, streaming: false } : m),
          );
          return;
        }
        if (event.text) {
          finalText += event.text;
          finalAgent = event.agent ?? finalAgent;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentMsgId
                ? { ...m, text: m.text + event.text, agent: event.agent ?? m.agent }
                : m,
            ),
          );
        }
        if (event.structured) {
          finalStructured = event.structured as Record<string, unknown>;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentMsgId ? { ...m, structured: event.structured as ChatMessage['structured'] } : m,
            ),
          );
        }
      },
      () => {
        setMessages((prev) =>
          prev.map((m) => m.id === agentMsgId ? { ...m, streaming: false } : m),
        );
        setIsStreaming(false);
        // Persist complete agent message
        if (finalText || finalStructured) {
          onMessageAppend('agent', finalText, finalAgent, finalStructured).catch(console.error);
        }
      },
    );
  };

  return (
    <div className="bg-zinc-900 rounded-[32px] border border-zinc-800 p-8 flex flex-col gap-6">
      <div>
        <h3 className="text-xl font-bold italic text-white">Research Chat</h3>
        <p className="text-xs text-zinc-500 mt-0.5">
          Type <span className="text-emerald-400 font-mono">@valuation</span> or{' '}
          <span className="text-blue-400 font-mono">@news</span> to invoke a specialist agent
        </p>
      </div>

      {/* Message history */}
      <div className="flex flex-col gap-4 min-h-[200px] max-h-[480px] overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-600 italic">
            Ask about your portfolio, or invoke{' '}
            <span className="text-emerald-400">@valuation TICKER</span> or{' '}
            <span className="text-blue-400">@news TICKER</span>.
          </p>
        )}
        {messages.map((m) => <AgentMessage key={m.id} message={m} />)}
        <div ref={bottomRef} />
      </div>

      <MentionInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/rohankirpekar/Desktop/Personal projects/stockpulse-tracker"
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors in `InsightsTab.tsx` only (it still passes old props to `AgentChat`).

- [ ] **Step 3: Commit**

```bash
git add src/components/agent/AgentChat.tsx
git commit -m "feat: AgentChat accepts session props and persists messages to Firestore via callbacks"
```

---

## Task 6: Revamp InsightsTab with sidebar layout

**Files:**
- Modify: `src/components/tabs/InsightsTab.tsx`

This is the orchestrating component. It:
- Loads `useChatSessions` for the session list and Firestore helpers
- Loads the cached report once on mount
- Manages `activeView: 'report' | string` (string = a session ID)
- On "New Chat": creates Firestore session + fetches ADK session, then switches view
- On session click: loads messages + fetches fresh ADK session, then switches view
- Renders `SessionSidebar` on the left and the active view on the right

- [ ] **Step 1: Replace the full file content**

Replace `src/components/tabs/InsightsTab.tsx` with:

```typescript
import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Persona, Holding, ChatSession, StoredMessage, StoredReport } from '../../types';
import { cn } from '../../lib/utils';
import { useChatSessions } from '../../hooks/useChatSessions';
import SessionSidebar from '../agent/SessionSidebar';
import PortfolioRiskReport, { ReportData } from '../agent/PortfolioRiskReport';
import AgentChat from '../agent/AgentChat';

const PERSONAS: { id: Persona; label: string }[] = [
  { id: 'buffett', label: 'Buffett / Munger' },
  { id: 'lynch',   label: 'Peter Lynch' },
];

interface ActiveSession {
  session: ChatSession;
  messages: StoredMessage[];
  adkSessionId: string;
}

interface Props {
  uid: string;
  holdings: Holding[];
  cashBalance: number;
  selectedPersona: Persona;
  onPersonaChange: (p: Persona) => void;
}

async function createAdkSession(uid: string, persona: string): Promise<string> {
  const res = await fetch('/api/agent/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, persona }),
  });
  const data = await res.json();
  return data.sessionId as string;
}

export default function InsightsTab({ uid, holdings, cashBalance, selectedPersona, onPersonaChange }: Props) {
  const { sessions, createSession, loadSessionMessages, appendMessage, setSessionTitle, saveReport, loadReport } =
    useChatSessions(uid);

  const [activeView, setActiveView] = useState<'report' | string>('report');
  const [cachedReport, setCachedReport] = useState<StoredReport | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Load cached report once on mount
  useEffect(() => {
    loadReport()
      .then(setCachedReport)
      .finally(() => setReportLoading(false));
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectReport = () => {
    setActiveView('report');
    setActiveSession(null);
  };

  const handleSelectSession = async (session: ChatSession) => {
    setIsCreating(true);
    try {
      const [messages, adkSessionId] = await Promise.all([
        loadSessionMessages(session.id),
        createAdkSession(uid, session.persona),
      ]);
      setActiveSession({ session, messages, adkSessionId });
      setActiveView(session.id);
    } finally {
      setIsCreating(false);
    }
  };

  const handleNewSession = async () => {
    setIsCreating(true);
    try {
      const [session, adkSessionId] = await Promise.all([
        createSession(selectedPersona),
        createAdkSession(uid, selectedPersona),
      ]);
      setActiveSession({ session, messages: [], adkSessionId });
      setActiveView(session.id);
    } finally {
      setIsCreating(false);
    }
  };

  const handleReportGenerated = (data: ReportData) => {
    const report: StoredReport = { data: data as unknown as Record<string, unknown>, generatedAt: new Date() };
    setCachedReport(report);
    saveReport(data as unknown as Record<string, unknown>).catch(console.error);
  };

  const handleMessageAppend = (
    role: 'user' | 'agent',
    text: string,
    agent?: string,
    structured?: Record<string, unknown>,
  ) => {
    if (!activeSession) return Promise.resolve();
    return appendMessage(activeSession.session.id, role, text, agent, structured);
  };

  const handleTitleSet = (title: string) => {
    if (!activeSession) return Promise.resolve();
    return setSessionTitle(activeSession.session.id, title);
  };

  return (
    <div className="flex gap-6 items-start">
      {/* Sidebar */}
      <SessionSidebar
        sessions={sessions}
        activeView={activeView}
        onSelectReport={handleSelectReport}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        isCreating={isCreating}
      />

      {/* Main panel */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">
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

        {/* Loading state while report cache loads */}
        {activeView === 'report' && reportLoading && (
          <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        )}

        {/* Portfolio Risk Report */}
        {activeView === 'report' && !reportLoading && (
          <PortfolioRiskReport
            uid={uid}
            holdings={holdings}
            cashBalance={cashBalance}
            persona={selectedPersona}
            initialReport={cachedReport ? (cachedReport.data as unknown as ReportData) : null}
            initialGeneratedAt={cachedReport?.generatedAt ?? null}
            onReportGenerated={handleReportGenerated}
          />
        )}

        {/* Session loading spinner */}
        {activeView !== 'report' && isCreating && (
          <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Starting session…
          </div>
        )}

        {/* Active chat session */}
        {activeView !== 'report' && !isCreating && activeSession && (
          <AgentChat
            key={activeSession.session.id}
            uid={uid}
            holdings={holdings}
            cashBalance={cashBalance}
            persona={selectedPersona}
            session={activeSession.session}
            initialMessages={activeSession.messages}
            adkSessionId={activeSession.adkSessionId}
            onMessageAppend={handleMessageAppend}
            onTitleSet={handleTitleSet}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd "/Users/rohankirpekar/Desktop/Personal projects/stockpulse-tracker"
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Start the dev server and verify the UI**

```bash
cd "/Users/rohankirpekar/Desktop/Personal projects/stockpulse-tracker"
npm run dev
```

Open the app in the browser, navigate to the Deep Dive / Insights tab and verify:
1. Sidebar appears on the left with "Risk Report" pinned at top
2. "Risk Report" is highlighted by default and the report renders in the main panel
3. "New Chat" button creates a new session, switches to it, and the chat input is ready
4. Sending a message titles the session in the sidebar with the first ~40 chars
5. Clicking "Risk Report" switches back to the report
6. Refreshing the page shows the same sessions in the sidebar (loaded from Firestore)
7. Clicking a historical session loads its message history in the main panel

- [ ] **Step 4: Commit**

```bash
git add src/components/tabs/InsightsTab.tsx
git commit -m "feat: revamp InsightsTab with sidebar and Firestore-persisted chat sessions"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|-------------|------|
| Sidebar showing historical sessions | Task 3 (SessionSidebar), Task 6 (InsightsTab) |
| Latest portfolio risk report pinned in sidebar | Task 3 (pinned item), Task 4 (cache), Task 6 (loadReport) |
| Select session → continue conversation | Task 5 (initialMessages), Task 6 (handleSelectSession) |
| New session button | Task 3 (button), Task 6 (handleNewSession) |
| Default: risk report selected and visible | Task 6 (activeView defaults to 'report') |
| Sessions persist across page refresh | Task 2 (Firestore), Tasks 5+6 (appendMessage) |
| Report cached (not regenerated on re-select) | Task 4 (initialReport prop + auto-generate guard), Task 6 (cachedReport state) |

### Type Consistency Check

- `StoredMessage.id` — set in `useChatSessions.loadSessionMessages` from Firestore doc ID ✓
- `toChat(m: StoredMessage)` in `AgentChat` uses `m.id`, `m.role`, `m.text`, `m.agent`, `m.structured` — all defined on `StoredMessage` ✓
- `ReportData` is exported from `PortfolioRiskReport.tsx` and imported in `InsightsTab.tsx` ✓
- `createAdkSession` returns `string`, matches `adkSessionId: string` in `ActiveSession` ✓
- `onMessageAppend` signature in `AgentChat` props matches call sites in `InsightsTab` ✓
