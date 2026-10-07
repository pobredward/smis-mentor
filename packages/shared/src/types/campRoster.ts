/**
 * 캠프 선생님 표 (campRosters/{jobCodeId})
 *
 * 관리자가 관리시트 '동기화 리스트'의 값을 그대로 붙여넣어 캠프별 선생님을 한 번에 배정한다.
 * - 헤더(열)는 캠프 종류(J·E / S)별로 고정 — 엑셀과 같은 순서라 값만 복사해 붙여넣으면 된다
 * - 행마다 이름으로 사용자(users)를 찾아 연결(userId) → 저장하면 캠프 배정(그룹·역할·반번호),
 *   반 정보(강의실·반이름·교재), 숙소 방, S캠프 개인정보가 알맞은 곳에 반영된다
 * - 멘토의 영어 이름 · 성별은 표에서 넣지 않는다 — 연결된 계정(멘토가 직접 넣은 값)에서 저절로 채우고,
 *   멘토가 아직 안 넣었으면 빈 칸으로 둔다 (그래야 누가 안 넣었는지 보이고 재촉할 수 있다)
 * - 주민번호·여권·휴대폰 같은 민감한 칸은 이 문서에 두지 않는다 (기존 암호화 저장소 — 관리자 표에서만 보인다)
 */

export type CampRosterTier = 'JE' | 'S';
export type CampRosterKind = 'mentor' | 'foreign';

export interface CampRosterColumn {
  key: string;
  label: string;
  /** 표 너비 (px) */
  width?: number;
  /** 민감 정보 — campRosters 문서에 저장하지 않고 개인 저장소로 보낸다 */
  sensitive?: boolean;
  /** 빈 칸이면 위 줄 값을 이어받는다 (엑셀 병합 셀) */
  inherit?: boolean;
  /**
   * 계정에서 채우는 칸 — 연결된 계정의 값(멘토가 직접 넣은 값)만 보이고 표에서 고치지 않는다.
   * 계정이 없거나 아직 안 넣었으면 빈 칸 (rosterAccountCells)
   */
  fromAccount?: boolean;
}

const C = (key: string, label: string, width = 90, extra: Partial<CampRosterColumn> = {}): CampRosterColumn => ({ key, label, width, ...extra });

/** 멘토 영어 이름 · 성별 — 계정에서 채운다 */
const ACCOUNT: Partial<CampRosterColumn> = { fromAccount: true };

const FLIGHT: CampRosterColumn[] = [
  C('arrAirport', '입소공항', 90), C('arrBooking', '예약번호(입소)', 110), C('arrSeat', '좌석번호(입소)', 100),
  C('depAirport', '퇴소공항', 90), C('depBooking', '예약번호(퇴소)', 110), C('depSeat', '좌석번호(퇴소)', 100),
];

/** 멘토 표 — J·E 캠프 */
export const ROSTER_MENTOR_COLUMNS_JE: CampRosterColumn[] = [
  C('role', '역할', 90, { inherit: true }), C('group', '그룹', 80, { inherit: true }), C('classCode', '반번호', 70),
  C('name', '반멘토', 80), C('gender', '성별', 50, ACCOUNT), C('englishName', '영어 이름', 100, ACCOUNT), C('classroom', '강의실 호수', 90),
  C('className', '반이름', 100), C('textbook', '교재', 70), C('grade', '학년', 70),
  ...FLIGHT, C('room', '방호수', 70),
];

/** 멘토 표 — S 캠프 (여권·주민번호 등 포함) */
export const ROSTER_MENTOR_COLUMNS_S: CampRosterColumn[] = [
  C('role', '역할', 90, { inherit: true }), C('group', '그룹', 80, { inherit: true }), C('classCode', '번호', 70),
  C('name', '반멘토', 80), C('gender', '성별', 50, ACCOUNT), C('englishName', '영어 이름', 100, ACCOUNT), C('classroom', '강의실 호수', 90),
  C('className', '반 이름', 100), C('textbook', '교재', 70), C('grade', '학년', 70),
  C('rrn', '주민등록번호', 130, { sensitive: true }), C('passportName', '여권상 영문이름', 140, { sensitive: true }),
  C('passportNumber', '여권 번호', 100, { sensitive: true }), C('passportExpiry', '여권 만료일자', 110, { sensitive: true }),
  C('shirtSize', '단체티', 60, { sensitive: true }), C('phoneNumber', '휴대폰번호', 120, { sensitive: true }),
  C('phoneModel', '휴대폰모델명', 120, { sensitive: true }),
  ...FLIGHT, C('room', '방호수', 70),
];

