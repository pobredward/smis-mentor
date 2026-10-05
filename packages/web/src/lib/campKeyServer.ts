/**
 * 캠프 열쇠 변환 — 서버(Admin SDK)용. 클라이언트용과 같은 규칙: shared services/campKey.ts
 * campCode(jobCodes.code) 는 유일하고 바꾸지 않는다. jobCodes 전체를 1분 동안 담아 둔다 (인스턴스마다).
 */
import { getAdminFirestore } from '@/lib/firebase-admin';
import { buildCampKeys, normalizeCampCode, type CampKeys } from '@smis-mentor/shared';

const TTL_MS = 60_000;
let cache: { at: number; keys: Promise<CampKeys> } | null = null;

export function loadCampKeysServer(opts?: { fresh?: boolean }): Promise<CampKeys> {
  if (!opts?.fresh && cache && Date.now() - cache.at < TTL_MS) return cache.keys;
  const entry = {
    at: Date.now(),
    keys: getAdminFirestore().collection('jobCodes').select('code').get()
      .then((snap) => buildCampKeys(snap.docs.map((d) => ({ id: d.id, code: d.get('code') })))),
  };
  cache = entry;
  entry.keys.catch(() => {
    if (cache === entry) cache = null;
  });
  return entry.keys;
}

export const invalidateCampKeysServer = (): void => {
  cache = null;
};

/** jobCodeId → campCode (없으면 null) */
export async function campCodeOfServer(jobCodeId: string | null | undefined): Promise<string | null> {
  if (!jobCodeId) return null;
  const hit = (await loadCampKeysServer()).byId.get(jobCodeId);
  if (hit) return hit;
  return (await loadCampKeysServer({ fresh: true })).byId.get(jobCodeId) ?? null;
}

/** campCode → jobCodeId (없으면 null) */
export async function jobCodeIdOfServer(campCode: string | null | undefined): Promise<string | null> {
  const code = normalizeCampCode(campCode);
  if (!code) return null;
  const hit = (await loadCampKeysServer()).byCode.get(code);
  if (hit) return hit;
  return (await loadCampKeysServer({ fresh: true })).byCode.get(code) ?? null;
}
