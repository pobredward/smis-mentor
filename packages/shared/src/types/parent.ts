/**
 * 학부모 — SMIS CAMP 1.0
 * 학부모는 앱에서 아이를 등록하고(children/{childId}.parentIds), 열린 캠프에 참가를 신청한다
 * (camps/{캠프}/enrollments, 상태 '신청'). 운영진이 확정하면 캠프 명단에 들어간다.
 * 읽기는 규칙(parentIds)으로 바로, 쓰기는 모두 서버 API (/api/parent/*).
 */
import type { CampType } from './student';

export const isParentRole = (role: unknown): boolean => role === 'parent';

/** 학부모가 신청할 수 있는 캠프 (관리자가 '학부모 신청 받기'를 켠 캠프) */
export interface OpenCamp {
  campCode: string;
  name: string;
  generation: string;
  campType: CampType;
  location?: string;
  startDate?: string | null;
  endDate?: string | null;
}

/** 아이 등록 칸 */
export interface ParentChildField {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  kind?: 'text' | 'gender' | 'date' | 'phone' | 'area';
  /** 여권처럼 해외 캠프에만 필요한 칸 — 안내만 (등록은 언제든) */
  hint?: string;
}

export const PARENT_CHILD_FORM_FIELDS: ParentChildField[] = [
  { key: 'name', label: '아이 이름', required: true, placeholder: '홍길동' },
  { key: 'englishName', label: '영어 이름 (닉네임)', placeholder: 'Gildong' },
  { key: 'gender', label: '성별', required: true, kind: 'gender' },
  { key: 'birthDate', label: '생년월일', required: true, kind: 'date', placeholder: '2015-03-01' },
  { key: 'parentName', label: '보호자 이름', required: true },
  { key: 'parentPhone', label: '보호자 연락처', required: true, kind: 'phone', placeholder: '010-0000-0000' },
  { key: 'otherName', label: '기타 연락처 이름', placeholder: '예: 아버지' },
  { key: 'otherPhone', label: '기타 연락처', kind: 'phone' },
  { key: 'region', label: '지역', placeholder: '예: 서울 강남' },
  { key: 'address', label: '주소' },
  { key: 'addressDetail', label: '세부 주소' },
  { key: 'email', label: '이메일' },
  { key: 'medication', label: '복용약 · 알레르기 · 건강 특이사항', kind: 'area', placeholder: '없으면 비워 두세요' },
  { key: 'passportName', label: '여권 영문 이름', hint: '해외 캠프' },
  { key: 'passportNumber', label: '여권 번호', hint: '해외 캠프' },
  { key: 'passportExpiry', label: '여권 만료일', kind: 'date', hint: '해외 캠프' },
];

export type ApplicationQuestionKind = 'text' | 'number' | 'scale' | 'mbti';

/** 캠프 신청서 칸 — 키는 캠프 참가 문서(STSheetStudent)와 같다 */
export interface ApplicationQuestion {
  key: string;
  label: string;
  kind: ApplicationQuestionKind;
  section: 'camp' | 'survey';
  unit?: string;
  placeholder?: string;
  required?: boolean;
  /** 이 캠프 종류에서만 묻는다 (없으면 모두) */
  types?: CampType[];
}

const SURVEY_TYPES: CampType[] = ['EJ', 'S'];
const Q = (key: string, label: string, kind: ApplicationQuestionKind, extra: Partial<ApplicationQuestion> = {}): ApplicationQuestion =>
  ({ key, label, kind, section: 'survey', types: SURVEY_TYPES, ...extra });

