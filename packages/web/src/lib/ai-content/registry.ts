/**
 * 페이지 레지스트리 — 사이트의 모든 페이지 메타데이터 (경로, 제목, 설명, 접근 권한, 태그)
 *
 * `hasContent: false` 인 항목은 UI 도구 페이지(폼/편집기)로, 마크다운 본문은 메타데이터만 제공한다.
 * 동적 페이지(채용 공고 상세, 캠프 페이지 등)는 resolve.ts 에서 패턴으로 처리한다.
 */
import type { Access } from './site';

export interface PageMeta {
  /** 경로 또는 경로 템플릿. 예: "/job-board/{id}" */
  path: string;
  title: string;
  description: string;
  access: Access;
  tags: string[];
  /** 템플릿 파라미터 설명 */
  params?: Record<string, string>;
  /** false 면 텍스트 콘텐츠가 없는 UI 도구 페이지 */
  hasContent?: boolean;
  /** AI 노출에서 제외하는 이유 (예: 민감 정보) */
  excluded?: string;
}

export const PAGE_REGISTRY: PageMeta[] = [
  // ─── 공개 페이지 ────────────────────────────────────────────────────
  {
    path: '/',
    title: '홈',
    description: 'SMIS 멘토 플랫폼 메인 페이지. 진행 중인 채용 공고, 멘토링 참여 후기, 지원 절차 안내.',
    access: 'public',
    tags: ['홈', '채용', '후기', '지원'],
  },
  {
    path: '/job-board',
    title: '채용 공고 목록',
    description: '대학생 멘토·원어민 선생님 채용 공고 목록. 공고별 기수, 캠프, 국내/해외, 모집 상태, 교육 기간.',
    access: 'public',
    tags: ['채용', '공고', '멘토', '원어민'],
  },
  {
    path: '/job-board/{id}',
    title: '채용 공고 상세',
    description: '특정 채용 공고의 상세 내용 — 규모·인원, 지원 자격, 활동 기간, 혜택, 평가 절차, 면접 일정.',
    access: 'public',
    params: { id: '채용 공고 문서 ID' },
    tags: ['채용 상세', '지원 조건', '혜택', '면접'],
  },
  {
    path: '/recruitment',
    title: '지원 안내',
    description: '캠프 공고·지원 현황·멘토 후기·채용 문의 탭으로 구성된 지원 안내 페이지. 4단계 평가 절차 소개.',
    access: 'public',
    tags: ['지원', '절차', '문의'],
  },
  {
    path: '/recruitment/reviews',
    title: '멘토 후기',
    description: '캠프에 참여한 멘토들의 후기 전체 목록 (사이트에서는 /recruitment?tab=review).',
    access: 'public',
    tags: ['후기', '멘토', '경험담'],
  },
  {
    path: '/privacy-policy',
    title: '개인정보처리방침',
    description: 'SMIS 멘토 플랫폼의 개인정보 수집·이용·보관·파기 방침.',
    access: 'public',
    tags: ['개인정보', '법적'],
  },
  {
    path: '/terms-of-service',
    title: '서비스 이용약관',
    description: 'SMIS 멘토 플랫폼 서비스 이용약관.',
    access: 'public',
    tags: ['약관', '법적'],
  },
  {
    path: '/sign-in',
    title: '로그인',
    description: '이메일/비밀번호 또는 소셜 로그인(Google, Kakao, Naver, Apple)으로 로그인.',
    access: 'public',
    tags: ['로그인', '인증'],
    hasContent: false,
  },
  {
    path: '/sign-up',
    title: '회원가입',
    description: '멘토(한국인) 또는 원어민 선생님 회원가입. 계정 → 기본 정보 → 학력 → 인증 단계.',
    access: 'public',
    tags: ['회원가입', '멘토', '원어민'],
    hasContent: false,
  },

  // ─── 로그인 필요 ────────────────────────────────────────────────────
  {
    path: '/profile',
    title: '내 프로필',
    description: '로그인한 사용자의 프로필 — 기본 정보, 학력, 자기소개, 참여 캠프, 지원 이력.',
    access: 'auth',
    tags: ['프로필', '내 정보', '지원 이력'],
  },
  {
    path: '/profile/edit',
    title: '프로필 수정',
    description: '프로필 정보 편집 폼.',
    access: 'auth',
    tags: ['프로필 편집'],
    hasContent: false,
  },
  {
    path: '/profile/job-apply',
    title: '지원하기',
    description: '채용 공고 지원 폼.',
    access: 'auth',
    tags: ['지원'],
    hasContent: false,
  },
  {
    path: '/settings',
    title: '설정',
    description: '계정 설정.',
    access: 'auth',
    tags: ['설정'],
    hasContent: false,
  },

  // ─── 캠프 운영 (멘토·원어민·관리자) ─────────────────────────────────
  {
    path: '/camp',
    title: '캠프 홈',
    description: '참여 중인 캠프 목록과 캠프별 운영 탭(교육, 수업, 업무, 시간표, 인솔표, 명단) 안내.',
    access: 'mentor',
    tags: ['캠프', '운영'],
  },
  {
    path: '/camp/education',
    title: '캠프 교육 자료',
    description: '캠프별 교육 페이지(대면 교육 안내, 밴드 작성법 등)와 교육 자료 링크. 하위 경로로 캠프 코드 지정 가능: /camp/education/{camp}',
    access: 'mentor',
    params: { camp: '캠프 코드(예: S29) 또는 jobCodes 문서 ID. 생략 시 사용자의 활성 캠프' },
    tags: ['교육', '캠프', '자료'],
  },
  {
    path: '/camp/schedule',
    title: '캠프 시간표',
    description: '캠프별 시간표 페이지와 시간표 링크. /camp/schedule/{camp}',
    access: 'mentor',
    params: { camp: '캠프 코드 또는 ID' },
    tags: ['시간표', '일정', '캠프'],
  },
  {
    path: '/camp/guide',
    title: '캠프 인솔표',
    description: '캠프별 인솔표(이동·인솔 안내) 페이지와 링크. /camp/guide/{camp}',
    access: 'mentor',
    params: { camp: '캠프 코드 또는 ID' },
    tags: ['인솔표', '이동', '캠프'],
  },
  {
    path: '/camp/tasks',
    title: '캠프 업무',
    description: '캠프별 날짜순 업무 목록 — 제목, 시간, 대상 역할/그룹, 카테고리, 완료 현황. /camp/tasks/{camp}',
    access: 'mentor',
    params: { camp: '캠프 코드 또는 ID' },
    tags: ['업무', 'Task', '체크리스트'],
  },
  {
    path: '/camp/roster',
    title: '캠프 학생 명단',
    description: '캠프별 학생 명단(이름, 영문 이름, 학년, 반, 담임 멘토, 방). 연락처·주민번호 등 개인정보는 제외. /camp/roster/{camp}',
    access: 'mentor',
    params: { camp: '캠프 코드 또는 ID' },
    tags: ['명단', '학생', '반편성'],
  },
  {
    path: '/camp/class',
    title: '캠프 반별 명단',
    description: '반(클래스) 기준으로 묶은 학생 명단. /camp/class/{camp}',
    access: 'mentor',
    params: { camp: '캠프 코드 또는 ID' },
    tags: ['반', '클래스', '학생'],
  },
  {
    path: '/camp/room',
    title: '캠프 숙소 배정',
    description: '방(호실) 기준으로 묶은 학생 명단. /camp/room/{camp}',
    access: 'mentor',
    params: { camp: '캠프 코드 또는 ID' },
    tags: ['숙소', '방 배정', '학생'],
  },
  {
    path: '/camp/lesson',
    title: '수업 자료',
    description: '멘토 개인의 수업 자료(대주제/섹션 링크) 관리 페이지.',
    access: 'mentor',
    tags: ['수업', '자료'],
    hasContent: false,
  },
  {
    path: '/camp/patient',
    title: '환자 기록',
    description: '캠프 중 학생 건강·환자 기록.',
    access: 'admin',
    tags: ['환자', '건강'],
    hasContent: false,
    excluded: '건강 정보(민감 정보)이므로 AI 접근 계층에서 제외됨',
  },

  // ─── 관리자 ─────────────────────────────────────────────────────────
  {
    path: '/admin',
    title: '관리자 대시보드',
    description: '채용·교육·기타 관리 메뉴와 현황 요약(사용자 수, 진행 중 공고, 대기 중 지원).',
    access: 'admin',
    tags: ['관리자', '대시보드'],
  },
  {
    path: '/admin/user-manage',
    title: '지원 유저 관리',
    description: '전체 사용자 목록 — 이름, 역할, 상태, 대학/전공/학년, 참여 캠프, 가입일. 연락처 등 개인정보 제외.',
    access: 'admin',
    tags: ['사용자', '멘토', '원어민', '관리'],
  },
  {
    path: '/admin/interview-manage',
    title: '면접 관리',
    description: '진행 중 공고별 지원자 목록과 서류/면접/최종 상태. /admin/interview-manage/{jobBoardId}',
    access: 'admin',
    params: { jobBoardId: '채용 공고 문서 ID' },
    tags: ['면접', '지원자', '평가'],
  },
  {
    path: '/admin/job-board-manage',
    title: '공고 관리',
    description: '모든 채용 공고(진행/마감)와 면접 일정, 지원자 수.',
    access: 'admin',
    tags: ['공고', '관리'],
  },
  {
    path: '/admin/student-search',
    title: '학생 조회',
    description: '캠프 참여 학생 이력 검색 도구.',
    access: 'admin',
    tags: ['학생', '검색'],
    hasContent: false,
  },
  {
    path: '/admin/st-field-config',
    title: 'ST시트 필드 설정',
    description: '학생 시트(ST시트) 열 설정 도구.',
    access: 'admin',
    tags: ['ST시트', '설정'],
    hasContent: false,
  },
  {
    path: '/admin/app-config',
    title: '앱 설정 관리',
    description: '모바일 앱/서비스 설정 관리 도구.',
    access: 'admin',
    tags: ['설정'],
    hasContent: false,
  },
  {
    path: '/admin/user-generate',
    title: '임시 사용자 생성',
    description: '임시 사용자 계정 생성 도구.',
    access: 'admin',
    tags: ['사용자', '생성'],
    hasContent: false,
  },
  {
    path: '/admin/job-generate',
    title: '업무 생성',
    description: '캠프 업무(Task) 일괄 생성 도구.',
    access: 'admin',
    tags: ['업무', '생성'],
    hasContent: false,
  },
  {
    path: '/admin/upload',
    title: '수업 템플릿 관리',
    description: '수업 자료 템플릿 업로드/관리 도구.',
    access: 'admin',
    tags: ['수업', '템플릿'],
    hasContent: false,
  },
  {
    path: '/admin/update-evaluation-criteria',
    title: '평가 기준 관리',
    description: '단계별 평가 기준 템플릿 관리 도구.',
    access: 'admin',
    tags: ['평가', '기준'],
    hasContent: false,
  },
  {
    path: '/admin/user-map-test',
    title: '사용자 지도',
    description: '사용자 위치 지도 보기 도구.',
    access: 'admin',
    tags: ['지도'],
    hasContent: false,
  },
];

/** 정적 경로로 메타 찾기 (템플릿 경로는 제외) */
export function getStaticPageMeta(path: string): PageMeta | undefined {
  return PAGE_REGISTRY.find((p) => p.path === path && !p.path.includes('{'));
}

/** 템플릿 경로 매칭 (예: "/job-board/abc" → "/job-board/{id}") */
export function getTemplatePageMeta(path: string): PageMeta | undefined {
  return PAGE_REGISTRY.find((p) => {
    if (!p.path.includes('{')) return false;
    const re = new RegExp('^' + p.path.replace(/\{[^}]+\}/g, '[^/]+') + '$');
    return re.test(path);
  });
}
