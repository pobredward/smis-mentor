/**
 * 아이 + 캠프 참가 → 학생 화면이 쓰는 한 명 (STSheetStudent 모양 — 캠프 탭 · 학생 카드가 그대로 쓴다)
 */
import type { STSheetStudent } from '../types/student';
import { CHILD_STUDENT_FIELDS, type ChildProfile, type CampEnrollment } from '../types/campStudent';
import { ST_DETAIL_FIELDS } from './studentRecordSplit';

const DETAIL = new Set<string>(ST_DETAIL_FIELDS);
const ENROLLMENT_META = new Set(['childId', 'campCode', 'status', 'order', 'parentIds', 'appliedBy', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy']);

export type CampStudent = STSheetStudent & { childId: string; enrollmentStatus?: string };

/** 전체 학생 (상세 칸 포함) */
export function toCampStudent(child: Partial<ChildProfile> | null | undefined, enr: Partial<CampEnrollment>): CampStudent {
  const out: Record<string, unknown> = {};
  for (const k of CHILD_STUDENT_FIELDS) {
    const v = child?.[k];
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  if (child?.ssnMasked) out.ssn = child.ssnMasked;
  for (const [k, v] of Object.entries(enr)) {
    if (ENROLLMENT_META.has(k) || v === undefined || v === null) continue;
    out[k] = v;
  }
  out.studentId = String(enr.studentId ?? '');
  out.childId = String(enr.childId ?? child?.childId ?? '');
  out.campCode = String(enr.campCode ?? '');
  out.enrollmentStatus = enr.status;
  out.name = String(child?.name ?? out.name ?? '');
  out.gender = (child?.gender || out.gender || '') as never;
  out.grade = String(enr.grade ?? out.grade ?? '');
  out.rowNumber = Number(enr.order ?? 0);
  for (const k of ['englishName', 'parentPhone', 'parentName', 'classNumber', 'className', 'classMentor', 'unitMentor', 'roomNumber']) {
    if (out[k] === undefined) out[k] = '';
  }
  return out as unknown as CampStudent;
}

/** 목록용 (상세 칸 제외) */
export function toRosterStudent(child: Partial<ChildProfile> | null | undefined, enr: Partial<CampEnrollment>): CampStudent {
  const full = toCampStudent(child, enr) as unknown as Record<string, unknown>;
  for (const k of Object.keys(full)) if (DETAIL.has(k)) delete full[k];
  return full as unknown as CampStudent;
}

/** 명단 순서 — 참가 순서(order) → 이름 */
export const compareEnrollments = (a: Partial<CampEnrollment>, b: Partial<CampEnrollment>) =>
  (Number(a.order ?? 1e9) - Number(b.order ?? 1e9)) || String(a.studentId ?? '').localeCompare(String(b.studentId ?? ''));
