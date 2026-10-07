/**
 * MCP — 캠프 선생님 배정 (등록 · 변경 · 해제)
 *
 * 관리자 '선생님 명단 관리'(campRosters/{jobCodeId}) 와 같은 표·같은 저장 로직(saveCampRoster)을 쓴다.
 *  - get_camp_roster   : 표 + 지금 이 캠프에 배정된 사람
 *  - write_camp_roster : 줄 단위 변경(changes) 또는 표 전체(mentors·foreign) → dry-run 미리보기 → 승인 → confirm
 * 주민번호·여권·휴대폰·단체티·휴대폰 모델 같은 민감 칸은 읽지도 쓰지도 않는다 (관리자 화면에서만).
 */
import { createHash } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import {
  candidatesFor,
  CampRosterError,
  FOREIGN_POOL_ROLES,
  getJobCode,
  loadUsers,
  MAX_ROWS,
  MENTOR_POOL_ROLES,
  nextExperience,
  prepRosterRows,
  profileUpdatesOf,
  removalsOf,
  readRosterDoc,
  saveCampRoster,
  type UserLite,
} from '@/lib/campRosterSheetServer';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { jobCodeIdOfServer } from '@/lib/campKeyServer';
import { writeAuditLog } from '@/lib/auditLog';
import { clearAiContentCache } from '@/lib/ai-content/data';
import { canAccess, type Viewer } from '@/lib/ai-content/site';
import { DataToolError } from '@/lib/mcp/data-tools';
import {
  rosterColumnsOf,
  rosterMatchName,
  rosterRoomNum,
  type CampRosterDoc,
  type CampRosterKind,
  type CampRosterRow,
  type CampRosterTier,
  rosterAccountKeys,
  rosterRowWithAccount,
} from '@smis-mentor/shared';

type Cells = Record<string, string>;
/** _noLink: 이름으로 계정을 자동 연결하지 않는 줄 (원래 연결 없던 줄 · userId: null 로 보낸 줄 — 예: 대표님, '여(1차)') */
type Row = { cells: Cells; userId?: string | null; _noLink?: boolean };

export interface RosterChange {
  action: 'add' | 'update' | 'remove';
  kind?: CampRosterKind;
  /** update/remove 할 줄 — 하나만 맞아야 한다 */
  target?: { userId?: string; name?: string; classCode?: string; group?: string; subject?: string; index?: number };
  /** add: 새 줄 칸 전체 / update: 바꿀 칸만 ('' 은 그 칸 비우기) */
  cells?: Cells;
  /** 이 줄을 이 사용자 계정에 연결 (동명이인일 때). update 에서 null 이면 연결 끊기 */
  userId?: string | null;
}

export interface WriteRosterInput {
  camp: string;
  changes?: RosterChange[];
  mentors?: Row[];
  foreign?: Row[];
  /** 표 전체(mentors·foreign)를 보낼 때 — 표에 없는 사람의 캠프 배정도 해제할지 (기본 false: 표에서만 빠지고 배정은 남음) */
  removeMissing?: boolean;
  note?: string;
  confirm?: boolean;
  previewHash?: string;
}

const PENDING = 'mcpPendingWrites';
const TTL_MS = 30 * 60 * 1000;
const GROUP_LABEL: Record<string, string> = {
  junior: 'Junior', middle: 'Middle', senior: 'Senior', spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter',
  common: '공통', manager: '운영진', short1: '단기1', short2: '단기2', short3: '단기3', short4: '단기4',
};
const expText = (e: Record<string, any> | undefined) =>
  e ? [GROUP_LABEL[String(e.group ?? '')] ?? e.group ?? '', e.groupRole ?? '', e.classCode ?? ''].filter(Boolean).join(' ') || '(역할 없음)' : '';

function requireAdmin(viewer: Viewer) {
  if (!canAccess('admin', viewer)) throw new DataToolError('캠프 배정은 관리자 계정만 다룰 수 있습니다.');
}

