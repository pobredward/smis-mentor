/**
 * 학생 전자기기 — 학생 상세 모달 "전자기기" 탭 (web·mobile 공용)
 *
 * 운영 흐름: 입소날 수거 → 방 담당 선생님 보관 → 반 편성 다음 날 반별 교무실로 이동·보관 → 퇴소 때 돌려줌.
 * 알람이 울려도 끌 수 있도록 기종과 잠금 해제 정보(PIN/패턴/비밀번호)를 받아 둔다 — 스태프 전원이 바로 보고, 캠프 후에도 보관.
 * 한 학생이 여러 대를 가져올 수 있어 기기 1대 = 문서 1개.
 */
import type { Timestamp } from 'firebase/firestore';

export const DEVICE_KINDS = ['phone', 'tablet', 'watch', 'laptop', 'etc', 'charger'] as const;
/** 충전기를 뺀 기기 종류 (기기 등록 창) */
export const GADGET_KINDS = ['phone', 'tablet', 'watch', 'laptop', 'etc'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export const DEVICE_LOCK_TYPES = ['pin', 'pattern', 'password', 'none'] as const;
export type DeviceLockType = (typeof DEVICE_LOCK_TYPES)[number];

/**
 * 보관 위치: 학생 소지(미수거) → 방 담당 보관 → 그룹 교무실 보관 → 반납 완료.
 * 중간에 특정 선생님이 모아 가져가거나(STEAM 수업 등) 학생에게 잠깐 돌려줄 수 있다.
 */
export const DEVICE_LOCATIONS = ['student', 'unit', 'office', 'teacher', 'lent', 'returned'] as const;
export type DeviceLocation = (typeof DEVICE_LOCATIONS)[number];

export interface DeviceMove {
  at: Timestamp;
  by: string;
  byId: string;
  from: DeviceLocation;
  to: DeviceLocation;
  /** to === 'teacher' 일 때 맡은 선생님 */
  holder?: string;
}

/** 충전 단자 — 기기의 충전 방식 / 충전기의 단자. 여러 개일 수 있어 중복 선택 */
export const CHARGER_TYPES = ['usbc', 'lightning', 'micro', 'wireless', 'etc'] as const;
export type ChargerType = (typeof CHARGER_TYPES)[number];

export interface StudentDevice {
  id: string;
  campCode: string;
  studentId: string;
  studentName: string;
  classNumber?: string;
  roomNumber?: string;
  kind: DeviceKind;
  /** 기종 (예: 아이폰 13 미니, 갤럭시 워치) */
  model: string;
  /** 색상·케이스 등 구분 특징 */
  feature?: string;
  lockType: DeviceLockType;
  /** PIN·비밀번호 문자열, 패턴은 점 번호(1~9)를 '-'로 이은 것 (예: "1-2-3-6-9") */
  lockCode?: string;
  location: DeviceLocation;
  /** location === 'teacher' 일 때 기기를 가지고 있는 선생님 */
  holderName?: string;
  holderId?: string;
  /** 충전 필요 */
  needsCharge?: boolean;
  /** 확인한 배터리 잔량 (%) */
  batteryPercent?: number;
  /** 기기: 충전 방식(단자) / 충전기(kind='charger'): 이 충전기로 충전할 수 있는 단자 */
  chargerTypes?: ChargerType[];
  /** 배터리·충전기 메모 */
  batteryNote?: string;
  note?: string;
  moves?: DeviceMove[];
  createdBy: string;
  createdById: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

/** 패턴 문자열 → 점 순서 배열 (잘못된 값은 버림) */
export function parsePattern(code: string | undefined): number[] {
  if (!code) return [];
  return code.split(/[^\d]+/).map(Number).filter(n => n >= 1 && n <= 9);
}

export const patternToCode = (dots: number[]): string => dots.join('-');

/** 아직 수거 안 된 기기 (반납 완료 제외) */
export const isDeviceUncollected = (d: Pick<StudentDevice, 'location'>): boolean => d.location === 'student';

/** 다음 보관 단계 (흐름 버튼용) — 선생님·잠깐 지급 뒤에는 교무실로 돌아감 */
export function nextDeviceLocation(loc: DeviceLocation): DeviceLocation | null {
  switch (loc) {
    case 'student': return 'unit';
    case 'unit': return 'office';
    case 'teacher':
    case 'lent': return 'office';
    case 'office': return 'returned';
    default: return null;
  }
}

/** 보관 위치 상세 — 방 담당 선생님 방, 그룹 교무실 호수 */
export interface DeviceLocationContext {
  /** campSettings.groups */
  groups?: Array<{ name: string; classCodes: string[] }>;
  /** campSettings.lodging.rooms */
  rooms?: Record<string, { purpose?: string; label?: string; teachers?: string[] }>;
}

/** 숙소 탭 배치의 "윤수빈 멘토"·"김강희 매니저" 같은 표기를 이름만 남겨 비교 */
export const normalizeTeacherName = (v: string | undefined | null): string =>
  (v ?? '').replace(/\s*(부매니저|매니저|멘토|선생님|쌤|원어민|T)\s*$/i, '').replace(/\s+/g, '').trim();

/** 선생님 이름 → 묵는 방 호수 (숙소 탭 배치). 강의실·교무실보다 숙소(멘토방 등)를 우선 */
export function teacherRoomOf(name: string | undefined, ctx: DeviceLocationContext): string | null {
  const n = normalizeTeacherName(name);
  if (!n) return null;
  const hits = Object.entries(ctx.rooms ?? {})
    .filter(([, r]) => (r?.teachers ?? []).some(t => normalizeTeacherName(t) === n));
  if (!hits.length) return null;
  const bedroom = hits.find(([, r]) => !['교실', '교무실'].includes(r?.purpose?.trim() ?? ''));
  return (bedroom ?? hits[0])[0];
}

/** 학생 반 → 그룹 이름 */
export function studentGroupOf(classNumber: string | undefined, ctx: DeviceLocationContext): string | null {
  const code = classNumber?.substring(0, 3);
  if (!code) return null;
  return ctx.groups?.find(g => g.classCodes.includes(code))?.name ?? null;
}

/** 그룹 교무실 호수 — 교무실 방 중 라벨에 그룹 이름이 들어간 방 */
export function groupOfficeRoomOf(group: string | null, ctx: DeviceLocationContext): string | null {
  if (!group) return null;
  const g = group.toLowerCase();
  const hit = Object.entries(ctx.rooms ?? {})
    .filter(([, r]) => r?.purpose?.trim() === '교무실')
    .find(([, r]) => (r.label ?? '').toLowerCase().includes(g));
  return hit ? hit[0] : null;
}

/**
 * 보관 위치 옆에 붙는 설명 — 예: "윤수빈 · 311호", "Spring 교무실 222호", "김선생 · 405호"
 */
export function deviceLocationDetail(
  loc: DeviceLocation,
  student: { unitMentor?: string; unit?: string; classNumber?: string },
  ctx: DeviceLocationContext,
  holderName?: string,
): string {
  if (loc === 'unit') {
    const t = student.unitMentor || student.unit || '';
    const room = teacherRoomOf(t, ctx);
    return [t, room ? `${room}호` : ''].filter(Boolean).join(' · ');
  }
  if (loc === 'office') {
    const group = studentGroupOf(student.classNumber, ctx);
    const room = groupOfficeRoomOf(group, ctx);
    return [group, room ? `${room}호` : ''].filter(Boolean).join(' · ');
  }
  if (loc === 'teacher') {
    const room = teacherRoomOf(holderName, ctx);
    return [holderName, room ? `${room}호` : ''].filter(Boolean).join(' · ');
  }
  return '';
}

/**
 * ST 시트의 전자기기 열(기기1모델·기기1잠금 …)은 시트와 연동하지 않는다 — 기기 정보는 Firestore(studentDevices)에만 저장.
 * 동기화·시트 쓰기·필드 설정 편집기에서 이 헤더를 제외할 때 쓴다.
 */
export const isDeviceSheetHeader = (header: string | undefined | null): boolean =>
  !!header && /^기기\s*\d+\s*(모델|잠금)$/.test(header.trim());

/** 충전기는 기기 1대로 따로 등록한다 (kind = 'charger') */
export const isCharger = (d: Pick<StudentDevice, 'kind'>): boolean => d.kind === 'charger';

/** 이 기기를 충전할 수 있는 같은 학생의 충전기 — 단자가 하나라도 겹치면 */
export function matchingChargers(device: Pick<StudentDevice, 'chargerTypes'>, all: StudentDevice[]): StudentDevice[] {
  const ports = device.chargerTypes ?? [];
  if (!ports.length) return [];
  return all.filter(d => isCharger(d) && (d.chargerTypes ?? []).some(t => ports.includes(t)));
}
