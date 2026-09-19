/**
 * MCP 범용 데이터 도구 — describe_schema / query_documents / get_document / write_documents
 *
 * 작업별 전용 도구 대신, datamodel.ts 의 스키마 선언을 기준으로 어떤 컬렉션이든
 * 같은 규칙으로 읽고(권한·개인정보 제거) 쓸 수 있게(관리자, dry-run → confirm, 감사 로그) 한다.
 * 새 작업이 생겨도 코드를 바꿀 필요 없이 AI 가 스키마를 읽고 조합한다.
 */
import { createHash, randomUUID } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import type { CollectionReference, DocumentData, Firestore, Query } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { ACCESS_LABEL, canAccess, type Viewer } from '@/lib/ai-content/site';
import { clearAiContentCache, getCamps } from '@/lib/ai-content/data';
import { COLLECTIONS, DATA_TOOL_LIMITS, EXCLUDED_COLLECTIONS, RECIPES, type CollectionSpec, type FieldSpec, type WriteOp } from './datamodel';

// ─── 타입 ─────────────────────────────────────────────────────────────────

export class DataToolError extends Error {}

export type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not-in' | 'array-contains' | 'contains' | 'exists';
export interface WhereClause {
  field: string;
  op: WhereOp;
  value?: unknown;
}
export interface QueryInput {
  collection: string;
  parentId?: string;
  where?: WhereClause[];
  orderBy?: { field: string; direction?: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
  fields?: string[];
  includeLarge?: boolean;
}
export interface GetInput {
  collection: string;
  id: string;
  parentId?: string;
  fields?: string[];
  includeLarge?: boolean;
}
export interface WriteOperation {
  op: WriteOp;
  collection: string;
  id?: string;
  data?: Record<string, unknown>;
}
export interface WriteInput {
  operations: WriteOperation[];
  note?: string;
  confirm?: boolean;
  previewHash?: string;
}

interface OpResult {
  index: number;
  op: WriteOp;
  collection: string;
  id: string | null;
  ok: boolean;
  errors: string[];
  warnings: string[];
  summary?: string;
  before?: unknown;
  after?: unknown;
  changes?: Record<string, { before: unknown; after: unknown }>;
}

interface PreparedOp {
  result: OpResult;
  spec?: CollectionSpec;
  id: string | null;
  payload?: Record<string, unknown>;
}

// ─── 날짜/직렬화 유틸 ─────────────────────────────────────────────────────

const KST_OFFSET_MS = 9 * 3600 * 1000;
const DATE_INPUT_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const NESTED_DATE_KEY_RE = /^(start|end|date|at)$|At$|Date$/;

function isTimestampLike(v: unknown): v is { toDate: () => Date } {
  return !!v && typeof v === 'object' && typeof (v as { toDate?: unknown }).toDate === 'function';
}

function isDocRefLike(v: unknown): boolean {
  return !!v && typeof v === 'object' && typeof (v as { path?: unknown }).path === 'string' && typeof (v as { get?: unknown }).get === 'function';
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !isTimestampLike(v) && !(v instanceof Date) && !isDocRefLike(v);
}

/** Date → 한국시간 ISO 문자열 (2026-12-05T00:00:00+09:00) */
export function toKstIso(d: Date): string {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}T${p(k.getUTCHours())}:${p(k.getUTCMinutes())}:${p(k.getUTCSeconds())}+09:00`;
}

/** 'YYYY-MM-DD'(한국시간 자정) / 'YYYY-MM-DDTHH:mm'(한국시간) / ISO 8601 → Date */
export function parseDateInput(s: string): Date | null {
  if (!DATE_INPUT_RE.test(s)) return null;
  let iso = s;
  if (!s.includes('T')) iso = `${s}T00:00:00+09:00`;
  else if (!/(Z|[+-]\d{2}:\d{2})$/.test(s)) iso = `${s}+09:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Firestore 값 → JSON 친화 값 (Timestamp → KST ISO) */
function serialize(v: unknown, depth = 0): unknown {
  if (v === undefined || v === null) return null;
  if (isTimestampLike(v)) return toKstIso(v.toDate());
  if (v instanceof Date) return toKstIso(v);
  if (isDocRefLike(v)) return `ref:${(v as { path: string }).path}`;
  if (Array.isArray(v)) return v.map((x) => serialize(x, depth + 1));
  if (typeof v === 'object') {
    if (depth > 12) return '[too deep]';
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = serialize(x, depth + 1);
    return out;
  }
  return v;
}

/** 비교용 정규화 — Timestamp/Date/날짜 문자열은 ms, 객체는 JSON */
function cmpKey(v: unknown): number | string | boolean | null {
  if (v === undefined || v === null) return null;
  if (isTimestampLike(v)) return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') {
    if (DATE_INPUT_RE.test(v)) {
      const d = parseDateInput(v);
      if (d) return d.getTime();
    }
    return v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  return JSON.stringify(serialize(v));
}

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function deletePath(obj: Record<string, unknown>, path: string) {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlainObject(cur)) return;
    const next = cur[parts[i]];
    if (!isPlainObject(next)) return;
    cur[parts[i]] = { ...next }; // 원본 스냅샷 데이터를 건드리지 않도록 복사
    cur = cur[parts[i]];
  }
  if (isPlainObject(cur)) delete cur[parts[parts.length - 1]];
}

// ─── 민감 키 방어선 (hidden 목록과 별개로 항상 적용) ───────────────────────

