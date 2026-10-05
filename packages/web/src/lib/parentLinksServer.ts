/**
 * 학부모 ↔ 아이 연결 (관리자 전용, Admin SDK)
 * parentLinks/{학부모 uid} = { children: [{ campCode, studentId, studentName, linkedAt, linkedBy }] }
 * 학부모 본인은 규칙으로 자기 문서만 읽는다. 쓰기는 이 서버만.
 */
import { getAdminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { normalizePhoneForMatch, PARENT_LINKS_COLLECTION, type ParentChildLink, type ParentLinksDoc } from '@smis-mentor/shared';

export class ParentLinkError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Doc = Record<string, any>;

/** 연결 화면에서 고르는 학생 — 연락처는 돌려주지 않고 번호가 같은지만 알려 준다 */
export interface LinkCandidate {
  studentId: string;
  name: string;
  grade: string;
  /** 학생 명단의 보호자 번호가 학부모 계정 번호와 같음 */
  phoneMatch: boolean;
}

/** 캠프 학생 명단 (일반 캠프 stSheetCache.data · 가족 캠프 familySTSheetCache.families[].students) */
async function readCampStudents(campCode: string): Promise<Doc[]> {
  const db = getAdminFirestore();
  const [cache, family] = await Promise.all([
    db.collection('stSheetCache').doc(campCode).get(),
    db.collection('familySTSheetCache').doc(campCode).get(),
  ]);
  if (cache.exists) {
    const data = cache.data()?.data;
    return Array.isArray(data) ? data : [];
  }
  if (family.exists) {
    const families = family.data()?.families;
    return Array.isArray(families) ? families.flatMap((f: Doc) => (Array.isArray(f.students) ? f.students : [])) : [];
  }
  return [];
}

async function loadParent(parentUid: string): Promise<Doc> {
  const snap = await getAdminFirestore().collection('users').doc(parentUid).get();
  const d = snap.data();
  if (!snap.exists || !d) throw new ParentLinkError(404, '사용자를 찾을 수 없습니다.');
  if (d.role !== 'parent') throw new ParentLinkError(400, '학부모 계정이 아닙니다.');
  return d;
}

export async function getParentLinks(parentUid: string): Promise<ParentChildLink[]> {
  const snap = await getAdminFirestore().collection(PARENT_LINKS_COLLECTION).doc(parentUid).get();
  const children = (snap.data() as ParentLinksDoc | undefined)?.children;
  return Array.isArray(children) ? children : [];
}

/** 캠프 학생 목록 — 보호자 번호가 학부모 번호와 같은 학생을 앞에 */
export async function listLinkCandidates(parentUid: string, campCode: string): Promise<LinkCandidate[]> {
  const parent = await loadParent(parentUid);
  const want = normalizePhoneForMatch(parent.phoneNumber);
  const students = await readCampStudents(campCode);
  return students
    .filter((s) => s && s.studentId && s.name)
    .map((s) => ({
      studentId: String(s.studentId),
      name: String(s.name),
      grade: String(s.grade ?? ''),
      phoneMatch: !!want && [s.parentPhone, s.otherPhone].some((p) => normalizePhoneForMatch(p) === want),
    }))
    .sort((a, b) => Number(b.phoneMatch) - Number(a.phoneMatch) || a.name.localeCompare(b.name, 'ko'));
}

export async function addParentLink(parentUid: string, campCode: string, studentId: string, adminUid: string): Promise<ParentChildLink[]> {
  await loadParent(parentUid);
  const student = (await readCampStudents(campCode)).find((s) => String(s?.studentId ?? '') === studentId);
  if (!student) throw new ParentLinkError(404, '그 캠프 명단에 없는 학생입니다.');
  const ref = getAdminFirestore().collection(PARENT_LINKS_COLLECTION).doc(parentUid);
  return getAdminFirestore().runTransaction(async (tx) => {
    const cur = ((await tx.get(ref)).data() as ParentLinksDoc | undefined)?.children ?? [];
    if (cur.some((c) => c.campCode === campCode && c.studentId === studentId)) return cur;
    const next: ParentChildLink[] = [
      ...cur,
      { campCode, studentId, studentName: String(student.name ?? ''), linkedAt: new Date().toISOString(), linkedBy: adminUid },
    ];
    tx.set(ref, { children: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
}

export async function removeParentLink(parentUid: string, campCode: string, studentId: string): Promise<ParentChildLink[]> {
  const ref = getAdminFirestore().collection(PARENT_LINKS_COLLECTION).doc(parentUid);
  return getAdminFirestore().runTransaction(async (tx) => {
    const cur = ((await tx.get(ref)).data() as ParentLinksDoc | undefined)?.children ?? [];
    const next = cur.filter((c) => !(c.campCode === campCode && c.studentId === studentId));
    if (next.length !== cur.length) tx.set(ref, { children: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
}
