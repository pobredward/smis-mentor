import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import type { CampType, STSheetStudent } from '../../types/student';
import type { STSheetFieldConfig, FieldSectionConfig, FieldItemConfig } from '../../types/fieldConfig';

const COLLECTION = 'stSheetFieldConfig';

/**
 * 캠프 타입별 기본 필드 구성
 * Firestore에 설정이 없을 때 폴백으로 사용 (기존 16개 FIELD_CONFIGS와 동일)
 */
export function getDefaultFieldConfig(campType: CampType): STSheetFieldConfig {
  const detailFields: FieldItemConfig[] = [
    { sheetHeader: '복용약 & 알레르기', fieldKey: 'medication',  label: '복용약 & 알레르기', isLegacy: true, permission: 'mentor', isEditable: true,  fieldType: 'text', order: 0, isVisible: true },
    { sheetHeader: '특이사항',           fieldKey: 'notes',       label: '특이사항',           isLegacy: true, permission: 'mentor', isEditable: true,  fieldType: 'text', order: 1, isVisible: true },
    { sheetHeader: '기타',               fieldKey: 'etc',         label: '기타',               isLegacy: true, permission: 'mentor', isEditable: true,  fieldType: 'text', order: 2, isVisible: true },
  ];

  const placementFields: FieldItemConfig[] = [
    { sheetHeader: 'P-Speaking', fieldKey: 'placementSpeaking', label: '입소 스피킹',    isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'score', maxScore: 30, order: 0, isVisible: true },
    { sheetHeader: 'P-Reading',  fieldKey: 'placementReading',  label: '입소 리딩',      isLegacy: true, permission: 'all',      isEditable: true,  fieldType: 'score', maxScore: 30, order: 1, isVisible: true },
    { sheetHeader: 'P-Writing',  fieldKey: 'placementWriting',  label: '입소 라이팅',    isLegacy: true, permission: 'all',      isEditable: true,  fieldType: 'score', maxScore: 40, order: 2, isVisible: true },
    { sheetHeader: 'F-Speaking', fieldKey: 'finalSpeaking',     label: '파이널 스피킹',  isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'score', maxScore: 30, order: 3, isVisible: true },
    { sheetHeader: 'F-Reading',  fieldKey: 'finalReading',      label: '파이널 리딩',    isLegacy: true, permission: 'all',      isEditable: true,  fieldType: 'score', maxScore: 30, order: 4, isVisible: true },
    { sheetHeader: 'F-Writing',  fieldKey: 'finalWriting',      label: '파이널 라이팅',  isLegacy: true, permission: 'all',      isEditable: true,  fieldType: 'score', maxScore: 40, order: 5, isVisible: true },
  ];

  const counselFields: FieldItemConfig[] = [
    { sheetHeader: '상담(반)1',    fieldKey: 'classCounsel1',  label: '담임 상담 1주차', isLegacy: true, permission: 'mentor', isEditable: true, fieldType: 'text', order: 0, isVisible: true },
    { sheetHeader: '상담(반)2',    fieldKey: 'classCounsel2',  label: '담임 상담 2주차', isLegacy: true, permission: 'mentor', isEditable: true, fieldType: 'text', order: 1, isVisible: true },
    { sheetHeader: '상담(반)3',    fieldKey: 'classCounsel3',  label: '담임 상담 3주차', isLegacy: true, permission: 'mentor', isEditable: true, fieldType: 'text', order: 2, isVisible: true },
    { sheetHeader: '상담(방)1',    fieldKey: 'unitCounsel1',   label: '유닛 상담 1주차', isLegacy: true, permission: 'mentor', isEditable: true, fieldType: 'text', order: 3, isVisible: true },
    { sheetHeader: '상담(방)2',    fieldKey: 'unitCounsel2',   label: '유닛 상담 2주차', isLegacy: true, permission: 'mentor', isEditable: true, fieldType: 'text', order: 4, isVisible: true },
    { sheetHeader: '상담(방)3',    fieldKey: 'unitCounsel3',   label: '유닛 상담 3주차', isLegacy: true, permission: 'mentor', isEditable: true, fieldType: 'text', order: 5, isVisible: true },
    { sheetHeader: '상담(매니저)', fieldKey: 'managerCounsel', label: '매니저 상담',     isLegacy: true, permission: 'mentor', isEditable: true, fieldType: 'text', order: 6, isVisible: true },
  ];

  // 사전 설문조사 (28기 이후 EJ·S 캠프)
  const surveyFields: FieldItemConfig[] = [
    { sheetHeader: 'MBTI',                                         fieldKey: 'surveyMbti',             label: 'MBTI',                          isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 0,  isVisible: true },
    { sheetHeader: '캠프 참여 결정',                                 fieldKey: 'surveyCampDecision',     label: '캠프 참여 결정',                  isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 1,  isVisible: true },
    { sheetHeader: '캠프에 기대하는 1순위',                           fieldKey: 'surveyCampExpectation',  label: '캠프에 기대하는 1순위',             isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 2,  isVisible: true },
    { sheetHeader: '이전 영어캠프/어학캠프 경험 (1주 이상)',            fieldKey: 'surveyCampExperience',   label: '이전 영어캠프 경험 (회)',            isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 3,  isVisible: true },
    { sheetHeader: '하루 몇 시간 모바일이나 PC게임을 하나요?',          fieldKey: 'surveyGameTime',         label: '모바일/PC게임 (시간/일)',            isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 4,  isVisible: true },
    { sheetHeader: '하루 몇 시간 SNS(인스타그램, 틱톡 등)를 하나요?',  fieldKey: 'surveySnsTime',          label: 'SNS (시간/일)',                    isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 5,  isVisible: true },
    { sheetHeader: '현재 재학중인 학교 유형',                          fieldKey: 'surveySchoolType',       label: '재학 학교 유형',                   isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 6,  isVisible: true },
    { sheetHeader: '영어학원 다닌 기간',                               fieldKey: 'surveyAcademyPeriod',    label: '영어학원 기간 (년)',                isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 7,  isVisible: true },
    { sheetHeader: '1주일당 원어민 선생님 수업시간',                     fieldKey: 'surveyNativeClassHours', label: '원어민 수업 (시간/주)',              isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 8,  isVisible: true },
    { sheetHeader: '원어민 수업에서 내가 말하는 비율',                   fieldKey: 'surveySpeakingRatio',    label: '원어민 수업 발화 비율 (%)',          isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 9,  isVisible: true },
    { sheetHeader: '영어를 좋아하는 편인가요?',                         fieldKey: 'surveyLikesEnglish',     label: '영어를 좋아하는 편',                isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 10, isVisible: true },
    { sheetHeader: '영어를 잘 하는 편인가요?',                          fieldKey: 'surveyGoodAtEnglish',    label: '영어를 잘 하는 편',                isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 11, isVisible: true },
    { sheetHeader: '처음 보는 친구에게 먼저 말을 거는 편인가요?',         fieldKey: 'surveyTalkFirst',        label: '처음 보는 친구에게 먼저 말 걸기',    isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 12, isVisible: true },
    { sheetHeader: '학교에서 친구들이 많은 편인가요?',                   fieldKey: 'surveyManyFriends',      label: '학교 친구가 많은 편',               isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 13, isVisible: true },
    { sheetHeader: '조별 활동에서 내가 주도적으로 임하는 편인가요?',      fieldKey: 'surveyGroupLeader',      label: '조별 활동 주도적',                 isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 14, isVisible: true },
    { sheetHeader: '단체 활동에서 규칙을 잘 따르는 편인가요?',           fieldKey: 'surveyFollowRules',      label: '단체 활동 규칙 준수',               isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 15, isVisible: true },
    { sheetHeader: '학교에서 선생님 말을 잘 듣는 편인가요?',             fieldKey: 'surveyListenTeacher',    label: '선생님 말 잘 듣기',                isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 16, isVisible: true },
    { sheetHeader: '집이 화목한 편인가요?',                             fieldKey: 'surveyHappyHome',        label: '집이 화목한 편',                   isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 17, isVisible: true },
    { sheetHeader: '부모님 말씀을 잘 듣는 편인가요?',                    fieldKey: 'surveyListenParents',    label: '부모님 말 잘 듣기',                isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 18, isVisible: true },
    { sheetHeader: '평균 수면 시간',                                    fieldKey: 'surveySleepHours',       label: '평균 수면 시간 (시간)',              isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 19, isVisible: true },
    { sheetHeader: '학교에서 상대적으로 공부를 잘 하는 편인가요?',        fieldKey: 'surveyGoodAtStudy',      label: '학교에서 공부 잘 하는 편',           isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 20, isVisible: true },
    { sheetHeader: '학교에서 발표를 자주 하는 편이었나요?',               fieldKey: 'surveyPresentation',     label: '학교 발표 자주 하는 편',            isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 21, isVisible: true },
    { sheetHeader: '노력하면 실력이 늘어난다고 믿나요?',                  fieldKey: 'surveyGrowthMindset',    label: '노력하면 실력 늘어난다 믿음',        isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 22, isVisible: true },
    { sheetHeader: '모르면 바로바로 질문하는 편인가요?',                  fieldKey: 'surveyAsksQuestions',    label: '모르면 바로 질문',                  isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 23, isVisible: true },
    { sheetHeader: '숙제를 할 때 미루지 않고 시작하는 편인가요?',         fieldKey: 'surveyNoHomeworkDelay',  label: '숙제 미루지 않기',                  isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 24, isVisible: true },
    { sheetHeader: '계획을 세우면 그대로 지키는 편인가요?',               fieldKey: 'surveyFollowPlan',       label: '계획 지키는 편',                   isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 25, isVisible: true },
    { sheetHeader: '수업에서 집중을 잘 하는 편인가요?',                   fieldKey: 'surveyFocusInClass',     label: '수업 집중 잘 하는 편',              isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 26, isVisible: true },
    { sheetHeader: '다니는 학원 개수',                                   fieldKey: 'surveyAcademyCount',     label: '다니는 학원 개수 (개)',             isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 27, isVisible: true },
    { sheetHeader: '다니는 학원 종류',                                   fieldKey: 'surveyAcademyTypes',     label: '다니는 학원 종류',                  isLegacy: true, permission: 'readonly', isEditable: false, fieldType: 'text', order: 28, isVisible: true },
  ];

  const sections: FieldSectionConfig[] = [
    { id: 'detail', label: '상세 정보', order: 0, isVisible: true, fields: detailFields },
  ];

  // DG·F 캠프는 레벨 테스트 없음
  if (campType !== 'DG' && campType !== 'F') {
    sections.push({ id: 'placement', label: '레벨 테스트', order: 1, isVisible: true, fields: placementFields });
  }

  // F 캠프는 상담 섹션 없음 (FamilyContent 별도 처리)
  if (campType !== 'F') {
    sections.push({ id: 'counsel', label: '상담', order: sections.length, isVisible: true, fields: counselFields });
  }

  // EJ·S 캠프에만 사전 설문조사 섹션 (28기 이후 존재, 값 없으면 렌더링 시 자동 숨김)
  if (campType === 'EJ' || campType === 'S') {
    sections.push({ id: 'survey', label: '사전 설문조사', order: sections.length, isVisible: true, fields: surveyFields });
  }

  return {
    campType,
    sections,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  };
}

