/**
 * smiscamp 이관 계획 — 컬렉션마다 복사 · 건너뛰기 · 바꾸기 (2026-10-05 Firestore 검토 결정)
 *  - 결정: 커뮤니티 제거 · 지난 캠프 데이터 모두 옮김 · Storage 파일 복사(주소 바꿈) · 캠프 열쇠 campCode
 *  - 계획에 없는 컬렉션은 옮기지 않고 보고서에 '계획 없음'으로 남긴다 (모르고 옮기는 일 없게)
 */

/** users 에서 버리는 필드 — 빈 값 · 지난 마이그레이션 흔적 · 쓰기만 하던 표시 · 기기 상태(새 앱이 다시 등록) · 평문 주민번호 */
const USER_DROP = [
  'password', 'rrnLast', 'birthDate', 'ssn', 'rrnLastInvalidEncrypted', 'emailVerifiedBy',
  'oldUserId', 'migratedAt', 'mergedInto',
  'isProfileCompleted', 'isTermsAgreed', 'isPersonalAgreed', 'isAddressVerified', 'isProfileImageUploaded',
  'pushTokens', 'voipTokens', 'notificationPermission', 'lastMobileAt',
  'blockedUsers', 'phone',
];

const keep = (reason) => ({ mode: 'copy', reason });
const skip = (reason) => ({ mode: 'skip', reason });

