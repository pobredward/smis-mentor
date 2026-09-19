/**
 * MCP 범용 데이터 도구의 스키마 레지스트리 — 단일 진실 원천
 *
 * 어떤 컬렉션을 누가 읽고 쓸 수 있는지, 어떤 필드가 숨겨지고(개인정보) 어떤 필드를
 * AI 가 쓸 수 있는지, 참조 무결성은 무엇을 검사하는지 전부 여기서 선언한다.
 * describe_schema 도구는 이 파일을 그대로 AI 에게 설명한다.
 *
 * 원칙
 * - 여기 없는 컬렉션은 접근 불가 (환자 기록, 학생 시트, 토큰, 감사 로그 원본 등)
 * - hidden 필드는 읽기 응답에서 제거되고 쓰기에서도 거부된다
 * - serverManaged 필드(createdAt 등)는 서버가 채운다. AI 가 보내면 거부
 * - 쓰기는 관리자만, 기본 dry-run, confirm 시에만 실행, 전부 mcpAuditLogs 에 기록
 */
import type { Access, Viewer } from '@/lib/ai-content/site';

export type FieldType = 'string' | 'number' | 'boolean' | 'timestamp' | 'string[]' | 'object' | 'object[]' | 'html' | 'any';

export interface FieldSpec {
  type: FieldType;
  description: string;
  /** create 시 필수 */
  required?: boolean;
  enum?: string[];
  /** AI 가 create/update 로 설정 가능 (기본 false) */
  writable?: boolean;
  /** 큰 필드 — query_documents 결과에서 기본 생략 (includeLarge 또는 fields 로 요청) */
  large?: boolean;
  /** 참조 무결성: 값이 해당 컬렉션의 문서 ID(id) 또는 코드(code)여야 함 */
  ref?: { collection: string; by: 'id' | 'code' };
  /** 관리자에게만 보이는 필드 */
  adminOnly?: boolean;
}

export type WriteOp = 'create' | 'update' | 'delete';

/** 멘토(비관리자) 요청자의 조회 범위 제한 방식 */
export type MentorScope =
  | { kind: 'none' } // 제한 없음
  | { kind: 'camp-id'; field: string } // field 값이 요청자의 참여 캠프(jobCodes 문서 ID)여야 함
  | { kind: 'camp-code'; field: string } // field 값이 요청자의 참여 캠프 코드(S29 등)여야 함
  | { kind: 'doc-id-camp-id' } // 문서 ID 가 참여 캠프 ID
  | { kind: 'doc-id-camp-code' } // 문서 ID 가 참여 캠프 코드
  | { kind: 'own-user'; field: string }; // field 값이 요청자 uid

export interface CollectionSpec {
  /** Firestore 컬렉션 이름 */
  name: string;
  /** 서브컬렉션이면 상위 경로 템플릿. 예: "lessonMaterials/{parentId}/sections" */
  parent?: { collection: string; description: string };
  description: string;
  read: Access;
  write?: { ops: WriteOp[] };
  scope: MentorScope;
  fields: Record<string, FieldSpec>;
  /** 읽기 응답에서 제거되는 필드 (점 표기 가능). 쓰기도 거부 */
  hidden?: string[];
  /** 서버가 채우는 필드 — AI 가 지정 불가 */
  serverManaged?: string[];
  /** create 시 서버가 강제로 넣는 값 */
  forcedOnCreate?: (viewer: Viewer) => Record<string, unknown>;
  /** create 시 문서 ID 를 호출자가 지정해야 하는 컬렉션 (예: 캠프 코드가 ID) */
  idOnCreate?: 'auto' | 'uuid' | 'required';
  /** 스키마에 없는 필드도 읽기 응답에 포함 (쓰기는 항상 스키마 필드만) */
  openRead?: boolean;
  notes?: string[];
}

