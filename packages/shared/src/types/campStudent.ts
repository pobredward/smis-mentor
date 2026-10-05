/**
 * 학생 정보의 원본 (SMIS CAMP 1.0 — 구글 시트 연동 없음)
 *
 *   children/{childId}                       아이 기본 정보 (캠프와 무관하게 계속 쓰는 값) — 학부모(parentIds) · 운영진 읽기
 *   children/{childId}/private/identity      주민번호 원본(암호화) — 서버만
 *   camps/{campCode}/enrollments/{studentId} 캠프 참가 (반 · 방 · 입퇴소 · 설문 · 테스트 · 상담 …) — 문서 id 는 캠프 안 학생 번호
 *                                            (이관한 학생은 시트 고유번호를 그대로 — 보건 · 용돈 · 기기 기록이 이 번호를 가리킨다)
 *   camps/{campCode}/families/{familyId}     가족 캠프의 한 가족 (함께 오는 보호자 · 가족 유형 · 방) — 운영진 읽기
 *   camps/{campCode}/families/{familyId}/private/identity  보호자 주민번호 원본(암호화) — 서버만
 *   camps/{campCode}/roster/current          목록용 명단 — 서버가 참가 · 아이 · 가족 문서가 바뀔 때마다 다시 만든다 (확정만)
 *
 * 모든 쓰기는 서버 API 로 (규칙은 클라이언트 쓰기를 막는다).
 */

import type { STSheetStudent, FamilyParent, FamilyUnit } from './student';

export type EnrollmentStatus = 'applied' | 'confirmed' | 'cancelled';

/** 아이 기본 정보 */
export interface ChildProfile {
  childId: string;
  name: string;
  englishName?: string;
  gender?: 'M' | 'F' | '';
  /** YYYY-MM-DD */
  birthDate?: string;
  region?: string;
  address?: string;
  addressDetail?: string;
  email?: string;
  parentName?: string;
  parentPhone?: string;
  otherName?: string;
  otherPhone?: string;
  /** 복용약 & 알레르기 */
  medication?: string;
  passportName?: string;
  passportNumber?: string;
  passportExpiry?: string;
  profilePhoto?: string;
  /** 운영진이 보는 가린 주민번호 (YYMMDD-G******) — 원본은 private/identity */
  ssnMasked?: string;
  /** 연결된 학부모 계정 */
  parentIds: string[];
  /** 학부모(법정대리인)가 앱에서 등록할 때 받은 동의 */
  guardianConsent?: { at: string; by: string; version: string };
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string;
}

/** 설문 · 레벨 테스트 · 상담 칸 (STSheetStudent 와 같은 이름) */
type EnrollmentRecordFields = Partial<Pick<STSheetStudent,
  | 'surveyMbti' | 'surveyCampDecision' | 'surveyCampExpectation' | 'surveyCampExperience' | 'surveyGameTime' | 'surveySnsTime'
  | 'surveySchoolType' | 'surveyAcademyPeriod' | 'surveyNativeClassHours' | 'surveySpeakingRatio' | 'surveyLikesEnglish'
  | 'surveyGoodAtEnglish' | 'surveyTalkFirst' | 'surveyManyFriends' | 'surveyGroupLeader' | 'surveyFollowRules'
  | 'surveyListenTeacher' | 'surveyHappyHome' | 'surveyListenParents' | 'surveySleepHours' | 'surveyGoodAtStudy'
  | 'surveyPresentation' | 'surveyGrowthMindset' | 'surveyAsksQuestions' | 'surveyNoHomeworkDelay' | 'surveyFollowPlan'
  | 'surveyFocusInClass' | 'surveyAcademyCount' | 'surveyAcademyTypes'
  | 'placementSpeaking' | 'placementReading' | 'placementWriting' | 'finalSpeaking' | 'finalReading' | 'finalWriting'
  | 'classCounsel1' | 'classCounsel2' | 'classCounsel3' | 'unitCounsel1' | 'unitCounsel2' | 'unitCounsel3' | 'managerCounsel'>>;

