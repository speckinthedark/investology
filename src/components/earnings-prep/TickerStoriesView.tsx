import { useState } from 'react';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { EarningsStory, SaveStoryInput } from '../../types';
import { compileTickerMarkdown } from '../../lib/earningsMarkdown';
import StoryEditor from './StoryEditor';
import ConfirmDialog from '../ConfirmDialog';

interface Props {
  ticker: string;
  stories: EarningsStory[];
  canAddStory: boolean;
  onSave: (story: SaveStoryInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onBack: () => void;
}

type View = 'edit' | 'markdown';

export default function TickerStoriesView({ ticker, stories, canAddStory, onSave, onDelete, onBack }: Props) {
  const [view, setView] = useState<View>('edit');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingStory, setEditingStory] = useState<EarningsStory | 'new' | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors w-fit"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Tickers
      </button>

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-white tracking-tight">{ticker}</h2>
        <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1">
          <button
            onClick={() => setView('edit')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${view === 'edit' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Edit
          </button>
          <button
            onClick={() => setView('markdown')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${view === 'markdown' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Markdown
          </button>
        </div>
      </div>

      {view === 'edit' ? (
        <div className="flex flex-col gap-3">
          {canAddStory && (
            <button
              onClick={() => setEditingStory('new')}
              className="flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors text-sm font-bold"
            >
              <Plus className="w-4 h-4" />
              Add Story
            </button>
          )}

          {stories.length === 0 && (
            <div className="text-center text-sm text-zinc-600 py-8">No stories yet for {ticker}.</div>
          )}

          {stories.map((story) => {
            const isExpanded = expandedId === story.id;
            return (
              <div key={story.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div
                  className="flex items-start justify-between gap-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : story.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white mb-1">{story.title}</div>
                    <div className="text-xs text-zinc-500 leading-relaxed">{story.question}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingStory(story); }}
                      className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="Edit story"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(story.id); }}
                      className="p-1.5 text-zinc-500 hover:text-rose-400 transition-colors"
                      title="Delete story"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-col gap-3">
                    {story.metrics.length === 0 ? (
                      <div className="text-xs text-zinc-600">No metrics added yet.</div>
                    ) : (
                      story.metrics.map((m) => (
                        <div key={m.id} className="bg-zinc-800/50 rounded-lg p-3">
                          <div className="text-sm font-bold text-zinc-200 mb-1.5">{m.metric}</div>
                          <div className="text-xs text-zinc-500 leading-relaxed space-y-0.5">
                            <div><span className="text-zinc-400 font-semibold">Baseline:</span> {m.baseline}</div>
                            <div><span className="text-zinc-400 font-semibold">What to watch:</span> {m.whatToWatch}</div>
                            <div><span className="text-zinc-400 font-semibold">Why:</span> {m.why}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="text-sm text-zinc-300 leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 className="text-2xl font-black text-white mb-4">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-bold text-white mt-6 mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mt-4 mb-2">{children}</h3>,
                p: ({ children }) => <p className="mb-2 last:mb-0 text-zinc-300">{children}</p>,
                strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                em: ({ children }) => <em className="text-zinc-500">{children}</em>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                li: ({ children }) => <li className="text-zinc-300">{children}</li>,
                hr: () => <hr className="border-zinc-800 my-6" />,
              }}
            >
              {compileTickerMarkdown(ticker, stories)}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {editingStory && (
        <StoryEditor
          ticker={ticker}
          editingStory={editingStory === 'new' ? undefined : editingStory}
          onSave={async (story) => { await onSave(story); setEditingStory(null); }}
          onClose={() => setEditingStory(null)}
        />
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          message="Delete this story? This cannot be undone."
          onConfirm={async () => { await onDelete(confirmDeleteId); setConfirmDeleteId(null); }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
