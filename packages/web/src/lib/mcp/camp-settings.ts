/**
 * campSettings 쓰기 규칙 — 칸 설명(timetableGuides) · 일정표(dayPlan) · 반 정보(classInfo) · 그룹 공통값(timetableCommon)
 *
 * - 앱(shared/services/camp)과 같은 정리 함수(cleanGuide · cleanDayPlan)를 그대로 써서
 *   MCP 로 쓴 값과 앱 화면에서 저장한 값이 같은 모양이 되게 한다.
 * - 앱 화면은 형식이 틀린 값을 조용히 버리지만, 여기서는 오류로 돌려준다 — AI 가 고쳐 보낼 수 있게.
 * - 맵 필드(timetableGuides · classInfo · timetableCommon)는 항목(키) 단위로 바꾼다. 값이 null 이면 그 항목을 지운다.
 * - 칸 이름이 시간표에 없음 · 원어민용에 한글 · 외부 사진 주소처럼 "저장은 되지만 이상한" 값은 경고로 알린다.
 */
import { randomUUID } from 'crypto';
import type { Firestore } from 'firebase-admin/firestore';
import {
  cleanDayPlan,
  cleanGuide,
  DAY_KINDS,
  findDayKind,
  guideKeyOf,
  hasGuideContent,
  isActivityDayKind,
  normalizeGroupKey,
  normalizeGuide,
  timetableLabels,
  type CampDayPlan,
  type CampTimetable,
  type DayKind,
  type DayPlanEntry,
  type DayPlanSet,
  type ExcitingSlot,
  type GuideBody,
  type GuideItem,
  type GuideItemType,
  type GuideSection,
  type TimetableGuide,
} from '@smis-mentor/shared';
import type { Viewer } from '@/lib/ai-content/site';
import type { CollectionSpec } from './datamodel';

