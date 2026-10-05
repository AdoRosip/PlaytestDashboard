'use client';
import { Suspense } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import ReportLink from '@/components/layout/ReportLink';
import TesterProfile, { type ProfileTab } from '@/components/tester/TesterProfile';
import { selectFilteredTesters, selectFilteredResponses, selectGameConfig, useDashboardStore } from '@/lib/store';
import { getTesterDisplayName } from '@/lib/testerIdentity';
import { filterTesterList } from '@/lib/dossier';
import s from '@/components/tester/TesterProfile.module.css';

function TesterDetail() {
  const { testerId } = useParams<{ testerId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const tester = useDashboardStore(state => state.testers.find(t => t.id === testerId));
  const loaded = useDashboardStore(state => state.isLoaded);
  const testers = useDashboardStore(selectFilteredTesters);
  const responses = useDashboardStore(selectFilteredResponses);
  const questions = useDashboardStore(state => state.questions);
  const config = useDashboardStore(selectGameConfig);
  const targets = useDashboardStore(state => state.project?.steamMatchGenres);
  const visible = filterTesterList(testers, params.get('search') ?? '', params.get('filter') ?? 'all', responses, questions, config, targets);
  const index = visible.findIndex(t => t.id === testerId);
  const tab: ProfileTab = params.get('tab') === 'videos' ? 'videos' : 'answers';
  const listParams = new URLSearchParams(params.toString()); listParams.delete('tab');
  const backHref = `/testers${listParams.size ? `?${listParams}` : ''}`;
  const setTab = (next: ProfileTab) => {
    const query = new URLSearchParams(params.toString());
    if (next === 'videos') query.set('tab', next); else query.delete('tab');
    router.replace(`${pathname}${query.size ? `?${query}` : ''}`, { scroll: false });
  };
  return <div className={`${s.dossier} ${s.page}`}><div className={s.container}>
    <div className={s.topBar}><nav className={s.breadcrumb} aria-label="Breadcrumb"><ReportLink href={backHref}>Testers</ReportLink><span>/</span><span aria-current="page">{tester ? getTesterDisplayName(tester) : ''}</span></nav>
      <ReportLink href={backHref} className={s.back}><ArrowLeft size={14} />Testers</ReportLink>
      <div className={s.navigation}>{([-1, 1] as const).map(direction => {
        const next = index >= 0 ? visible[index + direction] : undefined;
        const label = direction === -1 ? 'Prev' : 'Next';
        const content = <>{direction === -1 && <ChevronLeft size={14} />}{label}{direction === 1 && <ChevronRight size={14} />}</>;
        return next ? <ReportLink className={s.button} key={label} href={`/testers/${encodeURIComponent(next.id)}${params.size ? `?${params}` : ''}`}>{content}</ReportLink>
          : <button key={label} className={s.button} disabled aria-disabled="true">{content}</button>;
      })}</div></div>
    {tester ? <TesterProfile key={tester.id} tester={tester} tab={tab} onTabChange={setTab} /> : <p className={s.empty}>{loaded ? 'Tester not found' : 'Loading tester…'}</p>}
  </div></div>;
}

export default function TesterDetailPage() { return <Suspense><TesterDetail /></Suspense>; }
