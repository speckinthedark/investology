import { useState, useRef, KeyboardEvent, ChangeEvent } from 'react';
import { Send } from 'lucide-react';
import { cn } from '../../lib/utils';

const AGENTS = [
  { mention: '@valuation', description: 'Valuation Agent — DCF analysis' },
  { mention: '@news', description: 'News & Sentiment Agent' },
];

interface Props {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function MentionInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('');
  const [showPopover, setShowPopover] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValue(v);
    // Show popover when user just typed @
    const lastAt = v.lastIndexOf('@');
    const textAfterAt = lastAt >= 0 ? v.slice(lastAt + 1) : '';
    setShowPopover(lastAt >= 0 && !textAfterAt.includes(' '));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') setShowPopover(false);
    if (e.key === 'Tab' && showPopover) {
      e.preventDefault();
      insertMention(AGENTS[0].mention);
    }
  };

  const insertMention = (mention: string) => {
    const lastAt = value.lastIndexOf('@');
    const newValue = value.slice(0, lastAt) + mention + ' ';
    setValue(newValue);
    setShowPopover(false);
    inputRef.current?.focus();
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    setShowPopover(false);
  };

  return (
    <div className="relative">
      {/* @mention popover */}
      {showPopover && (
        <div className="absolute bottom-full mb-2 left-0 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-xl z-10">
          {AGENTS.map((a) => (
            <button
              key={a.mention}
              onClick={() => insertMention(a.mention)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-700 transition-colors text-left"
            >
              <span className="text-xs font-black text-emerald-400">{a.mention}</span>
              <span className="text-[11px] text-zinc-400">{a.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-3 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 focus-within:border-zinc-500 transition-colors">
        <textarea
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Ask anything… or type @ to invoke a specialist agent"
          rows={1}
          className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 resize-none outline-none leading-relaxed max-h-32 overflow-y-auto"
          style={{ height: 'auto' }}
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = 'auto';
            t.style.height = `${t.scrollHeight}px`;
          }}
        />
        <button
          onClick={submit}
          disabled={!value.trim() || disabled}
          className="p-1.5 bg-white text-zinc-900 rounded-lg disabled:opacity-30 hover:bg-zinc-100 transition-colors shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[10px] text-zinc-700 mt-1.5 px-1">Enter to send · Shift+Enter for new line · Type @ to invoke an agent · Tab to autocomplete</p>
    </div>
  );
}
