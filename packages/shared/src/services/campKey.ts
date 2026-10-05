/**
 * 캠프 열쇠 — campCode(jobCodes.code, 예: J29) ↔ jobCodeId(jobCodes 문서 id) 변환 (web · mobile 공용)
 *
 * 캠프에 딸린 데이터는 campCode 하나로 묶는다 (2026-10 결정). campCode 는 jobCodes 안에서 유일하고 바꾸지 않는다.
 * 사람의 캠프 배정(users.jobExperiences · jobCodeIds)은 jobCodes 문서 id 를 그대로 쓰므로, 둘 사이를 오갈 때는 여기를 쓴다.
 * (예전에는 화면 · 서버마다 jobCodes 를 따로 조회했고 방식도 다섯 가지였다)
 *
 * jobCodes 는 50개 남짓이라 전체를 한 번 읽어 두고(5분) 바꾼다. 모르는 값이면 한 번 새로 읽는다.
 */
import { collection, getDocs, type Firestore } from 'firebase/firestore';

export interface CampKeys {
  /** jobCodeId → campCode */
  byId: Map<string, string>;
  /** campCode → jobCodeId */
  byCode: Map<string, string>;
}

const TTL_MS = 5 * 60_000;
let cache: { at: number; keys: Promise<CampKeys> } | null = null;

/** campCode 비교용 — 앞뒤 공백만 뺀다 (F25_2 · J24S 같은 코드가 있어 대소문자는 그대로) */
export const normalizeCampCode = (code: unknown): string => (typeof code === 'string' ? code.trim() : '');

/** jobCodes 문서들 → 변환표 (서버 쪽 도우미도 같은 함수를 쓴다) */
export function buildCampKeys(docs: Array<{ id: string; code?: unknown }>): CampKeys {
  const byId = new Map<string, string>();
  const byCode = new Map<string, string>();
  for (const d of docs) {
    const code = normalizeCampCode(d.code);
    if (!code) continue;
    byId.set(d.id, code);
    if (!byCode.has(code)) byCode.set(code, d.id);
  }
  return { byId, byCode };
}

export function loadCampKeys(db: Firestore, opts?: { fresh?: boolean }): Promise<CampKeys> {
  if (!opts?.fresh && cache && Date.now() - cache.at < TTL_MS) return cache.keys;
  const entry = {
    at: Date.now(),
    keys: getDocs(collection(db, 'jobCodes')).then((snap) => buildCampKeys(snap.docs.map((d) => ({ id: d.id, code: d.data().code })))),
  };
  cache = entry;
  entry.keys.catch(() => {
    if (cache === entry) cache = null;
  });
  return entry.keys;
}

/** jobCodes 를 새로 만들거나 고친 뒤 */
export const invalidateCampKeys = (): void => {
  cache = null;
};

/** jobCodeId → campCode (없으면 null) */
export async function campCodeOf(db: Firestore, jobCodeId: string | null | undefined): Promise<string | null> {
  if (!jobCodeId) return null;
  const hit = (await loadCampKeys(db)).byId.get(jobCodeId);
  if (hit) return hit;
  return (await loadCampKeys(db, { fresh: true })).byId.get(jobCodeId) ?? null;
}

/** campCode → jobCodeId (없으면 null) */
export async function jobCodeIdOf(db: Firestore, campCode: string | null | undefined): Promise<string | null> {
  const code = normalizeCampCode(campCode);
  if (!code) return null;
  const hit = (await loadCampKeys(db)).byCode.get(code);
  if (hit) return hit;
  return (await loadCampKeys(db, { fresh: true })).byCode.get(code) ?? null;
}

/** 새 캠프 코드가 이미 쓰이고 있나 (exceptId: 고치는 그 문서는 빼고) */
export async function isCampCodeTaken(db: Firestore, campCode: string, exceptId?: string): Promise<boolean> {
  const code = normalizeCampCode(campCode);
  const keys = await loadCampKeys(db, { fresh: true });
  const owner = keys.byCode.get(code);
  if (owner && owner !== exceptId) return true;
  // 같은 코드가 여럿인 옛 데이터도 잡는다
  for (const [id, c] of keys.byId) if (c === code && id !== exceptId) return true;
  return false;
}
