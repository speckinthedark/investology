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
  if (!res.ok) throw new Error(`Failed to create agent session: ${res.status}`);
  const data = await res.json();
  return data.sessionId as string;
}

export default function InsightsTab({ uid, holdings, cashBalance, selectedPersona, onPersonaChange }: Props) {
  const { sessions, createSession, loadSessionMessages, appendMessage, setSessionTitle, saveReport, loadReport } =
    useChatSessions(uid);

  const [activeView, setActiveView] = useState<string>('report');
  const [cachedReport, setCachedReport] = useState<StoredReport | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [sessionCreateError, setSessionCreateError] = useState<string | null>(null);

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
    setSessionCreateError(null);
    try {
      const [messages, adkSessionId] = await Promise.all([
        loadSessionMessages(session.id),
        createAdkSession(uid, session.persona),
      ]);
      setActiveSession({ session, messages, adkSessionId });
      setActiveView(session.id);
    } catch (e: any) {
      setSessionCreateError(e?.message ?? 'Failed to open session');
    } finally {
      setIsCreating(false);
    }
  };

  const handleNewSession = async () => {
    setIsCreating(true);
    setSessionCreateError(null);
    try {
      const [session, adkSessionId] = await Promise.all([
        createSession(selectedPersona),
        createAdkSession(uid, selectedPersona),
      ]);
      setActiveSession({ session, messages: [], adkSessionId });
      setActiveView(session.id);
    } catch (e: any) {
      setSessionCreateError(e?.message ?? 'Failed to create session');
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

        {/* Session error */}
        {activeView !== 'report' && !isCreating && sessionCreateError && (
          <div className="flex items-center gap-2 text-rose-400 text-sm py-4">
            <span>{sessionCreateError}</span>
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
