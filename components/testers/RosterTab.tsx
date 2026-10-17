'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import ReportLink from '@/components/layout/ReportLink';
import type { Question, Response, Tester } from '@/lib/types';
import type { GameConfig } from '@/lib/games';
import { filterTesterList, isCoreAudience, profileGenreFit, videoFiles } from '@/lib/dossier';
import { engagement, testerGenres } from '@/lib/testerProfile';
import { flagLabel } from '@/lib/outliers';
import { getTesterDisplayName } from '@/lib/testerIdentity';
import { computeOverviewHeadlines } from '@/lib/overviewHeadlines';
import { steamHours, testerCountry } from '@/lib/testerInsights';
import s from './testers.module.css';

interface Props {
  testers: Tester[];
  responses: Response[];
  questions: Question[];
  config: GameConfig;
  targets?: string[];
  search: string;
  filter: string;
  onSearch: (value: string) => void;
  onFilter: (value: string) => void;
  detailHref: (id: string) => string;
}

const PAGE = 50;

const QUICK_FILTERS: { key: string; label: string }[] = [
  { key: 'core', label: 'Core audience' },
  { key: 'target_genre', label: 'Target genre' },
  { key: 'detailed', label: 'Detailed responder' },
  { key: 'recording', label: 'Has recording' },
  { key: 'flagged', label: 'Flagged' },
  { key: 'unmatched', label: 'Not in registry' },
];

/** Overall-score bands on a /10 scale. */
function bandColor(value: number, max: number): string {
  const ten = (value / max) * 10;
  return ten >= 7 ? '#7ED957' : ten >= 5 ? '#E8C547' : '#F26D6D';
}

const formatNumber = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function formatSubmitted(iso?: string): string | null {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${day}, ${time}`;
}

const Dash = () => <span className={s.dash}>—</span>;

export default function RosterTab({ testers, responses, questions, config, targets, search, filter, onSearch, onFilter, detailHref }: Props) {
  const router = useRouter();
  const active = useMemo(() => new Set(filter.split(',').filter(f => f && f !== 'all')), [filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const { key } of QUICK_FILTERS) c[key] = 0;
    for (const t of testers) {
      if (isCoreAudience(t, config, targets)) c.core++;
      if (profileGenreFit(t, config, targets).value === 'Target genre') c.target_genre++;
      if (engagement(t.id, responses, questions).tier === 'detailed') c.detailed++;
      if (videoFiles(t.files).length) c.recording++;
      if (t.quality?.flags.length) c.flagged++;
      if (t.inRegistry === false) c.unmatched++;
    }
    return c;
  }, [testers, responses, questions, config, targets]);

  // Per-tester answer to the overall rating question (falls back to the
  // tester's average rating when the form has no overall question).
  const overall = useMemo(() => {
    const q = computeOverviewHeadlines(questions, responses).overall;
    const byTester = new Map<string, number>();
    if (q) for (const r of responses) if (r.questionId === q.questionId && r.testerId && r.numericValue !== null) byTester.set(r.testerId, r.numericValue);
    return { max: q?.max ?? 5, byTester, fromQuestion: !!q };
  }, [questions, responses]);

  const firstSubmitted = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of responses) {
      if (!r.testerId) continue;
      const prev = map.get(r.testerId);
      if (!prev || Date.parse(r.submittedAt) < Date.parse(prev)) map.set(r.testerId, r.submittedAt);
    }
    return map;
  }, [responses]);

  const visible = useMemo(
    () => filterTesterList(testers, search, filter, responses, questions, config, targets),
    [testers, search, filter, responses, questions, config, targets],
  );

  // "Load more" resets whenever the search or filters change.
  const pagingKey = `${search}|${filter}`;
  const [paging, setPaging] = useState({ key: pagingKey, limit: PAGE });
  const limit = paging.key === pagingKey ? paging.limit : PAGE;
  const shown = visible.slice(0, limit);

  const toggleFilter = (key: string) => {
    const next = new Set(active);
    if (next.has(key)) next.delete(key); else next.add(key);
    onFilter([...next].join(','));
  };

  return (
    <>
      <div className={`${s.toolbar} groove-b`}>
        <label className={s.search}>
          <Search className={s.searchIcon} size={13} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search response ID or country"
            placeholder="Search response ID or country"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className={`${s.searchInput} groove-b`}
          />
        </label>
        <div className={s.checks}>
          {QUICK_FILTERS.filter(f => counts[f.key] > 0 || active.has(f.key)).map(f => (
            <label key={f.key} className={s.check}>
              <input type="checkbox" className={s.checkBox} checked={active.has(f.key)} onChange={() => toggleFilter(f.key)} />
              {f.label}
              <span className={s.checkCount}>{counts[f.key]}</span>
            </label>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className={s.mutedLine}>No testers match this search and these filters</p>
      ) : (
        <>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th scope="col">Response</th>
                  <th scope="col">Country</th>
                  <th scope="col">Plays</th>
                  <th scope="col" className={s.num} title="Total hours across the tester's linked Steam library">Steam hrs</th>
                  <th scope="col" title={overall.fromQuestion ? 'Answer to the overall rating question' : 'Average rating across all rating questions'}>Overall</th>
                  <th scope="col" className={s.num}>Files</th>
                  <th scope="col">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(t => {
                  const score = overall.fromQuestion ? overall.byTester.get(t.id) : t.avgRating;
                  const hours = steamHours(t);
                  const files = t.files?.length ?? 0;
                  const submitted = formatSubmitted(t.submittedAt ?? firstSubmitted.get(t.id));
                  const genres = testerGenres(t);
                  const note = t.quality?.flags.length
                    ? t.quality.flags.map(f => flagLabel(f.type)).join(' · ')
                    : t.inRegistry === false ? 'Not in registry' : null;
                  return (
                    <tr key={t.id} className={s.tr} onClick={() => router.push(detailHref(t.id))}>
                      <td>
                        <ReportLink href={detailHref(t.id)} onClick={e => e.stopPropagation()} className={s.rid}>
                          {getTesterDisplayName(t)}
                        </ReportLink>
                        {note && <div className={s.note}>{note}</div>}
                      </td>
                      <td><span className={s.cellText}>{testerCountry(t) || <Dash />}</span></td>
                      <td>
                        {genres.length
                          ? <span className={s.cellText} title={genres.join(', ')}>{genres.join(', ')}</span>
                          : <Dash />}
                      </td>
                      <td className={s.num}>
                        {hours !== undefined ? <span className={s.cellNum}>{hours.toLocaleString('en-GB')}</span> : <Dash />}
                      </td>
                      <td>
                        {score !== undefined ? (
                          <span className={s.cellNum} style={{ color: bandColor(score, overall.max) }}>
                            {formatNumber(score)}<span className={s.faint}>/{overall.max}</span>
                          </span>
                        ) : <Dash />}
                      </td>
                      <td className={s.num}>{files ? <span className={s.cellNum}>{files}</span> : <Dash />}</td>
                      <td>{submitted ? <span className={`${s.cellNum} ${s.cellDate}`}>{submitted}</span> : <Dash />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={s.footer}>
            <span>
              Showing {shown.length} of {visible.length}
              {visible.length !== testers.length && ` · ${testers.length} in cohort`} · sorted by ID
            </span>
            {shown.length < visible.length && (
              <button type="button" className={s.loadMore} onClick={() => setPaging({ key: pagingKey, limit: limit + PAGE })}>
                Load more
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
