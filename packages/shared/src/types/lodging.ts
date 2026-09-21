// 숙소 탭 — 건물(고정) + 캠프별 방 용도·선생님 배치 + ST 시트 방호수로 만든 명단
import type { STSheetStudent } from './student';
import { compareGroupNames } from './campTimetable';

export type LodgingWing = 'main' | 'annex';

/** 건물의 방 하나. 어느 캠프든 같다. */
export interface LodgingRoom {
  num: string;
  wing: LodgingWing;
  floor: number;
  /** 도면·시트 표기가 어긋나는 경우 등 메모 */
  note?: string;
}

export type LodgingPlaceKind = 'hall' | 'dining' | 'shop' | 'wc' | 'stair' | 'ev' | 'fun' | 'etc';

/** 지하 1층처럼 방이 아닌 장소 (강당·식당·상점). 배치도 픽셀 좌표를 그대로 둔다. */
export interface LodgingPlace {
  id: string;
  name: string;
  kind: LodgingPlaceKind;
  /** [x0, y0, x1, y1] — b1.viewBox 좌표계 */
  box: [number, number, number, number];
  area?: number;
  cap?: number;
}

export interface LodgingBuilding {
  id: string;
  name: string;
  floors: number[];
  /** 본관 한 줄의 칸 수 (오른쪽 정렬 기준) */
  mainCols: number;
  rooms: LodgingRoom[];
  layout: {
    /** 층 → [왼쪽, 오른쪽] 줄 목록 (위에서 아래로). null 은 빈 칸 */
    annex: Record<number, Array<[string | null, string | null]>>;
    /** 층 → 복도 위쪽·아래쪽 줄 (서쪽 → 동쪽 순) */
    main: Record<number, { upper: string[]; lower: string[] }>;
    /** 층 → 별관에서 한쪽만 방이 있는 줄 index (통로 줄). 뒤에서 두 번째 줄 아래에 본관 복도가 붙는다 */
    annexJunction: Record<number, number[]>;
    /** 본관이 꺾이는 곳 — 서쪽부터 col 번째 칸(0부터)이 꺾인 쪽의 첫 칸, deg 만큼 아래 줄(앞마당) 쪽으로. 3D 에서만 쓴다 */
    mainBend?: { col: number; deg: number };
  };
  /** 3D 바깥 모습 — 사진을 보고 잡은 대략값. 칸 = 본관 서쪽 끝부터 센 칸 수(소수 가능) */
  site?: {
    /** 로비 층 — 이 층 본관에서 방이 없는 서쪽 칸들이 로비가 되고, 앞마당(주차장)이 붙는다 */
    lobbyFloor?: number;
    /** 정문(현관) 가운데 */
    entranceCol?: number;
    /** 가운데 흰 탑 [시작 칸, 끝 칸] — 지붕 위로 한 층 더 솟는다 */
    towerCols?: [number, number];
  };
  b1: {
    viewBox: [number, number, number, number];
    /** 벽·빈 공간 사각형 */
    gray: number[][];
    places: LodgingPlace[];
  };
}

// ── 캠프별 설정 (campSettings/{campCode}.lodging) ─────────────────────────

export interface LodgingRoomSetting {
  /** 용도. 비우면 명단이 있으면 학생방, 없으면 빈방 */
  purpose?: string;
  /** 이 방에 묵는 선생님 (관리자 수기) */
  teachers?: string[];
  /** 칸에 한 줄로 찍히는 표시 (예: "Middle · Speaking") */
  label?: string;
  note?: string;
}

export interface LodgingPlaceSetting {
  purpose?: string;
  note?: string;
}

export interface CampLodging {
  rooms?: Record<string, LodgingRoomSetting>;
  places?: Record<string, LodgingPlaceSetting>;
  updatedAt?: string;
  updatedBy?: string;
}

/** 자주 쓰는 용도. 관리자가 다른 글자를 적어도 된다 (회색으로 찍힌다) */
export const LODGING_PURPOSES = [
  '학생방',
  '멘토방',
  '매니저방',
  '인솔자',
  '원어민방',
  '교실',
  '교무실',
  '환자방',
  '창고',
  '빈방',
] as const;
export type LodgingPurpose = (typeof LODGING_PURPOSES)[number];

/**
 * 칸 색은 용도가 아니라 '무슨 방으로 보이는지'로 정한다.
 * 학생방은 성별로 갈리므로 색을 고르는 값을 따로 둔다 (tone).
 */
