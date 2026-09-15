/**
 * AI 콘텐츠 계층의 데이터 접근 — Firebase Admin SDK 로 Firestore 직접 조회
 *
 * 클라이언트('use client') 페이지가 브라우저에서 불러오던 데이터를 서버에서 읽어
 * 마크다운으로 만들기 위한 읽기 전용 접근자. 개인정보(연락처·주민번호·여권 등)는
 * 이 계층에서 아예 읽지 않거나 제거한다.
 */
import type { DocumentData, Query } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@/lib/firebase-admin';
import type { Role } from './site';
import { toDate } from './markdown';

type Doc = DocumentData;

// ─── 간단한 프로세스 내 캐시 ───────────────────────────────────────────────

const cache = new Map<string, { exp: number; value: unknown }>();

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.exp > now) return hit.value as T;
  const value = await fn();
  cache.set(key, { exp: now + ttlMs, value });
  return value;
}

export function clearAiContentCache() {
  cache.clear();
}

// ─── 캠프(jobCodes) ───────────────────────────────────────────────────────

export interface CampInfo {
  id: string;
  code: string; // 예: S29
  generation: string; // 예: 29기
  name: string; // 예: 싱&말 영어캠프
  location: string;
  korea: boolean;
  startDate: Date | null;
  endDate: Date | null;
  eduDates: Date[];
}

function toCamp(id: string, d: Doc): CampInfo {
  return {
    id,
    code: d.code ?? '',
    generation: d.generation ?? '',
    name: d.name ?? '',
    location: d.location ?? '',
    korea: !!d.korea,
    startDate: toDate(d.startDate),
    endDate: toDate(d.endDate),
    eduDates: Array.isArray(d.eduDates) ? d.eduDates.map(toDate).filter((x): x is Date => !!x) : [],
  };
}

export async function getCamps(): Promise<CampInfo[]> {
  return cached('camps', 5 * 60_000, async () => {
    const snap = await getAdminFirestore().collection('jobCodes').get();
    const camps = snap.docs.map((d) => toCamp(d.id, d.data()));
    camps.sort((a, b) => (b.startDate?.getTime() ?? 0) - (a.startDate?.getTime() ?? 0));
    return camps;
  });
}

/** jobCodes 문서 ID 또는 코드(S29)로 캠프 찾기 */
export async function findCamp(idOrCode: string | undefined | null): Promise<CampInfo | null> {
  if (!idOrCode) return null;
  const camps = await getCamps();
  const needle = idOrCode.trim();
  return (
    camps.find((c) => c.id === needle) ??
    camps.find((c) => c.code.toLowerCase() === needle.toLowerCase()) ??
    null
  );
}

// ─── 채용 공고(jobBoards) ─────────────────────────────────────────────────

