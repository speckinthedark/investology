import { Persona } from '../../types';
import { Holding } from '../../types';
import { cn } from '../../lib/utils';
import PortfolioRiskReport from '../agent/PortfolioRiskReport';
import AgentChat from '../agent/AgentChat';

const PERSONAS: { id: Persona; label: string }[] = [
  { id: 'buffett', label: 'Buffett / Munger' },
  { id: 'lynch',   label: 'Peter Lynch' },
];

interface Props {
  uid: string;
  holdings: Holding[];
  cashBalance: number;
  selectedPersona: Persona;
  onPersonaChange: (p: Persona) => void;
}

export default function InsightsTab({ uid, holdings, cashBalance, selectedPersona, onPersonaChange }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {/* Persona selector */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mr-2">Analysis lens</span>
        {PERSONAS.map((p) => (
          <button
            key={p.id}
            onClick={() => onPersonaChange(p.id)}
            className={cn(
              'px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border',
              selectedPersona === p.id
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-white',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <PortfolioRiskReport
        uid={uid}
        holdings={holdings}
        cashBalance={cashBalance}
        persona={selectedPersona}
      />

      <AgentChat
        uid={uid}
        holdings={holdings}
        cashBalance={cashBalance}
        persona={selectedPersona}
      />
    </div>
  );
}
