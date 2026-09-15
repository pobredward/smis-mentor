/**
 * 경로 → 페이지 해석기. 1층(.md 라우트)과 2층(MCP 도구)이 공유한다.
 *
 * - resolvePage(pathOrUrl, viewer)  : 한 페이지를 마크다운으로
 * - crawlPages(pathOrUrl, viewer)   : 페이지 + 하위 페이지를 BFS 로 수집
 * - searchPages(query, viewer)      : 제목·설명·태그·본문 검색
 * - listPages(viewer)               : 접근 가능한 페이지 목록
 * - buildLlmsTxt / buildLlmsFullTxt : 공개 콘텐츠 인덱스·전문
 */
import {
  Access,
  ACCESS_LABEL,
  canAccess,
  isResolveError,
  LLMS_FULL_URL,
  LLMS_TXT_URL,
  MCP_ENDPOINT,
  MCP_PUBLIC_ENDPOINT,
  PageLink,
  RenderedPage,
  ResolveResult,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  toMarkdownUrl,
  toUrl,
  Viewer,
} from './site';
import { getStaticPageMeta, getTemplatePageMeta, PAGE_REGISTRY, PageMeta } from './registry';
import { composePage, excerpt, fmtDate, htmlToText, indexPointer } from './markdown';
import { getCampPages, getCamps, getCampTasks, getJobBoards, getReviews } from './data';
import { renderAuthPage, renderHome, renderJobBoard, renderJobBoardList, renderRecruitment, renderReviews } from './render/public';
import { isStaticJsxPage, renderStaticJsxPage } from './render/static-pages';
import { renderCampCategory, renderCampHome, renderCampPage, renderCampRoster, renderCampTasks } from './render/camp';
import { renderAdminApplications, renderAdminHome, renderAdminJobBoards, renderAdminUsers, renderProfile } from './render/admin';

// ─── 경로 정규화 ──────────────────────────────────────────────────────

export interface NormalizedPath {
  path: string;
  query: URLSearchParams;
}

/** URL 또는 경로를 정규화된 사이트 경로로. ".md" 접미사·쿼리·www 처리 */
export function normalizePath(input: string): NormalizedPath {
  let raw = (input ?? '').trim();
  if (!raw) return { path: '/', query: new URLSearchParams() };

  let query = new URLSearchParams();
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      query = u.searchParams;
      raw = u.pathname;
    } else {
      const qIdx = raw.indexOf('?');
      if (qIdx >= 0) {
        query = new URLSearchParams(raw.slice(qIdx + 1));
        raw = raw.slice(0, qIdx);
      }
    }
  } catch {
    // 잘못된 URL → 경로로 취급
  }

  raw = raw.split('#')[0];
  if (!raw.startsWith('/')) raw = `/${raw}`;
  raw = raw.replace(/\.md$/i, '');
  raw = raw.replace(/\/index$/i, '/');
  raw = raw.replace(/\/+$/, '');
  if (raw === '') raw = '/';
  raw = raw.replace(/\/{2,}/g, '/');
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // 그대로 사용
  }

  // 사이트의 탭 쿼리 → 가상 경로
  if (raw === '/recruitment' && query.get('tab') === 'review') raw = '/recruitment/reviews';

  return { path: raw, query };
}

// ─── 해석 ─────────────────────────────────────────────────────────────

function authError(path: string, access: Access, viewer: Viewer | null): ResolveResult {
  if (!viewer) {
    return {
      error: 'auth_required',
      path,
      access,
      message: `이 페이지는 "${ACCESS_LABEL[access]}" 페이지입니다. MCP 커넥터(${MCP_ENDPOINT})로 로그인한 뒤 다시 요청하세요.`,
    };
  }
  return {
    error: 'forbidden',
    path,
    access,
    message: `이 페이지는 "${ACCESS_LABEL[access]}" 페이지입니다. 현재 계정(${viewer.name}, ${viewer.role})으로는 열람할 수 없습니다.`,
  };
}

function notFound(path: string): ResolveResult {
  return { error: 'not_found', path, message: `페이지를 찾을 수 없습니다: ${path}. 전체 목차는 ${LLMS_TXT_URL} 를 참고하세요.` };
}

function metaOnlyPage(meta: PageMeta, path: string): RenderedPage {
  const body = meta.excluded
    ? `_이 페이지는 AI 접근 계층에서 제외되었습니다: ${meta.excluded}_`
    : `_이 페이지는 폼/편집 도구 페이지로, 텍스트 콘텐츠가 없습니다. 사이트에서 직접 이용하세요: ${toUrl(path)}_`;
  return {
    path,
    title: meta.title,
    description: meta.description,
    access: meta.access,
    tags: meta.tags,
    body,
    children: [{ path: '/', title: '홈', access: 'public' }],
  };
}