/**
 * 키 이름으로 개인정보를 막는 최후 방어선.
 *
 * 단순 부분 문자열 비교는 오탐이 난다 (예: "className" 안에 "ssn").
 * 그래서 키를 낱말 단위(camelCase·snake·kebab)로 쪼개 낱말이 일치할 때만 막고,
 * 낱말로 안 쪼개지는 합성어만 부분 문자열로 따로 검사한다.
 */
const SENSITIVE_SEGMENTS = new Set([
  'email',
  'phone',
  'mobile',
  'tel',
  'address',
  'addr',
  'rrn',
  'ssn',
  'passport',
  'birth',
  'birthday',
  'bank',
  'bankbook',
  'account',
  'password',
  'secret',
  'token',
  'geocode',
  'medication',
  'meds',
  'allergy',
  'allergies',
  'allerg',
  'resident',
]);

const SENSITIVE_SUBSTRINGS = ['residentreg', 'idcard', 'cvurl', 'bankbook', 'dateofbirth', 'phonenumber'];

/** 키를 낱말 단위로 분해: "rrnFront" → ["rrn","front"], "parent_phone" → ["parent","phone"] */
function keySegments(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .map((s) => s.toLowerCase())
    .filter(Boolean);
}

export function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  if (SENSITIVE_SUBSTRINGS.some((p) => k.includes(p))) return true;
  return keySegments(key).some((s) => SENSITIVE_SEGMENTS.has(s));
}

function scrubSensitive(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(scrubSensitive);
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (!isSensitiveKey(k)) out[k] = scrubSensitive(x);
    return out;
  }
  return v;
}

// ─── 스키마/권한 ──────────────────────────────────────────────────────────

function getSpec(name: string): CollectionSpec {
  const spec = COLLECTIONS[name];
  if (spec) return spec;
  if (EXCLUDED_COLLECTIONS[name]) throw new DataToolError(`"${name}" 컬렉션은 AI 접근이 차단되어 있습니다: ${EXCLUDED_COLLECTIONS[name]}`);
  throw new DataToolError(`"${name}" 은 알 수 없는 컬렉션입니다. describe_schema 로 목록을 확인하세요.`);
}

function assertRead(spec: CollectionSpec, viewer: Viewer) {
  if (!canAccess(spec.read, viewer)) throw new DataToolError(`${spec.name} 은 ${ACCESS_LABEL[spec.read]} 계정만 읽을 수 있습니다.`);
}

interface ScopeCtx {
  campIds: Set<string>;
  campCodes: Set<string>;
}

async function scopeCtx(viewer: Viewer): Promise<ScopeCtx> {
  const campIds = new Set<string>([...viewer.jobCodeIds, ...(viewer.activeJobCodeId ? [viewer.activeJobCodeId] : [])]);
  if (viewer.role === 'admin') return { campIds, campCodes: new Set() };
  const camps = await getCamps();
  return { campIds, campCodes: new Set(camps.filter((c) => campIds.has(c.id)).map((c) => c.code)) };
}

function inScope(spec: CollectionSpec, id: string, data: DocumentData, viewer: Viewer, ctx: ScopeCtx): boolean {
  if (viewer.role === 'admin') return true;
  const s = spec.scope;
  switch (s.kind) {
    case 'none':
      return true;
    case 'camp-id':
      return ctx.campIds.has(String(data[s.field] ?? ''));
    case 'camp-code':
      return ctx.campCodes.has(String(data[s.field] ?? ''));
    case 'doc-id-camp-id':
      return ctx.campIds.has(id);
    case 'doc-id-camp-code':
      return ctx.campCodes.has(id);
    case 'own-user':
      return data[s.field] === viewer.uid;
  }
}

function scopeLabel(spec: CollectionSpec): string {
  const s = spec.scope;
  switch (s.kind) {
    case 'none':
      return '제한 없음';
    case 'camp-id':
      return `관리자 외에는 ${s.field} 가 본인 참여 캠프 ID 인 문서만`;
    case 'camp-code':
      return `관리자 외에는 ${s.field} 가 본인 참여 캠프 코드인 문서만`;
    case 'doc-id-camp-id':
      return '관리자 외에는 문서 ID 가 본인 참여 캠프 ID 인 문서만';
    case 'doc-id-camp-code':
      return '관리자 외에는 문서 ID 가 본인 참여 캠프 코드인 문서만';
    case 'own-user':
      return `관리자 외에는 ${s.field} 가 본인 uid 인 문서만`;
  }
}

function colRef(db: Firestore, spec: CollectionSpec, parentId?: string): CollectionReference {
  if (!spec.parent) return db.collection(spec.name);
  if (!parentId) throw new DataToolError(`${spec.name} 은 ${spec.parent.collection} 의 서브컬렉션입니다. parentId 가 필요합니다 (${spec.parent.description}).`);
  return db.collection(spec.parent.collection).doc(parentId).collection(spec.name);
}

async function assertParentAccess(db: Firestore, spec: CollectionSpec, parentId: string | undefined, viewer: Viewer, ctx: ScopeCtx) {
  if (!spec.parent) return;
  if (!parentId) throw new DataToolError(`${spec.name} 조회에는 parentId 가 필요합니다 (${spec.parent.description}).`);
  const parentSpec = getSpec(spec.parent.collection);
  assertRead(parentSpec, viewer);
  const snap = await db.collection(parentSpec.name).doc(parentId).get();
  if (!snap.exists) throw new DataToolError(`상위 문서 ${parentSpec.name}/${parentId} 가 없습니다.`);
  if (!inScope(parentSpec, parentId, snap.data() ?? {}, viewer, ctx)) throw new DataToolError(`상위 문서 ${parentSpec.name}/${parentId} 에 접근 권한이 없습니다.`);
}

