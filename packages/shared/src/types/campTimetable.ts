import { Timestamp } from 'firebase/firestore';

/**
 * 캠프 시간표 — 구글시트 웹뷰를 대체하는 앱 내부 시간표
 *
 * 저장 단위: 캠프 × 그룹 × 표 종류 = 문서 1개 (예: J29 × Junior × Regular Day)
 *
 * ── 사람 이름은 하나도 저장하지 않는다 ────────────────────────────────
 * 담임   : classes[].classCode ↔ users.jobExperiences[].classCode
 * 원어민 : 그룹 + 과목        ↔ users.jobExperiences[].{group, groupRole}
 *          (원어민의 groupRole 이 곧 담당 과목: Speaking / Reading / Writing / Mix)
 * 전부 화면에서 조인하므로, 사람이 바뀌면 앱 배정만 고치면 시간표가 따라 바뀐다.
 *
 * ── 표 두 종류 ──────────────────────────────────────────────────────
 * layout 'time' (Regular / STEAM / Final Day)
 *   줄 = 교시. 반별 줄은 **1~2교시가 한 세트**다.
 *     1교시 = 한국인 선생님 과목 (Math / Speaking / Reading / Writing)
 *     2교시 = 그 과목의 원어민 (Math 는 원어민이 없어 Pattern 과 짝)
 *   관리자는 세트마다 반별 과목만 고르면 2교시는 규칙으로 채워진다.
 *
 * layout 'date' (인문학 프로그램)
 *   줄 = 날짜. 칸은 두 줄(주제 / 담당 선생님)로 보인다.
 *     주제N 은 담당 담임이 정해져 있고(ownerClassCode), 주제가 반을 돌 때 선생님도 함께 돈다.
 *     특별 활동(인문학 포스터·골든벨·스팀 활동)은 각 반 자기 담임이 맡는다.
 *   여기서도 이름은 저장하지 않고 규칙으로 유도한다.
 */

export type TimetableLayout = 'time' | 'date';

/**
 * 과목·주제의 두 번째 줄을 어떻게 채울지
 * - foreign    : 같은 그룹의 해당 과목 원어민
 * - pattern    : Pattern 전담 교사 (2교시가 Pattern 수업)
 * - owner      : 이 주제를 맡은 담임 (ownerClassCode 의 담임) — 주제와 함께 이동
 * - ownTeacher : 그 반 자기 담임
 * - none       : 두 번째 줄 없음
 */
export type SubjectPartner = 'foreign' | 'pattern' | 'owner' | 'ownTeacher' | 'staff' | 'none';

export interface TimetableSubject {
  /** 과목·주제 이름이자 키. 예: Math, 주제1, 인문학 골든벨 */
  key: string;
  partner: SubjectPartner;
  /** partner === 'owner' 일 때 이 주제를 맡은 반번호 (예: J01) */
  ownerClassCode?: string;
  /**
   * partner === 'staff' 일 때, 칸에 그 역할 담당자의 "이름"이 그대로 표시된다.
   * 예: roleKey 'Speaking' → 그 그룹의 Speaking 원어민, '수업' → 수업 멘토
   */
  roleKey?: string;
  /**
   * 과목 이름 아래 줄에 함께 보여 줄 담당자.
   * 'ownTeacher' = 그 반 담임, 그 외에는 groupRole (예: '수업')
   */
  teacherRole?: string;
  /** 짝(Pattern) 줄 아래에 함께 보여 줄 담당자. 기본 '수업' (그 그룹 수업 멘토) */
  partnerTeacherRole?: string;
  /** 짝 줄에 찍힐 수업 이름. 비우면 'Pattern' */
  partnerLabel?: string;
  /**
   * 이 과목이 늘 쓰는 강의실 (이동 수업 호수).
   * 칸마다 따로 넣은 강의실이 있으면 그쪽이 우선한다.
   */
  room?: string;
  /** 짝(Pattern) 줄이 쓰는 강의실 */
  partnerRoom?: string;
  /** 표 배경색 hex */
  color?: string;
}

/** 수업 시간표 기본 과목 */
export const DEFAULT_SUBJECTS: TimetableSubject[] = [
  { key: 'Math', partner: 'pattern', color: '#dbeafe' },
  { key: 'Speaking', partner: 'foreign', color: '#fde2e4' },
  { key: 'Reading', partner: 'foreign', color: '#fdead4' },
  { key: 'Writing', partner: 'foreign', color: '#dcf0dc' },
];

/** 로테이션에 쓰기 좋은 색 (주제1~4 등) */
export const ROTATION_COLORS = ['#dbeafe', '#fde2e4', '#fdf3c7', '#dcf0dc', '#ede9fe', '#fce7f3'];

export interface TimetableCell {
  /** 과목·주제로 채울 때. 두 번째 줄은 subjects 규칙으로 자동 */
  subject?: string;
  /** 짝이 먼저 올 때 true (예: Pattern → Math) */
  partnerFirst?: boolean;
  /** 규칙에 안 맞는 칸은 줄별로 직접 입력 */
  texts?: string[];
  /** 보조 표시 — 교재 코드 등 */
  note?: string;
  /** 이 수업이 진행되는 강의실 */
  room?: string;
  /** 짝 교시(원어민·Pattern)가 진행되는 강의실 */
  partnerRoom?: string;
}