/** 캠프 참가 */
export interface CampEnrollment extends EnrollmentRecordFields {
  studentId: string;
  childId: string;
  campCode: string;
  status: EnrollmentStatus;
  /** 명단 순서 (이관: 시트 행 번호) */
  order?: number;
  /** 학부모 계정 (아이 문서와 같게 서버가 맞춘다 — 학부모가 자기 아이 참가만 찾을 수 있게) */
  parentIds?: string[];
  grade?: string;
  registrationSource?: string;
  classNumber?: string;
  className?: string;
  classMentor?: string;
  unitMentor?: string;
  roomNumber?: string;
  unit?: string;
  departureRoute?: string;
  arrivalRoute?: string;
  departureGroup?: string;
  departureInstructor?: string;
  arrivalGroup?: string;
  arrivalInstructor?: string;
  shirtSize?: string;
  notes?: string;
  etc?: string;
  /** 관리자가 정한 추가 칸 (예전 시트의 표시 열) — 칸 이름 → 값 */
  displayFields?: Record<string, string>;
  familyId?: string;
  appliedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string;
  updatedBy?: string;
}

/** 가족 캠프의 한 가족 — 아이들은 참가 문서(familyId)로 묶는다 */
export interface CampFamily {
  familyId: string;
  /** "2인 가족" 등 */
  familyType: string;
  /** 함께 오는 보호자 (주민번호는 가린 값 — 원본은 private/identity) */
  parents: FamilyParent[];
  roomNumber?: string;
  order?: number;
  updatedAt?: unknown;
  updatedBy?: string;
}

/** camps/{campCode}/roster/current */
export interface StudentRosterDoc {
  campCode: string;
  /** 확정된 학생 (STSheetStudent 모양 · 상세 칸 제외) */
  students: STSheetStudent[];
  /** 가족 캠프만 — 예전 familySTSheetCache.families 와 같은 모양 */
  families?: FamilyUnit[];
  total: number;
  updatedAt: string;
}

export const CHILDREN_COLLECTION = 'children';
export const CAMPS_COLLECTION = 'camps';
export const ENROLLMENTS_SUBCOLLECTION = 'enrollments';
export const ROSTER_SUBCOLLECTION = 'roster';
export const FAMILIES_SUBCOLLECTION = 'families';
export const ROSTER_DOC_ID = 'current';

/** 아이 문서에 두는 학생 칸 (STSheetStudent 이름 그대로 — ssn 은 ssnMasked) */
export const CHILD_STUDENT_FIELDS = [
  'name', 'englishName', 'gender', 'region', 'address', 'addressDetail', 'email',
  'parentName', 'parentPhone', 'otherName', 'otherPhone', 'medication',
  'passportName', 'passportNumber', 'passportExpiry', 'profilePhoto',
] as const;

/** 학부모가 앱에서 고칠 수 있는 아이 칸 */
export const PARENT_EDITABLE_CHILD_FIELDS = [
  'name', 'englishName', 'gender', 'birthDate', 'region', 'address', 'addressDetail', 'email',
  'parentName', 'parentPhone', 'otherName', 'otherPhone', 'medication',
  'passportName', 'passportNumber', 'passportExpiry',
] as const;

/** 학부모가 신청서에서 쓰는 참가 칸 (확정 전까지) */
export const PARENT_EDITABLE_ENROLLMENT_FIELDS = [
  'grade', 'shirtSize', 'departureRoute', 'arrivalRoute',
  'surveyMbti', 'surveyCampDecision', 'surveyCampExpectation', 'surveyCampExperience', 'surveyGameTime', 'surveySnsTime',
  'surveySchoolType', 'surveyAcademyPeriod', 'surveyNativeClassHours', 'surveySpeakingRatio', 'surveyLikesEnglish',
  'surveyGoodAtEnglish', 'surveyTalkFirst', 'surveyManyFriends', 'surveyGroupLeader', 'surveyFollowRules',
  'surveyListenTeacher', 'surveyHappyHome', 'surveyListenParents', 'surveySleepHours', 'surveyGoodAtStudy',
  'surveyPresentation', 'surveyGrowthMindset', 'surveyAsksQuestions', 'surveyNoHomeworkDelay', 'surveyFollowPlan',
  'surveyFocusInClass', 'surveyAcademyCount', 'surveyAcademyTypes',
] as const;
