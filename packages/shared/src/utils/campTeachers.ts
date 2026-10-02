/**
 * 캠프 선생님 화면 (관리자 '한국인 멘토 선생님' · '원어민 선생님') — web·mobile 공용 데이터 규칙.
 *
 *  - 사람 목록: '선생님 명단 관리'(campRosters) 표가 있으면 그 순서·그룹·반, 없으면 캠프 배정(jobExperiences)
 *  - 묶기: 운영진(매니저 → 부매니저) · 그룹(CAMP_GROUP_ORDER) — 멘토는 담임(반 순서) → 수업, 원어민은 Speaking → Reading → Writing → Mix
 *  - 한국인 멘토 소개: 나이(주민번호 앞자리로, 세는 나이) · 성별 · 학교/학과 · 참여 횟수
 *  - 원어민 소개: 국적 · 참여 횟수 · 경력 연수 · 경력
 *  - 참여 캠프마다 그때의 역할 ("Senior 담임 S10")
 * 화면(색·크기)은 web/mobile 이 각자. 수업 자료 불러오기는 services/campTeachers.ts
 */
import { getAgeFromRRN } from './rrn';
import { sortTeachingExperiences, type TeachingExperienceItem } from '../types/teachingExperience';
import { rosterColumnsOf, rosterFillInherited, type CampRosterDoc } from '../types/campRoster';
import { compareGroupNames } from '../types/campTimetable';

export type CampTeacherKind = 'mentor' | 'foreign';

export interface CampTeacher {
  key: string;
  kind: CampTeacherKind;
  name: string;
  englishName: string;
  photo: string;
  /** 담임·수업·매니저·부매니저 / Speaking… */
  role: string;
  /** 표시용 그룹 이름 (Spring …) */
  group: string;
  classCode: string;
  className: string;
  /** 반 학년 (표의 '학년' 칸) */
  grade: string;
  userId?: string;
  /** 참여한 캠프 (jobCode id) */
  campIds?: string[];
  /** 캠프(jobCode id)별 그때의 역할 — "Senior 담임 S10", "매니저" */
  campRoles?: Record<string, string>;
  smisCount?: number;
  // 원어민
  nationality?: string;
  teachingYears?: string;
  teachingExperience?: string;
  teachingExperiences?: TeachingExperienceItem[];
  // 한국인 멘토
  age?: number;
  gender?: string;
  school?: string;
  major?: string;
  schoolYear?: string;
}

/** 이 캠프에서 올린 수업 자료 칸 — url: 열 수 있는 링크가 하나라도 있으면, view: 공개보기, original: 원본 */
export interface TeacherLessonItem { title: string; url: string; view: string; original: string }
export interface TeacherLesson {
  topics: { title: string; done: number; total: number; sections: TeacherLessonItem[] }[];
  done: number;
  total: number;
  failed?: boolean;
}

type UserLike = Record<string, any> & { userId?: string };

export const TEACHER_GROUP_NAME: Record<string, string> = {
  spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter', junior: 'Junior', middle: 'Middle', senior: 'Senior',
  common: 'Common', manager: '운영진', short1: '단기 1', short2: '단기 2', short3: '단기 3', short4: '단기 4',
};

export const CAMP_TEACHER_TITLE: Record<CampTeacherKind, string> = { mentor: '한국인 멘토 선생님', foreign: '원어민 선생님' };

const FLAG: Record<string, string> = {
  'united states': '🇺🇸', usa: '🇺🇸', 'u.s.a': '🇺🇸', canada: '🇨🇦', 'united kingdom': '🇬🇧', uk: '🇬🇧', 'u.k': '🇬🇧', ireland: '🇮🇪',
  australia: '🇦🇺', 'new zealand': '🇳🇿', 'south africa': '🇿🇦', philippines: '🇵🇭', india: '🇮🇳',
};
export const countryFlag = (n?: string) => FLAG[String(n ?? '').trim().toLowerCase()] ?? '';
export const ordinalEn = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

export const isStaffRole = (role: string) => /매니저|manager/i.test(role);
/** 운영진 차례 — 매니저 0, 부매니저 1 */
export const staffRank = (role: string) => (/부매니저|sub/i.test(role) ? 1 : /매니저|manager/i.test(role) ? 0 : 2);
const groupKeyOf = (label: string) => String(label ?? '').trim().toLowerCase();
const FOREIGN_ORDER: Record<string, number> = { speaking: 1, reading: 2, writing: 3, mix: 4 };

