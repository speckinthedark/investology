import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Plus, X } from 'lucide-react';
import { EarningsStory, EarningsMetric, SaveStoryInput } from '../../types';

interface Props {
  ticker: string;
  editingStory?: EarningsStory;
  onSave: (story: SaveStoryInput) => Promise<void>;
  onClose: () => void;
}

function emptyMetric(): EarningsMetric {
  return { id: crypto.randomUUID(), metric: '', baseline: '', whatToWatch: '', why: '' };
}

export default function StoryEditor({ ticker, editingStory, onSave, onClose }: Props) {
  const [title, setTitle] = useState(editingStory?.title ?? '');
  const [question, setQuestion] = useState(editingStory?.question ?? '');
  const [metrics, setMetrics] = useState<EarningsMetric[]>(editingStory?.metrics ?? [emptyMetric()]);
  const [saving, setSaving] = useState(false);

  const isValid = title.trim().length > 0 && question.trim().length > 0;

  const updateMetric = (id: string, field: keyof Omit<EarningsMetric, 'id'>, value: string) => {
    setMetrics((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const addMetricRow = () => setMetrics((prev) => [...prev, emptyMetric()]);
  const removeMetricRow = (id: string) => setMetrics((prev) => prev.filter((m) => m.id !== id));

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await onSave({
        id: editingStory?.id,
        ticker,
        title: title.trim(),
        question: question.trim(),
        metrics: metrics.filter((m) => m.metric.trim().length > 0),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={saving ? undefined : onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 sm:p-8 max-w-lg w-full shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-xl font-bold mb-1 text-white">{editingStory ? 'Edit Story' : 'New Story'}</h3>
          <p className="text-xs text-zinc-500 mb-6">{ticker}</p>

          <div className="flex flex-col gap-4 mb-6">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. AI Capex"
                autoFocus
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Question</label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Is the AI capex creating capturable value or leaking out to advertisers and chipmakers?"
                rows={2}
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Metrics to Watch</label>
            <button
              onClick={addMetricRow}
              className="flex items-center gap-1 text-xs font-bold text-zinc-400 hover:text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Metric
            </button>
          </div>

          <div className="flex flex-col gap-4 mb-6">
            {metrics.map((m) => (
              <div key={m.id} className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 relative">
                <button
                  onClick={() => removeMetricRow(m.id)}
                  className="absolute top-3 right-3 text-zinc-600 hover:text-rose-400 transition-colors"
                  title="Remove metric"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex flex-col gap-2.5 pr-6">
                  <input
                    type="text"
                    value={m.metric}
                    onChange={(e) => updateMetric(m.id, 'metric', e.target.value)}
                    placeholder="Metric (e.g. Capex as % of revenue)"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors"
                  />
                  <input
                    type="text"
                    value={m.baseline}
                    onChange={(e) => updateMetric(m.id, 'baseline', e.target.value)}
                    placeholder="Baseline (last known value)"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors"
                  />
                  <input
                    type="text"
                    value={m.whatToWatch}
                    onChange={(e) => updateMetric(m.id, 'whatToWatch', e.target.value)}
                    placeholder="What to watch"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors"
                  />
                  <input
                    type="text"
                    value={m.why}
                    onChange={(e) => updateMetric(m.id, 'why', e.target.value)}
                    placeholder="Why it matters"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-3 rounded-xl font-bold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isValid || saving}
              className="flex-1 py-3 rounded-xl font-bold bg-white text-zinc-900 hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Story'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
