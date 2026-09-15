/**
 * 공개 페이지 렌더러 — 홈, 채용 공고, 지원 안내, 후기
 */
import { COMPANY_INFO, EVALUATION_STAGES, PageLink, RenderedPage, SITE_DESCRIPTION, SITE_NAME, SITE_URL, toMarkdownUrl } from '../site';
import { CampInfo, getCamps, getJobBoard, getJobBoards, getReviews, JobBoardInfo, ReviewInfo } from '../data';
import { excerpt, fmtDate, fmtDateTime, fmtRange, htmlToMarkdown, htmlToText, table } from '../markdown';
import { getStaticPageMeta } from '../registry';

function jobBoardLink(b: JobBoardInfo): PageLink {
  return {
    path: `/job-board/${b.id}`,
    title: b.title,
    description: `${b.generation} ${b.jobCode} · ${b.korea ? '국내' : '해외'} · ${b.status === 'active' ? '모집중' : '마감'}`,
    access: 'public',
  };
}

function campFor(boards: JobBoardInfo, camps: CampInfo[]): CampInfo | undefined {
  return camps.find((c) => c.id === boards.refJobCodeId) ?? camps.find((c) => c.code === boards.jobCode);
}

const PUBLIC_NAV: PageLink[] = [
  { path: '/job-board', title: '채용 공고 목록', access: 'public' },
  { path: '/recruitment', title: '지원 안내', access: 'public' },
  { path: '/recruitment/reviews', title: '멘토 후기', access: 'public' },
  { path: '/privacy-policy', title: '개인정보처리방침', access: 'public' },
  { path: '/terms-of-service', title: '서비스 이용약관', access: 'public' },
  { path: '/sign-in', title: '로그인', access: 'public' },
  { path: '/sign-up', title: '회원가입', access: 'public' },
];

export function contactSection(): string {
  return [
    '## 회사 · 채용 문의',
    '',
    `- 회사명: ${COMPANY_INFO.name} (대표 ${COMPANY_INFO.ceo}, 사업자등록번호 ${COMPANY_INFO.businessNumber})`,
    `- 주소: ${COMPANY_INFO.address}`,
    `- 채용 문의: ${COMPANY_INFO.recruitContact}`,
    `- 카카오톡 채널: ${COMPANY_INFO.kakao}`,
    `- 유튜브: ${COMPANY_INFO.youtube}`,
    `- 회사 홈페이지: ${COMPANY_INFO.homepage}`,
  ].join('\n');
}

export function evaluationSection(): string {
  return [
    '## 지원 · 평가 절차 (4단계)',
    '',
    EVALUATION_STAGES.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    '',
    '회원가입 후 채용 공고에서 지원하면 서류 전형 → 면접 전형 → 대면 교육 → 캠프 생활 순으로 평가가 진행됩니다. 지원 현황은 로그인 후 "지원 안내 > 지원 현황" 탭에서 확인할 수 있습니다.',
  ].join('\n');
}

// ─── 홈 ───────────────────────────────────────────────────────────────

export async function renderHome(): Promise<RenderedPage> {
  const meta = getStaticPageMeta('/')!;
  const [boards, reviews, camps] = await Promise.all([getJobBoards(), getReviews(), getCamps()]);
  const active = boards.filter((b) => b.status === 'active');
  const best = reviews.filter((r) => r.generation === 'Best 후기').slice(0, 6);

  const body = [
    `${SITE_NAME}은 ${SITE_DESCRIPTION}`,
    '',
    '## 진행 중인 채용 공고',
    '',
    active.length
      ? table(
          ['공고', '기수', '캠프', '지역', '캠프 기간', '교육 기간'],
          active.map((b) => {
            const camp = campFor(b, camps);
            return [
              b.title,
              b.generation,
              camp ? `${camp.name} (${b.jobCode})` : b.jobCode,
              b.korea ? '국내' : '해외',
              camp ? fmtRange(camp.startDate, camp.endDate) : '-',
              fmtRange(b.educationStartDate, b.educationEndDate),
            ];
          })
        )
      : '_현재 진행 중인 공고가 없습니다._',
    '',
    `상세 내용은 각 공고 페이지(${SITE_URL}/job-board/{id}.md) 또는 [채용 공고 목록](${toMarkdownUrl('/job-board')})을 참고하세요.`,
    '',
    '## 멘토링 참여 후기 (Best 후기)',
    '',
    best.length
      ? best.map((r) => `- **${r.title}**${r.authorName ? ` — ${r.authorName}` : ''}: ${excerpt(htmlToText(r.contentHtml), 200)}`).join('\n')
      : '_아직 등록된 후기가 없습니다._',
    '',
    `전체 후기는 [멘토 후기](${toMarkdownUrl('/recruitment/reviews')}) 페이지에 있습니다.`,
    '',
    evaluationSection(),
    '',
    contactSection(),
  ].join('\n');

  return {
    path: '/',
    title: `${SITE_NAME} — 홈`,
    description: meta.description,
    access: 'public',
    tags: meta.tags,
    body,
    children: [...PUBLIC_NAV, ...active.map(jobBoardLink)],
  };
}