export interface TimetableTime {
  start: string; // "09:20"
  end: string; // "10:00"
}

export interface TimetableBlock {
  id: string;
  kind: 'shared' | 'class';
  /** layout 'time' — 이 줄이 차지하는 교시. 2개면 1~2교시 세트 */
  times?: TimetableTime[];
  /** layout 'date' — 날짜 표기. 예: "1/6, 1/7" */
  dateLabel?: string;
  /**
   * layout 'date' — 이 줄이 캠프 며칠차인지 (입소일이 1일차).
   * 있으면 캠프 시작일에서 실제 날짜를 계산해 쓰므로, 기수가 바뀌어도 날짜를 다시 넣지 않아도 된다.
   * 없으면 dateLabel 을 그대로 쓴다.
   */
  dayOffsets?: number[];
  /** 칸에 표시할 줄 수 (기본: times 길이, date 는 2) */
  lines?: number;
  /** kind === 'shared' 일 때 전체에 걸쳐 표시 */
  label?: string;
  /** 공통 줄 이름 아래 작게 붙는 안내. 예: '직전 강의실에서 진행' */
  subLabel?: string;
  /** kind === 'class' 일 때 열 키(반번호 또는 전담 열) → 내용 */
  cells?: Record<string, TimetableCell>;
  color?: string;
}

export interface TimetableExtraColumn {
  key: string;
  label: string;
  /** 고정 전담 교사 이름 (직접 입력) — 되도록 teacherRole 을 쓴다 */
  teacherName?: string;
  /**
   * 이 열의 담당자를 앱 배정에서 가져올 때 쓰는 역할.
   * 예: Pattern 전담 = '수업' (그 그룹의 수업 멘토)
   */
  teacherRole?: string;
  /**
   * 당번 로테이션 — 반별 줄마다 이 순서대로 한 줄(=2교시 세트)씩 돌아간다.
   * 예: 교무실조+사진조 ['J02','J01','J04','J03']
   * 공통 줄(식사·체육·인문학)은 자동으로 건너뛴다. 이름은 담임에서 조인한다.
   */
  dutyRotation?: string[];
  /**
   * 로테이션 없이 한 사람이 내내 맡는 열.
   * 이 역할(groupRole)의 이름이 줄을 합쳐 한 번만 들어간다.
   * 예: 인문학 시간의 교무실조 = '수업' (그 그룹의 Pattern 멘토)
   */
  staffRole?: string;
  /**
   * 사람 대신 늘 같은 표시만 넣는 열. 줄을 합쳐 한 번만 들어간다.
   * 예: 인문학 시간의 교무실조 '-' (자리는 두되 담당자는 없음)
   */
  staticText?: string;
}

export interface TimetableClassColumn {
  classCode: string;
  className?: string;
  classroom?: string;
  grade?: string;
  /**
   * 담임 이름을 직접 넣은 값. 비어 있으면 앱 배정에서 가져온다.
   * 넣으면 앱과 연동되지 않는 값이므로 화면에서 구분해 보여 준다.
   */
  teacherName?: string;
}

/** 공통에서 분리해 이 표만의 값을 쓰는 항목들 */
export interface TimetableOwn {
  roster?: boolean;
  subjects?: boolean;
}

/** 공통에 올려 두는 값 (camp.ts 의 CampTimetableCommon 과 같은 모양) */
export interface TimetableCommonValues {
  classes?: TimetableClassColumn[];
  staffOverrides?: Record<string, string>;
  subjects?: TimetableSubject[];
}

export interface CampTimetable {
  id: string;
  campCode: string;
  jobCodeId: string;
  groupName: string;
  /** 표 종류 키 (regular / steam / final / humanities …) */
  dayType: string;
  dayTypeLabel: string;
  layout: TimetableLayout;
  order: number;

  classes: TimetableClassColumn[];
  extraColumns?: TimetableExtraColumn[];
  subjects?: TimetableSubject[];
  blocks: TimetableBlock[];

  note?: string;
  /**
   * 역할(소문자) → 직접 넣은 이름. 앱 배정 대신 이 값을 쓴다.
   * 예: { speaking: 'Amy', 수업: '정멘토' }
   * 앱과 연동되지 않는 값이므로 화면에서 구분해 보여 준다.
   */
  staffOverrides?: Record<string, string>;

