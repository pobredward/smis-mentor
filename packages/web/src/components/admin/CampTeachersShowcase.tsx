'use client';
import { compareCampCodes } from '@smis-mentor/shared';

/**
 * 멘토 선생님 / 원어민 선생님 (관리자 · 캠프 설명회용)
 * "이 선생님들이 참여합니다" — 캠프별로 운영진과 그룹별 선생님을 사진 카드로 보여 준다. kind 로 멘토·원어민 페이지를 나눈다.
 * - 그룹 순서는 shared 의 CAMP_GROUP_ORDER (compareGroupNames) 하나를 따른다
 * - 순서·그룹·반은 '선생님 명단 관리'(campRosters) 기준. 표가 없으면 캠프 배정(jobExperiences)으로 만든다
 * - 한국인 멘토: 한 줄에 한 명 — 사진 · 나이·성별·학교/학과 · 이 캠프의 수업 자료(올림/아직, 눌러서 바로 보기)
 * - 원어민: 한 줄에 한 명 — 사진 · 국적·참여 횟수·경력
 * - 연락처·개인정보는 보이지 않는다 (관리용 표·알림 현황은 '선생님 명단 관리' 페이지로 옮김)
 * - 발표 모드: 메뉴를 가리고 화면을 꽉 채운다 (Esc 로 나가기)
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Layout from '@/components/common/Layout';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { getAllJobCodes, getUsersByJobCodeId } from '@/lib/firebaseService';
import type { JobCodeWithId, User } from '@/types';
import {
  CAMP_TEACHER_TITLE,
  buildCampTeachers,
  campTeacherCaption,
  countryFlag,
  formatTeachingPeriod,
  getCampRoster,
  groupCampTeachers,
  loadTeacherLessons,
  ordinalEn,
  resolveActiveJobCodeId,
  uploadedLessonTopics,
  type CampTeacher,
  type TeacherLesson,
} from '@smis-mentor/shared';

/** 사람 목록·묶기·소개·수업 자료 불러오기 규칙은 shared/utils/campTeachers.ts (앱과 같은 코드) */
type Person = CampTeacher;
type MentorLesson = TeacherLesson;
const ordinal = ordinalEn;
const flagOf = countryFlag;

/** 그룹 색 — 관리시트 동기화 리스트와 같은 계열 */
const GROUP_TONE: Record<string, { bar: string; soft: string; text: string }> = {
  spring: { bar: 'bg-amber-400', soft: 'bg-amber-50', text: 'text-amber-700' },
  summer: { bar: 'bg-emerald-500', soft: 'bg-emerald-50', text: 'text-emerald-700' },
  autumn: { bar: 'bg-violet-500', soft: 'bg-violet-50', text: 'text-violet-700' },
  winter: { bar: 'bg-rose-400', soft: 'bg-rose-50', text: 'text-rose-700' },
  junior: { bar: 'bg-sky-500', soft: 'bg-sky-50', text: 'text-sky-700' },
  middle: { bar: 'bg-teal-500', soft: 'bg-teal-50', text: 'text-teal-700' },
  senior: { bar: 'bg-indigo-500', soft: 'bg-indigo-50', text: 'text-indigo-700' },
};
const toneOf = (g: string) => GROUP_TONE[g.toLowerCase()] ?? { bar: 'bg-[#2E26D3]', soft: 'bg-indigo-50', text: 'text-[#2E26D3]' };

