/**
 * 학부모 ↔ 아이 (서버 전용, Admin SDK)
 * 연결은 아이 문서의 parentIds (+ 그 아이 캠프 참가 문서들의 parentIds). 쓰기는 서버만.
 *  - 관리자: 학부모 계정에 아이 연결 · 해제 (/api/admin/parent-links)
 *  - 학부모: 아이 등록 · 고치기, 캠프 신청 (/api/parent/*)
 */
import { getAdminFirestore } from '@/lib/firebase-admin';
import {
  CHILDREN_COLLECTION, ENROLLMENTS_SUBCOLLECTION, PARENT_EDITABLE_CHILD_FIELDS, PARENT_EDITABLE_ENROLLMENT_FIELDS,
  PARENT_EDITABLE_AFTER_CONFIRM, campTypeOfCode, applicationQuestionsFor, normalizePhoneForMatch, childMatchKey,
  type ChildProfile, type CampEnrollment, type OpenCamp,
} from '@smis-mentor/shared';
import {
  CampStudentError, campRef, childRef, createChild, createEnrollment, getChild, getEnrollment, removeEnrollment,
  searchChildren, setChildParent, setChildSsn, updateChild, updateEnrollment,
} from '@/lib/campStudentsServer';

export { CampStudentError as ParentLinkError };

type Doc = Record<string, any>;
const db = () => getAdminFirestore();

/** 학부모 계정에 연결된 아이 하나 — 관리자 화면 */
export interface LinkedChild {
  childId: string;
  name: string;
  englishName?: string;
  birthDate?: string;
  camps: Array<{ campCode: string; status: string }>;
}

/** 연결 후보 — 보호자 번호가 학부모 번호와 같은지만 알려 준다 (연락처는 주지 않는다) */
export interface LinkCandidate {
  childId: string;
  name: string;
  birthDate: string;
  camps: string[];
  phoneMatch: boolean;
  linked: boolean;
}

async function loadParent(parentUid: string): Promise<Doc> {
  const snap = await db().collection('users').doc(parentUid).get();
  const d = snap.data();
  if (!snap.exists || !d) throw new CampStudentError(404, '사용자를 찾을 수 없습니다.');
  if (d.role !== 'parent') throw new CampStudentError(400, '학부모 계정이 아닙니다.');
  return d;
}

async function campsOf(childIds: string[]): Promise<Map<string, Array<{ campCode: string; status: string }>>> {
  const out = new Map<string, Array<{ campCode: string; status: string }>>();
  for (let i = 0; i < childIds.length; i += 30) {
    const ids = childIds.slice(i, i + 30);
    if (!ids.length) continue;
    const snap = await db().collectionGroup(ENROLLMENTS_SUBCOLLECTION).where('childId', 'in', ids).get();
    for (const d of snap.docs) {
      const cid = String(d.get('childId'));
      if (!out.has(cid)) out.set(cid, []);
      out.get(cid)!.push({ campCode: String(d.get('campCode') || d.ref.parent.parent?.id || ''), status: String(d.get('status') ?? '') });
    }
  }
  return out;
}

export async function listParentChildren(parentUid: string): Promise<LinkedChild[]> {
  const snap = await db().collection(CHILDREN_COLLECTION).where('parentIds', 'array-contains', parentUid).get();
  const camps = await campsOf(snap.docs.map((d) => d.id));
  return snap.docs.map((d) => ({
    childId: d.id, name: String(d.get('name') ?? ''), englishName: d.get('englishName') || undefined, birthDate: d.get('birthDate') || undefined,
    camps: camps.get(d.id) ?? [],
  }));
}

/**
 * 연결 후보 — 검색어(이름 · 보호자 번호)가 없으면 학부모 계정 번호와 보호자 번호가 같은 아이들.
 * 번호가 같은 아이가 앞에.
 */