  /**
   * 공통(그룹 한 벌)에서 떨어져 나와 이 표만의 값을 쓰는 항목.
   * 켜져 있지 않은 항목은 저장값이 남아 있어도 공통 값으로 덮어 읽는다.
   *  - roster  : classes + staffOverrides (반 구성 · 이름 수정)
   *  - subjects: 과목·주제 (스팀처럼 그 Day 만 다른 경우)
   */
  own?: TimetableOwn;

  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

/**
 * 표 카테고리 — 미리 정해 둔 목록.
 * 관리자가 아직 안 만들었어도 탭은 항상 보이고, 그 안에서 그룹별로 나뉜다.
 */
export interface TimetableCategory {
  key: string;
  label: string;
  /** 캠프 코드 첫 글자별 다른 이름 (예: J 캠프는 "스팀", S 캠프는 "고잉업") */
  labelByCampPrefix?: Record<string, string>;
  layout: TimetableLayout;
  /**
   * 하루를 통째로 쓰는 표가 아니라, 다른 날 안의 한 시간대에 들어가는 표.
   * 보기 화면에서는 탭으로 뜨지 않고 그 날 표 아래에 붙는다 (편집기에서는 그대로 고를 수 있다).
   */
  inline?: boolean;
  /** inline 표가 어느 줄에 들어가는지 — 공통 줄 이름에 이 말이 들어가면 그 자리다 */
  inlineSlotMatch?: string;
  /** 이 Day 표 아래에 교재표를 붙일지 (수업이 있는 날만) */
  showBooks?: boolean;
}

export const TIMETABLE_CATEGORIES: TimetableCategory[] = [
  { key: 'regular', label: '정규', layout: 'time', showBooks: true },
  { key: 'steam', label: '스팀', labelByCampPrefix: { J: '스팀', E: '스팀', S: '고잉업', F: '고잉업' }, layout: 'time' },
  { key: 'humanities', label: '인문학', layout: 'date', inline: true, inlineSlotMatch: '인문학' },
  { key: 'arrival', label: '입소', layout: 'time', showBooks: true },
  { key: 'arrival_d1', label: '입소 D+1', layout: 'time', showBooks: true },
  { key: 'departure_d1', label: '퇴소 D-1', layout: 'time' },
  { key: 'departure', label: '퇴소', layout: 'time' },
];

/** 캠프 코드에 맞는 카테고리 이름 */
export function categoryLabel(cat: TimetableCategory, campCode?: string | null): string {
  const prefix = (campCode ?? '').trim().charAt(0).toUpperCase();
  return cat.labelByCampPrefix?.[prefix] ?? cat.label;
}

export function findCategory(key: string | undefined | null): TimetableCategory | undefined {
  return TIMETABLE_CATEGORIES.find((c) => c.key === key);
}

/** 이전 이름 호환 */
export const DEFAULT_DAY_TYPES = TIMETABLE_CATEGORIES;

// ─── 조회 헬퍼 ─────────────────────────────────────────────────────────────

export function findSubject(
  subjects: TimetableSubject[] | undefined,
  key: string | undefined
): TimetableSubject | undefined {
  if (!key) return undefined;
  return (subjects ?? DEFAULT_SUBJECTS).find((s) => s.key.toLowerCase() === key.toLowerCase());
}

const GROUP_ALIASES: Record<string, string> = {
  junior: 'junior',
  주니어: 'junior',
  middle: 'middle',
  미들: 'middle',
  senior: 'senior',
  시니어: 'senior',
  spring: 'spring',
  스프링: 'spring',
  summer: 'summer',
  서머: 'summer',
  autumn: 'autumn',
  어텀: 'autumn',
  winter: 'winter',
  윈터: 'winter',
  common: 'common',
  공통: 'common',
};

/** 그룹 이름 표기 차이를 흡수 (Junior / junior / 주니어 / "Junior Group") */
export function normalizeGroupKey(name: string | undefined | null): string {
  if (!name) return '';
  const cleaned = name.replace(/group/gi, '').trim().toLowerCase();
  return GROUP_ALIASES[cleaned] ?? cleaned;
}

export function isSameGroup(a: string | undefined | null, b: string | undefined | null): boolean {
  const ka = normalizeGroupKey(a);
  return !!ka && ka === normalizeGroupKey(b);
}

/** 이름 하나와, 그게 앱 배정에서 온 것인지 직접 입력한 것인지 */
export interface ResolvedName {
  name: string;
  /** true 면 관리자가 직접 넣은 값 (앱과 연동되지 않음) */
  manual?: boolean;
}

export interface RenderContext {
  subjects?: TimetableSubject[];
  /** 이 칸이 속한 열 키 (반번호 또는 전담 열) */
  columnKey: string;
  /** 그룹 안에서 역할(groupRole)로 사람 이름 조회. 원어민은 Speaking/Reading/Writing, 수업 멘토는 '수업' */
  resolveForeign: (subjectKey: string) => ResolvedName | undefined;
  /** 반번호 → 담임 이름 */
  resolveTeacher: (classCode: string) => ResolvedName | undefined;
  patternLabel?: string;
}

/**
 * 시간표에 쓸 이름 — 맨 앞 단어만.
 * 원어민 이름은 "Amy Johnson" 처럼 성까지 들어와 있는데 칸이 좁고 부르는 이름은 앞쪽이다.
 * 관리자가 직접 넣은 값은 이 손질을 하지 않는다 (그대로 보여 줘야 하니까).
 */
export function firstName(full: string | undefined): string {
  return (full ?? '').trim().split(/\s+/)[0] ?? '';
}

/**
 * 전담 열 이름을 좁은 칸에서 두 줄로 나눈다.
 * "교무실(사진)조" → ["교무실", "(사진)조"]. 나눌 데가 없으면 한 줄 그대로.
 */
export function columnLabelLines(label: string): string[] {
  const i = label.indexOf('(');
  if (i > 0 && label.length > 5) return [label.slice(0, i), label.slice(i)];
  return [label];
}

/**
 * 이름 해석기를 만든다 — 직접 입력한 값이 있으면 그것을, 없으면 앱 배정을 쓴다.
 * web/mobile 이 같은 규칙을 쓰도록 여기 한 군데에만 둔다.
 */
export function makeNameResolvers(
  timetable: Pick<CampTimetable, 'classes' | 'staffOverrides'> | undefined,
  teacherByClassCode: Record<string, string>,
  staffByRole: Record<string, string>
): Pick<RenderContext, 'resolveForeign' | 'resolveTeacher'> {
  const overrides = timetable?.staffOverrides ?? {};
  return {
    resolveTeacher: (classCode) => {
      const manual = timetable?.classes?.find((c) => c.classCode === classCode)?.teacherName?.trim();
      if (manual) return { name: manual, manual: true };
      const joined = teacherByClassCode[classCode];
      return joined ? { name: joined } : undefined;
    },
    resolveForeign: (role) => {
      const k = role.toLowerCase();
      const manual = overrides[k]?.trim();
      if (manual) return { name: manual, manual: true };
      const joined = firstName(staffByRole[k]);
      return joined ? { name: joined } : undefined;
    },
  };
}

export interface RenderedLine {
  text: string;
  /** 같은 칸에 줄바꿈해서 작게 붙는 담당자 이름 */
  sub?: string;
  /** 이 줄의 강의실 */
  room?: string;
  /** text 자체가 사람 이름인 줄 (과목명과 다른 색으로 보여 준다) */
  isName?: boolean;
  /** 아직 배정되지 않아 자리표시만 보여 주는 줄 */
  muted?: boolean;
  /** 앱 배정이 아니라 직접 입력한 이름 — 화면에서 구분해 보여 준다 */
  manual?: boolean;
  /** sub(아래 줄 담당자)가 직접 입력한 이름인지 */
  subManual?: boolean;
}

/** 한 칸이 줄별로 어떻게 보이는지 계산한다 (이름은 전부 여기서 유도된다) */
export function renderCell(
  cell: TimetableCell | undefined,
  lineCount: number,
  ctx: RenderContext
): RenderedLine[] {
  const blank: RenderedLine[] = Array.from({ length: lineCount }, () => ({ text: '' }));
  if (!cell) return blank;

  if (cell.texts?.length) {
    return blank.map((_, i) => ({ text: cell.texts?.[i] ?? '' }));
  }
  if (!cell.subject) return blank;

  const spec = findSubject(ctx.subjects, cell.subject);
  if (spec?.partner === 'staff') {
    const hit = ctx.resolveForeign(spec.roleKey ?? spec.key);
    const line: RenderedLine = hit
      ? { text: hit.name, manual: hit.manual }
      : { text: `${spec.roleKey ?? spec.key} 미배정`, muted: true };
    return blank.map((_, i) => (i === 0 ? line : { text: '' }));
  }
  const nameFor = (role: string | undefined): ResolvedName | undefined => {
    if (!role) return undefined;
    return role === 'ownTeacher' ? ctx.resolveTeacher(ctx.columnKey) : ctx.resolveForeign(role);
  };
  const mainSub = nameFor(spec?.teacherRole);
  const main: RenderedLine = {
    text: cell.subject,
    sub: mainSub?.name,
    subManual: mainSub?.manual,
    // 칸에 넣은 강의실이 우선, 없으면 그 과목이 늘 쓰는 강의실
    room: cell.room ?? spec?.room,
  };

  if (lineCount < 2 || !spec || spec.partner === 'none') {
    return blank.map((_, i) => (i === 0 ? main : { text: '' }));
  }
  const withRoom = (l: RenderedLine): RenderedLine => ({
    ...l,
    room: cell.partnerRoom ?? spec.partnerRoom,
  });

  let partner: RenderedLine;
  switch (spec.partner) {
    case 'pattern': {
      const p = nameFor(spec.partnerTeacherRole ?? '수업');
      partner = {
        text: spec.partnerLabel?.trim() || ctx.patternLabel || 'Pattern',
        sub: p?.name,
        subManual: p?.manual,
      };
      break;
    }
    case 'foreign': {
      const hit = ctx.resolveForeign(spec.key);
      partner = hit
        ? { text: hit.name, isName: true, manual: hit.manual }
        : { text: `${spec.key} 원어민`, isName: true, muted: true };
      break;
    }
    case 'owner': {
      const code = spec.ownerClassCode;
      const hit = code ? ctx.resolveTeacher(code) : undefined;
      partner = hit
        ? { text: hit.name, isName: true, manual: hit.manual }
        : { text: code ? `${code} 담임` : '담당 미지정', isName: true, muted: true };
      break;
    }
    case 'ownTeacher': {
      const hit = ctx.resolveTeacher(ctx.columnKey);
      partner = hit
        ? { text: hit.name, isName: true, manual: hit.manual }
        : { text: '담임 미배정', isName: true, muted: true };
      break;
    }
    default:
      partner = { text: '' };
  }

  return cell.partnerFirst ? [withRoom(partner), main] : [main, withRoom(partner)];
}

/** 블록이 보여 줄 줄 수 */
export function lineCountOf(block: TimetableBlock, layout: TimetableLayout): number {
  if (block.lines) return block.lines;
  if (layout === 'date') return 2;
  return block.times?.length ?? 1;
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = (hhmm ?? '').split(':').map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

/** time 표는 시작 시각 순, date 표는 입력 순서 유지 */
export function sortBlocks(blocks: TimetableBlock[], layout: TimetableLayout = 'time'): TimetableBlock[] {
  if (layout === 'date') return [...blocks];
  return [...blocks].sort(
    (a, b) => timeToMinutes(a.times?.[0]?.start ?? '') - timeToMinutes(b.times?.[0]?.start ?? '')
  );
}

/**
 * 로테이션 — 과목·주제를 반 순서대로 놓고 줄이 넘어갈 때마다 한 칸씩 민다.
 * 관리시트의 배치 규칙 그대로다.
 */
export function rotateSubjects(
  subjectKeys: string[],
  classCodes: string[],
  offset = 0
): Record<string, TimetableCell> {
  const cells: Record<string, TimetableCell> = {};
  if (subjectKeys.length === 0) return cells;
  classCodes.forEach((code, i) => {
    const idx = (((i - offset) % subjectKeys.length) + subjectKeys.length) % subjectKeys.length;
    cells[code] = { subject: subjectKeys[idx] };
  });
  return cells;
}

/**
 * 인문학 표의 주제 목록을 반 구성에서 만든다.
 * 주제N 을 N번째 반의 담임이 맡는다 — 시트의 규칙 그대로.
 */
export function buildRotationSubjects(
  classCodes: string[],
  prefix = '주제'
): TimetableSubject[] {
  return classCodes.map((code, i) => ({
    key: `${prefix}${i + 1}`,
    partner: 'owner' as const,
    ownerClassCode: code,
    color: ROTATION_COLORS[i % ROTATION_COLORS.length],
  }));
}

/**
 * 당번 로테이션을 줄마다 배정한다.
 * 반별 줄만 세어 rotation 을 순서대로 돌리므로, 공통 줄(식사·체육·인문학)은 자동으로 빠진다.
 * @returns 블록 id → 당번 반번호
 */
export function dutyByBlock(
  blocks: TimetableBlock[],
  layout: TimetableLayout,
  rotation: string[] | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!rotation?.length) return out;
  let i = 0;
  sortBlocks(blocks, layout).forEach((b) => {
    if (b.kind !== 'class') return;
    out[b.id] = rotation[i % rotation.length];
    i += 1;
  });
  return out;
}

// ─── 앱 배정에서 그룹·반 뽑아내기 ──────────────────────────────────────────

/** 시간표를 그리는 데 필요한 그룹 한 덩어리 — 전부 앱 배정에서 나온다 */
export interface DerivedGroup {
  /** 화면에 쓸 이름 (Spring, Junior …) */
  name: string;
  /** 앱에 저장된 원래 group 값 (spring, junior …) */
  key: string;
  /** 이 그룹의 반번호, 정렬됨 */
  classCodes: string[];
  /** 반번호 → 담임 이름 */
  teacherByClass: Record<string, string>;
  /** 역할(소문자) → 이름. Speaking/Reading/Writing 원어민, '수업' 멘토, '매니저' 등 */
  staffByRole: Record<string, string>;
}

export interface MemberLike {
  name?: string;
  role?: string;
  jobExperiences?: Array<{ id: string; group?: string; groupRole?: string; classCode?: string }>;
}

const GROUP_ORDER = ['junior', 'middle', 'senior', 'spring', 'summer', 'autumn', 'winter'];
/** 그룹이 아닌 값 — 시간표 탭에 띄우지 않는다 */
const NON_GROUP = new Set(['manager', 'common', '공통', '매니저']);

function titleCase(k: string): string {
  if (!k) return k;
  if (/[가-힣]/.test(k)) return k;
  return k.charAt(0).toUpperCase() + k.slice(1);
}

/**
 * 캠프 구성원의 배정(jobExperiences)에서 그룹·반·담당자를 뽑아낸다.
 * 그룹 수도 반 개수도 배정이 정하므로, 담임이 바뀌면 시간표가 따라 바뀐다.
 */
export function deriveGroupsFromMembers(members: MemberLike[], jobCodeId: string): DerivedGroup[] {
  const acc = new Map<string, DerivedGroup>();
  for (const m of members) {
    const exp = m.jobExperiences?.find((e) => e.id === jobCodeId);
    if (!exp?.group || !m.name) continue;
    const key = normalizeGroupKey(exp.group);
    if (!key || NON_GROUP.has(key)) continue;
    const g =
      acc.get(key) ??
      (acc.set(key, { name: titleCase(key), key, classCodes: [], teacherByClass: {}, staffByRole: {} }),
      acc.get(key)!);
    if (exp.classCode) {
      if (!g.classCodes.includes(exp.classCode)) g.classCodes.push(exp.classCode);
      // 담임만 반의 대표 이름으로 잡는다 (수업 멘토는 반이 없거나 겹칠 수 있음)
      if (!exp.groupRole || exp.groupRole === '담임') g.teacherByClass[exp.classCode] = m.name;
    }
    if (exp.groupRole) {
      const r = exp.groupRole.toLowerCase();
      if (!g.staffByRole[r]) g.staffByRole[r] = m.name;
    }
  }
  // 반이 하나도 배정되지 않은 그룹은 표를 만들 수 없으므로 제외한다
  // (매니저·원어민만 배정된 단계. 담임이 붙으면 그때 나타난다)
  const list = [...acc.values()].filter((g) => g.classCodes.length > 0);
  list.forEach((g) => g.classCodes.sort());
  return list.sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a.key);
    const ib = GROUP_ORDER.indexOf(b.key);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.name.localeCompare(b.name);
  });
}

