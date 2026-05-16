import { SnaptradeAccount } from '../../types';

interface Props {
  accounts: SnaptradeAccount[];
  lastSyncedAt: string | null;
  isSyncing: boolean;
  syncError: boolean;
  onNavigateToConnections: () => void;
}

function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function SnaptradeStatusPill({
  accounts, lastSyncedAt, isSyncing, syncError, onNavigateToConnections,
}: Props) {
  const connected = accounts.length > 0;

  const dotColor = isSyncing
    ? 'bg-amber-400 animate-pulse'
    : syncError
    ? 'bg-amber-500'
    : connected
    ? 'bg-emerald-500'
    : 'bg-zinc-600';

  const brokerNames = [...new Set(accounts.map((a) => a.brokerage))].join(' · ');

  const label = isSyncing
    ? 'Syncing…'
    : syncError
    ? 'Sync error'
    : connected
    ? brokerNames
    : 'Not connected';

  const sublabel = connected && lastSyncedAt && !isSyncing && !syncError
    ? `· synced ${fmtRelative(lastSyncedAt)}`
    : null;

  return (
    <button
      onClick={onNavigateToConnections}
      className="flex items-center gap-2 bg-zinc-800/80 border border-zinc-700/60 hover:border-zinc-600 rounded-full px-3 py-1.5 transition-all"
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span className="text-[11px] font-semibold text-zinc-300 whitespace-nowrap">{label}</span>
      {sublabel && (
        <span className="text-[10px] text-zinc-500 whitespace-nowrap">{sublabel}</span>
      )}
    </button>
  );
}
