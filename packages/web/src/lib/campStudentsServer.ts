/**
 * 학생 정보 원본 (아이 · 캠프 참가 · 명단) — 서버 전용 (Admin SDK)
 * 모든 쓰기는 여기를 거친다. 참가나 아이가 바뀌면 그 캠프의 목록용 명단(roster/current)을 다시 만든다.
 */
import { randomUUID } from 'crypto';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { encryptRRN, decryptRRN } from '@/lib/encryption';
import {
  CHILDREN_COLLECTION, CAMPS_COLLECTION, ENROLLMENTS_SUBCOLLECTION, ROSTER_SUBCOLLECTION, ROSTER_DOC_ID, FAMILIES_SUBCOLLECTION,
  ST_DETAIL_FIELDS, toRosterStudent, toCampStudent, buildFamilyUnits, compareEnrollments, maskSsnForStaff,
  type ChildProfile, type CampEnrollment, type CampFamily, type EnrollmentStatus, type FamilyParent, type StudentRosterDoc,
} from '@smis-mentor/shared';

export class CampStudentError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const db = () => getAdminFirestore();
export const childRef = (childId: string) => db().collection(CHILDREN_COLLECTION).doc(childId);
export const identityRef = (childId: string) => childRef(childId).collection('private').doc('identity');
export const enrollmentsCol = (campCode: string) => db().collection(CAMPS_COLLECTION).doc(campCode).collection(ENROLLMENTS_SUBCOLLECTION);
export const campRef = (campCode: string) => db().collection(CAMPS_COLLECTION).doc(campCode);
export const rosterRef = (campCode: string) => campRef(campCode).collection(ROSTER_SUBCOLLECTION).doc(ROSTER_DOC_ID);
export const familiesCol = (campCode: string) => campRef(campCode).collection(FAMILIES_SUBCOLLECTION);
export const familyIdentityRef = (campCode: string, familyId: string) => familiesCol(campCode).doc(familyId).collection('private').doc('identity');

/** Firestore 에 넣을 수 있게 — undefined 빼기 */
const clean = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export const newChildId = () => randomUUID().replace(/-/g, '').slice(0, 20);

// ─── 명단 ───────────────────────────────────────────────
// 명단에 보이는 값이 바뀌는 쓰기는 camps/{캠프}.rosterRev 를 올린다. 명단을 다 만든 뒤 그 사이 rosterRev 가 바뀌었으면
// (다른 쓰기가 끼어들었으면) 다시 만든다 → 동시에 고쳐도 마지막 명단이 옛 값으로 덮이지 않는다.

const DETAIL_SET = new Set<string>(ST_DETAIL_FIELDS);
/** 명단에 안 보이는 칸(설문 · 테스트 · 상담 · 주소 …)만 바꿨으면 명단을 다시 만들 필요가 없다 */
export const touchesRoster = (keys: string[]) => keys.some((k) => !DETAIL_SET.has(k));

export const bumpRosterRev = (campCode: string) =>
  campRef(campCode).set({ campCode, rosterRev: FieldValue.increment(1) }, { merge: true });

async function buildRoster(campCode: string): Promise<StudentRosterDoc> {
  const [snap, famSnap] = await Promise.all([
    enrollmentsCol(campCode).where('status', '==', 'confirmed').get(),
    familiesCol(campCode).get(),
  ]);
  const enrollments = snap.docs.map((d) => ({ ...(d.data() as CampEnrollment), studentId: d.id })).sort(compareEnrollments);
  const childIds = [...new Set(enrollments.map((e) => e.childId).filter(Boolean))];
  const children = new Map<string, ChildProfile>();
  for (let i = 0; i < childIds.length; i += 300) {
    const refs = childIds.slice(i, i + 300).map((id) => childRef(id));
    if (!refs.length) continue;
    for (const c of await db().getAll(...refs)) if (c.exists) children.set(c.id, { ...(c.data() as ChildProfile), childId: c.id });
  }
  const families = famSnap.docs.map((d) => ({ ...(d.data() as CampFamily), familyId: d.id }));
  const familyById = new Map(families.map((f) => [f.familyId, f] as const));
  const withFamily = (row: Record<string, unknown>, e: CampEnrollment) => {
    const f = e.familyId ? familyById.get(e.familyId) : undefined;
    if (!f) return row;
    return { ...row, familyId: f.familyId, familyType: f.familyType ?? '', roomNumber: (row.roomNumber as string) || f.roomNumber || '' };
  };
  const students = enrollments.map((e) => clean(withFamily(toRosterStudent(children.get(e.childId), e) as unknown as Record<string, unknown>, e)));
  const updatedAt = new Date().toISOString();
  const out: StudentRosterDoc = { campCode, students: students as unknown as StudentRosterDoc['students'], total: students.length, updatedAt };
  if (families.length) {
    const full = enrollments.map((e) => withFamily(toCampStudent(children.get(e.childId), e) as unknown as Record<string, unknown>, e));
    out.families = buildFamilyUnits(families, full as unknown as StudentRosterDoc['students'], campCode, updatedAt);
  }
  // 배열 안의 undefined 까지 빼기 (Firestore 는 undefined 를 못 넣는다)
  return JSON.parse(JSON.stringify(out)) as StudentRosterDoc;
}