/** 배정이 아직 없을 때 쓰는 기본 그룹 구성 */
export const FALLBACK_GROUPS = ['Junior', 'Middle', 'Senior'];

/**
 * 2교시 세트의 위·아래가 "같은 수업"인지.
 * Speaking + 원어민처럼 이어지는 수업은 true(가운데 선 없음),
 * Math + Pattern 처럼 서로 다른 수업이면 false(가운데 선 있음).
 */
export function isJoinedPair(
  subjects: TimetableSubject[] | undefined,
  subjectKey: string | undefined
): boolean {
  const spec = findSubject(subjects, subjectKey);
  if (!spec) return true;
  return spec.partner !== 'pattern';
}


// ──────────────────────────────────────────────────────────────────
// web / mobile 공용 파생 로직
// 두 플랫폼이 같은 규칙으로 그룹·카테고리 목록을 만들기 위한 헬퍼.
// ──────────────────────────────────────────────────────────────────

/** campSettings.groups 형태 */
export interface GroupSetting {
  name: string;
  classCodes?: string[];
}

function toDerived(name: string, classCodes: string[] = []): DerivedGroup {
  return {
    name,
    key: normalizeGroupKey(name),
    classCodes,
    teacherByClass: {},
    staffByRole: {},
  };
}

/**
 * 그룹·반·담임의 원본은 앱 배정(users.jobExperiences).
 * 아직 배정이 없으면 캠프 설정의 그룹 → 그것도 없으면 기본 3그룹.
 */
