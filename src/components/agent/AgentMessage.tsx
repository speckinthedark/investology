import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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

interface Props {
  message: ChatMessage;
}

export default function AgentMessage({ message }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-white text-zinc-900 rounded-lg rounded-tr-sm px-4 py-3 text-sm font-medium">
          {message.text}
        </div>
      </div>
    );
  }

  const agentKey = message.agent ?? 'orchestrator';
  const label = AGENT_LABELS[agentKey] ?? agentKey;
  const colorClass = AGENT_COLORS[agentKey] ?? AGENT_COLORS.orchestrator;

  const displayText = message.text.replace(/---DCF_RESULT---[\s\S]*?---END_DCF_RESULT---/g, '').trim();

  return (
    <div className="flex flex-col gap-1.5">
      <span className={cn('text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full w-fit', colorClass)}>
        {label}
      </span>
      <div className="max-w-[90%] bg-zinc-800/60 border border-zinc-700/50 rounded-lg rounded-tl-sm px-4 py-3">
        <div className="text-sm text-zinc-300 leading-relaxed prose-agent">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
              em: ({ children }) => <em className="text-zinc-200">{children}</em>,
              ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
              li: ({ children }) => <li className="text-zinc-300">{children}</li>,
              table: ({ children }) => (
                <div className="overflow-x-auto mb-2">
                  <table className="w-full text-xs border-collapse">{children}</table>
                </div>
              ),
              thead: ({ children }) => <thead className="border-b border-zinc-600">{children}</thead>,
              tbody: ({ children }) => <tbody>{children}</tbody>,
              tr: ({ children }) => <tr className="border-b border-zinc-700/50">{children}</tr>,
              th: ({ children }) => <th className="text-left px-3 py-1.5 text-zinc-400 font-semibold">{children}</th>,
              td: ({ children }) => <td className="px-3 py-1.5 text-zinc-300">{children}</td>,
              code: ({ children }) => <code className="bg-zinc-700/60 px-1 py-0.5 rounded text-xs font-mono text-emerald-300">{children}</code>,
              h1: ({ children }) => <h1 className="text-base font-bold text-white mb-1">{children}</h1>,
              h2: ({ children }) => <h2 className="text-sm font-bold text-white mb-1">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-semibold text-zinc-200 mb-1">{children}</h3>,
            }}
          >
            {displayText}
          </ReactMarkdown>
          {message.streaming && (
            <span className="inline-block w-1.5 h-3.5 bg-zinc-400 rounded-sm ml-1 animate-pulse align-middle" />
          )}
        </div>
        {message.structured?.type === 'dcf' && (
          <DCFResultCard data={message.structured as unknown as DCFResultData} />
        )}
      </div>
    </div>
  );
}
