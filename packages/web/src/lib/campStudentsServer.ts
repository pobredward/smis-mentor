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
  childMatchKey, sheetStudentToRecords, campTypeOfCode, buildNormalizedHeaderIndexMap, mapHeadersToStudent,
  isInactiveStudent, parseFamilySheet, getDefaultFieldConfig, isDeviceSheetHeader,
  type ChildProfile, type CampEnrollment, type CampFamily, type EnrollmentStatus, type FamilyParent, type StudentRosterDoc,
  type CampStudent, type STSheetStudent,
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

/** 아이 찾기용 칸 (서버가 맞춘다) — 이름 검색 nameKey · 보호자 번호 phoneDigits · 같은 아이 matchKey */
export function childSearchKeys(name: unknown, parentPhone: unknown): { nameKey: string; phoneDigits: string; matchKey: string | null } {
  return {
    nameKey: String(name ?? '').replace(/\s+/g, ''),
    phoneDigits: String(parentPhone ?? '').replace(/\D/g, ''),
    matchKey: childMatchKey(String(name ?? ''), String(parentPhone ?? '')),
  };
}

/** 학생 번호(문서 id)로 쓸 수 있게 — 슬래시 · 공백 정리 */
export const safeStudentId = (v: unknown) => String(v ?? '').trim().replace(/[/\s]+/g, '-').replace(/^\.+$/, '').slice(0, 100);

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
    ...data, ...childSearchKeys(data.name, data.parentPhone), childId, parentIds: data.parentIds ?? [],
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: by,
  }));
  if (ssn) await setChildSsn(childId, ssn);
  return childId;
}

/** 아이 칸 고치기 → 참가한 캠프 명단 다시 만들기 */
export async function updateChild(childId: string, patch: Partial<ChildProfile>, by: string): Promise<void> {
  const ref = childRef(childId);
  const cur = await ref.get();
  if (!cur.exists) throw new CampStudentError(404, '아이 정보를 찾을 수 없습니다.');
  const { childId: _c, parentIds: _p, ssnMasked: _s, ...rest } = patch;
  const keys = ('name' in rest || 'parentPhone' in rest)
    ? childSearchKeys(rest.name ?? cur.get('name'), rest.parentPhone ?? cur.get('parentPhone'))
    : {};
  await ref.set(clean({ ...rest, ...keys, updatedAt: FieldValue.serverTimestamp(), updatedBy: by }), { merge: true });
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

// ─── 관리자 명단 관리 ─────────────────────────────────────

export type AdminCampStudent = CampStudent & { status: EnrollmentStatus; parentCount: number; hasSsn: boolean; order: number };

/** 캠프의 모든 참가 (신청 · 확정 · 취소) + 아이 정보 — 관리자 화면 */
export async function listCampEnrollments(campCode: string): Promise<{ students: AdminCampStudent[]; families: CampFamily[] }> {
  const [snap, famSnap] = await Promise.all([enrollmentsCol(campCode).get(), familiesCol(campCode).get()]);
  const enrollments = snap.docs.map((d) => ({ ...(d.data() as CampEnrollment), studentId: d.id })).sort(compareEnrollments);
  const children = await getChildren(enrollments.map((e) => e.childId));
  const students = enrollments.map((e) => {
    const c = children.get(e.childId);
    return {
      ...(toCampStudent(c, e) as CampStudent),
      status: e.status,
      order: Number(e.order ?? 0),
      parentCount: (c?.parentIds ?? []).length,
      hasSsn: !!c?.ssnMasked,
    } as AdminCampStudent;
  });
  return { students, families: famSnap.docs.map((d) => ({ ...(d.data() as CampFamily), familyId: d.id })) };
}

async function getChildren(ids: string[]): Promise<Map<string, ChildProfile>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, ChildProfile>();
  for (let i = 0; i < uniq.length; i += 300) {
    const refs = uniq.slice(i, i + 300).map((id) => childRef(id));
    for (const c of await db().getAll(...refs)) if (c.exists) out.set(c.id, { ...(c.data() as ChildProfile), childId: c.id });
  }
  return out;
}

/** 아이 찾기 — 보호자 번호(숫자 7자리 이상) 또는 이름 앞부분 */
export async function searchChildren(q: string, limit = 20): Promise<ChildProfile[]> {
  const text = q.trim();
  if (!text) return [];
  const digits = text.replace(/\D/g, '');
  const col = db().collection(CHILDREN_COLLECTION);
  const snap = digits.length >= 7 && digits.length === text.replace(/[\s-]/g, '').length
    ? await col.where('phoneDigits', '==', digits).limit(limit).get()
    : await col.where('nameKey', '>=', text.replace(/\s+/g, '')).where('nameKey', '<=', text.replace(/\s+/g, '') + '\uf8ff').limit(limit).get();
  return snap.docs.map((d) => ({ ...(d.data() as ChildProfile), childId: d.id }));
}

