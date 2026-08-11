'use client';
import { useMemo } from 'react';
import { useDashboardStore, selectActiveFilterCount, selectFilteredResponses } from '@/lib/store';
import PageHeader from '@/components/ui/PageHeader';
import CategoryCard from '@/components/cards/CategoryCard';
import EmptyState from '@/components/ui/EmptyState';
import { Layers } from 'lucide-react';
import type { Severity } from '@/lib/types';
import { countRespondents } from '@/lib/responseStats';
import { filterThemesForResponses } from '@/lib/themeFiltering';

function deriveSeverity(score: number, negativePct: number): Severity {
  if (score < 40 || negativePct > 50) return 'Critical';
  if (score < 55 || negativePct > 35) return 'High';
  if (score < 70 || negativePct > 20) return 'Medium';
  return 'Low';
}

export default function CategoriesPage() {
  const categories = useDashboardStore((s) => s.categories);
  const questions   = useDashboardStore((s) => s.questions);
  const responses   = useDashboardStore(selectFilteredResponses);
  const storedThemes = useDashboardStore((s) => s.themes);
  const filtersActive = useDashboardStore(selectActiveFilterCount) > 0;
  const themes = useMemo(
    () => filterThemesForResponses(storedThemes, responses, filtersActive),
    [storedThemes, responses, filtersActive],
  );

  if (!categories.length) {
    return (
      <div className="px-4 md:px-6 lg:px-8 py-8">
        <PageHeader title="Categories" sub="Group questions into meaningful analysis areas" />
        <EmptyState icon={Layers} title="No categories yet" description="Upload an Excel file or load demo data to get started." />
      </div>
    );
  }

  const categoriesWithStats = categories.map((cat) => {
    const catQuestions = questions.filter((q) => q.categoryId === cat.id);
    const catResponses = responses.filter((r) => catQuestions.some((q) => q.id === r.questionId));
    const ratingResponses = catResponses.filter((r) => r.normalizedScore !== null);

    const avgScore = ratingResponses.length > 0
      ? Math.round(ratingResponses.reduce((s, r) => s + (r.normalizedScore ?? 0), 0) / ratingResponses.length)
      : null;

    const negativePct = ratingResponses.length > 0
      ? Math.round((ratingResponses.filter((r) => (r.normalizedScore ?? 100) < 40).length / ratingResponses.length) * 100)
      : null;

    const catThemes = themes.filter((t) => t.categoryId === cat.id);

    return {
      category: cat,
      avgScore,
      questionCount: catQuestions.length,
      respondentCount: countRespondents(catResponses),
      negativePct,
      severity: avgScore !== null && negativePct !== null
        ? deriveSeverity(avgScore, negativePct)
        : null,
      topThemes: catThemes.map((t) => t.label),
    };
  });

  // Sort: worst first
  const sorted = [...categoriesWithStats].sort((a, b) => {
    if (a.avgScore === null) return b.avgScore === null ? 0 : 1;
    if (b.avgScore === null) return -1;
    return a.avgScore - b.avgScore;
  });

  return (
    <div className="mx-auto w-full max-w-[1680px] px-4 md:px-6 lg:px-8 py-8">
      <PageHeader
        title="Categories"
        sub={`${categories.length} categories · ${questions.length} questions`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {sorted.map((item) => (
          <CategoryCard key={item.category.id} {...item} />
        ))}
      </div>
    </div>
  );
}
