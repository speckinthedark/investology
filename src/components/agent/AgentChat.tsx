import { useState, useEffect, useRef } from 'react';
import AgentMessage, { ChatMessage } from './AgentMessage';
import MentionInput from './MentionInput';
import { streamAgent } from '../../hooks/useAgentStream';
import { Holding, ChatSession, StoredMessage } from '../../types';

interface Props {
  uid: string;
  holdings: Holding[];
  cashBalance: number;
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
  const isFirstMessage = useRef(session.title === 'New Chat');

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
    let hadError = false;

    await streamAgent(
      '/api/agent/chat',
      { uid, sessionId, message: text, holdings, cashBalance },
      (event) => {
        if (event.newSessionId) {
          setSessionId(event.newSessionId);
          return;
        }
        if (event.error) {
          hadError = true;
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
        // Persist complete agent message (skip if the stream errored)
        if (!hadError && (finalText || finalStructured)) {
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