/** 원어민 이름 — 이름 + 성 (미들네임 빼고). 대문자로만 적힌 이름은 첫 글자만 대문자로 */
export function foreignFullName(u: UserLike | null | undefined): string {
  const tidy = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ');
  const cap = (v: string) => (v && v === v.toUpperCase() ? v.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_m, a, b) => a + b.toUpperCase()) : v);
  const first = tidy(u?.foreignTeacher?.firstName), last = tidy(u?.foreignTeacher?.lastName);
  if (first) return cap([first, last].filter(Boolean).join(' '));
  const parts = tidy(u?.name).split(' ').filter(Boolean);
  return cap(parts.length >= 3 ? `${parts[0]} ${parts[parts.length - 1]}` : parts.join(' '));
}

/** 캠프별 그때의 역할 — 그룹(매니저·공통 제외) · 역할 · 담임이면 반번호 */
export function campRolesOf(u: UserLike | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  (u?.jobExperiences ?? []).forEach((e: any) => {
    if (!e?.id) return;
    const g = String(e.group ?? '').trim();
    const gk = g.toLowerCase();
    const role = String(e.groupRole ?? '').trim();
    out[e.id] = [gk && gk !== 'manager' && gk !== 'common' ? TEACHER_GROUP_NAME[gk] ?? g : '', role, role === '담임' ? String(e.classCode ?? '') : '']
      .filter(Boolean).join(' ');
  });
  return out;
}

const campIdsOf = (u: UserLike): string[] =>
  Array.isArray(u.jobCodeIds) ? [...new Set<string>(u.jobCodeIds)] : (u.jobExperiences ?? []).map((e: any) => e?.id).filter(Boolean);
const smisCountOf = (u: UserLike) =>
  Array.isArray(u.jobCodeIds) ? new Set(u.jobCodeIds).size : Array.isArray(u.jobExperiences) ? u.jobExperiences.length : 0;

/** 사용자 문서 → 원어민 소개 (참여 횟수는 캠프 배정 수) */
export function foreignIntroOf(u: UserLike | null | undefined): Partial<CampTeacher> {
  if (!u) return {};
  const nat = String(u.nationality ?? '');
  return {
    userId: u.userId,
    nationality: /^\+/.test(nat) ? '' : nat,
    smisCount: smisCountOf(u),
    teachingYears: String(u.teachingYears ?? ''),
    teachingExperience: String(u.teachingExperience ?? ''),
    teachingExperiences: Array.isArray(u.teachingExperiences) ? sortTeachingExperiences(u.teachingExperiences) : [],
    campRoles: campRolesOf(u),
    campIds: campIdsOf(u),
  };
}

/** 사용자 문서 → 한국인 멘토 소개 (나이는 주민번호 앞자리로 — 저장된 나이는 가입 때 값이라 해가 지나면 틀린다) */
export function mentorIntroOf(u: UserLike | null | undefined): Partial<CampTeacher> {
  if (!u) return {};
  const digit = String(u.rrnGenderDigit ?? u.rrnLast ?? '').charAt(0);
  const age = (u.rrnFront && digit ? getAgeFromRRN(String(u.rrnFront), digit) : 0) || Number(u.age) || 0;
  const grade = Number(u.grade) || 0;
  return {
    userId: u.userId,
    age: age > 0 ? age : undefined,
    gender: u.gender === 'M' ? '남' : u.gender === 'F' ? '여' : '',
    school: String(u.university || u.school || '').trim(),
    major: [u.major1 || u.major, u.major2].map((v) => String(v ?? '').trim()).filter(Boolean).join(' · '),
    schoolYear: [grade ? (grade >= 5 ? '졸업' : `${grade}학년`) : '', u.isOnLeave ? '휴학' : ''].filter(Boolean).join(' '),
    smisCount: smisCountOf(u),
    campIds: campIdsOf(u),
    campRoles: campRolesOf(u),
  };
}

/** 표의 역할 칸 → 담임·수업·매니저·부매니저 */
export function mentorRoleOf(v: string): string {
  const s = String(v ?? '').replace(/\s+/g, '');
  if (/부매니저|sub/i.test(s)) return '부매니저';
  if (/매니저|manager/i.test(s)) return '매니저';
  if (/수업/.test(s)) return '수업';
  if (/담임/.test(s)) return '담임';
  return String(v ?? '').trim();
}

