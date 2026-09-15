/**
 * AI 에이전트(Claude, ChatGPT 등)용 사이트 콘텐츠 계층 — 공통 상수와 타입
 *
 * - 1층: llms.txt / llms-full.txt / 페이지별 .md (링크만 줘도 읽히게)
 * - 2층: /api/mcp (MCP 커넥터, OAuth 로그인 시 역할별 콘텐츠)
 *
 * 두 층 모두 이 폴더의 "페이지 → 마크다운" 생성기를 공유한다.
 */

/** 정식(apex) 도메인. www 는 308 리다이렉트되므로 AI 용 URL은 항상 apex 를 쓴다. */
export const SITE_URL = 'https://smis-mentor.com';
export const SITE_NAME = 'SMIS 멘토 플랫폼';
export const MCP_ENDPOINT = `${SITE_URL}/api/mcp`;
export const MCP_PUBLIC_ENDPOINT = `${SITE_URL}/api/mcp/public`;
export const LLMS_TXT_URL = `${SITE_URL}/llms.txt`;
export const LLMS_FULL_URL = `${SITE_URL}/llms-full.txt`;

export const SITE_DESCRIPTION =
  'SMIS(스마일 영어 캠프) 대학생 멘토·원어민 선생님 채용 및 캠프 운영 플랫폼. ' +
  '채용 공고 확인·지원(서류 → 면접 → 대면 교육 → 캠프 생활 4단계 평가), ' +
  '캠프 운영(교육 자료, 시간표, 업무, 인솔표, 학생 명단), 관리자 업무를 위한 웹 서비스.';

export const COMPANY_INFO = {
  name: '(주)에스엠아이에스',
  ceo: '김선희',
  businessNumber: '427-88-03423',
  address: '경기 성남시 분당구 장미로 78 SMIS 라운지&교육센터 3층',
  recruitContact: '신선웅 (010-7656-7933)',
  kakao: 'http://pf.kakao.com/_Axafxcb/chat',
  youtube: 'https://www.youtube.com/@smiscamp',
  homepage: 'https://www.smisedu.com/',
};

export const EVALUATION_STAGES = ['서류 전형', '면접 전형', '대면 교육', '캠프 생활'] as const;

/** 페이지 접근 등급 */
export type Access = 'public' | 'auth' | 'mentor' | 'admin';

export type Role = 'mentor' | 'mentor_temp' | 'foreign' | 'foreign_temp' | 'admin';

/** 인증된 요청자 (OAuth 액세스 토큰 → Firestore users 문서) */
export interface Viewer {
  uid: string;
  role: Role;
  name: string;
  status: string;
  /** 활성 캠프(jobCodes 문서 ID) */
  activeJobCodeId?: string;
  /** 참여 캠프 jobCodes 문서 ID 목록 */
  jobCodeIds: string[];
}

export const ACCESS_LABEL: Record<Access, string> = {
  public: '공개',
  auth: '로그인 필요',
  mentor: '멘토·원어민·관리자',
  admin: '관리자 전용',
};

const MENTOR_ROLES: Role[] = ['mentor', 'foreign', 'admin'];

export function canAccess(access: Access, viewer: Viewer | null): boolean {
  switch (access) {
    case 'public':
      return true;
    case 'auth':
      return !!viewer;
    case 'mentor':
      return !!viewer && MENTOR_ROLES.includes(viewer.role);
    case 'admin':
      return !!viewer && viewer.role === 'admin';
    default:
      return false;
  }
}

export interface PageLink {
  path: string;
  title: string;
  description?: string;
  access: Access;
}

export interface RenderedPage {
  /** 정규화된 경로. 예: "/job-board/abc" */
  path: string;
  title: string;
  description: string;
  access: Access;
  tags: string[];
  /** 마크다운 본문 (헤더/푸터 제외) */
  body: string;
  /** 하위·관련 페이지 */
  children: PageLink[];
  updatedAt?: Date;
}

export type ResolveError =
  | { error: 'not_found'; path: string; message: string }
  | { error: 'auth_required'; path: string; message: string; access: Access }
  | { error: 'forbidden'; path: string; message: string; access: Access };

export type ResolveResult = RenderedPage | ResolveError;

export function isResolveError(r: ResolveResult): r is ResolveError {
  return (r as ResolveError).error !== undefined;
}

export function toUrl(path: string): string {
  return `${SITE_URL}${path === '/' ? '' : path}`;
}

/** 마크다운 버전 URL. 홈은 /index.md */
export function toMarkdownUrl(path: string): string {
  if (path === '/' || path === '') return `${SITE_URL}/index.md`;
  return `${SITE_URL}${path}.md`;
}
