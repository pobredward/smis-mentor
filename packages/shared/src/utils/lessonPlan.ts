/**
 * 수업 자료 — 누가 어떤 템플릿을 받는지, 반별 소제목(원어민 레슨플랜), 사용자 자료와 합치기.
 * web · mobile 수업 탭과 관리자 '한국인 멘토 선생님' 화면이 같은 규칙을 쓰도록 여기 한 곳에 둔다.
 *
 *  - 템플릿.audience  : 한국인 멘토 / 원어민, 그 안의 역할(groupRole). 없으면 한국인 멘토 전원
 *  - 템플릿.perClass  : 그 사람이 맡은 그룹의 반마다 소제목 1개 + 보조 교재(spare) 반은 1개 더
 *  - 사용자 소제목은 templateSectionId 로 템플릿 소제목에 붙는다 (반별 소제목은 'class:J09', 'class:J09:spare')
 */
import type {
  LessonAudienceRole,
  LessonMaterialAudience,
  LessonMaterialTemplate,
  LessonMaterialTemplateSection,
  SectionData,
} from '../types/lessonMaterial';
import type { CampClassInfo, CampGroup } from '../types/camp';
import { FOREIGN_GROUP_ROLES, MENTOR_GROUP_ROLES } from '../types/camp';
import { isSameGroup } from '../types/campTimetable';

// ── 보는 사람 ───────────────────────────────────────────────────────

/** 수업 탭을 보는 사람 — 역할 종류와 이 캠프에서의 그룹·역할·반 */
export interface LessonViewer {
  /** admin 은 템플릿을 모두 본다 (미리보기) */
  kind: LessonAudienceRole | 'admin';
  groupRole: string;
  group: string;
  classCode: string;
}

type ViewerUserLike = {
  role?: string | null;
  jobExperiences?: Array<{ id: string; group?: string; groupRole?: string; classCode?: string }> | null;
} | null | undefined;

export function lessonViewerOf(user: ViewerUserLike, jobCodeId: string | null | undefined): LessonViewer {
  const exp = user?.jobExperiences?.find((e) => e?.id === jobCodeId);
  const role = String(user?.role ?? '');
  const kind: LessonViewer['kind'] = role === 'admin' ? 'admin' : role === 'foreign' || role === 'foreign_temp' ? 'foreign' : 'mentor';
  return {
    kind,
    groupRole: String(exp?.groupRole ?? '').trim(),
    group: String(exp?.group ?? '').trim(),
    classCode: String(exp?.classCode ?? '').trim(),
  };
}

// ── 템플릿 대상 ─────────────────────────────────────────────────────

const norm = (v: string) => String(v ?? '').replace(/\s+/g, '').toLowerCase();
const MENTOR_ROLE_SET = new Set<string>(MENTOR_GROUP_ROLES.map(norm));
const FOREIGN_ROLE_SET = new Set<string>(FOREIGN_GROUP_ROLES.map(norm));
const kindOfGroupRole = (r: string): LessonAudienceRole | null =>
  MENTOR_ROLE_SET.has(norm(r)) ? 'mentor' : FOREIGN_ROLE_SET.has(norm(r)) ? 'foreign' : null;

/** 대상이 정해지지 않은 템플릿 — 예전처럼 한국인 멘토 전원 */
export const DEFAULT_LESSON_AUDIENCE: LessonMaterialAudience = { roles: ['mentor'] };

/** 템플릿 대상 (빈 값·옛 문서 정리) */
export function audienceOf(t: Pick<LessonMaterialTemplate, 'audience'> | null | undefined): LessonMaterialAudience {
  const roles = (t?.audience?.roles ?? []).filter((r): r is LessonAudienceRole => r === 'mentor' || r === 'foreign');
  if (!roles.length) return DEFAULT_LESSON_AUDIENCE;
  return { roles: [...new Set(roles)], groupRoles: [...new Set((t?.audience?.groupRoles ?? []).map((r) => String(r).trim()).filter(Boolean))] };
}

