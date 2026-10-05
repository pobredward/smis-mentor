/**
 * 캠프 선생님 표 (campRosters/{campCode}) 서버 로직 — Admin SDK 전용
 *
 * - 불러오기: 표 문서 + (S캠프) 민감 칸은 개인 저장소에서 원본을 채워 돌려준다
 * - 매칭: 행마다 이름으로 사용자 후보를 찾아 준다 (동명이인·없는 사람은 관리자가 고른다)
 * - 저장: 캠프 배정(그룹·역할·반번호) · 영어 이름·성별 · 반 정보(강의실·반이름·교재) · 숙소 방 ·
 *        S캠프 개인정보를 한 번에 반영하고, 표에서 빠진 사람은 (확인받은) 캠프 배정을 해제한다
 */
import { getAdminFirestore, adminFieldValue } from '@/lib/firebase-admin';
import { privateRef } from '@/lib/campProfileServer';
import { buildRosterRow, applyRosterEdit, RosterEditError } from '@/lib/campRosterServer';
import {
  ENGLISH_NICKNAME_RE,
  normalizeNameForMatch,
  campProfileTierOf,
  cleanLodging,
  rosterColumnsOf,
  rosterTierOf,
  rosterFillInherited,
  rosterRowEmpty,
  rosterMatchName,
  rosterMentorRole,
  rosterForeignRole,
  rosterGroupKey,
  rosterRoomNum,
  rosterBlank,
  type CampLodging,
  type CampRosterDoc,
  type CampRosterKind,
  type CampRosterRow,
  type CampRosterTier,
} from '@smis-mentor/shared';
import { syncGenerationChatRooms } from './chatServer';

export class CampRosterError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const MENTOR_ROLES = ['mentor', 'mentor_temp', 'admin'];
const FOREIGN_ROLES = ['foreign', 'foreign_temp', 'admin'];
/** 표에서 빠지면 배정을 해제하는 역할 (관리자는 캠프 선택으로도 배정되므로 표에 있었던 경우만) */
const REMOVABLE_ROLES = ['mentor', 'mentor_temp', 'foreign', 'foreign_temp'];
export const MAX_ROWS = 200;

export type UserLite = { id: string; name: string; role: string; status: string; englishNickname: string; university: string; inCamp: boolean; data: Record<string, any> };

export async function getJobCode(jobCodeId: string) {
  const snap = await getAdminFirestore().collection('jobCodes').doc(jobCodeId).get();
  if (!snap.exists) throw new CampRosterError(404, '캠프 코드를 찾을 수 없습니다.');
  const d = snap.data() ?? {};
  const code = String(d.code ?? '');
  return { id: snap.id, code, name: String(d.name ?? ''), generation: String(d.generation ?? ''), tier: rosterTierOf(code) as CampRosterTier };
}

/** campRosters 문서 — 캠프 열쇠(campCode)가 문서 id */
const rosterRef = (jc: { id: string; code: string }) => getAdminFirestore().collection('campRosters').doc(jc.code || jc.id);

export async function readRosterDoc(jc: { id: string; code: string }): Promise<CampRosterDoc | null> {
  const snap = await rosterRef(jc).get();
  return snap.exists ? (snap.data() as CampRosterDoc) : null;
}

async function writeRosterDoc(jc: { id: string; code: string }, data: CampRosterDoc): Promise<void> {
  await rosterRef(jc).set(data);
}

export async function loadUsers(jobCodeId: string): Promise<UserLite[]> {
  const snap = await getAdminFirestore().collection('users').get();
  return snap.docs
    .filter((d) => !['deleted', 'inactive'].includes(String(d.data().status)))
    .map((d) => {
      const u = d.data();
      return {
        id: d.id, name: String(u.name ?? ''), role: String(u.role ?? ''), status: String(u.status ?? ''),
        englishNickname: String(u.englishNickname ?? ''), university: String(u.university ?? ''),
        inCamp: Array.isArray(u.jobCodeIds) && u.jobCodeIds.includes(jobCodeId), data: u,
      };
    });
}

