/**
 * 캠프 운영 페이지 렌더러 (멘토·원어민·관리자)
 * — 캠프 홈, 교육/시간표/인솔표 페이지, 업무, 학생 명단(반/방)
 */
import type { PageLink, RenderedPage, Viewer } from '../site';
import { SITE_URL } from '../site';
import {
  CampInfo,
  CampPageCategory,
  CampPageInfo,
  CampPageRole,
  findCamp,
  getCampHomeMessage,
  getCampPage,
  getCampPages,
  getCampRoster,
  getCampTasks,
  getCamps,
  getGenerationResources,
  getTaskCategories,
  ResourceLink,
  RosterStudent,
} from '../data';
import { excerpt, fmtDate, fmtDateTime, fmtRange, htmlToMarkdown, htmlToText, table } from '../markdown';
import { getStaticPageMeta } from '../registry';

export const CAMP_CATEGORY_LABEL: Record<CampPageCategory, string> = {
  education: '교육',
  schedule: '시간표',
  guide: '인솔표',
};

const ROLE_LABEL: Record<CampPageRole, string> = {
  common: '공통',
  mentor: '멘토',
  foreign: '원어민',
  expired: '만료(관리자만 표시)',
};

export interface CampContext {
  camp: CampInfo;
  /** 사용자가 이 캠프의 구성원인지 */
  isMember: boolean;
}

/** 요청자와 파라미터로 대상 캠프 결정. 관리자는 모든 캠프, 그 외는 본인 참여 캠프만 */
export async function resolveCampForViewer(
  viewer: Viewer,
  campParam?: string | null
): Promise<{ ok: true; ctx: CampContext } | { ok: false; reason: 'no_camp' | 'not_member' | 'not_found'; message: string }> {
  let camp: CampInfo | null = null;
  if (campParam) {
    camp = await findCamp(campParam);
    if (!camp) return { ok: false, reason: 'not_found', message: `캠프를 찾을 수 없습니다: ${campParam}. list_camps 도구 또는 /camp.md 에서 캠프 코드를 확인하세요.` };
  } else if (viewer.activeJobCodeId) {
    camp = await findCamp(viewer.activeJobCodeId);
  }
  if (!camp && viewer.jobCodeIds.length) {
    camp = await findCamp(viewer.jobCodeIds[0]);
  }
  if (!camp && viewer.role === 'admin') {
    const camps = await getCamps();
    camp = camps[0] ?? null;
  }
  if (!camp) return { ok: false, reason: 'no_camp', message: '참여 중인 캠프가 없습니다. 캠프 코드를 지정하세요 (예: /camp/tasks/S29).' };

  const isMember = viewer.jobCodeIds.includes(camp.id) || viewer.activeJobCodeId === camp.id;
  if (viewer.role !== 'admin' && !isMember) {
    return { ok: false, reason: 'not_member', message: `${camp.code} 캠프의 구성원이 아니므로 열람할 수 없습니다.` };
  }
  return { ok: true, ctx: { camp, isMember } };
}