/** 이 템플릿이 고른 역할 중 한 종류(멘토/원어민)에 속하는 것만 — 비어 있으면 그 종류 전원 */
export function audienceGroupRolesOf(a: LessonMaterialAudience, kind: LessonAudienceRole): string[] {
  return (a.groupRoles ?? []).filter((r) => {
    const k = kindOfGroupRole(r);
    return !k || k === kind;
  });
}

/** 이 사람이 이 템플릿을 올려야 하나 */
export function templateFitsViewer(t: Pick<LessonMaterialTemplate, 'audience'>, viewer: LessonViewer): boolean {
  if (viewer.kind === 'admin') return true;
  const a = audienceOf(t);
  if (!a.roles.includes(viewer.kind)) return false;
  const mine = audienceGroupRolesOf(a, viewer.kind);
  if (!mine.length) return true;
  return mine.some((r) => norm(r) === norm(viewer.groupRole));
}

/** 이 캠프 코드에서 이 사람이 받는 템플릿 */
export function templatesForViewer<T extends LessonMaterialTemplate>(templates: T[], campCode: string, viewer: LessonViewer): T[] {
  return sortLessonTemplates(templates.filter((t) => !t.deleted && !!t.code && t.code === campCode && templateFitsViewer(t, viewer)));
}

/** 관리자가 정한 차례(order) → 없으면 받은 순서(만든 순서) 그대로 */
export function sortLessonTemplates<T extends Pick<LessonMaterialTemplate, 'order'>>(list: T[]): T[] {
  return list
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.order ?? Number.MAX_SAFE_INTEGER) - (b.t.order ?? Number.MAX_SAFE_INTEGER) || a.i - b.i)
    .map((x) => x.t);
}

/** 대상 한 줄 요약 — "한국인 멘토 · 수업", "원어민 전원", "한국인 멘토 전원 · 원어민 · Speaking" */
export function audienceLabel(t: Pick<LessonMaterialTemplate, 'audience'>): string {
  const a = audienceOf(t);
  return a.roles
    .map((k) => {
      const name = k === 'mentor' ? '한국인 멘토' : '원어민';
      const rs = audienceGroupRolesOf(a, k);
      return rs.length ? `${name} · ${rs.join('·')}` : `${name} 전원`;
    })
    .join(' / ');
}

/**
 * 제목으로 대상 추천 — 새 템플릿을 만들 때 기본값.
 * 수업 멘토는 패턴·방OT, 담임 멘토는 패턴 빼고 전부, 원어민은 반별 레슨플랜.
 */
export function suggestLessonAudience(title: string): { audience: LessonMaterialAudience; perClass?: boolean } {
  const s = norm(title);
  if (/lessonplan|레슨플랜|원어민/.test(s)) return { audience: { roles: ['foreign'] }, perClass: true };
  if (/패턴|pattern/.test(s)) return { audience: { roles: ['mentor'], groupRoles: ['수업'] } };
  if (/방ot/.test(s)) return { audience: { roles: ['mentor'], groupRoles: ['담임', '수업'] } };
  return { audience: { roles: ['mentor'], groupRoles: ['담임'] } };
}

// ── 반별 소제목 (원어민 레슨플랜) ───────────────────────────────────

export interface LessonClass {
  classCode: string;
  className?: string;
  bookCode?: string;
  spareBookCode?: string;
}

const byClassCode = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

/**
 * 그룹이 맡은 반 — 캠프 설정의 그룹-반(campSettings.groups) 기준, 없으면 배정에서 모은 반번호.
 * 반이름·교재·보조 교재는 campSettings.classInfo 에서.
 */
