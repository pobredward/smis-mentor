/**
 * 한 사람의 수업 자료 묶음 불러오기 — web·mobile 수업 탭과 관리자 '한국인 멘토 선생님' 화면이 같이 쓴다.
 *
 *  - 받을 템플릿(대상 규칙: utils/lessonPlan.ts)마다 대주제 하나. 같은 템플릿 대주제가 둘 이상이면(예전 중복) 링크가 더 많은 것
 *  - createMissing: 없으면 만든다 (본인 수업 탭). 관리자 화면은 읽기만 — 없으면 빈 칸으로 보여 준다
 *  - 반별 템플릿(원어민 레슨플랜)은 그 사람이 맡은 그룹의 반으로 칸을 만든다
 */
import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { createLessonMaterialService } from './lessonMaterial';
import type { LessonMaterialData, LessonMaterialTemplate, SectionData } from '../types/lessonMaterial';
import type { CampSettings } from '../types/camp';
import { isSameGroup } from '../types/campTimetable';
import {
  hasLessonLink,
  lessonClassesOf,
  mergeLessonSections,
  templateSectionsFor,
  templatesForViewer,
  type LessonClass,
  type LessonSectionView,
  type LessonViewer,
} from '../utils/lessonPlan';

export interface LessonTopic {
  /** 아직 대주제 문서가 없으면 null (읽기 전용 화면) */
  material: LessonMaterialData | null;
  template?: LessonMaterialTemplate;
  sections: LessonSectionView[];
}

export interface LessonBundle {
  code: string;
  viewer: LessonViewer;
  classes: LessonClass[];
  /** 템플릿에서 온 주제 (템플릿 순서) */
  topics: LessonTopic[];
  /** 직접 추가한 주제 (이 캠프 코드) */
  custom: LessonTopic[];
}

type MemberLike = { jobExperiences?: Array<{ id: string; group?: string; classCode?: string }> | null };

/** 그 사람이 맡은 그룹의 반 — 캠프 설정의 그룹-반, 비어 있으면 같은 그룹 멤버들의 반번호 */
export async function lessonClassesForViewer(
  db: Firestore,
  opts: { code: string; jobCodeId: string; viewer: LessonViewer; settings?: Partial<CampSettings> | null; members?: MemberLike[] | (() => Promise<MemberLike[]>) },
): Promise<LessonClass[]> {
  const { code, jobCodeId, viewer } = opts;
  if (!viewer.group) return [];
  let cs = opts.settings;
  if (cs === undefined) {
    const snap = await getDoc(doc(db, 'campSettings', code));
    cs = snap.exists() ? (snap.data() as CampSettings) : {};
  }
  const g = (cs?.groups ?? []).find((x) => isSameGroup(x.name, viewer.group));
  let fallback: string[] = [];
  if (!g?.classCodes?.length && opts.members) {
    const members = typeof opts.members === 'function' ? await opts.members().catch(() => []) : opts.members;
    fallback = members.flatMap((m) => {
      const e = (m.jobExperiences ?? []).find((x) => x?.id === jobCodeId);
      return e?.classCode && isSameGroup(e.group, viewer.group) ? [String(e.classCode)] : [];
    });
  }
  return lessonClassesOf(viewer.group, cs?.groups, cs?.classInfo, fallback);
}

export async function loadLessonBundle(
  db: Firestore,
  opts: {
    userId: string;
    viewer: LessonViewer;
    code: string;
    jobCodeId: string;
    /** 없으면 불러온다 (여러 사람을 한꺼번에 볼 때는 한 번만 불러서 넘긴다) */
    templates?: LessonMaterialTemplate[];
    settings?: Partial<CampSettings> | null;
    members?: MemberLike[] | (() => Promise<MemberLike[]>);
    /** 본인 수업 탭 — 템플릿 대주제가 없으면 만들고, 제목이 바뀌었으면 맞춘다 */
    createMissing?: boolean;
  },
): Promise<LessonBundle> {
  const svc = createLessonMaterialService(db);
  const { userId, viewer, code, jobCodeId } = opts;
  const [all, mats] = await Promise.all([opts.templates ?? svc.getLessonMaterialTemplates(), svc.getLessonMaterials(userId)]);
  const mine = code ? templatesForViewer(all, code, viewer) : [];
  const classes = mine.some((t) => t.perClass) ? await lessonClassesForViewer(db, { code, jobCodeId, viewer, settings: opts.settings, members: opts.members }) : [];

  const secCache = new Map<string, Promise<SectionData[]>>();
  const sectionsOf = (id: string) => {
    if (!secCache.has(id)) secCache.set(id, svc.getSections(id));
    return secCache.get(id)!;
  };

  // 템플릿마다 대주제 하나 — 중복이면 링크가 더 많이 들어간 것, 같으면 고정 id(사용자_템플릿)
  const byTemplate = new Map<string, LessonMaterialData[]>();
  mats.forEach((m) => { if (m.templateId) byTemplate.set(m.templateId, [...(byTemplate.get(m.templateId) ?? []), m]); });
  const chosen = new Map<string, LessonMaterialData>();
  await Promise.all(mine.map(async (t) => {
    const list = byTemplate.get(t.id) ?? [];
    if (list.length <= 1) { if (list[0]) chosen.set(t.id, list[0]); return; }
    const fixed = `${userId}_${t.id}`;
    const scored = await Promise.all(list.map(async (m) => ({ m, n: (await sectionsOf(m.id)).filter(hasLessonLink).length })));
    scored.sort((a, b) => b.n - a.n || Number(b.m.id === fixed) - Number(a.m.id === fixed) || (a.m.order ?? 0) - (b.m.order ?? 0));
    chosen.set(t.id, scored[0].m);
  }));

  if (opts.createMissing) {
    const writes: Promise<unknown>[] = [];
    for (let i = 0; i < mine.length; i++) {
      const t = mine[i];
      const m = chosen.get(t.id);
      if (!m) {
        const id = await svc.ensureTemplateMaterial(userId, t.id, t.title, i);
        chosen.set(t.id, { id, userId, title: t.title, order: i, templateId: t.id });
      } else if (m.title !== t.title) {
        writes.push(svc.updateLessonMaterial(m.id, { title: t.title }));
        chosen.set(t.id, { ...m, title: t.title });
      }
    }
    await Promise.all(writes);
  }

  const customs = mats.filter((m) => !m.templateId && m.userCode === code).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  // 읽기에 실패하면 빈 칸처럼 보이지 않게 그대로 던진다 (빈 칸으로 보이면 다시 올리다가 중복이 생긴다)
  const topics = await Promise.all(mine.map(async (t) => {
    const m = chosen.get(t.id) ?? null;
    const secs = m ? await sectionsOf(m.id) : [];
    return { material: m, template: t, sections: mergeLessonSections(templateSectionsFor(t, classes), secs) };
  }));
  const custom = await Promise.all(customs.map(async (m) => ({ material: m, sections: mergeLessonSections([], await sectionsOf(m.id)) })));
  return { code, viewer, classes, topics, custom };
}