const ts = (description: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({ type: 'timestamp', description, ...extra });
const str = (description: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({ type: 'string', description, ...extra });
const num = (description: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({ type: 'number', description, ...extra });
const bool = (description: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({ type: 'boolean', description, ...extra });

const AUDIT_FIELDS = ['createdAt', 'updatedAt', 'createdBy', 'updatedBy'];

export const EVALUATION_STAGES = ['서류 전형', '면접 전형', '대면 교육', '캠프 생활'];

export const COLLECTIONS: Record<string, CollectionSpec> = {
  // ─── 캠프 기본 ───────────────────────────────────────────────────────
  jobCodes: {
    name: 'jobCodes',
    description: '캠프(기수·코드·기간·장소). 다른 컬렉션이 문서 ID(jobCodeId) 또는 코드(campCode, 예: S29)로 참조한다.',
    read: 'mentor',
    scope: { kind: 'none' },
    fields: {
      code: str('캠프 코드. 예: S29, J28, F27_1'),
      generation: str('기수. 예: 29기'),
      name: str('캠프명. 예: 싱&말 영어캠프'),
      location: str('장소'),
      korea: bool('국내 캠프 여부'),
      startDate: ts('캠프 시작일'),
      endDate: ts('캠프 종료일'),
      eduDates: { type: 'object[]', description: '대면 교육일 목록(timestamp[])' },
    },
    serverManaged: AUDIT_FIELDS,
    notes: ['업무(campTasks)·카테고리·홈 메시지는 code 로, 교육 페이지(campPages)·자료 링크(generationResources)는 문서 ID 로 캠프를 가리킨다.'],
  },

  campPages: {
    name: 'campPages',
    description: '캠프 운영 페이지 — 교육(education)/시간표(schedule)/인솔표(guide) 탭에 표시되는 TipTap HTML 문서.',
    read: 'mentor',
    write: { ops: ['create', 'update', 'delete'] },
    scope: { kind: 'camp-id', field: 'jobCodeId' },
    idOnCreate: 'uuid',
    fields: {
      jobCodeId: str('캠프 jobCodes 문서 ID', { required: true, writable: true, ref: { collection: 'jobCodes', by: 'id' } }),
      category: str('탭 분류', { required: true, writable: true, enum: ['education', 'schedule', 'guide'] }),
      title: str('페이지 제목', { required: true, writable: true }),
      targetRole: str('대상. common=전체, mentor=한국인 멘토, foreign=원어민, expired=만료(관리자만 표시)', {
        required: true,
        writable: true,
        enum: ['common', 'mentor', 'foreign', 'expired'],
      }),
      content: { type: 'html', description: 'TipTap 에디터 HTML 본문 (h1~h3, p, ul/ol, a, img, table, span style 등)', required: true, writable: true, large: true },
      emoji: str('아이콘 이모지', { writable: true }),
      order: num('탭 내 표시 순서(0부터)', { required: true, writable: true }),
    },
    serverManaged: AUDIT_FIELDS,
    notes: [
      '다른 캠프로 복사할 때: 원본을 get_document(includeLarge) 로 읽고, jobCodeId 를 대상 캠프 ID 로 바꾸고, 본문의 날짜·장소·캠프명·기수를 치환한 뒤 create 한다. 이미지 URL 은 그대로 써도 열린다.',
      'order 는 대상 캠프의 같은 category 안에서 중복되지 않게 정한다 (기존 최대값+1 부터).',
    ],
  },

  generationResources: {
    name: 'generationResources',
    description: '캠프별 자료 링크 묶음(교육/시간표/인솔표 탭의 외부 링크). 문서 ID = 캠프 jobCodes 문서 ID.',
    read: 'mentor',
    write: { ops: ['create', 'update'] },
    scope: { kind: 'doc-id-camp-id' },
    idOnCreate: 'required',
    fields: {
      jobCodeId: str('캠프 jobCodes 문서 ID (문서 ID 와 동일)', { required: true, writable: true, ref: { collection: 'jobCodes', by: 'id' } }),
      generation: str('기수', { writable: true }),
      code: str('캠프 코드', { writable: true }),
      educationLinks: { type: 'object[]', description: '교육 탭 링크 [{id, title, url, targetRole, createdAt, createdBy}]', writable: true },
      scheduleLinks: { type: 'object[]', description: '시간표 탭 링크 (같은 구조)', writable: true },
      guideLinks: { type: 'object[]', description: '인솔표 탭 링크 (같은 구조)', writable: true },
    },
    serverManaged: AUDIT_FIELDS,
    notes: ['링크 배열은 통째로 교체된다. 항목을 추가하려면 기존 배열을 읽어 합친 뒤 update 한다. 새 항목의 id 는 UUID 로 만든다.'],
  },

  campHomeMessages: {
    name: 'campHomeMessages',
    description: '캠프 홈 상단 공지 메시지. 문서 ID = 캠프 코드(예: J28).',
    read: 'mentor',
    write: { ops: ['create', 'update'] },
    scope: { kind: 'doc-id-camp-code' },
    idOnCreate: 'required',
    fields: {
      mentorMessage: str('한국인 멘토용 메시지', { writable: true }),
      foreignMessage: str('원어민용 메시지', { writable: true }),
    },
    serverManaged: ['updatedAt', 'updatedBy'],
  },

  campTasks: {
    name: 'campTasks',
    description: '캠프 업무(Task) — 날짜별 체크리스트. 캠프는 campCode(코드)로 가리킨다.',
    read: 'mentor',
    write: { ops: ['create', 'update', 'delete'] },
    scope: { kind: 'camp-code', field: 'campCode' },
    idOnCreate: 'auto',
    fields: {
      campCode: str('캠프 코드 (jobCodes.code)', { required: true, writable: true, ref: { collection: 'jobCodes', by: 'code' } }),
      title: str('업무 제목', { required: true, writable: true }),
      description: str('업무 설명 (줄바꿈 \\n 허용)', { writable: true }),
      targetRoles: { type: 'string[]', description: '대상 역할. 예: ["담임", "수업", "매니저"]', required: true, writable: true },
      targetGroups: { type: 'string[]', description: '대상 그룹. ["공통"] 이면 전체', required: true, writable: true },
      date: ts('업무 날짜 (YYYY-MM-DD 로 주면 한국시간 자정)', { required: true, writable: true }),
      time: str('시간 HH:mm (선택)', { writable: true }),
      estimatedDuration: { type: 'object', description: '{ value: number, unit: "minutes" | "hours" }', writable: true },
      categoryId: str('taskCategories 문서 ID (같은 campCode 의 카테고리여야 함)', { writable: true, ref: { collection: 'taskCategories', by: 'id' } }),
      attachments: { type: 'object[]', description: '[{ type: "link"|"image"|"file", name, url }]', writable: true },
      groupId: str('여러 날짜에 걸친 업무를 묶는 UUID (같은 업무를 여러 날 만들 때 동일 값)', { writable: true }),
      completions: { type: 'object[]', description: '완료 기록 [{userId, userName, userRole, completedAt}] — 서버 관리, 복사 시 비워짐' },
    },
    serverManaged: [...AUDIT_FIELDS, 'completions'],
    forcedOnCreate: () => ({ completions: [] }),
    notes: [
      '다른 캠프로 복사할 때: 원본 캠프와 대상 캠프의 startDate 차이(일수)를 date 에 더한다. 요일이 어긋나면 개별 조정한다.',
      'categoryId 는 캠프별이므로 대상 캠프에 같은 이름의 카테고리가 없으면 taskCategories 를 먼저 만든다.',
      '여러 날 반복 업무는 날짜별로 문서를 하나씩 만들고 같은 groupId 를 준다.',
    ],
  },

  taskCategories: {
    name: 'taskCategories',
    description: '캠프별 업무 카테고리(이름·색상).',
    read: 'mentor',
    write: { ops: ['create', 'update', 'delete'] },
    scope: { kind: 'camp-code', field: 'campCode' },
    idOnCreate: 'auto',
    fields: {
      campCode: str('캠프 코드', { required: true, writable: true, ref: { collection: 'jobCodes', by: 'code' } }),
      name: str('카테고리 이름', { required: true, writable: true }),
      color: str('색상 hex. 예: #4ade80', { writable: true }),
    },
    serverManaged: AUDIT_FIELDS,
  },

  campTimetables: {
    name: 'campTimetables',
    description:
      '캠프 시간표 — 캠프 × 그룹 × 일과 유형 하나당 문서 1개. 앱의 캠프>시간표 탭이 이 문서를 그대로 표로 그린다. 담임 이름은 저장하지 않고 classes[].classCode 로 users 에서 조인한다.',
    read: 'mentor',
    write: { ops: ['create', 'update', 'delete'] },
    scope: { kind: 'camp-id', field: 'jobCodeId' },
    idOnCreate: 'uuid',
    fields: {
      campCode: str('캠프 코드 (예: J29)', { required: true, writable: true, ref: { collection: 'jobCodes', by: 'code' } }),
      jobCodeId: str('캠프 jobCodes 문서 ID', { required: true, writable: true, ref: { collection: 'jobCodes', by: 'id' } }),
      groupName: str('그룹 이름. campSettings.groups[].name 과 맞춘다 (예: Junior)', { required: true, writable: true }),
      dayType: str('일과 유형 키 (regular | steam | final | arrival | departure | 자유)', { required: true, writable: true }),
      dayTypeLabel: str('일과 유형 표시 이름 (예: Regular Day)', { required: true, writable: true }),
      layout: str('표 종류. time=교시 표(Regular/STEAM/Final), date=날짜 표(인문학 프로그램)', { required: true, writable: true, enum: ['time', 'date'] }),
      order: num('캠프 안에서의 표시 순서', { writable: true }),
      classes: {
        type: 'object[]',
        description: '반 열 [{ classCode, className, classroom, grade }]. classCode 가 users.jobExperiences[].classCode 와 같아야 담임 이름이 자동으로 붙는다.',
        required: true,
        writable: true,
      },
      extraColumns: { type: 'object[]', description: '반이 아닌 전담 열 [{ key, label, teacherName }] (예: Pattern)', writable: true },
      subjects: {
        type: 'object[]',
        description:
          '과목·주제 정의 [{ key, partner, ownerClassCode?, color? }]. partner 가 칸의 둘째 줄을 누가 채울지 정한다 — foreign=그 과목 원어민(그룹+groupRole 로 조회), pattern=Pattern 전담, owner=ownerClassCode 의 담임(주제와 함께 로테이션), ownTeacher=그 반 담임, none=둘째 줄 없음.',
        required: true,
        writable: true,
      },
      blocks: {
        type: 'object[]',
        description:
          '표의 줄 목록. [{ id, kind: "shared"|"class", times: [{start,end}] (layout=time, 2개면 1~2교시 한 세트), dateLabel (layout=date), lines, label (shared), cells (class): { 반코드: { subject, partnerFirst?, texts?, note? } }, color }]. 반별 칸은 과목만 넣으면 둘째 줄이 subjects 규칙으로 자동 채워진다.',
        required: true,
        writable: true,
        large: true,
      },
      note: str('표 하단 메모 (교재 코드 안내 등)', { writable: true }),
    },
    serverManaged: AUDIT_FIELDS,
    notes: [
      '반 개수는 classes 길이로 정해진다. 4반이든 5반이든 열 개수만 달라진다.',
      '식사·P.E·인문학처럼 그룹 전체가 함께하는 시간은 kind="shared" 에 label 만 넣는다.',
      '사람 이름은 저장하지 않는다. 담임은 classCode, 원어민은 그룹+담당 과목(groupRole)으로 앱 배정에서 조인된다. 이름을 칸에 직접 쓰지 말 것.',
      '수업 시간표는 1~2교시가 한 세트다: 1교시 한국인 과목, 2교시 그 과목 원어민(Math 는 Pattern). 인문학·STEAM 은 주제와 담당 담임이 함께 로테이션한다(partner: owner).',
      '다른 캠프로 복사할 때: campCode·jobCodeId 를 대상 캠프로 바꾸고, classes 의 classCode 를 대상 캠프 반번호로 바꾼 뒤 periods 의 cells 키도 같이 바꾼다.',
      '그룹·반 구성의 출처는 campSettings/{campCode}.groups 이다. 먼저 그쪽을 확인하면 반번호를 맞추기 쉽다.',
    ],
  },

  // ─── 수업 자료 ───────────────────────────────────────────────────────
  lessonMaterials: {
    name: 'lessonMaterials',
    description: '멘토 개인의 수업 자료 대주제(예: "S28 패턴"). 섹션(링크)은 서브컬렉션 lessonMaterials/{id}/sections.',
    read: 'mentor',
    scope: { kind: 'own-user', field: 'userId' },
    fields: {
      userId: str('소유 멘토 uid'),
      title: str('대주제 제목'),
      order: num('표시 순서'),
      templateId: str('lessonMaterialTemplates 문서 ID'),
      userCode: str('사용자가 추가한 대주제 코드'),
    },
    serverManaged: AUDIT_FIELDS,
  },
  sections: {
    name: 'sections',
    parent: { collection: 'lessonMaterials', description: 'parentId = lessonMaterials 문서 ID' },
    description: '수업 자료 섹션 — 차시별 보기/원본 링크.',
    read: 'mentor',
    scope: { kind: 'none' }, // 상위 문서 접근 검사로 대체
    fields: {
      title: str('섹션 제목. 예: 1차시 PPT'),
      order: num('순서'),
      viewUrl: str('보기 링크'),
      originalUrl: str('원본(편집) 링크'),
      templateSectionId: str('템플릿 섹션 ID'),
    },
    serverManaged: AUDIT_FIELDS,
  },
  lessonMaterialTemplates: {
    name: 'lessonMaterialTemplates',
    description: '수업 자료 템플릿(관리자가 만든 대주제/섹션 골격과 참고 링크).',
    read: 'mentor',
    scope: { kind: 'none' },
    fields: {
      title: str('템플릿 제목. 예: S28 패턴'),
      code: str('캠프 코드'),
      links: { type: 'object[]', description: '[{label, url}] 공통 링크' },
      sections: { type: 'object[]', description: '[{id, title, order, links:[{label,url}]}]' },
      deleted: bool('삭제 플래그'),
    },
    serverManaged: AUDIT_FIELDS,
  },

  // ─── 채용 ────────────────────────────────────────────────────────────
  jobBoards: {
    name: 'jobBoards',
    description: '채용 공고. 본문(description)은 TipTap HTML.',
    read: 'mentor',
    write: { ops: ['create', 'update'] },
    scope: { kind: 'none' },
    idOnCreate: 'auto',
    fields: {
      title: str('공고 제목', { required: true, writable: true }),
      description: { type: 'html', description: '공고 본문 HTML', required: true, writable: true, large: true },
      status: str('모집 상태', { required: true, writable: true, enum: ['active', 'closed'] }),
      generation: str('기수. 예: 29기', { required: true, writable: true }),
      jobCode: str('캠프 코드', { required: true, writable: true, ref: { collection: 'jobCodes', by: 'code' } }),
      refJobCodeId: str('캠프 jobCodes 문서 ID', { required: true, writable: true, ref: { collection: 'jobCodes', by: 'id' } }),
      korea: bool('국내 여부', { required: true, writable: true }),
      educationStartDate: ts('교육/활동 시작일', { writable: true }),
      educationEndDate: ts('교육/활동 종료일', { writable: true }),
      interviewDates: { type: 'object[]', description: '면접 일정 [{start: timestamp, end: timestamp}]', writable: true },
      interviewBaseDuration: num('1인당 면접 시간(분)', { writable: true }),
      interviewBaseNotes: str('면접 안내 문구 (지원자에게 표시)', { writable: true, adminOnly: true }),
      code: str('레거시 코드 필드', { writable: true }),
    },
    hidden: ['interviewPassword', 'interviewBaseLink'],
    serverManaged: AUDIT_FIELDS,
    notes: ['면접 링크·비밀번호는 AI 에 노출·수정 불가. 새 공고는 기존 공고를 get_document 로 읽어 본문을 바탕으로 만드는 것이 안전하다.'],
  },

  applicationHistories: {
    name: 'applicationHistories',
    description: '지원 이력 — 공고별 지원자의 서류/면접/최종 상태.',
    read: 'admin',
    scope: { kind: 'none' },
    fields: {
      refUserId: str('지원자 uid (users)'),
      refJobBoardId: str('공고 ID (jobBoards)'),
      applicationStatus: str('서류: pending | accepted | rejected'),
      interviewStatus: str('면접: pending | complete | passed | failed | absent'),
      finalStatus: str('최종: finalAccepted | finalRejected | finalAbsent'),
      applicationDate: ts('지원일'),
      interviewDate: ts('면접 일시'),
      interviewFeedback: str('면접 메모'),
      applicationPath: str('지원 경로'),
    },
    hidden: ['interviewBaseLink'],
    serverManaged: AUDIT_FIELDS,
  },

  users: {
    name: 'users',
    description: '사용자(멘토·원어민·관리자). 연락처·주소·주민번호·생년월일·인증정보는 제거되어 보이지 않는다.',
    read: 'admin',
    scope: { kind: 'none' },
    openRead: true,
    fields: {
      name: str('이름'),
      role: str('mentor | mentor_temp | foreign | foreign_temp | admin'),
      status: str('temp | active | inactive | deleted'),
      university: str('대학'),
      major1: str('전공'),
      major2: str('복수전공'),
      grade: num('학년'),
      isOnLeave: bool('휴학 여부'),
      jobExperiences: { type: 'object[]', description: '[{id: jobCodes 문서 ID, group, groupRole, classCode}] 참여 캠프' },
      jobCodeIds: { type: 'string[]', description: '참여 캠프 ID 목록' },
      activeJobExperienceId: str('활성 캠프 ID'),
      selfIntroduction: str('자기소개', { large: true }),
      jobMotivation: str('지원 동기', { large: true }),
      partTimeJobs: { type: 'object[]', description: '알바 경력 [{period, companyName, position, description}]' },
      schoolActivities: { type: 'object[]', description: '교내 활동 [{name, period, description}]' },
      referralPath: str('유입 경로'),
      evaluationSummary: { type: 'object', description: '평가 요약(단계별 평균)' },
      createdAt: ts('가입일'),
      lastLoginAt: ts('최근 로그인'),
    },
    hidden: [
      'email',
      'originalEmail',
      'originalName',
      'phone',
      'phoneNumber',
      'password',
      'address',
      'addressDetail',
      'geocode',
      'rrnFront',
      'rrnLast',
      'rrnLastEncrypted',
      'dateOfBirth',
      'age',
      'gender',
      'authProviders',
      'primaryAuthMethod',
      'oldUserId',
      'foreignTeacher.cvUrl',
      'foreignTeacher.passportPhotoUrl',
      'foreignTeacher.foreignIdCardUrl',
      'foreignTeacher.bankBookUrl',
      'foreignTeacher.eslCertUrl',
      'profileImage',
      'feedback',
      'deletedBy',
    ],
    serverManaged: AUDIT_FIELDS,
    notes: ['서류 평가용 정보: selfIntroduction, jobMotivation, university/major/grade, partTimeJobs, schoolActivities, jobExperiences (large 필드는 fields 로 지정해 요청).'],
  },

  evaluations: {
    name: 'evaluations',
    description: '지원자 단계별 평가. AI 는 초안(isFinalized=false, isVisible=false, aiDraft=true)만 만들 수 있고 확정은 관리자가 화면에서 한다.',
    read: 'admin',
    write: { ops: ['create'] },
    scope: { kind: 'none' },
    idOnCreate: 'auto',
    fields: {
      refUserId: str('평가 대상 uid', { required: true, writable: true, ref: { collection: 'users', by: 'id' } }),
      refJobBoardId: str('공고 ID', { writable: true, ref: { collection: 'jobBoards', by: 'id' } }),
      refApplicationId: str('지원 이력 ID', { writable: true, ref: { collection: 'applicationHistories', by: 'id' } }),
      evaluationStage: str('평가 단계', { required: true, writable: true, enum: EVALUATION_STAGES }),
      criteriaTemplateId: str('평가 기준 템플릿 ID (evaluationCriteria)', { required: true, writable: true, ref: { collection: 'evaluationCriteria', by: 'id' } }),
      scores: { type: 'object', description: '{ [criteriaId]: { score: number, maxScore: number } } — 템플릿 criteria 전부에 대해 0~maxScore 정수', required: true, writable: true },
      totalScore: num('서버 계산: 항목 점수의 단순 평균 (앱과 동일한 방식)'),
      maxTotalScore: num('서버 계산: 10 고정'),
      percentage: num('서버 계산: totalScore / 10 × 100'),
      feedback: str('종합 코멘트', { writable: true }),
      criteriaFeedback: { type: 'object', description: '{ [criteriaId]: string } 항목별 근거', writable: true },
      evaluatorId: str('평가자 uid (서버 설정)'),
      evaluatorName: str('평가자 이름 (서버 설정, "이름 (AI 초안)")'),
      evaluatorRole: str('평가자 역할 (서버 설정)'),
      isFinalized: bool('확정 여부 (AI 초안은 항상 false)'),
      isVisible: bool('지원자 공개 여부 (AI 초안은 항상 false)'),
      aiDraft: bool('AI 초안 표시'),
      evaluationDate: ts('평가 일시 (서버 설정)'),
    },
    serverManaged: [...AUDIT_FIELDS, 'evaluatorId', 'evaluatorName', 'evaluatorRole', 'isFinalized', 'isVisible', 'aiDraft', 'evaluationDate', 'totalScore', 'maxTotalScore', 'percentage'],
    forcedOnCreate: (viewer) => ({
      evaluatorId: viewer.uid,
      evaluatorName: `${viewer.name} (AI 초안)`,
      evaluatorRole: '관리자',
      isFinalized: false,
      isVisible: false,
      aiDraft: true,
      evaluationDate: new Date(),
    }),
    notes: [
      '서류 전형 초안 만들기: evaluationCriteria 에서 stage="서류 전형", isActive=true 템플릿을 읽고 → 지원자 users 문서(selfIntroduction, jobMotivation, 학력, 경력) → criteria 별 score 와 근거(criteriaFeedback) 작성 → create. 점수 합계·백분율은 서버가 계산한다. 같은 지원자·공고·단계에 AI 초안이 이미 있으면 거부되고, 사람이 쓴 평가가 있으면 경고만 표시된다.',
      'userEvaluationSummaries(집계)는 관리자가 확정할 때 앱이 갱신하므로 AI 초안은 집계에 반영되지 않는다.',
    ],
  },

  evaluationCriteria: {
    name: 'evaluationCriteria',
    description: '평가 기준 템플릿(단계별 항목·만점).',
    read: 'admin',
    scope: { kind: 'none' },
    fields: {
      stage: str('평가 단계'),
      name: str('템플릿 이름'),
      description: str('설명'),
      criteria: { type: 'object[]', description: '[{id, name, description, maxScore, order}]' },
      isActive: bool('사용 중'),
      isDefault: bool('기본 템플릿'),
    },
    serverManaged: AUDIT_FIELDS,
  },

  userEvaluationSummaries: {
    name: 'userEvaluationSummaries',
    description: '사용자별 확정 평가 집계(단계별 평균·횟수). 문서 ID = uid.',
    read: 'admin',
    scope: { kind: 'none' },
    openRead: true,
    fields: {
      userId: str('uid'),
      overallAverage: num('전체 평균'),
      totalEvaluations: num('총 평가 수'),
    },
  },

  interviewDates: {
    name: 'interviewDates',
    description: '면접 일정 문서(공고별 날짜·녹화 링크).',
    read: 'admin',
    scope: { kind: 'none' },
    openRead: true,
    fields: {
      date: ts('면접 일시'),
      jobBoardId: str('공고 ID'),
      jobBoardTitle: str('공고 제목'),
      recordingUrl: str('녹화 링크'),
    },
  },

  // ─── 기타 읽기 전용 ───────────────────────────────────────────────────
  reviews: {
    name: 'reviews',
    description: '멘토 후기(공개 콘텐츠).',
    read: 'mentor',
    scope: { kind: 'none' },
    fields: {
      title: str('제목'),
      content: { type: 'html', description: '본문 HTML', large: true },
      generation: str('기수 또는 "Best 후기"'),
      jobCode: str('캠프 코드'),
      author: { type: 'object', description: '{id, name}' },
    },
    hidden: ['author.profileImage'],
    serverManaged: AUDIT_FIELDS,
  },
  campSettings: {
    name: 'campSettings',
    description: '캠프별 설정(임시 데이터 모드 등). 문서 ID = 캠프 코드.',
    read: 'admin',
    scope: { kind: 'none' },
    openRead: true,
    fields: { campCode: str('캠프 코드'), useTemporaryData: bool('임시 데이터 표시 모드') },
  },
  smsTemplates: {
    name: 'smsTemplates',
    description: '문자 발송 템플릿.',
    read: 'admin',
    scope: { kind: 'none' },
    openRead: true,
    fields: {},
  },
  appConfig: {
    name: 'appConfig',
    description: '앱 설정.',
    read: 'admin',
    scope: { kind: 'none' },
    openRead: true,
    fields: {},
  },
  mcpAuditLogs: {
    name: 'mcpAuditLogs',
    description: 'AI(MCP) 쓰기 작업 감사 로그 — 누가 언제 무엇을 바꿨는지.',
    read: 'admin',
    scope: { kind: 'none' },
    openRead: true,
    fields: {
      uid: str('실행자 uid'),
      name: str('실행자 이름'),
      note: str('작업 메모'),
      operations: { type: 'object[]', description: '[{op, collection, id, summary}]' },
      at: ts('실행 시각'),
    },
  },
};

/** 접근 자체가 차단된 컬렉션과 이유 (describe_schema 안내용) */
export const EXCLUDED_COLLECTIONS: Record<string, string> = {
  patientRecords: '학생 건강 정보(민감 정보)',
  stSheetCache: '학생 명단 원본 — 연락처·주민번호·여권 포함. 대신 read_page("/camp/roster/{code}") 로 개인정보 제거 명단 사용',
  familySTSheetCache: '가족 캠프 명단 원본 (위와 동일)',
  stSheetOverrides: '학생 시트 수정 내역',
  students: '학생 이력',
  personalTasks: '멘토 개인 업무',
  shareTokens: '외부 공유 토큰',
  auditLogs: '앱 감사 로그',
  mcpOAuthClients: 'OAuth 내부 데이터',
  mcpOAuthCodes: 'OAuth 내부 데이터',
  mcpOAuthRefreshTokens: 'OAuth 내부 데이터',
};

export const DATA_TOOL_LIMITS = {
  queryDefaultLimit: 50,
  queryMaxLimit: 200,
  scanCap: 1000, // 메모리 필터/정렬 시 Firestore 에서 가져오는 최대 문서 수
  maxWriteOps: 50,
  maxInValues: 30,
};

export const RECIPES: { title: string; steps: string[] }[] = [
  {
    title: '교육 자료 페이지를 A 캠프에서 B 캠프로 복사(내용 수정 포함)',
    steps: [
      'query_documents(jobCodes) 로 A·B 의 문서 ID, 코드, 기간, 장소 확인',
      'query_documents(campPages, where jobCodeId==A, category=="education") 로 목록 확인 → 복사할 페이지 선택',
      '각 페이지를 get_document(campPages, id, includeLarge=true) 로 읽어 content HTML 확보',
      '사용자가 준 치환표(또는 스프레드시트)로 날짜·장소·기수·캠프명을 content/title 에서 치환 (HTML 태그 구조는 유지)',
      'write_documents(create × N, jobCodeId=B, order 는 B 의 기존 최대값+1부터) 를 confirm 없이 호출 → 미리보기 검토',
      '사용자 승인 후 같은 operations 와 previewHash 로 confirm=true 재호출',
    ],
  },
  {
    title: '업무(Task)를 A 캠프에서 B 캠프로 복사(날짜 이동)',
    steps: [
      'jobCodes 에서 A·B startDate 차이(일수) 계산',
      'query_documents(campTasks, where campCode==A, limit 200) + taskCategories(A, B) 조회',
      'B 에 없는 카테고리는 taskCategories create 로 먼저 만들고(dry-run→confirm) ID 확보',
      '각 업무의 date 에 일수 차이를 더하고(요일 어긋남은 표로 보여주고 조정), campCode=B, categoryId 를 B 것으로 매핑, completions 는 서버가 비움',
      'write_documents(create × N) dry-run → 날짜 매핑 표 검토 → confirm',
    ],
  },
  {
    title: '시간표를 A 캠프에서 B 캠프로 복사',
    steps: [
      'query_documents(jobCodes) 로 A·B 의 문서 ID 와 코드 확인',
      'query_documents(campSettings, where campCode==B) 로 B 의 그룹-반 구성(groups) 확인 — 없으면 사용자에게 반번호를 묻는다',
      'query_documents(campTimetables, where jobCodeId==A) 로 목록 확인 → get_document(includeLarge=true) 로 periods 까지 읽기',
      'campCode·jobCodeId 를 B 로 바꾸고, classes 의 classCode 를 B 반번호로 교체한 뒤 periods[].cells 의 키도 같은 규칙으로 교체',
      'write_documents(create × N) dry-run → 반 매핑 표를 사용자에게 보여주고 확인 → confirm',
    ],
  },
  {
    title: '서류 전형 평가 초안 만들기',
    steps: [
      'evaluationCriteria(stage=="서류 전형", isActive==true) 템플릿 읽기',
      'applicationHistories(refJobBoardId==공고, applicationStatus=="pending") 로 대상자 목록',
      '각 지원자 get_document(users, uid, fields=[name, university, major1, grade, selfIntroduction, jobMotivation, partTimeJobs, schoolActivities, jobExperiences])',
      'evaluations 에 같은 refUserId+refJobBoardId+evaluationStage 가 이미 있는지 확인 (있으면 건너뜀)',
      '항목별 점수·근거 작성 → write_documents(create evaluations) dry-run → 관리자 검토 → confirm. 확정(isFinalized)은 관리자가 화면에서.',
    ],
  },
  {
    title: '특정 선생님의 수업 자료 링크 전부 뽑기',
    steps: [
      'find_users(이름) 으로 uid 확인 → query_documents(lessonMaterials, where userId==uid)',
      '각 대주제에 대해 query_documents(sections, parentId=대주제ID) 로 viewUrl/originalUrl 수집 (또는 get_lesson_materials 도구 한 번 호출)',
    ],
  },
];