/** S캠프 민감 칸 — 개인 저장소 원본 */
export const SENSITIVE_KEYS = ['rrn', 'passportName', 'passportNumber', 'passportExpiry', 'shirtSize', 'phoneNumber', 'phoneModel'] as const;
async function sensitiveCellsOf(uid: string, jobCodeId: string, code: string): Promise<Record<string, string>> {
  const d = await getAdminFirestore().collection('users').doc(uid).get();
  if (!d.exists) return {};
  const r = await buildRosterRow(d, jobCodeId, code, campProfileTierOf([code]), true);
  const rrn = r.rrnFront && r.rrnLast && !r.rrnLast.includes('●') ? `${r.rrnFront}-${r.rrnLast}` : r.rrnFront || '';
  return { rrn, passportName: r.passportName, passportNumber: r.passportNumber, passportExpiry: r.passportExpiry, shirtSize: r.shirtSize, phoneNumber: r.phoneNumber, phoneModel: r.phoneModel };
}

/** 불러오기 — 표 문서 (S 캠프 멘토 줄에는 민감 칸 원본을 채운다) */
export async function loadCampRoster(jobCodeId: string) {
  const jc = await getJobCode(jobCodeId);
  const doc = await readRosterDoc(jc);
  let mentors = doc?.mentors ?? [];
  const revealed = jc.tier === 'S' && mentors.some((r) => r.userId);
  if (jc.tier === 'S') {
    mentors = await Promise.all(mentors.map(async (r) => (r.userId ? { ...r, cells: { ...r.cells, ...(await sensitiveCellsOf(r.userId, jobCodeId, jc.code)) } } : r)));
  }
  return { jobCode: jc, doc: doc ? { ...doc, mentors } : null, revealed };
}

export type RosterCandidate = { userId: string; name: string; role: string; status: string; englishNickname: string; university: string; inCamp: boolean };
export type RosterMatch = { index: number; name: string; userId: string | null; status: 'linked' | 'auto' | 'ambiguous' | 'none'; candidates: RosterCandidate[] };

export const candOf = (u: UserLite): RosterCandidate => ({ userId: u.id, name: u.name, role: u.role, status: u.status, englishNickname: u.englishNickname, university: u.university, inCamp: u.inCamp });

export function candidatesFor(kind: CampRosterKind, raw: string, users: UserLite[]): UserLite[] {
  const n = normalizeNameForMatch(raw);
  if (!n) return [];
  const pool = users.filter((u) => (kind === 'foreign' ? FOREIGN_ROLES : MENTOR_ROLES).includes(u.role));
  const hit = pool.filter((u) => {
    if (normalizeNameForMatch(u.name) === n) return true;
    if (kind === 'foreign') {
      // 원어민은 이름 순서가 제각각(성 먼저·중간 이름) — 영어 닉네임, 이름 조각 하나, 앞부분(Berna → Bernadette)까지
      if (normalizeNameForMatch(u.englishNickname) === n) return true;
      const parts = String(u.name).trim().split(/\s+/).map((x) => normalizeNameForMatch(x)).filter(Boolean);
      if (parts.includes(n)) return true;
      if (n.length >= 3 && parts.some((x) => x.startsWith(n))) return true;
    }
    return false;
  });
  return hit.sort((a, b) => Number(b.inCamp) - Number(a.inCamp) || Number(b.status === 'active') - Number(a.status === 'active') || a.name.localeCompare(b.name, 'ko'));
}