export function resolveGroups(
  members: MemberLike[],
  jobCodeId: string,
  settingGroups: GroupSetting[] = []
): DerivedGroup[] {
  const fromMembers = deriveGroupsFromMembers(members, jobCodeId);
  if (fromMembers.length) return fromMembers;
  if (settingGroups.length) return settingGroups.map((g) => toDerived(g.name, g.classCodes ?? []));
  return FALLBACK_GROUPS.map((name) => toDerived(name));
}

/** 반번호 → 담임 이름 (모든 그룹 합침) */
export function teacherMapOf(groups: DerivedGroup[]): Record<string, string> {
  const map: Record<string, string> = {};
  groups.forEach((g) => Object.assign(map, g.teacherByClass));
  return map;
}

/** 고정 카테고리 + 저장된 표에만 있는 커스텀 카테고리 */
export function timetableCategories(
  campCode: string,
  timetables: Pick<CampTimetable, 'dayType' | 'dayTypeLabel'>[] = []
): Array<{ key: string; label: string }> {
  // inline 표(인문학)는 탭으로 띄우지 않는다 — 그 날 표 아래에 붙는다
  const list = TIMETABLE_CATEGORIES.filter((c) => !c.inline).map((c) => ({
    key: c.key,
    label: categoryLabel(c, campCode),
  }));
  // 이미 아는 키는 inline 이어도 "모르는 카테고리" 로 다시 들어오면 안 된다
  const known = new Set(TIMETABLE_CATEGORIES.map((c) => c.key));
  timetables.forEach((t) => {
    if (!known.has(t.dayType)) {
      known.add(t.dayType);
      list.push({ key: t.dayType, label: t.dayTypeLabel || t.dayType });
    }
  });
  return list;
}