const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') return (v as { toDate: () => Date }).toDate();
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmt = (d: Date | null) => (d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` : '');

const TITLE = CAMP_TEACHER_TITLE;

export default function CampTeachersShowcase({ kind }: { kind: 'mentor' | 'foreign' }) {
  const { userData } = useAuth();
  const [codes, setCodes] = useState<JobCodeWithId[]>([]);
  const [gen, setGen] = useState('');
  const [jobCodeId, setJobCodeId] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [present, setPresent] = useState(false);
  const [expandAll, setExpandAll] = useState<{ open: boolean; v: number }>({ open: false, v: 0 });
  const [zoom, setZoom] = useState<Person | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  /** userId → 이 캠프 수업 자료 (한국인 멘토 화면만) */
  const [lessons, setLessons] = useState<Record<string, MentorLesson> | null>(null);

  useEffect(() => {
    getAllJobCodes().then((list) => {
      const cs = (list as JobCodeWithId[]).filter((c) => c.code).sort((a, b) => String(b.generation).localeCompare(String(a.generation), 'ko', { numeric: true }) || compareCampCodes(a.code, b.code));
      setCodes(cs);
      const active = resolveActiveJobCodeId(userData);
      const first = cs.find((c) => c.id === active) ?? cs[0];
      if (first) { setGen(String(first.generation)); setJobCodeId(first.id as string); }
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!jobCodeId) return;
    let alive = true;
    setLoading(true);
    Promise.all([getUsersByJobCodeId(jobCodeId), getCampRoster(db, jobCodeId).catch(() => null)])
      .then(([us, roster]) => { if (alive) { setUsers(us as User[]); setPeople(buildCampTeachers(jobCodeId, us as any, roster)); } })
      .catch(() => alive && setPeople([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [jobCodeId]);

  // 발표 모드 — Esc 로 나가기, 가능하면 전체 화면
  useEffect(() => {
    if (!present) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setZoom(null); setPresent(false); } };
    window.addEventListener('keydown', onKey);
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    };
  }, [present]);

  const jc = codes.find((c) => c.id === jobCodeId);

  // 한국인 멘토 — 사람 목록이 뜬 뒤 각자의 수업 자료를 불러온다
  useEffect(() => {
    if (kind !== 'mentor' || !jc?.code || !people.length) { setLessons(null); return; }
    let alive = true;
    setLessons(null);
    const ids = [...new Set(people.filter((p) => p.kind === 'mentor' && p.userId).map((p) => p.userId as string))];
    loadTeacherLessons(db, { users: users as any, ids, jobCodeId, code: jc.code }).then((r) => alive && setLessons(r)).catch(() => alive && setLessons({}));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, people, jc?.code]);

  const gens = useMemo(() => [...new Set(codes.map((c) => String(c.generation)))], [codes]);

  const view = useMemo(() => groupCampTeachers(people, kind), [people, kind]);

  const start = toDate((jc as any)?.startDate), end = toDate((jc as any)?.endDate);
  const campsAside = (p: Person) => <CampHistory ids={p.campIds ?? []} codes={codes} current={jobCodeId} tight full roles={p.campRoles} />;

  const body = (
    <div className={present ? 'max-w-[1500px] mx-auto px-10 py-12' : 'max-w-6xl mx-auto px-4 py-8'}>
      {/* 머리 */}
      <header className="mb-10">
        <p className="text-sm font-bold tracking-wide text-[#2E26D3]">{jc ? `${jc.generation} ${jc.name}` : 'SMIS CAMP'}</p>
        <h1 className={`${present ? 'text-5xl' : 'text-3xl sm:text-4xl'} font-extrabold text-gray-900 mt-2`}>{TITLE[kind]}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-gray-500">
          {jc?.code && <span className="px-2.5 py-0.5 rounded-full bg-[#2E26D3] text-white text-sm font-bold">{jc.code}</span>}
          {start && <span>{fmt(start)} – {fmt(end)}</span>}
          {view.count > 0 && <span><b className="text-gray-900">{view.count}</b>명</span>}
        </div>
      </header>

      {loading ? (
        <p className="text-center text-gray-400 py-20">불러오는 중…</p>
      ) : view.count === 0 ? (
        <div className="text-center text-gray-400 py-20">
          <p>이 캠프에 배정된 {TITLE[kind]}이 없습니다.</p>
          {!present && <Link href="/admin/camp-roster" className="text-sm text-blue-600 hover:underline mt-2 inline-block">선생님 명단 관리에서 배정하기 →</Link>}
        </div>
      ) : (
        <div className="space-y-14">
          {view.staff.length > 0 && (
            <section>
              <SectionTitle title="운영진" tone={{ bar: 'bg-[#2E26D3]', text: 'text-[#2E26D3]' }} sub="Camp Managers" />
              {/* 운영진은 오른쪽에 참여한 캠프 */}
              {kind === 'foreign'
                ? <ForeignCards people={view.staff} present={present} onZoom={setZoom} aside={campsAside} />
                : <MentorRows people={view.staff} present={present} onZoom={setZoom} lessons={lessons} aside={campsAside}
                    caption={(p) => campTeacherCaption(p, true)} />}
            </section>
          )}
          {view.sections.map(({ g, list, grades }) => {
            const tone = toneOf(g);
            return (
              <section key={g}>
                <SectionTitle title={g} tone={tone} sub={grades.length ? grades.join(' · ') : ''} />
                {/* 한 그룹은 한 덩어리로 — 멘토: 담임(반 순서) → 수업 / 원어민: Speaking → Reading → Writing */}
                {kind === 'foreign' ? (
                  <ForeignCards people={list} present={present} onZoom={setZoom} tone={tone} />
                ) : (
                  <MentorRows people={list} present={present} onZoom={setZoom} tone={tone} lessons={lessons}
                    caption={(p) => campTeacherCaption(p, false)} />
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <Layout requireAuth requireAdmin>
      <ExpandAllContext.Provider value={expandAll}>
      {/* 고르기 — 발표 모드에서는 숨김 */}
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <select value={gen} onChange={(e) => setGen(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-white">
            {gens.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          {codes.filter((c) => String(c.generation) === gen).map((c) => (
            <button key={c.id} onClick={() => setJobCodeId(c.id as string)}
              className={`px-3 py-2 rounded-lg text-sm border ${c.id === jobCodeId ? 'bg-gray-900 text-white border-gray-900' : 'bg-white hover:bg-gray-50'}`}>
              {c.code}
            </button>
          ))}
          <div className="flex-1" />
          <button type="button" onClick={() => setExpandAll((s) => ({ open: !s.open, v: s.v + 1 }))}
            className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 text-gray-700">
            <svg className={`w-4 h-4 transition-transform ${expandAll.open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            {expandAll.open ? '카드 모두 접기' : '카드 모두 펼치기'}
          </button>
          <div className="flex text-sm rounded-lg bg-gray-100 p-0.5">
            <Link href="/admin/user-check" className={`px-3 py-1.5 rounded-md ${kind === 'mentor' ? 'bg-white shadow-sm font-semibold' : 'text-gray-500'}`}>멘토</Link>
            <Link href="/admin/foreign-teachers" className={`px-3 py-1.5 rounded-md ${kind === 'foreign' ? 'bg-white shadow-sm font-semibold' : 'text-gray-500'}`}>원어민</Link>
          </div>
        </div>
      </div>

      {present ? (
        <div className="fixed inset-0 z-[100] bg-white overflow-y-auto">
          <button onClick={() => setPresent(false)} className="fixed top-4 right-5 z-[101] w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 text-lg" title="나가기 (Esc)">✕</button>
          {body}
        </div>
      ) : body}

      {zoom && (
        <div className="fixed inset-0 z-[120] bg-black/70 flex items-center justify-center p-3 sm:p-6" onClick={() => setZoom(null)}>
          {zoom.kind === 'foreign' ? (
            <div className="relative bg-white rounded-3xl w-full max-w-3xl max-h-[92vh] sm:max-h-[90vh] shadow-2xl overflow-y-auto sm:overflow-hidden sm:grid sm:grid-cols-[260px_1fr] sm:items-start" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => setZoom(null)} aria-label="닫기"
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 text-gray-500 hover:bg-gray-100 shadow-sm">✕</button>
            <div className="hidden sm:block p-4 sm:pr-0"><Photo person={zoom} className="aspect-[3/4] object-cover rounded-2xl text-6xl" /></div>
              <div className="p-5 sm:p-7 sm:overflow-y-auto sm:max-h-[90vh]">
                <div className="flex items-start gap-4 pr-8 sm:pr-0">
                  <div className="w-24 shrink-0 sm:hidden"><Photo person={zoom} className="aspect-[3/4] object-cover rounded-xl text-3xl" /></div>
                  <ForeignHead p={zoom} big />
                </div>
                <CampHistory ids={zoom.campIds ?? []} codes={codes} current={jobCodeId} />
                <Experience p={zoom} />
              </div>
            </div>
          ) : (
          <div className="relative bg-white rounded-3xl w-full max-w-3xl max-h-[92vh] sm:max-h-[90vh] shadow-2xl overflow-y-auto sm:overflow-hidden sm:grid sm:grid-cols-[260px_1fr] sm:items-start" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setZoom(null)} aria-label="닫기"
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 text-gray-500 hover:bg-gray-100 shadow-sm">✕</button>
            <div className="hidden sm:block p-4 sm:pr-0"><Photo person={zoom} className="aspect-[3/4] object-cover rounded-2xl text-6xl" /></div>
            <div className="p-5 sm:p-7 sm:overflow-y-auto sm:max-h-[90vh]">
              <div className="flex items-start gap-4 pr-8 sm:pr-0">
                <div className="w-24 shrink-0 sm:hidden"><Photo person={zoom} className="aspect-[3/4] object-cover rounded-xl text-3xl" /></div>
                <MentorHead p={zoom} big caption={[zoom.group, zoom.role === '담임' ? `담임 ${zoom.classCode}` : zoom.role, zoom.className].filter(Boolean).join(' · ')} />
              </div>
              {/* 카드를 누르면 — 이 캠프 수업 자료(누르면 새 탭) · 참여 캠프 */}
              <div className="mt-5">
                <LessonSummary lesson={zoom.userId ? lessons?.[zoom.userId] : undefined} loading={!lessons} />
              </div>
              <div className="mt-5">
                <p className="text-[10px] font-semibold text-gray-400 tracking-wider mb-2">참여한 캠프</p>
                <CampHistory ids={zoom.campIds ?? []} codes={codes} current={jobCodeId} tight full roles={zoom.campRoles} />
              </div>
            </div>
          </div>
          )}
        </div>
      )}

      </ExpandAllContext.Provider>
    </Layout>
  );
}

