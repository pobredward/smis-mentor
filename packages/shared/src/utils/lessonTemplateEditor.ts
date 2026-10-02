/**
 * 수업 템플릿 관리 (관리자) — 만들기 · 고치기 · 가져오기 규칙.
 * web /admin/lesson-templates 와 앱 '수업 템플릿 관리' 가 같은 규칙을 쓰도록 여기 한 곳에 둔다 (화면은 각자).
 *
 *  - 새 템플릿은 제목으로 대상을 추천 (suggestLessonAudience)
 *  - 빠르게 시작: 원어민 레슨플랜 (반별, S캠프는 Outdoor Class 칸) · 다른 캠프 템플릿 복사 (제목의 캠프 코드도 바꿈)
 *  - 저장 전 검사: 이름 · 코드 · 같은 이름 · 빈 소제목 · 링크(제목·주소 짝, http(s))
 *  - 가져오기: 같은 종류(코드 첫 글자)의 최근 기수부터, 이미 있는 이름은 건너뛴다
 */
import type {
  LessonMaterialAudience,
  LessonMaterialTemplate,
  LessonMaterialTemplateSection,
} from '../types/lessonMaterial';
import { compareCampCodes } from '../types/camp';
import { audienceGroupRolesOf, audienceOf, isHttpUrl, suggestLessonAudience } from './lessonPlan';
import { newId } from './id';

export type LessonTemplateLink = { label: string; url: string };

/** 편집 중인 템플릿 (새로 만들기 · 고치기 같은 모양) */
export interface LessonTemplateDraft {
  /** null = 새 템플릿 */
  id: string | null;
  code: string;
  title: string;
  links: LessonTemplateLink[];
  sections: LessonMaterialTemplateSection[];
  audience: LessonMaterialAudience;
  perClass: boolean;
}

/** '29기' → 29 */
export const lessonGenNum = (g: unknown) => parseInt(String(g ?? '').match(/\d+/)?.[0] ?? '0', 10);

/** "S28 패턴" → "S29 패턴" (제목 앞의 캠프 코드만) */
export const swapTemplateCode = (title: string, from: string, to: string) =>
  from && title.startsWith(from) ? `${to}${title.slice(from.length)}` : title;

export const cleanTemplateLinks = (links: LessonTemplateLink[] | null | undefined): LessonTemplateLink[] =>
  (links ?? []).map((l) => ({ label: String(l?.label ?? '').trim(), url: String(l?.url ?? '').trim() })).filter((l) => l.label || l.url);

/** 링크 칸 검사 — 제목·주소 둘 다 있거나 둘 다 비어야, 주소는 http(s) */
export function templateLinkProblem(links: LessonTemplateLink[] | null | undefined): string | null {
  for (const l of cleanTemplateLinks(links)) {
    if (!l.label || !l.url) return '링크는 제목과 주소를 모두 넣어 주세요.';
    if (!isHttpUrl(l.url)) return `"${l.label}" 링크 주소가 올바르지 않습니다 (https:// 로 시작).`;
  }
  return null;
}

export const newTemplateDraft = (code: string): LessonTemplateDraft => ({
  id: null, code, title: '', links: [], sections: [], audience: { roles: ['mentor'], groupRoles: ['담임'] }, perClass: false,
});

export const templateDraftOf = (t: LessonMaterialTemplate): LessonTemplateDraft => ({
  id: t.id,
  code: t.code ?? '',
  title: t.title,
  links: [...(t.links ?? [])],
  sections: [...(t.sections ?? [])].sort((a, b) => a.order - b.order),
  audience: audienceOf(t),
  perClass: !!t.perClass,
});

/** 소제목 차례를 0.. 으로 다시 */
export const reorderTemplateSections = (list: LessonMaterialTemplateSection[]) => list.map((s, i) => ({ ...s, order: i }));

/** 여러 줄 → 소제목 여러 칸 (붙여넣기 한 번에) */
export const templateSectionsFromText = (text: string): LessonMaterialTemplateSection[] =>
  String(text ?? '').split('\n').map((v) => v.trim()).filter(Boolean).map((title) => ({ id: newId(), title, order: 0, links: [] }));

/** 빠르게 시작 — 원어민 레슨플랜 (반마다 칸, S캠프는 Outdoor Class 칸 하나 더) */
export const lessonPlanPreset = (code: string): Pick<LessonTemplateDraft, 'title' | 'audience' | 'perClass' | 'sections'> => ({
  title: `${code} Lesson Plan`,
  audience: { roles: ['foreign'] },
  perClass: true,
  sections: /^S/i.test(code) ? [{ id: newId(), title: 'Outdoor Class', order: 0, links: [] }] : [],
});