function docPath(spec: CollectionSpec, id: string, parentId?: string): string {
  return spec.parent ? `${spec.parent.collection}/${parentId}/${spec.name}/${id}` : `${spec.name}/${id}`;
}

// ─── 읽기 응답 정리 ───────────────────────────────────────────────────────

interface ReadOpts {
  fields?: string[];
  includeLarge: boolean;
}

function stripForRead(raw: DocumentData, spec: CollectionSpec, viewer: Viewer, opts: ReadOpts): Record<string, unknown> {
  let data: Record<string, unknown> = { ...raw };
  for (const path of spec.hidden ?? []) deletePath(data, path);
  if (viewer.role !== 'admin') for (const [k, f] of Object.entries(spec.fields)) if (f.adminOnly) delete data[k];
  if (!spec.openRead) {
    const allowed = new Set([...Object.keys(spec.fields), ...(spec.serverManaged ?? [])]);
    for (const k of Object.keys(data)) if (!allowed.has(k)) delete data[k];
  }
  data = scrubSensitive(data) as Record<string, unknown>;
  const omitted: string[] = [];
  if (!opts.includeLarge) {
    for (const [k, f] of Object.entries(spec.fields)) {
      if (f.large && k in data && !opts.fields?.includes(k)) {
        omitted.push(k);
        delete data[k];
      }
    }
  }
  if (opts.fields?.length) {
    const keep = new Set(opts.fields);
    for (const k of Object.keys(data)) if (!keep.has(k)) delete data[k];
  }
  const out = serialize(data) as Record<string, unknown>;
  if (omitted.length) out._omittedLargeFields = omitted;
  return out;
}

function assertQueryableField(spec: CollectionSpec, field: string) {
  const top = field.split('.')[0];
  if (isSensitiveKey(field) || spec.hidden?.some((h) => h === field || field.startsWith(`${h}.`) || h.startsWith(`${field}.`))) {
    throw new DataToolError(`"${field}" 는 숨김(민감) 필드라 조건·정렬에 쓸 수 없습니다.`);
  }
  if (!spec.openRead && !spec.fields[top] && !spec.serverManaged?.includes(top)) {
    throw new DataToolError(`"${field}" 는 ${spec.name} 스키마에 없는 필드입니다. describe_schema("${spec.name}") 로 확인하세요.`);
  }
}

// ─── 조건 평가 ────────────────────────────────────────────────────────────

const WHERE_OPS: WhereOp[] = ['==', '!=', '<', '<=', '>', '>=', 'in', 'not-in', 'array-contains', 'contains', 'exists'];

function eq(a: unknown, b: unknown): boolean {
  return cmpKey(a) === cmpKey(b);
}

function matches(doc: DocumentData, w: WhereClause): boolean {
  const actual = getPath(doc, w.field);
  switch (w.op) {
    case '==':
      return eq(actual, w.value);
    case '!=':
      return !eq(actual, w.value);
    case '<':
    case '<=':
    case '>':
    case '>=': {
      const a = cmpKey(actual);
      const b = cmpKey(w.value);
      if (a === null || b === null || typeof a !== typeof b) return false;
      if (w.op === '<') return a < b;
      if (w.op === '<=') return a <= b;
      if (w.op === '>') return a > b;
      return a >= b;
    }
    case 'in':
      return Array.isArray(w.value) && w.value.some((x) => eq(actual, x));
    case 'not-in':
      return Array.isArray(w.value) && !w.value.some((x) => eq(actual, x));
    case 'array-contains':
      return Array.isArray(actual) && actual.some((x) => eq(x, w.value));
    case 'contains':
      return typeof actual === 'string' && typeof w.value === 'string' && actual.toLowerCase().includes(w.value.toLowerCase());
    case 'exists':
      return (actual !== undefined && actual !== null) === (w.value !== false);
  }
}

/** Firestore 에 넘길 값 — timestamp 필드는 날짜 문자열을 Timestamp 로 */
function toFirestoreValue(v: unknown, f?: FieldSpec): unknown {
  if (f?.type === 'timestamp' && typeof v === 'string') {
    const d = parseDateInput(v);
    if (d) return Timestamp.fromDate(d);
  }
  return v;
}

// ─── describe_schema ──────────────────────────────────────────────────────

