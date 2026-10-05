/**
 * 학생 정보 원본 (아이 · 캠프 참가 · 명단) — 서버 전용 (Admin SDK)
 * 모든 쓰기는 여기를 거친다. 참가나 아이가 바뀌면 그 캠프의 목록용 명단(roster/current)을 다시 만든다.
 */
import { randomUUID } from 'crypto';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { encryptRRN, decryptRRN } from '@/lib/encryption';
import {
  CHILDREN_COLLECTION, CAMPS_COLLECTION, ENROLLMENTS_SUBCOLLECTION, ROSTER_SUBCOLLECTION, ROSTER_DOC_ID,
  toRosterStudent, compareEnrollments, maskSsnForStaff,
  type ChildProfile, type CampEnrollment, type EnrollmentStatus,
} from '@smis-mentor/shared';

export class CampStudentError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const db = () => getAdminFirestore();
export const childRef = (childId: string) => db().collection(CHILDREN_COLLECTION).doc(childId);
export const identityRef = (childId: string) => childRef(childId).collection('private').doc('identity');
export const enrollmentsCol = (campCode: string) => db().collection(CAMPS_COLLECTION).doc(campCode).collection(ENROLLMENTS_SUBCOLLECTION);
export const rosterRef = (campCode: string) => db().collection(CAMPS_COLLECTION).doc(campCode).collection(ROSTER_SUBCOLLECTION).doc(ROSTER_DOC_ID);

/** Firestore 에 넣을 수 있게 — undefined 빼기 */
const clean = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export const newChildId = () => randomUUID().replace(/-/g, '').slice(0, 20);

// ─── 명단 ───────────────────────────────────────────────

/** 캠프 목록용 명단 다시 만들기 — 확정된 참가만, 참가 순서대로 */
export async function rebuildCampRoster(campCode: string): Promise<number> {
  const snap = await enrollmentsCol(campCode).where('status', '==', 'confirmed').get();
  const enrollments = snap.docs.map((d) => ({ ...(d.data() as CampEnrollment), studentId: d.id })).sort(compareEnrollments);
  const childIds = [...new Set(enrollments.map((e) => e.childId).filter(Boolean))];
  const children = new Map<string, ChildProfile>();
  for (let i = 0; i < childIds.length; i += 300) {
    const refs = childIds.slice(i, i + 300).map((id) => childRef(id));
    if (!refs.length) continue;
    for (const c of await db().getAll(...refs)) if (c.exists) children.set(c.id, { ...(c.data() as ChildProfile), childId: c.id });
  }
  const students = enrollments.map((e) => clean(toRosterStudent(children.get(e.childId), e) as unknown as Record<string, unknown>));
  await rosterRef(campCode).set({ campCode, students, total: students.length, updatedAt: new Date().toISOString() });
  return students.length;
}

/** 아이가 참가한 캠프들 (명단을 다시 만들 곳) */
export async function campsOfChild(childId: string): Promise<string[]> {
  const snap = await db().collectionGroup(ENROLLMENTS_SUBCOLLECTION).where('childId', '==', childId).get();
  return [...new Set(snap.docs.map((d) => String(d.get('campCode') || d.ref.parent.parent?.id || '')).filter(Boolean))];
}

// ─── 아이 ───────────────────────────────────────────────

export async function getChild(childId: string): Promise<ChildProfile | null> {
  const s = await childRef(childId).get();
  return s.exists ? ({ ...(s.data() as ChildProfile), childId: s.id }) : null;
}

export async function createChild(data: Partial<ChildProfile>, by: string, ssn?: string): Promise<string> {
  const childId = newChildId();
  await childRef(childId).set(clean({
    ...data, childId, parentIds: data.parentIds ?? [],
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: by,
  }));
  if (ssn) await setChildSsn(childId, ssn);
  return childId;
}

/** 아이 칸 고치기 → 참가한 캠프 명단 다시 만들기 */
export async function updateChild(childId: string, patch: Partial<ChildProfile>, by: string): Promise<void> {
  const ref = childRef(childId);
  if (!(await ref.get()).exists) throw new CampStudentError(404, '아이 정보를 찾을 수 없습니다.');
  const { childId: _c, parentIds: _p, ssnMasked: _s, ...rest } = patch;
  await ref.set(clean({ ...rest, updatedAt: FieldValue.serverTimestamp(), updatedBy: by }), { merge: true });
  await Promise.all((await campsOfChild(childId)).map(rebuildCampRoster));
}