/**
 * 카드 오른쪽 칸 — 최대 높이를 넘으면 아래를 흐리게 덮고 화살표로 펼치기/접기.
 * 안쪽 내용 높이를 재서(ResizeObserver) 넘칠 때만 화살표가 나온다 (수업 자료가 뒤늦게 불러와져도 다시 잰다)
 */
/** '모두 펼치기 / 모두 접기' — 누를 때마다 v 가 바뀌고, 모든 카드가 open 값으로 맞춘다 (그 뒤 카드별로 따로 열고 닫을 수 있다) */
const ExpandAllContext = createContext<{ open: boolean; v: number }>({ open: false, v: 0 });

function Collapsible({ children, max = 156 }: { children: ReactNode; max?: number }) {
  const inner = useRef<HTMLDivElement>(null);
  const all = useContext(ExpandAllContext);
  const [open, setOpen] = useState(all.open);
  useEffect(() => { if (all.v) setOpen(all.open); }, [all.v, all.open]);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const check = () => setOver(el.offsetHeight > max + 8);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [max]);
  const toggle = (e: React.MouseEvent) => { e.stopPropagation(); setOpen((v) => !v); };
  return (
    <div className="relative">
      <div className="overflow-hidden" style={over && !open ? { maxHeight: max } : undefined}>
        <div ref={inner}>{children}</div>
      </div>
      {over && !open && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white via-white/70 to-transparent backdrop-blur-[2px] [mask-image:linear-gradient(to_bottom,transparent,black_60%)]" />
      )}
      {over && (
        <div className={open ? 'flex justify-center mt-2' : 'absolute inset-x-0 bottom-0 flex justify-center'}>
          <button type="button" onClick={toggle} aria-label={open ? '접기' : '펼치기'} title={open ? '접기' : '펼치기'}
            className="w-8 h-8 rounded-full bg-white ring-1 ring-gray-200 shadow-sm text-gray-500 hover:text-gray-900 hover:ring-gray-300 flex items-center justify-center">
            <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 9l-7 7-7-7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ title, sub, tone }: { title: string; sub?: string; tone: { bar: string; text: string } }) {
  return (
    <div className="flex items-end gap-3 mb-5">
      <span className={`w-1.5 h-8 rounded-full ${tone.bar}`} />
      <h2 className="text-2xl font-extrabold text-gray-900 leading-none">{title}</h2>
      {sub && <span className={`text-sm font-semibold ${tone.text} leading-none pb-0.5`}>{sub}</span>}
    </div>
  );
}