async function resolveCamp(camp: string) {
  const code = String(camp ?? '').trim().toUpperCase();
  if (!code) throw new DataToolError('camp(캠프 코드, 예: J29)가 필요합니다.');
  const jobCodeId = await jobCodeIdOfServer(code);
  if (!jobCodeId) throw new DataToolError(`캠프 코드 ${code} 를 찾을 수 없습니다. list_camps 로 확인하세요.`);
  return getJobCode(jobCodeId);
}

const publicCols = (kind: CampRosterKind, tier: CampRosterTier) => rosterColumnsOf(kind, tier).filter((c) => !c.sensitive);
const sensitiveKeys = (kind: CampRosterKind, tier: CampRosterTier) => rosterColumnsOf(kind, tier).filter((c) => c.sensitive).map((c) => c.key);

/** 칸 검사 — 민감 칸·모르는 칸은 오류, 값은 문자열 */
function checkCells(kind: CampRosterKind, tier: CampRosterTier, cells: unknown, where: string, errors: string[]): Cells {
  if (cells === undefined) return {};
  if (!cells || typeof cells !== 'object' || Array.isArray(cells)) {
    errors.push(`${where}: cells 는 { 칸: 값 } 객체여야 합니다`);
    return {};
  }
  const allowed = new Set(publicCols(kind, tier).map((c) => c.key));
  const sens = new Set(sensitiveKeys(kind, tier));
  const out: Cells = {};
  for (const [k, v] of Object.entries(cells as Record<string, unknown>)) {
    if (sens.has(k)) { errors.push(`${where}: '${k}' 는 민감 정보라 MCP 로 다루지 않습니다 — 관리자 화면(선생님 명단 관리)에서 입력하세요`); continue; }
    if (!allowed.has(k)) { errors.push(`${where}: 모르는 칸 '${k}' — 쓸 수 있는 칸: ${[...allowed].join(', ')}`); continue; }
    if (v !== null && typeof v !== 'string' && typeof v !== 'number') { errors.push(`${where}.${k}: 문자열이어야 합니다`); continue; }
    out[k] = v === null ? '' : String(v).slice(0, 200);
  }
  return out;
}

const docRows = (doc: CampRosterDoc | null, kind: CampRosterKind): Row[] =>
  ((kind === 'mentor' ? doc?.mentors : doc?.foreign) ?? []).map((r) => ({ cells: { ...(r.cells ?? {}) }, userId: r.userId ?? null, _noLink: !r.userId }));

// ─── 읽기 ────────────────────────────────────────────────────────────