// ─── 채용 공고 목록 ────────────────────────────────────────────────────

export async function renderJobBoardList(): Promise<RenderedPage> {
  const meta = getStaticPageMeta('/job-board')!;
  const [boards, camps] = await Promise.all([getJobBoards(), getCamps()]);
  const active = boards.filter((b) => b.status === 'active');
  const closed = boards.filter((b) => b.status !== 'active');

  const rows = (list: JobBoardInfo[]) =>
    table(
      ['공고', '기수', '캠프', '지역', '캠프 기간', '교육 기간', '면접 일정 수', '마크다운'],
      list.map((b) => {
        const camp = campFor(b, camps);
        return [
          b.title,
          b.generation,
          camp ? `${camp.name} (${b.jobCode})` : b.jobCode,
          b.korea ? '국내' : '해외',
          camp ? fmtRange(camp.startDate, camp.endDate) : '-',
          fmtRange(b.educationStartDate, b.educationEndDate),
          b.interviewDates.length,
          `${SITE_URL}/job-board/${b.id}.md`,
        ];
      })
    );

  const body = [
    '## 모집중 공고',
    '',
    active.length ? rows(active) : '_현재 모집중인 공고가 없습니다._',
    '',
    '## 마감된 공고',
    '',
    closed.length ? rows(closed) : '_없음_',
    '',
    evaluationSection(),
  ].join('\n');

  return {
    path: '/job-board',
    title: meta.title,
    description: meta.description,
    access: 'public',
    tags: meta.tags,
    body,
    children: [...active.map(jobBoardLink), ...closed.map(jobBoardLink), { path: '/recruitment', title: '지원 안내', access: 'public' }],
  };
}

// ─── 채용 공고 상세 ────────────────────────────────────────────────────

export async function renderJobBoard(id: string, options: { admin?: boolean } = {}): Promise<RenderedPage | null> {
  const board = await getJobBoard(id);
  if (!board) return null;
  const camps = await getCamps();
  const camp = campFor(board, camps);

  const interviewLines = board.interviewDates.length
    ? board.interviewDates
        .map((d) => `- ${fmtDateTime(d.start)} ~ ${fmtDateTime(d.end)}${board.interviewBaseDuration ? ` (1인당 ${board.interviewBaseDuration}분)` : ''}`)
        .join('\n')
    : '_면접 일정 미정_';

  const body = [
    `- 모집 상태: **${board.status === 'active' ? '모집중' : '마감'}**`,
    `- 기수 / 캠프 코드: ${board.generation} / ${board.jobCode}`,
    camp ? `- 캠프: ${camp.name} · ${camp.location} · ${fmtRange(camp.startDate, camp.endDate)} (${camp.korea ? '국내' : '해외'})` : `- 지역: ${board.korea ? '국내' : '해외'}`,
    `- 교육 기간: ${fmtRange(board.educationStartDate, board.educationEndDate)}`,
    `- 공고 등록일: ${fmtDate(board.createdAt)}`,
    '',
    '## 공고 내용',
    '',
    htmlToMarkdown(board.descriptionHtml) || '_(내용 없음)_',
    '',
    '## 면접 일정',
    '',
    interviewLines,
    ...(options.admin && board.interviewBaseNotes ? ['', '## 면접 안내 (관리자)', '', board.interviewBaseNotes] : []),
    '',
    '## 지원 방법',
    '',
    `1. [회원가입](${toMarkdownUrl('/sign-up')}) 또는 [로그인](${toMarkdownUrl('/sign-in')})`,
    `2. 이 공고 페이지(${SITE_URL}/job-board/${board.id})에서 "지원하기" 클릭`,
    `3. ${EVALUATION_STAGES.join(' → ')} 순서로 평가 진행`,
    '',
    contactSection(),
  ].join('\n');

  return {
    path: `/job-board/${board.id}`,
    title: board.title,
    description: `${board.generation} ${board.jobCode} 채용 공고 (${board.status === 'active' ? '모집중' : '마감'}) — ${excerpt(htmlToText(board.descriptionHtml), 120)}`,
    access: 'public',
    tags: ['채용 상세', board.generation, board.jobCode, board.korea ? '국내' : '해외'],
    body,
    children: [
      { path: '/job-board', title: '채용 공고 목록', access: 'public' },
      { path: '/recruitment', title: '지원 안내', access: 'public' },
      { path: '/recruitment/reviews', title: '멘토 후기', access: 'public' },
    ],
    updatedAt: board.updatedAt ?? undefined,
  };
}

// ─── 지원 안내 ─────────────────────────────────────────────────────────

