/**
 * 원어민 레슨플랜 (앱 작성) — Firestore 읽기·쓰기 (web·mobile 공용)
 *
 *  lessonPlans/{userId}_{jobCodeId}_{bookKey}   — 선생님 × 교재
 *  appSettings/eslBookUnits                      — 교재 단원 목록 · 캠프 합본(단권화) 쪽 번호 · 링크
 *
 * 날짜 붙이기·밀기 규칙은 utils/lessonPlanEngine.ts
 */
import {
  collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, type Firestore,
} from 'firebase/firestore';
import type { CampSettings } from '../types/camp';
import type { CampTimetable } from '../types/campTimetable';
import { isSameGroup } from '../types/campTimetable';
import { daySetForGroup } from '../types/campDayPlan';
import type { EslBookList } from '../types/eslBook';
import type { EslBookUnits, LessonPlanDoc, LessonPlanStatus } from '../types/lessonPlanDoc';
import {
  newLessonPlan,
  planBooksFor,
  planCalendar,
  planSubjectsOf,
  syncPlanBook,
  toYmd,
  type PlanBook,
  type PlanDay,
} from '../utils/lessonPlanEngine';
import { lessonViewerOf, type LessonClass, type LessonViewer } from '../utils/lessonPlan';
import { lessonClassesForViewer } from './lessonPlanLoader';
import { getCampSettingsDoc } from './camp';

const PLANS = 'lessonPlans';

/** Firestore 는 undefined 를 받지 않는다 — 비운 값은 빼고 저장 */
function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean) as unknown as T;
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    Object.entries(v as Record<string, unknown>).forEach(([k, x]) => {
      if (x !== undefined) out[k] = clean(x);
    });
    return out as T;
  }
  return v;
}

export async function getLessonPlan(db: Firestore, id: string): Promise<LessonPlanDoc | null> {
  const snap = await getDoc(doc(db, PLANS, id));
  return snap.exists() ? ({ ...(snap.data() as LessonPlanDoc), id: snap.id }) : null;
}

/** 이 캠프의 레슨플랜 전체 (관리자 현황) */
export async function listLessonPlans(db: Firestore, jobCodeId: string): Promise<LessonPlanDoc[]> {
  const snap = await getDocs(query(collection(db, PLANS), where('jobCodeId', '==', jobCodeId)));
  return snap.docs.map((d) => ({ ...(d.data() as LessonPlanDoc), id: d.id }));
}

/** 내 레슨플랜 (이 캠프) */
export async function listMyLessonPlans(db: Firestore, userId: string, jobCodeId: string): Promise<LessonPlanDoc[]> {
  const snap = await getDocs(query(collection(db, PLANS), where('userId', '==', userId)));
  return snap.docs.map((d) => ({ ...(d.data() as LessonPlanDoc), id: d.id })).filter((p) => p.jobCodeId === jobCodeId);
}

/** 선생님이 고치는 칸 — 상태·검토 칸은 건드리지 않는다 (관리자가 그사이 승인해도 덮어쓰지 않게) */
const CONTENT_KEYS = ['userName', 'group', 'subject', 'bookTitle', 'bookCodes', 'classCodes', 'orientation', 'final', 'book', 'activity', 'classes'] as const;

/**
 * 저장.
 *  create: 처음 저장 — 문서 통째로 (상태 'draft')
 *  그 밖: 내용 칸만 바꾼다. 승인된 문서를 고치면 editedAfterApproval
 */
export async function saveLessonPlan(db: Firestore, plan: LessonPlanDoc, opts: { create?: boolean } = {}): Promise<void> {
  const ref = doc(db, PLANS, plan.id);
  if (opts.create) {
    const { id: _id, createdAt: _c, updatedAt: _u, reviewedAt: _r, submittedAt: _s, ...rest } = plan;
    const data = clean(rest) as Record<string, unknown>;
    data.createdAt = serverTimestamp();
    data.updatedAt = serverTimestamp();
    await setDoc(ref, data);
    return;
  }
  const patch: Record<string, unknown> = {};
  CONTENT_KEYS.forEach((k) => {
    const v = plan[k];
    if (v !== undefined) patch[k] = clean(v);
  });
  if (plan.status === 'approved') patch.editedAfterApproval = true;
  patch.updatedAt = serverTimestamp();
  await updateDoc(ref, patch);
}