export async function getCampRosterForMcp(input: { camp: string }, viewer: Viewer) {
  requireAdmin(viewer);
  const jc = await resolveCamp(input.camp);
  const doc = await readRosterDoc(jc);
  const users = await loadUsers(jc.id);
  const byId = new Map(users.map((u) => [u.id, u]));
  const strip = (kind: CampRosterKind) => {
    const keys = new Set(publicCols(kind, jc.tier).map((c) => c.key));
    return docRows(doc, kind).map((r0, index) => {
      const u = r0.userId ? byId.get(r0.userId) : undefined;
      // 멘토 영어 이름 · 성별은 지금 계정 값 (안 넣었으면 빈 칸)
      const r = rosterRowWithAccount(kind, jc.tier, r0, u?.data ?? null);
      const exp = u?.data.jobExperiences?.find?.((e: any) => e?.id === jc.id);
      return {
        index,
        cells: Object.fromEntries(Object.entries(r.cells).filter(([k]) => keys.has(k))),
        userId: r.userId ?? null,
        account: u ? { name: u.name, role: u.role, status: u.status, englishNickname: u.englishNickname || undefined, assignment: expText(exp) } : null,
      };
    });
  };
  const inTable = new Set([...docRows(doc, 'mentor'), ...docRows(doc, 'foreign')].map((r) => r.userId).filter(Boolean));
  const members = users
    .filter((u) => u.inCamp)
    .map((u) => ({ userId: u.id, name: u.name, role: u.role, assignment: expText(u.data.jobExperiences?.find?.((e: any) => e?.id === jc.id)), inTable: inTable.has(u.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return {
    camp: { code: jc.code, id: jc.id, name: `${jc.generation} ${jc.name}`.trim(), tier: jc.tier },
    columns: {
      mentor: publicCols('mentor', jc.tier).map((c) => ({ key: c.key, label: c.label })),
      foreign: publicCols('foreign', jc.tier).map((c) => ({ key: c.key, label: c.label })),
    },
    updatedAt: doc?.updatedAt ?? null,
    updatedByName: doc?.updatedByName ?? null,
    mentors: strip('mentor'),
    foreign: strip('foreign'),
    campMembers: members,
    note: '민감 칸(주민번호·여권·휴대폰 등)은 보여 주지 않습니다. 고칠 때는 write_camp_roster 의 changes(줄 단위) 또는 mentors·foreign(표 전체)을 쓰세요.',
  };
}

// ─── 쓰기 ────────────────────────────────────────────────────────────

function findRow(rows: Row[], kind: CampRosterKind, t: RosterChange['target'], where: string): number {
  if (!t || typeof t !== 'object') throw new DataToolError(`${where}: target(어느 줄인지 — userId · name · classCode · group+subject · index)이 필요합니다`);
  const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, '').toLowerCase();
  let hits = rows.map((r, i) => ({ r, i }));
  if (typeof t.index === 'number') hits = hits.filter((h) => h.i === t.index);
  if (t.userId) hits = hits.filter((h) => h.r.userId === t.userId);
  if (t.name) hits = hits.filter((h) => norm(rosterMatchName(kind, h.r as CampRosterRow)) === norm(t.name));
  if (t.classCode) hits = hits.filter((h) => norm(h.r.cells.classCode) === norm(t.classCode));
  if (t.group) hits = hits.filter((h) => norm(h.r.cells.group) === norm(t.group));
  if (t.subject) hits = hits.filter((h) => norm(h.r.cells.subject) === norm(t.subject));
  if (hits.length === 1) return hits[0].i;
  const list = rows.map((r, i) => `${i}: ${rosterMatchName(kind, r as CampRosterRow) || '(이름 없음)'} ${r.cells.group ?? ''} ${kind === 'mentor' ? r.cells.classCode ?? '' : r.cells.subject ?? ''}`.trim());
  throw new DataToolError(`${where}: target 에 맞는 줄이 ${hits.length ? `${hits.length}개입니다` : '없습니다'} — 하나로 좁혀 주세요. 지금 표(${kind === 'mentor' ? '멘토' : '원어민'}):\n${list.join('\n')}`);
}

/** 변경 적용 → 저장할 표와 해제할 사람 */
function applyChanges(doc: CampRosterDoc | null, tier: CampRosterTier, changes: RosterChange[], errors: string[]) {
  const rows: Record<CampRosterKind, Row[]> = { mentor: docRows(doc, 'mentor'), foreign: docRows(doc, 'foreign') };
  const removeIds = new Set<string>();
  changes.forEach((c, n) => {
    const where = `changes[${n}]`;
    const kind: CampRosterKind = c?.kind === 'foreign' ? 'foreign' : 'mentor';
    const list = rows[kind];
    if (c?.action === 'add') {
      const cells = checkCells(kind, tier, c.cells, where, errors);
      const need = kind === 'mentor' ? ['role', 'group', 'name'] : ['group', 'subject', 'englishName'];
      const miss = need.filter((k) => !String(cells[k] ?? '').trim());
      if (miss.length) errors.push(`${where}: 새 줄에는 ${miss.join(', ')} 칸이 필요합니다`);
      const row: Row = { cells: Object.fromEntries(Object.entries(cells).filter(([, v]) => v.trim())), userId: c.userId || null, _noLink: c.userId === null };
      // 같은 역할·그룹 줄들 바로 뒤에 넣는다 (관리시트 순서처럼)
      const same = (r: Row) => kind === 'mentor' ? r.cells.role === row.cells.role && r.cells.group === row.cells.group : r.cells.group === row.cells.group;
      let at = -1;
      list.forEach((r, i) => { if (same(r)) at = i; });
      list.splice(at >= 0 ? at + 1 : list.length, 0, row);
      return;
    }
    if (c?.action === 'update') {
      const i = findRow(list, kind, c.target, where);
      const cells = checkCells(kind, tier, c.cells, where, errors);
      const next = { ...list[i].cells };
      for (const [k, v] of Object.entries(cells)) { if (v.trim()) next[k] = v; else delete next[k]; }
      const nameKey = kind === 'mentor' ? 'name' : 'englishName';
      const renamed = (next[nameKey] ?? '') !== (list[i].cells[nameKey] ?? '');
      if (c.userId !== undefined) list[i] = { cells: next, userId: c.userId || null, _noLink: c.userId === null };
      // 다른 사람으로 바꾸면(이름이 바뀜) 옛 연결을 버리고 새 이름으로 찾는다
      else if (renamed) list[i] = { cells: next, userId: null, _noLink: false };
      else list[i] = { ...list[i], cells: next };
      return;
    }
    if (c?.action === 'remove') {
      const i = findRow(list, kind, c.target, where);
      if (list[i].userId) removeIds.add(list[i].userId as string);
      list.splice(i, 1);
      return;
    }
    errors.push(`${where}: action 은 add · update · remove 중 하나입니다`);
  });
  return { mentors: rows.mentor, foreign: rows.foreign, removeIds };
}

const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
};

type Plan = { jobCodeId: string; camp: string; mentors: Row[]; foreign: Row[]; removeUserIds: string[]; rosterUpdatedAt: string | null };

export async function writeCampRosterForMcp(input: WriteRosterInput, viewer: Viewer) {
  requireAdmin(viewer);
  const db = getAdminFirestore();

  // confirm — dry-run 때 보관한 계획을 그대로 실행
  if (input.confirm) {
    if (!input.previewHash) throw new DataToolError('confirm 에는 dry-run 이 돌려준 previewHash 가 필요합니다.');
    const ref = db.collection(PENDING).doc(`roster-${input.previewHash}`);
    const snap = await ref.get();
    const d = snap.data();
    if (!snap.exists || !d || d.uid !== viewer.uid || d.kind !== 'camp-roster') {
      throw new DataToolError('이 previewHash 로 보관된 캠프 배정 dry-run 이 없습니다 (이미 실행했거나, 다른 계정이거나, 30분이 지남). dry-run 부터 다시 하세요.');
    }
    if ((d.expiresAt?.toMillis?.() ?? 0) < Date.now()) {
      await ref.delete().catch(() => undefined);
      throw new DataToolError('보관 시간(30분)이 지났습니다. dry-run 부터 다시 하세요.');
    }
    const plan = JSON.parse(String(d.plan)) as Plan;
    const cur = await readRosterDoc({ id: plan.jobCodeId, code: plan.camp });
    if ((cur?.updatedAt ?? null) !== plan.rosterUpdatedAt) {
      throw new DataToolError('dry-run 뒤에 이 캠프 선생님 표가 바뀌었습니다 (다른 관리자 저장). dry-run 부터 다시 하세요.');
    }
    let res: Awaited<ReturnType<typeof saveCampRoster>>;
    try {
      res = await saveCampRoster(plan.jobCodeId, { mentors: plan.mentors as CampRosterRow[], foreign: plan.foreign as CampRosterRow[], removeUserIds: plan.removeUserIds }, { uid: viewer.uid, name: viewer.name });
    } catch (e) {
      if (e instanceof CampRosterError) throw new DataToolError(e.message);
      throw e;
    }
    await db.collection('mcpAuditLogs').add({
      uid: viewer.uid, name: viewer.name, role: viewer.role, note: String(d.note ?? ''), previewHash: input.previewHash, kind: 'camp-roster',
      operations: [{ op: 'update', collection: 'campRosters', id: plan.camp || plan.jobCodeId, summary: `${plan.camp} 선생님 표 저장 — 배정 ${res.assigned}명, 해제 ${res.removed.length}명` }],
      at: Timestamp.now(),
    });
    await writeAuditLog({
      action: 'USER_CAMP_CHANGE', category: 'ACCOUNT', performedBy: viewer.uid, performedByName: viewer.name,
      targetLabel: `캠프 선생님 표 저장 (${plan.camp}, MCP)`, metadata: { by: 'mcp', jobCodeId: plan.jobCodeId, assigned: res.assigned, removed: res.removed },
    });
    await ref.delete().catch(() => undefined);
    clearAiContentCache();
    return { mode: 'executed' as const, ok: true, camp: plan.camp, assigned: res.assigned, removed: res.removed, unlinkedRows: res.unmatched, warnings: res.warnings };
  }

  // dry-run
  const jc = await resolveCamp(input.camp);
  const doc = await readRosterDoc(jc);
  const errors: string[] = [];
  const hasTable = Array.isArray(input.mentors) || Array.isArray(input.foreign);
  const hasChanges = Array.isArray(input.changes) && input.changes.length > 0;
  if (hasTable === hasChanges) throw new DataToolError('changes(줄 단위 변경) 또는 mentors·foreign(표 전체) 중 하나만 보내세요.');

  let mentors: Row[];
  let foreign: Row[];
  let explicitRemove = new Set<string>();
  if (hasChanges) {
    const r = applyChanges(doc, jc.tier, input.changes!, errors);
    mentors = r.mentors; foreign = r.foreign; explicitRemove = r.removeIds;
  } else {
    const take = (kind: CampRosterKind, rows: Row[] | undefined) => {
      if (!Array.isArray(rows)) return docRows(doc, kind);   // 한쪽만 보내면 다른 쪽은 지금 표 그대로
      // 지금 표에서 계정 연결 없이 두었던 이름은 계속 연결하지 않는다
      const unlinkedNow = new Set(docRows(doc, kind).filter((r) => !r.userId).map((r) => rosterMatchName(kind, r as CampRosterRow)).filter(Boolean));
      return rows.map((r, i) => {
        const cells = checkCells(kind, jc.tier, r?.cells, `${kind === 'mentor' ? 'mentors' : 'foreign'}[${i}]`, errors);
        const name = rosterMatchName(kind, { cells } as CampRosterRow);
        return { cells, userId: r?.userId || null, _noLink: r?.userId === null || (!r?.userId && unlinkedNow.has(name)) };
      });
    };
    mentors = take('mentor', input.mentors);
    foreign = take('foreign', input.foreign);
  }
  if (mentors.length > MAX_ROWS || foreign.length > MAX_ROWS) errors.push(`표는 ${MAX_ROWS}줄까지입니다.`);

  // 사람 연결 — 지정한 userId → 이미 연결된 줄 → 이름으로 하나뿐인 후보 (원래 연결 없던 줄은 그대로)
  const users = await loadUsers(jc.id);
  const byId = new Map(users.map((u) => [u.id, u]));
  const unlinked: string[] = [];
  const link = (kind: CampRosterKind, rows: Row[]) => rows.forEach((r, i) => {
    const name = rosterMatchName(kind, r as CampRosterRow);
    const where = `${kind === 'mentor' ? '멘토' : '원어민'} ${i}번 줄(${name || '이름 없음'})`;
    if (r.userId) {
      const u = byId.get(r.userId);
      const pool = kind === 'mentor' ? MENTOR_POOL_ROLES : FOREIGN_POOL_ROLES;
      if (!u) errors.push(`${where}: userId ${r.userId} 사용자가 없거나 비활성입니다`);
      else if (!pool.includes(u.role)) errors.push(`${where}: ${u.name} 님은 ${u.role} 계정이라 ${kind === 'mentor' ? '멘토' : '원어민'} 표에 넣을 수 없습니다`);
      return;
    }
    if (!name) return;
    if (r._noLink) { unlinked.push(name); return; }
    const cands = candidatesFor(kind, name, users);
    const inCamp = cands.filter((c) => c.inCamp);
    const pick = cands.length === 1 ? cands[0] : inCamp.length === 1 ? inCamp[0] : null;
    if (pick) { r.userId = pick.id; return; }
    if (cands.length > 1) {
      errors.push(`${where}: 같은 이름 후보가 ${cands.length}명 — userId 로 골라 주세요: ${cands.map((c) => `${c.name}(${c.role}${c.university ? `·${c.university}` : ''}${c.inCamp ? '·이 캠프' : ''}) ${c.id}`).join(' / ')}`);
      return;
    }
    unlinked.push(name);   // 사이트 계정이 없는 사람 — 표에는 남고 배정은 안 됨 (예: '여(1차)' 자리표시)
  });
  link('mentor', mentors);
  link('foreign', foreign);
  // 저장 때와 같은 정리 (병합 칸 이어받기 · 빈 줄 빼기)
  mentors = prepRosterRows(mentors as CampRosterRow[], 'mentor', jc.tier);
  foreign = prepRosterRows(foreign as CampRosterRow[], 'foreign', jc.tier);
  const seen = new Map<string, string>();
  [...mentors.map((r) => ['mentor', r] as const), ...foreign.map((r) => ['foreign', r] as const)].forEach(([kind, r]) => {
    if (!r.userId) return;
    const n = rosterMatchName(kind, r as CampRosterRow);
    if (seen.has(r.userId)) errors.push(`${byId.get(r.userId)?.name ?? r.userId} 님이 두 줄(${seen.get(r.userId)}, ${n})에 연결돼 있습니다`);
    seen.set(r.userId, n);
  });

  // 해제할 사람 — 줄 단위: remove 한 사람 / 표 전체: removeMissing 이면 표에 없는 사람 전부
  const keep = new Set(seen.keys());
  const candidates = removalsOf(jc.id, users, keep, doc);
  const removeUserIds = (hasChanges ? candidates.filter((c) => explicitRemove.has(c.userId)) : input.removeMissing ? candidates : []).map((c) => c.userId);
  const notRemoved = candidates.filter((c) => !removeUserIds.includes(c.userId));

  if (errors.length) {
    return { mode: 'dry-run' as const, ok: false, message: `${errors.length}개 문제가 있어 실행할 수 없습니다. 고쳐서 다시 호출하세요.`, errors };
  }

  // 미리보기 — 사람별 배정 전/후
  const warnings: string[] = [];
  const acctKeys = rosterAccountKeys('mentor', jc.tier);
  const sentAccount = [...(input.mentors ?? []), ...(input.changes ?? []).filter((c) => c?.kind !== 'foreign')]
    .some((r) => acctKeys.some((k) => String((r?.cells as Record<string, unknown> | undefined)?.[k] ?? '').trim()));
  if (sentAccount) warnings.push('멘토 영어 이름 · 성별은 계정 값(멘토가 직접 넣은 값)으로 저절로 채워져서 보낸 값은 쓰지 않았습니다 — 안 넣은 멘토는 빈 칸입니다.');
  const people: Array<Record<string, unknown>> = [];
  const describe = (kind: CampRosterKind, r: Row) => {
    const u = byId.get(r.userId as string) as UserLite;
    const curExp = u.data.jobExperiences?.find?.((e: any) => e?.id === jc.id);
    const nextExp = nextExperience(kind, r.cells, curExp, jc.id, u.name, warnings);
    const prof = profileUpdatesOf(kind, r.cells, { name: u.name, englishNickname: u.englishNickname, gender: u.data.gender }, warnings);
    const before = u.inCamp ? expText(curExp) : '';
    const after = expText(nextExp);
    const change = !u.inCamp ? '등록' : before !== after ? '변경' : prof.englishNickname || prof.gender ? '프로필' : '그대로';
    if (change === '그대로') return;
    people.push({
      change, name: u.name, userId: u.id, ...(before ? { before } : {}), after,
      ...(prof.englishNickname ? { englishName: `${u.englishNickname || '(없음)'} → ${prof.englishNickname}` } : {}),
      ...(prof.gender ? { gender: prof.gender } : {}),
    });
  };
  mentors.forEach((r) => r.userId && describe('mentor', r));
  foreign.forEach((r) => r.userId && describe('foreign', r));
  removeUserIds.forEach((id) => {
    const u = byId.get(id)!;
    people.push({ change: '해제', name: u.name, userId: id, before: expText(u.data.jobExperiences?.find?.((e: any) => e?.id === jc.id)) });
  });

  // 반 정보 · 숙소 방 (저장하면 같이 바뀌는 것)
  const settings = (await db.collection('campSettings').doc(jc.code).get()).data() ?? {};
  const classInfo: string[] = [];
  mentors.forEach((r) => {
    const cc = String(r.cells.classCode ?? '').toUpperCase();
    if (!/^[A-Z]{1,3}\d{1,3}$/.test(cc)) return;
    const cur = (settings.classInfo ?? {})[cc] ?? {};
    const diff = ([['classroom', 'classroom', '강의실'], ['className', 'className', '반이름'], ['textbook', 'bookCode', '교재']] as const)
      .filter(([k, f]) => r.cells[k] && r.cells[k] !== cur[f]).map(([k, f, label]) => `${label} ${cur[f] || '(없음)'} → ${r.cells[k]}`);
    if (diff.length) classInfo.push(`${cc}: ${diff.join(', ')}`);
  });
  const rooms = [...mentors, ...foreign].filter((r) => r.userId && rosterRoomNum(r.cells.room ?? '')).map((r) => `${byId.get(r.userId as string)?.name} → ${rosterRoomNum(r.cells.room ?? '')}호`);

  const plan: Plan = { jobCodeId: jc.id, camp: jc.code, mentors, foreign, removeUserIds, rosterUpdatedAt: doc?.updatedAt ?? null };
  const previewHash = createHash('sha256').update(canonical({ uid: viewer.uid, plan })).digest('hex').slice(0, 24);
  const expiresAt = Timestamp.fromMillis(Date.now() + TTL_MS);
  await db.collection(PENDING).doc(`roster-${previewHash}`).set({ uid: viewer.uid, kind: 'camp-roster', plan: JSON.stringify(plan), note: input.note ?? '', createdAt: Timestamp.now(), expiresAt });

  const rowText = (kind: CampRosterKind) => (r: Row) =>
    [kind === 'mentor' ? r.cells.role : '', r.cells.group, kind === 'mentor' ? r.cells.classCode : r.cells.subject, rosterMatchName(kind, r as CampRosterRow)]
      .filter(Boolean).join(' ') + (r.userId ? '' : ' (계정 연결 없음)');
  return {
    mode: 'dry-run' as const,
    ok: true,
    message: `아무것도 변경되지 않았습니다. 아래 미리보기를 사용자에게 보여주고 승인받은 뒤 write_camp_roster({ confirm: true, previewHash }) 를 보내면 실행됩니다 (30분 보관).`,
    previewHash,
    camp: { code: jc.code, name: `${jc.generation} ${jc.name}`.trim() },
    people,
    ...(classInfo.length ? { classInfo } : {}),
    ...(rooms.length ? { rooms } : {}),
    ...(unlinked.length ? { unlinkedRows: unlinked } : {}),
    ...(notRemoved.length ? { stillAssignedButNotInTable: notRemoved.map((c) => `${c.name} (${c.role}) ${c.userId}`) } : {}),
    ...(warnings.length ? { warnings: [...new Set(warnings)] } : {}),
    table: { mentors: mentors.map(rowText('mentor')), foreign: foreign.map(rowText('foreign')) },
  };
}