export function describeSchema(viewer: Viewer, collection?: string) {
  const isAdmin = viewer.role === 'admin';
  if (!collection) {
    const readable = Object.values(COLLECTIONS).filter((s) => canAccess(s.read, viewer));
    return {
      rules: [
        '읽기: query_documents(조건·정렬·페이지) 와 get_document(단건). 타임스탬프는 한국시간 ISO 문자열(+09:00)로 반환된다. large 필드(HTML 본문 등)는 query_documents 에서 기본 생략되므로 includeLarge=true 또는 fields 로 요청한다.',
        '개인정보(연락처·주소·주민번호·생년월일·인증정보 등)는 어떤 컬렉션에서도 반환·조건 지정이 되지 않는다.',
        '쓰기: write_documents 는 관리자 전용. confirm 없이 호출하면 dry-run — 검증·미리보기·previewHash 만 돌려주고 아무것도 바꾸지 않는다. 사용자에게 미리보기를 보여주고 승인받은 뒤 같은 operations + previewHash + confirm=true 로 재호출하면 한 번의 배치로 실행되고 mcpAuditLogs 에 기록된다.',
        '날짜 입력: "YYYY-MM-DD"(한국시간 자정) 또는 ISO 8601. 객체 안의 start/end/date/…At/…Date 키의 날짜 문자열도 같은 규칙으로 Timestamp 가 된다.',
        'update 는 지정한 최상위 필드만 교체한다(배열·객체는 통째로). 지정하지 않은 필드는 유지. 서버 관리 필드(createdAt 등)와 숨김 필드는 지정할 수 없다.',
        `한 번의 write_documents 에 최대 ${DATA_TOOL_LIMITS.maxWriteOps}개 작업. query 는 기본 ${DATA_TOOL_LIMITS.queryDefaultLimit}건, 최대 ${DATA_TOOL_LIMITS.queryMaxLimit}건, 메모리 필터는 처음 ${DATA_TOOL_LIMITS.scanCap}건까지만 훑는다 (== / in 조건은 Firestore 에서 바로 걸러지므로 우선 사용).`,
      ],
      limits: DATA_TOOL_LIMITS,
      collections: readable.map((s) => ({
        name: s.name,
        description: s.description,
        read: ACCESS_LABEL[s.read],
        write: isAdmin && s.write ? s.write.ops : [],
        parent: s.parent ? `${s.parent.collection}/{parentId}/${s.name} (${s.parent.description})` : undefined,
        scope: scopeLabel(s),
        idOnCreate: s.write?.ops.includes('create') ? s.idOnCreate ?? 'auto' : undefined,
        fields: Object.keys(s.fields).join(', '),
      })),
      excluded: EXCLUDED_COLLECTIONS,
      recipes: RECIPES,
    };
  }

  const spec = getSpec(collection);
  assertRead(spec, viewer);
  const forced = spec.forcedOnCreate ? Object.keys(spec.forcedOnCreate(viewer)) : [];
  return {
    name: spec.name,
    description: spec.description,
    read: ACCESS_LABEL[spec.read],
    write: isAdmin && spec.write ? spec.write.ops : [],
    parent: spec.parent ? `${spec.parent.collection}/{parentId}/${spec.name} (${spec.parent.description})` : undefined,
    scope: scopeLabel(spec),
    idOnCreate: spec.write?.ops.includes('create') ? spec.idOnCreate ?? 'auto' : undefined,
    hidden: spec.hidden ?? [],
    serverManaged: spec.serverManaged ?? [],
    forcedOnCreate: forced,
    notes: spec.notes ?? [],
    fields: Object.entries(spec.fields)
      .filter(([, f]) => isAdmin || !f.adminOnly)
      .map(([name, f]) => ({
        name,
        type: f.type,
        description: f.description,
        required: f.required ?? false,
        writable: isAdmin && !!spec.write && (f.writable ?? false),
        enum: f.enum,
        large: f.large,
        ref: f.ref ? `${f.ref.collection}.${f.ref.by}` : undefined,
      })),
  };
}

// ─── query_documents ──────────────────────────────────────────────────────

export async function queryDocuments(input: QueryInput, viewer: Viewer) {
  const spec = getSpec(input.collection);
  assertRead(spec, viewer);
  const db = getAdminFirestore();
  const ctx = await scopeCtx(viewer);
  await assertParentAccess(db, spec, input.parentId, viewer, ctx);
  const ref = colRef(db, spec, input.parentId);

  const where = input.where ?? [];
  for (const w of where) {
    if (!w.field) throw new DataToolError('where 항목에 field 가 없습니다.');
    if (!WHERE_OPS.includes(w.op)) throw new DataToolError(`지원하지 않는 연산자 "${w.op}". 사용 가능: ${WHERE_OPS.join(' ')}`);
    assertQueryableField(spec, w.field);
    if ((w.op === 'in' || w.op === 'not-in') && (!Array.isArray(w.value) || w.value.length === 0)) throw new DataToolError(`${w.field}: ${w.op} 의 value 는 비어 있지 않은 배열이어야 합니다.`);
  }
  if (input.orderBy) assertQueryableField(spec, input.orderBy.field);
  for (const f of input.fields ?? []) assertQueryableField(spec, f);

  const limit = Math.min(Math.max(input.limit ?? DATA_TOOL_LIMITS.queryDefaultLimit, 1), DATA_TOOL_LIMITS.queryMaxLimit);
  const offset = Math.max(input.offset ?? 0, 0);

  // == 전부, in 하나까지 Firestore 로 내려보내고 나머지는 메모리에서 거른다 (복합 색인 불필요)
  let q: Query = ref;
  let usedIn = false;
  const pushed: WhereClause[] = [];
  for (const w of where) {
    const f = spec.fields[w.field.split('.')[0]];
    if (w.op === '==' && w.value !== undefined && !isPlainObject(w.value) && !Array.isArray(w.value)) {
      q = q.where(w.field, '==', toFirestoreValue(w.value, f));
      pushed.push(w);
    } else if (w.op === 'in' && !usedIn && Array.isArray(w.value) && w.value.length <= DATA_TOOL_LIMITS.maxInValues) {
      q = q.where(w.field, 'in', w.value.map((v) => toFirestoreValue(v, f)));
      usedIn = true;
      pushed.push(w);
    }
  }

  const snap = await q.limit(DATA_TOOL_LIMITS.scanCap).get();
  const scanned = snap.docs.length;
  let rows = snap.docs.map((d) => ({ id: d.id, data: d.data() ?? {} }));
  rows = rows.filter((r) => inScope(spec, r.id, r.data, viewer, ctx) && where.every((w) => matches(r.data, w)));

  if (input.orderBy) {
    const { field, direction = 'asc' } = input.orderBy;
    const sign = direction === 'desc' ? -1 : 1;
    rows.sort((a, b) => {
      const ka = cmpKey(getPath(a.data, field));
      const kb = cmpKey(getPath(b.data, field));
      if (ka === null && kb === null) return 0;
      if (ka === null) return 1;
      if (kb === null) return -1;
      if (ka < kb) return -1 * sign;
      if (ka > kb) return 1 * sign;
      return 0;
    });
  }

  const matched = rows.length;
  const page = rows.slice(offset, offset + limit);
  const opts: ReadOpts = { fields: input.fields, includeLarge: !!input.includeLarge };
  const scanCapped = scanned >= DATA_TOOL_LIMITS.scanCap;
  return {
    collection: spec.name,
    parentId: input.parentId,
    scanned,
    matched,
    offset,
    returned: page.length,
    hasMore: offset + page.length < matched,
    ...(scanCapped ? { warning: `Firestore 에서 처음 ${DATA_TOOL_LIMITS.scanCap}건만 읽었습니다. == 또는 in 조건으로 더 좁히세요 (현재 서버 필터: ${pushed.map((w) => w.field).join(', ') || '없음'}).` } : {}),
    documents: page.map((r) => ({ _id: r.id, ...stripForRead(r.data, spec, viewer, opts) })),
  };
}

