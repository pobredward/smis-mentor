/**
 * 아이 + 캠프 참가 → 학생 화면이 쓰는 한 명 (STSheetStudent 모양 — 캠프 탭 · 학생 카드가 그대로 쓴다)
 */
import type { STSheetStudent, FamilyStudent, FamilyUnit, CampType } from '../types/student';
import { CAMP_SHEET_CONFIG } from '../types/student';
import { CHILD_STUDENT_FIELDS, type ChildProfile, type CampEnrollment, type CampFamily } from '../types/campStudent';
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

/** 가족 캠프 명단 — 가족 문서 + 확정된 학생(familyId, 상세 칸 포함 toCampStudent) → 예전 familySTSheetCache.families 모양 */
export function buildFamilyUnits(families: CampFamily[], students: STSheetStudent[], campCode: string, updatedAt: string): FamilyUnit[] {
  const byFamily = new Map<string, STSheetStudent[]>();
  for (const s of students) {
    const fid = String((s as { familyId?: string }).familyId ?? '');
    if (!fid) continue;
    if (!byFamily.has(fid)) byFamily.set(fid, []);
    byFamily.get(fid)!.push(s);
  }
  return [...families]
    .sort((a, b) => (Number(a.order ?? 1e9) - Number(b.order ?? 1e9)) || a.familyId.localeCompare(b.familyId))
    .map((f) => ({
      familyId: f.familyId,
      familyType: f.familyType ?? '',
      parents: f.parents ?? [],
      roomNumber: f.roomNumber ?? '',
      rowNumber: Number(f.order ?? 0),
      campCode,
      lastSyncedAt: updatedAt as unknown as Date,
      students: (byFamily.get(f.familyId) ?? []).map((s): FamilyStudent => ({
        id: s.studentId,
        name: s.name,
        englishName: s.englishName || undefined,
        grade: s.grade ?? '',
        gender: s.gender as 'M' | 'F',
        ssn: s.ssn || undefined,
        passportName: s.passportName || undefined,
        passportNumber: s.passportNumber || undefined,
        passportExpiry: s.passportExpiry || undefined,
        medication: s.medication || undefined,
        parentPhone: s.parentPhone || undefined,
        registrationSource: s.registrationSource || undefined,
        classNumber: s.classNumber || undefined,
        className: s.className || undefined,
        classMentor: s.classMentor || undefined,
      })),
    }));
}

/** 캠프 코드 → 캠프 종류 (등록된 캠프는 CAMP_SHEET_CONFIG, 새 캠프는 코드 앞 글자로: J·E → EJ, S, D·G → DG, F, W) */
export function campTypeOfCode(campCode: string): CampType {
  const known = (CAMP_SHEET_CONFIG as Record<string, { type?: CampType }>)[campCode]?.type;
  if (known) return known;
  const c = campCode.trim().charAt(0).toUpperCase();
  if (c === 'S') return 'S';
  if (c === 'F') return 'F';
  if (c === 'W') return 'W';
  if (c === 'D' || c === 'G') return 'DG';
  return 'EJ';
}