/** 최상위 컬렉션 */
const COLLECTIONS = {
  users: { mode: 'copy', reason: '회원 — 죽은 필드 · 기기 상태 · 평문 주민번호 빼고', drop: USER_DROP },
  applicationHistories: { mode: 'copy', reason: '지원서', drop: ['migratedAt'] },
  jobBoards: { mode: 'transform', reason: '공고 — 면접 링크 · 안내문은 private/interview 로', transform: 'jobBoard' },
  jobCodes: keep('캠프 (code 가 캠프 열쇠)'),
  evaluations: { mode: 'copy', reason: '평가', drop: ['_migrated'] },
  evaluationCriteria: keep('평가 기준'),
  interviewDates: keep('면접 일정'),
  interviewScripts: { mode: 'transform', reason: '면접 대본 — 코드가 쓰는 common 만', transform: 'onlyCommon' },
  interviewSettings: keep('면접 링크 관리'),
  smsTemplates: keep('문자 템플릿'),
  reviews: keep('후기'),
  auditLogs: keep('감사 로그'),
  mcpAuditLogs: keep('MCP 감사 로그'),
  authIdentities: keep('소셜 · 전화 신원 연결표 (이관 후 backfill 로 다시 채움)'),
  appConfig: { mode: 'copy', reason: '앱 설정 — 안 쓰는 홈 문구 빼고', drop: ['mentorHomeMessage', 'foreignHomeMessage'] },
  appSettings: keep('교재 목록 · 단원'),
  campSettings: { mode: 'copy', reason: '캠프 설정 — 없앤 샘플 데이터 표시 빼고', drop: ['useTemporaryData'] },
  campTimetables: keep('시간표'),
  campTasks: keep('업무'),
  taskCategories: keep('업무 분류'),
  personalTasks: keep('개인 업무'),
  campPages: { mode: 'transform', reason: '캠프 페이지 — campCode 채움', transform: 'campPage' },
  campHomeMessages: keep('캠프 홈 문구'),
  campRosters: { mode: 'transform', reason: '선생님 표 — 문서 id 를 campCode 로', transform: 'rekeyByCampCode' },
  generationResources: { mode: 'transform', reason: '자료 링크(옛 방식) — 문서 id 를 campCode 로', transform: 'rekeyByCampCode' },
  lessonMaterialTemplates: { mode: 'transform', reason: '수업자료 템플릿 — 지운 것 빼고', transform: 'dropDeleted' },
  lessonMaterials: { mode: 'transform', reason: '수업자료 — 빈 껍데기 · 중복 정리, 섹션은 남은 문서로 모음', transform: 'lessonMaterial', drop: ['migratedAt'] },
  lessonPlans: keep('레슨플랜'),
  stSheetCache: { mode: 'transform', reason: '학생 명단 — 목록용 명단 + 학생별 상세(details) 로 나눔', transform: 'splitRoster' },
  familySTSheetCache: keep('가족 캠프 명단'),
  stSheetSensitive: { mode: 'transform', reason: '학생 주민번호 — 지금 · 다가오는 캠프만, 암호화해서 (지난 캠프는 export 보관 후 삭제)', transform: 'sealCurrentSensitive' },
  stSheetFieldConfig: keep('명단 칸 설정'),
  studentMemos: keep('학생 메모'),
  studentDevices: { mode: 'transform', reason: '학생 기기 — 지난 캠프의 잠금번호는 버림', transform: 'devicesDropPastLockCodes' },
  patientRecords: keep('환자 기록'),
  regularMedications: keep('상비약 · 정기 투약'),
  allowanceLedgers: keep('용돈 원장'),
  allowanceTxns: keep('용돈 거래'),
  inventoryItems: keep('재고 품목'),
  inventoryGroups: keep('재고 그룹'),
  inventoryStocks: keep('재고 수량'),
  inventoryMovements: keep('재고 이동'),
  inventoryDoseLedger: keep('투약 재고 장부'),
  supplyRequests: keep('구매 요청'),
  supplyGuides: keep('구매 안내'),
  supplySettings: keep('구매 설정'),
  lostItems: keep('분실물'),
  chatRooms: keep('채팅방'),
  chatUserState: keep('채팅 개인 상태'),
  chatCalls: keep('통화 기록'),
  chatScheduled: keep('예약 메시지 (보내기 전 것)'),
  chatPollReminders: keep('투표 마감 알림 (보내기 전 것)'),
  reports: keep('채팅 신고'),

  posts: skip('커뮤니티 제거'),
  userEvaluationSummaries: skip('users.evaluationSummary 로 합침'),
  user_id_mappings_backup: skip('지난 마이그레이션 백업 — 코드 참조 0'),
  user_id_mappings_backup_metadata: skip('지난 마이그레이션 백업'),
  shareTokens: { mode: 'transform', reason: '평가 공유 링크 — 만료 안 된 것만', transform: 'notExpired' },
  userLocations: skip('위치 기록 — 새로 쌓인다 (14일 보존)'),
  stSheetOverrides: skip('명단 임시 수정 — 다시 동기화하면 지워지는 값'),
  rateLimits: skip('짧은 수명'),
  pushReceiptQueue: skip('짧은 수명'),
  mcpOAuthClients: skip('Claude 연결은 다시 등록'),
  mcpOAuthRefreshTokens: skip('다시 로그인'),
  mcpOAuthCodes: skip('짧은 수명'),
  mcpPendingWrites: skip('짧은 수명'),
  staffMedicationUses: skip('코드 삭제됨'),
};

/** 하위 컬렉션 (collectionGroup 이름 → 계획). 부모가 옮겨진 것만 옮긴다 */
const SUBCOLLECTIONS = {
  private: keep('users/{uid}/private (계좌 · 여권 등 서버 전용), jobBoards/{id}/private (면접 안내)'),
  messages: keep('chatRooms/{id}/messages'),
  reads: keep('chatRooms/{id}/reads'),
  sections: keep('lessonMaterials/{id}/sections — 정리된 부모로 모음'),
  comments: skip('커뮤니티 제거'),
  students: skip('stSheetOverrides 아래 임시값'),
};

/** 학생 상세 문서에만 두는 칸 — packages/shared/src/utils/studentRecordSplit.ts ST_DETAIL_FIELDS 와 같게 */
const ST_DETAIL_FIELDS = [
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
];

module.exports = { COLLECTIONS, SUBCOLLECTIONS, USER_DROP, ST_DETAIL_FIELDS };
