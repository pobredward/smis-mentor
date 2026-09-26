/**
 * 업무(campTasks) 서버 로직 — Next.js API 라우트 전용 (Admin SDK)
 *
 * 업무 생성 · 수정 · 삭제 · 독촉을 관리자와 부매니저가 같은 경로로 한다.
 * - 관리자: 모든 업무
 * - 부매니저: 대상 그룹이 "내 그룹"으로 고정된 업무를 만들고, 본인이 만든 업무만 수정 · 삭제,
 *   내 그룹 대상 업무의 내 그룹 미완료자에게만 독촉
 *
 * 날짜는 'YYYY-MM-DD'로 받고 한국 시간 자정으로 저장한다 (기존 기기 저장 방식과 같은 값).
 * 여러 날짜 업무를 수정할 때는 남는 날짜의 문서를 그대로 두어 완료 기록과 첨부를 보존한다.
 */
import { randomUUID } from 'crypto';
import * as admin from 'firebase-admin';
import { getAdminFirestore, getAdminStorage } from './firebase-admin';
import {
  JOB_EXPERIENCE_GROUPS,
  JOB_EXPERIENCE_GROUP_ROLES,
  isCampStaffRole,
  taskViewerOf,
  isTaskAssignedTo,
  canRemindTask,
  notificationAllowed,
  pushReachOf,
  type TaskViewer, localeOfUser, t } from '@smis-mentor/shared';

const TASKS = 'campTasks';
const KST_MS = 9 * 3600 * 1000;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export class TaskApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Db = FirebaseFirestore.Firestore;
type TaskDoc = {
  campCode: string;
  title: string;
  targetRoles?: string[];
  targetGroups?: string[];
  date: admin.firestore.Timestamp;
  groupId?: string;
  attachments?: Array<{ type: string; url: string; label?: string; thumbnail?: string }>;
  completions?: Array<{ userId: string }>;
  createdBy?: string;
};

// ==================== 날짜 ====================

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' → 한국 시간 자정 Timestamp */
export function kstMidnight(key: string): admin.firestore.Timestamp {
  const [y, m, d] = key.split('-').map(Number);
  return admin.firestore.Timestamp.fromMillis(Date.UTC(y, m - 1, d) - KST_MS);
}

/** Timestamp → 한국 날짜 'YYYY-MM-DD' */
export function kstDateKey(ts: admin.firestore.Timestamp): string {
  return new Date(ts.toMillis() + KST_MS).toISOString().slice(0, 10);
}

// ==================== 권한 ====================

interface Actor {
  uid: string;
  name: string;
  isAdmin: boolean;
  /** 이 캠프 코드에 해당하는 jobCode 문서 id */
  jobCodeId?: string;
  viewer: TaskViewer;
}

async function jobCodeIdsFor(db: Db, campCode: string): Promise<string[]> {
  const snap = await db.collection('jobCodes').where('code', '==', campCode).get();
  return snap.docs.map(d => d.id);
}

/** 캠프 코드(예: J28) 기준으로 이 사용자의 권한 계산 */
async function actorFor(db: Db, uid: string, campCode: string): Promise<Actor> {
  const snap = await db.doc(`users/${uid}`).get();
  const user = snap.data() as { name?: string; role?: string; jobExperiences?: Array<{ id: string; group?: string; groupRole?: string }> } | undefined;
  if (!user || !isCampStaffRole(user.role)) throw new TaskApiError(403, '캠프 스태프만 사용할 수 있습니다.');
  const ids = await jobCodeIdsFor(db, campCode);
  // 이 캠프 코드의 jobCode 중 내가 배정된 것 (부매니저 판정용)
  const jobCodeId = ids.find(id => user.jobExperiences?.some(e => e.id === id)) ?? ids[0];
  return {
    uid,
    name: String(user.name ?? ''),
    isAdmin: user.role === 'admin',
    jobCodeId,
    viewer: taskViewerOf(user, jobCodeId),
  };
}

function assertCanWrite(actor: Actor) {
  if (actor.isAdmin) return;
  if (!actor.viewer.isSubManager) throw new TaskApiError(403, '관리자나 부매니저만 업무를 만들 수 있습니다.');
  if (!actor.viewer.group) throw new TaskApiError(403, '배정된 그룹이 없어 업무를 만들 수 없습니다.');
}

function assertOwns(actor: Actor, docs: TaskDoc[]) {
  if (actor.isAdmin) return;
  if (docs.some(d => d.createdBy !== actor.uid)) {
    throw new TaskApiError(403, '본인이 만든 업무만 수정 · 삭제할 수 있습니다.');
  }
}

// ==================== 입력 정리 ====================