export interface JobBoardInfo {
  id: string;
  title: string;
  descriptionHtml: string;
  status: 'active' | 'closed';
  generation: string;
  jobCode: string;
  refJobCodeId: string;
  korea: boolean;
  interviewDates: { start: Date | null; end: Date | null }[];
  interviewBaseDuration: number;
  /** 관리자 전용 — 공개 렌더에서는 사용하지 않는다 */
  interviewBaseNotes: string;
  educationStartDate: Date | null;
  educationEndDate: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

function toJobBoard(id: string, d: Doc): JobBoardInfo {
  return {
    id,
    title: d.title ?? '',
    descriptionHtml: d.description ?? '',
    status: d.status === 'closed' ? 'closed' : 'active',
    generation: d.generation ?? '',
    jobCode: d.jobCode ?? d.code ?? '',
    refJobCodeId: d.refJobCodeId ?? '',
    korea: !!d.korea,
    interviewDates: Array.isArray(d.interviewDates)
      ? d.interviewDates.map((x: Doc) => ({ start: toDate(x?.start), end: toDate(x?.end) }))
      : [],
    interviewBaseDuration: Number(d.interviewBaseDuration ?? 0),
    interviewBaseNotes: d.interviewBaseNotes ?? '',
    educationStartDate: toDate(d.educationStartDate),
    educationEndDate: toDate(d.educationEndDate),
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  };
}

export async function getJobBoards(): Promise<JobBoardInfo[]> {
  return cached('jobBoards', 60_000, async () => {
    const snap = await getAdminFirestore().collection('jobBoards').get();
    const boards = snap.docs.map((d) => toJobBoard(d.id, d.data()));
    boards.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
    return boards;
  });
}

export async function getJobBoard(id: string): Promise<JobBoardInfo | null> {
  const boards = await getJobBoards();
  const hit = boards.find((b) => b.id === id);
  if (hit) return hit;
  const snap = await getAdminFirestore().collection('jobBoards').doc(id).get();
  return snap.exists ? toJobBoard(snap.id, snap.data() as Doc) : null;
}

// ─── 후기(reviews) ────────────────────────────────────────────────────────

export interface ReviewInfo {
  id: string;
  title: string;
  contentHtml: string;
  authorName: string;
  generation: string;
  jobCode: string;
  rating?: number;
  createdAt: Date | null;
}

export async function getReviews(): Promise<ReviewInfo[]> {
  return cached('reviews', 5 * 60_000, async () => {
    const snap = await getAdminFirestore().collection('reviews').get();
    const reviews = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        title: x.title ?? '',
        contentHtml: x.content ?? '',
        authorName: x.author?.name ?? x.writer ?? '',
        generation: x.generation ?? '',
        jobCode: x.jobCode ?? '',
        rating: typeof x.rating === 'number' ? x.rating : undefined,
        createdAt: toDate(x.createdAt),
      } satisfies ReviewInfo;
    });
    reviews.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
    return reviews;
  });
}

// ─── 캠프 페이지(campPages) · 자료 링크(generationResources) ───────────────

export type CampPageCategory = 'education' | 'schedule' | 'guide';
export type CampPageRole = 'common' | 'mentor' | 'foreign' | 'expired';

export interface CampPageInfo {
  id: string;
  jobCodeId: string;
  category: CampPageCategory;
  title: string;
  targetRole: CampPageRole;
  contentHtml: string;
  emoji?: string;
  order: number;
  updatedAt: Date | null;
}

function toCampPage(id: string, d: Doc): CampPageInfo {
  return {
    id,
    jobCodeId: d.jobCodeId ?? '',
    category: d.category ?? 'education',
    title: d.title ?? '',
    targetRole: d.targetRole ?? 'common',
    contentHtml: d.content ?? '',
    emoji: d.emoji,
    order: Number(d.order ?? 0),
    updatedAt: toDate(d.updatedAt) ?? toDate(d.createdAt),
  };
}

export async function getCampPages(jobCodeId: string, category?: CampPageCategory): Promise<CampPageInfo[]> {
  return cached(`campPages:${jobCodeId}:${category ?? 'all'}`, 60_000, async () => {
    let q: Query = getAdminFirestore().collection('campPages').where('jobCodeId', '==', jobCodeId);
    if (category) q = q.where('category', '==', category);
    const snap = await q.get();
    return snap.docs.map((d) => toCampPage(d.id, d.data())).sort((a, b) => a.order - b.order);
  });
}

export async function getCampPage(pageId: string): Promise<CampPageInfo | null> {
  const snap = await getAdminFirestore().collection('campPages').doc(pageId).get();
  return snap.exists ? toCampPage(snap.id, snap.data() as Doc) : null;
}

export interface ResourceLink {
  id: string;
  title: string;
  url: string;
  targetRole: CampPageRole;
}

export interface GenerationResources {
  educationLinks: ResourceLink[];
  scheduleLinks: ResourceLink[];
  guideLinks: ResourceLink[];
}

