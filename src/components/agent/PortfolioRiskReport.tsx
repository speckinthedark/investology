import { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, TrendingDown, Newspaper, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { streamAgent } from '../../hooks/useAgentStream';
import { Holding } from '../../types';

interface ConcentrationFlag {
  label: string;
  value: string;
  severity: 'high' | 'medium' | 'low';
}

interface NewsFlag {
  ticker: string;
  headline: string;
  sentiment: 'bearish' | 'neutral';
}

interface NotableSignal {
  ticker: string;
  signal: string;
}

export interface ReportData {
  portfolioHealth: { summary: string };
  concentrationFlags: { flags: ConcentrationFlag[] };
  newsRedFlags: { items: NewsFlag[] };
  notableSignals: { items: NotableSignal[] };
}

const SEVERITY_COLOR: Record<string, string> = {
  high: 'text-rose-400',
  medium: 'text-amber-400',
  low: 'text-zinc-400',
};

interface Props {
  uid: string;
  holdings: Holding[];
  stockPrices: Record<string, unknown>;
  cashBalance: number;
  initialReport: ReportData | null;
  initialGeneratedAt: Date | null;
  onReportGenerated: (data: ReportData) => void;
}

export default function PortfolioRiskReport({
  uid,
  holdings,
  stockPrices,
  cashBalance,
  initialReport,
  initialGeneratedAt,
  onReportGenerated,
}: Props) {
  const [report, setReport] = useState<ReportData | null>(initialReport);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(initialGeneratedAt);

  const runReport = async () => {
    if (holdings.length === 0) return;
    setLoading(true);
    setError(null);
    setReport(null);

    await streamAgent(
      '/api/agent/report',
      { uid, holdings, stockPrices, cashBalance },
      (event) => {
        if (event.error) { setError(event.error); return; }
        if (event.structured) {
          const data = event.structured as { type: string } & ReportData;
          if (data.type === 'report') {
            setReport(data);
            const now = new Date();
            setLastUpdated(now);
            onReportGenerated(data);
          }
        }
      },
      () => setLoading(false),
    );
  };

  // Auto-generate only when there is no cached report
  useEffect(() => {
    if (!initialReport && holdings.length > 0) {
      runReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReport]);

  return (
    <div className="bg-zinc-900 rounded-[32px] border border-zinc-800 p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold italic text-white">Portfolio Risk Report</h3>
          {lastUpdated && (
            <p className="text-[10px] text-zinc-600 mt-0.5">
              Updated {lastUpdated.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button
          onClick={runReport}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-40"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 text-zinc-500 py-8">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm italic">Analyzing your portfolio…</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-2 text-rose-400 text-sm py-4">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && !report && holdings.length === 0 && (
        <p className="text-sm text-zinc-600 italic">Add holdings to generate a risk report.</p>
      )}

      {/* Report sections */}
      {report && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Portfolio Health */}
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-5 md:col-span-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Portfolio Health</div>
            <p className="text-sm text-zinc-300 leading-relaxed">{report.portfolioHealth.summary}</p>
          </div>

          {/* Concentration Flags */}
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Concentration Flags</div>
            </div>
            {report.concentrationFlags.flags.length === 0 ? (
              <p className="text-xs text-zinc-600 italic">No concentration issues detected.</p>
            ) : (
              <div className="space-y-2">
                {report.concentrationFlags.flags.map((f, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">{f.label}</span>
                    <span className={cn('text-xs font-bold', SEVERITY_COLOR[f.severity])}>{f.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* News Red Flags */}
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Newspaper className="w-3.5 h-3.5 text-rose-400" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">News Red Flags</div>
            </div>
            {report.newsRedFlags.items.length === 0 ? (
              <p className="text-xs text-zinc-600 italic">No significant news flags.</p>
            ) : (
              <div className="space-y-2">
                {report.newsRedFlags.items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-[10px] font-black text-rose-400 shrink-0 mt-0.5">{item.ticker}</span>
                    <span className="text-xs text-zinc-400 leading-snug">{item.headline}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notable Signals */}
          {report.notableSignals.items.length > 0 && (
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-5 md:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-3.5 h-3.5 text-blue-400" />
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Notable Signals</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {report.notableSignals.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5">
                    <span className="text-[10px] font-black text-blue-400">{item.ticker}</span>
                    <span className="text-[11px] text-zinc-400">{item.signal}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
