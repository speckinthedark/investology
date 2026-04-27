import { User } from 'firebase/auth';
import { RefreshCw, LogOut } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  user: User;
  isRefreshing: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}

export default function Topbar({ user, isRefreshing, onRefresh, onLogout }: Props) {
  const initials = (user.email ?? user.displayName ?? '?')
    .split(/[@.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

  return (
    <div className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center justify-end px-6 gap-3 shrink-0">
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        title="Refresh prices"
        className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-full transition-colors disabled:opacity-40"
      >
        <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
      </button>

      <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-[11px] font-black text-zinc-300 select-none">
        {initials}
      </div>

      <button
        onClick={onLogout}
        title="Log out"
        className="p-2 hover:bg-rose-950/60 text-zinc-500 hover:text-rose-400 rounded-full transition-colors"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
}