export function lessonClassesOf(
  group: string,
  groups: CampGroup[] | null | undefined,
  classInfo: Record<string, CampClassInfo> | null | undefined,
  fallbackClassCodes: string[] = [],
): LessonClass[] {
  if (!group) return [];
  const g = (groups ?? []).find((x) => isSameGroup(x.name, group));
  const codes = g?.classCodes?.length ? g.classCodes : fallbackClassCodes;
  return [...new Set(codes.map((c) => String(c).trim()).filter(Boolean))].sort(byClassCode).map((classCode) => {
    const info = classInfo?.[classCode] ?? {};
    return {
      classCode,
      ...(info.className?.trim() ? { className: info.className.trim() } : {}),
      ...(info.bookCode?.trim() ? { bookCode: info.bookCode.trim() } : {}),
      ...(info.spareBookCode?.trim() ? { spareBookCode: info.spareBookCode.trim() } : {}),
    };
  });
}

export const classSectionId = (classCode: string, spare = false) => `class:${classCode}${spare ? ':spare' : ''}`;
export const isClassSectionId = (id: string | null | undefined) => String(id ?? '').startsWith('class:');

/** "J09 Actor · Cc" / "J09 Actor · Spare Cd" */
export function classSectionTitle(c: LessonClass, spare = false): string {
  const head = [c.classCode, c.className].filter(Boolean).join(' ');
  if (spare) return `${head} · Spare${c.spareBookCode ? ` ${c.spareBookCode}` : ''}`;
  return c.bookCode ? `${head} · ${c.bookCode}` : head;
}

/** 이 사람에게 보일 템플릿 소제목 — 반별 소제목(있으면) → 템플릿에 넣은 소제목 순서 */
export function templateSectionsFor(t: LessonMaterialTemplate, classes: LessonClass[] = []): LessonMaterialTemplateSection[] {
  const deleted = new Set(t.deletedSectionIds ?? []);
  const fixed = [...(t.sections ?? [])].filter((s) => !deleted.has(s.id)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const perClass: LessonMaterialTemplateSection[] = [];
  if (t.perClass) {
    classes.forEach((c) => {
      perClass.push({ id: classSectionId(c.classCode), title: classSectionTitle(c), order: 0, links: [] });
      if (c.spareBookCode) perClass.push({ id: classSectionId(c.classCode, true), title: classSectionTitle(c, true), order: 0, links: [] });
    });
  }
  return [...perClass, ...fixed].map((s, i) => ({ ...s, order: i, links: s.links ?? [] }));
}

// ── 사용자 자료와 합치기 ────────────────────────────────────────────

/** 화면에 그릴 소제목 한 줄 */
export interface LessonSectionView extends SectionData {
  links?: { label: string; url: string }[];
  /** 템플릿이 정한 소제목 (제목 고정 · 삭제 불가 · 진행률에 들어감) */
  isFromTemplate: boolean;
  /** 아직 문서가 없는 템플릿 소제목 — 링크를 넣으면 문서가 만들어진다 (id 는 'template-…') */
  isPlaceholder?: boolean;
}

export const PLACEHOLDER_SECTION_PREFIX = 'template-';

export const hasLessonLink = (s: Partial<Pick<SectionData, 'viewUrl' | 'originalUrl'>> | null | undefined) =>
  !!(String(s?.viewUrl ?? '').trim() || String(s?.originalUrl ?? '').trim());

/**
 * 템플릿 소제목 + 사용자가 올린 소제목.
 * 템플릿 소제목은 제목·순서를 템플릿에서 가져오고, 링크는 사용자 문서에서.
 * 템플릿에서 빠진 소제목(관리자가 지웠거나 맡은 반이 바뀐 것)은 링크가 있을 때만 맨 뒤에 남긴다.
 */
export function mergeLessonSections(templateSections: LessonMaterialTemplateSection[], userSections: SectionData[]): LessonSectionView[] {
  const used = new Set<string>();
  const merged: LessonSectionView[] = templateSections.map((ts) => {
    const u = userSections.find((s) => s.templateSectionId === ts.id && !used.has(s.id));
    if (u) {
      used.add(u.id);
      return { ...u, title: ts.title, order: ts.order, links: ts.links ?? [], isFromTemplate: true, templateSectionId: ts.id };
    }
    return {
      id: `${PLACEHOLDER_SECTION_PREFIX}${ts.id}`,
      title: ts.title,
      order: ts.order,
      viewUrl: '',
      originalUrl: '',
      links: ts.links ?? [],
      isFromTemplate: true,
      isPlaceholder: true,
      templateSectionId: ts.id,
    };
  });
  const rest = userSections
    .filter((s) => !used.has(s.id))
    .filter((s) => !s.templateSectionId || hasLessonLink(s))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s) => ({ ...s, isFromTemplate: false, links: [] as { label: string; url: string }[] }));
  return [...merged, ...rest];
}

