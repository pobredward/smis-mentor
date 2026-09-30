'use client';
import { compareCampCodes } from '@smis-mentor/shared';

/**
 * 멘토 선생님 / 원어민 선생님 (관리자 · 캠프 설명회용)
 * "이 선생님들이 참여합니다" — 캠프별로 운영진과 그룹별 선생님을 사진 카드로 보여 준다. kind 로 멘토·원어민 페이지를 나눈다.
 * - 그룹 순서는 shared 의 CAMP_GROUP_ORDER (compareGroupNames) 하나를 따른다
 * - 순서·그룹·반은 '선생님 명단 관리'(campRosters) 기준. 표가 없으면 캠프 배정(jobExperiences)으로 만든다
 * - 연락처·대학·개인정보는 보이지 않는다 (관리용 표·알림 현황은 '선생님 명단 관리' 페이지로 옮김)
 * - 발표 모드: 메뉴를 가리고 화면을 꽉 채운다 (Esc 로 나가기)
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/common/Layout';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { getAllJobCodes, getUsersByJobCodeId } from '@/lib/firebaseService';
import type { JobCodeWithId, User } from '@/types';
import {
  compareGroupNames,
  formatTeachingPeriod,
  getCampRoster,
  resolveActiveJobCodeId,
  sortTeachingExperiences,
  type TeachingExperienceItem,
  rosterColumnsOf,
  rosterFillInherited,
  type CampRosterDoc,
} from '@smis-mentor/shared';

type Person = {
  key: string;
  kind: 'mentor' | 'foreign';
  name: string;
  englishName: string;
  photo: string;
  role: string;        // 담임·수업·매니저·부매니저 / Speaking…
  group: string;       // 표시용 그룹 이름 (Spring …)
  classCode: string;
  className: string;
  grade: string;
  /** 원어민 소개용 — 국적 · SMIS 참여 횟수 · 경력 연수 · 경력 */
  nationality?: string;
  smisCount?: number;
  teachingYears?: string;
  teachingExperience?: string;
  /** 마이페이지에서 쓴 경력 (역할·장소·기간·내용) — 있으면 이걸 먼저 보여 준다 */
  teachingExperiences?: TeachingExperienceItem[];
  /** 참여한 캠프 (jobCode id) — 확대 창에 코드로 보여 준다 */
  campIds?: string[];
};

/** 원어민 이름 — 이름 + 성 (미들네임 빼고). 대문자로만 적힌 이름은 첫 글자만 대문자로 */
function foreignFullName(u: any): string {
  const tidy = (v: string) => String(v ?? '').trim().replace(/\s+/g, ' ');
  const cap = (v: string) => (v && v === v.toUpperCase() ? v.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_m, a, b) => a + b.toUpperCase()) : v);
  const first = tidy(u?.foreignTeacher?.firstName), last = tidy(u?.foreignTeacher?.lastName);
  if (first) return cap([first, last].filter(Boolean).join(' '));
  const parts = tidy(u?.name).split(' ').filter(Boolean);
  return cap(parts.length >= 3 ? `${parts[0]} ${parts[parts.length - 1]}` : parts.join(' '));
}

/** 사용자 문서 → 원어민 소개 정보 (참여 횟수는 캠프 배정 수) */
function introOf(u: any): Pick<Person, 'nationality' | 'smisCount' | 'teachingYears' | 'teachingExperience' | 'teachingExperiences' | 'campIds'> {
  if (!u) return {};
  const nat = String(u.nationality ?? '');
  return {
    nationality: /^\+/.test(nat) ? '' : nat,
    smisCount: Array.isArray(u.jobCodeIds) ? new Set(u.jobCodeIds).size : Array.isArray(u.jobExperiences) ? u.jobExperiences.length : 0,
    teachingYears: String(u.teachingYears ?? ''),
    teachingExperience: String(u.teachingExperience ?? ''),
    teachingExperiences: Array.isArray(u.teachingExperiences) ? sortTeachingExperiences(u.teachingExperiences) : [],
    campIds: Array.isArray(u.jobCodeIds) ? [...new Set<string>(u.jobCodeIds)] : (u.jobExperiences ?? []).map((e: any) => e?.id).filter(Boolean),
  };
}
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const FLAG: Record<string, string> = {
  'united states': '🇺🇸', usa: '🇺🇸', 'u.s.a': '🇺🇸', canada: '🇨🇦', 'united kingdom': '🇬🇧', uk: '🇬🇧', 'u.k': '🇬🇧', ireland: '🇮🇪',
  australia: '🇦🇺', 'new zealand': '🇳🇿', 'south africa': '🇿🇦', philippines: '🇵🇭', india: '🇮🇳',
};
const flagOf = (n?: string) => FLAG[String(n ?? '').trim().toLowerCase()] ?? '';