export const LODGING_TONE_COLORS: Record<string, { bg: string; ink: string }> = {
  남자방: { bg: '#CFE0FA', ink: '#173A6B' },   // 파랑
  여자방: { bg: '#FBEFA2', ink: '#5A4700' },   // 노랑
  선생님방: { bg: '#E3D8F5', ink: '#3E2A66' }, // 보라
  강의실: { bg: '#CFE9CE', ink: '#1F4A22' },   // 초록
  학생방: { bg: '#DCE8F5', ink: '#1E3A5F' },   // 남녀 섞였거나 성별을 모를 때
  교무실: { bg: '#F3DCE1', ink: '#6B2536' },
  환자방: { bg: '#F8D9D9', ink: '#6E2020' },
  창고: { bg: '#E4E4E1', ink: '#4B4F54' },
  빈방: { bg: '#F3F4F6', ink: '#8A929E' },
};
/** 예전 이름 — 쓰던 곳이 남아 있어 그대로 둔다 */
export const LODGING_PURPOSE_COLORS = LODGING_TONE_COLORS;
const OTHER_PURPOSE_COLOR = { bg: '#E0F2FE', ink: '#0C4A6E' };

export const lodgingPurposeColor = (purpose: string) =>
  LODGING_TONE_COLORS[purpose] ?? OTHER_PURPOSE_COLOR;

/** 선생님이 묵는 방 — 다 같은 보라 */
const TEACHER_PURPOSES = ['멘토방', '매니저방', '인솔자', '원어민방'];

/** 색을 고를 때 쓰는 이름. 학생방이면 성별로, 선생님 방이면 '선생님방', 교실이면 '강의실' */
type ToneInput = {
  purpose: string;
  students: { gender: 'M' | 'F' }[];
  allStudents?: { gender: 'M' | 'F' }[];
  teachers?: string[];
};

export function lodgingRoomTone(room: ToneInput): string {
  const all = room.allStudents ?? room.students;
  if (room.purpose === '학생방') {
    const male = all.some((s) => s.gender === 'M');
    const female = all.some((s) => s.gender === 'F');
    if (male && !female) return '남자방';
    if (female && !male) return '여자방';
    return '학생방';
  }
  if (TEACHER_PURPOSES.includes(room.purpose)) return '선생님방';
  if (room.purpose === '교실') return '강의실';
  return room.purpose;
}

export const lodgingRoomColor = (room: ToneInput) => lodgingPurposeColor(lodgingRoomTone(room));

/**
 * 호수 오른쪽에 붙는 한 마디.
 * 학생이 있는 방은 담당 선생님(유닛 멘토) 이름 — 인원수는 명단을 세면 되니까.
 * 담당이 비어 있으면 인원수로, 학생이 없으면 방 종류로.
 */
export function lodgingRoomCaption(room: ToneInput & { unitMentor?: string }): string {
  const all = room.allStudents ?? room.students;
  if (all.length) return room.unitMentor?.trim() || `${all.length}명`;
  return lodgingRoomTone(room);
}

// ── 내 방 ────────────────────────────────────────────────────────────────

/** 이름 맞대기용 — 괄호·공백·'멘토/선생님/쌤' 같은 꼬리를 떼고 소문자로 */
export function lodgingPersonKey(raw: string | undefined | null): string {
  return (raw ?? '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .trim()
    .replace(/([가-힣])\s*T$/, '$1')
    .replace(/\s*(멘토|선생님|선생|쌤|매니저|코치|님)$/, '')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, '');
}

/**
 * 내 이름이 방 선생님 명단에 있거나, 그 방 학생들의 담당(유닛 멘토)이 나인 방.
 * 원어민은 명단에 이름만(Adam) 적는 일이 많아 영어 이름은 첫 단어도 맞춰 본다.
 */
export function lodgingMyRooms(
  rooms: Map<string, LodgingRoomView>,
  myName: string | undefined | null
): Set<string> {
  const out = new Set<string>();
  const full = lodgingPersonKey(myName);
  if (full.length < 2) return out;
  const keys = new Set([full]);
  const first = lodgingPersonKey((myName ?? '').trim().split(/\s+/)[0]);
  if (first.length >= 2 && /^[a-z]+$/.test(first)) keys.add(first);
  const isMe = (name: string | undefined) => {
    const k = lodgingPersonKey(name);
    return !!k && keys.has(k);
  };
  rooms.forEach((r) => {
    if (r.teachers.some(isMe) || (r.allStudents ?? r.students).some((s) => isMe(s.unitMentor))) out.add(r.num);
  });
  return out;
}

