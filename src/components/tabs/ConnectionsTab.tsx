import { useEffect, useState } from 'react';
import { Loader2, Link, Unplug, RefreshCw, Plus } from 'lucide-react';
import { SnaptradeAccount } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  credentials: { snaptradeUserId: string; userSecret: string } | null;
  accounts: SnaptradeAccount[];
  lastSyncedAt: string | null;
  isSyncing: boolean;
  syncError: boolean;
  onRegister: () => Promise<void>;
  onGetConnectUrl: () => Promise<string>;
  onRefreshAccounts: () => Promise<void>;
  onSync: () => Promise<void>;
  onDisconnect: (accountId: string) => Promise<void>;
  onShowCsvImport: () => void;
}

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function ConnectionsTab({
  credentials, accounts, lastSyncedAt, isSyncing, syncError,
  onRegister, onGetConnectUrl, onRefreshAccounts, onSync, onDisconnect, onShowCsvImport,
}: Props) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  // Detect redirect back from SnapTrade portal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('snaptrade_auth') === 'success') {
      history.replaceState(null, '', window.location.pathname);
      onRefreshAccounts();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      if (!credentials) await onRegister();
      const url = await onGetConnectUrl();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // errors toasted inside hook
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    setDisconnectingId(accountId);
    try {
      await onDisconnect(accountId);
    } finally {
      setDisconnectingId(null);
    }
  };

  const isEmpty = accounts.length === 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Brokerage Connections</h1>
          {lastSyncedAt && !isEmpty && (
            <p className="text-[11px] text-zinc-500 mt-0.5">Last synced {fmtDatetime(lastSyncedAt)}</p>
          )}
          {syncError && (
            <p className="text-[11px] text-amber-400 mt-0.5">Last sync failed — try syncing again</p>
          )}
        </div>
        {!isEmpty && (
          <button
            onClick={onSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all"
          >
            {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {isSyncing ? 'Syncing…' : 'Sync Now'}
          </button>
        )}
      </div>

      {/* Empty state */}
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
            <Link className="w-6 h-6 text-zinc-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-300 mb-1">Connect your brokerages</p>
            <p className="text-xs text-zinc-500 max-w-xs">
              Link eToro or Interactive Brokers to automatically sync your transactions and holdings.
            </p>
          </div>
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all"
          >
            {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {isConnecting ? 'Opening…' : 'Connect Brokerage'}
          </button>
        </div>
      ) : (
        <>
          {/* Account list */}
          <div className="flex flex-col gap-3">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-black text-zinc-400 shrink-0 uppercase">
                    {account.brokerage.slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-200">{account.brokerage}</p>
                    <p className="text-[11px] text-zinc-500">{account.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Connected
                  </span>
                  <button
                    onClick={() => handleDisconnect(account.id)}
                    disabled={disconnectingId === account.id}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 border border-zinc-700 text-zinc-500 hover:text-rose-400 hover:border-rose-800 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all',
                      disconnectingId === account.id && 'opacity-40',
                    )}
                  >
                    <Unplug className="w-3 h-3" />
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add brokerage */}
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="flex items-center justify-center gap-2 w-full border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-500 hover:text-zinc-300 rounded-xl py-3.5 text-[11px] font-bold uppercase tracking-widest transition-all"
          >
            {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {isConnecting ? 'Opening…' : 'Add Brokerage'}
          </button>
        </>
      )}

      {/* CSV fallback */}
      <div className="border-t border-zinc-800 pt-4 text-center">
        <button
          onClick={onShowCsvImport}
          className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Or import from a StockPulse CSV backup
        </button>
      </div>
    </div>
  );
}
