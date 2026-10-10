'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useDashboardStore, selectFilteredResponses, selectGameConfig } from '@/lib/store';
import { getTesterDisplayName } from '@/lib/testerIdentity';
import { engagement, testerGenres } from '@/lib/testerProfile';
import { flagLabel } from '@/lib/outliers';
import { profileAnswers, profileDate, profileGenreFit, profileText, ratingAverages, ratingScale, registryGroups, videoFiles } from '@/lib/dossier';
import type { Tester } from '@/lib/types';
import VideosPanel, { type VideoMetadata } from './VideosPanel';
import s from './TesterProfile.module.css';

export type ProfileTab = 'answers' | 'videos';
type Fact = [string, string | undefined];
function Facts({ rows }: { rows: Fact[] }) {
  return <dl className={s.facts}>{rows.filter(([, value]) => !!value).map(([label, value]) => <div key={label} className={s.fact}><dt>{label}</dt><dd className={['Submitted', 'Steam library', 'Plays'].includes(label) ? s.numeric : undefined}>{profileText(value!)}</dd></div>)}</dl>;
}
function Group({ title, rows }: { title: string; rows: Fact[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!rows.some(([, v]) => !!v)) return null;
  return <div className={s.group}><button aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{title}<ChevronDown size={14} /></button>
    {open && <div id={id}><Facts rows={rows} /></div>}</div>;
}
function ProfileRail({ tester, submittedAt }: { tester: Tester; submittedAt?: string }) {
  const name = getTesterDisplayName(tester);
  const registered = tester.inRegistry === true;
  const p = tester.profile;
  const genres = registered ? testerGenres(tester) : [];
  const subtitle = registered ? [tester.segments.country || tester.country, tester.segments.age_group || tester.ageGroup, tester.segments.gender].filter(Boolean).join(' · ') : '';
  const steam = [p?.steam?.gameCount !== undefined ? `${p.steam.gameCount.toLocaleString('en-GB')} games` : '', p?.steam?.totalHours !== undefined ? `${p.steam.totalHours.toLocaleString('en-GB')} h` : ''].filter(Boolean).join(' · ');
  const hours = tester.segments.gaming_hours;
  const facts: Fact[] = registered ? [['Tested before', p?.testedBefore], ['Plays', hours ? `${hours.replace(/\s*(hours?|h)(\s*\/\s*week)?$/i, '')} h / week` : undefined], ['Steam library', steam], ['Submitted', profileDate(submittedAt)]] : tester.inRegistry === undefined ? [['Submitted', profileDate(submittedAt)]] : [];
  return <aside className={s.rail} aria-label="Tester profile">
    <div className={s.identityFacts}><div className={s.identity}><div className={s.avatar} aria-hidden="true">{name[0].toUpperCase()}</div><div><h1 className={s.name}>{name}</h1>{subtitle && <p className={s.subtitle}>{profileText(subtitle)}</p>}</div></div>
      {facts.some(([, v]) => v) && <Facts rows={facts} />}</div>
    {tester.inRegistry === false && <p className={s.subtitle}>No registry profile</p>}
    {registered && <>
      {(genres.length > 0 || !!p?.avoidedGenres?.length) && <div>{genres.length > 0 && <><div className={s.tasteLabel}>Likes</div><div className={s.chips}>{genres.map(g => <span key={g} className={s.chip}>{profileText(g)}</span>)}</div></>}
        {!!p?.avoidedGenres?.length && <div className={genres.length ? s.avoids : undefined}><div className={s.tasteLabel}>Avoids</div><div className={s.chips}>{p.avoidedGenres.map(g => <span key={g} className={s.outlineChip}>{profileText(g)}</span>)}</div></div>}</div>}
      <div className={s.groups}>{registryGroups.map(group => {
        const rows: Fact[] = group.fields.map(([key, label]) => [label, typeof p?.[key] === 'string' ? p[key] as string : undefined]);
        if (group.title === 'Gaming habits') rows.push(['Modes', tester.segments.playstyles || tester.segments.gaming_pref], ['Platforms', tester.segments.platform]);
        if (group.title === 'Setup') rows.splice(3, 0, ['Controller', tester.segments.has_controller], ['Mic', tester.segments.has_mic]);
        // TODO(spec): legacy employment, availability, industry, gamer_type and hardware_tier have no dossier field.
        return <Group key={group.title} title={group.title} rows={rows} />;
      })}{!!p?.languages?.length && <p className={s.languages}>Languages <span>{profileText(p.languages.join(', '))}</span></p>}</div>
    </>}
  </aside>;
}

export default function TesterProfile({ tester, tab: routeTab, onTabChange }: { tester: Tester; tab?: ProfileTab; onTabChange?: (tab: ProfileTab) => void }) {
  const responses = useDashboardStore(state => state.responses);
  const cohort = useDashboardStore(selectFilteredResponses);
  const questions = useDashboardStore(state => state.questions);
  const categories = useDashboardStore(state => state.categories);
  const targets = useDashboardStore(state => state.project?.steamMatchGenres);
  const config = useDashboardStore(selectGameConfig);
  const [localTab, setLocalTab] = useState<ProfileTab>('answers');
  const tab = routeTab ?? localTab;
  const setTab = (next: ProfileTab) => { setLocalTab(next); onTabChange?.(next); };
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(false);
  const [pendingAnswer, setPendingAnswer] = useState<string>();
  const [metadata, setMetadata] = useState<Record<string, VideoMetadata>>({});
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId();
  const answers = useMemo(() => profileAnswers(tester.id, responses, questions), [tester.id, responses, questions]);
  const group = useMemo(() => ratingAverages(cohort, questions), [cohort, questions]);
  const own = useMemo(() => ratingAverages(responses.filter(r => r.testerId === tester.id), questions), [responses, questions, tester.id]);
  const eng = engagement(tester.id, responses, questions);
  const fit = profileGenreFit(tester, config, targets);
  const files = useMemo(() => videoFiles(tester.files), [tester.files]);
  const ratingCount = answers.filter(a => a.rating).length;
  const visible = answers.filter(a => filter === 'all' || (filter === 'ratings' ? a.rating : !a.rating));
  const flags = tester.quality?.flags ?? [];
  const durations = files.map(f => f.durationSec ?? metadata[f.id]?.durationSec);
  const totalDuration = durations.length && durations.every(d => d !== undefined) ? Math.round(durations.reduce<number>((sum, d) => sum + d!, 0) / 60) : undefined;
  const submittedAt = tester.submittedAt || responses.find(r => r.testerId === tester.id)?.submittedAt;

  useEffect(() => {
    if (!pendingAnswer || tab !== 'answers') return;
    const target = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-answer-id]') ?? []).find(el => el.dataset.answerId === pendingAnswer);
    if (!target) return;
    let scrollParent = target.parentElement;
    while (scrollParent && !/(auto|scroll)/.test(getComputedStyle(scrollParent).overflowY)) scrollParent = scrollParent.parentElement;
    const scroll = scrollParent ?? document.scrollingElement;
    if (scroll) {
      const offset = scroll === document.scrollingElement ? 0 : scroll.getBoundingClientRect().top;
      scroll.scrollTo({ top: scroll.scrollTop + target.getBoundingClientRect().top - offset - 20 });
    }
    target.focus({ preventScroll: true });
    const timer = setTimeout(() => setPendingAnswer(undefined), 1200);
    return () => clearTimeout(timer);
  }, [pendingAnswer, tab]);

  return <div ref={root} className={`${s.dossier} ${s.body}`}>
    <ProfileRail tester={tester} submittedAt={submittedAt} />
    <div className={s.main}>
      <div className={s.strip}>
        <div className={s.cell}><div className={s.cellLabel}>Avg rating</div><div className={s.cellValue}><span className={`${s.numeric} ${s.average}`}>{own.overall?.toFixed(1) ?? '—'}</span><span className={s.outOf}> / 5</span></div><div className={s.subline}>{own.overall === undefined ? 'no ratings' : group.overall === undefined ? 'no group data' : `group ${group.overall.toFixed(1)}`}</div></div>
        <div className={s.cell}><div className={s.cellLabel}>Written feedback</div><div className={s.cellValue}>{{ detailed: 'Detailed', brief: 'Brief', minimal: 'Low-effort', none: 'None' }[eng.tier]}</div><div className={s.subline}>{eng.answered} comments, {Math.round(eng.avgWords)} words</div></div>
        <div className={s.cell}><div className={s.cellLabel}>Genre fit</div><div className={s.cellValue}>{fit.value}</div><div className={s.subline}>{profileText(fit.reason)}</div></div>
        <div className={s.cell}><div className={s.cellLabel}>Flags</div><div className={s.cellValue}>{flags.length ? flags.map(f => flagLabel(f.type)).join(', ') : 'None'}</div>{flags[0] && <div className={`${s.subline} ${s.truncate}`} title={profileText(flags[0].detail)}>{profileText(flags[0].detail)}</div>}</div>
      </div>
      <div>
        <div className={s.tabHeader}><div role="tablist" aria-label="Tester feedback" className={s.tabs}>
          {(['answers', 'videos'] as const).map((name, i) => <button key={name} ref={el => { tabs.current[i] = el; }} id={`${uid}-${name}-tab`} aria-controls={`${uid}-${name}-panel`} role="tab" aria-selected={tab === name} tabIndex={tab === name ? 0 : -1} className={s.tab} onClick={() => setTab(name)} onKeyDown={event => {
            if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - i;
            tabs.current[next]?.focus(); setTab(next ? 'videos' : 'answers');
          }}>{name === 'answers' ? 'Answers' : 'Videos'}{' '}<span className={s.count}>{name === 'answers' ? answers.length : files.length}</span></button>)}
        </div>{tab === 'answers' ? <div className={s.filters} role="group" aria-label="Answer type">{[['all', 'All'], ['ratings', `Ratings ${ratingCount}`], ['written', `Written ${answers.length - ratingCount}`]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setExpanded(false); }}>{label}</button>)}</div>
          : totalDuration !== undefined && <span className={s.subtitle}>{totalDuration} min total</span>}</div>
        <div role="tabpanel" id={`${uid}-${tab}-panel`} aria-labelledby={`${uid}-${tab}-tab`} tabIndex={0}>
          {tab === 'answers' ? <div className={s.answers}>
            {visible.slice(0, expanded ? undefined : 20).map(({ q, response, index, rating }) => {
              const avg = group.questions.get(q.id);
              const { min, max } = ratingScale(q);
              const points = max - min + 1;
              const value = response.numericValue ?? 0;
              const category = categories.find(c => c.id === q.categoryId)?.name;
              // Interview-transcript layout: question number in a gutter, category
              // above the muted question, and the answer in brighter text below it.
              return <article key={response.id} data-answer-id={response.id} tabIndex={-1} className={`${s.answer} ${pendingAnswer === response.id ? s.flash : ''}`}>
                <span className={`${s.qNumber} ${s.numeric} ${rating && category ? s.belowMeta : ''}`}>Q{index}</span>
                <div className={s.qa}>
                  {rating && category && <div className={s.answerMeta}>{category}</div>}
                  <p className={s.question}>{profileText(q.text)}</p>
                  {rating ? <div className={s.meterRow}>
                    <span className={s.score}><span className={s.numeric}>{value}</span><span className={s.scoreMax}>/{max}</span></span>
                    <div role="meter" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-label={`Rated ${value} of ${max}, group average ${avg?.toFixed(1) ?? 'unavailable'}`} className={s.meter}>
                      {points <= 10 && points > 0 && Number.isInteger(points) ? Array.from({ length: points }, (_, i) => <span key={i} className={s.segment}>{i + min <= value && <span className={s.filled} style={{ display: 'block' }} />}</span>) : <span className={s.segment}><span className={s.filled} style={{ display: 'block', width: `${Math.max(0, Math.min(100, (value - min) / (max - min) * 100))}%` }} /></span>}
                    </div>
                    <span className={`${s.groupAverage} ${avg !== undefined && Math.abs(value - avg) >= 1.5 ? s.far : ''}`}>{avg === undefined ? 'no group data' : `avg ${avg.toFixed(1)}`}</span>
                  </div> : <p className={s.written}>{profileText(response.rawAnswer)}</p>}
                </div>
              </article>;
            })}
            {!answers.length && <p className={s.empty}>This tester didn&apos;t submit any answers.</p>}
            {!!answers.length && !visible.length && <p className={s.empty}>{filter === 'ratings' ? 'no ratings' : 'No written feedback'}</p>}
            {!expanded && visible.length > 20 && <button className={s.more} onClick={() => setExpanded(true)}>{visible.length - 20} more answers</button>}
          </div> : <VideosPanel files={files} answers={answers} metadata={metadata} onMetadata={(id, data) => setMetadata(current => ({ ...current, [id]: { ...current[id], ...data } }))} onLinkedAnswer={id => { setFilter('all'); setExpanded(true); setPendingAnswer(id); setTab('answers'); }} />}
        </div>
      </div>
      {tab === 'answers' && !!tester.comments?.length && <section className={s.comments}><h2>Comments during the session</h2>{tester.comments.map((comment, i) => <div key={`${comment.createdAt}-${i}`} className={s.comment}><time className={s.numeric} dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleTimeString('en-GB', { hourCycle: 'h23' })}</time><p>{profileText(comment.text)}</p></div>)}</section>}
    </div>
  </div>;
}
