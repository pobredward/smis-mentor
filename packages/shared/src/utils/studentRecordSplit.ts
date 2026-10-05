/**
 * 학생 명단 나누기 — 목록용 가벼운 명단(stSheetCache/{캠프}.data)과 학생별 상세(stSheetCache/{캠프}/details/{학생 키}).
 *
 * 목록 화면(반 · 방 · 입국 · 출국 · 환자 · 재고 · 숙소)은 가벼운 명단 하나만 읽고,
 * 상세 창 · 관리자 학생 조회처럼 한 학생을 볼 때만 상세 문서를 읽는다.
 * 상세에는 설문 · 레벨 테스트 · 상담 · 주소 · 여권 · 특이사항처럼 크거나 목록에 안 쓰는 값만 둔다.
 * (가족 캠프 familySTSheetCache 는 크기가 작아 나누지 않는다)
 */
import type { STSheetStudent } from '../types/student';

export const ST_DETAIL_SUBCOLLECTION = 'details';

/** 상세 문서에만 두는 칸 */
export const ST_DETAIL_FIELDS = [
  'notes', 'ssn', 'region', 'address', 'addressDetail', 'email', 'shirtSize',
  'passportName', 'passportNumber', 'passportExpiry', 'etc',
  'surveyMbti', 'surveyCampDecision', 'surveyCampExpectation', 'surveyCampExperience', 'surveyGameTime', 'surveySnsTime',
  'surveySchoolType', 'surveyAcademyPeriod', 'surveyNativeClassHours', 'surveySpeakingRatio', 'surveyLikesEnglish',
  'surveyGoodAtEnglish', 'surveyTalkFirst', 'surveyManyFriends', 'surveyGroupLeader', 'surveyFollowRules',
  'surveyListenTeacher', 'surveyHappyHome', 'surveyListenParents', 'surveySleepHours', 'surveyGoodAtStudy',
  'surveyPresentation', 'surveyGrowthMindset', 'surveyAsksQuestions', 'surveyNoHomeworkDelay', 'surveyFollowPlan',
  'surveyFocusInClass', 'surveyAcademyCount', 'surveyAcademyTypes',
  'placementSpeaking', 'placementReading', 'placementWriting',
  'finalSpeaking', 'finalReading', 'finalWriting',
  'classCounsel1', 'classCounsel2', 'classCounsel3', 'unitCounsel1', 'unitCounsel2', 'unitCounsel3', 'managerCounsel',
] as const satisfies readonly (keyof STSheetStudent)[];

export type StudentDetailField = typeof ST_DETAIL_FIELDS[number];
export type StudentDetailDoc = Partial<Pick<STSheetStudent, StudentDetailField>> & { studentId: string; name?: string };

const DETAIL_SET = new Set<string>(ST_DETAIL_FIELDS);

/** 상세 문서 id — 고유번호가 없으면 시트 행 번호 (주민번호 원본 stSheetSensitive 와 같은 키) */
export const studentKeyOf = (s: Pick<STSheetStudent, 'studentId'> & { rowNumber?: number }): string =>
  String(s.studentId || `row${s.rowNumber ?? ''}`);

/** 한 학생을 목록용 · 상세용으로 나눈다 (상세는 값이 있는 칸만) */
export function splitStudentRecord<T extends Record<string, unknown>>(s: T): { light: Record<string, unknown>; detail: StudentDetailDoc | null } {
  const light: Record<string, unknown> = {};
  const detail: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (DETAIL_SET.has(k)) {
      if (v !== undefined && v !== null && v !== '') detail[k] = v;
    } else {
      light[k] = v;
    }
  }
  if (Object.keys(detail).length === 0) return { light, detail: null };
  return { light, detail: { ...detail, studentId: String(s.studentId ?? ''), name: String(s.name ?? '') } as StudentDetailDoc };
}

/** 목록 항목 + 상세 문서 → 전체 학생 (상세가 없으면 목록 그대로) */
export function mergeStudentDetail<T extends object>(light: T, detail: Partial<StudentDetailDoc> | null | undefined): T {
  if (!detail) return light;
  const { studentId: _id, name: _name, ...rest } = detail;
  return { ...light, ...rest } as T;
}