/** 캠프 목록용 명단 다시 만들기 — 확정된 참가만, 참가 순서대로 (가족 캠프는 families 도) */
export async function rebuildCampRoster(campCode: string): Promise<number> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const rev = (await campRef(campCode).get()).get('rosterRev') ?? 0;
    const roster = await buildRoster(campCode);
    const ok = await db().runTransaction(async (tx) => {
      const cur = (await tx.get(campRef(campCode))).get('rosterRev') ?? 0;
      if (cur !== rev) return false;
      tx.set(rosterRef(campCode), { ...roster, rosterRev: rev });
      return true;
    });
    if (ok) return roster.total;
  }
  throw new CampStudentError(409, '명단을 만드는 동안 계속 바뀌었습니다. 잠시 뒤 다시 시도해주세요.');
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
  if (!touchesRoster(Object.keys(rest))) return;
  const camps = await campsOfChild(childId);
  await Promise.all(camps.map(bumpRosterRev));
  await Promise.all(camps.map(rebuildCampRoster));
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
  if (doc.status === 'confirmed') {
    await bumpRosterRev(campCode);
    await rebuildCampRoster(campCode);
  }
  return doc;
}

export async function updateEnrollment(campCode: string, studentId: string, patch: Record<string, unknown>, by: string): Promise<void> {
  const ref = enrollmentsCol(campCode).doc(studentId);
  if (!(await ref.get()).exists) throw new CampStudentError(404, '캠프 참가 정보를 찾을 수 없습니다.');
  const { studentId: _s, childId: _c, campCode: _cc, parentIds: _p, order: _o, ...rest } = patch;
  await ref.set(clean({ ...rest, updatedAt: FieldValue.serverTimestamp(), updatedBy: by }), { merge: true });
  if (!touchesRoster(Object.keys(rest))) return;
  await bumpRosterRev(campCode);
  await rebuildCampRoster(campCode);
}

export async function setEnrollmentStatus(campCode: string, studentId: string, status: EnrollmentStatus, by: string): Promise<void> {
  await updateEnrollment(campCode, studentId, { status }, by);
}

// ─── 가족 캠프 ───────────────────────────────────────────

/** 가족 만들기 · 고치기 (보호자 주민번호는 가린 값만 — 원본은 setFamilyMemberSsn) */
export async function upsertFamily(campCode: string, familyId: string, data: Partial<CampFamily>, by: string): Promise<void> {
  const id = familyId.trim();
  if (!id) throw new CampStudentError(400, '가족 번호가 필요합니다.');
  const parents = (data.parents ?? undefined)?.map((p: FamilyParent) => ({ ...p, ssn: p.ssn ? maskSsnForStaff(p.ssn) : undefined }));
  await familiesCol(campCode).doc(id).set(
    JSON.parse(JSON.stringify({ ...data, parents, familyId: id, updatedAt: new Date().toISOString(), updatedBy: by })),
    { merge: true },
  );
  await bumpRosterRev(campCode);
  await rebuildCampRoster(campCode);
}

export async function setFamilyMemberSsn(campCode: string, familyId: string, personId: string, ssn: string): Promise<void> {
  const digits = ssn.replace(/\D/g, '');
  if (digits.length !== 13) throw new CampStudentError(400, '주민등록번호 13자리를 확인해주세요.');
  const formatted = `${digits.slice(0, 6)}-${digits.slice(6)}`;
  await familyIdentityRef(campCode, familyId).set({ entries: { [personId]: { ssnEnc: encryptRRN(formatted) } } }, { merge: true });
}

// ─── 주민번호 원본 (관리자 · 내원 인솔자) ─────────────────────

/**
 * 원본 주민번호 — key 는 학생 번호(캠프 참가 id) 또는 가족 보호자 "가족번호__보호자번호".
 * 학생은 참가 → 아이 → private/identity, 보호자는 가족 private/identity.
 */
export async function readSsnByKey(campCode: string, key: string): Promise<string | null> {
  const sep = key.indexOf('__');
  if (sep > 0) {
    const familyId = key.slice(0, sep);
    const personId = key.slice(sep + 2);
    const enr = await getEnrollment(campCode, personId);
    if (enr?.childId) return readChildSsn(enr.childId);
    const fam = await familyIdentityRef(campCode, familyId).get();
    // 보호자 번호에 점이 있어(P01.1) 필드 경로로 읽지 않고 맵에서 꺼낸다
    const enc = (fam.get('entries') as Record<string, { ssnEnc?: string }> | undefined)?.[personId]?.ssnEnc;
    return typeof enc === 'string' && enc ? decryptRRN(enc) : null;
  }
  const enr = await getEnrollment(campCode, key);
  return enr?.childId ? readChildSsn(enr.childId) : null;
}
