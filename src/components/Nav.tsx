import { User } from 'firebase/auth';
import { TrendingUp, RefreshCw, LogOut } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  user: User;
  isRefreshing: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}

export default function Nav({ user, isRefreshing, onRefresh, onLogout }: Props) {
  return (
    <nav className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-zinc-900" />
          </div>
          <span className="font-black text-xl tracking-tighter uppercase italic text-white">StockPulse</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh prices"
            className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-full transition-colors disabled:opacity-40"
          >
            <RefreshCw className={cn('w-5 h-5', isRefreshing && 'animate-spin')} />
          </button>

          <div className="h-6 w-px bg-zinc-700" />

          <img
            src={user.photoURL || ''}
            alt={user.displayName || 'User'}
            className="w-8 h-8 rounded-full border-2 border-zinc-700"
          />

          <button
            onClick={onLogout}
            title="Log out"
            className="p-2 hover:bg-rose-950/60 text-zinc-500 hover:text-rose-400 rounded-full transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </nav>
  );
}
