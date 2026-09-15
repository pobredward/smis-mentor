/**
 * Bearer 액세스 토큰 → Viewer(요청자) 변환
 *
 * JWT 서명·만료를 검증한 뒤 Firestore users 문서에서 현재 역할/상태를 다시 읽는다.
 * (역할 변경·탈퇴가 즉시 반영되도록 토큰의 role 클레임은 참고용으로만 쓴다)
 */
import type { DocumentData } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@/lib/firebase-admin';
import type { Role, Viewer } from '@/lib/ai-content/site';
import { verifyAccessToken } from './jwt';

const VALID_ROLES: Role[] = ['mentor', 'mentor_temp', 'foreign', 'foreign_temp', 'admin'];

const viewerCache = new Map<string, { exp: number; viewer: Viewer | null }>();

export async function loadViewer(uid: string): Promise<Viewer | null> {
  const hit = viewerCache.get(uid);
  if (hit && hit.exp > Date.now()) return hit.viewer;

  const snap = await getAdminFirestore().collection('users').doc(uid).get();
  let viewer: Viewer | null = null;
  if (snap.exists) {
    const d = snap.data() as DocumentData;
    const role = VALID_ROLES.includes(d.role) ? (d.role as Role) : 'mentor_temp';
    const status = d.status ?? 'active';
    if (status !== 'deleted' && status !== 'inactive') {
      const jobCodeIds = new Set<string>();
      if (Array.isArray(d.jobCodeIds)) d.jobCodeIds.forEach((x: unknown) => typeof x === 'string' && jobCodeIds.add(x));
      if (Array.isArray(d.jobExperiences)) {
        d.jobExperiences.forEach((e: { id?: string } | string) => {
          const id = typeof e === 'string' ? e : e?.id;
          if (id) jobCodeIds.add(id);
        });
      }
      viewer = {
        uid,
        role,
        name: d.name ?? '',
        status,
        activeJobCodeId: d.activeJobExperienceId || undefined,
        jobCodeIds: [...jobCodeIds],
      };
    }
  }
  viewerCache.set(uid, { exp: Date.now() + 60_000, viewer });
  return viewer;
}

export interface VerifiedBearer {
  viewer: Viewer;
  clientId: string;
  scope: string;
  token: string;
  expiresAt?: number;
}

/** Authorization 헤더의 Bearer 토큰 검증. 실패 시 null */
export async function verifyBearer(authorization: string | null | undefined): Promise<VerifiedBearer | null> {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  const viewer = await loadViewer(claims.sub);
  if (!viewer) return null;
  return { viewer, clientId: claims.client_id, scope: claims.scope ?? 'read', token, expiresAt: claims.exp };
}