export const LODGING_PLACE_KIND_LABEL: Record<LodgingPlaceKind, string> = {
  hall: '홀·강당',
  dining: '식당',
  shop: '상점',
  wc: '화장실',
  stair: '계단',
  ev: '승강기',
  fun: '오락',
  etc: '기타',
};

export const LODGING_PLACE_COLORS: Record<LodgingPlaceKind, { bg: string; ink: string }> = {
  hall: { bg: '#E3EEDB', ink: '#2F4A1F' },
  dining: { bg: '#FBE9D0', ink: '#6B3E0A' },
  shop: { bg: '#E8E8FF', ink: '#2F2F7A' },
  wc: { bg: '#EDEDED', ink: '#4B4F54' },
  stair: { bg: '#F4B8B8', ink: '#6E2020' },
  ev: { bg: '#FBF0A0', ink: '#5A4A00' },
  fun: { bg: '#FCE0F0', ink: '#7A2A55' },
  etc: { bg: '#E4E4E1', ink: '#4B4F54' },
};

/** 전체·등각·3D 에 크게 보여 줄 만한 장소 (계단·화장실은 뺀다) */
export const LODGING_MAJOR_KINDS: LodgingPlaceKind[] = ['hall', 'dining', 'shop', 'fun'];

// ── 명단 합치기 ──────────────────────────────────────────────────────────

export interface LodgingOccupant {
  studentId: string;
  name: string;
  englishName?: string;
  grade: string;
  gender: 'M' | 'F';
  classNumber: string;
  className: string;
  classMentor: string;
  unitMentor: string;
  rowNumber: number;
  /** 캠프 그룹 (Spring·Summer…) — 반코드로 찾는다 */
  group?: string;
  /** 입소공항조 (예: "김포 3조") */
  departureGroup?: string;
  /** 퇴소공항조 */
  arrivalGroup?: string;
}

export interface LodgingRoomView extends LodgingRoom {
  /** 보여 줄 용도 (설정값 또는 자동) */
  purpose: string;
  /** 관리자가 명시한 용도. 없으면 자동 */
  settingPurpose?: string;
  /** 보여 줄 학생 — 그룹·공항 필터를 거친 뒤 */
  students: LodgingOccupant[];
  /** 거르기 전 전체 명단 (필터를 쓰지 않았으면 없음) */
  allStudents?: LodgingOccupant[];
  /** 필터로 가려진 학생 수 */
  hiddenCount?: number;
  /** 학생들의 유닛 멘토 (가장 많은 이름) */
  unitMentor?: string;
  teachers: string[];
  label?: string;
  settingNote?: string;
}

export interface LodgingPlaceView extends LodgingPlace {
  purpose?: string;
  settingNote?: string;
}

/** "310호", "본관 310", " 310 " → "310". 숫자가 없으면 빈 문자열 */
export function normalizeRoomNumber(raw: string | undefined | null): string {
  const m = (raw ?? '').match(/\d{3,4}/);
  return m ? m[0] : '';
}

/** "J12.06" → "J12". 반코드만 떼어 낸다 */
export const classCodeOf = (classNumber: string | undefined) => (classNumber ?? '').split('.')[0].trim();

/** "김포 3조" → "김포", "직접입소 2조" → "직접입소" */
export const airportOf = (group: string | undefined) =>
  (group ?? '').replace(/\s*\d+\s*조\s*$/, '').trim();

const toOccupant = (s: STSheetStudent, groupOf: (classNumber: string) => string | undefined): LodgingOccupant => ({
  studentId: s.studentId,
  name: s.name,
  ...(s.englishName ? { englishName: s.englishName } : {}),
  grade: s.grade,
  gender: s.gender,
  classNumber: s.classNumber,
  className: s.className,
  classMentor: s.classMentor,
  unitMentor: s.unitMentor || s.unit || '',
  rowNumber: s.rowNumber,
  ...(groupOf(s.classNumber) ? { group: groupOf(s.classNumber) } : {}),
  ...(s.departureGroup ? { departureGroup: s.departureGroup } : {}),
  ...(s.arrivalGroup ? { arrivalGroup: s.arrivalGroup } : {}),
});

const majority = (names: string[]): string | undefined => {
  const n = new Map<string, number>();
  names.forEach((x) => x && n.set(x, (n.get(x) ?? 0) + 1));
  let best: string | undefined;
  n.forEach((v, k) => {
    if (best === undefined || v > (n.get(best) ?? 0)) best = k;
  });
  return best;
};

/**
 * 건물 + ST 시트 학생 + 캠프 설정 → 방마다 보여 줄 값.
 * 시트 방호수가 건물에 없는 방(오타 등)은 `unknown` 에 따로 모아 준다.
 */
