/**
 * 소셜 신원 연결표 — authIdentities/{제공자}_{제공자 id} → { uid } (서버 전용 · Admin SDK)
 *
 * 한 소셜 계정은 한 사람에게만 연결된다 (문서 id 가 곧 유일성). 규칙은 클라이언트 읽기·쓰기를 모두 막는다.
 *
 * 전환 기간 (옛 앱이 users.authProviders 를 직접 쓰는 동안):
 *  - users.authProviders 가 기준이고, 연결표는 그 색인이다.
 *  - 연결표에서 찾은 uid 의 authProviders 에 그 신원이 없으면(옛 앱에서 연결 해제) 오래된 항목으로 보고 지운다.
 *  - 연결표에 없으면 authProviders 를 한 번 훑어 찾고 연결표를 채운다.
 *  - 새 앱 · 웹(서버 API)은 연결표와 authProviders 를 함께 쓴다.
 * smiscamp 로 옮긴 뒤 authProviders 쓰기를 규칙으로 막으면 연결표가 그대로 기준이 된다.
 */
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from '@smis-mentor/shared';

export const AUTH_IDENTITIES = 'authIdentities';
export type IdentityProvider = 'google' | 'apple' | 'naver' | 'kakao';
const PROVIDERS: IdentityProvider[] = ['google', 'apple', 'naver', 'kakao'];

/** 'google.com' · 'apple.com' · 'apple' · 'naver' · 'kakao' → 연결표 제공자 (그 밖은 null) */
export function identityProviderOf(p: unknown): IdentityProvider | null {
  const n = typeof p === 'string' ? p.replace('.com', '').toLowerCase() : '';
  return (PROVIDERS as string[]).includes(n) ? (n as IdentityProvider) : null;
}

/** users.authProviders 에 적는 제공자 이름 — 구글·애플은 .com (옛 코드와 같게) */
export const storedProviderId = (p: IdentityProvider) => (p === 'google' || p === 'apple' ? `${p}.com` : p);

/** 문서 id — '/' 는 쓸 수 없어 바꾼다 (애플 id 는 '.' 을 포함하지만 괜찮다) */
export const identityKey = (p: IdentityProvider, providerUid: string) => `${p}_${String(providerUid).replace(/\//g, '_')}`;

export interface IdentityRef {
  provider: IdentityProvider;
  providerUid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
}

type ProviderEntry = { providerId?: unknown; uid?: unknown; email?: unknown; displayName?: unknown; photoURL?: unknown; linkedAt?: unknown };

const providersOf = (data: Record<string, unknown> | undefined): ProviderEntry[] =>
  Array.isArray(data?.authProviders) ? (data!.authProviders as ProviderEntry[]) : [];

/** 이 사용자 문서의 authProviders 에 그 신원이 있나 */
export function hasIdentity(data: Record<string, unknown> | undefined, p: IdentityProvider, providerUid: string): boolean {
  return providersOf(data).some((e) => identityProviderOf(e?.providerId) === p && String(e?.uid ?? '') === String(providerUid));
}

/** 이 사용자에게 연결된 제공자들 (중복 없이) */
export function linkedProvidersOf(data: Record<string, unknown> | undefined): IdentityProvider[] {
  return [...new Set(providersOf(data).map((e) => identityProviderOf(e?.providerId)).filter(Boolean) as IdentityProvider[])];
}

/** Firebase Auth 에 비밀번호가 있나 (이메일·비밀번호 로그인 가능) */
export async function hasPasswordLogin(uid: string): Promise<boolean> {
  try {
    const u = await getAdminAuth().getUser(uid);
    return !!u.passwordHash || u.providerData.some((p) => p.providerId === 'password');
  } catch {
    return false;
  }
}

/**
 * 신원 → 사용자 uid. 연결표 → (오래된 항목 정리) → authProviders 훑기(찾으면 연결표 채움).
 * 같은 신원이 여러 사람의 authProviders 에 있으면 활성 계정을 고르고 남긴다.
 */
export async function findIdentityOwner(p: IdentityProvider, providerUid: string): Promise<{ uid: string; data: Record<string, unknown> } | null> {
  const db = getAdminFirestore();
  const ref = db.collection(AUTH_IDENTITIES).doc(identityKey(p, providerUid));
  const snap = await ref.get();
  if (snap.exists) {
    const uid = String(snap.data()?.uid ?? '');
    const user = uid ? await db.collection('users').doc(uid).get() : null;
    if (user?.exists && hasIdentity(user.data(), p, providerUid)) return { uid, data: user.data() ?? {} };
    // 옛 앱에서 연결을 끊었거나 사용자 문서가 없어졌다 — 오래된 항목
    await ref.delete().catch(() => undefined);
    logger.info('🧹 오래된 신원 연결 정리:', { provider: p });
  }
  // 전환 기간: authProviders 에서 찾기 (users 전체를 한 번 훑는다 — 연결표가 채워지면 거의 오지 않는다)
  const all = await db.collection('users').select('status', 'authProviders').get();
  const hits = all.docs.filter((d) => hasIdentity(d.data(), p, providerUid));
  if (!hits.length) return null;
  const pick = hits.find((d) => d.data().status === 'active') ?? hits[0];
  if (hits.length > 1) logger.warn('⚠️ 같은 소셜 신원이 여러 사용자에 연결됨:', { provider: p, count: hits.length });
  await ref.set({ uid: pick.id, provider: p, providerUid: String(providerUid), linkedAt: Timestamp.now(), backfilled: true }, { merge: true });
  const full = await db.collection('users').doc(pick.id).get();
  return { uid: pick.id, data: full.data() ?? {} };
}

export class IdentityError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'IdentityError';
  }
}