/** 다른 캠프 템플릿을 이 코드로 복사 — 제목의 코드를 바꾸고 칸 id 는 새로 */
export const copyTemplatePreset = (t: LessonMaterialTemplate, code: string): Pick<LessonTemplateDraft, 'title' | 'links' | 'audience' | 'perClass' | 'sections'> => ({
  title: swapTemplateCode(t.title, t.code ?? '', code),
  links: [...(t.links ?? [])],
  audience: audienceOf(t),
  perClass: !!t.perClass,
  sections: [...(t.sections ?? [])].sort((a, b) => a.order - b.order).map((s, i) => ({ ...s, id: newId(), order: i, links: [...(s.links ?? [])] })),
});

/** 복사해 올 수 있는 템플릿 — 다른 캠프 것, 최근 기수부터 */
export const templateCopyChoices = (templates: LessonMaterialTemplate[], code: string) =>
  templates.filter((t) => t.code && t.code !== code)
    .sort((a, b) => lessonGenNum(b.code) - lessonGenNum(a.code) || compareCampCodes(a.code, b.code) || (a.order ?? 0) - (b.order ?? 0));

/** 저장 전에 막을 문제 — 없으면 null */
export function lessonTemplateProblem(d: LessonTemplateDraft, templates: LessonMaterialTemplate[]): string | null {
  if (!d.title.trim()) return '이름을 넣어 주세요.';
  if (!d.code) return '캠프 코드를 골라 주세요.';
  if (templates.some((t) => t.id !== d.id && t.code === d.code && t.title.trim() === d.title.trim())) return `${d.code}에 같은 이름의 템플릿이 있습니다.`;
  if (d.sections.some((s) => !s.title.trim())) return '이름이 빈 소제목이 있습니다.';
  if (!d.sections.length && !d.perClass) return '소제목을 하나 이상 넣어 주세요.';
  return templateLinkProblem(d.links) ?? d.sections.map((s) => templateLinkProblem(s.links ?? [])).find(Boolean) ?? null;
}

/** 저장할 내용 — 다듬은 제목·링크, 칸 차례 0.., 반별은 원어민이 대상일 때만 */
export function lessonTemplatePayload(d: LessonTemplateDraft) {
  const sections = d.sections.map((s, i) => ({ ...s, title: s.title.trim(), order: i, links: cleanTemplateLinks(s.links ?? []) }));
  return {
    title: d.title.trim(),
    code: d.code,
    links: cleanTemplateLinks(d.links),
    sections,
    audience: d.audience,
    perClass: d.audience.roles.includes('foreign') && d.perClass,
  };
}

/** 대상별 요약 — 누가 몇 개를 올리는지 (담임 멘토 · 수업 멘토 · 원어민) */
export function lessonTemplateSummary(list: Array<Pick<LessonMaterialTemplate, 'audience'>>): Array<[string, number]> {
  const count = (kind: 'mentor' | 'foreign', role?: string) =>
    list.filter((t) => {
      const a = audienceOf(t);
      if (!a.roles.includes(kind)) return false;
      const rs = audienceGroupRolesOf(a, kind);
      return !role || !rs.length || rs.includes(role);
    }).length;
  return [['담임 멘토', count('mentor', '담임')], ['수업 멘토', count('mentor', '수업')], ['원어민', count('foreign')]];
}

/** 가져오기 — 템플릿이 있는 다른 캠프 코드 (같은 종류 → 최근 기수 → 코드 순) */
export function lessonImportSources(
  templates: LessonMaterialTemplate[],
  codes: Array<{ code: string; generation?: unknown }>,
  target: string,
): string[] {
  const withTpl = [...new Set(templates.filter((t) => t.code && t.code !== target).map((t) => t.code as string))];
  const genOf = (c: string) => lessonGenNum(codes.find((x) => x.code === c)?.generation ?? c);
  const same = (c: string) => Number(c.charAt(0) === target.charAt(0));
  return withTpl.sort((a, b) => same(b) - same(a) || genOf(b) - genOf(a) || compareCampCodes(a, b));
}

/** 가져오기 — 한 템플릿을 대상 코드로 (addLessonMaterialTemplate 에 넘길 인자) */
export function importTemplateArgs(t: LessonMaterialTemplate, src: string, target: string, order: number): [
  string,
  Array<Omit<LessonMaterialTemplateSection, 'id'>>,
  string,
  LessonTemplateLink[],
  Pick<LessonMaterialTemplate, 'audience' | 'perClass' | 'order'>,
] {
  return [
    swapTemplateCode(t.title, src, target).trim(),
    [...(t.sections ?? [])].sort((a, b) => a.order - b.order).map((s, j) => ({ title: s.title, order: j, links: [...(s.links ?? [])] })),
    target,
    [...(t.links ?? [])],
    { audience: t.audience ? audienceOf(t) : suggestLessonAudience(t.title).audience, perClass: !!t.perClass, order },
  ];
}
