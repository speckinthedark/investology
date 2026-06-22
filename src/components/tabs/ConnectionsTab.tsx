import { useState } from 'react';
import { Loader2, Link, Unplug, RefreshCw, Plus, KeyRound, Pencil } from 'lucide-react';
import { SnaptradeAccount } from '../../types';
import { cn } from '../../lib/utils';
import ConfirmDialog from '../ConfirmDialog';

interface Props {
  credentials: { clientId: string; consumerKey: string; snaptradeUserId: string; userSecret: string } | null;
  accounts: SnaptradeAccount[];
  lastSyncedAt: string | null;
  isSyncing: boolean;
  syncError: boolean;
  onRegister: (clientId: string, consumerKey: string) => Promise<void>;
  onGetConnectUrl: () => Promise<string>;
  onSync: () => Promise<void>;
  onDisconnect: (accountId: string) => Promise<void>;
  onClearApiKeys: () => Promise<void>;
  onShowCsvImport: () => void;
}

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function ConnectionsTab({
  credentials, accounts, lastSyncedAt, isSyncing, syncError,
  onRegister, onGetConnectUrl, onSync, onDisconnect, onClearApiKeys, onShowCsvImport,
}: Props) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [showEditConfirm, setShowEditConfirm] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
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

  if (!credentials) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
        <SnapTradeKeysForm onRegister={onRegister} onConnect={handleConnect} />
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
          <button
            onClick={() => setShowEditConfirm(true)}
            className="flex items-center gap-1 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors mt-1"
          >
            <Pencil className="w-3 h-3" />
            Using your own SnapTrade keys · Edit
          </button>
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

      {showEditConfirm && (
        <ConfirmDialog
          message="Switching SnapTrade keys will disconnect any brokerage accounts linked under your current keys — they're tied to the SnapTrade developer account that created them. You'll need to reconnect after entering new keys."
          onConfirm={async () => {
            setShowEditConfirm(false);
            await onClearApiKeys();
          }}
          onCancel={() => setShowEditConfirm(false)}
        />
      )}
    </div>
  );
}

function SnapTradeKeysForm({
  onRegister, onConnect,
}: {
  onRegister: (clientId: string, consumerKey: string) => Promise<void>;
  onConnect: () => Promise<void>;
}) {
  const [clientId, setClientId] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!clientId.trim() || !consumerKey.trim()) return;
    setIsSubmitting(true);
    try {
      await onRegister(clientId.trim(), consumerKey.trim());
      await onConnect();
    } catch {
      // errors toasted inside hook
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
          <KeyRound className="w-4 h-4 text-zinc-500" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">SnapTrade API Keys</h2>
          <p className="text-[11px] text-zinc-500">Bring your own keys for an independent connection quota</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="YOUR-APP-NAME"
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-600"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Consumer Key</label>
          <input
            type="password"
            value={consumerKey}
            onChange={(e) => setConsumerKey(e.target.value)}
            placeholder="••••••••••••••••"
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-600"
          />
        </div>
      </div>

      <p className="text-[11px] text-zinc-500 leading-relaxed">
        Get free API keys from your{' '}
        <a
          href="https://dashboard.snaptrade.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-400 hover:text-violet-300 underline"
        >
          SnapTrade developer dashboard
        </a>
        . Using your own keys means your brokerage connections count against your own free-tier limit, not a shared one.
      </p>

      <button
        onClick={handleSubmit}
        disabled={isSubmitting || !clientId.trim() || !consumerKey.trim()}
        className="flex items-center justify-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all"
      >
        {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        {isSubmitting ? 'Connecting…' : 'Save & Connect'}
      </button>
    </div>
  );
}