export async function renderRecruitment(): Promise<RenderedPage> {
  const meta = getStaticPageMeta('/recruitment')!;
  const boards = await getJobBoards();
  const active = boards.filter((b) => b.status === 'active');

  const body = [
    '지원 안내 페이지는 네 개의 탭으로 구성됩니다: **캠프 공고**, **지원 현황**(로그인 필요), **멘토 후기**, **채용 문의**.',
    '',
    '## 캠프 공고',
    '',
    active.length ? active.map((b) => `- [${b.title}](${SITE_URL}/job-board/${b.id}.md) — ${b.generation} ${b.jobCode}, ${b.korea ? '국내' : '해외'}`).join('\n') : '_현재 모집중인 공고가 없습니다._',
    '',
    '## 지원 현황',
    '',
    '로그인한 사용자는 본인이 지원한 공고의 서류/면접/최종 결과를 확인할 수 있습니다. (MCP 커넥터로 로그인하면 `/profile.md` 에서 확인 가능)',
    '',
    '## 멘토 후기',
    '',
    `캠프에 참여한 멘토들의 후기: [멘토 후기 전체 보기](${toMarkdownUrl('/recruitment/reviews')})`,
    '',
    evaluationSection(),
    '',
    contactSection(),
  ].join('\n');

  return {
    path: '/recruitment',
    title: meta.title,
    description: meta.description,
    access: 'public',
    tags: meta.tags,
    body,
    children: [
      { path: '/recruitment/reviews', title: '멘토 후기', access: 'public' },
      { path: '/job-board', title: '채용 공고 목록', access: 'public' },
      ...active.map(jobBoardLink),
    ],
  };
}

// ─── 멘토 후기 ─────────────────────────────────────────────────────────

const REVIEW_MAX_CHARS = 4000;

function reviewToMarkdown(r: ReviewInfo): string {
  let content = htmlToMarkdown(r.contentHtml);
  if (content.length > REVIEW_MAX_CHARS) content = `${content.slice(0, REVIEW_MAX_CHARS)}\n\n_(이하 생략)_`;
  const metaBits = [r.authorName, r.generation, r.jobCode, r.rating ? `평점 ${r.rating}` : '', fmtDate(r.createdAt)].filter(Boolean);
  return [`### ${r.title}`, '', `_${metaBits.join(' · ')}_`, '', content].join('\n');
}

export async function renderReviews(): Promise<RenderedPage> {
  const meta = getStaticPageMeta('/recruitment/reviews')!;
  const reviews = await getReviews();
  const best = reviews.filter((r) => r.generation === 'Best 후기');
  const others = reviews.filter((r) => r.generation !== 'Best 후기');

  const body = [
    `총 ${reviews.length}개의 후기가 등록되어 있습니다.`,
    '',
    ...(best.length ? ['## Best 후기', '', best.map(reviewToMarkdown).join('\n\n'), ''] : []),
    '## 전체 후기',
    '',
    others.length ? others.map(reviewToMarkdown).join('\n\n') : '_없음_',
  ].join('\n');

  return {
    path: '/recruitment/reviews',
    title: meta.title,
    description: meta.description,
    access: 'public',
    tags: meta.tags,
    body,
    children: [
      { path: '/recruitment', title: '지원 안내', access: 'public' },
      { path: '/job-board', title: '채용 공고 목록', access: 'public' },
    ],
  };
}

// ─── 로그인 / 회원가입 (정적 설명) ─────────────────────────────────────

export function renderAuthPage(path: '/sign-in' | '/sign-up'): RenderedPage {
  const meta = getStaticPageMeta(path)!;
  const body =
    path === '/sign-in'
      ? [
          '로그인 방법:',
          '',
          '- 이메일 + 비밀번호',
          '- 소셜 로그인: Google, Kakao, Naver, Apple',
          '',
          `계정이 없으면 [회원가입](${toMarkdownUrl('/sign-up')})에서 멘토(한국인) 또는 원어민 선생님으로 가입할 수 있습니다.`,
        ].join('\n')
      : [
          '회원가입 절차:',
          '',
          '1. 계정 생성 (이메일/비밀번호 또는 소셜 계정)',
          '2. 기본 정보 입력 (이름, 연락처, 주소)',
          '3. 학력 정보 입력 (대학, 전공, 학년)',
          '4. 휴대폰·이메일 인증',
          '',
          '원어민 선생님은 별도 가입 경로(/sign-up/foreign)에서 여권·CV 등 서류를 제출합니다.',
          '',
          `가입 후 [채용 공고](${toMarkdownUrl('/job-board')})에서 지원할 수 있습니다.`,
        ].join('\n');
  return {
    path,
    title: meta.title,
    description: meta.description,
    access: 'public',
    tags: meta.tags,
    body,
    children: [
      { path: path === '/sign-in' ? '/sign-up' : '/sign-in', title: path === '/sign-in' ? '회원가입' : '로그인', access: 'public' },
      { path: '/job-board', title: '채용 공고 목록', access: 'public' },
    ],
  };
}