/** datamodel 의 FieldSpec.clean 값 — 저장 전 정리·검증 방식 */
export type CleanerKey = 'timetableGuide' | 'classInfo' | 'timetableCommon' | 'dayPlan';

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function has(o: Obj, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function trunc(s: unknown, n = 90): string {
  const t = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** 키 순서와 상관없는 비교용 문자열 */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (isObj(v) && typeof (v as { toDate?: unknown }).toDate !== 'function') {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

const META = new Set(['updatedAt', 'updatedBy']);

function withoutMeta(v: unknown): unknown {
  if (!isObj(v)) return v ?? null;
  return Object.fromEntries(Object.entries(v).filter(([k]) => !META.has(k)));
}

/** 내용 비교 — id 와 updatedAt/updatedBy 는 빼고 본다 (같은 내용을 다시 보내면 건너뛰려고) */
function contentKey(v: unknown): string {
  const strip = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(strip) : isObj(x) ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'id' && !META.has(k)).map(([k, y]) => [k, strip(y)])) : x;
  return stable(strip(v));
}

const KST_MS = 9 * 3600 * 1000;

function kstYmd(v: unknown): string | undefined {
  const d = v && typeof (v as { toDate?: unknown }).toDate === 'function' ? (v as { toDate: () => Date }).toDate() : v instanceof Date ? v : null;
  return d ? new Date(d.getTime() + KST_MS).toISOString().slice(0, 10) : undefined;
}

// ─── 검증 때 참고하는 캠프 정보 (필요할 때만 읽는다) ──────────────────────────

export class CampRef {
  private periodP?: Promise<{ start?: string; end?: string } | null>;
  private labelsP?: Promise<string[] | null>;

  constructor(
    private readonly db: Firestore,
    readonly campCode: string,
    readonly groups: Array<{ name: string; classCodes: string[] }>
  ) {}

  /** 캠프 기간 (한국 날짜) */
  period() {
    if (!this.periodP) {
      this.periodP = this.db
        .collection('jobCodes')
        .where('code', '==', this.campCode)
        .limit(1)
        .get()
        .then((s) => {
          const d = s.docs[0]?.data();
          return d ? { start: kstYmd(d.startDate), end: kstYmd(d.endDate) } : null;
        })
        .catch(() => null);
    }
    return this.periodP;
  }

  /** 이 캠프 시간표들에 찍히는 칸 이름 전부 */
  timetableLabels() {
    if (!this.labelsP) {
      this.labelsP = this.db
        .collection('campTimetables')
        .where('campCode', '==', this.campCode)
        .get()
        .then((s) => {
          const out: string[] = [];
          s.docs.forEach((d) => {
            const t = d.data();
            if (Array.isArray(t.blocks)) out.push(...timetableLabels({ blocks: t.blocks, subjects: t.subjects ?? [] } as Pick<CampTimetable, 'blocks' | 'subjects'>));
          });
          return out;
        })
        .catch(() => null);
    }
    return this.labelsP;
  }
}

export interface CleanCtx {
  campCode: string;
  uid: string;
  nowIso: string;
  ref: CampRef;
  errors: string[];
  warnings: string[];
  /** 같은 작업에서 새로 쓰는 일정표 (칸 이름 확인용) */
  dayPlan?: CampDayPlan | null;
}

/** 일정표 활동표(익사이팅·야외 수업)에 찍히는 활동 이름 — 이것도 칸 설명이 붙는 칸이다 */
export function dayPlanActivityLabels(plan: CampDayPlan | null | undefined): string[] {
  const out: string[] = [];
  (plan?.sets ?? []).forEach((s) =>
    Object.values(s.days ?? {}).forEach((e) => {
      if (!isActivityDayKind(e?.kind)) return;
      [...(e.slots ?? []), ...Object.values(e.slotsByGroup ?? {}).flat()].forEach((x) => {
        if (x?.activity) out.push(x.activity);
      });
    })
  );
  return out;
}

// ─── 칸 설명 (timetableGuides 항목) ─────────────────────────────────────────

const ITEM_TYPES: GuideItemType[] = ['text', 'link', 'image', 'video'];
const STORAGE_HOSTS = ['firebasestorage.googleapis.com', 'storage.googleapis.com'];

function newShortId(taken: Set<string>): string {
  let id = '';
  do id = randomUUID().replace(/-/g, '').slice(-6);
  while (taken.has(id));
  taken.add(id);
  return id;
}

function takeId(raw: unknown, taken: Set<string>): string {
  if (typeof raw === 'string' && raw.trim() && !taken.has(raw.trim())) {
    taken.add(raw.trim());
    return raw.trim();
  }
  return newShortId(taken);
}

/** 곧 만료되는 임시 주소 (노션 첨부 S3 서명 주소 등) — 칸 설명에 넣으면 1시간 뒤 깨진다 */
export function isExpiringUrl(u: URL): boolean {
  const q = u.searchParams;
  return (
    q.has('X-Amz-Signature') ||
    q.has('X-Amz-Expires') ||
    q.has('expirationTimestamp') ||
    (q.has('Expires') && q.has('Signature')) ||
    u.hostname.endsWith('notion-static.com') ||
    u.hostname === 'file.notion.so'
  );
}

function checkUnknownKeys(raw: Obj, allowed: string[], path: string, ctx: CleanCtx) {
  for (const k of Object.keys(raw)) if (!allowed.includes(k)) ctx.errors.push(`${path}.${k}: 알 수 없는 키입니다 (쓸 수 있는 키: ${allowed.filter((a) => !META.has(a)).join(', ')})`);
}

function cleanItemInput(raw: unknown, path: string, ctx: CleanCtx, ids: Set<string>): GuideItem | null {
  if (!isObj(raw)) {
    ctx.errors.push(`${path}: { type, text?, url?, storagePath? } 객체여야 합니다`);
    return null;
  }
  checkUnknownKeys(raw, ['id', 'type', 'text', 'url', 'storagePath'], path, ctx);
  const type = (raw.type ?? 'text') as GuideItemType;
  if (!ITEM_TYPES.includes(type)) {
    ctx.errors.push(`${path}.type: ${ITEM_TYPES.join(' | ')} 중 하나여야 합니다 (받은 값: ${JSON.stringify(raw.type)})`);
    return null;
  }
  for (const k of ['text', 'url', 'storagePath']) {
    if (raw[k] !== undefined && raw[k] !== null && typeof raw[k] !== 'string') ctx.errors.push(`${path}.${k}: 문자열이어야 합니다`);
  }
  const text = typeof raw.text === 'string' ? raw.text : '';
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  let storagePath = typeof raw.storagePath === 'string' ? raw.storagePath.trim() : '';

  if (type === 'text') {
    if (url) ctx.errors.push(`${path}: text 줄에는 url 을 넣지 않습니다 — 링크는 type "link" 로 따로 넣으세요`);
    if (!text.trim()) {
      ctx.warnings.push(`${path}: 빈 줄이라 뺍니다`);
      return null;
    }
    return { id: takeId(raw.id, ids), type, text };
  }

  if (!url) {
    ctx.errors.push(`${path}.url: ${type} 줄에는 주소(url)가 필요합니다`);
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    ctx.errors.push(`${path}.url: 올바른 주소가 아닙니다 (${trunc(url, 60)})`);
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    ctx.errors.push(`${path}.url: http(s) 주소만 넣을 수 있습니다`);
    return null;
  }
  if (type === 'image' || type === 'video') {
    if (isExpiringUrl(parsed)) {
      ctx.errors.push(`${path}.url: 곧 만료되는 임시 주소입니다(노션 첨부 등) — upload_media 로 먼저 올리고 받은 url·storagePath 를 넣으세요`);
      return null;
    }
    if (!STORAGE_HOSTS.includes(parsed.hostname)) {
      ctx.warnings.push(`${path}.url: 사이트 저장소 밖의 ${type === 'image' ? '사진' : '동영상'} 주소입니다 (${parsed.hostname}) — 원본이 지워지면 깨집니다. upload_media 로 올려 두는 것을 권장합니다`);
    }
  }
  if (storagePath) {
    if (type === 'link') {
      ctx.warnings.push(`${path}.storagePath: 링크 줄에는 쓰지 않아 뺍니다`);
      storagePath = '';
    } else if (!storagePath.startsWith(`timetableGuides/${ctx.campCode}/`)) {
      // 앱은 줄을 지울 때 storagePath 의 파일도 지운다 → 다른 캠프·다른 곳 파일을 가리키면 엉뚱한 파일이 지워질 수 있다
      ctx.warnings.push(`${path}.storagePath: 이 캠프(timetableGuides/${ctx.campCode}/…) 파일이 아니라서 뺍니다 (주소는 그대로 씀)`);
      storagePath = '';
    }
  }
  return {
    id: takeId(raw.id, ids),
    type,
    ...(text.trim() ? { text } : {}),
    url,
    ...(storagePath ? { storagePath } : {}),
  };
}

function cleanSectionInput(raw: unknown, path: string, ctx: CleanCtx, ids: Set<string>): GuideSection | null {
  if (!isObj(raw)) {
    ctx.errors.push(`${path}: { title, items } 객체여야 합니다`);
    return null;
  }
  checkUnknownKeys(raw, ['id', 'title', 'items'], path, ctx);
  if (raw.title !== undefined && raw.title !== null && typeof raw.title !== 'string') ctx.errors.push(`${path}.title: 문자열이어야 합니다`);
  if (raw.items !== undefined && raw.items !== null && !Array.isArray(raw.items)) ctx.errors.push(`${path}.items: 배열이어야 합니다`);
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map((it, i) => cleanItemInput(it, `${path}.items[${i}]`, ctx, ids))
    .filter((x): x is GuideItem => !!x);
  return { id: takeId(raw.id, ids), title: typeof raw.title === 'string' ? raw.title : '', items };
}

function cleanBodyInput(raw: unknown, path: string, ctx: CleanCtx, ids: Set<string>, allowed: string[]): GuideBody | null {
  if (!isObj(raw)) {
    ctx.errors.push(`${path}: { summary?, sections? } 객체여야 합니다`);
    return null;
  }
  checkUnknownKeys(raw, allowed, path, ctx);
  const body: GuideBody = {};
  if (raw.summary !== undefined && raw.summary !== null) {
    if (typeof raw.summary !== 'string') ctx.errors.push(`${path}.summary: 문자열이어야 합니다`);
    else body.summary = raw.summary;
  }
  if (raw.sections !== undefined && raw.sections !== null) {
    if (!Array.isArray(raw.sections)) ctx.errors.push(`${path}.sections: 배열이어야 합니다`);
    else body.sections = raw.sections.map((s, i) => cleanSectionInput(s, `${path}.sections[${i}]`, ctx, ids)).filter((x): x is GuideSection => !!x);
  }
  return body;
}

function bodyText(b: GuideBody | undefined): string {
  if (!b) return '';
  return [b.summary ?? '', ...(b.sections ?? []).flatMap((s) => [s.title, ...s.items.map((i) => i.text ?? '')])].join('\n');
}

export function cleanGuideEntry(key: string, raw: unknown, ctx: CleanCtx, labels: Set<string> | null): { key: string; value: TimetableGuide } | null {
  const nk = guideKeyOf(key);
  const at = `timetableGuides["${key}"]`;
  if (!nk) {
    ctx.errors.push(`${at}: 칸 이름(키)이 비어 있습니다`);
    return null;
  }
  if (/^__.*__$/.test(nk)) {
    ctx.errors.push(`${at}: __로 시작하고 끝나는 키는 쓸 수 없습니다`);
    return null;
  }
  if (nk !== key) ctx.warnings.push(`${at}: 키는 칸 이름을 소문자·한 칸 띄어쓰기로 정리한 "${nk}" 로 저장됩니다`);
  const errCount = ctx.errors.length;
  const ids = new Set<string>();
  const mentor = cleanBodyInput(raw, at, ctx, ids, ['summary', 'sections', 'foreign', 'updatedAt', 'updatedBy']);
  const rawForeign = isObj(raw) ? raw.foreign : undefined;
  const foreign = rawForeign === undefined || rawForeign === null ? undefined : cleanBodyInput(rawForeign, `${at}.foreign`, ctx, ids, ['summary', 'sections']);
  if (ctx.errors.length > errCount || !mentor) return null;

  const guide = cleanGuide({ ...mentor, ...(foreign ? { foreign } : {}) });
  if (!hasGuideContent(guide)) {
    ctx.errors.push(`${at}: 보여 줄 내용이 없습니다 (요약·줄이 모두 비어 있음). 칸 설명을 지우려면 값으로 null 을 보내세요`);
    return null;
  }
  if (foreign && !guide.foreign) ctx.warnings.push(`${at}.foreign: 내용이 비어 원어민용은 저장하지 않습니다 (원어민 선생님에게도 멘토·부매니저용이 열림)`);
  if (guide.foreign && /[가-힣]/.test(bodyText(guide.foreign))) ctx.warnings.push(`${at}.foreign: 원어민용에 한글이 있습니다 — 원어민 선생님은 영어로 봅니다`);
  if (labels && !labels.has(nk)) ctx.warnings.push(`${at}: 이 캠프 시간표·일정표에 "${nk}" 칸이 없습니다 — 저장해도 눌러 볼 칸이 없습니다 (칸 이름 오타인지 확인)`);
  return { key: nk, value: { ...guide, updatedAt: ctx.nowIso, updatedBy: ctx.uid } };
}

// ─── 반 정보 (classInfo 항목) ───────────────────────────────────────────────

const CLASS_INFO_KEYS = ['className', 'classroom', 'bookCode', 'spareBookCode'];

export function cleanClassInfoEntry(key: string, raw: unknown, ctx: CleanCtx): { key: string; value: Obj | null } | null {
  const k = key.trim();
  const at = `classInfo["${key}"]`;
  if (!k || k.includes('/') || /^__.*__$/.test(k)) {
    ctx.errors.push(`${at}: 반코드(키)가 올바르지 않습니다`);
    return null;
  }
  if (!isObj(raw)) {
    ctx.errors.push(`${at}: { className?, classroom?, bookCode?, spareBookCode? } 객체여야 합니다`);
    return null;
  }
  checkUnknownKeys(raw, CLASS_INFO_KEYS, at, ctx);
  const out: Obj = {};
  for (const ck of CLASS_INFO_KEYS) {
    const v = raw[ck];
    if (v !== undefined && v !== null && typeof v !== 'string') ctx.errors.push(`${at}.${ck}: 문자열이어야 합니다`);
    else if (typeof v === 'string' && v.trim()) out[ck] = v.trim();
  }
  const codes = ctx.ref.groups.flatMap((g) => g.classCodes);
  if (codes.length && !codes.includes(k)) ctx.warnings.push(`${at}: 반코드 "${k}" 가 이 캠프 그룹 구성(groups)에 없습니다`);
  if (!Object.keys(out).length) {
    ctx.warnings.push(`${at}: 값이 모두 비어 이 반 정보를 지웁니다`);
    return { key: k, value: null };
  }
  return { key: k, value: out };
}

// ─── 그룹 공통값 (timetableCommon 항목) — 반 목록·직접 넣은 담임/원어민 이름 ──────

export function cleanTimetableCommonEntry(key: string, raw: unknown, ctx: CleanCtx): { key: string; value: Obj } | null {
  const k = key.trim();
  const at = `timetableCommon["${key}"]`;
  if (!k || /^__.*__$/.test(k)) {
    ctx.errors.push(`${at}: 그룹 이름(키)이 올바르지 않습니다`);
    return null;
  }
  if (!isObj(raw)) {
    ctx.errors.push(`${at}: { classes?, staffOverrides? } 객체여야 합니다`);
    return null;
  }
  checkUnknownKeys(raw, ['classes', 'staffOverrides'], at, ctx);
  const out: Obj = {};
  if (raw.classes !== undefined && raw.classes !== null) {
    if (!Array.isArray(raw.classes)) ctx.errors.push(`${at}.classes: 배열이어야 합니다`);
    else {
      out.classes = raw.classes
        .map((c, i) => {
          const p = `${at}.classes[${i}]`;
          if (!isObj(c) || typeof c.classCode !== 'string' || !c.classCode.trim()) {
            ctx.errors.push(`${p}: { classCode, teacherName? } 형식이어야 합니다`);
            return null;
          }
          checkUnknownKeys(c, ['classCode', 'teacherName'], p, ctx);
          if (c.teacherName !== undefined && c.teacherName !== null && typeof c.teacherName !== 'string') ctx.errors.push(`${p}.teacherName: 문자열이어야 합니다`);
          const tn = typeof c.teacherName === 'string' ? c.teacherName.trim() : '';
          return { classCode: c.classCode.trim(), ...(tn ? { teacherName: tn } : {}) };
        })
        .filter(Boolean);
    }
  }
  if (raw.staffOverrides !== undefined && raw.staffOverrides !== null) {
    if (!isObj(raw.staffOverrides)) ctx.errors.push(`${at}.staffOverrides: { 역할키: 이름 } 객체여야 합니다`);
    else {
      const so: Obj = {};
      for (const [rk, v] of Object.entries(raw.staffOverrides)) {
        if (v !== null && typeof v !== 'string') ctx.errors.push(`${at}.staffOverrides.${rk}: 문자열이어야 합니다`);
        else if (typeof v === 'string' && v.trim() && rk.trim()) so[rk.trim()] = v.trim();
      }
      out.staffOverrides = so;
    }
  }
  if (ctx.ref.groups.length && !ctx.ref.groups.some((g) => normalizeGroupKey(g.name) === normalizeGroupKey(k))) {
    ctx.warnings.push(`${at}: "${k}" 그룹이 이 캠프 그룹 구성(groups: ${ctx.ref.groups.map((g) => g.name).join(', ')})에 없습니다`);
  }
  return { key: k, value: out };
}

// ─── 일정표 (dayPlan — 통째로 교체) ─────────────────────────────────────────

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

function checkSlots(list: unknown, path: string, ctx: CleanCtx) {
  if (!Array.isArray(list)) {
    ctx.errors.push(`${path}: 배열이어야 합니다`);
    return;
  }
  list.forEach((x, i) => {
    const p = `${path}[${i}]`;
    if (!isObj(x)) {
      ctx.errors.push(`${p}: { start, end, activity, place, note? } 객체여야 합니다`);
      return;
    }
    checkUnknownKeys(x, ['id', 'start', 'end', 'activity', 'place', 'note'], p, ctx);
    for (const k of ['start', 'end']) {
      if (typeof x[k] !== 'string' || !HHMM.test(x[k] as string)) ctx.errors.push(`${p}.${k}: "HH:mm" 시각이어야 합니다 (받은 값: ${JSON.stringify(x[k])})`);
    }
    for (const k of ['activity', 'place', 'note', 'id']) {
      if (x[k] !== undefined && x[k] !== null && typeof x[k] !== 'string') ctx.errors.push(`${p}.${k}: 문자열이어야 합니다`);
    }
    if (!String(x.activity ?? '').trim() && !String(x.place ?? '').trim()) ctx.errors.push(`${p}: 활동(activity)·장소(place)가 모두 비어 있습니다`);
  });
}

export async function cleanDayPlanField(raw: unknown, ctx: CleanCtx): Promise<CampDayPlan | undefined> {
  const at = 'dayPlan';
  if (!isObj(raw)) {
    ctx.errors.push(`${at}: { sets: [...] } 객체여야 합니다`);
    return undefined;
  }
  checkUnknownKeys(raw, ['sets', 'updatedAt', 'updatedBy'], at, ctx);
  if (!Array.isArray(raw.sets)) {
    ctx.errors.push(`${at}.sets: 배열이어야 합니다`);
    return undefined;
  }
  const errCount = ctx.errors.length;
  const groupOwner = new Map<string, number>();
  const kinds = DAY_KINDS.map((k) => k.key).join(' | ');
  const sets: DayPlanSet[] = [];
  raw.sets.forEach((s, si) => {
    const sp = `${at}.sets[${si}]`;
    if (!isObj(s)) {
      ctx.errors.push(`${sp}: { id, name, groups, days } 객체여야 합니다`);
      return;
    }
    checkUnknownKeys(s, ['id', 'name', 'groups', 'days'], sp, ctx);
    if (!Array.isArray(s.groups) || !s.groups.every((g) => typeof g === 'string')) {
      ctx.errors.push(`${sp}.groups: 그룹 이름 배열이어야 합니다 (예: ["Junior", "Middle"])`);
      return;
    }
    for (const g of s.groups as string[]) {
      const key = normalizeGroupKey(g);
      const prev = groupOwner.get(key);
      if (prev !== undefined && prev !== si) ctx.errors.push(`${sp}.groups: "${g}" 그룹이 sets[${prev}] 에도 있습니다 — 한 그룹은 한 세트에만`);
      groupOwner.set(key, si);
    }
    if (s.days !== undefined && s.days !== null && !isObj(s.days)) {
      ctx.errors.push(`${sp}.days: { "YYYY-MM-DD": { kind, note?, slots? } } 객체여야 합니다`);
      return;
    }
    const days: Record<string, DayPlanEntry> = {};
    Object.entries((s.days as Obj | undefined) ?? {}).forEach(([date, e]) => {
      const dp = `${sp}.days["${date}"]`;
      if (!YMD.test(date)) {
        ctx.errors.push(`${dp}: 날짜 키는 "YYYY-MM-DD" 여야 합니다`);
        return;
      }
      if (!isObj(e)) {
        ctx.errors.push(`${dp}: { kind, note?, slots?, slotsByGroup? } 객체여야 합니다`);
        return;
      }
      checkUnknownKeys(e, ['kind', 'note', 'slots', 'slotsByGroup'], dp, ctx);
      if (!findDayKind(e.kind as string)) ctx.errors.push(`${dp}.kind: ${kinds} 중 하나여야 합니다 (받은 값: ${JSON.stringify(e.kind)})`);
      if (e.note !== undefined && e.note !== null && typeof e.note !== 'string') ctx.errors.push(`${dp}.note: 문자열이어야 합니다`);
      if (e.slots !== undefined && e.slots !== null) checkSlots(e.slots, `${dp}.slots`, ctx);
      if (e.slotsByGroup !== undefined && e.slotsByGroup !== null) {
        if (!isObj(e.slotsByGroup)) ctx.errors.push(`${dp}.slotsByGroup: { 그룹: [활동…] } 객체여야 합니다`);
        else Object.entries(e.slotsByGroup).forEach(([g, list]) => checkSlots(list, `${dp}.slotsByGroup["${g}"]`, ctx));
      }
      const hasSlots = (Array.isArray(e.slots) && e.slots.length > 0) || (isObj(e.slotsByGroup) && Object.keys(e.slotsByGroup).length > 0);
      if (hasSlots && findDayKind(e.kind as string) && !isActivityDayKind(e.kind as string)) {
        ctx.warnings.push(`${dp}: ${String(e.kind)} 날은 활동표를 쓰지 않아 slots 는 저장되지 않습니다 (exciting · outdoor 만)`);
      }
      days[date] = {
        kind: e.kind as DayKind,
        ...(typeof e.note === 'string' ? { note: e.note } : {}),
        ...(Array.isArray(e.slots) ? { slots: e.slots as ExcitingSlot[] } : {}),
        ...(isObj(e.slotsByGroup) ? { slotsByGroup: e.slotsByGroup as Record<string, ExcitingSlot[]> } : {}),
      };
    });
    sets.push({ id: typeof s.id === 'string' ? s.id : '', name: typeof s.name === 'string' ? s.name : '', groups: s.groups as string[], days });
  });
  if (ctx.errors.length > errCount) return undefined;

  const cleaned = cleanDayPlan({ sets });

  // 저장은 되지만 확인이 필요한 것들
  if (ctx.ref.groups.length) {
    const known = new Set(ctx.ref.groups.map((g) => normalizeGroupKey(g.name)));
    const unknown = [...new Set(cleaned.sets.flatMap((s) => s.groups))].filter((g) => !known.has(g));
    if (unknown.length) ctx.warnings.push(`dayPlan: 이 캠프 그룹 구성에 없는 그룹 — ${unknown.join(', ')} (그룹: ${ctx.ref.groups.map((g) => g.name).join(', ')})`);
  }
  const period = await ctx.ref.period();
  if (period?.start && period?.end) {
    const outside = [...new Set(cleaned.sets.flatMap((s) => Object.keys(s.days)))].filter((d) => d < period.start! || d > period.end!).sort();
    if (outside.length) ctx.warnings.push(`dayPlan: 캠프 기간(${period.start} ~ ${period.end}) 밖의 날짜 — ${outside.slice(0, 8).join(', ')}${outside.length > 8 ? ` 외 ${outside.length - 8}개` : ''}`);
  }
  return { ...cleaned, updatedAt: ctx.nowIso, updatedBy: ctx.uid };
}

// ─── 미리보기 ───────────────────────────────────────────────────────────────

function itemLine(i: GuideItem): string {
  if (i.type === 'text') return trunc(i.text, 120);
  const label = i.type === 'image' ? '사진' : i.type === 'video' ? '동영상' : '링크';
  return `[${label}] ${i.text ? `${trunc(i.text, 40)} · ` : ''}${trunc(i.url, 70)}`;
}

function bodyPreview(b: GuideBody | undefined) {
  if (!b) return undefined;
  return {
    ...(b.summary ? { summary: trunc(b.summary, 160) } : {}),
    ...(b.sections?.length ? { sections: b.sections.map((s) => ({ title: s.title, items: s.items.map(itemLine) })) } : {}),
  };
}

/** 칸 설명 한 칸을 사람이 훑어보기 좋게 줄인 모양 */
export function guidePreview(raw: unknown) {
  const g = normalizeGuide(raw);
  if (!g) return null;
  return { ...bodyPreview(g), ...(g.foreign ? { foreign: bodyPreview(g.foreign) } : {}) };
}

function entryPreview(cleaner: CleanerKey | undefined, v: unknown) {
  if (v === undefined || v === null) return null;
  return cleaner === 'timetableGuide' ? guidePreview(v) : withoutMeta(v);
}

function pathKey(p: string, k: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(k) ? (p ? `${p}.${k}` : k) : `${p}["${k}"]`;
}

/** 두 값의 달라진 곳 (경로 · 전 · 후) — 큰 일정표를 통째로 보여 주지 않으려고 */
export function diffPaths(a: unknown, b: unknown, limit = 60) {
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  let more = 0;
  const leaf = (v: unknown) => (typeof v === 'string' ? trunc(v, 100) : v && typeof v === 'object' ? trunc(JSON.stringify(v), 200) : v ?? null);
  const walk = (x: unknown, y: unknown, p: string) => {
    if (stable(x) === stable(y)) return;
    if (isObj(x) && isObj(y)) {
      [...new Set([...Object.keys(x), ...Object.keys(y)])].sort().forEach((k) => walk(x[k], y[k], pathKey(p, k)));
      return;
    }
    if (Array.isArray(x) && Array.isArray(y)) {
      for (let i = 0; i < Math.max(x.length, y.length); i++) walk(x[i], y[i], `${p}[${i}]`);
      return;
    }
    if (changes.length < limit) changes.push({ path: p || '(전체)', before: leaf(x), after: leaf(y) });
    else more++;
  };
  walk(a, b, '');
  return more ? { changes, more: `… 외 ${more}곳` } : { changes };
}

// ─── write_documents 연결부 ──────────────────────────────────────────────────

export interface MapPatch {
  field: string;
  key: string;
  /** null = 그 항목 삭제 */
  value: unknown;
  action: 'add' | 'replace' | 'delete';
}

export interface CleanedFields {
  /** 통째로 바꿀 필드 (정리된 값) */
  fields: Obj;
  /** 항목 단위로 바꿀 맵 필드 */
  patches: MapPatch[];
  /** 미리보기 (항목별 · 일정표 diff) */
  changes: Obj;
  /** 맵 필드를 보냈는지 (전부 그대로라 patches 가 비었을 때 구분용) */
  hadMapInput: boolean;
}

function groupsOf(before: Obj): Array<{ name: string; classCodes: string[] }> {
  if (!Array.isArray(before.groups)) return [];
  return (before.groups as unknown[]).filter(isObj).map((g) => ({
    name: String(g.name ?? ''),
    classCodes: Array.isArray(g.classCodes) ? (g.classCodes as unknown[]).map(String) : [],
  }));
}

async function knownGuideLabels(ctx: CleanCtx, before: Obj): Promise<Set<string> | null> {
  const tt = await ctx.ref.timetableLabels();
  if (!tt) return null;
  const plan = ctx.dayPlan ?? (isObj(before.dayPlan) ? (before.dayPlan as unknown as CampDayPlan) : null);
  const all = [...tt, ...dayPlanActivityLabels(plan)].map(guideKeyOf).filter(Boolean);
  if (!all.length) {
    ctx.warnings.push(`${ctx.campCode} 캠프에 아직 시간표·일정표 칸이 없어 칸 이름을 확인하지 못했습니다`);
    return null;
  }
  return new Set(all);
}

/** 보낸 항목 수를 감사 로그·요약용 한 줄로 */
export function patchSummary(patches: MapPatch[]): string[] {
  const by = new Map<string, Record<MapPatch['action'], number>>();
  for (const p of patches) {
    const c = by.get(p.field) ?? { add: 0, replace: 0, delete: 0 };
    c[p.action]++;
    by.set(p.field, c);
  }
  return [...by].map(([f, c]) => `${f} ${[c.add && `추가 ${c.add}`, c.replace && `교체 ${c.replace}`, c.delete && `삭제 ${c.delete}`].filter(Boolean).join('·')}`);
}

/**
 * clean / mapEntries 필드를 정리·검증한다.
 * data 에는 그런 필드만 넣는다 (validateData 를 통과한 원본 값).
 */
export async function cleanSettingsFields(args: {
  db: Firestore;
  spec: CollectionSpec;
  mode: 'create' | 'update';
  id: string;
  before: Obj;
  data: Obj;
  viewer: Viewer;
  errors: string[];
  warnings: string[];
}): Promise<CleanedFields> {
  const { db, spec, mode, id, before, data, viewer, errors, warnings } = args;
  const ctx: CleanCtx = { campCode: id, uid: viewer.uid, nowIso: new Date().toISOString(), ref: new CampRef(db, id, groupsOf(before)), errors, warnings };
  const out: CleanedFields = { fields: {}, patches: [], changes: {}, hadMapInput: false };

  // 1) 통째로 바꾸는 필드 — 일정표를 먼저 정리해 둔다 (칸 설명의 칸 이름 확인에 새 일정표를 쓴다)
  for (const [k, v] of Object.entries(data)) {
    const f = spec.fields[k];
    if (!f?.clean || f.mapEntries) continue;
    if (v === null) {
      errors.push(`${k}: null 로 지울 수 없습니다${k === 'dayPlan' ? ' (일정표를 비우려면 { "sets": [] })' : ''}`);
      continue;
    }
    const cleaned = f.clean === 'dayPlan' ? await cleanDayPlanField(v, ctx) : undefined;
    if (cleaned === undefined) continue;
    out.fields[k] = cleaned;
    if (k === 'dayPlan') {
      ctx.dayPlan = cleaned;
      const d = diffPaths(withoutMeta(before.dayPlan), withoutMeta(cleaned));
      out.changes.dayPlan = d.changes.length ? d : { note: '바뀌는 값이 없습니다' };
    }
  }

  // 2) 맵 필드 — 보낸 항목만 바꾸고, 값이 null 이면 그 항목을 지운다
  for (const [k, v] of Object.entries(data)) {
    const f = spec.fields[k];
    if (!f?.mapEntries) continue;
    out.hadMapInput = true;
    if (!isObj(v)) {
      errors.push(`${k}: { 키: 값 } 객체여야 합니다 (값 null = 그 항목 삭제). 맵 전체를 지울 수는 없습니다`);
      continue;
    }
    const beforeMap = isObj(before[k]) ? (before[k] as Obj) : {};
    const labels = f.clean === 'timetableGuide' ? await knownGuideLabels(ctx, before) : null;
    const seen = new Set<string>();
    const unchanged: string[] = [];
    for (const [ek, ev] of Object.entries(v)) {
      let r: { key: string; value: unknown } | null;
      if (ev === null) {
        const nk = f.clean === 'timetableGuide' ? guideKeyOf(ek) : ek.trim();
        r = nk ? { key: nk, value: null } : null;
        if (!nk) errors.push(`${k}["${ek}"]: 키가 비어 있습니다`);
      } else if (f.clean === 'timetableGuide') r = cleanGuideEntry(ek, ev, ctx, labels);
      else if (f.clean === 'classInfo') r = cleanClassInfoEntry(ek, ev, ctx);
      else if (f.clean === 'timetableCommon') r = cleanTimetableCommonEntry(ek, ev, ctx);
      else {
        errors.push(`${k}: 항목 단위로 쓸 수 없는 필드입니다`);
        break;
      }
      if (!r) continue;
      if (seen.has(r.key)) {
        errors.push(`${k}["${r.key}"]: 같은 항목이 두 번 들어 있습니다 (키 정리 후 겹침)`);
        continue;
      }
      seen.add(r.key);
      const had = has(beforeMap, r.key);
      const label = `${k}["${r.key}"]`;
      if (r.value === null) {
        if (!had) {
          if (mode === 'update') warnings.push(`${label}: 없는 항목이라 지울 것이 없습니다`);
          continue;
        }
        out.patches.push({ field: k, key: r.key, value: null, action: 'delete' });
        out.changes[label] = { action: '삭제', before: entryPreview(f.clean, beforeMap[r.key]), after: null };
        continue;
      }
      if (had && contentKey(beforeMap[r.key]) === contentKey(r.value)) {
        unchanged.push(r.key);
        continue;
      }
      if (had && isObj(beforeMap[r.key])) {
        const lost = Object.keys(beforeMap[r.key] as Obj).filter((x) => !META.has(x) && !has(r!.value as Obj, x));
        if (lost.length) warnings.push(`${label}: 항목을 통째로 바꾸므로 ${lost.join(', ')} 이(가) 지워집니다${lost.includes('foreign') ? ' (원어민용 설명 삭제)' : ''} — 남기려면 함께 보내세요`);
      }
      out.patches.push({ field: k, key: r.key, value: r.value, action: had ? 'replace' : 'add' });
      out.changes[label] = { action: had ? '교체' : '추가', ...(had ? { before: entryPreview(f.clean, beforeMap[r.key]) } : {}), after: entryPreview(f.clean, r.value) };
    }
    if (unchanged.length) warnings.push(`${k}: 지금 저장된 내용과 같아 건너뜀 — ${unchanged.slice(0, 12).join(', ')}${unchanged.length > 12 ? ` 외 ${unchanged.length - 12}개` : ''}`);
  }
  return out;
}