/** 여러 참가의 상태를 한 번에 → 명단 한 번 다시 만들기 */
export async function setEnrollmentsStatus(campCode: string, studentIds: string[], status: EnrollmentStatus, by: string): Promise<number> {
  const ids = [...new Set(studentIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 400) {
    const batch = db().batch();
    for (const id of ids.slice(i, i + 400)) {
      batch.update(enrollmentsCol(campCode).doc(id), { status, updatedAt: FieldValue.serverTimestamp(), updatedBy: by });
    }
    await batch.commit();
  }
  await bumpRosterRev(campCode);
  await rebuildCampRoster(campCode);
  return ids.length;
}

/** 잘못 넣은 참가 지우기 — 확정된 참가는 먼저 취소해야 한다 */
export async function removeEnrollment(campCode: string, studentId: string): Promise<void> {
  const ref = enrollmentsCol(campCode).doc(studentId);
  const cur = await ref.get();
  if (!cur.exists) throw new CampStudentError(404, '캠프 참가 정보를 찾을 수 없습니다.');
  if (cur.get('status') === 'confirmed') throw new CampStudentError(409, '확정된 학생은 먼저 취소한 뒤 지울 수 있습니다.');
  await ref.delete();
}

// ─── 엑셀 · 시트 붙여넣기로 한꺼번에 넣기 ────────────────────────

export type ImportAction = 'create' | 'enroll' | 'update' | 'skip';
export interface ImportRowResult {
  row: number;
  name: string;
  grade?: string;
  familyId?: string;
  action: ImportAction;
  reason?: string;
  studentId?: string;
  childId?: string;
}
export interface ImportResult {
  campCode: string;
  isFamily: boolean;
  headers: string[];
  rows: ImportRowResult[];
  counts: Record<ImportAction, number>;
  families?: number;
  applied: boolean;
}

type Planned = ImportRowResult & {
  child: Partial<ChildProfile>;
  enrollment: Partial<CampEnrollment>;
  ssn: string | null;
  matchKey: string | null;
};

/**
 * 붙여넣은 표(1행 헤더 — 예전 ST 시트와 같은 헤더)를 캠프 명단에 넣는다.
 *  - 고유번호가 이미 이 캠프에 있으면 그 학생을 고친다
 *  - 이름 + 보호자 번호가 같은 아이가 있으면 그 아이로 (다른 캠프에 왔던 아이)
 *  - 없으면 새 아이
 *  - 이월 · 취소(성별 MM/FF, 학년 G55 등) · 빈 줄은 건너뛴다
 *  - 값이 빈 칸은 기존 값을 지우지 않는다. 주민번호는 13자리일 때만 (암호화)
 * dryRun 이면 쓰지 않고 줄마다 무엇을 할지만 돌려준다.
 */
export async function importCampStudents(
  campCode: string,
  table: string[][],
  by: string,
  opts: { dryRun: boolean; status?: EnrollmentStatus },
): Promise<ImportResult> {
  if (!Array.isArray(table) || table.length < 2) throw new CampStudentError(400, '1행 헤더와 학생 줄이 필요합니다.');
  if (table.length > 2001) throw new CampStudentError(400, '한 번에 2,000줄까지 넣을 수 있습니다.');
  const campType = campTypeOfCode(campCode);
  const isFamily = campType === 'F';
  const headers = (table[0] ?? []).map((h) => String(h ?? '').trim());
  const status: EnrollmentStatus = opts.status ?? 'confirmed';

  // 지금 캠프 참가
  const existing = (await enrollmentsCol(campCode).get()).docs.map((d) => ({ ...(d.data() as CampEnrollment), studentId: d.id }));
  const byStudentId = new Map(existing.map((e) => [e.studentId, e] as const));
  const byChildId = new Map(existing.map((e) => [e.childId, e] as const));
  let nextOrder = existing.reduce((m, e) => Math.max(m, Number(e.order ?? 0)), 0) + 1;

  // 줄 → 학생
  const sheetStudents: Array<{ row: number; s: STSheetStudent & Record<string, unknown>; familyId?: string }> = [];
  const familyDocs: Array<{ family: CampFamily; ssn: Record<string, string> }> = [];
  const skipped: ImportRowResult[] = [];

  if (isFamily) {
    const families = parseFamilySheet(table.map((r) => r.map((c) => String(c ?? ''))), campCode);
    families.forEach((f, fi) => {
      const ssn: Record<string, string> = {};
      const parents = (f.parents ?? []).map((p) => {
        const d = String(p.ssn ?? '').replace(/\D/g, '');
        if (d.length === 13) ssn[p.id] = `${d.slice(0, 6)}-${d.slice(6)}`;
        return { ...p, ssn: p.ssn ? maskSsnForStaff(p.ssn) : undefined };
      });
      familyDocs.push({ family: { familyId: f.familyId, familyType: f.familyType ?? '', parents, roomNumber: f.roomNumber ?? '', order: f.rowNumber ?? fi + 1 }, ssn });
      for (const fs of f.students ?? []) {
        sheetStudents.push({
          row: f.rowNumber ?? 0,
          familyId: f.familyId,
          s: {
            studentId: fs.id, name: fs.name, englishName: fs.englishName ?? '', grade: fs.grade ?? '', gender: fs.gender,
            ssn: fs.ssn ?? '', passportName: fs.passportName ?? '', passportNumber: fs.passportNumber ?? '', passportExpiry: fs.passportExpiry ?? '',
            medication: fs.medication ?? '', parentPhone: fs.parentPhone || f.parents?.[0]?.phone || '', parentName: f.parents?.[0]?.name ?? '',
            registrationSource: fs.registrationSource ?? '', classNumber: fs.classNumber ?? '', className: fs.className ?? '',
            classMentor: fs.classMentor ?? '', roomNumber: f.roomNumber ?? '', familyId: f.familyId,
          } as unknown as STSheetStudent & Record<string, unknown>,
        });
      }
    });
  } else {
    const headerIndexMap = buildNormalizedHeaderIndexMap(headers);
    if (headerIndexMap['학생 이름'] === undefined) throw new CampStudentError(400, '"학생 이름" 헤더가 없습니다. 1행에 예전 ST 시트와 같은 헤더를 넣어주세요.');
    const cfg = await db().collection('stSheetFieldConfig').doc(campType).get();
    const sections = cfg.data()?.sections ?? getDefaultFieldConfig(campType).sections;
    const dynamicHeaders: string[] = [];
    for (const section of sections) for (const field of section.fields ?? []) {
      if (!field.isLegacy && field.sheetHeader && !isDeviceSheetHeader(field.sheetHeader)) dynamicHeaders.push(field.sheetHeader);
    }
    table.slice(1).forEach((raw, i) => {
      const rowNo = i + 2;
      const row = raw.map((c) => String(c ?? ''));
      const s = mapHeadersToStudent(row, headerIndexMap, rowNo, campCode, campType) as STSheetStudent & Record<string, unknown>;
      if (!s.name?.trim()) return;
      const df: Record<string, string> = {};
      for (const h of dynamicHeaders) {
        const idx = headerIndexMap[h];
        const v = idx !== undefined ? row[idx]?.trim() : '';
        if (v) df[h] = v;
      }
      if (Object.keys(df).length) s.displayFields = df;
      if (isInactiveStudent(s)) { skipped.push({ row: rowNo, name: s.name, grade: s.grade, action: 'skip', reason: '이월 · 취소' }); return; }
      if (!headers.includes('성별') || !String(row[headerIndexMap['성별']] ?? '').trim()) delete (s as Record<string, unknown>).gender;
      sheetStudents.push({ row: rowNo, s });
    });
  }

  // 같은 아이 찾기 (이름 + 보호자 번호)
  const keys = [...new Set(sheetStudents.map(({ s }) => childMatchKey(s.name, s.parentPhone)).filter((k): k is string => !!k))];
  const childByKey = new Map<string, ChildProfile>();
  for (let i = 0; i < keys.length; i += 30) {
    const snap = await db().collection(CHILDREN_COLLECTION).where('matchKey', 'in', keys.slice(i, i + 30)).get();
    for (const d of snap.docs) if (!childByKey.has(d.get('matchKey'))) childByKey.set(d.get('matchKey'), { ...(d.data() as ChildProfile), childId: d.id });
  }

  const plans: Planned[] = [];
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  for (const { row, s, familyId } of sheetStudents) {
    const { child, enrollment, ssn } = sheetStudentToRecords(s);
    if (familyId) enrollment.familyId = familyId;
    const matchKey = childMatchKey(s.name, s.parentPhone);
    const sheetId = safeStudentId(s.studentId);
    const base = { row, name: s.name, grade: s.grade, familyId, child, enrollment, ssn, matchKey };
    if ((matchKey && seenKeys.has(matchKey)) || (sheetId && seenIds.has(sheetId))) {
      plans.push({ ...base, action: 'skip', reason: '표 안에서 중복' });
      continue;
    }
    if (matchKey) seenKeys.add(matchKey);
    if (sheetId) seenIds.add(sheetId);
    const known = matchKey ? childByKey.get(matchKey) : undefined;
    const enrolled = (sheetId && byStudentId.get(sheetId)) || (known && byChildId.get(known.childId));
    if (enrolled) {
      plans.push({ ...base, action: 'update', studentId: enrolled.studentId, childId: enrolled.childId });
    } else if (known) {
      plans.push({ ...base, action: 'enroll', childId: known.childId, studentId: sheetId && !byStudentId.has(sheetId) ? sheetId : known.childId });
    } else {
      const childId = newChildId();
      plans.push({ ...base, action: 'create', childId, studentId: sheetId && !byStudentId.has(sheetId) ? sheetId : childId });
    }
  }

  const rows: ImportRowResult[] = [...skipped, ...plans.map(({ child: _c, enrollment: _e, ssn: _s, matchKey: _m, ...r }) => r)]
    .sort((a, b) => a.row - b.row);
  const counts = { create: 0, enroll: 0, update: 0, skip: 0 } as Record<ImportAction, number>;
  rows.forEach((r) => { counts[r.action]++; });
  const result: ImportResult = { campCode, isFamily, headers, rows, counts, families: isFamily ? familyDocs.length : undefined, applied: false };
  if (opts.dryRun) return result;

  // 쓰기 — 400개씩 묶어서
  const now = FieldValue.serverTimestamp();
  let batch = db().batch();
  let n = 0;
  const flush = async () => { if (n) { await batch.commit(); batch = db().batch(); n = 0; } };
  const put = async (fn: (b: FirebaseFirestore.WriteBatch) => void) => { fn(batch); n++; if (n >= 400) await flush(); };

  for (const { family, ssn } of familyDocs) {
    await put((b) => b.set(familiesCol(campCode).doc(family.familyId), JSON.parse(JSON.stringify({ ...family, updatedAt: new Date().toISOString(), updatedBy: by })), { merge: true }));
    if (Object.keys(ssn).length) {
      const entries = Object.fromEntries(Object.entries(ssn).map(([pid, v]) => [pid, { ssnEnc: encryptRRN(v) }]));
      await put((b) => b.set(familyIdentityRef(campCode, family.familyId), { entries }, { merge: true }));
    }
  }
  for (const p of plans) {
    if (p.action === 'skip' || !p.childId || !p.studentId) continue;
    const childData = clean({ ...p.child, ...(p.ssn ? { ssnMasked: maskSsnForStaff(p.ssn) } : {}) } as Record<string, unknown>);
    if (p.action === 'create') {
      await put((b) => b.set(childRef(p.childId!), clean({
        ...childData, ...childSearchKeys(p.child.name, p.child.parentPhone), childId: p.childId, parentIds: [],
        createdAt: now, updatedAt: now, createdBy: by,
      })));
    } else {
      const known = childByKey.get(p.matchKey ?? '');
      const name = p.child.name ?? known?.name;
      const phone = p.child.parentPhone ?? known?.parentPhone;
      await put((b) => b.set(childRef(p.childId!), clean({ ...childData, ...childSearchKeys(name, phone), updatedAt: now, updatedBy: by }), { merge: true }));
    }
    if (p.ssn) await put((b) => b.set(identityRef(p.childId!), { ssnEnc: encryptRRN(p.ssn!), updatedAt: now }));
    if (p.action === 'update') {
      await put((b) => b.set(enrollmentsCol(campCode).doc(p.studentId!), clean({ ...p.enrollment, updatedAt: now, updatedBy: by } as Record<string, unknown>), { merge: true }));
    } else {
      const parentIds = (p.action === 'enroll' ? childByKey.get(p.matchKey ?? '')?.parentIds : undefined) ?? [];
      await put((b) => b.set(enrollmentsCol(campCode).doc(p.studentId!), clean({
        ...p.enrollment, studentId: p.studentId, childId: p.childId, campCode, status, order: nextOrder++, parentIds,
        createdAt: now, updatedAt: now, createdBy: by,
      } as Record<string, unknown>)));
    }
  }
  await put((b) => b.set(db().collection('campSettings').doc(campCode), { availableHeaders: headers.filter(Boolean), headersUpdatedAt: new Date().toISOString() }, { merge: true }));
  await flush();
  await bumpRosterRev(campCode);
  await rebuildCampRoster(campCode);
  return { ...result, applied: true };
}