export function buildLodgingRooms(
  building: LodgingBuilding,
  students: STSheetStudent[],
  lodging: CampLodging | null | undefined,
  /** campSettings.groups — 반코드로 캠프 그룹을 찾는 데 쓴다 */
  groups?: Array<{ name: string; classCodes: string[] }>
): { rooms: Map<string, LodgingRoomView>; unknown: Map<string, LodgingOccupant[]> } {
  const groupByClass = new Map<string, string>();
  (groups ?? []).forEach((g) => g.classCodes.forEach((c) => groupByClass.set(c, g.name)));
  const groupOf = (classNumber: string) => groupByClass.get(classCodeOf(classNumber));

  const byRoom = new Map<string, LodgingOccupant[]>();
  students.forEach((s) => {
    const num = normalizeRoomNumber(s.roomNumber);
    if (!num) return;
    const list = byRoom.get(num) ?? [];
    list.push(toOccupant(s, groupOf));
    byRoom.set(num, list);
  });

  const rooms = new Map<string, LodgingRoomView>();
  building.rooms.forEach((r) => {
    const setting = lodging?.rooms?.[r.num] ?? {};
    const list = (byRoom.get(r.num) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    byRoom.delete(r.num);
    const teachers = (setting.teachers ?? []).map((t) => t.trim()).filter(Boolean);
    const purpose =
      setting.purpose?.trim() || (list.length ? '학생방' : teachers.length ? '멘토방' : '빈방');
    rooms.set(r.num, {
      ...r,
      purpose,
      students: list,
      unitMentor: majority(list.map((s) => s.unitMentor)),
      teachers,
      ...(setting.purpose?.trim() ? { settingPurpose: setting.purpose.trim() } : {}),
      ...(setting.label?.trim() ? { label: setting.label.trim() } : {}),
      ...(setting.note?.trim() ? { settingNote: setting.note.trim() } : {}),
    });
  });
  return { rooms, unknown: byRoom };
}

export function buildLodgingPlaces(
  building: LodgingBuilding,
  lodging: CampLodging | null | undefined
): LodgingPlaceView[] {
  return building.b1.places.map((p) => {
    const s = lodging?.places?.[p.id] ?? {};
    return {
      ...p,
      ...(s.purpose?.trim() ? { purpose: s.purpose.trim() } : {}),
      ...(s.note?.trim() ? { settingNote: s.note.trim() } : {}),
    };
  });
}

/** 저장 전에 빈 값을 걷어낸다 — Firestore 는 undefined 를 못 받고, 빈 항목은 설정을 어지럽힌다 */
export function cleanLodging(raw: CampLodging): CampLodging {
  const rooms: Record<string, LodgingRoomSetting> = {};
  Object.entries(raw.rooms ?? {}).forEach(([num, s]) => {
    const out: LodgingRoomSetting = {};
    if (s.purpose?.trim()) out.purpose = s.purpose.trim();
    const teachers = (s.teachers ?? []).map((t) => t.trim()).filter(Boolean);
    if (teachers.length) out.teachers = teachers;
    if (s.label?.trim()) out.label = s.label.trim();
    if (s.note?.trim()) out.note = s.note.trim();
    if (Object.keys(out).length) rooms[num] = out;
  });
  const places: Record<string, LodgingPlaceSetting> = {};
  Object.entries(raw.places ?? {}).forEach(([id, s]) => {
    const out: LodgingPlaceSetting = {};
    if (s.purpose?.trim()) out.purpose = s.purpose.trim();
    if (s.note?.trim()) out.note = s.note.trim();
    if (Object.keys(out).length) places[id] = out;
  });
  return { rooms, places };
}

/** 층별 격자에서 통로 줄 — 뒤에서 두 번째 통로 줄 아래에 본관 복도가 끼어든다 */
export function annexCorridorRow(building: LodgingBuilding, floor: number): number {
  const jr = building.layout.annexJunction[floor] ?? [];
  const a = building.layout.annex[floor] ?? [];
  return jr.length >= 2 ? jr[jr.length - 2] : Math.floor(a.length / 2);
}

// ── 그룹·공항별 보이기/숨기기 ──────────────────────────────────────────
//
// 그룹별(또는 공항별)을 누르면 그 값들이 칩으로 뜨고, 칩마다 켜고 끈다.
// 끈 값의 학생은 명단에서 빠지고, 다 빠진 방은 흐리게 남는다.
// 그룹과 공항을 같이 걸면 둘 다 켜진 학생만 보인다.

export type LodgingFilterKey = 'group' | 'airport';

export const LODGING_FILTER_LABEL: Record<LodgingFilterKey, string> = {
  group: '그룹',
  airport: '공항',
};

/** 값이 비어 있는 학생을 가리키는 칩 이름 */
export const LODGING_FILTER_EMPTY_LABEL: Record<LodgingFilterKey, string> = {
  group: '그룹 없음',
  airport: '공항 미정',
};

/** 학생 한 명의 그룹명, 또는 입소공항 (없으면 퇴소공항) */
export function occupantFilterValue(o: LodgingOccupant, key: LodgingFilterKey): string {
  if (key === 'group') return o.group ?? '';
  return airportOf(o.departureGroup) || airportOf(o.arrivalGroup) || '';
}

export interface LodgingFilterOption {
  /** '' 는 값이 없는 학생 */
  value: string;
  label: string;
  count: number;
}

/**
 * 캠프 전체에서 그 값들을 모은다 (가나다순, 빈 값은 맨 뒤).
 * 값이 하나도 없으면 빈 배열 — 그 버튼은 숨기면 된다.
 */
export function lodgingFilterOptions(
  rooms: Map<string, LodgingRoomView>,
  key: LodgingFilterKey
): LodgingFilterOption[] {
  const count = new Map<string, number>();
  rooms.forEach((r) =>
    (r.allStudents ?? r.students).forEach((s) => {
      const v = occupantFilterValue(s, key);
      count.set(v, (count.get(v) ?? 0) + 1);
    })
  );
  if (!Array.from(count.keys()).some(Boolean)) return [];
  return Array.from(count.entries())
    // 빈 값(그룹 없음·공항 미정)은 맨 뒤. 그룹은 시간표와 같은 차례 (Junior, Middle, Senior, Spring …)
    .sort((a, b) =>
      a[0] === '' ? 1 : b[0] === '' ? -1 : key === 'group' ? compareGroupNames(a[0], b[0]) : a[0].localeCompare(b[0], 'ko')
    )
    .map(([value, c]) => ({ value, label: value || LODGING_FILTER_EMPTY_LABEL[key], count: c }));
}

/** 꺼 둔 값들 */
export type LodgingHidden = Record<LodgingFilterKey, string[]>;
export const LODGING_NO_HIDDEN: LodgingHidden = { group: [], airport: [] };

export const hasLodgingHidden = (h: LodgingHidden) => h.group.length > 0 || h.airport.length > 0;

/** 칩 하나 켜고 끄기 */
export function toggleLodgingHidden(h: LodgingHidden, key: LodgingFilterKey, value: string): LodgingHidden {
  const cur = h[key];
  return { ...h, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
}

/** 한 줄(그룹 또는 공항) 전부 숨기기 / 다시 다 보이기 */
export function setAllLodgingHidden(
  h: LodgingHidden,
  key: LodgingFilterKey,
  options: LodgingFilterOption[],
  hide: boolean
): LodgingHidden {
  return { ...h, [key]: hide ? options.map((o) => o.value) : [] };
}

/** 그 값 하나만 보이게 (나머지는 다 끄기) */
export function onlyLodgingValue(
  h: LodgingHidden,
  key: LodgingFilterKey,
  value: string,
  options: LodgingFilterOption[]
): LodgingHidden {
  return { ...h, [key]: options.map((o) => o.value).filter((v) => v !== value) };
}

/**
 * 꺼 둔 값의 학생을 명단에서 뺀 방들.
 * 방 색·담당 선생님은 거르기 전 명단으로 정해지도록 allStudents 를 남긴다.
 */
export function applyLodgingFilter(
  rooms: Map<string, LodgingRoomView>,
  hidden: LodgingHidden
): Map<string, LodgingRoomView> {
  if (!hasLodgingHidden(hidden)) return rooms;
  const hg = new Set(hidden.group);
  const ha = new Set(hidden.airport);
  const out = new Map<string, LodgingRoomView>();
  rooms.forEach((r, num) => {
    const all = r.allStudents ?? r.students;
    const visible = all.filter(
      (s) => !hg.has(occupantFilterValue(s, 'group')) && !ha.has(occupantFilterValue(s, 'airport'))
    );
    out.set(num, { ...r, students: visible, allStudents: all, hiddenCount: all.length - visible.length });
  });
  return out;
}

/** 학생이 있었는데 필터로 다 가려진 방 — 흐리게 그린다 */
export const isLodgingRoomDimmed = (r: LodgingRoomView) => !!r.hiddenCount && r.students.length === 0;
