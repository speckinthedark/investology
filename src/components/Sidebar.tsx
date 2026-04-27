import { useState } from 'react';
import { LayoutDashboard, ArrowUpDown, TrendingUp, BrainCircuit, LogOut, RefreshCw, Search } from 'lucide-react';
import { User } from 'firebase/auth';
import { cn } from '../lib/utils';

type Tab = 'overview' | 'transactions' | 'performance' | 'deep-dive' | 'research';

const NAV_ITEMS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',     label: 'Overview',     icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ArrowUpDown },
  { id: 'performance',  label: 'Performance',  icon: TrendingUp },
  { id: 'research',     label: 'Research',     icon: Search },
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
  const [pinned, setPinned] = useState(false);

  const initials = (user.email ?? user.displayName ?? '?')
    .split(/[@.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

  const email = user.email ?? user.displayName ?? '';

  const handleTabChange = (tab: Tab) => {
    onTabChange(tab);
    setPinned(false);
  };

  const labelClass = cn(
    'text-[11px] font-bold uppercase tracking-widest whitespace-nowrap transition-opacity duration-150',
    pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
  );

  return (
    <div
      className={cn(
        'group fixed left-0 top-0 h-full z-20',
        'bg-zinc-900 border-r border-zinc-800',
        'flex flex-col',
        pinned ? 'w-[220px]' : 'w-16 hover:w-[220px]',
        'transition-[width] duration-200 ease-in-out',
        'overflow-hidden',
      )}
    >
      {/* Logo block — tap to pin/unpin on mobile */}
      <div
        className="h-14 flex items-center px-4 shrink-0 gap-3 border-b border-zinc-800 cursor-pointer select-none"
        onClick={() => setPinned((v) => !v)}
      >
        <img src="/logo.png" alt="Investology" className="w-8 h-8 shrink-0 rounded-xl object-contain" />
        <span
          className={cn(
            'font-black text-sm tracking-tighter uppercase italic text-white',
            pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            'transition-opacity duration-150 whitespace-nowrap',
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
              onClick={() => handleTabChange(id)}
              style={isActive ? { boxShadow: 'inset 3px 0 0 #a78bfa' } : undefined}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 w-full text-left transition-all',
                isActive
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300',
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className={labelClass}>{label}</span>
            </button>
          );
        })}

        {/* Deep Dive — coming soon, pinned at the bottom of the nav */}
        <div className="flex-1" />
        <div className="mx-3 mb-1 border-t border-zinc-800/60" />
        <button
          onClick={() => handleTabChange('deep-dive')}
          className={cn(
            'flex items-center gap-3 px-4 py-2.5 w-full text-left transition-all opacity-40 hover:opacity-60',
            activeTab === 'deep-dive' && 'bg-zinc-800/50',
          )}
        >
          <BrainCircuit className="w-5 h-5 shrink-0 text-zinc-500" />
          <div className={cn(
            'flex items-center gap-2 transition-opacity duration-150',
            pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}>
            <span className="text-[11px] font-bold uppercase tracking-widest whitespace-nowrap text-zinc-500">
              Deep Dive
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded-full">
              Soon
            </span>
          </div>
        </button>
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
          <span className={labelClass}>Refresh Prices</span>
        </button>

        {/* User avatar */}
        <div className="flex items-center gap-3 px-4 py-2.5">
          <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[8px] font-black text-zinc-300 shrink-0 select-none">
            {initials}
          </div>
          <span
            className={cn(
              'text-[11px] text-zinc-400 whitespace-nowrap truncate max-w-[140px]',
              pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              'transition-opacity duration-150',
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
          <span className={labelClass}>Sign out</span>
        </button>
      </div>
    </div>
  );
}