function campHeader(camp: CampInfo): string {
  return [
    `- 캠프: **${camp.name}** (${camp.code}, ${camp.generation})`,
    `- 장소: ${camp.location || '-'} · ${camp.korea ? '국내' : '해외'}`,
    `- 기간: ${fmtRange(camp.startDate, camp.endDate)}`,
    camp.eduDates.length ? `- 교육일: ${camp.eduDates.map(fmtDate).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function campTabLinks(camp: CampInfo): PageLink[] {
  return [
    { path: `/camp/education/${camp.code}`, title: `${camp.code} 교육 자료`, access: 'mentor' },
    { path: `/camp/schedule/${camp.code}`, title: `${camp.code} 시간표`, access: 'mentor' },
    { path: `/camp/guide/${camp.code}`, title: `${camp.code} 인솔표`, access: 'mentor' },
    { path: `/camp/tasks/${camp.code}`, title: `${camp.code} 업무`, access: 'mentor' },
    { path: `/camp/roster/${camp.code}`, title: `${camp.code} 학생 명단`, access: 'mentor' },
    { path: `/camp/class/${camp.code}`, title: `${camp.code} 반별 명단`, access: 'mentor' },
    { path: `/camp/room/${camp.code}`, title: `${camp.code} 숙소 배정`, access: 'mentor' },
  ];
}

function visibleToViewer(page: { targetRole: CampPageRole }, viewer: Viewer): boolean {
  if (viewer.role === 'admin') return true;
  if (page.targetRole === 'common') return true;
  if (page.targetRole === 'mentor') return viewer.role === 'mentor';
  if (page.targetRole === 'foreign') return viewer.role === 'foreign';
  return false; // expired
}

// ─── 캠프 홈 ──────────────────────────────────────────────────────────

export async function renderCampHome(viewer: Viewer): Promise<RenderedPage> {
  const meta = getStaticPageMeta('/camp')!;
  const camps = await getCamps();
  const mine = camps.filter((c) => viewer.jobCodeIds.includes(c.id) || viewer.activeJobCodeId === c.id);
  const listed = viewer.role === 'admin' ? camps : mine;

  const rows = listed.map((c) => [
    c.code,
    c.generation,
    c.name,
    c.location,
    fmtRange(c.startDate, c.endDate),
    c.id === viewer.activeJobCodeId ? '✅ 활성' : mine.some((m) => m.id === c.id) ? '참여' : '',
  ]);

  let message = '';
  const activeCamp = viewer.activeJobCodeId ? camps.find((c) => c.id === viewer.activeJobCodeId) : undefined;
  if (activeCamp) {
    const home = await getCampHomeMessage(activeCamp.code);
    const text = viewer.role === 'foreign' ? home?.foreignMessage : home?.mentorMessage;
    if (text) message = `\n## ${activeCamp.code} 공지\n\n${text}\n`;
  }

  const body = [
    `${viewer.name}님(${viewer.role})이 볼 수 있는 캠프 목록입니다. 각 탭은 경로 뒤에 캠프 코드를 붙여 조회합니다 (예: ${SITE_URL}/camp/tasks/S29.md).`,
    '',
    table(['코드', '기수', '캠프명', '장소', '기간', '상태'], rows),
    message,
    '## 운영 탭',
    '',
    '- 교육: 대면 교육 안내, 밴드 작성 방법 등 교육 페이지와 자료 링크',
    '- 시간표: 캠프 시간표 페이지·링크',
    '- 인솔표: 이동·인솔 안내 페이지·링크',
    '- 업무: 날짜별 업무(Task) 목록과 완료 현황',
    '- 명단 / 반 / 숙소: 학생 명단(개인정보 제외)',
    '- 수업: 멘토 개인 수업 자료 (AI 계층에서는 목록 미제공)',
    '- 환자: 건강 정보이므로 AI 계층에서 제외',
  ].join('\n');

  const children: PageLink[] = (activeCamp ? [activeCamp] : listed.slice(0, 1)).flatMap(campTabLinks);
  return { path: '/camp', title: meta.title, description: meta.description, access: 'mentor', tags: meta.tags, body, children };
}

// ─── 교육 / 시간표 / 인솔표 카테고리 ───────────────────────────────────

function linksSection(links: ResourceLink[], viewer: Viewer): string {
  const visible = links.filter((l) => visibleToViewer(l, viewer));
  if (!visible.length) return '_(링크 없음)_';
  return visible.map((l) => `- [${l.title}](${l.url}) _(${ROLE_LABEL[l.targetRole]})_`).join('\n');
}

export async function renderCampCategory(viewer: Viewer, category: CampPageCategory, campParam?: string | null): Promise<RenderedPage | { error: string }> {
  const resolved = await resolveCampForViewer(viewer, campParam);
  if (!resolved.ok) return { error: resolved.message };
  const { camp } = resolved.ctx;
  const [pages, resources] = await Promise.all([getCampPages(camp.id, category), getGenerationResources(camp.id)]);
  const visible = pages.filter((p) => visibleToViewer(p, viewer));
  const links = category === 'education' ? resources.educationLinks : category === 'schedule' ? resources.scheduleLinks : resources.guideLinks;
  const label = CAMP_CATEGORY_LABEL[category];

  const body = [
    campHeader(camp),
    '',
    `## ${label} 페이지 (${visible.length}개)`,
    '',
    visible.length
      ? visible
          .map(
            (p) =>
              `- ${p.emoji ? `${p.emoji} ` : ''}[${p.title}](${SITE_URL}/camp/${category}/${camp.code}/${p.id}.md) _(${ROLE_LABEL[p.targetRole]}, 수정 ${fmtDate(p.updatedAt)})_ — ${excerpt(htmlToText(p.contentHtml), 140)}`
          )
          .join('\n')
      : '_(등록된 페이지 없음)_',
    '',
    `## ${label} 링크`,
    '',
    linksSection(links, viewer),
  ].join('\n');

  const children: PageLink[] = [
    ...visible.map((p) => ({
      path: `/camp/${category}/${camp.code}/${p.id}`,
      title: `${p.emoji ? `${p.emoji} ` : ''}${p.title}`,
      description: `${label} · ${ROLE_LABEL[p.targetRole]}`,
      access: 'mentor' as const,
    })),
    { path: '/camp', title: '캠프 홈', access: 'mentor' },
  ];

  return {
    path: `/camp/${category}/${camp.code}`,
    title: `${camp.code} ${label}`,
    description: `${camp.name} (${camp.code}) ${label} 페이지 목록과 링크`,
    access: 'mentor',
    tags: [label, camp.code, camp.generation],
    body,
    children,
  };
}

