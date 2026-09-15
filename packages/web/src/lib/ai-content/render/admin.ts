/**
 * 관리자 페이지 렌더러 — 대시보드, 사용자 관리, 면접(지원자) 관리, 공고 관리
 * 그리고 로그인 사용자 본인의 프로필
 *
 * 연락처·주민번호·주소 등 개인정보는 data.ts 단계에서 이미 제외되어 있다.
 */
import type { PageLink, RenderedPage, Viewer } from '../site';
import { SITE_URL } from '../site';
import {
  ApplicationInfo,
  getApplicationCounts,
  getApplicationsByJobBoard,
  getApplicationsByUser,
  getCamps,
  getEvaluationSummary,
  getJobBoards,
  getUserNameMap,
  getUsers,
  getUserSummary,
  JobBoardInfo,
  UserSummary,
} from '../data';
import { excerpt, fmtDate, fmtDateTime, fmtRange, table } from '../markdown';
import { getStaticPageMeta } from '../registry';

const ROLE_KO: Record<string, string> = {
  admin: '관리자',
  mentor: '멘토',
  mentor_temp: '멘토(임시)',
  foreign: '원어민',
  foreign_temp: '원어민(임시)',
};

const APP_STATUS_KO: Record<string, string> = {
  pending: '서류 대기',
  accepted: '서류 합격',
  rejected: '서류 불합격',
};
const INTERVIEW_STATUS_KO: Record<string, string> = {
  pending: '면접 대기',
  complete: '면접 완료',
  passed: '면접 합격',
  failed: '면접 불합격',
  absent: '면접 불참',
};
const FINAL_STATUS_KO: Record<string, string> = {
  finalAccepted: '최종 합격',
  finalRejected: '최종 불합격',
  finalAbsent: '최종 불참',
};

function roleKo(role: string): string {
  return ROLE_KO[role] ?? role;
}

async function campNameMap(): Promise<Map<string, string>> {
  const camps = await getCamps();
  const map = new Map<string, string>();
  camps.forEach((c) => {
    map.set(c.id, c.code);
    map.set(c.code, c.code);
  });
  return map;
}

function experienceSummary(u: UserSummary, camps: Map<string, string>): string {
  if (!u.jobExperiences.length) return '';
  return u.jobExperiences
    .map((e) => {
      const code = camps.get(e.id) ?? e.id;
      const bits = [code, e.groupRole, e.group, e.classCode ? `${e.classCode}반` : ''].filter(Boolean);
      return bits.join('/');
    })
    .join(', ');
}

// ─── 관리자 대시보드 ──────────────────────────────────────────────────

export async function renderAdminHome(): Promise<RenderedPage> {
  const meta = getStaticPageMeta('/admin')!;
  const [users, boards, counts] = await Promise.all([getUsers(), getJobBoards(), getApplicationCounts()]);
  const byRole = new Map<string, number>();
  users.forEach((u) => byRole.set(u.role, (byRole.get(u.role) ?? 0) + 1));
  const active = boards.filter((b) => b.status === 'active');
  const pendingTotal = [...counts.values()].reduce((s, c) => s + c.pending, 0);

  const body = [
    '## 현황 요약',
    '',
    `- 전체 사용자: ${users.length}명 (${[...byRole.entries()].map(([r, n]) => `${roleKo(r)} ${n}`).join(', ')})`,
    `- 진행 중 공고: ${active.length}개 / 전체 ${boards.length}개`,
    `- 서류 대기 중 지원: ${pendingTotal}건`,
    '',
    '## 진행 중 공고별 지원 현황',
    '',
    table(
      ['공고', '기수/코드', '지원 총계', '서류 대기', '지원자 목록'],
      active.map((b) => {
        const c = counts.get(b.id) ?? { total: 0, pending: 0 };
        return [b.title, `${b.generation} ${b.jobCode}`, c.total, c.pending, `${SITE_URL}/admin/interview-manage/${b.id}.md`];
      })
    ),
    '',
    '## 관리 메뉴',
    '',
    '- 채용 관련: 지원 유저 관리, 면접 관리, 공고 관리',
    '- 교육 관련: 캠프별 유저 조회(캠프 홈), 수업 템플릿 관리(UI 도구)',
    '- 기타: 앱 설정 관리, 사용자 지도, 임시 사용자 생성, 업무 생성, 학생 조회, ST시트 필드 설정 (UI 도구 — 텍스트 콘텐츠 없음)',
  ].join('\n');

  const children: PageLink[] = [
    { path: '/admin/user-manage', title: '지원 유저 관리', access: 'admin' },
    { path: '/admin/interview-manage', title: '면접 관리', access: 'admin' },
    { path: '/admin/job-board-manage', title: '공고 관리', access: 'admin' },
    { path: '/camp', title: '캠프 홈 (캠프별 운영 자료)', access: 'mentor' },
  ];
  return { path: '/admin', title: meta.title, description: meta.description, access: 'admin', tags: meta.tags, body, children };
}