export async function listLinkCandidates(parentUid: string, q: string): Promise<LinkCandidate[]> {
  const parent = await loadParent(parentUid);
  const want = normalizePhoneForMatch(parent.phoneNumber);
  const wantDigits = String(parent.phoneNumber ?? '').replace(/\D/g, '');
  let found: ChildProfile[] = [];
  if (q.trim()) found = await searchChildren(q.trim(), 30);
  else if (wantDigits.length >= 9) {
    // 저장 형식(010-…/010…)이 달라도 찾게 숫자만으로
    const snap = await db().collection(CHILDREN_COLLECTION).where('phoneDigits', '==', wantDigits.startsWith('82') ? `0${wantDigits.slice(2)}` : wantDigits).limit(30).get();
    found = snap.docs.map((d) => ({ ...(d.data() as ChildProfile), childId: d.id }));
  }
  const camps = await campsOf(found.map((c) => c.childId));
  return found
    .map((c) => ({
      childId: c.childId, name: c.name, birthDate: c.birthDate ?? '',
      camps: (camps.get(c.childId) ?? []).map((x) => x.campCode),
      phoneMatch: !!want && [c.parentPhone, c.otherPhone].some((p) => normalizePhoneForMatch(p) === want),
      linked: (c.parentIds ?? []).includes(parentUid),
    }))
    .sort((a, b) => Number(b.phoneMatch) - Number(a.phoneMatch) || a.name.localeCompare(b.name));
}

export async function linkChild(parentUid: string, childId: string, linked: boolean): Promise<LinkedChild[]> {
  if (linked) await loadParent(parentUid);
  await setChildParent(childId, parentUid, linked);
  return listParentChildren(parentUid);
}

// ─── 학부모 본인 ──────────────────────────────────────────

const CHILD_KEYS = new Set<string>(PARENT_EDITABLE_CHILD_FIELDS);
const ENROLL_KEYS = new Set<string>(PARENT_EDITABLE_ENROLLMENT_FIELDS);
const MAX_CHILDREN = 10;

function pick(raw: unknown, keys: Set<string>, max = 2000): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (keys.has(k) && typeof v === 'string') out[k] = v.trim().slice(0, max);
  }
  if (out.gender !== undefined && !['M', 'F'].includes(out.gender)) delete out.gender;
  if (out.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(out.birthDate)) throw new CampStudentError(400, '생년월일은 2015-03-01 처럼 넣어주세요.');
  return out;
}

async function ownChild(uid: string, childId: string): Promise<ChildProfile> {
  const child = await getChild(childId);
  if (!child || !(child.parentIds ?? []).includes(uid)) throw new CampStudentError(404, '아이 정보를 찾을 수 없습니다.');
  return child;
}

/**
 * 아이 등록 — 학부모의 인증된 번호와 이름이 같은 아이가 이미 있으면(예전 캠프 명단에서 옮긴 아이) 새로 만들지 않고 연결한다.
 * @returns childId, 이미 있던 아이와 이어졌는지
 */
export async function parentCreateChild(uid: string, raw: unknown, ssn?: string): Promise<{ childId: string; linkedExisting: boolean }> {
  const me = (await db().collection('users').doc(uid).get()).data() ?? {};
  const fields = pick(raw, CHILD_KEYS);
  if (!fields.name) throw new CampStudentError(400, '아이 이름을 넣어주세요.');
  const mine = await db().collection(CHILDREN_COLLECTION).where('parentIds', 'array-contains', uid).count().get();
  if (mine.data().count >= MAX_CHILDREN) throw new CampStudentError(400, `아이는 ${MAX_CHILDREN}명까지 등록할 수 있습니다.`);
  if (!fields.parentPhone && me.phoneNumber) fields.parentPhone = String(me.phoneNumber);
  if (!fields.parentName && me.name) fields.parentName = String(me.name);

  // 인증된 학부모 번호로만 기존 아이를 잇는다 (입력한 번호로 잇지 않는다 — 남의 아이를 가져가지 못하게)
  const verifiedKey = me.isPhoneVerified ? childMatchKey(fields.name, String(me.phoneNumber ?? '')) : null;
  if (verifiedKey) {
    const hit = await db().collection(CHILDREN_COLLECTION).where('matchKey', '==', verifiedKey).limit(1).get();
    if (!hit.empty) {
      const childId = hit.docs[0].id;
      await setChildParent(childId, uid, true);
      const { name: _n, ...rest } = fields;
      if (Object.keys(rest).length) await updateChild(childId, rest, uid);
      if (ssn) await setChildSsn(childId, ssn);
      return { childId, linkedExisting: true };
    }
  }
  const childId = await createChild({ ...fields, parentIds: [uid] }, uid, ssn || undefined);
  return { childId, linkedExisting: false };
}

