import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Holding, ChatSession, StoredMessage, StoredReport, StockData } from '../../types';
import { useChatSessions } from '../../hooks/useChatSessions';
import SessionSidebar from '../agent/SessionSidebar';
import PortfolioRiskReport, { ReportData } from '../agent/PortfolioRiskReport';
import AgentChat from '../agent/AgentChat';

interface ActiveSession {
  session: ChatSession;
  messages: StoredMessage[];
  adkSessionId: string;
}

interface Props {
  uid: string;
  holdings: Holding[];
  stockPrices: Record<string, StockData>;
  cashBalance: number;
}

async function createAdkSession(uid: string): Promise<string> {
  const res = await fetch('/api/agent/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid }),
  });
  if (!res.ok) throw new Error(`Failed to create agent session: ${res.status}`);
  const data = await res.json();
  return data.sessionId as string;
}

export default function InsightsTab({ uid, holdings, stockPrices, cashBalance }: Props) {
  const { sessions, sessionError, createSession, loadSessionMessages, appendMessage, setSessionTitle, deleteSession, saveReport, loadReport } =
    useChatSessions(uid);

  const [activeView, setActiveView] = useState<string>('report');
  const [cachedReport, setCachedReport] = useState<StoredReport | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const activeSessionRef = useRef<ActiveSession | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [sessionCreateError, setSessionCreateError] = useState<string | null>(null);

  useEffect(() => { activeSessionRef.current = activeSession; }, [activeSession]);

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
    if (activeView === session.id) return;
    setIsCreating(true);
    setSessionCreateError(null);
    try {
      const [messages, adkSessionId] = await Promise.all([
        loadSessionMessages(session.id),
        createAdkSession(uid),
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
        createSession(),
        createAdkSession(uid),
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

  const handleMessageAppend = useCallback((
    role: 'user' | 'agent',
    text: string,
    agent?: string,
    structured?: Record<string, unknown>,
  ) => {
    if (!activeSessionRef.current) return Promise.resolve();
    return appendMessage(activeSessionRef.current.session.id, role, text, agent, structured);
  }, [appendMessage]);

  const handleTitleSet = useCallback((title: string) => {
    if (!activeSessionRef.current) return Promise.resolve();
    return setSessionTitle(activeSessionRef.current.session.id, title);
  }, [setSessionTitle]);

  const handleDeleteSession = async (session: ChatSession) => {
    await deleteSession(session.id);
    if (activeView === session.id) {
      setActiveView('report');
      setActiveSession(null);
    }
  };

  return (
    <div className="flex gap-6 items-start">
      {/* Sidebar */}
      <div className="flex flex-col gap-2">
      <SessionSidebar
        sessions={sessions}
        activeView={activeView}
        onSelectReport={handleSelectReport}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        isCreating={isCreating}
      />
      {sessionError && (
        <p className="text-[10px] text-rose-400 px-3">{sessionError}</p>
      )}
      </div>

      {/* Main panel */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">
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
            stockPrices={stockPrices}
            cashBalance={cashBalance}
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