/** 매칭 미리보기 — 행마다 후보와 자동 선택, 그리고 표에서 빠져 배정 해제될 사람 */
export async function previewCampRoster(jobCodeId: string, input: { mentors: CampRosterRow[]; foreign: CampRosterRow[] }) {
  const jc = await getJobCode(jobCodeId);
  const users = await loadUsers(jobCodeId);
  const byId = new Map(users.map((u) => [u.id, u]));
  const prev = await readRosterDoc(jc);

  const matchAll = (kind: CampRosterKind, rows: CampRosterRow[]): RosterMatch[] =>
    rows.map((r, index) => {
      const name = rosterMatchName(kind, r);
      const cands = candidatesFor(kind, (r as { lookup?: string }).lookup?.trim() || name, users);
      const linked = r.userId && byId.get(r.userId);
      if (linked) {
        const list = cands.some((c) => c.id === linked.id) ? cands : [linked, ...cands];
        return { index, name, userId: linked.id, status: 'linked', candidates: list.map(candOf) };
      }
      if (!name) return { index, name, userId: null, status: 'none', candidates: [] };
      const inCamp = cands.filter((c) => c.inCamp);
      const pick = cands.length === 1 ? cands[0] : inCamp.length === 1 ? inCamp[0] : null;
      return { index, name, userId: pick?.id ?? null, status: pick ? 'auto' : cands.length ? 'ambiguous' : 'none', candidates: cands.map(candOf) };
    });

  const mentors = matchAll('mentor', input.mentors ?? []);
  const foreign = matchAll('foreign', input.foreign ?? []);
  const keep = new Set([...mentors, ...foreign].map((m) => m.userId).filter(Boolean) as string[]);
  return { jobCode: jc, mentors, foreign, removals: removalsOf(jobCodeId, users, keep, prev) };
}

