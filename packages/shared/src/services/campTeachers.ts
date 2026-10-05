/**
 * 캠프 선생님 화면 — 멘토들의 이 캠프 수업 자료 (web·mobile 공용).
 * 각자 받는 템플릿(담임·수업…)만, 칸마다 올렸는지 — 수업 탭과 같은 loadLessonBundle 을 읽기 전용으로.
 */
import type { Firestore } from 'firebase/firestore';
import { createLessonMaterialService } from './lessonMaterial';
import { getCampSettingsDoc } from './camp';
import { loadLessonBundle } from './lessonPlanLoader';
import { hasLessonLink, lessonProgress, lessonViewerOf, safeLessonUrl } from '../utils/lessonPlan';
import type { TeacherLesson } from '../utils/campTeachers';
import type { CampSettings } from '../types/camp';

export async function loadTeacherLessons(
  db: Firestore,
  opts: { users: Array<Record<string, any> & { userId?: string }>; ids: string[]; jobCodeId: string; code: string },
): Promise<Record<string, TeacherLesson>> {
  const { users, ids, jobCodeId, code } = opts;
  const svc = createLessonMaterialService(db);
  const [templates, settingsDoc] = await Promise.all([
    svc.getLessonMaterialTemplates(),
    getCampSettingsDoc(db, code).catch(() => null),
  ]);
  const settings: Partial<CampSettings> = settingsDoc ?? {};
  const strip = (title: string) => title.replace(new RegExp(`^${code}\\s*`), '').trim() || title;
  const out: Record<string, TeacherLesson> = {};
  await Promise.all(ids.map(async (uid) => {
    const u = users.find((x) => x.userId === uid);
    if (!u) return;
    // 관리자 계정이어도 이 화면에서는 캠프 역할(매니저·담임…)대로 — 미리보기처럼 전부 보이면 안 올린 것처럼 보인다
    const v = lessonViewerOf(u as any, jobCodeId);
    try {
      const b = await loadLessonBundle(db, {
        userId: uid, viewer: v.kind === 'admin' ? { ...v, kind: 'mentor' } : v, code, jobCodeId,
        templates, settings, members: users as any,
      });
      const topics = b.topics.map((t) => {
        const secs = t.sections.filter((s) => s.isFromTemplate || hasLessonLink(s));
        const p = lessonProgress(secs);
        return {
          title: strip(t.template?.title ?? ''),
          done: p.done,
          total: p.total,
          sections: secs.map((s) => ({
            title: s.title,
            url: safeLessonUrl(s.viewUrl) || safeLessonUrl(s.originalUrl),
            view: safeLessonUrl(s.viewUrl),
            original: safeLessonUrl(s.originalUrl),
          })),
        };
      });
      out[uid] = { topics, done: topics.reduce((a, t) => a + t.done, 0), total: topics.reduce((a, t) => a + t.total, 0) };
    } catch {
      out[uid] = { topics: [], done: 0, total: 0, failed: true };
    }
  }));
  return out;
}
