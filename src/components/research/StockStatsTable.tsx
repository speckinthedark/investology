import { StockDetail, StockInsights, InsightsOutlook, InsightsDirection } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  detail: StockDetail;
  insights?: StockInsights | null;
}

const DIRECTION_STYLE: Record<InsightsDirection, { badge: string; dot: string }> = {
  Bullish: { badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-500' },
  Bearish: { badge: 'text-rose-400 bg-rose-500/10 border-rose-500/30',          dot: 'bg-rose-500' },
  Neutral: { badge: 'text-zinc-400 bg-zinc-700/40 border-zinc-600/40',          dot: 'bg-zinc-500' },
};

function OutlookRow({ label, outlook }: { label: string; outlook: InsightsOutlook }) {
  const style = DIRECTION_STYLE[outlook.direction];
  const filled = Math.min(5, Math.max(0, Math.round(outlook.score)));
  return (
    <div className="grid grid-cols-[1fr_auto] items-center px-3 py-2 border-b border-zinc-800/50 last:border-b-0">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={cn('px-1.5 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest', style.badge)}>
          {outlook.direction}
        </span>
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={cn('w-1.5 h-1.5 rounded-full', i < filled ? style.dot : 'bg-zinc-700')} />
          ))}
        </div>
      </div>
    </div>
  );
}

function fmtPrice(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return `$${n.toFixed(2)}`;
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

function fmtRatio(n: number | null, decimals = 2): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(decimals)}x`;
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

export default function StockStatsTable({ detail, insights }: Props) {
  const pctPositive = (n: number | null) => n !== null && n > 0 ? 'green' : n !== null && n < 0 ? 'red' : undefined;

  const dayRange = (detail.dayLow !== null && detail.dayHigh !== null)
    ? `$${detail.dayLow.toFixed(2)} – $${detail.dayHigh.toFixed(2)}`
    : '—';

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <SectionHeader label="Trading Snapshot" />
      <Row label="Market Cap"        value={fmtLarge(detail.marketCap)} />
      <Row label="Volume"            value={fmtNum(detail.volume)} />
      <Row label="Avg. Volume"       value={fmtNum(detail.averageVolume)} color="muted" />
      <Row label="Day's Range"       value={dayRange} color="muted" />
      <Row label="52W High"          value={fmtPrice(detail.fiftyTwoWeekHigh)} color={detail.fiftyTwoWeekHigh !== null ? 'green' : undefined} />
      <Row label="52W Low"           value={fmtPrice(detail.fiftyTwoWeekLow)}  color={detail.fiftyTwoWeekLow  !== null ? 'red'   : undefined} />
      <Row label="50-Day Avg"        value={fmtPrice(detail.fiftyDayAverage)} />
      <Row label="200-Day Avg"       value={fmtPrice(detail.twoHundredDayAverage)} color="muted" />
      <Row label="Beta"              value={detail.beta !== null ? detail.beta.toFixed(2) : '—'} />
      <Row label="Shares Out."       value={fmtNum(detail.sharesOutstanding)} color="muted" />
      <Row label="Float"             value={fmtNum(detail.floatShares)} color="muted" />
      <Row label="Short Ratio"       value={detail.shortRatio !== null ? detail.shortRatio.toFixed(2) : '—'} />
      <Row label="Short % Float"     value={fmtPct(detail.shortPercentOfFloat)} />

      <SectionHeader label="Fundamentals" />
      <Row label="P/E (TTM)"         value={fmtRatio(detail.trailingPE)} />
      <Row label="Forward P/E"       value={fmtRatio(detail.forwardPE)} />
      <Row label="PEG Ratio (5yr)"   value={fmtRatio(detail.pegRatio)} />
      <Row label="P/S (TTM)"         value={fmtRatio(detail.priceToSalesTrailing12Months)} />
      <Row label="P/B"               value={fmtRatio(detail.priceToBook)} />
      <Row label="EPS (TTM)"         value={detail.trailingEps !== null ? `$${detail.trailingEps.toFixed(2)}` : '—'} />
      <Row label="Revenue (TTM)"     value={fmtLarge(detail.totalRevenue)} />
      <Row label="Rev. Growth (YoY)" value={fmtPct(detail.revenueGrowth)} color={pctPositive(detail.revenueGrowth)} />
      <Row label="EBITDA"            value={fmtLarge(detail.ebitda)} />
      <Row label="Profit Margin"     value={fmtPct(detail.profitMargins)} color={pctPositive(detail.profitMargins)} />
      <Row label="Div. Yield"        value={detail.dividendYield !== null ? fmtPct(detail.dividendYield) : '—'} color="muted" />

      <SectionHeader label="Company" />
      <Row label="Sector"            value={detail.sector || '—'} />
      <Row label="Industry"          value={detail.industry || '—'} />
      <Row label="Employees"         value={detail.fullTimeEmployees ? detail.fullTimeEmployees.toLocaleString() : '—'} />
      <Row label="ROE"               value={fmtPct(detail.returnOnEquity)} color={pctPositive(detail.returnOnEquity)} />
      <Row label="ROA"               value={fmtPct(detail.returnOnAssets)} color={pctPositive(detail.returnOnAssets)} />
      <Row label="Op. Margin"        value={fmtPct(detail.operatingMargins)} color={pctPositive(detail.operatingMargins)} />
      <Row label="Free Cash Flow"    value={fmtLarge(detail.freeCashflow)} color={pctPositive(detail.freeCashflow)} />
      <Row label="Total Debt"        value={fmtLarge(detail.totalDebt)} />
      <Row label="Debt / Equity"     value={detail.debtToEquity !== null ? fmtRatio(detail.debtToEquity / 100) : '—'} />
      <Row label="Current Ratio"     value={detail.currentRatio !== null ? detail.currentRatio.toFixed(2) : '—'} />
      <Row label="Quick Ratio"       value={detail.quickRatio !== null ? detail.quickRatio.toFixed(2) : '—'} />
      <Row label="Website"           value={detail.website ? detail.website.replace(/^https?:\/\//, '') : '—'} color="muted" />

      {insights?.technicalEvents && (
        <>
          <SectionHeader label="Technical Outlook" />
          <OutlookRow label="Short Term"   outlook={insights.technicalEvents.shortTermOutlook} />
          <OutlookRow label="Intermediate" outlook={insights.technicalEvents.intermediateTermOutlook} />
          <OutlookRow label="Long Term"    outlook={insights.technicalEvents.longTermOutlook} />
        </>
      )}

      {insights?.keyTechnicals && (
        <>
          <SectionHeader label="Key Technicals" />
          <Row label="Support"    value={insights.keyTechnicals.support    != null ? `$${insights.keyTechnicals.support.toFixed(2)}`    : '—'} color="green" />
          <Row label="Resistance" value={insights.keyTechnicals.resistance != null ? `$${insights.keyTechnicals.resistance.toFixed(2)}` : '—'} color="red" />
          <Row label="Stop Loss"  value={insights.keyTechnicals.stopLoss   != null ? `$${insights.keyTechnicals.stopLoss.toFixed(2)}`   : '—'} color="muted" />
        </>
      )}
    </div>
  );
}