export function removalsOf(jobCodeId: string, users: UserLite[], keep: Set<string>, prev: CampRosterDoc | null) {
  const prevIds = new Set([...(prev?.mentors ?? []), ...(prev?.foreign ?? [])].map((r) => r.userId).filter(Boolean) as string[]);
  return users
    .filter((u) => u.inCamp && !keep.has(u.id) && (REMOVABLE_ROLES.includes(u.role) || prevIds.has(u.id)))
    .map(candOf)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export const cleanCells = (cells: Record<string, string>, keys: string[]) => {
  const out: Record<string, string> = {};
  keys.forEach((k) => { const v = rosterBlank(cells?.[k]); if (v) out[k] = v.slice(0, 200); });
  return out;
};

/** 이 사람이 이 캠프에서 쓸 역할 칸 — 멘토는 반멘토 역할, 원어민은 과목 */
export const MENTOR_POOL_ROLES = MENTOR_ROLES;
export const FOREIGN_POOL_ROLES = FOREIGN_ROLES;

/**
 * 표 한 줄 → 그 사람의 이 캠프 배정(jobExperiences 항목). 저장과 MCP 미리보기가 같은 규칙을 쓴다.
 * 알 수 없는 역할·과목이면 기존 값을 두고 warnings 에 남긴다.
 */
export function nextExperience(
  kind: CampRosterKind,
  cells: Record<string, string>,
  cur: Record<string, any> | undefined,
  jobCodeId: string,
  who: string,
  warnings: string[],
): Record<string, any> {
  const next: Record<string, any> = cur ? { ...cur } : { id: jobCodeId };
  const c = cells;
  if (kind === 'mentor') {
    const role = rosterMentorRole(c.role ?? '');
    if (c.role && !role) warnings.push(`${who}: 역할 '${c.role}'을(를) 알 수 없어 기존 역할을 유지했습니다.`);
    if (role) next.groupRole = role;
    const g = rosterGroupKey(c.group ?? '') || (role === '매니저' || role === '부매니저' ? 'manager' : '');
    if (g) next.group = g;
    if (c.classCode) next.classCode = c.classCode.toUpperCase(); else delete next.classCode;
  } else {
    const role = rosterForeignRole(c.subject ?? '');
    if (c.subject && !role) warnings.push(`${who}: 과목 '${c.subject}'을(를) 알 수 없어 기존 값을 유지했습니다.`);
    if (role) next.groupRole = role;
    const g = rosterGroupKey(c.group ?? '');
    if (g) next.group = g;
  }
  Object.keys(next).forEach((k) => next[k] == null && delete next[k]);
  return next;
}

/** 표 한 줄 → 프로필에 반영할 영어 이름·성별 (바뀌는 것만)과 개인 저장소 값 */
export function profileUpdatesOf(
  kind: CampRosterKind,
  cells: Record<string, string>,
  user: { name: string; englishNickname: string; gender?: unknown },
  warnings: string[],
): { englishNickname?: string; gender?: 'M' | 'F'; priv: Record<string, string> } {
  const out: { englishNickname?: string; gender?: 'M' | 'F'; priv: Record<string, string> } = { priv: {} };
  const en = (cells.englishName ?? '').trim();
  if (en && en !== user.englishNickname) {
    if (ENGLISH_NICKNAME_RE.test(en)) { out.englishNickname = en; out.priv.englishNickname = en; }
    else if (kind === 'mentor') warnings.push(`${user.name}: 영어 이름 '${en}'은 명찰 형식(첫 글자 대문자·영문 8자 이내)이 아니라 프로필에는 넣지 않았습니다.`);
  }
  const g = /^(남|m|male|남자)$/i.test(cells.gender ?? '') ? 'M' : /^(여|f|female|여자)$/i.test(cells.gender ?? '') ? 'F' : '';
  if (g && g !== user.gender) out.gender = g;
  if (kind === 'foreign' && cells.visa) out.priv.visaType = cells.visa;
  return out;
}

/** 저장 전 정리 — 열에 없는 칸·빈 줄을 빼고 병합 칸(역할·그룹)을 위 줄 값으로 채운다 */
export function prepRosterRows(rows: CampRosterRow[], kind: CampRosterKind, tier: CampRosterTier): CampRosterRow[] {
  const cols = rosterColumnsOf(kind, tier);
  return rosterFillInherited(
    (rows ?? []).slice(0, MAX_ROWS)
      .map((r) => ({ cells: cleanCells(r.cells ?? {}, cols.map((c) => c.key)), userId: typeof r.userId === 'string' && r.userId ? r.userId : null }))
      .filter((r) => !rosterRowEmpty(r)),   // 빈 줄은 이어받기 전에 뺀다
    cols,
  );
}

/**
 * 저장 — 표 전체를 한 번에.
 * removeUserIds: 미리보기에서 보여 준 '빠지는 사람' 중 관리자가 확인한 사람 (서버가 다시 계산한 목록과 겹치는 사람만 해제)
 */
export async function saveCampRoster(
  jobCodeId: string,
  input: { mentors: CampRosterRow[]; foreign: CampRosterRow[]; removeUserIds?: string[] },
  by: { uid: string; name?: string },
) {
  const jc = await getJobCode(jobCodeId);
  const db = getAdminFirestore();
  const colsM = rosterColumnsOf('mentor', jc.tier);
  const colsF = rosterColumnsOf('foreign', jc.tier);
  const mentors = prepRosterRows(input.mentors, 'mentor', jc.tier);
  const foreign = prepRosterRows(input.foreign, 'foreign', jc.tier);
  if ((input.mentors?.length ?? 0) > MAX_ROWS || (input.foreign?.length ?? 0) > MAX_ROWS) throw new CampRosterError(400, `표는 ${MAX_ROWS}줄까지입니다.`);

  const users = await loadUsers(jobCodeId);
  const byId = new Map(users.map((u) => [u.id, u]));
  const seen = new Map<string, string>();
  for (const [kind, rows] of [['mentor', mentors], ['foreign', foreign]] as const) {
    for (const r of rows) {
      if (!r.userId) continue;
      if (!byId.has(r.userId)) throw new CampRosterError(400, `${rosterMatchName(kind, r) || '이름 없음'}: 연결한 사용자를 찾을 수 없습니다.`);
      if (seen.has(r.userId)) throw new CampRosterError(400, `${byId.get(r.userId)!.name} 님이 두 줄(${seen.get(r.userId)}, ${rosterMatchName(kind, r)})에 연결돼 있습니다.`);
      seen.set(r.userId, rosterMatchName(kind, r));
    }
  }

  const warnings: string[] = [];
  const now = adminFieldValue.serverTimestamp();
  let assigned = 0;

  // 1) 캠프 배정 · 영어 이름 · 성별 (사람마다 한 번에)
  const assign = async (kind: CampRosterKind, r: CampRosterRow) => {
    const u = byId.get(r.userId!)!;
    const list: any[] = Array.isArray(u.data.jobExperiences) ? [...u.data.jobExperiences] : [];
    const i = list.findIndex((e) => e?.id === jobCodeId);
    const cur = nextExperience(kind, r.cells, i >= 0 ? list[i] : undefined, jobCodeId, u.name, warnings);
    if (i >= 0) list[i] = cur; else list.push(cur);

    const upd: Record<string, unknown> = { jobExperiences: list, jobCodeIds: adminFieldValue.arrayUnion(jobCodeId), updatedAt: now };
    const prof = profileUpdatesOf(kind, r.cells, { name: u.name, englishNickname: u.englishNickname, gender: u.data.gender }, warnings);
    if (prof.englishNickname) upd.englishNickname = prof.englishNickname;
    if (prof.gender) upd.gender = prof.gender;
    const priv: Record<string, unknown> = { ...prof.priv };
    await db.collection('users').doc(u.id).update(upd);
    if (Object.keys(priv).length) await privateRef(u.id).set({ ...priv, updatedAt: now }, { merge: true });
    assigned++;
  };
  for (const r of mentors) if (r.userId) await assign('mentor', r);
  for (const r of foreign) if (r.userId) await assign('foreign', r);

  // 2) S캠프 민감 칸 — 바뀐 칸만 기존 저장 로직(검증·암호화)으로. 빈 칸은 지우지 않는다
  if (jc.tier === 'S') {
    for (const r of mentors) {
      if (!r.userId) continue;
      const cur = await sensitiveCellsOf(r.userId, jobCodeId, jc.code);
      for (const k of SENSITIVE_KEYS) {
        const v = (r.cells[k] ?? '').trim();
        if (!v || v === (cur[k] ?? '')) continue;
        try {
          if (k === 'rrn') {
            const digits = v.replace(/\D/g, '');
            if (digits.length !== 13) throw new RosterEditError(400, '주민등록번호 13자리를 확인해주세요.');
            await applyRosterEdit(r.userId, jobCodeId, 'rrnFront', digits.slice(0, 6));
            await applyRosterEdit(r.userId, jobCodeId, 'rrnLast', digits.slice(6));
          } else {
            await applyRosterEdit(r.userId, jobCodeId, k, v);
          }
        } catch (e) {
          warnings.push(`${byId.get(r.userId)!.name}: ${colsM.find((c) => c.key === k)?.label} — ${e instanceof RosterEditError ? e.message : '저장 실패'}`);
        }
      }
    }
  }

  // 3) 표에서 빠진 사람 — 확인받은 사람만 배정 해제
  const keep = new Set(seen.keys());
  const prev = await readRosterDoc(jc);
  const allowed = new Set(removalsOf(jobCodeId, users, keep, prev).map((c) => c.userId));
  const removed: string[] = [];
  for (const uid of input.removeUserIds ?? []) {
    if (!allowed.has(uid)) continue;
    const u = byId.get(uid)!;
    const list = (Array.isArray(u.data.jobExperiences) ? u.data.jobExperiences : []).filter((e: any) => e?.id !== jobCodeId);
    const upd: Record<string, unknown> = { jobExperiences: list, jobCodeIds: adminFieldValue.arrayRemove(jobCodeId), updatedAt: now };
    if (u.data.activeJobExperienceId === jobCodeId) upd.activeJobExperienceId = list[0]?.id ?? adminFieldValue.delete();
    await db.collection('users').doc(uid).update(upd);
    removed.push(u.name);
  }

  // 4) 반 정보 (시간표와 같은 campSettings.classInfo) · 5) 숙소 방 선생님
  const settingsRef = db.collection('campSettings').doc(jc.code);
  const settings = (await settingsRef.get()).data() ?? {};
  const classInfo: Record<string, any> = { ...(settings.classInfo ?? {}) };
  mentors.forEach((r) => {
    const cc = (r.cells.classCode ?? '').toUpperCase();
    if (!/^[A-Z]{1,3}\d{1,3}$/.test(cc)) return;   // '패턴' 같은 칸은 반이 아니다
    const cur = { ...(classInfo[cc] ?? {}) };
    if (r.cells.classroom) cur.classroom = r.cells.classroom;
    if (r.cells.className) cur.className = r.cells.className;
    if (r.cells.textbook) cur.bookCode = r.cells.textbook;
    classInfo[cc] = cur;
  });

  const nameOf = (uid: string) => byId.get(uid)?.name ?? '';
  const rosterPeople = new Set<string>();
  [...mentors, ...foreign, ...(prev?.mentors ?? []), ...(prev?.foreign ?? [])].forEach((r) => { if (r.userId) rosterPeople.add(normalizeNameForMatch(nameOf(r.userId))); });
  removed.forEach((n) => rosterPeople.add(normalizeNameForMatch(n)));
  const lodging: CampLodging = { ...(settings.lodging ?? {}), rooms: { ...(settings.lodging?.rooms ?? {}) } };
  Object.entries(lodging.rooms!).forEach(([num, s]) => {
    lodging.rooms![num] = { ...s, teachers: (s.teachers ?? []).filter((t) => !rosterPeople.has(normalizeNameForMatch(t))) };
  });
  [...mentors, ...foreign].forEach((r) => {
    const num = rosterRoomNum(r.cells.room ?? '');
    if (!num || !r.userId) return;
    const s = lodging.rooms![num] ?? {};
    const name = nameOf(r.userId);
    if (!(s.teachers ?? []).includes(name)) lodging.rooms![num] = { ...s, teachers: [...(s.teachers ?? []), name] };
  });
  const cleanedLodging = { ...cleanLodging(lodging), updatedAt: new Date().toISOString(), updatedBy: by.uid };
  await settingsRef.set({ campCode: jc.code, classInfo, lodging: cleanedLodging, updatedAt: new Date().toISOString() }, { merge: true });

  // 6) 표 문서 — 민감 칸은 빼고
  const pub = (rows: CampRosterRow[], cols: typeof colsM) => rows.map((r) => ({ cells: cleanCells(r.cells, cols.filter((c) => !c.sensitive).map((c) => c.key)), userId: r.userId ?? null }));
  const doc: CampRosterDoc = {
    jobCodeId, campCode: jc.code, tier: jc.tier, mentors: pub(mentors, colsM), foreign: pub(foreign, colsF),
    updatedAt: new Date().toISOString(), updatedBy: by.uid, updatedByName: by.name ?? '',
  };
  await writeRosterDoc(jc, doc);

  // 7) 캠프 채팅방 사람 맞추기 — 같은 기수 전부 (관리자 배정은 기수 단위). 실패해도 명단 저장은 끝난 것
  try {
    await syncGenerationChatRooms(jobCodeId, { force: true });
  } catch (e) {
    console.warn('채팅방 동기화 실패:', e);
    warnings.push('채팅방 사람을 맞추지 못했습니다 — 채팅 탭을 열면 다시 맞춥니다.');
  }

  const unmatched = [...mentors.filter((r) => !r.userId).map((r) => rosterMatchName('mentor', r)), ...foreign.filter((r) => !r.userId).map((r) => rosterMatchName('foreign', r))].filter(Boolean);
  return { assigned, removed, unmatched, warnings };
}
