import { LayoutDashboard, ArrowUpDown, TrendingUp, Search, Link } from 'lucide-react';
import { cn } from '../lib/utils';
import { Tab } from './Sidebar';

type DotStatus = 'connected' | 'error' | 'disconnected';

const NAV_ITEMS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',     label: 'Overview',     icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ArrowUpDown },
  { id: 'performance',  label: 'Performance',  icon: TrendingUp },
  { id: 'research',     label: 'Research',     icon: Search },
  { id: 'connections',  label: 'Connections',  icon: Link },
];

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  connectionStatus: DotStatus;
}

export default function MobileBottomNav({ activeTab, onTabChange, connectionStatus }: Props) {
  const dotColorClass =
    connectionStatus === 'connected' ? 'bg-emerald-500' :
    connectionStatus === 'error'     ? 'bg-amber-500' :
                                       'bg-zinc-600';

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-900 border-t border-zinc-800 flex items-center justify-around z-20">
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const isActive = activeTab === id;
        const isConnections = id === 'connections';
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={cn(
              'flex flex-col items-center gap-1 px-2 py-1.5 transition-colors',
              isActive ? 'text-violet-400' : 'text-zinc-500',
            )}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {isConnections && (
                <span className={cn('absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-zinc-900', dotColorClass)} />
              )}
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