/**
 * Firestore에서 캠프 타입별 필드 설정을 가져옴.
 * 설정이 없으면 getDefaultFieldConfig로 폴백.
 */
export async function getFieldConfig(db: Firestore, campType: CampType): Promise<STSheetFieldConfig> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, campType));
    if (snap.exists()) {
      return snap.data() as STSheetFieldConfig;
    }
  } catch {
    // 네트워크 오류 등 → 기본값 반환
  }
  return getDefaultFieldConfig(campType);
}

/**
 * 관리자가 구성한 필드 설정을 Firestore에 저장.
 * Firestore Rule: isAdmin()만 쓰기 허용
 */
export async function saveFieldConfig(db: Firestore, config: STSheetFieldConfig): Promise<void> {
  await setDoc(doc(db, COLLECTION, config.campType), config);
}

/**
 * student 객체에서 fieldItem 기준으로 값을 읽음.
 * - isLegacy: student[fieldKey] 직접 접근
 * - 신규 필드: student.displayFields[sheetHeader]
 */
export function getFieldValue(
  student: STSheetStudent | Record<string, unknown>,
  item: Pick<FieldItemConfig, 'fieldKey' | 'sheetHeader' | 'isLegacy'>,
): string {
  if (item.isLegacy) {
    return ((student as Record<string, unknown>)[item.fieldKey] as string | undefined) ?? '';
  }
  const displayFields = (student as Record<string, unknown>).displayFields as Record<string, string> | undefined;
  return displayFields?.[item.sheetHeader] ?? '';
}

/**
 * displayFields에 저장될 때 사용하는 키 (sheetHeader 그대로 사용)
 */
export function toDisplayFieldKey(sheetHeader: string): string {
  return sheetHeader;
}