export async function renderCampPage(viewer: Viewer, category: CampPageCategory, campParam: string, pageId: string): Promise<RenderedPage | { error: string }> {
  const resolved = await resolveCampForViewer(viewer, campParam);
  if (!resolved.ok) return { error: resolved.message };
  const { camp } = resolved.ctx;
  const page: CampPageInfo | null = await getCampPage(pageId);
  if (!page || page.jobCodeId !== camp.id) return { error: `페이지를 찾을 수 없습니다: ${pageId}` };
  if (!visibleToViewer(page, viewer)) return { error: '이 페이지는 현재 역할에게 공개되지 않았습니다.' };
  const label = CAMP_CATEGORY_LABEL[page.category];

  const body = [
    campHeader(camp),
    `- 분류: ${label} · 대상: ${ROLE_LABEL[page.targetRole]}`,
    '',
    htmlToMarkdown(page.contentHtml) || '_(내용 없음)_',
  ].join('\n');

  return {
    path: `/camp/${page.category}/${camp.code}/${page.id}`,
    title: `${page.emoji ? `${page.emoji} ` : ''}${page.title}`,
    description: `${camp.code} ${label} 페이지 — ${excerpt(htmlToText(page.contentHtml), 120)}`,
    access: 'mentor',
    tags: [label, camp.code, page.targetRole],
    body,
    children: [{ path: `/camp/${page.category}/${camp.code}`, title: `${camp.code} ${label} 목록`, access: 'mentor' }],
    updatedAt: page.updatedAt ?? undefined,
  };
}

// ─── 업무 ─────────────────────────────────────────────────────────────

export async function renderCampTasks(viewer: Viewer, campParam?: string | null): Promise<RenderedPage | { error: string }> {
  const resolved = await resolveCampForViewer(viewer, campParam);
  if (!resolved.ok) return { error: resolved.message };
  const { camp } = resolved.ctx;
  const [tasks, categories] = await Promise.all([getCampTasks(camp.code), getTaskCategories(camp.code)]);

  const byDate = new Map<string, typeof tasks>();
  tasks.forEach((t) => {
    const key = fmtDate(t.date);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(t);
  });

  const sections = [...byDate.entries()].map(([date, list]) => {
    const items = list
      .map((t) => {
        const bits = [
          t.time ? `⏰ ${t.time}` : '',
          t.estimatedDuration ? `예상 ${t.estimatedDuration.value}${t.estimatedDuration.unit === 'hours' ? '시간' : '분'}` : '',
          t.targetRoles.length ? `대상 역할: ${t.targetRoles.join('/')}` : '',
          t.targetGroups.length ? `그룹: ${t.targetGroups.join('/')}` : '',
          t.categoryId && categories.get(t.categoryId) ? `카테고리: ${categories.get(t.categoryId)}` : '',
          `완료 ${t.completionCount}명`,
        ].filter(Boolean);
        const desc = t.description ? `\n  ${t.description.replace(/\r?\n/g, '\n  ')}` : '';
        const files = t.attachments.length ? `\n  첨부: ${t.attachments.map((a) => (a.url ? `[${a.name ?? '파일'}](${a.url})` : a.name)).join(', ')}` : '';
        return `- **${t.title}** — ${bits.join(' · ')}${desc}${files}`;
      })
      .join('\n');
    return `### ${date}\n\n${items}`;
  });

  const body = [
    campHeader(camp),
    `- 업무 수: ${tasks.length}개 (${byDate.size}일)`,
    '',
    sections.length ? sections.join('\n\n') : '_(등록된 업무 없음)_',
  ].join('\n');

  return {
    path: `/camp/tasks/${camp.code}`,
    title: `${camp.code} 업무`,
    description: `${camp.name} (${camp.code}) 날짜별 업무 목록과 완료 현황`,
    access: 'mentor',
    tags: ['업무', camp.code, camp.generation],
    body,
    children: [{ path: '/camp', title: '캠프 홈', access: 'mentor' }, ...campTabLinks(camp).filter((l) => !l.path.startsWith('/camp/tasks'))],
  };
}