function guard(access: Access, path: string, viewer: Viewer | null): ResolveResult | null {
  return canAccess(access, viewer) ? null : authError(path, access, viewer);
}

const CAMP_CATEGORY = /^\/camp\/(education|schedule|guide)(?:\/([^/]+))?(?:\/([^/]+))?$/;
const CAMP_TASKS = /^\/camp\/tasks(?:\/([^/]+))?$/;
const CAMP_ROSTER = /^\/camp\/(roster|class|room)(?:\/([^/]+))?$/;
const JOB_BOARD = /^\/job-board\/([^/]+)$/;
const ADMIN_APPS = /^\/admin\/interview-manage(?:\/([^/]+))?$/;

export async function resolvePage(input: string, viewer: Viewer | null): Promise<ResolveResult> {
  const { path, query } = normalizePath(input);
  const campParam = query.get('camp');

  // 공개 페이지
  if (path === '/') return renderHome();
  if (path === '/job-board') return renderJobBoardList();
  if (path === '/recruitment') return renderRecruitment();
  if (path === '/recruitment/reviews') return renderReviews();
  if (path === '/sign-in' || path === '/sign-up') return renderAuthPage(path);
  if (isStaticJsxPage(path)) return renderStaticJsxPage(path) ?? notFound(path);

  const jb = path.match(JOB_BOARD);
  if (jb) {
    const page = await renderJobBoard(jb[1], { admin: viewer?.role === 'admin' });
    return page ?? notFound(path);
  }

  // 로그인 필요
  if (path === '/profile') {
    return guard('auth', path, viewer) ?? renderProfile(viewer!);
  }

  // 캠프
  if (path === '/camp') {
    return guard('mentor', path, viewer) ?? renderCampHome(viewer!);
  }
  const cc = path.match(CAMP_CATEGORY);
  if (cc) {
    const g = guard('mentor', path, viewer);
    if (g) return g;
    const category = cc[1] as 'education' | 'schedule' | 'guide';
    const camp = cc[2] ?? campParam;
    const pageId = cc[3];
    const result = pageId ? await renderCampPage(viewer!, category, camp!, pageId) : await renderCampCategory(viewer!, category, camp);
    return 'error' in result ? { error: 'not_found', path, message: result.error } : result;
  }
  const ct = path.match(CAMP_TASKS);
  if (ct) {
    const g = guard('mentor', path, viewer);
    if (g) return g;
    const result = await renderCampTasks(viewer!, ct[1] ?? campParam);
    return 'error' in result ? { error: 'not_found', path, message: result.error } : result;
  }
  const cr = path.match(CAMP_ROSTER);
  if (cr) {
    const g = guard('mentor', path, viewer);
    if (g) return g;
    const result = await renderCampRoster(viewer!, cr[1] as 'roster' | 'class' | 'room', cr[2] ?? campParam);
    return 'error' in result ? { error: 'not_found', path, message: result.error } : result;
  }

  // 관리자
  if (path === '/admin') return guard('admin', path, viewer) ?? renderAdminHome();
  if (path === '/admin/user-manage') {
    return guard('admin', path, viewer) ?? renderAdminUsers({ role: query.get('role') ?? undefined, query: query.get('q') ?? undefined });
  }
  if (path === '/admin/job-board-manage') return guard('admin', path, viewer) ?? renderAdminJobBoards();
  const aa = path.match(ADMIN_APPS);
  if (aa) {
    const g = guard('admin', path, viewer);
    if (g) return g;
    const result = await renderAdminApplications(aa[1]);
    return 'error' in result ? { error: 'not_found', path, message: result.error } : result;
  }

  // 레지스트리에만 있는 페이지 (UI 도구 등)
  const meta = getStaticPageMeta(path) ?? getTemplatePageMeta(path);
  if (meta) {
    return guard(meta.access, path, viewer) ?? metaOnlyPage(meta, path);
  }
  return notFound(path);
}

/** resolvePage + composePage 를 한 번에 */
export async function renderMarkdown(input: string, viewer: Viewer | null): Promise<{ ok: true; page: RenderedPage; markdown: string } | { ok: false; error: Exclude<ResolveResult, RenderedPage> }> {
  const result = await resolvePage(input, viewer);
  if (isResolveError(result)) return { ok: false, error: result };
  return { ok: true, page: result, markdown: composePage(result) };
}