export async function getGenerationResources(jobCodeId: string): Promise<GenerationResources> {
  return cached(`genRes:${jobCodeId}`, 60_000, async () => {
    const snap = await getAdminFirestore().collection('generationResources').doc(jobCodeId).get();
    const d = (snap.exists ? snap.data() : {}) as Doc;
    const conv = (arr: unknown): ResourceLink[] =>
      Array.isArray(arr)
        ? arr.map((x: Doc) => ({ id: x.id ?? '', title: x.title ?? '', url: x.url ?? '', targetRole: x.targetRole ?? 'common' }))
        : [];
    return {
      educationLinks: conv(d.educationLinks),
      scheduleLinks: conv(d.scheduleLinks),
      guideLinks: conv(d.guideLinks),
    };
  });
}

export async function getCampHomeMessage(campCode: string): Promise<{ mentorMessage?: string; foreignMessage?: string } | null> {
  const snap = await getAdminFirestore().collection('campHomeMessages').doc(campCode).get();
  if (!snap.exists) return null;
  const d = snap.data() as Doc;
  return { mentorMessage: d.mentorMessage, foreignMessage: d.foreignMessage };
}

// ─── 캠프 업무(campTasks) ─────────────────────────────────────────────────

export interface CampTaskInfo {
  id: string;
  campCode: string;
  title: string;
  description: string;
  targetRoles: string[];
  targetGroups: string[];
  date: Date | null;
  time?: string;
  estimatedDuration?: { value: number; unit: string };
  categoryId?: string;
  completionCount: number;
  completedUserNames: string[];
  attachments: { name?: string; url?: string }[];
}

export async function getCampTasks(campCode: string): Promise<CampTaskInfo[]> {
  return cached(`campTasks:${campCode}`, 60_000, async () => {
    const snap = await getAdminFirestore().collection('campTasks').where('campCode', '==', campCode).get();
    const tasks = snap.docs.map((d) => {
      const x = d.data();
      const completions: Doc[] = Array.isArray(x.completions) ? x.completions : [];
      return {
        id: d.id,
        campCode: x.campCode ?? campCode,
        title: x.title ?? '',
        description: x.description ?? '',
        targetRoles: Array.isArray(x.targetRoles) ? x.targetRoles : [],
        targetGroups: Array.isArray(x.targetGroups) ? x.targetGroups : [],
        date: toDate(x.date),
        time: x.time,
        estimatedDuration: x.estimatedDuration,
        categoryId: x.categoryId,
        completionCount: completions.length,
        completedUserNames: completions.map((c) => c.userName).filter(Boolean),
        attachments: Array.isArray(x.attachments)
          ? x.attachments.map((a: Doc) => ({ name: a.name ?? a.fileName, url: a.url }))
          : [],
      } satisfies CampTaskInfo;
    });
    tasks.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0) || (a.time ?? '').localeCompare(b.time ?? ''));
    return tasks;
  });
}

export async function getTaskCategories(campCode: string): Promise<Map<string, string>> {
  return cached(`taskCategories:${campCode}`, 5 * 60_000, async () => {
    const snap = await getAdminFirestore().collection('taskCategories').where('campCode', '==', campCode).get();
    const map = new Map<string, string>();
    snap.docs.forEach((d) => map.set(d.id, d.data().name ?? ''));
    return map;
  });
}

// ─── 학생 명단(stSheetCache / familySTSheetCache) — 최소 필드만 ─────────────

/** 개인정보를 제외한 학생 명단 항목 */
export interface RosterStudent {
  name: string;
  englishName: string;
  grade: string;
  classNumber: string;
  className: string;
  classMentor: string;
  roomNumber: string;
  unit?: string;
  familyId?: string;
  departureGroup?: string;
  departureInstructor?: string;
  arrivalGroup?: string;
  arrivalInstructor?: string;
}

export interface RosterInfo {
  campCode: string;
  students: RosterStudent[];
  lastSyncedAt: Date | null;
  temporaryDataMode: boolean;
  isFamilyCamp: boolean;
}

