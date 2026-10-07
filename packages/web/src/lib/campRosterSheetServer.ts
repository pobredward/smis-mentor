/**
 * 캠프 선생님 표 (campRosters/{campCode}) 서버 로직 — Admin SDK 전용
 *
 * - 불러오기: 표 문서 + (S캠프) 민감 칸은 개인 저장소에서 원본을 채워 돌려준다
 * - 매칭: 행마다 이름으로 사용자 후보를 찾아 준다 (동명이인·없는 사람은 관리자가 고른다)
 * - 저장: 캠프 배정(그룹·역할·반번호) · 반 정보(강의실·반이름·교재) · 숙소 방을 한 번에 반영하고,
 *        표에서 빠진 사람은 (확인받은) 캠프 배정을 해제한다
 * - 멘토 영어 이름 · 성별과 해외(S·F) 캠프의 주민번호 · 여권 · 단체티 · 휴대폰은 표에서 넣지 않는다 —
 *   연결된 계정 값(멘토가 직접 넣은 값)으로 채우고, 안 넣었으면 빈 칸
 */
import { getAdminFirestore, adminFieldValue } from '@/lib/firebase-admin';
import { privateRef } from '@/lib/campProfileServer';
import { buildRosterRow } from '@/lib/campRosterServer';
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
  rosterAccountKeys,
  rosterRowWithAccount,
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

/** 표 매칭 · 저장에 쓰는 사용자 칸만 — 자기소개 같은 큰 칸까지 받으면 users 전체가 1MB 넘게 무거워 느리다 */
const USER_FIELDS = ['name', 'role', 'status', 'englishNickname', 'university', 'jobCodeIds', 'jobExperiences', 'gender', 'activeJobExperienceId'];
/** 선생님 표에 들어갈 수 있는 역할 — 다른 계정이 늘어도 읽는 양이 늘지 않게 */
const ROSTER_ROLES = [...new Set([...MENTOR_ROLES, ...FOREIGN_ROLES])];

export async function loadUsers(jobCodeId: string): Promise<UserLite[]> {
  const snap = await getAdminFirestore().collection('users').where('role', 'in', ROSTER_ROLES).select(...USER_FIELDS).get();
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

/** 해외(S·F) 캠프 민감 칸 — 개인 저장소 원본 (관리자 표에서 보여 주기만) */
export const SENSITIVE_KEYS = ['rrn', 'passportName', 'passportNumber', 'passportExpiry', 'shirtSize', 'phoneNumber', 'phoneModel'] as const;
async function sensitiveCellsOf(uid: string, jobCodeId: string, code: string): Promise<Record<string, string>> {
  const d = await getAdminFirestore().collection('users').doc(uid).get();
  if (!d.exists) return {};
  const r = await buildRosterRow(d, jobCodeId, code, campProfileTierOf([code]), true);
  const rrn = r.rrnFront && r.rrnLast && !r.rrnLast.includes('●') ? `${r.rrnFront}-${r.rrnLast}` : r.rrnFront || '';
  return { rrn, passportName: r.passportName, passportNumber: r.passportNumber, passportExpiry: r.passportExpiry, shirtSize: r.shirtSize, phoneNumber: r.phoneNumber, phoneModel: r.phoneModel };
}

/** 불러오기 — 표 문서 (해외 S·F 캠프 멘토 줄에는 민감 칸 원본을 채운다) */
export async function loadCampRoster(jobCodeId: string) {
  const jc = await getJobCode(jobCodeId);
  const [doc, users] = await Promise.all([readRosterDoc(jc), loadUsers(jobCodeId)]);
  const byId = new Map(users.map((u) => [u.id, u]));
  // 영어 이름 · 성별은 지금 계정 값으로 (멘토가 바꾸면 바로 보이게, 안 넣었으면 빈 칸)
  let mentors = (doc?.mentors ?? []).map((r) => rosterRowWithAccount('mentor', jc.tier, r, r.userId ? byId.get(r.userId)?.data : null));
  const revealed = jc.tier === 'S' && mentors.some((r) => r.userId);
  if (jc.tier === 'S') {
    mentors = await Promise.all(mentors.map(async (r) => (r.userId ? { ...r, cells: { ...r.cells, ...(await sensitiveCellsOf(r.userId, jobCodeId, jc.code)) } } : r)));
  }
  // 매칭 결과도 같이 — 화면이 열리자마자 연결된 계정 이름이 보이게 (따로 한 번 더 묻지 않는다)
  const matches = matchRoster(jobCodeId, { mentors: doc?.mentors ?? [], foreign: doc?.foreign ?? [] }, users, doc);
  return { jobCode: jc, doc: doc ? { ...doc, mentors } : null, revealed, matches };
}

/** gender: 'M' | 'F' | '' — 계정 칸(성별)을 표에 바로 보여 주려고 */
export type RosterCandidate = { userId: string; name: string; role: string; status: string; englishNickname: string; gender: string; university: string; inCamp: boolean };
export type RosterMatch = { index: number; name: string; userId: string | null; status: 'linked' | 'auto' | 'ambiguous' | 'none'; candidates: RosterCandidate[] };

export const candOf = (u: UserLite): RosterCandidate => ({
  userId: u.id, name: u.name, role: u.role, status: u.status, englishNickname: u.englishNickname,
  gender: u.data.gender === 'M' || u.data.gender === 'F' ? u.data.gender : '', university: u.university, inCamp: u.inCamp,
});

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
  const [users, prev] = await Promise.all([loadUsers(jobCodeId), readRosterDoc(jc)]);
  return { jobCode: jc, ...matchRoster(jobCodeId, input, users, prev) };
}