/** 제출 · 승인 · 수정 요청 */
export async function setLessonPlanStatus(
  db: Firestore, id: string, status: LessonPlanStatus, extra: { reviewNote?: string; reviewedBy?: string } = {},
): Promise<void> {
  const patch: Record<string, unknown> = { status, updatedAt: serverTimestamp() };
  if (status === 'submitted') patch.submittedAt = serverTimestamp();
  if (status === 'approved' || status === 'changes') {
    patch.reviewedAt = serverTimestamp();
    patch.reviewedBy = extra.reviewedBy ?? '';
    patch.reviewNote = extra.reviewNote ?? '';
    patch.editedAfterApproval = false;
  }
  await updateDoc(doc(db, PLANS, id), patch);
}

// ── 교재 단원 목록 ──────────────────────────────────────────────────

export async function getEslBookUnits(db: Firestore): Promise<EslBookUnits> {
  const snap = await getDoc(doc(db, 'appSettings', 'eslBookUnits'));
  const d = (snap.exists() ? snap.data() : {}) as Partial<EslBookUnits>;
  return { books: d.books ?? {}, bundles: d.bundles ?? {}, ...(d.updatedAt ? { updatedAt: d.updatedAt } : {}) };
}

/** 합본 링크만 고치기 (관리자) — bundles.{code}.canvaUrl / driveUrl. 합본이 없으면 만든다 */
export async function updateBundleLinks(db: Firestore, code: string, links: { canvaUrl?: string; driveUrl?: string }): Promise<void> {
  const ref = doc(db, 'appSettings', 'eslBookUnits');
  const cur = await getEslBookUnits(db);
  const prev = cur.bundles[code] ?? { code, books: {} };
  const next = {
    ...prev,
    code,
    ...(links.canvaUrl !== undefined ? { canvaUrl: links.canvaUrl.trim() } : {}),
    ...(links.driveUrl !== undefined ? { driveUrl: links.driveUrl.trim() } : {}),
  };
  await setDoc(ref, { bundles: { [code]: clean(next) }, updatedAt: new Date().toISOString() }, { merge: true });
}

// ── 화면에 필요한 캠프 정보 한 번에 ─────────────────────────────────

export interface LessonPlanContext {
  jobCodeId: string;
  campCode: string;
  start: string;
  end: string;
  settings: Partial<CampSettings>;
  eslBooks: EslBookList;
  catalog: EslBookUnits;
  /** 그룹(소문자 키) → 정규 시간표 */
  regularByGroup: Record<string, CampTimetable>;
}

/** campCode 를 모르면 jobCodes 문서의 code */
export async function loadLessonPlanContext(db: Firestore, opts: { jobCodeId: string; campCode?: string }): Promise<LessonPlanContext> {
  const jc = await getDoc(doc(db, 'jobCodes', opts.jobCodeId)).catch(() => null);
  const j = (jc?.exists() ? jc.data() : {}) as Record<string, unknown>;
  const campCode = String(opts.campCode || j.code || '').trim();
  const [cs, esl, catalog, tts] = await Promise.all([
    getCampSettingsDoc(db, campCode).catch(() => null),
    getDoc(doc(db, 'appSettings', 'eslBooks')).catch(() => null),
    getEslBookUnits(db).catch(() => ({ books: {}, bundles: {} } as EslBookUnits)),
    campCode ? getDocs(query(collection(db, 'campTimetables'), where('campCode', '==', campCode))).catch(() => null) : Promise.resolve(null),
  ]);
  const regularByGroup: Record<string, CampTimetable> = {};
  (tts?.docs ?? []).forEach((d) => {
    const t = { ...(d.data() as CampTimetable), id: d.id };
    if (t.dayType === 'regular') regularByGroup[String(t.groupName ?? '').toLowerCase()] = t;
  });
  const eslData = (esl?.exists() ? esl.data() : null) as EslBookList | null;
  return {
    jobCodeId: opts.jobCodeId,
    campCode,
    start: toYmd(j.startDate),
    end: toYmd(j.endDate),
    settings: (cs ?? {}) as Partial<CampSettings>,
    eslBooks: { codes: {}, ...(eslData ?? {}) },
    catalog,
    regularByGroup,
  };
}