export async function parentUpdateChild(uid: string, childId: string, raw: unknown, ssn?: string): Promise<void> {
  await ownChild(uid, childId);
  const fields = pick(raw, CHILD_KEYS);
  if (fields.name === '') throw new CampStudentError(400, '아이 이름을 넣어주세요.');
  if (Object.keys(fields).length) await updateChild(childId, fields, uid);
  if (ssn) await setChildSsn(childId, ssn);
}

/** 학부모 신청을 받는 캠프 */
export async function listOpenCamps(): Promise<OpenCamp[]> {
  const snap = await db().collection('camps').where('applicationOpen', '==', true).get();
  const codes = snap.docs.map((d) => d.id);
  if (!codes.length) return [];
  const jobCodes = new Map<string, Doc>();
  for (let i = 0; i < codes.length; i += 30) {
    const jc = await db().collection('jobCodes').where('code', 'in', codes.slice(i, i + 30)).get();
    jc.docs.forEach((d) => { if (!jobCodes.has(d.get('code'))) jobCodes.set(d.get('code'), d.data()); });
  }
  const iso = (v: any) => (v?.toDate ? v.toDate().toISOString().slice(0, 10) : typeof v === 'string' ? v : null);
  return codes.map((code) => {
    const j = jobCodes.get(code) ?? {};
    return {
      campCode: code, name: String(j.name ?? code), generation: String(j.generation ?? ''), campType: campTypeOfCode(code),
      location: j.location ?? undefined, startDate: iso(j.startDate), endDate: iso(j.endDate),
    };
  }).sort((a, b) => String(a.startDate ?? '').localeCompare(String(b.startDate ?? '')) || a.campCode.localeCompare(b.campCode));
}

function pickApplication(campCode: string, raw: unknown, afterConfirm: boolean): Record<string, string> {
  const allowed = new Set(applicationQuestionsFor(campTypeOfCode(campCode)).map((q) => q.key).filter((k) => ENROLL_KEYS.has(k)));
  const out = pick(raw, allowed, 1000);
  if (afterConfirm) for (const k of Object.keys(out)) if (!PARENT_EDITABLE_AFTER_CONFIRM.has(k)) delete out[k];
  return out;
}

/** 캠프 신청 — 신청을 받는 캠프만, 상태 '신청' */
export async function parentApply(uid: string, campCode: string, childId: string, raw: unknown): Promise<CampEnrollment> {
  await ownChild(uid, childId);
  const camp = await campRef(campCode).get();
  if (!camp.get('applicationOpen')) throw new CampStudentError(400, '지금은 이 캠프 신청을 받지 않습니다.');
  const fields = pickApplication(campCode, raw, false);
  if (!fields.grade) throw new CampStudentError(400, '학년을 넣어주세요.');
  return createEnrollment(campCode, childId, { ...fields, status: 'applied', appliedBy: uid } as Partial<CampEnrollment>, uid);
}

async function ownEnrollment(uid: string, campCode: string, studentId: string): Promise<CampEnrollment> {
  const enr = await getEnrollment(campCode, studentId);
  if (!enr || !(enr.parentIds ?? []).includes(uid)) throw new CampStudentError(404, '신청 내역을 찾을 수 없습니다.');
  return enr;
}

/** 신청서 고치기 — 신청 중엔 모두, 확정 뒤엔 설문 · 단체티만, 취소는 못 고친다 */
export async function parentUpdateApplication(uid: string, campCode: string, studentId: string, raw: unknown): Promise<void> {
  const enr = await ownEnrollment(uid, campCode, studentId);
  if (enr.status === 'cancelled') throw new CampStudentError(400, '취소된 신청은 고칠 수 없습니다.');
  const fields = pickApplication(campCode, raw, enr.status === 'confirmed');
  if (fields.grade === '') throw new CampStudentError(400, '학년을 넣어주세요.');
  if (Object.keys(fields).length) await updateEnrollment(campCode, studentId, fields, uid);
}

/** 신청 철회 — 확정 전까지만 (확정 뒤에는 운영진에게) */
export async function parentWithdraw(uid: string, campCode: string, studentId: string): Promise<void> {
  const enr = await ownEnrollment(uid, campCode, studentId);
  if (enr.status !== 'applied') throw new CampStudentError(409, '확정된 참가는 캠프 운영진에게 취소를 요청해주세요.');
  await removeEnrollment(campCode, studentId);
}