function pickStudent(s: Doc): RosterStudent {
  return {
    name: s.name ?? '',
    englishName: s.englishName ?? '',
    grade: s.grade ?? '',
    classNumber: s.classNumber ?? '',
    className: s.className ?? '',
    classMentor: s.classMentor ?? '',
    roomNumber: s.roomNumber ?? '',
    unit: s.unit || undefined,
    familyId: s.familyId || undefined,
    departureGroup: s.departureGroup || undefined,
    departureInstructor: s.departureInstructor || undefined,
    arrivalGroup: s.arrivalGroup || undefined,
    arrivalInstructor: s.arrivalInstructor || undefined,
  };
}

export async function getCampRoster(campCode: string): Promise<RosterInfo | null> {
  return cached(`roster:${campCode}`, 60_000, async () => {
    const db = getAdminFirestore();
    const [settings, cacheSnap, familySnap] = await Promise.all([
      db.collection('campSettings').doc(campCode).get(),
      db.collection('stSheetCache').doc(campCode).get(),
      db.collection('familySTSheetCache').doc(campCode).get(),
    ]);
    const temporaryDataMode = !!settings.data()?.useTemporaryData;

    if (cacheSnap.exists) {
      const d = cacheSnap.data() as Doc;
      const data: Doc[] = Array.isArray(d.data) ? d.data : [];
      return {
        campCode,
        students: data.map(pickStudent),
        lastSyncedAt: toDate(d.lastSyncedAt),
        temporaryDataMode,
        isFamilyCamp: false,
      };
    }
    if (familySnap.exists) {
      const d = familySnap.data() as Doc;
      const families: Doc[] = Array.isArray(d.families) ? d.families : [];
      const students = families.flatMap((f) =>
        (Array.isArray(f.students) ? f.students : []).map((s: Doc) =>
          pickStudent({ ...s, roomNumber: s.roomNumber ?? f.roomNumber, familyId: f.familyId })
        )
      );
      return { campCode, students, lastSyncedAt: toDate(d.lastSyncedAt), temporaryDataMode, isFamilyCamp: true };
    }
    return null;
  });
}

// ─── 사용자(users) — 관리자용, 연락처·주민번호 등 제외 ─────────────────────

export interface UserSummary {
  uid: string;
  name: string;
  role: Role;
  status: string;
  university?: string;
  major?: string;
  grade?: number;
  isOnLeave?: boolean | null;
  referralPath?: string;
  jobExperiences: { id: string; group?: string; groupRole?: string; classCode?: string }[];
  activeJobExperienceId?: string;
  selfIntroduction?: string;
  jobMotivation?: string;
  createdAt: Date | null;
  lastLoginAt: Date | null;
  foreignCountryCode?: string;
}

function toUserSummary(uid: string, d: Doc): UserSummary {
  return {
    uid,
    name: d.name ?? '',
    role: (d.role ?? 'mentor_temp') as Role,
    status: d.status ?? '',
    university: d.university || d.school || undefined,
    major: d.major1 || d.major || undefined,
    grade: typeof d.grade === 'number' ? d.grade : undefined,
    isOnLeave: d.isOnLeave,
    referralPath: d.referralPath || undefined,
    jobExperiences: Array.isArray(d.jobExperiences)
      ? d.jobExperiences.map((e: Doc | string) =>
          typeof e === 'string' ? { id: e } : { id: e.id, group: e.group, groupRole: e.groupRole, classCode: e.classCode }
        )
      : [],
    activeJobExperienceId: d.activeJobExperienceId || undefined,
    selfIntroduction: d.selfIntroduction || undefined,
    jobMotivation: d.jobMotivation || undefined,
    createdAt: toDate(d.createdAt),
    lastLoginAt: toDate(d.lastLoginAt),
    foreignCountryCode: d.foreignTeacher?.countryCode || undefined,
  };
}

export async function getUsers(): Promise<UserSummary[]> {
  return cached('users', 60_000, async () => {
    const snap = await getAdminFirestore().collection('users').get();
    const users = snap.docs.map((d) => toUserSummary(d.id, d.data())).filter((u) => u.status !== 'deleted');
    users.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
    return users;
  });
}