// ─── get_document ─────────────────────────────────────────────────────────

export async function getDocument(input: GetInput, viewer: Viewer) {
  const spec = getSpec(input.collection);
  assertRead(spec, viewer);
  if (!input.id) throw new DataToolError('id 가 필요합니다.');
  for (const f of input.fields ?? []) assertQueryableField(spec, f);
  const db = getAdminFirestore();
  const ctx = await scopeCtx(viewer);
  await assertParentAccess(db, spec, input.parentId, viewer, ctx);
  const snap = await colRef(db, spec, input.parentId).doc(input.id).get();
  const path = docPath(spec, input.id, input.parentId);
  if (!snap.exists) throw new DataToolError(`${path} 문서가 없습니다.`);
  const data = snap.data() ?? {};
  if (!inScope(spec, input.id, data, viewer, ctx)) throw new DataToolError(`${path} 에 접근 권한이 없습니다.`);
  return { _id: input.id, _path: path, ...stripForRead(data, spec, viewer, { fields: input.fields, includeLarge: input.includeLarge ?? true }) };
}

// ─── write_documents ──────────────────────────────────────────────────────

const PREVIEW_MAX_CHARS = 400;

function truncatePreview(v: unknown): unknown {
  if (typeof v === 'string' && v.length > PREVIEW_MAX_CHARS) return `${v.slice(0, PREVIEW_MAX_CHARS)}… (총 ${v.length}자)`;
  if (Array.isArray(v)) return v.map(truncatePreview);
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = truncatePreview(x);
    return out;
  }
  return v;
}

function previewOf(data: Record<string, unknown>, spec: CollectionSpec, viewer: Viewer): unknown {
  return truncatePreview(stripForRead(data, spec, viewer, { includeLarge: true }));
}

/** 객체/배열 안의 날짜 문자열(start, end, date, …At, …Date 키)을 Timestamp 로 */
function convertNestedDates(v: unknown, key = ''): unknown {
  if (typeof v === 'string' && NESTED_DATE_KEY_RE.test(key) && DATE_INPUT_RE.test(v)) {
    const d = parseDateInput(v);
    return d ? Timestamp.fromDate(d) : v;
  }
  if (Array.isArray(v)) return v.map((x) => convertNestedDates(x, key));
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = convertNestedDates(x, k);
    return out;
  }
  return v;
}

function coerceValue(key: string, raw: unknown, f: FieldSpec, errors: string[]): unknown {
  if (raw === null) return null;
  const bad = (expected: string) => {
    errors.push(`${key}: ${expected} 이어야 합니다 (받은 값: ${JSON.stringify(raw)?.slice(0, 80)})`);
    return undefined;
  };
  switch (f.type) {
    case 'string':
    case 'html':
      if (typeof raw !== 'string') return bad('문자열');
      if (f.enum && !f.enum.includes(raw)) {
        errors.push(`${key}: 허용값은 ${f.enum.join(' | ')} 입니다 (받은 값: "${raw}")`);
        return undefined;
      }
      return raw;
    case 'number':
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return bad('숫자');
      return raw;
    case 'boolean':
      if (typeof raw !== 'boolean') return bad('true/false');
      return raw;
    case 'timestamp': {
      const d = raw instanceof Date ? raw : typeof raw === 'string' ? parseDateInput(raw) : null;
      if (!d) return bad('날짜 문자열("YYYY-MM-DD" 또는 ISO 8601)');
      return Timestamp.fromDate(d);
    }
    case 'string[]':
      if (!Array.isArray(raw) || !raw.every((s) => typeof s === 'string')) return bad('문자열 배열');
      return raw;
    case 'object':
      if (!isPlainObject(raw)) return bad('객체');
      return convertNestedDates(raw);
    case 'object[]':
      if (!Array.isArray(raw) || !raw.every(isPlainObject)) return bad('객체 배열');
      return convertNestedDates(raw);
    case 'any':
      return convertNestedDates(raw);
  }
}