/** 원어민 표 */
export const ROSTER_FOREIGN_COLUMNS = (tier: CampRosterTier): CampRosterColumn[] => [
  C('group', '그룹', 80, { inherit: true }), C('subject', '과목', 90), C('englishName', '영어 이름', 110),
  C('visa', '비자', 70), C('ticket', '항공권발권', 90), C('arrival', tier === 'S' ? '공항도착' : '제주공항도착', 110),
  C('room', '방호수', 70),
];

export const rosterColumnsOf = (kind: CampRosterKind, tier: CampRosterTier): CampRosterColumn[] =>
  kind === 'foreign' ? ROSTER_FOREIGN_COLUMNS(tier) : tier === 'S' ? ROSTER_MENTOR_COLUMNS_S : ROSTER_MENTOR_COLUMNS_JE;

/** 계정에서 채우는 칸 key (멘토 표: gender · englishName) */
export const rosterAccountKeys = (kind: CampRosterKind, tier: CampRosterTier): string[] =>
  rosterColumnsOf(kind, tier).filter((c) => c.fromAccount).map((c) => c.key);

/** 계정 → 계정 칸 값. 멘토가 안 넣은 값은 '' (표에서는 빈 칸) */
export function rosterAccountCells(acc: { englishNickname?: unknown; gender?: unknown } | null | undefined): Record<string, string> {
  const g = String(acc?.gender ?? '').trim().toUpperCase();
  return { englishName: String(acc?.englishNickname ?? '').trim(), gender: g === 'M' || g === 'F' ? g : '' };
}

/**
 * 표 한 줄의 계정 칸을 계정 값으로 바꾼다 — 연결된 계정이 없으면 비운다 (표에 적어 둔 값은 쓰지 않는다)
 * acc: 그 줄에 연결된 계정 (users 문서) — 연결이 없으면 null
 */
export function rosterRowWithAccount<R extends CampRosterRow>(kind: CampRosterKind, tier: CampRosterTier, row: R, acc: { englishNickname?: unknown; gender?: unknown } | null | undefined): R {
  const keys = rosterAccountKeys(kind, tier);
  if (!keys.length) return row;
  const vals = rosterAccountCells(row.userId ? acc : null);
  const cells = { ...(row.cells ?? {}) };
  keys.forEach((k) => { if (vals[k]) cells[k] = vals[k]; else delete cells[k]; });
  return { ...row, cells };
}

/** 캠프 코드 첫 글자로 표 종류 — S 만 따로, 나머지는 J·E 표 */
export const rosterTierOf = (campCode: string): CampRosterTier => (String(campCode ?? '').trim().charAt(0).toUpperCase() === 'S' ? 'S' : 'JE');

/** 표 한 줄 — cells 는 열 key → 값 (민감 칸은 문서에 저장되지 않는다) */
export interface CampRosterRow {
  cells: Record<string, string>;
  /** 연결된 사용자 — 없으면 아직 매칭 안 됨(저장 시 건너뜀) */
  userId?: string | null;
}

export interface CampRosterDoc {
  jobCodeId: string;
  campCode: string;
  tier: CampRosterTier;
  mentors: CampRosterRow[];
  foreign: CampRosterRow[];
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string;
}

/** 역할 칸 → groupRole (담임 멘토 → 담임 …). 모르면 '' */
export function rosterMentorRole(v: string): string {
  const s = String(v ?? '').replace(/\s+/g, '');
  if (!s) return '';
  if (/부매니저|sub/i.test(s)) return '부매니저';
  if (/매니저|manager/i.test(s)) return '매니저';
  if (/수업/.test(s)) return '수업';
  if (/담임/.test(s)) return '담임';
  return '';
}