/** 주민번호 — 원본은 암호화해서 private, 아이 문서에는 가린 값 */
export async function setChildSsn(childId: string, ssn: string): Promise<void> {
  const digits = ssn.replace(/\D/g, '');
  if (digits.length !== 13) throw new CampStudentError(400, '주민등록번호 13자리를 확인해주세요.');
  const formatted = `${digits.slice(0, 6)}-${digits.slice(6)}`;
  await identityRef(childId).set({ ssnEnc: encryptRRN(formatted), updatedAt: FieldValue.serverTimestamp() });
  await childRef(childId).set({ ssnMasked: maskSsnForStaff(formatted), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function readChildSsn(childId: string): Promise<string | null> {
  const s = await identityRef(childId).get();
  const enc = s.get('ssnEnc');
  return typeof enc === 'string' && enc ? decryptRRN(enc) : null;
}

/** 학부모 연결 · 해제 — 아이와 그 참가 문서들의 parentIds 를 같이 맞춘다 */
export async function setChildParent(childId: string, parentUid: string, linked: boolean): Promise<string[]> {
  const ref = childRef(childId);
  const next = await db().runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (!cur.exists) throw new CampStudentError(404, '아이 정보를 찾을 수 없습니다.');
    const ids = new Set<string>((cur.get('parentIds') as string[] | undefined) ?? []);
    if (linked) ids.add(parentUid); else ids.delete(parentUid);
    const list = [...ids];
    tx.update(ref, { parentIds: list, updatedAt: FieldValue.serverTimestamp() });
    return list;
  });
  const enrolls = await db().collectionGroup(ENROLLMENTS_SUBCOLLECTION).where('childId', '==', childId).get();
  await Promise.all(enrolls.docs.map((d) => d.ref.update({ parentIds: next })));
  return next;
}

// ─── 캠프 참가 ───────────────────────────────────────────

export async function getEnrollment(campCode: string, studentId: string): Promise<CampEnrollment | null> {
  const s = await enrollmentsCol(campCode).doc(studentId).get();
  return s.exists ? ({ ...(s.data() as CampEnrollment), studentId: s.id }) : null;
}

/** 새 참가 — 학생 번호는 아이 id (같은 캠프에 같은 아이가 두 번 들어가지 않는다) */
export async function createEnrollment(campCode: string, childId: string, data: Partial<CampEnrollment>, by: string): Promise<CampEnrollment> {
  const child = await getChild(childId);
  if (!child) throw new CampStudentError(404, '아이 정보를 찾을 수 없습니다.');
  const dup = await enrollmentsCol(campCode).where('childId', '==', childId).limit(1).get();
  if (!dup.empty) throw new CampStudentError(409, '이미 이 캠프에 등록된 아이입니다.');
  const last = await enrollmentsCol(campCode).orderBy('order', 'desc').limit(1).get();
  const order = (Number(last.docs[0]?.get('order') ?? 0) || 0) + 1;
  const studentId = childId;
  const doc = clean({
    ...data, studentId, childId, campCode, order,
    status: (data.status ?? 'applied') as EnrollmentStatus,
    parentIds: child.parentIds ?? [],
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: by,
  } as Record<string, unknown>) as unknown as CampEnrollment;
  await enrollmentsCol(campCode).doc(studentId).set(doc);
  if (doc.status === 'confirmed') await rebuildCampRoster(campCode);
  return doc;
}

export async function updateEnrollment(campCode: string, studentId: string, patch: Record<string, unknown>, by: string): Promise<void> {
  const ref = enrollmentsCol(campCode).doc(studentId);
  if (!(await ref.get()).exists) throw new CampStudentError(404, '캠프 참가 정보를 찾을 수 없습니다.');
  const { studentId: _s, childId: _c, campCode: _cc, parentIds: _p, order: _o, ...rest } = patch;
  await ref.set(clean({ ...rest, updatedAt: FieldValue.serverTimestamp(), updatedBy: by }), { merge: true });
  await rebuildCampRoster(campCode);
}

export async function setEnrollmentStatus(campCode: string, studentId: string, status: EnrollmentStatus, by: string): Promise<void> {
  await updateEnrollment(campCode, studentId, { status }, by);
}