const GROUP_NAME: Record<string, string> = {
  spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter', junior: 'Junior', middle: 'Middle', senior: 'Senior',
  common: 'Common', manager: '운영진', short1: '단기 1', short2: '단기 2', short3: '단기 3', short4: '단기 4',
};
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
const isStaffRole = (role: string) => /매니저|manager/i.test(role);
const groupKeyOf = (label: string) => label.trim().toLowerCase();

function mentorRoleOf(v: string) {
  const s = v.replace(/\s+/g, '');
  if (/부매니저|sub/i.test(s)) return '부매니저';
  if (/매니저|manager/i.test(s)) return '매니저';
  if (/수업/.test(s)) return '수업';
  if (/담임/.test(s)) return '담임';
  return v.trim();
}
const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') return (v as { toDate: () => Date }).toDate();
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmt = (d: Date | null) => (d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` : '');

/** 표(있으면) 또는 캠프 배정으로 사람 목록 만들기 */
function buildPeople(jobCodeId: string, users: User[], roster: CampRosterDoc | null): Person[] {
  const byId = new Map(users.map((u) => [u.userId, u]));
  const photoOf = (uid?: string | null) => (uid && (byId.get(uid) as any)?.profileImage) || '';
  if (roster && ((roster.mentors?.length ?? 0) + (roster.foreign?.length ?? 0)) > 0) {
    const out: Person[] = [];
    rosterFillInherited(roster.mentors ?? [], rosterColumnsOf('mentor', roster.tier)).forEach((r, i) => {
      const c = r.cells;
      const u = r.userId ? byId.get(r.userId) : undefined;
      const name = u?.name || c.name || '';
      if (!name) return;
      out.push({
        key: `m${i}`, kind: 'mentor', name, englishName: c.englishName || (u as any)?.englishNickname || '', photo: photoOf(r.userId),
        role: mentorRoleOf(c.role || ''), group: c.group || '', classCode: c.classCode || '', className: c.className || '', grade: c.grade || '',
      });
    });
    rosterFillInherited(roster.foreign ?? [], rosterColumnsOf('foreign', roster.tier)).forEach((r, i) => {
      const c = r.cells;
      const u = r.userId ? byId.get(r.userId) : undefined;
      const name = (u && foreignFullName(u)) || c.englishName || '';
      if (!name) return;
      out.push({ key: `f${i}`, kind: 'foreign', name, englishName: '', photo: photoOf(r.userId), role: c.subject || '', group: c.group || '', classCode: '', className: '', grade: '', ...introOf(u) });
    });
    return out;
  }
  // 표가 없을 때 — 캠프 배정 정보로
  return users
    .filter((u) => u.status !== 'deleted' && u.status !== 'inactive' && ['mentor', 'mentor_temp', 'foreign', 'foreign_temp', 'admin'].includes(String(u.role)))
    .map((u) => {
      const exp = (u.jobExperiences ?? []).find((e: any) => e?.id === jobCodeId) as any;
      const foreign = u.role === 'foreign' || u.role === 'foreign_temp';   // 가입 전(임시) 원어민도 — DB 시트에서 옮겨 옴
      const g = String(exp?.group ?? '');
      return {
        key: u.userId, kind: foreign ? 'foreign' : 'mentor', name: foreign ? foreignFullName(u) : u.name,
        ...(foreign ? introOf(u) : {}),
        englishName: foreign ? '' : (u as any).englishNickname ?? '', photo: (u as any).profileImage ?? '',
        role: String(exp?.groupRole ?? ''), group: GROUP_NAME[g] ?? g, classCode: String(exp?.classCode ?? ''), className: '', grade: '',
      } as Person;
    })
    .filter((p) => p.role || p.group);
}

const FOREIGN_ORDER: Record<string, number> = { speaking: 1, reading: 2, writing: 3, mix: 4 };
const TITLE = { mentor: '한국인 멘토 선생님', foreign: '원어민 선생님' } as const;

export default function CampTeachersShowcase({ kind }: { kind: 'mentor' | 'foreign' }) {
  const { userData } = useAuth();
  const [codes, setCodes] = useState<JobCodeWithId[]>([]);
  const [gen, setGen] = useState('');
  const [jobCodeId, setJobCodeId] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [present, setPresent] = useState(false);
  const [zoom, setZoom] = useState<Person | null>(null);

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
      .then(([us, roster]) => { if (alive) setPeople(buildPeople(jobCodeId, us as User[], roster)); })
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
  const gens = useMemo(() => [...new Set(codes.map((c) => String(c.generation)))], [codes]);

  const view = useMemo(() => {
    const mine = people.filter((p) => p.kind === kind);
    const staff = mine.filter((p) => isStaffRole(p.role));
    const rest = mine.filter((p) => !isStaffRole(p.role));
    const groups: string[] = [];
    rest.forEach((p) => { const g = p.group || '기타'; if (!groups.includes(g) && groupKeyOf(g) !== 'all') groups.push(g); });
    groups.sort((a, b) => compareGroupNames(a, b));   // 단기1~4 는 맨 아래 — 앱 공통 순서
    const sections = groups.map((g) => {
      const inG = rest.filter((p) => (p.group || '기타') === g);
      const list = kind === 'foreign'
        ? [...inG].sort((a, b) => (FOREIGN_ORDER[a.role.toLowerCase()] ?? 9) - (FOREIGN_ORDER[b.role.toLowerCase()] ?? 9))
        : [
          ...inG.filter((p) => p.role === '담임').sort((a, b) => a.classCode.localeCompare(b.classCode, 'en', { numeric: true })),
          ...inG.filter((p) => p.role !== '담임'),
        ];
      const grades = [...new Set(inG.filter((p) => p.role === '담임').map((p) => p.grade).filter(Boolean))];
      return { g, list, grades };
    });
    const extra = rest.filter((p) => groupKeyOf(p.group) === 'all');
    staff.sort((a, b) => compareGroupNames(a.group, b.group));
    return { staff: [...staff, ...extra], sections, count: mine.length };
  }, [people, kind]);

  const start = toDate((jc as any)?.startDate), end = toDate((jc as any)?.endDate);

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
              {kind === 'foreign' ? <ForeignCards people={view.staff} present={present} onZoom={setZoom} /> : <Cards people={view.staff} present={present} onZoom={setZoom} caption={(p) => [p.group && groupKeyOf(p.group) !== 'all' ? p.group : '', p.role].filter(Boolean).join(' ')} />}
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
                  <Cards people={list} present={present} onZoom={setZoom} tone={tone}
                    caption={(p) => (p.role === '담임' ? [p.classCode, p.className].filter(Boolean).join(' · ') : p.role === '수업' ? '패턴 수업' : p.role)} />
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
        <div className="fixed inset-0 z-[120] bg-black/70 flex items-center justify-center p-6" onClick={() => setZoom(null)}>
          {zoom.kind === 'foreign' ? (
            <div className="bg-white rounded-3xl overflow-hidden w-full max-w-3xl max-h-[90vh] shadow-2xl grid sm:grid-cols-[280px_1fr]" onClick={(e) => e.stopPropagation()}>
              <Photo person={zoom} className="h-48 sm:h-full text-6xl" />
              <div className="p-6 sm:p-7 overflow-y-auto max-h-[calc(90vh-12rem)] sm:max-h-[90vh]">
                <ForeignHead p={zoom} big />
                <CampHistory ids={zoom.campIds ?? []} codes={codes} current={jobCodeId} />
                <Experience p={zoom} />
              </div>
            </div>
          ) : (
          <div className="bg-white rounded-3xl overflow-hidden w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <Photo person={zoom} className="aspect-[4/5] text-6xl" />
            <div className="p-6 text-center">
              <p className="text-2xl font-extrabold text-gray-900">{zoom.name}</p>
              {zoom.englishName && <p className="text-lg text-gray-500 mt-0.5">{zoom.englishName}</p>}
              <p className="text-sm text-gray-400 mt-2">{[zoom.group, zoom.role === '담임' ? `담임 ${zoom.classCode}` : zoom.role, zoom.className].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          )}
        </div>
      )}
    </Layout>
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

function Cards({ people, present, onZoom, label, caption, tone }: {
  people: Person[]; present: boolean; onZoom: (p: Person) => void; label?: string; caption: (p: Person) => string; tone?: { soft: string; text: string };
}) {
  return (
    <div className="mb-7">
      {label && <p className={`text-xs font-bold tracking-wider mb-2.5 ${tone?.text ?? 'text-gray-500'}`}>{label}</p>}
      <div className={`grid gap-3 ${present ? 'grid-cols-5 lg:grid-cols-6 2xl:grid-cols-8' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'}`}>
        {people.map((p) => (
          <button key={p.key} onClick={() => onZoom(p)} className="group text-left rounded-2xl bg-white ring-1 ring-gray-200 overflow-hidden hover:ring-gray-300 hover:shadow-lg transition">
            <div className="overflow-hidden">
              <Photo person={p} className="aspect-[4/5] text-4xl group-hover:scale-[1.03] transition-transform duration-300" />
            </div>
            <div className="px-3 py-2.5">
              <p className="flex items-baseline gap-1.5 flex-wrap">
                <span className={`font-extrabold text-gray-900 ${present ? 'text-lg' : 'text-base'}`}>{p.name}</span>
                {p.englishName && <span className="text-sm text-gray-400">{p.englishName}</span>}
              </p>
              {caption(p) && <p className={`text-xs font-semibold mt-1 inline-block px-2 py-0.5 rounded-full ${tone ? `${tone.soft} ${tone.text}` : 'bg-gray-100 text-gray-600'}`}>{caption(p)}</p>}
            </div>
          </button>
        ))}
      </div>
    </div>
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
function Experience({ p, compact, tight }: { p: Person; compact?: boolean; tight?: boolean }) {
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
                {it.description && !compact && <p className="text-gray-600 mt-0.5">{it.description}</p>}
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
function ForeignCards({ people, present, onZoom, tone }: { people: Person[]; present: boolean; onZoom: (p: Person) => void; tone?: { soft: string; text: string } }) {
  return (
    <>
      {/* 휴대폰 — 사진 카드만 한 줄에 셋 (경력은 눌러서) */}
      <div className="grid grid-cols-3 gap-2 md:hidden">
        {people.map((p) => (
          <button key={p.key} onClick={() => onZoom(p)} className="text-left rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
            <Photo person={p} className="aspect-[4/5] text-3xl" />
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
          <button key={p.key} onClick={() => onZoom(p)}
            className="w-full text-left rounded-2xl bg-white ring-1 ring-gray-200 overflow-hidden hover:ring-gray-300 hover:shadow-lg transition flex">
            <div className={`${present ? 'w-44' : 'w-36'} shrink-0`}><Photo person={p} className="h-full min-h-[200px] max-h-[230px] text-4xl" /></div>
            <div className="flex-1 min-w-0 p-5 grid gap-x-8 gap-y-3 grid-cols-[230px_1fr]">
              <ForeignHead p={p} tone={tone} big={present} />
              <Experience p={p} compact tight />
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

/** 참여한 캠프 — 기수 최신순, 지금 캠프는 강조 */
function CampHistory({ ids, codes, current }: { ids: string[]; codes: JobCodeWithId[]; current: string }) {
  const list = ids
    .map((id) => codes.find((c) => c.id === id))
    .filter((c): c is JobCodeWithId => !!c)
    .sort((a, b) => String(b.generation).localeCompare(String(a.generation), 'ko', { numeric: true }) || compareCampCodes(a.code, b.code));
  if (!list.length) return null;
  return (
    <div className="mt-4">
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