/** 과목 칸 → 원어민 groupRole */
export function rosterForeignRole(v: string): string {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return '';
  if (s.startsWith('speak')) return 'Speaking';
  if (s.startsWith('read')) return 'Reading';
  if (s.startsWith('writ')) return 'Writing';
  if (s.startsWith('mix')) return 'Mix';
  if (s.startsWith('sub')) return 'Sub Manager';
  if (s.startsWith('manag')) return 'Manager';
  return '';
}

const GROUP_KEYS: Record<string, string> = {
  spring: 'spring', 스프링: 'spring', summer: 'summer', 서머: 'summer', 썸머: 'summer', autumn: 'autumn', fall: 'autumn', 어텀: 'autumn',
  winter: 'winter', 윈터: 'winter', junior: 'junior', 주니어: 'junior', middle: 'middle', 미들: 'middle', senior: 'senior', 시니어: 'senior',
  common: 'common', 공통: 'common', manager: 'manager', 매니저: 'manager', all: 'manager', 전체: 'manager',
  short1: 'short1', short2: 'short2', short3: 'short3', short4: 'short4', 단기1: 'short1', 단기2: 'short2', 단기3: 'short3', 단기4: 'short4',
};

/** 그룹 칸 → jobExperiences.group 키 (Spring → spring, All → manager). 모르는 이름은 common */
export function rosterGroupKey(v: string): string {
  const s = String(v ?? '').replace(/\s+/g, '').toLowerCase();
  if (!s) return '';
  return GROUP_KEYS[s] ?? 'common';
}

/** 방호수 칸 → 숙소 방 번호 ('432호' → '432') */
export const rosterRoomNum = (v: string) => String(v ?? '').replace(/호/g, '').replace(/\s+/g, '').trim();

/** 빈 칸 '-'·'x' 는 값 없음으로 */
export const rosterBlank = (v: string | undefined) => {
  const s = String(v ?? '').trim();
  return s === '-' || s === '–' ? '' : s;
};

/** 병합 셀 — inherit 열의 빈 칸을 위 줄 값으로 채운 복사본 */
export function rosterFillInherited(rows: CampRosterRow[], cols: CampRosterColumn[]): CampRosterRow[] {
  const keys = cols.filter((c) => c.inherit).map((c) => c.key);
  const last: Record<string, string> = {};
  return rows.map((r) => {
    const cells = { ...r.cells };
    keys.forEach((k) => {
      const v = String(cells[k] ?? '').trim();
      if (v) last[k] = v; else if (last[k]) cells[k] = last[k];
    });
    return { ...r, cells };
  });
}

/** 줄이 비었는지 (모든 칸이 비었으면 저장하지 않는다) */
export const rosterRowEmpty = (r: CampRosterRow) => !Object.values(r.cells ?? {}).some((v) => String(v ?? '').trim());

/** 매칭에 쓰는 이름 — 멘토는 반멘토, 원어민은 영어 이름 */
export const rosterMatchName = (kind: CampRosterKind, r: CampRosterRow) => String((kind === 'foreign' ? r.cells.englishName : r.cells.name) ?? '').trim();

/** 한 사람의 이 캠프 표 정보 (프로필·학생 모달·명단 등에서 쓰기 좋게) */
export interface CampRosterEntry {
  kind: CampRosterKind;
  userId: string;
  cells: Record<string, string>;
}

/** 표에서 userId 로 그 사람 줄 찾기 */
export function rosterEntryOf(doc: CampRosterDoc | null | undefined, userId: string | null | undefined): CampRosterEntry | null {
  if (!doc || !userId) return null;
  for (const kind of ['mentor', 'foreign'] as const) {
    const r = (kind === 'mentor' ? doc.mentors : doc.foreign)?.find((x) => x.userId === userId);
    if (r) return { kind, userId, cells: r.cells ?? {} };
  }
  return null;
}

/** 반번호 → 그 반 담임 줄 (영어 이름·강의실 등) */
export function rosterByClassCode(doc: CampRosterDoc | null | undefined): Map<string, CampRosterRow> {
  const m = new Map<string, CampRosterRow>();
  (doc?.mentors ?? []).forEach((r) => {
    const cc = String(r.cells?.classCode ?? '').trim().toUpperCase();
    if (cc && !m.has(cc)) m.set(cc, r);
  });
  return m;
}