/**
 * 연결 — 연결표와 users.authProviders 에 함께 적는다 (트랜잭션).
 *  - 이 신원이 다른 사람에게 (유효하게) 연결돼 있으면 IDENTITY_TAKEN
 *  - 이 사람이 같은 제공자의 다른 계정을 이미 연결했으면: replace=false → PROVIDER_TAKEN, replace=true → 바꾼다
 *    (replace 는 구글·애플의 '같은 이메일 · 다른 id' 정리용 — 옛 코드의 애플 id 바로잡기와 같은 경우)
 */
export async function linkIdentity(uid: string, id: IdentityRef, opts: { replace?: boolean } = {}): Promise<void> {
  const db = getAdminFirestore();
  const userRef = db.collection('users').doc(uid);
  const idRef = db.collection(AUTH_IDENTITIES).doc(identityKey(id.provider, id.providerUid));
  await db.runTransaction(async (tx) => {
    const [userSnap, idSnap] = await Promise.all([tx.get(userRef), tx.get(idRef)]);
    if (!userSnap.exists) throw new IdentityError(404, 'NOT_FOUND', '사용자를 찾을 수 없습니다.');
    const data = userSnap.data() ?? {};
    if (idSnap.exists && idSnap.data()?.uid && idSnap.data()?.uid !== uid) {
      const other = await tx.get(db.collection('users').doc(String(idSnap.data()?.uid)));
      if (other.exists && hasIdentity(other.data(), id.provider, id.providerUid)) {
        throw new IdentityError(409, 'IDENTITY_TAKEN', '이 소셜 계정은 이미 다른 계정에 연결되어 있습니다.');
      }
    }
    const list = providersOf(data);
    const same = list.filter((e) => identityProviderOf(e?.providerId) === id.provider);
    if (same.some((e) => String(e?.uid ?? '') === id.providerUid) && idSnap.exists && idSnap.data()?.uid === uid) return; // 이미 연결
    if (same.some((e) => String(e?.uid ?? '') !== id.providerUid) && !opts.replace) {
      throw new IdentityError(409, 'PROVIDER_TAKEN', '이 제공자의 다른 계정이 이미 연결되어 있습니다. 먼저 연결을 해제해주세요.');
    }
    const now = Timestamp.now();
    const prev = same.find((e) => String(e?.uid ?? '') === id.providerUid);
    const entry: Record<string, unknown> = {
      providerId: storedProviderId(id.provider),
      uid: id.providerUid,
      linkedAt: prev?.linkedAt ?? now,
      ...(id.email ? { email: id.email } : prev?.email ? { email: prev.email } : {}),
      ...(id.displayName ? { displayName: id.displayName.slice(0, 100) } : prev?.displayName ? { displayName: prev.displayName } : {}),
      ...(id.photoURL && /^https:\/\//.test(id.photoURL) ? { photoURL: id.photoURL } : prev?.photoURL ? { photoURL: prev.photoURL } : {}),
    };
    const next = [...list.filter((e) => identityProviderOf(e?.providerId) !== id.provider), entry];
    // 바꾸는 경우: 옛 신원의 연결표 항목도 지운다
    for (const old of same) {
      const oldUid = String(old?.uid ?? '');
      if (oldUid && oldUid !== id.providerUid) tx.delete(db.collection(AUTH_IDENTITIES).doc(identityKey(id.provider, oldUid)));
    }
    tx.set(idRef, { uid, provider: id.provider, providerUid: id.providerUid, ...(id.email ? { email: id.email } : {}), linkedAt: now }, { merge: true });
    tx.update(userRef, { authProviders: next, updatedAt: now });
  });
}

/** 연결 해제 — 다른 로그인 방법(비밀번호 · 다른 소셜)이 하나는 남아야 한다 */
export async function unlinkIdentity(uid: string, p: IdentityProvider): Promise<void> {
  const db = getAdminFirestore();
  const userRef = db.collection('users').doc(uid);
  const hasPw = await hasPasswordLogin(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new IdentityError(404, 'NOT_FOUND', '사용자를 찾을 수 없습니다.');
    const list = providersOf(snap.data());
    const mine = list.filter((e) => identityProviderOf(e?.providerId) === p);
    if (!mine.length) return;
    const others = linkedProvidersOf(snap.data()).filter((x) => x !== p);
    if (!hasPw && !others.length) {
      throw new IdentityError(409, 'LAST_METHOD', '마지막 로그인 방법은 해제할 수 없습니다. 다른 로그인 방법을 먼저 연결해주세요.');
    }
    for (const e of mine) {
      const pid = String(e?.uid ?? '');
      if (pid) tx.delete(db.collection(AUTH_IDENTITIES).doc(identityKey(p, pid)));
    }
    tx.update(userRef, { authProviders: list.filter((e) => identityProviderOf(e?.providerId) !== p), updatedAt: Timestamp.now() });
  });
}

/** 마지막 로그인 시각 (실패해도 무시) */
export async function touchIdentity(p: IdentityProvider, providerUid: string): Promise<void> {
  await getAdminFirestore().collection(AUTH_IDENTITIES).doc(identityKey(p, providerUid))
    .set({ lastLoginAt: Timestamp.now() }, { merge: true }).catch(() => undefined);
}

/** 'abcdef@gmail.com' → 'ab****@gmail.com' */
export function maskEmail(email: unknown): string {
  const e = typeof email === 'string' ? email : '';
  const at = e.indexOf('@');
  if (at < 1) return '';
  const name = e.slice(0, at);
  const keep = name.length <= 2 ? 1 : 2;
  return `${name.slice(0, keep)}${'*'.repeat(Math.max(2, name.length - keep))}${e.slice(at)}`;
}