/** 배정에서 나온 그룹 + 저장된 표에만 있는 그룹 */
export function timetableGroupNames(
  groups: DerivedGroup[],
  timetables: Pick<CampTimetable, 'groupName'>[] = []
): string[] {
  const names = groups.map((g) => g.name);
  const seen = new Set(names.map(normalizeGroupKey));
  timetables.forEach((t) => {
    const k = normalizeGroupKey(t.groupName);
    if (k && !seen.has(k)) {
      seen.add(k);
      names.push(t.groupName);
    }
  });
  return names;
}

/** 붙어 있는 같은 이름의 공통 줄(P.E, 인문학 …)은 한 칸으로 합쳐서 보여 준다 */
export interface SharedRun {
  kind: 'shared';
  label: string;
  /** 이름 아래 작게 붙는 안내 */
  subLabel?: string;
  blocks: TimetableBlock[];
  /** 합쳐진 구간 전체의 시작·종료 */
  start?: string;
  end?: string;
  dateLabel?: string;
}
export interface ClassRun {
  kind: 'class';
  block: TimetableBlock;
}
export type TimetableRow = SharedRun | ClassRun;

/**
 * 블록을 화면에 그릴 줄 단위로 바꾼다.
 * 이름이 같고 연달아 있는 공통 줄은 하나로 묶어 시간도 한 구간으로 합친다
 * (15:10~15:50 P.E + 16:00~16:40 P.E → 15:10~16:40 P.E 한 칸).
 */
