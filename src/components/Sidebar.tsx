import { LayoutDashboard, ArrowUpDown, TrendingUp, BrainCircuit, LogOut, RefreshCw } from 'lucide-react';
import { User } from 'firebase/auth';
import { cn } from '../lib/utils';

type Tab = 'overview' | 'transactions' | 'performance' | 'deep-dive';

const NAV_ITEMS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',      label: 'Overview',     icon: LayoutDashboard },
  { id: 'transactions',  label: 'Transactions', icon: ArrowUpDown },
  { id: 'performance',   label: 'Performance',  icon: TrendingUp },
  { id: 'deep-dive',     label: 'Deep Dive',    icon: BrainCircuit },
];

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onLogout: () => void;
  user: User;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export default function Sidebar({ activeTab, onTabChange, onLogout, user, isRefreshing, onRefresh }: Props) {
  const initials = (user.email ?? user.displayName ?? '?')
    .split(/[@.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

  const email = user.email ?? user.displayName ?? '';

  return (
    <div
      className={cn(
        'group fixed left-0 top-0 h-full z-20',
        'bg-zinc-900 border-r border-zinc-800',
        'flex flex-col',
        'w-16 hover:w-[220px]',
        'transition-[width] duration-200 ease-in-out',
        'overflow-hidden',
      )}
    >
      {/* Logo block */}
      <div className="h-14 flex items-center px-4 shrink-0 gap-3 border-b border-zinc-800">
        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0">
          <span className="text-zinc-900 font-black text-xs">IN</span>
        </div>
        <span
          className={cn(
            'font-black text-sm tracking-tighter uppercase italic text-white',
            'opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap',
          )}
        >
          Investology
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 flex flex-col gap-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              style={isActive ? { boxShadow: 'inset 3px 0 0 #a78bfa' } : undefined}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 w-full text-left transition-all',
                isActive
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300',
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span
                className={cn(
                  'text-[11px] font-bold uppercase tracking-widest whitespace-nowrap',
                  'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Bottom controls */}
      <div className="py-3 border-t border-zinc-800 flex flex-col gap-1">
        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh prices"
          className="flex items-center gap-3 px-4 py-2.5 w-full text-left text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300 transition-all disabled:opacity-40"
        >
          <RefreshCw className={cn('w-5 h-5 shrink-0', isRefreshing && 'animate-spin')} />
          <span
            className={cn(
              'text-[11px] font-bold uppercase tracking-widest whitespace-nowrap',
              'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
            )}
          >
            Refresh Prices
          </span>
        </button>

        {/* User avatar */}
        <div className="flex items-center gap-3 px-4 py-2.5">
          <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[8px] font-black text-zinc-300 shrink-0 select-none">
            {initials}
          </div>
          <span
            className={cn(
              'text-[11px] text-zinc-400 whitespace-nowrap truncate max-w-[140px]',
              'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
            )}
          >
            {email}
          </span>
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-4 py-2.5 w-full text-left text-zinc-500 hover:bg-zinc-800/50 hover:text-rose-400 transition-all"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          <span
            className={cn(
              'text-[11px] font-bold uppercase tracking-widest whitespace-nowrap',
              'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
            )}
          >
            Sign out
          </span>
        </button>
      </div>
    </div>
  );
}
