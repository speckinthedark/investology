import { BrainCircuit, RefreshCw } from 'lucide-react';
import { Persona } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  insights: string;
  isLoading: boolean;
  selectedPersona: Persona;
  onPersonaChange: (p: Persona) => void;
  onRefresh: () => void;
}

const PERSONAS: { id: Persona; label: string; description: string }[] = [
  {
    id: 'buffett',
    label: 'Buffett / Munger',
    description: 'Focuses on competitive moats, intrinsic value, and margin of safety.',
  },
  {
    id: 'lynch',
    label: 'Peter Lynch',
    description: 'Focuses on growth at a reasonable price, PEG ratios, and ten-baggers.',
  },
];

export default function InsightsTab({ insights, isLoading, selectedPersona, onPersonaChange, onRefresh }: Props) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 shadow-xl min-h-[500px] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-900/40 flex items-center justify-center shrink-0">
            <BrainCircuit className="w-5 h-5 text-blue-400" />
          </div>
          <span className="text-sm font-bold uppercase tracking-widest text-blue-400">AI Portfolio Deep-Dive</span>
        </div>

        <div className="flex items-center gap-2">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => onPersonaChange(p.id)}
              className={cn(
                'px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border',
                selectedPersona === p.id
                  ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-900/50'
                  : 'bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:bg-zinc-800 hover:text-white'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Persona description */}
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">
            Lens: {PERSONAS.find((p) => p.id === selectedPersona)?.label}
          </div>
          <p className="text-zinc-400 text-sm max-w-lg">
            {PERSONAS.find((p) => p.id === selectedPersona)?.description}
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-5 py-2.5 bg-white text-zinc-900 hover:bg-zinc-100 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-xl disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Insights */}
      <div className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-6 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center gap-3 text-zinc-500">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm italic">Analyzing your portfolio…</span>
          </div>
        ) : (
          <p className="text-lg leading-relaxed font-light italic text-zinc-300">
            "{insights || 'Add some holdings and hit Refresh to get your personalized analysis.'}"
          </p>
        )}
      </div>
    </div>
  );
}
