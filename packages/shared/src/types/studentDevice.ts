/**
 * 학생 전자기기 — 학생 상세 모달 "전자기기" 탭 (web·mobile 공용)
 *
 * 운영 흐름: 입소날 수거 → 방 담당 선생님 보관 → 반 편성 다음 날 반별 교무실로 이동·보관 → 퇴소 때 돌려줌.
 * 알람이 울려도 끌 수 있도록 기종과 잠금 해제 정보(PIN/패턴/비밀번호)를 받아 둔다 — 스태프 전원이 바로 보고, 캠프 후에도 보관.
 * 한 학생이 여러 대를 가져올 수 있어 기기 1대 = 문서 1개.
 */
import type { Timestamp } from 'firebase/firestore';

export const DEVICE_KINDS = ['phone', 'tablet', 'watch', 'laptop', 'etc'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export const DEVICE_LOCK_TYPES = ['pin', 'pattern', 'password', 'none'] as const;
export type DeviceLockType = (typeof DEVICE_LOCK_TYPES)[number];

/** 보관 위치: 학생 소지(미수거) → 방 담당 보관 → 반 교무실 보관 → 반납 완료 */
export const DEVICE_LOCATIONS = ['student', 'unit', 'office', 'returned'] as const;
export type DeviceLocation = (typeof DEVICE_LOCATIONS)[number];

export interface DeviceMove {
  at: Timestamp;
  by: string;
  byId: string;
  from: DeviceLocation;
  to: DeviceLocation;
}

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
  /** 충전 필요 */
  needsCharge?: boolean;
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

/** 다음 보관 단계 (흐름 버튼용) */
export function nextDeviceLocation(loc: DeviceLocation): DeviceLocation | null {
  switch (loc) {
    case 'student': return 'unit';
    case 'unit': return 'office';
    case 'office': return 'returned';
    default: return null;
  }
}

/**
 * ST 시트의 전자기기 열(기기1모델·기기1잠금 …)은 시트와 연동하지 않는다 — 기기 정보는 Firestore(studentDevices)에만 저장.
 * 동기화·시트 쓰기·필드 설정 편집기에서 이 헤더를 제외할 때 쓴다.
 */
export const isDeviceSheetHeader = (header: string | undefined | null): boolean =>
  !!header && /^기기\s*\d+\s*(모델|잠금)$/.test(header.trim());