/** 표(있으면) 또는 캠프 배정으로 사람 목록 */
export function buildCampTeachers(jobCodeId: string, users: UserLike[], roster: CampRosterDoc | null | undefined): CampTeacher[] {
  const byId = new Map(users.map((u) => [u.userId, u]));
  const photoOf = (uid?: string | null) => (uid && byId.get(uid)?.profileImage) || '';
  if (roster && ((roster.mentors?.length ?? 0) + (roster.foreign?.length ?? 0)) > 0) {
    const out: CampTeacher[] = [];
    rosterFillInherited(roster.mentors ?? [], rosterColumnsOf('mentor', roster.tier)).forEach((r, i) => {
      const c = r.cells;
      const u = r.userId ? byId.get(r.userId) : undefined;
      const name = u?.name || c.name || '';
      if (!name) return;
      out.push({
        key: `m${i}`, kind: 'mentor', name, englishName: c.englishName || u?.englishNickname || '', photo: photoOf(r.userId),
        role: mentorRoleOf(c.role || ''), group: c.group || '', classCode: c.classCode || '', className: c.className || '', grade: c.grade || '',
        ...mentorIntroOf(u),
      });
    });
    rosterFillInherited(roster.foreign ?? [], rosterColumnsOf('foreign', roster.tier)).forEach((r, i) => {
      const c = r.cells;
      const u = r.userId ? byId.get(r.userId) : undefined;
      const name = (u && foreignFullName(u)) || c.englishName || '';
      if (!name) return;
      out.push({ key: `f${i}`, kind: 'foreign', name, englishName: '', photo: photoOf(r.userId), role: c.subject || '', group: c.group || '', classCode: '', className: '', grade: '', ...foreignIntroOf(u) });
    });
    return out;
  }
  // 표가 없을 때 — 캠프 배정 정보로 (가입 전 임시 원어민도)
  return users
    .filter((u) => u.status !== 'deleted' && u.status !== 'inactive' && ['mentor', 'mentor_temp', 'foreign', 'foreign_temp', 'admin'].includes(String(u.role)))
    .map((u) => {
      const exp = (u.jobExperiences ?? []).find((e: any) => e?.id === jobCodeId);
      const foreign = u.role === 'foreign' || u.role === 'foreign_temp';
      const g = String(exp?.group ?? '');
      return {
        key: String(u.userId), kind: foreign ? 'foreign' : 'mentor', name: foreign ? foreignFullName(u) : String(u.name ?? ''),
        ...(foreign ? foreignIntroOf(u) : mentorIntroOf(u)),
        englishName: foreign ? '' : String(u.englishNickname ?? ''), photo: String(u.profileImage ?? ''),
        role: String(exp?.groupRole ?? ''), group: TEACHER_GROUP_NAME[g] ?? g, classCode: String(exp?.classCode ?? ''), className: '', grade: '',
      } as CampTeacher;
    })
    .filter((p) => p.role || p.group);
}

export interface CampTeacherGroups {
  /** 운영진 (매니저 → 부매니저) + 그룹이 'All' 인 사람 */
  staff: CampTeacher[];
  sections: Array<{ g: string; list: CampTeacher[]; grades: string[] }>;
  count: number;
}

/** 운영진 · 그룹별로 묶기 */
export function groupCampTeachers(people: CampTeacher[], kind: CampTeacherKind): CampTeacherGroups {
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
  staff.sort((a, b) => staffRank(a.role) - staffRank(b.role) || compareGroupNames(a.group, b.group));
  return { staff: [...staff, ...extra], sections, count: mine.length };
}

/** 카드 한 줄 설명 — 운영진: "Senior 매니저", 담임: "S05 · Grit", 수업: "패턴 수업" */
export function campTeacherCaption(p: CampTeacher, staff: boolean): string {
  if (staff) return [p.group && groupKeyOf(p.group) !== 'all' ? p.group : '', p.role].filter(Boolean).join(' ');
  if (p.kind === 'foreign') return p.role;
  return p.role === '담임' ? [p.classCode, p.className].filter(Boolean).join(' · ') : p.role === '수업' ? '패턴 수업' : p.role;
}

/** 올린 칸만 (링크 없는 주제·칸은 뺀다) */
export function uploadedLessonTopics(lesson: TeacherLesson | null | undefined) {
  return (lesson?.topics ?? [])
    .map((t) => ({ ...t, sections: t.sections.filter((s) => s.url) }))
    .filter((t) => t.sections.length > 0);
}