// ─── 크롤 (페이지 + 하위 페이지) ──────────────────────────────────────

export interface CrawlOptions {
  maxDepth?: number;
  maxPages?: number;
  maxChars?: number;
}

export interface CrawlResult {
  root: string;
  pages: { path: string; title: string; depth: number; chars: number }[];
  skipped: { path: string; reason: string }[];
  truncated: boolean;
  markdown: string;
}

export async function crawlPages(input: string, viewer: Viewer | null, options: CrawlOptions = {}): Promise<CrawlResult> {
  const maxDepth = Math.max(0, Math.min(options.maxDepth ?? 2, 4));
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 30, 100));
  const maxChars = Math.max(5_000, Math.min(options.maxChars ?? 120_000, 140_000));

  const { path: rootPath } = normalizePath(input);
  const queue: { path: string; depth: number }[] = [{ path: rootPath, depth: 0 }];
  const seen = new Set<string>([rootPath]);
  const docs: string[] = [];
  const pages: CrawlResult['pages'] = [];
  const skipped: CrawlResult['skipped'] = [];
  let chars = 0;
  let truncated = false;

  while (queue.length && pages.length < maxPages) {
    const { path, depth } = queue.shift()!;
    const result = await resolvePage(path, viewer);
    if (isResolveError(result)) {
      skipped.push({ path, reason: result.message });
      continue;
    }
    const md = composePage(result, { withPointer: false });
    if (chars + md.length > maxChars) {
      truncated = true;
      skipped.push({ path, reason: `분량 한도(${maxChars}자) 초과 — read_page 로 개별 조회하세요` });
      break;
    }
    chars += md.length;
    docs.push(`<!-- page: ${result.path} (depth ${depth}) -->\n${md}`);
    pages.push({ path: result.path, title: result.title, depth, chars: md.length });

    if (depth < maxDepth) {
      for (const child of result.children) {
        const { path: childPath } = normalizePath(child.path);
        if (seen.has(childPath)) continue;
        seen.add(childPath);
        if (!canAccess(child.access, viewer)) {
          skipped.push({ path: childPath, reason: `접근 권한 없음 (${ACCESS_LABEL[child.access]})` });
          continue;
        }
        queue.push({ path: childPath, depth: depth + 1 });
      }
    }
  }
  if (queue.length && pages.length >= maxPages) truncated = true;

  const header = [
    indexPointer(),
    '',
    `# 크롤 결과: ${toUrl(rootPath)}`,
    '',
    `- 수집 페이지: ${pages.length}개 (최대 깊이 ${maxDepth})`,
    truncated ? `- ⚠️ 한도에 도달해 일부 페이지가 생략되었습니다. 생략된 경로는 개별 조회하세요.` : '',
    skipped.length ? `- 생략: ${skipped.map((s) => `${s.path} (${s.reason})`).join('; ')}` : '',
    '',
    '---',
    '',
  ]
    .filter((l) => l !== '')
    .join('\n');

  return { root: rootPath, pages, skipped, truncated, markdown: `${header}${docs.join('\n\n---\n\n')}\n` };
}

// ─── 목록 · 검색 ───────────────────────────────────────────────────────

export interface PageListItem extends PageLink {
  url: string;
  markdownUrl: string;
  tags: string[];
  hasContent: boolean;
}

function registryItem(meta: PageMeta): PageListItem {
  return {
    path: meta.path,
    title: meta.title,
    description: meta.description,
    access: meta.access,
    url: toUrl(meta.path),
    markdownUrl: toMarkdownUrl(meta.path),
    tags: meta.tags,
    hasContent: meta.hasContent !== false && !meta.excluded,
  };
}