export const APPLICATION_QUESTIONS: ApplicationQuestion[] = [
  { key: 'grade', label: '학년', kind: 'text', section: 'camp', required: true, placeholder: '예: 초5' },
  { key: 'departureRoute', label: '입소 여정 (어디에서 출발하나요?)', kind: 'text', section: 'camp', types: ['EJ'], placeholder: '예: 김포공항' },
  { key: 'arrivalRoute', label: '퇴소 여정 (어디로 돌아가나요?)', kind: 'text', section: 'camp', types: ['EJ'], placeholder: '예: 김포공항' },
  { key: 'shirtSize', label: '단체티 사이즈', kind: 'text', section: 'camp', types: ['S', 'DG', 'F'], placeholder: '예: 130 · S · M' },
  Q('surveyMbti', 'MBTI', 'mbti', { placeholder: '모르면 비워 두세요' }),
  Q('surveyCampDecision', '캠프 참여는 누가 결정했나요?', 'text', { placeholder: '예: 아이 · 부모님 · 함께' }),
  Q('surveyCampExpectation', '캠프에 기대하는 1순위', 'text', { placeholder: '예: 영어 실력 · 친구 · 자신감' }),
  Q('surveyCampExperience', '이전 영어캠프/어학캠프 경험 (1주 이상)', 'number', { unit: '회' }),
  Q('surveyGameTime', '하루 몇 시간 모바일이나 PC게임을 하나요?', 'number', { unit: '시간' }),
  Q('surveySnsTime', '하루 몇 시간 SNS(인스타그램, 틱톡 등)를 하나요?', 'number', { unit: '시간' }),
  Q('surveySchoolType', '현재 재학중인 학교 유형', 'text', { placeholder: '예: 일반 · 국제 · 대안' }),
  Q('surveyAcademyPeriod', '영어학원 다닌 기간', 'number', { unit: '년' }),
  Q('surveyNativeClassHours', '1주일당 원어민 선생님 수업시간', 'number', { unit: '시간' }),
  Q('surveySpeakingRatio', '원어민 수업에서 내가 말하는 비율', 'number', { unit: '%' }),
  Q('surveyLikesEnglish', '영어를 좋아하는 편인가요?', 'scale'),
  Q('surveyGoodAtEnglish', '영어를 잘 하는 편인가요?', 'scale'),
  Q('surveyTalkFirst', '처음 보는 친구에게 먼저 말을 거는 편인가요?', 'scale'),
  Q('surveyManyFriends', '학교에서 친구들이 많은 편인가요?', 'scale'),
  Q('surveyGroupLeader', '조별 활동에서 내가 주도적으로 임하는 편인가요?', 'scale'),
  Q('surveyFollowRules', '단체 활동에서 규칙을 잘 따르는 편인가요?', 'scale'),
  Q('surveyListenTeacher', '학교에서 선생님 말을 잘 듣는 편인가요?', 'scale'),
  Q('surveyHappyHome', '집이 화목한 편인가요?', 'scale'),
  Q('surveyListenParents', '부모님 말씀을 잘 듣는 편인가요?', 'scale'),
  Q('surveySleepHours', '평균 수면 시간', 'number', { unit: '시간' }),
  Q('surveyGoodAtStudy', '학교에서 상대적으로 공부를 잘 하는 편인가요?', 'scale'),
  Q('surveyPresentation', '학교에서 발표를 자주 하는 편이었나요?', 'scale'),
  Q('surveyGrowthMindset', '노력하면 실력이 늘어난다고 믿나요?', 'scale'),
  Q('surveyAsksQuestions', '모르면 바로바로 질문하는 편인가요?', 'scale'),
  Q('surveyNoHomeworkDelay', '숙제를 할 때 미루지 않고 시작하는 편인가요?', 'scale'),
  Q('surveyFollowPlan', '계획을 세우면 그대로 지키는 편인가요?', 'scale'),
  Q('surveyFocusInClass', '수업에서 집중을 잘 하는 편인가요?', 'scale'),
  Q('surveyAcademyCount', '다니는 학원 개수', 'number', { unit: '개' }),
  Q('surveyAcademyTypes', '다니는 학원 종류', 'text', { placeholder: '예: 영어, 수학, 피아노' }),
];

/** 5점 척도 (1 전혀 아니다 ~ 5 매우 그렇다) */
export const SCALE_CHOICES = [
  { value: '1', label: '전혀 아니다' },
  { value: '2', label: '아니다' },
  { value: '3', label: '보통' },
  { value: '4', label: '그렇다' },
  { value: '5', label: '매우 그렇다' },
] as const;

export const applicationQuestionsFor = (campType: CampType): ApplicationQuestion[] =>
  APPLICATION_QUESTIONS.filter((q) => !q.types || q.types.includes(campType));

/** 확정된 뒤에도 학부모가 고칠 수 있는 칸 (설문 · 단체티) — 반 배정 등에 쓰는 학년 · 여정은 운영진에게 */
export const PARENT_EDITABLE_AFTER_CONFIRM = new Set<string>(['shirtSize', ...APPLICATION_QUESTIONS.filter((q) => q.section === 'survey').map((q) => q.key)]);

export const ENROLLMENT_STATUS_LABEL: Record<string, string> = { applied: '신청 · 확인 중', confirmed: '참가 확정', cancelled: '취소' };