function validateData(spec: CollectionSpec, data: Record<string, unknown>, errors: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(data)) {
    if (raw === undefined) continue;
    if (spec.hidden?.some((h) => h === k || h.startsWith(`${k}.`)) || isSensitiveKey(k)) {
      errors.push(`${k}: 숨김(민감) 필드는 쓸 수 없습니다`);
      continue;
    }
    if (spec.serverManaged?.includes(k)) {
      errors.push(`${k}: 서버가 관리하는 필드라 지정할 수 없습니다`);
      continue;
    }
    const f = spec.fields[k];
    if (!f) {
      errors.push(`${k}: ${spec.name} 스키마에 없는 필드입니다`);
      continue;
    }
    if (!f.writable) {
      errors.push(`${k}: 쓰기가 허용되지 않은 필드입니다`);
      continue;
    }
    const v = coerceValue(k, raw, f, errors);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function serverFields(spec: CollectionSpec, mode: 'create' | 'update', viewer: Viewer): Record<string, unknown> {
  const now = Timestamp.now();
  const sm = new Set(spec.serverManaged ?? []);
  const out: Record<string, unknown> = {};
  if (mode === 'create') {
    if (sm.has('createdAt')) out.createdAt = now;
    if (sm.has('createdBy')) out.createdBy = viewer.uid;
  }
  if (sm.has('updatedAt')) out.updatedAt = now;
  if (sm.has('updatedBy')) out.updatedBy = viewer.uid;
  return out;
}

type RefCache = Map<string, boolean>;

async function refExists(db: Firestore, ref: NonNullable<FieldSpec['ref']>, value: string, cache: RefCache): Promise<boolean> {
  const key = `${ref.collection}:${ref.by}:${value}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let ok: boolean;
  if (ref.by === 'id') ok = (await db.collection(ref.collection).doc(value).get()).exists;
  else ok = !(await db.collection(ref.collection).where('code', '==', value).limit(1).get()).empty;
  cache.set(key, ok);
  return ok;
}

async function checkRefs(db: Firestore, spec: CollectionSpec, data: Record<string, unknown>, errors: string[], cache: RefCache) {
  for (const [k, v] of Object.entries(data)) {
    const f = spec.fields[k];
    if (!f?.ref || typeof v !== 'string' || !v) continue;
    if (!(await refExists(db, f.ref, v, cache))) errors.push(`${k}: ${f.ref.collection} 에 ${f.ref.by === 'code' ? '코드' : 'ID'} "${v}" 가 없습니다`);
  }
}

/** 컬렉션별 추가 정합성 검사 (merged = 저장될 최종 문서) */
async function crossChecks(
  db: Firestore,
  spec: CollectionSpec,
  mode: 'create' | 'update',
  id: string | null,
  merged: Record<string, unknown>,
  errors: string[],
  warnings: string[]
) {
  const str = (k: string) => (typeof merged[k] === 'string' ? (merged[k] as string) : '');

  if (spec.name === 'campTasks' && str('categoryId')) {
    const cat = await db.collection('taskCategories').doc(str('categoryId')).get();
    if (cat.exists && cat.data()?.campCode !== merged.campCode) errors.push(`categoryId: 카테고리 "${cat.data()?.name}" 는 ${cat.data()?.campCode} 캠프 것입니다 (업무는 ${merged.campCode})`);
  }

  if (spec.name === 'campPages' && mode === 'create' && str('jobCodeId') && str('category') && typeof merged.order === 'number') {
    const dup = await db.collection('campPages').where('jobCodeId', '==', merged.jobCodeId).where('category', '==', merged.category).get();
    const sameOrder = dup.docs.filter((d) => d.data()?.order === merged.order);
    if (sameOrder.length) warnings.push(`order ${merged.order} 는 같은 탭에 이미 있습니다 ("${sameOrder[0].data()?.title}"). 기존 최대 order: ${Math.max(-1, ...dup.docs.map((d) => Number(d.data()?.order ?? -1)))}`);
  }

  if (spec.name === 'generationResources' && mode === 'create' && id && merged.jobCodeId !== id) errors.push(`문서 ID(${id}) 와 jobCodeId(${String(merged.jobCodeId)}) 가 같아야 합니다`);

  if (spec.name === 'campHomeMessages' && mode === 'create' && id) {
    const camp = await db.collection('jobCodes').where('code', '==', id).limit(1).get();
    if (camp.empty) errors.push(`문서 ID 는 캠프 코드여야 합니다 ("${id}" 캠프 없음)`);
  }

  if (spec.name === 'jobBoards' && str('jobCode') && str('refJobCodeId')) {
    const camp = await db.collection('jobCodes').doc(str('refJobCodeId')).get();
    if (camp.exists && camp.data()?.code !== merged.jobCode) errors.push(`jobCode(${str('jobCode')}) 와 refJobCodeId 의 캠프 코드(${camp.data()?.code}) 가 다릅니다`);
  }

  if (spec.name === 'evaluations' && mode === 'create') {
    const tplSnap = str('criteriaTemplateId') ? await db.collection('evaluationCriteria').doc(str('criteriaTemplateId')).get() : null;
    const tpl = tplSnap?.exists ? tplSnap.data() ?? {} : null;
    if (tpl) {
      if (tpl.stage && tpl.stage !== merged.evaluationStage) errors.push(`템플릿 단계(${tpl.stage}) 와 evaluationStage(${str('evaluationStage')}) 가 다릅니다`);
      const criteria = (Array.isArray(tpl.criteria) ? tpl.criteria : []) as { id: string; name?: string; maxScore?: number }[];
      const scores = isPlainObject(merged.scores) ? (merged.scores as Record<string, unknown>) : {};
      const normalized: Record<string, { score: number; maxScore: number }> = {};
      let sum = 0;
      let count = 0;
      for (const c of criteria) {
        const s = scores[c.id];
        const score = isPlainObject(s) ? s.score : undefined;
        const max = typeof c.maxScore === 'number' ? c.maxScore : 10;
        if (typeof score !== 'number') {
          errors.push(`scores.${c.id} (${c.name ?? ''}): score 누락`);
          continue;
        }
        if (score < 0 || score > max) errors.push(`scores.${c.id} (${c.name ?? ''}): 0~${max} 범위여야 합니다`);
        normalized[c.id] = { score, maxScore: max };
        sum += score;
        count++;
      }
      for (const k of Object.keys(scores)) if (!criteria.some((c) => c.id === k)) errors.push(`scores.${k}: 템플릿에 없는 항목입니다`);
      if (!errors.length) {
        // 앱(evaluationService.createEvaluation)과 같은 계산: 평균 / 10 / 백분율
        const totalScore = count ? sum / count : 0;
        merged.scores = normalized;
        merged.totalScore = totalScore;
        merged.maxTotalScore = 10;
        merged.percentage = (totalScore / 10) * 100;
      }
    }
    if (str('refUserId') && str('evaluationStage')) {
      const dup = await db.collection('evaluations').where('refUserId', '==', merged.refUserId).where('evaluationStage', '==', merged.evaluationStage).get();
      const same = dup.docs.filter((d) => !merged.refJobBoardId || d.data()?.refJobBoardId === merged.refJobBoardId);
      if (same.some((d) => d.data()?.aiDraft)) errors.push('같은 지원자·공고·단계의 AI 초안이 이미 있습니다. 관리자가 확정하거나 삭제한 뒤 다시 만드세요.');
      else if (same.length) warnings.push(`같은 지원자·단계의 기존 평가 ${same.length}건: ${same.map((d) => d.data()?.evaluatorName ?? '?').join(', ')}`);
    }
  }
}

function summaryOf(op: WriteOp, data: Record<string, unknown>, changed?: string[]): string {
  const labelKey = ['title', 'name', 'evaluationStage', 'campCode', 'code', 'mentorMessage'].find((k) => typeof data[k] === 'string' && data[k]);
  let label = labelKey ? String(data[labelKey]).slice(0, 60) : '';
  if (labelKey === 'evaluationStage' && typeof data.refUserId === 'string') label = `${label} · ${data.refUserId}`;
  if (op === 'update') return `${label ? `"${label}" ` : ''}${(changed ?? []).join(', ')} 변경`;
  return label ? `"${label}"` : '';
}

async function prepareOp(db: Firestore, op: WriteOperation, index: number, viewer: Viewer, cache: RefCache): Promise<PreparedOp> {
  const result: OpResult = { index, op: op.op, collection: op.collection, id: op.id ?? null, ok: false, errors: [], warnings: [] };
  const fail = (msg: string): PreparedOp => {
    result.errors.push(msg);
    return { result, id: null };
  };
  if (!['create', 'update', 'delete'].includes(op.op)) return fail(`op 는 create | update | delete 중 하나여야 합니다 (받은 값: ${String(op.op)})`);
  let spec: CollectionSpec;
  try {
    spec = getSpec(op.collection);
  } catch (e) {
    return fail((e as Error).message);
  }
  if (!spec.write?.ops.includes(op.op)) return fail(`${spec.name} 에는 ${op.op} 가 허용되지 않습니다 (허용: ${spec.write?.ops.join(', ') || '없음'})`);
  if (spec.parent) return fail('서브컬렉션 쓰기는 지원하지 않습니다');
  if (op.id !== undefined && (typeof op.id !== 'string' || !op.id || op.id.includes('/') || op.id === '.' || op.id === '..')) return fail('id 형식이 올바르지 않습니다');

  const ref = db.collection(spec.name);
  const { errors, warnings } = result;

  if (op.op === 'delete') {
    if (!op.id) return fail('delete 에는 id 가 필요합니다');
    const snap = await ref.doc(op.id).get();
    if (!snap.exists) return fail(`${spec.name}/${op.id} 문서가 없습니다`);
    const before = snap.data() ?? {};
    result.before = previewOf(before, spec, viewer);
    result.summary = summaryOf('delete', before);
    result.ok = true;
    return { result, spec, id: op.id };
  }

  if (!isPlainObject(op.data) || Object.keys(op.data).length === 0) return fail('data 가 비어 있습니다');
  const coerced = validateData(spec, op.data, errors);

  if (op.op === 'create') {
    let id: string | null = op.id ?? null;
    if (!id && spec.idOnCreate === 'required') return fail(`${spec.name} 의 create 에는 id 를 지정해야 합니다`);
    if (!id && spec.idOnCreate === 'uuid') id = randomUUID();
    if (id && (await ref.doc(id).get()).exists) errors.push(`${spec.name}/${id} 문서가 이미 있습니다`);
    const forced = spec.forcedOnCreate ? spec.forcedOnCreate(viewer) : {};
    for (const [k, f] of Object.entries(spec.fields)) {
      // 값을 보냈지만 형식 오류로 걸러진 필드는 이미 오류가 있으므로 중복 보고하지 않는다
      if (f.required && !(k in op.data) && forced[k] === undefined) errors.push(`${k}: 필수 필드입니다`);
      else if (f.required && op.data[k] === null && forced[k] === undefined) errors.push(`${k}: 필수 필드는 null 일 수 없습니다`);
    }
    await checkRefs(db, spec, coerced, errors, cache);
    const merged: Record<string, unknown> = { ...coerced, ...forced };
    if (!errors.length) await crossChecks(db, spec, 'create', id, merged, errors, warnings);
    const payload = { ...merged, ...serverFields(spec, 'create', viewer) };
    result.id = id;
    result.after = previewOf(payload, spec, viewer);
    result.summary = summaryOf('create', payload);
    result.ok = errors.length === 0;
    return { result, spec, id, payload };
  }

  // update
  if (!op.id) return fail('update 에는 id 가 필요합니다');
  const snap = await ref.doc(op.id).get();
  if (!snap.exists) return fail(`${spec.name}/${op.id} 문서가 없습니다`);
  const before = snap.data() ?? {};
  if (!errors.length && Object.keys(coerced).length === 0) errors.push('변경할 필드가 없습니다');
  await checkRefs(db, spec, coerced, errors, cache);
  const merged: Record<string, unknown> = { ...before, ...coerced };
  if (!errors.length) await crossChecks(db, spec, 'update', op.id, merged, errors, warnings);
  const payload = { ...coerced, ...serverFields(spec, 'update', viewer) };
  const beforeView = previewOf(before, spec, viewer) as Record<string, unknown>;
  const afterView = previewOf(merged, spec, viewer) as Record<string, unknown>;
  const changed = Object.keys(coerced).filter((k) => JSON.stringify(beforeView[k] ?? null) !== JSON.stringify(afterView[k] ?? null));
  result.changes = Object.fromEntries(changed.map((k) => [k, { before: beforeView[k] ?? null, after: afterView[k] ?? null }]));
  if (!changed.length && !errors.length) warnings.push('실제로 바뀌는 값이 없습니다');
  result.summary = summaryOf('update', before, changed);
  result.ok = errors.length === 0;
  return { result, spec, id: op.id, payload };
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (isPlainObject(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

function previewHashOf(ops: WriteOperation[], viewer: Viewer): string {
  const normalized = ops.map((o) => ({ op: o.op, collection: o.collection, id: o.id ?? null, data: serialize(o.data ?? null) }));
  return createHash('sha256').update(canonical({ uid: viewer.uid, ops: normalized })).digest('hex').slice(0, 24);
}

export async function writeDocuments(input: WriteInput, viewer: Viewer) {
  if (!canAccess('admin', viewer)) throw new DataToolError('write_documents 는 관리자 계정만 사용할 수 있습니다.');
  const ops = input.operations;
  if (!Array.isArray(ops) || ops.length === 0) throw new DataToolError('operations 가 비어 있습니다.');
  if (ops.length > DATA_TOOL_LIMITS.maxWriteOps) throw new DataToolError(`한 번에 최대 ${DATA_TOOL_LIMITS.maxWriteOps}개 작업까지 가능합니다 (요청: ${ops.length}).`);

  const db = getAdminFirestore();
  const cache: RefCache = new Map();
  const prepared: PreparedOp[] = [];
  for (let i = 0; i < ops.length; i++) prepared.push(await prepareOp(db, ops[i], i, viewer, cache));

  const results = prepared.map((p) => p.result);
  const errorCount = results.filter((r) => !r.ok).length;
  const previewHash = previewHashOf(ops, viewer);
  const counts = { create: 0, update: 0, delete: 0 } as Record<WriteOp, number>;
  for (const r of results) counts[r.op] = (counts[r.op] ?? 0) + 1;

  if (errorCount > 0) {
    return {
      mode: 'dry-run' as const,
      ok: false,
      message: `${errorCount}개 작업에 오류가 있어 실행할 수 없습니다. 오류를 고쳐 다시 호출하세요.`,
      counts,
      results,
    };
  }

  if (!input.confirm) {
    return {
      mode: 'dry-run' as const,
      ok: true,
      message: '아무것도 변경되지 않았습니다. 아래 미리보기를 사용자에게 보여주고 승인받은 뒤, 같은 operations 와 previewHash 로 confirm=true 를 붙여 다시 호출하세요.',
      previewHash,
      counts,
      results,
    };
  }

  if (input.previewHash !== previewHash) {
    throw new DataToolError('previewHash 가 일치하지 않습니다. operations 가 dry-run 때와 다릅니다 — confirm 없이 다시 호출해 새 미리보기를 받으세요.');
  }

  const batch = db.batch();
  const executed: { op: WriteOp; collection: string; id: string; summary?: string }[] = [];
  for (const p of prepared) {
    if (!p.spec) continue;
    const col = db.collection(p.spec.name);
    if (p.result.op === 'create') {
      const docRef = p.id ? col.doc(p.id) : col.doc();
      batch.create(docRef, p.payload ?? {});
      executed.push({ op: 'create', collection: p.spec.name, id: docRef.id, summary: p.result.summary });
    } else if (p.result.op === 'update') {
      batch.update(col.doc(p.id as string), p.payload ?? {});
      executed.push({ op: 'update', collection: p.spec.name, id: p.id as string, summary: p.result.summary });
    } else {
      batch.delete(col.doc(p.id as string));
      executed.push({ op: 'delete', collection: p.spec.name, id: p.id as string, summary: p.result.summary });
    }
  }
  const auditRef = db.collection('mcpAuditLogs').doc();
  batch.set(auditRef, {
    uid: viewer.uid,
    name: viewer.name,
    role: viewer.role,
    note: input.note ?? '',
    previewHash,
    operations: executed,
    at: Timestamp.now(),
  });
  await batch.commit();
  clearAiContentCache();

  return {
    mode: 'executed' as const,
    ok: true,
    message: `${executed.length}개 작업을 실행했습니다.`,
    auditLogId: auditRef.id,
    counts,
    results: executed,
  };
}