export async function listPages(viewer: Viewer | null, filter: { access?: Access; tag?: string } = {}): Promise<PageListItem[]> {
  const items: PageListItem[] = PAGE_REGISTRY.filter((m) => !m.path.includes('{')).map(registryItem);

  // 동적: 채용 공고
  const boards = await getJobBoards();
  boards.forEach((b) =>
    items.push({
      path: `/job-board/${b.id}`,
      title: b.title,
      description: `${b.generation} ${b.jobCode} · ${b.korea ? '국내' : '해외'} · ${b.status === 'active' ? '모집중' : '마감'}`,
      access: 'public',
      url: toUrl(`/job-board/${b.id}`),
      markdownUrl: toMarkdownUrl(`/job-board/${b.id}`),
      tags: ['채용 상세', b.generation, b.jobCode],
      hasContent: true,
    })
  );

  // 동적: 캠프 탭 (로그인 사용자 캠프 기준)
  if (viewer && canAccess('mentor', viewer)) {
    const camps = await getCamps();
    const mine = viewer.role === 'admin' ? camps.slice(0, 6) : camps.filter((c) => viewer.jobCodeIds.includes(c.id) || viewer.activeJobCodeId === c.id);
    mine.forEach((c) => {
      (['education', 'schedule', 'guide', 'tasks', 'roster', 'class', 'room'] as const).forEach((tab) => {
        items.push({
          path: `/camp/${tab}/${c.code}`,
          title: `${c.code} ${{ education: '교육 자료', schedule: '시간표', guide: '인솔표', tasks: '업무', roster: '학생 명단', class: '반별 명단', room: '숙소 배정' }[tab]}`,
          description: `${c.name} (${c.generation})`,
          access: 'mentor',
          url: toUrl(`/camp/${tab}`),
          markdownUrl: toMarkdownUrl(`/camp/${tab}/${c.code}`),
          tags: [c.code, c.generation],
          hasContent: true,
        });
      });
    });
  }

  let result = items.filter((i) => canAccess(i.access, viewer));
  if (filter.access) result = result.filter((i) => i.access === filter.access);
  if (filter.tag) {
    const t = filter.tag.toLowerCase();
    result = result.filter((i) => i.tags.some((x) => x.toLowerCase().includes(t)));
  }
  return result;
}

export interface SearchHit {
  path: string;
  url: string;
  markdownUrl: string;
  title: string;
  snippet: string;
  access: Access;
  score: number;
}

export async function searchPages(query: string, viewer: Viewer | null, limit = 20): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];

  const push = (path: string, title: string, access: Access, haystacks: { text: string; weight: number }[], snippetSource: string) => {
    if (!canAccess(access, viewer)) return;
    let score = 0;
    for (const term of terms) {
      for (const h of haystacks) {
        const t = h.text.toLowerCase();
        if (t.includes(term)) score += h.weight;
      }
    }
    if (score === 0) return;
    const lower = snippetSource.toLowerCase();
    const idx = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
    const start = Math.max(0, idx - 60);
    hits.push({ path, url: toUrl(path), markdownUrl: toMarkdownUrl(path), title, snippet: excerpt(snippetSource.slice(start), 200), access, score });
  };

  // 레지스트리
  PAGE_REGISTRY.filter((m) => !m.path.includes('{')).forEach((m) =>
    push(m.path, m.title, m.access, [{ text: m.title, weight: 5 }, { text: m.description, weight: 2 }, { text: m.tags.join(' '), weight: 3 }], m.description)
  );

  // 채용 공고 (본문 포함)
  const boards = await getJobBoards();
  boards.forEach((b) => {
    const text = htmlToText(b.descriptionHtml);
    push(`/job-board/${b.id}`, b.title, 'public', [{ text: b.title, weight: 5 }, { text: `${b.generation} ${b.jobCode}`, weight: 3 }, { text, weight: 1 }], text);
  });

  // 후기
  const reviews = await getReviews();
  reviews.forEach((r) => {
    const text = htmlToText(r.contentHtml);
    push('/recruitment/reviews', `멘토 후기 — ${r.title}`, 'public', [{ text: r.title, weight: 4 }, { text, weight: 1 }], text);
  });

  // 캠프 페이지·업무 (로그인 사용자)
  if (viewer && canAccess('mentor', viewer)) {
    const camps = await getCamps();
    const mine = viewer.role === 'admin' ? camps.slice(0, 6) : camps.filter((c) => viewer.jobCodeIds.includes(c.id) || viewer.activeJobCodeId === c.id);
    for (const c of mine) {
      const pages = await getCampPages(c.id);
      pages.forEach((p) => {
        if (p.targetRole === 'expired' && viewer.role !== 'admin') return;
        const text = htmlToText(p.contentHtml);
        push(`/camp/${p.category}/${c.code}/${p.id}`, `${c.code} ${p.title}`, 'mentor', [{ text: p.title, weight: 5 }, { text, weight: 1 }], text);
      });
      const tasks = await getCampTasks(c.code);
      tasks.forEach((t) => {
        push(`/camp/tasks/${c.code}`, `${c.code} 업무 — ${t.title} (${fmtDate(t.date)})`, 'mentor', [{ text: t.title, weight: 4 }, { text: t.description, weight: 1 }], `${t.title} ${t.description}`);
      });
    }
  }

  // 같은 경로는 최고 점수 하나만
  const best = new Map<string, SearchHit>();
  hits.forEach((h) => {
    const key = `${h.path}|${h.title}`;
    const cur = best.get(key);
    if (!cur || cur.score < h.score) best.set(key, h);
  });
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