export async function getUserSummary(uid: string): Promise<UserSummary | null> {
  const snap = await getAdminFirestore().collection('users').doc(uid).get();
  return snap.exists ? toUserSummary(snap.id, snap.data() as Doc) : null;
}

/** 지원자 이름 조회용 (uid → 이름/대학) */
export async function getUserNameMap(uids: string[]): Promise<Map<string, UserSummary>> {
  const users = await getUsers();
  const map = new Map<string, UserSummary>();
  const wanted = new Set(uids);
  users.forEach((u) => {
    if (wanted.has(u.uid)) map.set(u.uid, u);
  });
  return map;
}

// ─── 지원 이력(applicationHistories) ──────────────────────────────────────

export interface ApplicationInfo {
  id: string;
  refJobBoardId: string;
  refUserId: string;
  applicationStatus: string;
  interviewStatus?: string;
  finalStatus?: string;
  interviewDate: Date | null;
  interviewFeedback?: string;
  applicationDate: Date | null;
  applicationPath?: string;
}

function toApplication(id: string, d: Doc): ApplicationInfo {
  return {
    id,
    refJobBoardId: d.refJobBoardId ?? '',
    refUserId: d.refUserId ?? '',
    applicationStatus: d.applicationStatus ?? 'pending',
    interviewStatus: d.interviewStatus,
    finalStatus: d.finalStatus,
    interviewDate: toDate(d.interviewDate),
    interviewFeedback: d.interviewFeedback,
    applicationDate: toDate(d.applicationDate) ?? toDate(d.createdAt),
    applicationPath: d.applicationPath,
  };
}

export async function getApplicationsByJobBoard(jobBoardId: string): Promise<ApplicationInfo[]> {
  return cached(`applications:${jobBoardId}`, 60_000, async () => {
    const snap = await getAdminFirestore().collection('applicationHistories').where('refJobBoardId', '==', jobBoardId).get();
    const apps = snap.docs.map((d) => toApplication(d.id, d.data()));
    apps.sort((a, b) => (b.applicationDate?.getTime() ?? 0) - (a.applicationDate?.getTime() ?? 0));
    return apps;
  });
}

export async function getApplicationsByUser(uid: string): Promise<ApplicationInfo[]> {
  const snap = await getAdminFirestore().collection('applicationHistories').where('refUserId', '==', uid).get();
  const apps = snap.docs.map((d) => toApplication(d.id, d.data()));
  apps.sort((a, b) => (b.applicationDate?.getTime() ?? 0) - (a.applicationDate?.getTime() ?? 0));
  return apps;
}

export async function getApplicationCounts(): Promise<Map<string, { total: number; pending: number }>> {
  return cached('applicationCounts', 60_000, async () => {
    const snap = await getAdminFirestore().collection('applicationHistories').select('refJobBoardId', 'applicationStatus').get();
    const map = new Map<string, { total: number; pending: number }>();
    snap.docs.forEach((d) => {
      const x = d.data();
      const key = x.refJobBoardId ?? '';
      const cur = map.get(key) ?? { total: 0, pending: 0 };
      cur.total += 1;
      if (x.applicationStatus === 'pending') cur.pending += 1;
      map.set(key, cur);
    });
    return map;
  });
}

// ─── 평가 요약(userEvaluationSummaries) — 관리자용 ────────────────────────

export interface EvaluationSummaryInfo {
  overallAverage?: number;
  totalEvaluations?: number;
  stages: { stage: string; averageScore: number; totalEvaluations: number }[];
}