function Photo({ person, className = '' }: { person: Person; className?: string }) {
  return person.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={person.photo} alt={person.name} className={`w-full object-cover bg-gray-100 ${className}`} loading="lazy" />
  ) : (
    <div className={`w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center font-extrabold text-gray-400 ${className}`}>
      {person.name.slice(0, 1)}
    </div>
  );
}

/** 한국인 멘토 머리 — 역할/반 · 이름 · 나이·성별 · 학교/학과 · SMIS 참여 */
function MentorHead({ p, big, caption, tone }: { p: Person; big?: boolean; caption?: string; tone?: { soft: string; text: string } }) {
  const basics = [p.age ? `${p.age}세` : '', p.gender].filter(Boolean).join(' · ');
  const school = [p.school, p.major].filter(Boolean).join(' ');
  return (
    <div className="min-w-0">
      {caption && <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${tone ? `${tone.soft} ${tone.text}` : 'bg-indigo-50 text-[#2E26D3]'}`}>{caption}</span>}
      <p className="mt-1.5 flex items-baseline gap-2 flex-wrap">
        <span className={`font-extrabold text-gray-900 ${big ? 'text-3xl' : 'text-xl'}`}>{p.name}</span>
        {p.englishName && <span className="text-sm text-gray-400">{p.englishName}</span>}
      </p>
      {basics && <p className="text-sm text-gray-600 mt-1">{basics}</p>}
      {(school || p.schoolYear) && (
        <p className="text-sm text-gray-500 mt-0.5 leading-snug">{school}{p.schoolYear && <span className="text-gray-400">{school ? ' · ' : ''}{p.schoolYear}</span>}</p>
      )}
      {!!p.smisCount && (
        <div className="inline-block rounded-xl bg-gray-50 px-3 py-1.5 mt-3">
          <p className="text-[10px] font-semibold text-gray-400 tracking-wider">SMIS</p>
          <p className="text-base font-extrabold text-gray-900 leading-tight">{p.smisCount}회</p>
        </div>
      )}
    </div>
  );
}

/** 이 캠프의 수업 자료 — 올린 것만 (링크가 없는 주제·칸은 감춘다). 누르면 새 탭으로 열린다 */
function LessonSummary({ lesson, loading }: { lesson?: MentorLesson; loading: boolean }) {
  if (loading) return <p className="text-xs text-gray-300">수업 자료 불러오는 중…</p>;
  if (lesson?.failed) return <p className="text-xs text-amber-600">수업 자료를 불러오지 못했습니다</p>;
  const topics = uploadedLessonTopics(lesson);
  if (!topics.length) return <p className="text-xs text-gray-300">아직 올린 수업 자료가 없습니다</p>;
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 tracking-wider mb-1.5">수업 자료</p>
      <div className="space-y-1.5">
        {topics.map((t, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="w-20 shrink-0 text-xs font-semibold text-gray-700 truncate pt-0.5" title={t.title}>{t.title}</span>
            <div className="flex flex-wrap gap-1 min-w-0">
              {/* 칸마다 공개보기 · 원본 둘 다 (새 탭) — 같은 링크면 하나만 */}
              {t.sections.map((s, j) => (
                <span key={j} className="inline-flex items-stretch max-w-full rounded-md text-[11px] bg-indigo-50 ring-1 ring-indigo-100 overflow-hidden">
                  <span className="px-2 py-0.5 font-medium text-gray-800 min-w-0 truncate" title={s.title}>{s.title}</span>
                  {s.view && (
                    <a href={s.view} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                      className="shrink-0 whitespace-nowrap px-1.5 py-0.5 border-l border-indigo-100 font-semibold text-[#2E26D3] hover:bg-indigo-100">공개보기</a>
                  )}
                  {s.original && s.original !== s.view && (
                    <a href={s.original} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                      className="shrink-0 whitespace-nowrap px-1.5 py-0.5 border-l border-indigo-100 font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100">원본편집</a>
                  )}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 한국인 멘토 — 넓은 화면: 한 줄에 한 명(사진 · 소개 · 오른쪽: 수업 자료, 운영진은 참여 캠프) / 휴대폰: 사진 카드 셋씩 */
function MentorRows({ people, present, onZoom, caption, tone, lessons, aside }: {
  people: Person[]; present: boolean; onZoom: (p: Person) => void; caption: (p: Person) => string;
  tone?: { soft: string; text: string }; lessons: Record<string, MentorLesson> | null;
  /** 오른쪽 칸 — 없으면 수업 자료 */
  aside?: (p: Person) => ReactNode;
}) {
  return (
    <>
      <div className="grid grid-cols-3 gap-2 md:hidden">
        {people.map((p) => (
          <button key={p.key} onClick={() => onZoom(p)} className="text-left rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
            <Photo person={p} className="aspect-[3/4] text-3xl" />
            <div className="px-2 py-1.5">
              <p className="font-extrabold text-sm text-gray-900 truncate">{p.name}</p>
              <p className={`text-[11px] font-semibold truncate ${tone?.text ?? 'text-[#2E26D3]'}`}>{caption(p)}</p>
            </div>
          </button>
        ))}
      </div>
      <div className="hidden md:block space-y-3">
        {people.map((p) => (
          <div key={p.key} role="button" tabIndex={0} onClick={() => onZoom(p)} onKeyDown={(e) => { if (e.key === 'Enter') onZoom(p); }}
            className="cursor-pointer rounded-2xl bg-white ring-1 ring-gray-200 overflow-hidden hover:ring-gray-300 hover:shadow-lg transition flex items-start">
            <div className={`${present ? 'w-44' : 'w-36'} shrink-0 p-3 pr-0`}>
              <Photo person={p} className="aspect-[3/4] rounded-xl text-4xl" />
            </div>
            <div className="flex-1 min-w-0 p-5 grid gap-x-8 gap-y-4 lg:grid-cols-[270px_1fr]">
              <div className="self-start">
                <MentorHead p={p} caption={caption(p)} tone={tone} big={present} />
              </div>
              <div className="min-w-0">
                <Collapsible>
                  {aside ? aside(p) : <LessonSummary lesson={p.userId ? lessons?.[p.userId] : undefined} loading={!lessons} />}
                </Collapsible>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** 원어민 머리 — 과목 · 이름 · 국적 · SMIS 참여 · 경력 연수 */
function ForeignHead({ p, big, tone }: { p: Person; big?: boolean; tone?: { soft: string; text: string } }) {
  return (
    <div>
      {p.role && <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${tone ? `${tone.soft} ${tone.text}` : 'bg-indigo-50 text-[#2E26D3]'}`}>{p.role}</span>}
      <p className={`font-extrabold text-gray-900 mt-1.5 ${big ? 'text-3xl' : 'text-xl'}`}>{p.name}</p>
      {p.nationality && <p className="text-sm text-gray-500 mt-0.5">{flagOf(p.nationality)} {p.nationality}</p>}
      <div className="flex gap-2 mt-3">
        {!!p.smisCount && (
          <div className="rounded-xl bg-gray-50 px-3 py-1.5">
            <p className="text-[10px] font-semibold text-gray-400 tracking-wider">SMIS</p>
            <p className="text-base font-extrabold text-gray-900 leading-tight">{ordinal(p.smisCount)}</p>
          </div>
        )}
        {p.teachingYears && (
          <div className="rounded-xl bg-gray-50 px-3 py-1.5">
            <p className="text-[10px] font-semibold text-gray-400 tracking-wider">TEACHING</p>
            <p className="text-base font-extrabold text-gray-900 leading-tight">{p.teachingYears}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** 경력 — 구조화된 목록(역할·장소·기간·내용)이 있으면 그걸, 없으면 예전 글.
 *  카드에서는 최대 높이로 자르고(아래는 흐리게), 확대 창에서는 전부 보여 준다 */
function Experience({ p, compact, tight, brief }: { p: Person; compact?: boolean; tight?: boolean; brief?: boolean }) {
  const items = p.teachingExperiences ?? [];
  const legacy = items.length ? [] : String(p.teachingExperience ?? '').split(/\r?\n/).map((l) => l.replace(/^[-•·@\s]+/, '').trim()).filter(Boolean);
  if (!items.length && !legacy.length) return null;
  return (
    <div className={tight ? '' : 'mt-4'}>
      <p className="text-[10px] font-semibold text-gray-400 tracking-wider mb-1.5">TEACHING EXPERIENCE</p>
      <div className={compact ? 'relative max-h-[150px] overflow-hidden' : ''}>
        {items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="text-[13px] leading-snug">
                <div className="flex gap-3 justify-between">
                  <p className="text-gray-900"><span className="font-semibold">{it.role || it.place}</span>{it.role && it.place && <span className="text-gray-500"> · {it.place}</span>}</p>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{formatTeachingPeriod(it)}</span>
                </div>
                {it.description && !compact && !brief && <p className="text-gray-600 mt-0.5">{it.description}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-1">
            {legacy.map((l, i) => <li key={i} className="text-[13px] leading-snug text-gray-700 flex gap-1.5"><span className="text-gray-300">•</span><span>{l}</span></li>)}
          </ul>
        )}
        {compact && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent" />}
      </div>
    </div>
  );
}

/** 원어민 카드 — 한 줄에 한 명: 사진 · 소개 · 경력 (설명회에서 한눈에) */
function ForeignCards({ people, present, onZoom, tone, aside }: {
  people: Person[]; present: boolean; onZoom: (p: Person) => void; tone?: { soft: string; text: string };
  /** 오른쪽 칸 — 없으면 경력 (운영진은 참여 캠프) */
  aside?: (p: Person) => ReactNode;
}) {
  return (
    <>
      {/* 휴대폰 — 사진 카드만 한 줄에 셋 (경력은 눌러서) */}
      <div className="grid grid-cols-3 gap-2 md:hidden">
        {people.map((p) => (
          <button key={p.key} onClick={() => onZoom(p)} className="text-left rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
            <Photo person={p} className="aspect-[3/4] text-3xl" />
            <div className="px-2 py-1.5">
              <p className="font-extrabold text-sm text-gray-900 truncate">{p.name}</p>
              <p className={`text-[11px] font-semibold truncate ${tone?.text ?? 'text-[#2E26D3]'}`}>{p.role}</p>
            </div>
          </button>
        ))}
      </div>
      {/* 넓은 화면 — 한 줄에 한 명: 사진 · 소개 · 경력(최대 높이) */}
      <div className="hidden md:block space-y-3">
        {people.map((p) => (
          <div key={p.key} role="button" tabIndex={0} onClick={() => onZoom(p)} onKeyDown={(e) => { if (e.key === 'Enter') onZoom(p); }}
            className="cursor-pointer rounded-2xl bg-white ring-1 ring-gray-200 overflow-hidden hover:ring-gray-300 hover:shadow-lg transition flex items-start">
            <div className={`${present ? 'w-44' : 'w-36'} shrink-0 p-3 pr-0`}>
              <Photo person={p} className="aspect-[3/4] rounded-xl text-4xl" />
            </div>
            <div className="flex-1 min-w-0 p-5 grid gap-x-8 gap-y-4 lg:grid-cols-[270px_1fr]">
              <div className="self-start">
                <ForeignHead p={p} tone={tone} big={present} />
              </div>
              <div className="min-w-0">
                <Collapsible>{aside ? aside(p) : <Experience p={p} tight brief />}</Collapsible>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** 참여한 캠프 — 기수 최신순, 지금 캠프는 강조 */
/** full: 운영진용 — 코드 대신 '29기 싱&말 영어캠프' 처럼 캠프 이름까지 한 줄씩 (참여 이력이 한눈에) */
function CampHistory({ ids, codes, current, tight, full, roles }: {
  ids: string[]; codes: JobCodeWithId[]; current: string; tight?: boolean; full?: boolean;
  /** 캠프별 그때의 역할 (full 일 때 이름 옆에) */
  roles?: Record<string, string>;
}) {
  const list = ids
    .map((id) => codes.find((c) => c.id === id))
    .filter((c): c is JobCodeWithId => !!c)
    .sort((a, b) => String(b.generation).localeCompare(String(a.generation), 'ko', { numeric: true }) || compareCampCodes(a.code, b.code));
  if (!list.length) return null;
  if (full) {
    return (
      <div className={tight ? '' : 'mt-4'}>
        {/* 위에서 아래로 최신 기수부터 — 넓은 화면은 두 단 (단 안에서 차례대로) */}
        <ul className="space-y-1.5">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5 min-w-0">
              <span className={`shrink-0 w-14 text-center px-1.5 py-0.5 rounded-md text-[11px] font-bold ${c.id === current ? 'bg-[#2E26D3] text-white' : 'bg-gray-100 text-gray-700'}`}>{c.code}</span>
              <span className={`text-[13px] truncate ${c.id === current ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{c.generation} {c.name}</span>
              {roles?.[c.id] && (
                <span className={`shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded ${c.id === current ? 'bg-indigo-50 text-[#2E26D3]' : 'bg-gray-50 text-gray-500'}`}>{roles[c.id]}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className={tight ? '' : 'mt-4'}>
      <p className="text-[10px] font-semibold text-gray-400 tracking-wider mb-1.5">SMIS CAMPS · {list.length}</p>
      <div className="flex flex-wrap gap-1.5">
        {list.map((c) => (
          <span key={c.id} title={`${c.generation} ${c.name}`}
            className={`px-2 py-0.5 rounded-md text-xs font-bold ${c.id === current ? 'bg-[#2E26D3] text-white' : 'bg-gray-100 text-gray-700'}`}>
            {c.code}
          </span>
        ))}
      </div>
    </div>
  );
}