export interface TaskFieldsInput {
  title?: unknown;
  description?: unknown;
  targetRoles?: unknown;
  targetGroups?: unknown;
  time?: unknown;
  estimatedDurationMinutes?: unknown;
  categoryId?: unknown;
  attachments?: unknown;
}

interface CleanFields {
  title: string;
  description: string;
  targetRoles: string[];
  targetGroups: string[];
  time: string | null;
  estimatedDuration: { value: number; unit: 'minutes' } | null;
  categoryId: string | null;
  attachments: Array<{ type: 'image' | 'video' | 'link' | 'file'; url: string; label: string; thumbnail?: string }>;
}

function cleanFields(input: TaskFieldsInput, actor: Actor): CleanFields {
  const title = String(input.title ?? '').trim();
  if (!title || title.length > 200) throw new TaskApiError(400, '업무 제목은 1~200자로 입력해주세요.');
  const description = String(input.description ?? '').trim().slice(0, 5000);

  const roles = Array.isArray(input.targetRoles) ? input.targetRoles.map(String) : [];
  const targetRoles = [...new Set(roles)].filter(r => (JOB_EXPERIENCE_GROUP_ROLES as readonly string[]).includes(r));
  if (targetRoles.length === 0) throw new TaskApiError(400, '대상 역할을 1개 이상 선택해주세요.');

  let targetGroups: string[];
  if (actor.isAdmin) {
    const groups = Array.isArray(input.targetGroups) ? input.targetGroups.map(String) : [];
    targetGroups = [...new Set(groups)].filter(g => (JOB_EXPERIENCE_GROUPS as readonly string[]).includes(g));
    if (targetGroups.length === 0) throw new TaskApiError(400, '대상 그룹을 1개 이상 선택해주세요.');
  } else {
    // 부매니저는 무엇을 보내든 내 그룹으로 고정
    targetGroups = [actor.viewer.group!];
  }

  const t = input.time == null || input.time === '' ? null : String(input.time);
  if (t !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new TaskApiError(400, '시간은 24시간 형식(예: 14:30)으로 입력해주세요.');

  const mins = input.estimatedDurationMinutes == null || input.estimatedDurationMinutes === '' ? null : Number(input.estimatedDurationMinutes);
  if (mins !== null && !(Number.isFinite(mins) && mins > 0 && mins <= 24 * 60)) throw new TaskApiError(400, '소요 시간은 1분~24시간 사이로 입력해주세요.');

  const categoryId = input.categoryId ? String(input.categoryId).slice(0, 100) : null;

  const raw = Array.isArray(input.attachments) ? input.attachments.slice(0, 30) : [];
  const attachments = raw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    .map(a => ({
      type: (['image', 'video', 'link', 'file'].includes(String(a.type)) ? String(a.type) : 'link') as 'image' | 'video' | 'link' | 'file',
      url: String(a.url ?? '').slice(0, 2000),
      label: String(a.label ?? '').slice(0, 200),
      ...(a.thumbnail ? { thumbnail: String(a.thumbnail).slice(0, 2000) } : {}),
    }))
    .filter(a => /^https?:\/\//.test(a.url));

  return {
    title, description, targetRoles, targetGroups,
    time: t,
    estimatedDuration: mins !== null ? { value: mins, unit: 'minutes' } : null,
    categoryId,
    attachments,
  };
}

function cleanDateKeys(v: unknown): string[] {
  const keys = Array.isArray(v) ? [...new Set(v.map(String))].filter(k => DATE_KEY.test(k)).sort() : [];
  if (keys.length === 0) throw new TaskApiError(400, '날짜를 하나 이상 선택해주세요.');
  if (keys.length > 62) throw new TaskApiError(400, '한 번에 62일까지만 등록할 수 있습니다.');
  return keys;
}

/** 새 문서용 필드 (null 은 빼고) */
function createPayload(f: CleanFields) {
  return {
    title: f.title,
    description: f.description,
    targetRoles: f.targetRoles,
    targetGroups: f.targetGroups,
    ...(f.time ? { time: f.time } : {}),
    ...(f.estimatedDuration ? { estimatedDuration: f.estimatedDuration } : {}),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.attachments.length ? { attachments: f.attachments } : {}),
  };
}

/** 기존 문서 수정용 필드 (null · 빈 첨부는 필드 삭제) */
function updatePayload(f: CleanFields) {
  const del = admin.firestore.FieldValue.delete();
  return {
    title: f.title,
    description: f.description,
    targetRoles: f.targetRoles,
    targetGroups: f.targetGroups,
    time: f.time ?? del,
    estimatedDuration: f.estimatedDuration ?? del,
    categoryId: f.categoryId ?? del,
    attachments: f.attachments.length ? f.attachments : del,
  };
}

// ==================== 첨부 파일 정리 ====================

function storagePathOf(url: string): string | null {
  const m = /\/o\/([^?]+)/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

async function deleteStorageFiles(urls: string[]) {
  if (urls.length === 0) return;
  const bucket = getAdminStorage();
  await Promise.all(urls.map(async url => {
    const path = storagePathOf(url);
    if (!path) return;
    try { await bucket.file(path).delete(); } catch { /* 이미 없으면 무시 */ }
  }));
}

const fileUrls = (atts?: TaskDoc['attachments']) =>
  (atts ?? []).filter(a => a.type === 'image' || a.type === 'file' || a.type === 'video').map(a => a.url);

// ==================== 저장 (생성 · 수정) ====================

export interface SaveTaskInput {
  campCode: string;
  /** 있으면 수정 (여러 날짜 업무면 묶음 전체) */
  taskId?: string;
  dates: unknown;
  fields: TaskFieldsInput;
}

export async function saveTask(uid: string, input: SaveTaskInput): Promise<{ taskIds: string[] }> {
  const db = getAdminFirestore();
  const campCode = String(input.campCode ?? '');
  if (!campCode || campCode.includes('/')) throw new TaskApiError(400, 'campCode가 필요합니다.');
  const actor = await actorFor(db, uid, campCode);
  assertCanWrite(actor);
  const fields = cleanFields(input.fields ?? {}, actor);
  const keys = cleanDateKeys(input.dates);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const col = db.collection(TASKS);

  // ── 생성 ──
  if (!input.taskId) {
    const groupId = keys.length > 1 ? randomUUID() : undefined;
    const batch = db.batch();
    const ids: string[] = [];
    for (const key of keys) {
      const ref = col.doc();
      ids.push(ref.id);
      batch.set(ref, {
        campCode,
        ...createPayload(fields),
        date: kstMidnight(key),
        ...(groupId ? { groupId } : {}),
        completions: [],
        createdAt: now,
        updatedAt: now,
        createdBy: uid,
      });
    }
    await batch.commit();
    return { taskIds: ids };
  }

  // ── 수정 ──
  const baseSnap = await col.doc(String(input.taskId)).get();
  if (!baseSnap.exists) throw new TaskApiError(404, '업무를 찾을 수 없습니다.');
  const base = baseSnap.data() as TaskDoc;
  if (base.campCode !== campCode) throw new TaskApiError(400, '다른 캠프의 업무입니다.');
  const siblingsSnap = base.groupId
    ? await col.where('groupId', '==', base.groupId).get()
    : null;
  const siblings = siblingsSnap
    ? siblingsSnap.docs.map(d => ({ ref: d.ref, data: d.data() as TaskDoc }))
    : [{ ref: baseSnap.ref, data: base }];
  assertOwns(actor, siblings.map(s => s.data));

  const byKey = new Map<string, typeof siblings[number]>();
  const extra: typeof siblings = []; // 같은 날짜에 겹친 문서 (정리 대상)
  for (const s of siblings) {
    const k = kstDateKey(s.data.date);
    if (byKey.has(k)) extra.push(s); else byKey.set(k, s);
  }
  const wanted = new Set(keys);
  const groupId = keys.length > 1 ? (base.groupId ?? randomUUID()) : null;
  const del = admin.firestore.FieldValue.delete();

  const batch = db.batch();
  const ids: string[] = [];
  for (const [k, s] of byKey) {
    if (!wanted.has(k)) { batch.delete(s.ref); continue; }
    ids.push(s.ref.id);
    // 남는 날짜: 내용만 바꾸고 완료 기록 · 작성자는 그대로
    batch.update(s.ref, { ...updatePayload(fields), groupId: groupId ?? del, updatedAt: now });
  }
  extra.forEach(s => batch.delete(s.ref));
  for (const k of keys) {
    if (byKey.has(k)) continue;
    const ref = col.doc();
    ids.push(ref.id);
    batch.set(ref, {
      campCode,
      ...createPayload(fields),
      date: kstMidnight(k),
      ...(groupId ? { groupId } : {}),
      completions: [],
      createdAt: now,
      updatedAt: now,
      createdBy: base.createdBy ?? uid,
    });
  }
  await batch.commit();

  // 수정으로 빠진 파일만 Storage 에서 지운다 (남은 첨부는 모든 날짜가 같이 쓴다)
  const before = new Set(siblings.flatMap(s => fileUrls(s.data.attachments)));
  const after = new Set(fileUrls(fields.attachments));
  await deleteStorageFiles([...before].filter(u => !after.has(u)));
  return { taskIds: ids };
}

// ==================== 삭제 ====================

export async function deleteTaskDocs(uid: string, taskId: string, scope: 'one' | 'group'): Promise<{ deleted: number }> {
  const db = getAdminFirestore();
  const col = db.collection(TASKS);
  const snap = await col.doc(taskId).get();
  if (!snap.exists) return { deleted: 0 };
  const base = snap.data() as TaskDoc;
  const actor = await actorFor(db, uid, base.campCode);
  assertCanWrite(actor);

  const all = base.groupId
    ? (await col.where('groupId', '==', base.groupId).get()).docs.map(d => ({ ref: d.ref, data: d.data() as TaskDoc }))
    : [{ ref: snap.ref, data: base }];
  const targets = scope === 'group' ? all : all.filter(s => s.ref.id === taskId);
  assertOwns(actor, targets.map(s => s.data));

  const batch = db.batch();
  targets.forEach(s => batch.delete(s.ref));
  await batch.commit();

  // 남은 날짜가 없을 때만 첨부 파일을 지운다
  const remaining = all.filter(s => !targets.includes(s));
  if (remaining.length === 0) {
    await deleteStorageFiles([...new Set(targets.flatMap(s => fileUrls(s.data.attachments)))]);
  }
  return { deleted: targets.length };
}

// ==================== 독촉 ====================

type CampUser = {
  id: string;
  userId?: string;
  name?: string;
  role?: string;
  jobExperiences?: Array<{ id: string; group?: string; groupRole?: string }>;
  pushTokens?: Record<string, unknown>;
  notificationSettings?: Record<string, unknown>;
  notificationPermission?: unknown;
};

export async function remindTask(uid: string, taskId: string): Promise<{
  sent: number;
  incomplete: number;
  missed: Array<{ name: string; state: string }>;
}> {
  const db = getAdminFirestore();
  const snap = await db.collection(TASKS).doc(taskId).get();
  if (!snap.exists) throw new TaskApiError(404, '업무를 찾을 수 없습니다.');
  const task = snap.data() as TaskDoc;
  const actor = await actorFor(db, uid, task.campCode);
  if (!canRemindTask({ targetGroups: task.targetGroups as never }, actor.viewer)) {
    throw new TaskApiError(403, '관리자나 이 그룹 부매니저만 알림을 보낼 수 있습니다.');
  }

  // 이 캠프 코드의 모든 jobCode 에 배정된 사람
  const ids = await jobCodeIdsFor(db, task.campCode);
  const seen = new Map<string, CampUser>();
  for (const id of ids) {
    const us = await db.collection('users').where('jobCodeIds', 'array-contains', id).get();
    us.docs.forEach(d => seen.set(d.id, { ...(d.data() as object), id: d.id } as CampUser));
  }
  const done = new Set((task.completions ?? []).map(c => c.userId));
  const myGroup = actor.isAdmin ? undefined : actor.viewer.group;

  const incomplete = [...seen.values()].filter(u => {
    const uidOf = u.userId ?? u.id;
    if (done.has(uidOf)) return false;
    const jc = ids.find(id => u.jobExperiences?.some(e => e.id === id));
    const v = taskViewerOf(u, jc);
    if (!isTaskAssignedTo({ targetRoles: task.targetRoles as never, targetGroups: task.targetGroups as never }, v)) return false;
    // 부매니저는 내 그룹 사람에게만
    if (myGroup && v.group !== myGroup) return false;
    return true;
  });

  const missed: Array<{ name: string; state: string }> = [];
  const targets = incomplete.filter(u => {
    const reach = pushReachOf(u as never);
    const state = reach.state !== 'ok' ? reach.state
      : !notificationAllowed(u.notificationSettings as never, 'taskReminders') ? 'typeOff'
      : null;
    if (state) { missed.push({ name: String(u.name ?? '').trim() || '이름 없음', state }); return false; }
    return true;
  });

  const taskDate = kstDateKey(task.date);
  const messages: Record<string, unknown>[] = [];
  targets.forEach(u => {
    Object.keys(u.pushTokens ?? {})
      .filter(t => /^(Exponent|Expo)PushToken\[.+\]$/.test(t))
      .forEach(to => messages.push({
        to, sound: 'default', priority: 'high', channelId: 'task-reminders',
        // 받는 사람 언어로 (원어민·영어 선택자는 영어)
        title: t(localeOfUser(u as never), 'push.taskReminderTitle'),
        body: t(localeOfUser(u as never), 'push.taskReminderBody', { title: task.title }),
        data: { type: 'task-reminder', taskId, taskDate, screen: 'Camp', tab: 'tasks' },
      }));
  });
  for (let i = 0; i < messages.length; i += 100) {
    try {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
    } catch (e) {
      console.error('업무 독촉 푸시 전송 오류:', e);
    }
  }
  return { sent: targets.length, incomplete: incomplete.length, missed };
}