export function toRows(blocks: TimetableBlock[], layout: TimetableLayout = 'time'): TimetableRow[] {
  const rows: TimetableRow[] = [];
  for (const b of sortBlocks(blocks ?? [], layout)) {
    if (b.kind !== 'shared') {
      rows.push({ kind: 'class', block: b });
      continue;
    }
    const label = (b.label ?? '').trim();
    const lastTime = b.times?.[(b.times?.length ?? 1) - 1]?.end;
    const prev = rows[rows.length - 1];
    // 이름 없는 빈 줄은 합치지 않는다 (자리만 비워 둔 칸이라 개수가 의미를 가진다)
    if (label && prev && prev.kind === 'shared' && prev.label === label) {
      prev.blocks.push(b);
      if (lastTime) prev.end = lastTime;
      if (b.dateLabel && prev.dateLabel !== b.dateLabel) {
        prev.dateLabel = [prev.dateLabel, b.dateLabel].filter(Boolean).join(', ');
      }
      continue;
    }
    rows.push({
      kind: 'shared',
      label,
      subLabel: b.subLabel,
      blocks: [b],
      start: b.times?.[0]?.start,
      end: lastTime,
      dateLabel: b.dateLabel,
    });
  }
  return rows;
}

/** 하루 표 안에서 inline 표(인문학)가 들어가는 자리 */
export interface InlineSlot {
  category: TimetableCategory;
  label: string;
  start?: string;
  end?: string;
}

/**
 * 이 표에 inline 표가 들어갈 공통 줄이 있는지 찾는다.
 * 예: 정규 표의 "인문학 프로그램 19:20~20:50" 줄 → 인문학 로테이션 표가 그 시간에 돈다.
 */
export function findInlineSlots(timetable: CampTimetable | undefined): InlineSlot[] {
  if (!timetable) return [];
  const rows = toRows(timetable.blocks ?? [], timetable.layout ?? 'time');
  const out: InlineSlot[] = [];
  for (const cat of TIMETABLE_CATEGORIES) {
    if (!cat.inline || !cat.inlineSlotMatch) continue;
    const hit = rows.find(
      (r): r is SharedRun => r.kind === 'shared' && r.label.includes(cat.inlineSlotMatch!)
    );
    if (hit) out.push({ category: cat, label: hit.label, start: hit.start, end: hit.end });
  }
  return out;
}

/**
 * 이 줄에 보여 줄 날짜.
 * dayOffsets(캠프 N일차)가 있고 캠프 시작일을 알면 거기서 계산하고,
 * 아니면 저장된 dateLabel 을 그대로 쓴다.
 */
export function dateLabelFor(
  block: Pick<TimetableBlock, 'dateLabel' | 'dayOffsets'>,
  campStart?: Date | number | null
): string {
  const offsets = block.dayOffsets;
  if (!offsets?.length || campStart == null) return block.dateLabel ?? '';
  const start = campStart instanceof Date ? campStart : new Date(campStart);
  if (Number.isNaN(start.getTime())) return block.dateLabel ?? '';
  return offsets
    .map((n) => {
      const d = new Date(start.getTime());
      d.setDate(d.getDate() + (n - 1));
      return `${d.getMonth() + 1}/${d.getDate()}`;
    })
    .join(', ');
}

/**
 * 줄을 합쳐 한 칸으로 그리는 전담 열인지 (교무실조 등).
 * 당번 로테이션 / 고정 담당 / 고정 표시 셋 중 하나면 그렇다.
 * 너비도 이름 하나 들어갈 만큼만 잡는다 — web/mobile 이 같은 기준을 쓰도록 여기에 둔다.
 */
export function isMergedColumn(e: TimetableExtraColumn): boolean {
  return !!e.dutyRotation?.length || !!e.staffRole || e.staticText != null;
}

/**
 * 전담 열이 이 줄에 보여 줄 이름. 줄(교시)을 합쳐 한 번만 들어간다.
 * 우선순위: 그 줄에 직접 넣은 이름 → 당번 로테이션의 담임 → 고정 담당자 → 고정 표시.
 * 이 열이 아니거나 보여 줄 게 없으면 undefined.
 */