/** 진행률 — 템플릿 소제목 중 링크를 넣은 것 (직접 추가한 소제목은 세지 않는다) */
export function lessonProgress(sections: LessonSectionView[]): { done: number; total: number } {
  const req = sections.filter((s) => s.isFromTemplate);
  return { done: req.filter(hasLessonLink).length, total: req.length };
}

// ── 링크 확인 ──────────────────────────────────────────────────────

export type LessonLinkIssue = 'invalid' | 'canvaEditInView' | 'canvaViewInOriginal' | 'sameLink';

export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** 화면에 링크로 걸어도 되는 주소만 (javascript: 같은 주소는 빈 값) — 사용자가 넣은 링크는 그대로 믿지 않는다 */
export const safeLessonUrl = (url: string | null | undefined): string => {
  const v = String(url ?? '').trim();
  return v && isHttpUrl(v) ? v : '';
};

const canvaKind = (url: string): 'view' | 'edit' | null => {
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)canva\.com$/.test(u.hostname)) return null;
    if (/\/view\/?$/.test(u.pathname)) return 'view';
    if (/\/edit\/?$/.test(u.pathname)) return 'edit';
    return null;
  } catch {
    return null;
  }
};

/**
 * 공개보기·원본 링크 확인 — 자주 하는 실수(편집 링크를 공개보기 칸에 넣기 등)를 잡는다.
 * 짧은 링크(canva.link)는 종류를 알 수 없어 형식만 본다.
 */
export function checkLessonLinks(viewUrl: string, originalUrl: string): { view?: LessonLinkIssue; original?: LessonLinkIssue } {
  const v = viewUrl.trim();
  const o = originalUrl.trim();
  const out: { view?: LessonLinkIssue; original?: LessonLinkIssue } = {};
  if (v && !isHttpUrl(v)) out.view = 'invalid';
  else if (v && canvaKind(v) === 'edit') out.view = 'canvaEditInView';
  if (o && !isHttpUrl(o)) out.original = 'invalid';
  else if (o && canvaKind(o) === 'view') out.original = 'canvaViewInOriginal';
  else if (o && v && o === v && (canvaKind(v) || /canva\.link/.test(v))) out.original = 'sameLink';
  return out;
}

/**
 * 화면 안에서 미리 볼 수 있는 주소 — Canva 공개보기, 구글 문서·슬라이드·시트, 드라이브 파일.
 * 모르는 주소는 null (새 탭으로 연다)
 */
export function lessonEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'canva.com') {
      const m = u.pathname.match(/^\/design\/([^/]+)\/([^/]+)\/view/);
      if (m) return `https://www.canva.com/design/${m[1]}/${m[2]}/view?embed`;
      return null;
    }
    if (host === 'docs.google.com') {
      const m = u.pathname.match(/^\/(document|presentation|spreadsheets)\/d\/([^/]+)/);
      if (m) return `https://docs.google.com/${m[1]}/d/${m[2]}/preview`;
      return null;
    }
    if (host === 'drive.google.com') {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      const id = m?.[1] ?? u.searchParams.get('id');
      if (id) return `https://drive.google.com/file/d/${id}/preview`;
    }
    return null;
  } catch {
    return null;
  }
}