export async function getEvaluationSummary(uid: string): Promise<EvaluationSummaryInfo | null> {
  const snap = await getAdminFirestore().collection('userEvaluationSummaries').doc(uid).get();
  if (!snap.exists) return null;
  const d = snap.data() as Doc;
  const stageKeys: [string, string][] = [
    ['documentReview', '서류 전형'],
    ['interview', '면접 전형'],
    ['faceToFaceEducation', '대면 교육'],
    ['campLife', '캠프 생활'],
  ];
  return {
    overallAverage: typeof d.overallAverage === 'number' ? d.overallAverage : undefined,
    totalEvaluations: typeof d.totalEvaluations === 'number' ? d.totalEvaluations : undefined,
    stages: stageKeys
      .filter(([k]) => d[k] && typeof d[k].averageScore === 'number')
      .map(([k, stage]) => ({ stage, averageScore: d[k].averageScore, totalEvaluations: d[k].totalEvaluations ?? 0 })),
  };
}

// ─── 수업 자료(lessonMaterials · lessonMaterialTemplates) ───────────────

export interface LessonSectionInfo {
  id: string;
  title: string;
  order: number;
  viewUrl?: string;
  originalUrl?: string;
  templateSectionId?: string;
}

export interface LessonMaterialInfo {
  id: string;
  userId: string;
  title: string;
  order: number;
  templateId?: string;
  userCode?: string;
  updatedAt: Date | null;
  sections: LessonSectionInfo[];
}

export interface LessonTemplateInfo {
  id: string;
  title: string;
  code?: string;
  links: { label: string; url: string }[];
  sections: { id: string; title: string; order: number; links: { label: string; url: string }[] }[];
}

function toLinks(arr: unknown): { label: string; url: string }[] {
  return Array.isArray(arr) ? arr.filter((l: Doc) => l && typeof l.url === 'string').map((l: Doc) => ({ label: l.label ?? l.url, url: l.url })) : [];
}

export async function getLessonTemplates(): Promise<Map<string, LessonTemplateInfo>> {
  return cached('lessonTemplates', 5 * 60_000, async () => {
    const snap = await getAdminFirestore().collection('lessonMaterialTemplates').get();
    const map = new Map<string, LessonTemplateInfo>();
    snap.docs.forEach((d) => {
      const x = d.data();
      if (x.deleted) return;
      map.set(d.id, {
        id: d.id,
        title: x.title ?? '',
        code: x.code || undefined,
        links: toLinks(x.links),
        sections: Array.isArray(x.sections)
          ? x.sections.map((sec: Doc) => ({ id: sec.id ?? '', title: sec.title ?? '', order: Number(sec.order ?? 0), links: toLinks(sec.links) })).sort((a: { order: number }, b: { order: number }) => a.order - b.order)
          : [],
      });
    });
    return map;
  });
}

/** 특정 사용자의 수업 자료(대주제 + 섹션 링크). 섹션은 서브컬렉션이라 대주제별로 읽는다 */
export async function getLessonMaterialsForUser(uid: string): Promise<LessonMaterialInfo[]> {
  return cached(`lessonMaterials:${uid}`, 60_000, async () => {
    const db = getAdminFirestore();
    const snap = await db.collection('lessonMaterials').where('userId', '==', uid).get();
    const materials = await Promise.all(
      snap.docs.map(async (d) => {
        const x = d.data();
        const secSnap = await d.ref.collection('sections').get();
        const sections: LessonSectionInfo[] = secSnap.docs
          .map((sd) => {
            const y = sd.data();
            return { id: sd.id, title: y.title ?? '', order: Number(y.order ?? 0), viewUrl: y.viewUrl || undefined, originalUrl: y.originalUrl || undefined, templateSectionId: y.templateSectionId || undefined };
          })
          .sort((a, b) => a.order - b.order);
        return {
          id: d.id,
          userId: x.userId ?? uid,
          title: x.title ?? '',
          order: Number(x.order ?? 0),
          templateId: x.templateId || undefined,
          userCode: x.userCode || undefined,
          updatedAt: toDate(x.updatedAt) ?? toDate(x.createdAt),
          sections,
        } satisfies LessonMaterialInfo;
      })
    );
    return materials.sort((a, b) => a.order - b.order);
  });
}