/** 그 그룹의 캘린더 (일정표 세트) */
export function contextCalendar(ctx: LessonPlanContext, group: string | undefined): PlanDay[] {
  const set = daySetForGroup(ctx.settings.dayPlan, group);
  return planCalendar(ctx.start, ctx.end, set, ctx.campCode);
}

/** 그 그룹의 정규 시간표 */
export function contextRegular(ctx: LessonPlanContext, group: string | undefined): CampTimetable | undefined {
  const hit = Object.entries(ctx.regularByGroup).find(([g]) => isSameGroup(g, group));
  return hit?.[1];
}

/** 반 → 그룹 (campSettings.groups) */
export function groupOfClass(ctx: LessonPlanContext, classCode: string): string | undefined {
  return (ctx.settings.groups ?? []).find((g) => (g.classCodes ?? []).includes(classCode))?.name;
}

// ── 내 레슨플랜 묶음 (수업 탭 · 편집 화면) ─────────────────────────

type MemberLike = { jobExperiences?: Array<{ id: string; group?: string; classCode?: string }> | null };

export interface PlanUser {
  userId: string;
  name?: string;
  role?: string;
  jobExperiences?: Array<{ id: string; group?: string; groupRole?: string; classCode?: string }> | null;
}

export interface MyPlanBooks {
  ctx: LessonPlanContext;
  viewer: LessonViewer;
  /** 맡은 과목 (Mix 는 셋 다) */
  subjects: string[];
  classes: LessonClass[];
  /** 지금 맡은 반 기준 교재 */
  books: PlanBook[];
  /** 교재가 정해지지 않은 반 키 */
  missing: string[];
  /** 이미 있는 내 레슨플랜 (이 캠프) */
  plans: LessonPlanDoc[];
}

export async function loadMyPlanBooks(
  db: Firestore,
  opts: { user: PlanUser; jobCodeId: string; members?: MemberLike[] | (() => Promise<MemberLike[]>) },
): Promise<MyPlanBooks> {
  const { user, jobCodeId } = opts;
  const [ctx, plans] = await Promise.all([
    loadLessonPlanContext(db, { jobCodeId }),
    listMyLessonPlans(db, user.userId, jobCodeId),
  ]);
  const viewer = lessonViewerOf(user, jobCodeId);
  const classes = await lessonClassesForViewer(db, { code: ctx.campCode, jobCodeId, viewer, settings: ctx.settings, members: opts.members });
  const subjects = planSubjectsOf(viewer.groupRole);
  const books: PlanBook[] = [];
  const missing = new Set<string>();
  subjects.forEach((s) => {
    const r = planBooksFor(classes, ctx.eslBooks, s);
    r.books.forEach((b) => { if (!books.some((x) => x.bookKey === b.bookKey)) books.push(b); });
    r.missing.forEach((k) => missing.add(k));
  });
  return { ctx, viewer, subjects, classes, books, missing: [...missing], plans };
}

/**
 * 교재 하나의 레슨플랜 — 있으면 그것(반·코드가 바뀌었으면 맞춘 것), 없으면 새 문서(아직 저장 전).
 * changed: 맞추느라 바뀌었으면 true (저장해야 함)
 */
export function planForBook(my: MyPlanBooks, book: PlanBook, user: PlanUser): { plan: LessonPlanDoc; isNew: boolean; changed: boolean } {
  const existing = my.plans.find((p) => p.bookTitle === book.bookTitle) ?? my.plans.find((p) => p.id.endsWith(`_${book.bookKey}`));
  if (existing) {
    const synced = syncPlanBook(existing, book, my.viewer.group);
    return { plan: synced ?? existing, isNew: false, changed: !!synced };
  }
  return {
    plan: newLessonPlan({ userId: user.userId, userName: user.name, jobCodeId: my.ctx.jobCodeId, campCode: my.ctx.campCode, group: my.viewer.group, book }),
    isNew: true,
    changed: false,
  };
}
