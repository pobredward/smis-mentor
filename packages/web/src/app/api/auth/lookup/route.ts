import { getAdminFirestore } from '@/lib/firebase-admin';
import { normalizeProviderId } from '@/lib/socialProof';
import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 로그인/가입 플로우용 사용자 조회 (비로그인 허용)
 *
 * Firestore 규칙에서 users 컬렉션의 비인증 list 를 막는 대신, 가입·로그인 화면이 필요로 하던
 * 이메일/전화/원어민 이름/소셜 제공자 조회를 이 라우트가 Admin SDK로 대신한다.
 *  - 반환 필드는 화이트리스트로 제한 (민감정보·평가·토큰 등 제외)
 *  - temp 문서(가입 완료 전 임시 계정)에만 가입 이관에 필요한 추가 필드 포함
 *  - 간단한 IP 기반 속도 제한
 */
const WINDOW_MS = 60_000;
const LIMIT = 40;
const hits = new Map<string, { n: number; t: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cur = hits.get(ip);
  if (!cur || now - cur.t > WINDOW_MS) {
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  cur.n += 1;
  return cur.n > LIMIT;
}

const BASE_FIELDS = [
  'userId', 'id', 'email', 'name', 'phoneNumber', 'phone', 'role', 'status',
  'primaryAuthMethod', 'profileImage', 'createdAt', 'updatedAt',
];
// temp 문서 → 새 uid 문서로 이관할 때 복사하는 필드
const TEMP_EXTRA_FIELDS = [
  'jobExperiences', 'selfIntroduction', 'jobMotivation', 'feedback', 'university', 'grade',
  'major1', 'major2', 'isOnLeave', 'address', 'addressDetail', 'partTimeJobs', 'foreignTeacher',
  'dateOfBirth', 'gender', 'age',
];

function encodeValue(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === 'object') {
    const anyV = v as any;
    if (typeof anyV.toMillis === 'function') return { __ts: anyV.toMillis() };
    if (Array.isArray(v)) return v.map(encodeValue);
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = encodeValue(val);
    return out;
  }
  return v;
}

function sanitize(id: string, data: Record<string, unknown>) {
  const isTemp = data.status === 'temp';
  const out: Record<string, unknown> = { userId: id, id };
  for (const f of BASE_FIELDS) if (f in data) out[f] = encodeValue(data[f]);
  if (Array.isArray(data.authProviders)) {
    out.authProviders = (data.authProviders as Array<Record<string, unknown>>).map((p) => ({
      providerId: p.providerId,
      uid: p.uid,
      ...(p.email ? { email: p.email } : {}),
      ...(p.displayName ? { displayName: p.displayName } : {}),
    }));
  }
  if (data.foreignTeacher && typeof data.foreignTeacher === 'object' && !isTemp) {
    const ft = data.foreignTeacher as Record<string, unknown>;
    out.foreignTeacher = { firstName: ft.firstName, lastName: ft.lastName, middleName: ft.middleName, countryCode: ft.countryCode };
  }
  if (isTemp) for (const f of TEMP_EXTRA_FIELDS) if (f in data) out[f] = encodeValue(data[f]);
  // 탈퇴·삭제 계정: 복구 화면에서 본인 이름 확인용 (이메일은 가린다)
  if (data.status === 'inactive' || data.status === 'deleted') {
    if (typeof data.originalName === 'string') out.originalName = data.originalName;
    delete out.email;
  }
  return out;
}

type Doc = FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot;
const notDeleted = (d: Doc) => d.data()?.status !== 'deleted';
const notInactive = (d: Doc) => { const s = d.data()?.status; return s !== 'deleted' && s !== 'inactive'; };
const pickByPriority = (docs: Doc[]) =>
  docs.find((d) => d.data()?.status === 'active') ||
  docs.find((d) => d.data()?.status === 'temp') ||
  docs[0];

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (rateLimited(ip)) {
      return NextResponse.json({ error: { status: 'RESOURCE_EXHAUSTED', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' } }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const by = body?.by;
    const db = getAdminFirestore();
    const users = db.collection('users');
    let found: Doc | undefined;

    if (by === 'email') {
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      if (!email) return bad();
      const variants = Array.from(new Set([email, email.toLowerCase()]));
      const snaps = await Promise.all(variants.map((e) => users.where('email', '==', e).limit(10).get()));
      const docs = snaps.flatMap((s) => s.docs);
      const filtered = body.includeInactive ? docs.filter(notDeleted) : docs.filter(notInactive);
      found = pickByPriority(filtered);
    } else if (by === 'phone') {
      const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
      if (!phone) return bad();
      // phoneNumber 우선, 구버전 phone 필드 폴백 (모바일 조회 로직과 동일)
      const [snap1, snap2] = await Promise.all([
        users.where('phoneNumber', '==', phone).limit(10).get(),
        users.where('phone', '==', phone).limit(10).get(),
      ]);
      if (body.includeDeleted) {
        // 탈퇴·삭제 계정 복구 안내용 — 우선순위 active > temp > inactive > deleted
        const all = [...snap1.docs, ...snap2.docs];
        found = pickByPriority(all.filter(notInactive)) || all.find((d) => d.data()?.status === 'inactive') || all[0];
      } else {
        found = pickByPriority(snap1.docs.filter(notInactive)) || pickByPriority(snap2.docs.filter(notInactive));
      }
    } else if (by === 'foreignName') {
      const first = typeof body.firstName === 'string' ? body.firstName.trim() : '';
      const last = typeof body.lastName === 'string' ? body.lastName.trim() : '';
      if (!first || !last) return bad();
      const snap = await users
        .where('foreignTeacher.firstName', '==', first)
        .where('foreignTeacher.lastName', '==', last)
        .limit(10)
        .get();
      found = pickByPriority(snap.docs.filter(notDeleted));
    } else if (by === 'social') {
      const providerId = normalizeProviderId(body.providerId);
      const providerUid = typeof body.providerUid === 'string' ? body.providerUid : '';
      if (!providerId || !providerUid) return bad();
      for (const status of ['active', 'temp']) {
        const snap = await users.where('status', '==', status).select('authProviders').get();
        const hit = snap.docs.find((d) => {
          const arr = d.data().authProviders;
          return Array.isArray(arr) && arr.some((p: any) => normalizeProviderId(p?.providerId) === providerId && String(p?.uid ?? '') === providerUid);
        });
        if (hit) { found = await users.doc(hit.id).get(); break; }
      }
    } else if (by === 'id') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      if (!id) return bad();
      const d = await users.doc(id).get();
      // 비로그인 id 조회는 가입 이관용 temp 문서만 허용
      if (d.exists && d.data()?.status === 'temp') found = d;
    } else {
      return bad();
    }

    if (!found || !found.exists) return NextResponse.json({ user: null });
    return NextResponse.json({ user: sanitize(found.id, found.data() as Record<string, unknown>) });
  } catch (error) {
    logger.error('❌ 사용자 조회(lookup) 실패:', error);
    return NextResponse.json({ error: { status: 'INTERNAL', message: '사용자 조회에 실패했습니다.' } }, { status: 500 });
  }
}

function bad() {
  return NextResponse.json({ error: { status: 'INVALID_ARGUMENT', message: '조회 조건이 올바르지 않습니다.' } }, { status: 400 });
}