/** 이름 매칭 (읽어 둔 사용자로) — 불러오기와 미리보기가 같이 쓴다 */
export function matchRoster(jobCodeId: string, input: { mentors: CampRosterRow[]; foreign: CampRosterRow[] }, users: UserLite[], prev: CampRosterDoc | null) {
  const byId = new Map(users.map((u) => [u.id, u]));

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
  return { mentors, foreign, removals: removalsOf(jobCodeId, users, keep, prev) };
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
    // 반번호는 'S05'처럼 반 하나일 때만 — 수업 멘토의 'S01-S04' 같은 범위는 표에만 두고 배정에는 넣지 않는다
    // (배정에 들어가면 시간표 · 학부모 화면에 그 이름의 반이 하나 더 생긴다)
    const cc = String(c.classCode ?? '').trim().toUpperCase();
    if (/^[A-Z]{1,3}\d{1,3}$/.test(cc)) next.classCode = cc; else delete next.classCode;
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

/**
 * 표 한 줄 → 프로필에 반영할 값 (바뀌는 것만)과 개인 저장소 값.
 * 멘토: 없음 — 영어 이름 · 성별은 멘토가 직접 넣은 값만 쓴다 (표 값으로 계정을 덮어쓰지 않는다).
 * 원어민: 영어 이름(표에서 찾는 이름) · 비자.
 */
export function profileUpdatesOf(
  kind: CampRosterKind,
  cells: Record<string, string>,
  user: { name: string; englishNickname: string; gender?: unknown },
  warnings: string[],
): { englishNickname?: string; gender?: 'M' | 'F'; priv: Record<string, string> } {
  const out: { englishNickname?: string; gender?: 'M' | 'F'; priv: Record<string, string> } = { priv: {} };
  if (kind === 'mentor') return out;
  const en = (cells.englishName ?? '').trim();
  if (en && en !== user.englishNickname) {
    if (ENGLISH_NICKNAME_RE.test(en)) { out.englishNickname = en; out.priv.englishNickname = en; }
  }
  void warnings;
  if (cells.visa) out.priv.visaType = cells.visa;
  return out;
}

/** 저장 전 정리 — 열에 없는 칸·빈 줄을 빼고 병합 칸(역할·그룹)을 위 줄 값으로 채운다 */
export function prepRosterRows(rows: CampRosterRow[], kind: CampRosterKind, tier: CampRosterTier): CampRosterRow[] {
  // 계정 칸(멘토 영어 이름 · 성별)은 표에서 받지 않는다 — 저장할 때 계정 값으로 채운다
  const acct = new Set(rosterAccountKeys(kind, tier));
  const cols = rosterColumnsOf(kind, tier).filter((c) => !acct.has(c.key));
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

  // 2) 해외(S·F) 캠프 민감 칸(주민번호 · 여권 · 단체티 · 휴대폰)은 표에서 받지 않는다 — 멘토가 앱에서 넣은 값을 불러와 보여 줄 뿐
  //    (prepRosterRows 가 계정 칸을 이미 뺐다)

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
  // 멘토 영어 이름 · 성별 — 지금 계정 값 (멘토가 안 넣었으면 빈 칸)
  const withAccount = (rows: CampRosterRow[]) => rows.map((r) => rosterRowWithAccount('mentor', jc.tier, r, r.userId ? byId.get(r.userId)?.data : null));
  const doc: CampRosterDoc = {
    jobCodeId, campCode: jc.code, tier: jc.tier, mentors: withAccount(pub(mentors, colsM)), foreign: pub(foreign, colsF),
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