// ─── llms.txt / llms-full.txt (공개 콘텐츠) ────────────────────────────

const PUBLIC_ORDER = ['/', '/job-board', '/recruitment', '/recruitment/reviews', '/privacy-policy', '/terms-of-service', '/sign-in', '/sign-up'];

export async function buildLlmsTxt(): Promise<string> {
  const boards = await getJobBoards();
  const active = boards.filter((b) => b.status === 'active');
  const closed = boards.filter((b) => b.status !== 'active');
  const publicMeta = PUBLIC_ORDER.map((p) => getStaticPageMeta(p)!).filter(Boolean);
  const authMeta = PAGE_REGISTRY.filter((m) => m.access !== 'public' && !m.path.includes('{') && m.hasContent !== false && !m.excluded);

  return [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `이 파일은 AI 에이전트를 위한 사이트 목차입니다(llms.txt 규격). 각 링크는 페이지의 마크다운 버전이며, 어떤 페이지든 URL 뒤에 \`.md\` 를 붙이면 마크다운으로 받을 수 있습니다. 공개 콘텐츠 전문은 한 파일로 ${LLMS_FULL_URL} 에 있습니다.`,
    '',
    '## 공개 페이지',
    '',
    ...publicMeta.map((m) => `- [${m.title}](${toMarkdownUrl(m.path)}): ${m.description}`),
    '',
    `## 채용 공고 (모집중 ${active.length}개)`,
    '',
    ...(active.length ? active.map((b) => `- [${b.title}](${toMarkdownUrl(`/job-board/${b.id}`)}): ${b.generation} ${b.jobCode}, ${b.korea ? '국내' : '해외'}, 교육 ${fmtDate(b.educationStartDate)}~${fmtDate(b.educationEndDate)}`) : ['- (현재 모집중인 공고 없음)']),
    '',
    `## 마감된 공고 (${closed.length}개)`,
    '',
    ...(closed.length ? closed.map((b) => `- [${b.title}](${toMarkdownUrl(`/job-board/${b.id}`)}): ${b.generation} ${b.jobCode} (마감)`) : ['- (없음)']),
    '',
    '## 로그인이 필요한 페이지 (MCP 커넥터로 접근)',
    '',
    `아래 페이지는 멘토·원어민·관리자 계정으로 MCP 커넥터(${MCP_ENDPOINT})에 연결하면 읽을 수 있습니다. 캠프 관련 경로는 뒤에 캠프 코드를 붙입니다 (예: /camp/tasks/S29.md).`,
    '',
    ...authMeta.map((m) => `- [${m.title}](${toMarkdownUrl(m.path)}): ${m.description} _(${ACCESS_LABEL[m.access]})_`),
    '',
    '## AI 에이전트 접근 방법',
    '',
    `- 전체 공개 콘텐츠 한 파일: ${LLMS_FULL_URL}`,
    `- 페이지별 마크다운: URL 뒤에 .md (홈은 ${SITE_URL}/index.md)`,
    `- MCP 서버(공개, 인증 없음): ${MCP_PUBLIC_ENDPOINT} — 도구: search, fetch, read_page, crawl, list_pages`,
    `- MCP 서버(로그인, OAuth): ${MCP_ENDPOINT} — Claude.ai 커넥터 또는 ChatGPT 커넥터에 이 URL 을 추가하면 로그인 창이 열립니다. 로그인 후 역할(멘토/원어민/관리자)에 맞는 페이지를 읽을 수 있습니다.`,
    `- 사이트맵: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n');
}

export async function buildLlmsFullTxt(): Promise<string> {
  const boards = await getJobBoards();
  const paths = [...PUBLIC_ORDER, ...boards.map((b) => `/job-board/${b.id}`)];
  const docs: string[] = [];
  for (const p of paths) {
    const result = await resolvePage(p, null);
    if (isResolveError(result)) continue;
    docs.push(`<!-- page: ${result.path} -->\n${composePage(result, { withPointer: false })}`);
  }
  return [
    indexPointer(),
    '',
    `# ${SITE_NAME} — 공개 콘텐츠 전문`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `생성 시각: ${new Date().toISOString()} · 페이지 수: ${docs.length} · 로그인 콘텐츠는 MCP 커넥터(${MCP_ENDPOINT})로 접근`,
    '',
    '---',
    '',
    docs.join('\n\n---\n\n'),
    '',
  ].join('\n');
}