// ─── 학생 명단 / 반 / 숙소 ─────────────────────────────────────────────

type RosterView = 'roster' | 'class' | 'room';

const ROSTER_TITLE: Record<RosterView, string> = { roster: '학생 명단', class: '반별 명단', room: '숙소 배정' };

function studentRow(s: RosterStudent): unknown[] {
  return [s.classNumber || s.className, s.name, s.englishName, s.grade, s.classMentor, s.roomNumber, s.unit ?? '', s.familyId ?? ''];
}

export async function renderCampRoster(viewer: Viewer, view: RosterView, campParam?: string | null): Promise<RenderedPage | { error: string }> {
  const resolved = await resolveCampForViewer(viewer, campParam);
  if (!resolved.ok) return { error: resolved.message };
  const { camp } = resolved.ctx;
  const roster = await getCampRoster(camp.code);
  const title = `${camp.code} ${ROSTER_TITLE[view]}`;
  const base = {
    path: `/camp/${view}/${camp.code}`,
    title,
    description: `${camp.name} (${camp.code}) ${ROSTER_TITLE[view]} — 이름·영문 이름·학년·반·담임·방 (연락처 등 개인정보 제외)`,
    access: 'mentor' as const,
    tags: ['명단', camp.code, camp.generation],
    children: [
      { path: '/camp', title: '캠프 홈', access: 'mentor' as const },
      ...(['roster', 'class', 'room'] as RosterView[]).filter((v) => v !== view).map((v) => ({ path: `/camp/${v}/${camp.code}`, title: `${camp.code} ${ROSTER_TITLE[v]}`, access: 'mentor' as const })),
    ],
  };

  if (!roster) {
    return { ...base, body: `${campHeader(camp)}\n\n_이 캠프의 학생 명단이 아직 동기화되지 않았습니다._` };
  }
  if (roster.temporaryDataMode) {
    return { ...base, body: `${campHeader(camp)}\n\n_현재 임시 데이터 표시 모드가 켜져 있어 실제 명단을 제공하지 않습니다._` };
  }

  const students = roster.students;
  const headers = ['반', '이름', '영문 이름', '학년', '담임 멘토', '방', '유닛', '가족'];
  let content: string;

  if (view === 'roster') {
    content = table(headers, students.map(studentRow));
  } else {
    const key = view === 'class' ? (s: RosterStudent) => s.classNumber || s.className || '(미배정)' : (s: RosterStudent) => s.roomNumber || '(미배정)';
    const groups = new Map<string, RosterStudent[]>();
    students.forEach((s) => {
      const k = key(s);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(s);
    });
    const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'ko', { numeric: true }));
    content = sorted
      .map(([k, list]) => {
        const mentor = view === 'class' ? [...new Set(list.map((s) => s.classMentor).filter(Boolean))].join(', ') : '';
        const heading = view === 'class' ? `### ${k}반${mentor ? ` — 담임 ${mentor}` : ''} (${list.length}명)` : `### ${k}호 (${list.length}명)`;
        return `${heading}\n\n${table(headers, list.map(studentRow))}`;
      })
      .join('\n\n');
  }

  const body = [
    campHeader(camp),
    `- 학생 수: ${students.length}명${roster.isFamilyCamp ? ' (가족 캠프)' : ''}`,
    `- 명단 동기화: ${fmtDateTime(roster.lastSyncedAt)}`,
    '',
    content,
  ].join('\n');

  return { ...base, body, updatedAt: roster.lastSyncedAt ?? undefined };
}
