import React, { useState, useEffect, useRef, type FC, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import AgentMessage, { ChatMessage } from './AgentMessage';
import MentionInput from './MentionInput';
import { streamAgent } from '../../hooks/useAgentStream';
import { Holding } from '../../types';
import { Persona } from '../../types';

interface Props {
  uid: string;
  holdings: Holding[];
  cashBalance: number;
  persona: Persona;
}

let messageCounter = 0;
const nextId = () => String(++messageCounter);

const AgentChat: FC<Props> = ({ uid, holdings, cashBalance, persona }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Create ADK session on mount
  useEffect(() => {
    fetch('/api/agent/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, persona }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.sessionId) setSessionId(data.sessionId);
        else setSessionError('Failed to initialise session');
      })
      .catch(() => setSessionError('Failed to connect to agent'));
  }, [uid, persona]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!sessionId || isStreaming) return;

    const userMsg: ChatMessage = { id: nextId(), role: 'user', text };
    const agentMsgId = nextId();
    const agentMsg: ChatMessage = { id: agentMsgId, role: 'agent', text: '', streaming: true };

    setMessages((prev) => [...prev, userMsg, agentMsg]);
    setIsStreaming(true);

    await streamAgent(
      '/api/agent/chat',
      { uid, sessionId, message: text, holdings, cashBalance, persona },
      (event) => {
        if (event.error) {
          setMessages((prev) =>
            prev.map((m) => m.id === agentMsgId ? { ...m, text: `Error: ${event.error}`, streaming: false } : m)
          );
          return;
        }
        if (event.text) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentMsgId
                ? { ...m, text: m.text + event.text, agent: event.agent ?? m.agent }
                : m
            )
          );
        }
        if (event.structured) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentMsgId ? { ...m, structured: event.structured as ChatMessage['structured'] } : m
            )
          );
        }
      },
      () => {
        setMessages((prev) =>
          prev.map((m) => m.id === agentMsgId ? { ...m, streaming: false } : m)
        );
        setIsStreaming(false);
      },
    );
  };

  return (
    <div className="bg-zinc-900 rounded-[32px] border border-zinc-800 p-8 flex flex-col gap-6">
      <div>
        <h3 className="text-xl font-bold italic text-white">Research Chat</h3>
        <p className="text-xs text-zinc-500 mt-0.5">Type <span className="text-emerald-400 font-mono">@valuation</span> or <span className="text-blue-400 font-mono">@news</span> to invoke a specialist agent</p>
      </div>

      {sessionError && (
        <div className="text-sm text-rose-400">{sessionError}</div>
      )}

      {!sessionId && !sessionError && (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Connecting to agents…
        </div>
      )}

      {sessionId && (
        <>
          {/* Message history */}
          <div className="flex flex-col gap-4 min-h-[200px] max-h-[480px] overflow-y-auto pr-1">
            {messages.length === 0 && (
              <p className="text-sm text-zinc-600 italic">
                Ask about your portfolio, or invoke <span className="text-emerald-400">@valuation TICKER</span> or <span className="text-blue-400">@news TICKER</span>.
              </p>
            )}
            {messages.map((m) => React.createElement(AgentMessage, { key: m.id, message: m }))}
            <div ref={bottomRef} />
          </div>

          <MentionInput onSend={sendMessage} disabled={isStreaming || !sessionId} />
        </>
      )}
    </div>
  );
};

export default AgentChat;
