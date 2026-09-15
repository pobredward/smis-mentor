/**
 * 수업 자료 렌더러 — 특정 선생님(멘토)의 수업 자료 대주제·섹션 링크를 표로 정리
 * 본인(/camp/lesson) 또는 관리자(/admin/lesson-materials/{userId})
 */
import type { RenderedPage, Viewer } from '../site';
import { getLessonMaterialsForUser, getLessonTemplates, getUserSummary, getCamps, LessonMaterialInfo, LessonTemplateInfo, UserSummary } from '../data';
import { fmtDate } from '../markdown';

function link(label: string, url?: string): string {
  return url ? `[${label}](${url})` : '-';
}

function materialSection(m: LessonMaterialInfo, template: LessonTemplateInfo | undefined): string {
  const head = `### ${m.title}${m.userCode ? ` (${m.userCode})` : ''}${template ? ` — 템플릿: ${template.title}` : ''}`;
  const rows = m.sections.length
    ? [
        '| 섹션 | 보기 링크 | 원본(편집) 링크 |',
        '| --- | --- | --- |',
        ...m.sections.map((sec) => `| ${sec.title} | ${link('보기', sec.viewUrl)} | ${link('원본', sec.originalUrl)} |`),
      ].join('\n')
    : '_섹션 없음_';
  const tmplLinks = template?.links.length ? `\n템플릿 공통 링크: ${template.links.map((l) => `[${l.label}](${l.url})`).join(', ')}` : '';
  const tmplSectionLinks = template
    ? template.sections
        .filter((ts) => ts.links.length)
        .map((ts) => `- ${ts.title}: ${ts.links.map((l) => `[${l.label}](${l.url})`).join(', ')}`)
        .join('\n')
    : '';
  return [head, '', rows, tmplLinks, tmplSectionLinks ? `\n템플릿 섹션 참고 링크:\n${tmplSectionLinks}` : ''].filter((x) => x !== '').join('\n');
}

/** 마크다운 본문만 (도구 응답·페이지 공용) */
export async function lessonMaterialsMarkdown(target: UserSummary): Promise<string> {
  const [materials, templates, camps] = await Promise.all([getLessonMaterialsForUser(target.uid), getLessonTemplates(), getCamps()]);
  const campCode = (id: string) => camps.find((c) => c.id === id)?.code ?? id;
  const exp = target.jobExperiences.map((e) => `${campCode(e.id)}${e.groupRole ? `/${e.groupRole}` : ''}`).join(', ');
  const allLinks = materials.flatMap((m) => m.sections.flatMap((sec) => [sec.viewUrl, sec.originalUrl].filter(Boolean)));
  return [
    `- 선생님: **${target.name}** (${target.role}${target.university ? `, ${target.university}` : ''})`,
    exp ? `- 참여 캠프: ${exp}` : null,
    `- 대주제 ${materials.length}개 · 섹션 ${materials.reduce((n, m) => n + m.sections.length, 0)}개 · 링크 ${allLinks.length}개`,
    materials.length ? `- 최근 수정: ${fmtDate(materials.map((m) => m.updatedAt).filter(Boolean).sort((a, b) => (b?.getTime() ?? 0) - (a?.getTime() ?? 0))[0])}` : null,
    '',
    materials.length ? materials.map((m) => materialSection(m, m.templateId ? templates.get(m.templateId) : undefined)).join('\n\n') : '_등록된 수업 자료가 없습니다._',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
}

export async function renderLessonMaterials(viewer: Viewer, targetUid: string): Promise<RenderedPage | { error: string }> {
  const target = await getUserSummary(targetUid);
  if (!target) return { error: `사용자를 찾을 수 없습니다: ${targetUid}` };
  const isSelf = target.uid === viewer.uid;
  const body = await lessonMaterialsMarkdown(target);
  return {
    path: isSelf ? '/camp/lesson' : `/admin/lesson-materials/${target.uid}`,
    title: isSelf ? '내 수업 자료' : `수업 자료 — ${target.name}`,
    description: `${target.name} 선생님의 수업 자료 대주제·섹션별 보기/원본 링크`,
    access: isSelf ? 'mentor' : 'admin',
    tags: ['수업', '자료', '링크'],
    body,
    children: [{ path: '/camp', title: '캠프 홈', access: 'mentor' }],
  };
}