// ─── 사용자 관리 ──────────────────────────────────────────────────────

export async function renderAdminUsers(filter: { role?: string; query?: string } = {}): Promise<RenderedPage> {
  const meta = getStaticPageMeta('/admin/user-manage')!;
  const [users, camps] = await Promise.all([getUsers(), campNameMap()]);
  let list = users;
  if (filter.role) list = list.filter((u) => u.role === filter.role);
  if (filter.query) {
    const q = filter.query.toLowerCase();
    list = list.filter((u) => [u.name, u.university, u.major].some((v) => v?.toLowerCase().includes(q)));
  }

  const body = [
    `총 ${list.length}명${filter.role ? ` (역할: ${roleKo(filter.role)})` : ''}${filter.query ? ` (검색: ${filter.query})` : ''}. 개인 상세는 관리자 도구 \`find_users\` 로 검색하거나 사이트에서 확인하세요.`,
    '',
    table(
      ['이름', '역할', '상태', '대학', '전공', '학년', '참여 캠프(코드/역할/그룹)', '가입일', '최근 로그인'],
      list.map((u) => [
        u.name,
        roleKo(u.role),
        u.status,
        u.university ?? (u.foreignCountryCode ? `(${u.foreignCountryCode})` : ''),
        u.major ?? '',
        u.grade ?? '',
        experienceSummary(u, camps),
        fmtDate(u.createdAt),
        fmtDate(u.lastLoginAt),
      ])
    ),
  ].join('\n');

  return {
    path: '/admin/user-manage',
    title: meta.title,
    description: meta.description,
    access: 'admin',
    tags: meta.tags,
    body,
    children: [
      { path: '/admin', title: '관리자 대시보드', access: 'admin' },
      { path: '/admin/interview-manage', title: '면접 관리', access: 'admin' },
    ],
  };
}

