import { Plus, ShieldAlert, MessageSquare } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ChatSession } from '../../types';

interface Props {
  sessions: ChatSession[];
  activeView: string;
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
        aria-current={activeView === 'report' ? 'page' : undefined}
        className={cn(
          'flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-left transition-all border',
          activeView === 'report'
            ? 'bg-violet-950/60 border-violet-700/60 text-white'
            : 'bg-transparent border-zinc-800 hover:bg-zinc-800/60 hover:border-zinc-700 text-zinc-300',
        )}
      >
        <ShieldAlert className={cn('w-4 h-4 flex-shrink-0', activeView === 'report' ? 'text-violet-400' : 'text-zinc-500')} />
        <div className="min-w-0 flex-1">
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
          disabled={isCreating}
          aria-current={activeView === s.id ? 'page' : undefined}
          className={cn(
            'flex items-start gap-2.5 w-full px-3 py-2.5 rounded-xl text-left transition-all border disabled:opacity-40 disabled:cursor-not-allowed',
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
