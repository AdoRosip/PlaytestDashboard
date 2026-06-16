'use client';
import { useState } from 'react';
import { Plus, Check } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import { questionTypeLabel } from '@/lib/utils';
import { isRatingType } from '@/lib/scoring';
import type { Question, QuestionType } from '@/lib/types';

const QUESTION_TYPES: QuestionType[] = [
  'rating_1_5', 'rating_1_10', 'yes_no', 'multiple_choice',
  'free_text', 'file_upload', 'timestamp', 'internal_admin', 'unknown',
];

// Per-question type + scoring-direction controls. Editing recomputes scores and
// tester quality in the store.
function QuestionMetaControls({ q }: { q: Question }) {
  const updateQuestion = useDashboardStore((s) => s.updateQuestion);
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <select
        value={q.type}
        onChange={(e) => updateQuestion(q.id, { type: e.target.value as QuestionType })}
        className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500/60 cursor-pointer"
        title="Question type — controls whether answers feed rating scores"
      >
        {QUESTION_TYPES.map((t) => (
          <option key={t} value={t}>{questionTypeLabel(t)}</option>
        ))}
      </select>
      {isRatingType(q.type) && (
        <button
          onClick={() => updateQuestion(q.id, { isInverseScored: !q.isInverseScored })}
          title="Inverse scoring: when on, a higher answer counts as worse (e.g. 'how frustrated were you?')"
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
            q.isInverseScored
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
          }`}
        >
          {q.isInverseScored ? '↓ Inverted' : '↑ Normal'}
        </button>
      )}
    </div>
  );
}

export default function CategoryBuilderPage() {
  const questions  = useDashboardStore((s) => s.questions);
  const categories = useDashboardStore((s) => s.categories);
  const assignQuestionToCategory = useDashboardStore((s) => s.assignQuestionToCategory);
  const addCategory = useDashboardStore((s) => s.addCategory);

  const [newCatName, setNewCatName] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  const handleAssign = (questionId: string, categoryId: string) => {
    assignQuestionToCategory(questionId, categoryId === 'none' ? null : categoryId);
    setSaved(questionId);
    setTimeout(() => setSaved(null), 1200);
  };

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    addCategory(newCatName.trim());
    setNewCatName('');
  };

  const unassigned = questions.filter((q) => !q.categoryId);
  const assigned   = questions.filter((q) => q.categoryId);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 lg:px-8 py-8">
      <PageHeader
        title="Category Builder"
        sub="Assign questions to categories for structured analysis"
        actions={
          <div className="text-xs text-slate-400">
            {assigned.length}/{questions.length} questions assigned
          </div>
        }
      />

      {/* Add category */}
      <div className="flex items-center gap-3 mb-8 p-4 rounded-xl border border-slate-700/60 bg-slate-800/20">
        <Plus className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="New category name…"
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
          className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 focus:outline-none"
        />
        <button
          onClick={handleAddCategory}
          disabled={!newCatName.trim()}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
        >
          Add category
        </button>
      </div>

      {/* Unassigned questions */}
      {unassigned.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-white">Unassigned Questions</h2>
            <Badge label={String(unassigned.length)} variant="neutral" />
          </div>
          <div className="space-y-2">
            {unassigned.map((q) => (
              <div key={q.id} className="flex items-center gap-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{q.text}</p>
                </div>
                <QuestionMetaControls q={q} />
                <div className="flex items-center gap-2 flex-shrink-0">
                  <select
                    defaultValue="none"
                    onChange={(e) => handleAssign(q.id, e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500/60 cursor-pointer"
                  >
                    <option value="none">Assign to category…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {saved === q.id && (
                    <Check className="w-4 h-4 text-green-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assigned questions grouped by category */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">Assigned Questions by Category</h2>
        <div className="space-y-4">
          {categories.map((cat) => {
            const catQs = assigned.filter((q) => q.categoryId === cat.id);
            if (!catQs.length) return null;
            return (
              <div key={cat.id} className="rounded-xl border border-slate-700/60 bg-slate-800/20 overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3 border-b border-slate-700/60 bg-slate-800/40">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span className="text-sm font-medium text-white">{cat.name}</span>
                  <Badge label={String(catQs.length)} variant="neutral" className="ml-auto" />
                </div>
                <div className="divide-y divide-slate-700/30">
                  {catQs.map((q) => (
                    <div key={q.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-300 truncate">{q.text}</p>
                      </div>
                      <QuestionMetaControls q={q} />
                      <select
                        value={q.categoryId ?? 'none'}
                        onChange={(e) => handleAssign(q.id, e.target.value)}
                        className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500/60 cursor-pointer flex-shrink-0"
                      >
                        <option value="none">Unassign</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      {saved === q.id && (
                        <Check className="w-4 h-4 text-green-400" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