/** 관리자용 사용자 상세 (find_users 도구) */
export async function renderUserDetail(uid: string): Promise<string | null> {
  const [u, camps] = await Promise.all([getUserSummary(uid), campNameMap()]);
  if (!u) return null;
  const [apps, boards, evalSummary] = await Promise.all([getApplicationsByUser(uid), getJobBoards(), getEvaluationSummary(uid)]);
  const boardTitle = (id: string) => boards.find((b) => b.id === id)?.title ?? id;
  return [
    `### ${u.name} (${roleKo(u.role)}, ${u.status})`,
    '',
    `- 대학/전공/학년: ${u.university ?? '-'} / ${u.major ?? '-'} / ${u.grade ?? '-'}${u.isOnLeave ? ' (휴학)' : ''}`,
    `- 참여 캠프: ${experienceSummary(u, camps) || '-'}`,
    `- 유입 경로: ${u.referralPath ?? '-'}`,
    `- 가입일: ${fmtDate(u.createdAt)} · 최근 로그인: ${fmtDate(u.lastLoginAt)}`,
    u.jobMotivation ? `- 지원 동기: ${excerpt(u.jobMotivation, 600)}` : null,
    u.selfIntroduction ? `- 자기소개: ${excerpt(u.selfIntroduction, 600)}` : null,
    '',
    '**지원 이력**',
    '',
    apps.length
      ? table(
          ['공고', '지원일', '서류', '면접', '면접일', '최종'],
          apps.map((a) => [
            boardTitle(a.refJobBoardId),
            fmtDate(a.applicationDate),
            APP_STATUS_KO[a.applicationStatus] ?? a.applicationStatus,
            a.interviewStatus ? INTERVIEW_STATUS_KO[a.interviewStatus] ?? a.interviewStatus : '',
            fmtDateTime(a.interviewDate),
            a.finalStatus ? FINAL_STATUS_KO[a.finalStatus] ?? a.finalStatus : '',
          ])
        )
      : '_없음_',
    '',
    '**평가 요약**',
    '',
    evalSummary
      ? [
          `- 전체 평균 ${evalSummary.overallAverage ?? '-'} (총 ${evalSummary.totalEvaluations ?? 0}회)`,
          ...evalSummary.stages.map((s) => `- ${s.stage}: 평균 ${s.averageScore} (${s.totalEvaluations}회)`),
        ].join('\n')
      : '_평가 기록 없음_',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
}

// ─── 면접(지원자) 관리 ────────────────────────────────────────────────

function applicationRows(apps: ApplicationInfo[], users: Map<string, UserSummary>): unknown[][] {
  return apps.map((a) => {
    const u = users.get(a.refUserId);
    return [
      u?.name ?? `(탈퇴/미확인: ${a.refUserId.slice(0, 6)})`,
      u?.university ?? '',
      u ? `${u.major ?? ''}${u.grade ? ` ${u.grade}학년` : ''}` : '',
      fmtDate(a.applicationDate),
      APP_STATUS_KO[a.applicationStatus] ?? a.applicationStatus,
      a.interviewStatus ? INTERVIEW_STATUS_KO[a.interviewStatus] ?? a.interviewStatus : '',
      fmtDateTime(a.interviewDate),
      a.finalStatus ? FINAL_STATUS_KO[a.finalStatus] ?? a.finalStatus : '',
      a.interviewFeedback ? excerpt(a.interviewFeedback, 80) : '',
    ];
  });
}

const APPLICATION_HEADERS = ['지원자', '대학', '전공/학년', '지원일', '서류', '면접', '면접 일시', '최종', '면접 메모'];

export async function renderAdminApplications(jobBoardId?: string): Promise<RenderedPage | { error: string }> {
  const meta = getStaticPageMeta('/admin/interview-manage')!;
  const boards = await getJobBoards();

  if (jobBoardId) {
    const board = boards.find((b) => b.id === jobBoardId);
    if (!board) return { error: `공고를 찾을 수 없습니다: ${jobBoardId}` };
    const apps = await getApplicationsByJobBoard(board.id);
    const users = await getUserNameMap(apps.map((a) => a.refUserId));
    const counts = {
      total: apps.length,
      pending: apps.filter((a) => a.applicationStatus === 'pending').length,
      accepted: apps.filter((a) => a.applicationStatus === 'accepted').length,
      passed: apps.filter((a) => a.interviewStatus === 'passed').length,
      final: apps.filter((a) => a.finalStatus === 'finalAccepted').length,
    };
    const body = [
      `- 공고: **${board.title}** (${board.generation} ${board.jobCode}, ${board.status === 'active' ? '모집중' : '마감'})`,
      `- 지원 ${counts.total}건 · 서류 대기 ${counts.pending} · 서류 합격 ${counts.accepted} · 면접 합격 ${counts.passed} · 최종 합격 ${counts.final}`,
      board.interviewDates.length ? `- 면접 일정: ${board.interviewDates.map((d) => `${fmtDateTime(d.start)}~${fmtDateTime(d.end)}`).join(', ')}` : null,
      board.interviewBaseNotes ? `- 면접 안내: ${board.interviewBaseNotes.replace(/\r?\n/g, ' / ')}` : null,
      '',
      table(APPLICATION_HEADERS, applicationRows(apps, users)),
    ]
      .filter((l): l is string => l !== null)
      .join('\n');

    return {
      path: `/admin/interview-manage/${board.id}`,
      title: `면접 관리 — ${board.title}`,
      description: `${board.title} 지원자 ${apps.length}명의 서류/면접/최종 상태`,
      access: 'admin',
      tags: ['면접', '지원자', board.jobCode],
      body,
      children: [
        { path: '/admin/interview-manage', title: '면접 관리 (전체 공고)', access: 'admin' },
        { path: `/job-board/${board.id}`, title: board.title, access: 'public' },
      ],
    };
  }

  const active = boards.filter((b) => b.status === 'active');
  const counts = await getApplicationCounts();
  const body = [
    '진행 중인 공고별 지원 현황입니다. 공고별 지원자 표는 하위 페이지에서 확인하세요.',
    '',
    table(
      ['공고', '기수/코드', '지원 총계', '서류 대기', '지원자 표'],
      active.map((b) => {
        const c = counts.get(b.id) ?? { total: 0, pending: 0 };
        return [b.title, `${b.generation} ${b.jobCode}`, c.total, c.pending, `${SITE_URL}/admin/interview-manage/${b.id}.md`];
      })
    ),
  ].join('\n');

  return {
    path: '/admin/interview-manage',
    title: meta.title,
    description: meta.description,
    access: 'admin',
    tags: meta.tags,
    body,
    children: [
      ...active.map((b) => ({ path: `/admin/interview-manage/${b.id}`, title: `지원자 — ${b.title}`, access: 'admin' as const })),
      { path: '/admin', title: '관리자 대시보드', access: 'admin' },
    ],
  };
}

// ─── 공고 관리 ────────────────────────────────────────────────────────

export async function renderAdminJobBoards(): Promise<RenderedPage> {
  const meta = getStaticPageMeta('/admin/job-board-manage')!;
  const [boards, counts] = await Promise.all([getJobBoards(), getApplicationCounts()]);
  const row = (b: JobBoardInfo) => {
    const c = counts.get(b.id) ?? { total: 0, pending: 0 };
    return [
      b.title,
      b.status === 'active' ? '모집중' : '마감',
      `${b.generation} ${b.jobCode}`,
      b.korea ? '국내' : '해외',
      fmtRange(b.educationStartDate, b.educationEndDate),
      b.interviewDates.map((d) => fmtDateTime(d.start)).join(', ') || '-',
      `${c.total} (대기 ${c.pending})`,
      fmtDate(b.updatedAt),
      `${SITE_URL}/job-board/${b.id}.md`,
    ];
  };
  const body = [
    `전체 공고 ${boards.length}개. 각 공고의 본문은 공고 상세 마크다운에서 확인하세요.`,
    '',
    table(['공고', '상태', '기수/코드', '지역', '교육 기간', '면접 시작 일시', '지원(대기)', '수정일', '상세'], boards.map(row)),
  ].join('\n');

  return {
    path: '/admin/job-board-manage',
    title: meta.title,
    description: meta.description,
    access: 'admin',
    tags: meta.tags,
    body,
    children: [
      ...boards.map((b) => ({ path: `/job-board/${b.id}`, title: b.title, description: b.status === 'active' ? '모집중' : '마감', access: 'public' as const })),
      { path: '/admin', title: '관리자 대시보드', access: 'admin' },
    ],
  };
}

// ─── 내 프로필 (로그인 사용자) ────────────────────────────────────────

export async function renderProfile(viewer: Viewer): Promise<RenderedPage> {
  const meta = getStaticPageMeta('/profile')!;
  const [u, camps, apps, boards] = await Promise.all([getUserSummary(viewer.uid), campNameMap(), getApplicationsByUser(viewer.uid), getJobBoards()]);
  const boardTitle = (id: string) => boards.find((b) => b.id === id)?.title ?? id;

  const body = u
    ? [
        `- 이름: ${u.name}`,
        `- 역할 / 상태: ${roleKo(u.role)} / ${u.status}`,
        `- 대학/전공/학년: ${u.university ?? '-'} / ${u.major ?? '-'} / ${u.grade ?? '-'}${u.isOnLeave ? ' (휴학)' : ''}`,
        `- 참여 캠프: ${experienceSummary(u, camps) || '-'}`,
        `- 가입일: ${fmtDate(u.createdAt)}`,
        u.jobMotivation ? `\n## 지원 동기\n\n${u.jobMotivation}` : null,
        u.selfIntroduction ? `\n## 자기소개\n\n${u.selfIntroduction}` : null,
        '',
        '## 지원 이력',
        '',
        apps.length
          ? table(
              ['공고', '지원일', '서류', '면접', '면접 일시', '최종'],
              apps.map((a) => [
                boardTitle(a.refJobBoardId),
                fmtDate(a.applicationDate),
                APP_STATUS_KO[a.applicationStatus] ?? a.applicationStatus,
                a.interviewStatus ? INTERVIEW_STATUS_KO[a.interviewStatus] ?? a.interviewStatus : '',
                fmtDateTime(a.interviewDate),
                a.finalStatus ? FINAL_STATUS_KO[a.finalStatus] ?? a.finalStatus : '',
              ])
            )
          : '_지원 이력이 없습니다._',
      ]
        .filter((l): l is string => l !== null)
        .join('\n')
    : '_사용자 정보를 찾을 수 없습니다._';

  const children: PageLink[] = [
    { path: '/job-board', title: '채용 공고 목록', access: 'public' },
    ...(viewer.role === 'admin' || viewer.role === 'mentor' || viewer.role === 'foreign' ? [{ path: '/camp', title: '캠프 홈', access: 'mentor' as const }] : []),
    ...(viewer.role === 'admin' ? [{ path: '/admin', title: '관리자 대시보드', access: 'admin' as const }] : []),
  ];
  return { path: '/profile', title: `${meta.title} — ${viewer.name}`, description: meta.description, access: 'auth', tags: meta.tags, body, children };
}
