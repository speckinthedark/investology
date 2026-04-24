import { type JSX } from 'react';
import { cn } from '../../lib/utils';
import DCFResultCard, { DCFResultData } from './DCFResultCard';

const AGENT_LABELS: Record<string, string> = {
  orchestrator: 'Assistant',
  portfolio_risk_agent: 'Portfolio Risk',
  valuation_agent: 'Valuation',
  news_agent: 'News & Sentiment',
};

const AGENT_COLORS: Record<string, string> = {
  orchestrator: 'text-zinc-400 bg-zinc-800',
  portfolio_risk_agent: 'text-violet-400 bg-violet-950/50',
  valuation_agent: 'text-emerald-400 bg-emerald-950/50',
  news_agent: 'text-blue-400 bg-blue-950/50',
};

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  agent?: string;
  text: string;
  structured?: { type: string; [key: string]: unknown };
  streaming?: boolean;
}

export interface AgentMessageProps {
  message: ChatMessage;
}

export default function AgentMessage({ message }: AgentMessageProps): JSX.Element {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-white text-zinc-900 rounded-2xl rounded-tr-sm px-4 py-3 text-sm font-medium">
          {message.text}
        </div>
      </div>
    );
  }

  const agentKey = message.agent ?? 'orchestrator';
  const label = AGENT_LABELS[agentKey] ?? agentKey;
  const colorClass = AGENT_COLORS[agentKey] ?? AGENT_COLORS.orchestrator;

  return (
    <div className="flex flex-col gap-1.5">
      <span className={cn('text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full w-fit', colorClass)}>
        {label}
      </span>
      <div className="max-w-[90%] bg-zinc-800/60 border border-zinc-700/50 rounded-2xl rounded-tl-sm px-4 py-3">
        <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
          {message.text}
          {message.streaming && (
            <span className="inline-block w-1.5 h-3.5 bg-zinc-400 rounded-sm ml-1 animate-pulse" />
          )}
        </p>
        {message.structured?.type === 'dcf' && (
          <DCFResultCard data={message.structured as unknown as DCFResultData} />
        )}
      </div>
    </div>
  );
}
