/**
 * 로그인·가입 화면의 사용자 조회 — web·mobile 공용
 *
 * 로그인 전에는 Firestore 규칙상 users 목록을 읽을 수 없으므로 서버(/api/auth/lookup)로 조회하고,
 * 로그인 후에도 규칙에 막히면(permission-denied) 서버로 돌린다.
 * 반환하는 사용자에는 항상 userId(문서 id)를 채운다.
 *
 * 예전에는 web·mobile 에 따로 있어 동작이 어긋났다
 *  - 모바일 '탈퇴 계정 확인'(IncludeInactive)이 로그인 전에 Firestore 를 직접 읽다 막혀 늘 '없음' 으로 끝났음
 *  - 웹은 구버전 phone 필드를 보지 않았음
 */
import { type Firestore, collection, query, where, getDocs, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';
import type { User } from '../types/legacy';
import { lookupUserViaApi, isPermissionDenied, type UserLookupParams } from './authLookupClient';
import { logger } from '../utils/logger';

type Snap = QueryDocumentSnapshot<DocumentData>;
const STATUS_ORDER: Record<string, number> = { active: 1, temp: 2, inactive: 3, deleted: 4 };
const byStatus = (a: Snap, b: Snap) => (STATUS_ORDER[a.data().status as string] ?? 9) - (STATUS_ORDER[b.data().status as string] ?? 9);
const toUser = (d: Snap) => ({ ...d.data(), userId: d.id }) as User;
const isLive = (d: Snap) => d.data().status !== 'deleted' && d.data().status !== 'inactive';

export function createUserLookup(db: Firestore, auth: Pick<Auth, 'currentUser'>, apiBaseUrl: string | (() => string)) {
  const base = () => (typeof apiBaseUrl === 'function' ? apiBaseUrl() : apiBaseUrl);
  const viaApi = (params: UserLookupParams) => lookupUserViaApi(base(), params);

  /** where 조회 여러 개 → 문서 목록. 로그인 전이거나 규칙에 막히면 null (서버로 조회하라는 뜻) */
  const readUsers = async (...conds: Array<[string, string]>): Promise<Snap[] | null> => {
    if (!auth.currentUser) return null;
    try {
      const snaps = await Promise.all(conds.map(([f, v]) => getDocs(query(collection(db, 'users'), where(f, '==', v)))));
      const seen = new Set<string>();
      return snaps.flatMap((s) => s.docs).filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
    } catch (e) {
      if (isPermissionDenied(e)) return null;
      throw e;
    }
  };

  /** 이메일 — 탈퇴·삭제 제외, active > temp */
  const getUserByEmail = async (email: string): Promise<User | null> => {
    if (!email || typeof email !== 'string') return null;
    const normalized = email.toLowerCase();
    const docs = await readUsers(['email', normalized]);
    if (!docs) return viaApi({ by: 'email', email: normalized });
    const live = docs.filter(isLive).sort(byStatus);
    if (live.length > 1) logger.warn('⚠️ 동일한 이메일로 여러 사용자 발견 (탈퇴·삭제 제외):', { count: live.length });
    return live[0] ? toUser(live[0]) : null;
  };

  /** 이메일로 탈퇴(inactive)·삭제(deleted) 계정만 */
  const getUserByEmailIncludeInactive = async (email: string): Promise<User | null> => {
    try {
      if (!email || typeof email !== 'string') return null;
      const normalized = email.toLowerCase();
      const docs = await readUsers(['email', normalized]);
      if (!docs) {
        const u = await viaApi({ by: 'email', email: normalized, includeInactive: true });
        return u && (u.status === 'inactive' || u.status === 'deleted') ? u : null;
      }
      const gone = docs.find((d) => !isLive(d));
      return gone ? toUser(gone) : null;
    } catch (error) {
      logger.error('이메일로 탈퇴 사용자 조회 실패:', error);
      return null;
    }
  };

  /** 전화번호 — phoneNumber 우선, 구버전 phone 필드 폴백, 탈퇴·삭제 제외 */
  const getUserByPhone = async (phone: string): Promise<User | null> => {
    if (!phone || typeof phone !== 'string') return null;
    const docs = await readUsers(['phoneNumber', phone], ['phone', phone]);
    if (!docs) return viaApi({ by: 'phone', phone });
    const live = docs.filter(isLive).sort(byStatus);
    return live[0] ? toUser(live[0]) : null;
  };

  /** 전화번호 — 탈퇴·삭제 포함 (복구·재가입 안내용), active > temp > inactive > deleted */
  const getUserByPhoneIncludeDeleted = async (phone: string): Promise<User | null> => {
    try {
      if (!phone || typeof phone !== 'string') return null;
      const docs = await readUsers(['phoneNumber', phone], ['phone', phone]);
      if (!docs) return viaApi({ by: 'phone', phone, includeDeleted: true });
      const sorted = [...docs].sort(byStatus);
      return sorted[0] ? toUser(sorted[0]) : null;
    } catch (error) {
      logger.error('전화번호로 탈퇴 포함 사용자 조회 실패:', error);
      return null;
    }
  };

  /** 원어민 이름 — 삭제 제외, active > temp > inactive */
  const getUserByForeignName = async (firstName: string, lastName: string): Promise<User | null> => {
    if (!firstName || !lastName) return null;
    let docs: Snap[] | null = null;
    if (auth.currentUser) {
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('foreignTeacher.firstName', '==', firstName), where('foreignTeacher.lastName', '==', lastName)));
        docs = snap.docs;
      } catch (e) {
        if (!isPermissionDenied(e)) throw e;
      }
    }
    if (!docs) return viaApi({ by: 'foreignName', firstName, lastName });
    const alive = docs.filter((d) => d.data().status !== 'deleted').sort(byStatus);
    return alive[0] ? toUser(alive[0]) : null;
  };

  /** 소셜 제공자 uid (항상 서버 조회) */
  const getUserBySocialProvider = async (providerId: string, providerUid: string): Promise<User | null> => {
    try {
      return await viaApi({ by: 'social', providerId, providerUid });
    } catch (error) {
      logger.error('소셜 제공자로 사용자 조회 실패:', error);
      return null;
    }
  };

  return {
    getUserByEmail,
    getUserByEmailIncludeInactive,
    getUserByPhone,
    getUserByPhoneIncludeDeleted,
    getUserByForeignName,
    getUserBySocialProvider,
  };
}
