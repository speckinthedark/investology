import { StockDetail } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  detail: StockDetail;
}

function fmtLarge(n: number | null): string {
  if (n === null || n === undefined) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtNum(n: number | null): string {
  if (n === null || n === undefined) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9)  return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3)  return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtPct(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

function fmtRatio(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(1)}x`;
}

function Row({ label, value, color }: { label: string; value: string; color?: 'green' | 'red' | 'muted' }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center px-3 py-2 border-b border-zinc-800/50 last:border-b-0">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className={cn(
        'text-[11px] font-bold text-right',
        color === 'green' ? 'text-emerald-400' :
        color === 'red'   ? 'text-rose-400' :
        color === 'muted' ? 'text-zinc-500 font-normal' :
        'text-zinc-200',
      )}>
        {value}
      </span>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 py-2 bg-zinc-800/60 border-b border-zinc-800">
      <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>
    </div>
  );
}

export default function StockStatsTable({ detail }: Props) {
  const pctPositive = (n: number | null) => n !== null && n > 0 ? 'green' : n !== null && n < 0 ? 'red' : undefined;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <SectionHeader label="Trading Snapshot" />
      <Row label="Market Cap"  value={fmtLarge(detail.marketCap)} />
      <Row label="Volume"      value={fmtNum(detail.volume)} />
      <Row label="Avg. Volume" value={fmtNum(detail.averageVolume)} color="muted" />
      <Row label="52W High"    value={detail.fiftyTwoWeekHigh !== null ? `$${detail.fiftyTwoWeekHigh.toFixed(2)}` : '—'} color={detail.fiftyTwoWeekHigh !== null ? 'green' : undefined} />
      <Row label="52W Low"     value={detail.fiftyTwoWeekLow  !== null ? `$${detail.fiftyTwoWeekLow.toFixed(2)}`  : '—'} color={detail.fiftyTwoWeekLow  !== null ? 'red'   : undefined} />
      <Row label="Beta"        value={detail.beta !== null ? detail.beta.toFixed(2) : '—'} />

      <SectionHeader label="Fundamentals" />
      <Row label="P/E (TTM)"     value={fmtRatio(detail.trailingPE)} />
      <Row label="Forward P/E"   value={fmtRatio(detail.forwardPE)} />
      <Row label="EPS (TTM)"     value={detail.trailingEps !== null ? `$${detail.trailingEps.toFixed(2)}` : '—'} />
      <Row label="Profit Margin" value={fmtPct(detail.profitMargins)} color={pctPositive(detail.profitMargins)} />
      <Row label="Div. Yield"    value={detail.dividendYield !== null ? fmtPct(detail.dividendYield) : '—'} color="muted" />

      <SectionHeader label="Company" />
      <Row label="Industry"   value={detail.industry || '—'} />
      <Row label="Employees"  value={detail.fullTimeEmployees ? detail.fullTimeEmployees.toLocaleString() : '—'} />
      <Row label="ROE"        value={fmtPct(detail.returnOnEquity)} color={pctPositive(detail.returnOnEquity)} />
      <Row label="Free Cash Flow"  value={fmtLarge(detail.freeCashflow)} color={pctPositive(detail.freeCashflow)} />
      <Row label="Op. Margin" value={fmtPct(detail.operatingMargins)} color={pctPositive(detail.operatingMargins)} />
      <Row label="Website"    value={detail.website ? detail.website.replace(/^https?:\/\//, '') : '—'} color="muted" />
    </div>
  );
}