export function mergedColumnName(
  column: TimetableExtraColumn,
  block: Pick<TimetableBlock, 'id' | 'cells'>,
  dutyMap: Record<string, Record<string, string>>,
  resolveTeacher: (classCode: string) => ResolvedName | undefined,
  resolveStaff: (role: string) => ResolvedName | undefined
): { text: string; muted?: boolean; manual?: boolean } | undefined {
  if (!isMergedColumn(column)) return undefined;

  // 이 줄만 다른 사람이 맡는 경우 — 관리자가 직접 넣은 이름이 가장 우선
  const override = block.cells?.[column.key]?.texts?.[0]?.trim();
  if (override) return { text: override, manual: true };

  const dutyCode = dutyMap[column.key]?.[block.id];
  if (dutyCode !== undefined) {
    const hit = resolveTeacher(dutyCode);
    return hit ? { text: hit.name, manual: hit.manual } : { text: dutyCode, muted: true };
  }
  if (column.staffRole) {
    const hit = resolveStaff(column.staffRole);
    return hit ? { text: hit.name, manual: hit.manual } : { text: `${column.staffRole} 미배정`, muted: true };
  }
  if (column.staticText != null) return { text: column.staticText, muted: true };
  return undefined;
}

/**
 * 헤더에 쓸 반 이름 — Grit → Grit반.
 * 반코드(J01)가 아니라 반 이름에 붙는다. 이름이 없으면 빈 문자열.
 */
export function classNameLabel(className: string | undefined): string {
  const n = (className ?? '').trim();
  if (!n) return '';
  return n.endsWith('반') ? n : `${n}반`;
}

/**
 * 캠프 설정의 반이름·강의실을 표의 반 목록에 입힌다.
 *
 * 반이름·강의실은 기수마다 다르고 한 캠프 안에서는 모든 표가 같아야 하므로
 * campSettings 에 한 벌만 두고 그릴 때 여기서 덮어쓴다.
 * 설정에 없는 반은 표에 저장돼 있던 값을 그대로 쓴다 (설정 이전 데이터 호환).
 */
export function applyClassInfo(
  classes: TimetableClassColumn[],
  classInfo: Record<string, { className?: string; classroom?: string }> | undefined
): TimetableClassColumn[] {
  if (!classInfo || !Object.keys(classInfo).length) return classes;
  return classes.map((c) => {
    const info = classInfo[c.classCode];
    if (!info) return c;
    return {
      ...c,
      className: info.className ?? c.className,
      classroom: info.classroom ?? c.classroom,
    };
  });
}

/**
 * 색을 흰색 쪽으로 섞어 연하게. 시간표 칸 색을 교재표 배경으로 재활용할 때 쓴다.
 * @param amount 0 = 그대로, 1 = 흰색
 */
export function lightenColor(hex: string | undefined, amount = 0.55): string | undefined {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * Math.min(Math.max(amount, 0), 1));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** 교재표의 과목 줄에 쓸 배경색 — 시간표의 그 과목 색을 연하게 */
export function subjectTint(
  subjects: TimetableSubject[] | undefined,
  subjectKey: string,
  amount = 0.55
): string | undefined {
  return lightenColor(findSubject(subjects, subjectKey)?.color, amount);
}


// ── 공통 값 ────────────────────────────────────────────────────────

/** 이 표가 그 항목을 자기 값으로 쓰고 있는지 */
export function usesOwn(t: Pick<CampTimetable, 'own'>, part: keyof TimetableOwn): boolean {
  return !!t.own?.[part];
}

/**
 * 공통 값을 표에 씌운다.
 *
 * own 플래그가 켜진 항목만 표에 저장된 값을 그대로 두고, 나머지는 공통으로 바꾼다.
 * 공통에 아직 아무것도 없으면(처음 쓰는 캠프) 표의 값을 그대로 둔다 —
 * 그래야 백필 전에도 화면이 비어 보이지 않는다.
 *
 * classes 는 통째로 갈아끼우지 않고 반코드로 맞춰 준다: 반 배정은 그룹에서
 * 오는 값이라 공통보다 최신일 수 있으므로, 순서·목록은 표 쪽을 믿고
 * 직접 넣은 이름(teacherName)만 공통에서 가져온다.
 */
export function applyCommon<T extends CampTimetable>(
  t: T,
  common: TimetableCommonValues | undefined
): T {
  if (!common) return t;
  const out = { ...t };

  if (!usesOwn(t, 'roster')) {
    if (common.classes?.length) {
      const nameOf = new Map(common.classes.map((c) => [c.classCode, c.teacherName]));
      const known = new Set(t.classes.map((c) => c.classCode));
      out.classes = [
        ...t.classes.map((c) => {
          const name = nameOf.get(c.classCode);
          return name === undefined ? c : { ...c, teacherName: name };
        }),
        // 공통에만 있는 반(관리자가 공통에서 손으로 추가한 반)도 보여 준다
        ...common.classes.filter((c) => !known.has(c.classCode)),
      ];
    }
    if (common.staffOverrides) out.staffOverrides = common.staffOverrides;
  }

  if (!usesOwn(t, 'subjects') && common.subjects?.length) {
    out.subjects = common.subjects;
  }

  return out;
}

/** 표에서 공통에 올릴 값만 뽑는다 */
export function commonValuesOf(t: CampTimetable): TimetableCommonValues {
  return {
    classes: t.classes,
    staffOverrides: t.staffOverrides ?? {},
    subjects: t.subjects ?? [],
  };
}
