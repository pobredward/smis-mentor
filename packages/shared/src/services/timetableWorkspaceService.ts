/**
 * 시간표 편집 작업 공간 — 불러오기 · 저장 (Firestore 클라이언트, web/mobile 공용)
 *
 * 저장은 한 배치(표 400장 이상이면 여러 배치)로 쓴다.
 * campSettings 의 맵은 바뀐 항목만 필드 경로로 쓰고, 지운 항목은 deleteField 로 실제로 지운다
 * (setDoc merge 로 쓰면 지운 값이 남고, 맵을 통째로 쓰면 그사이 다른 사람이 고친 항목을 덮는다).
 */
import {
  collection,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  query,
  Timestamp,
  where,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from 'firebase/firestore';
import type { CampTimetable, TimetableCommonValues } from '../types/campTimetable';
import type { CampClassInfo, CampGroup, CampSettings } from '../types/camp';
import type { TimetableGuide } from '../types/timetableGuide';
import type { CampDayPlan } from '../types/campDayPlan';
import { toUpdatePayload } from '../utils/timetableDraft';
import { getCampSettingsDoc, invalidateCampSettingsCache } from './camp';
import type { SavePlan } from '../utils/timetableWorkspace';
import { newId } from '../utils/id';

const TIMETABLES = 'campTimetables';
const SETTINGS = 'campSettings';
const MAX_BATCH = 400;

export interface TimetableWorkspaceData {
  tables: CampTimetable[];
  common: Record<string, TimetableCommonValues>;
  classInfo: Record<string, CampClassInfo>;
  guides: Record<string, TimetableGuide>;
  dayPlan: CampDayPlan | null;
  groups: CampGroup[];
}

/** 편집기를 열 때 한 번 — 캠프의 표 전부 + 캠프 설정 (편집은 최신 값에서 — 캐시를 건너뛰고 받는다) */
export async function loadTimetableWorkspace(
  db: Firestore,
  args: { campCode: string; jobCodeId: string }
): Promise<TimetableWorkspaceData> {
  const [snap, settings] = await Promise.all([
    getDocs(query(collection(db, TIMETABLES), where('campCode', '==', args.campCode))), // 캠프 열쇠는 campCode
    getCampSettingsDoc(db, args.campCode, { fresh: true }),
  ]);
  const tables: CampTimetable[] = [];
  snap.forEach((d) => tables.push({ id: d.id, ...d.data() } as CampTimetable));
  const s: Partial<CampSettings> = settings ?? {};
  return {
    tables,
    common: (s.timetableCommon ?? {}) as Record<string, TimetableCommonValues>,
    classInfo: s.classInfo ?? {},
    guides: s.timetableGuides ?? {},
    dayPlan: s.dayPlan?.sets ? s.dayPlan : null,
    groups: s.groups ?? [],
  };
}

export interface CommitResult {
  /** 'new:…' 임시 id → 저장된 문서 id */
  idMap: Record<string, string>;
  /** 그사이 다른 사람이 고치거나 지운 표 — 있으면 아무것도 쓰지 않았다 (force 로 덮어쓸 수 있음) */
  conflicts: string[];
  savedAt: Timestamp | null;
}

/** undefined 를 걷어 낸다 (Firestore 는 undefined 를 못 쓴다) */
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export async function commitTimetableWorkspace(
  db: Firestore,
  plan: SavePlan,
  ctx: { campCode: string; jobCodeId: string; userId: string; force?: boolean }
): Promise<CommitResult> {
  // 그사이 다른 사람이 고친 표가 있는지 — 있으면 쓰지 않고 알려 준다
  if (!ctx.force) {
    const ids = Object.keys(plan.expectedUpdatedAt);
    const snaps = await Promise.all(ids.map((id) => getDoc(doc(db, TIMETABLES, id))));
    const conflicts = ids.filter((id, i) => {
      const s = snaps[i];
      if (!s.exists()) return !plan.deletes.includes(id); // 지우려던 표가 이미 없으면 괜찮다
      const expected = plan.expectedUpdatedAt[id];
      const now = (s.data().updatedAt as Timestamp | undefined)?.toMillis?.() ?? null;
      return expected !== null && now !== expected;
    });
    if (conflicts.length) return { idMap: {}, conflicts, savedAt: null };
  }

  const savedAt = Timestamp.now();
  const idMap: Record<string, string> = {};
  const tableOps: Array<(b: WriteBatch) => void> = [];

  plan.creates.forEach(({ tempId, table }) => {
    const id = newId();
    idMap[tempId] = id;
    tableOps.push((b) =>
      b.set(doc(db, TIMETABLES, id), {
        ...plain(toUpdatePayload(table)),
        campCode: ctx.campCode,
        jobCodeId: ctx.jobCodeId,
        order: table.order ?? 0,
        createdAt: savedAt,
        createdBy: ctx.userId,
        updatedAt: savedAt,
        updatedBy: ctx.userId,
      })
    );
  });
  plan.updates.forEach(({ id, table }) => {
    tableOps.push((b) =>
      b.update(doc(db, TIMETABLES, id), { ...plain(toUpdatePayload(table)), updatedAt: savedAt, updatedBy: ctx.userId })
    );
  });
  plan.deletes.forEach((id) => tableOps.push((b) => b.delete(doc(db, TIMETABLES, id))));

  // 캠프 설정 — 바뀐 항목만 필드 경로로 (항목 키에 점이 있어도 안전)
  const pairs: unknown[] = [];
  plan.common.forEach(({ group, value }) => pairs.push(new FieldPath('timetableCommon', group), value ? plain(value) : deleteField()));
  plan.classInfo.forEach(({ code, value }) => pairs.push(new FieldPath('classInfo', code), value ? plain(value) : deleteField()));
  plan.guides.forEach(({ key, value }) => pairs.push(new FieldPath('timetableGuides', key), value ? plain(value) : deleteField()));
  if (plan.dayPlan !== undefined) pairs.push(new FieldPath('dayPlan'), plan.dayPlan ? plain(plan.dayPlan) : deleteField());

  const chunks: Array<Array<(b: WriteBatch) => void>> = [];
  for (let i = 0; i < tableOps.length; i += MAX_BATCH) chunks.push(tableOps.slice(i, i + MAX_BATCH));
  if (pairs.length) {
    const ref = doc(db, SETTINGS, ctx.campCode);
    const settingsOps: Array<(b: WriteBatch) => void> = [
      // 문서가 없을 수도 있으므로 먼저 만들어 두고(merge), 바로 이어서 항목만 바꾼다
      (b) => b.set(ref, { campCode: ctx.campCode }, { merge: true }),
      (b) => b.update(ref, new FieldPath('updatedAt'), new Date().toISOString(), ...(pairs as [])),
    ];
    if (chunks.length && chunks[chunks.length - 1].length + settingsOps.length <= MAX_BATCH) chunks[chunks.length - 1].push(...settingsOps);
    else chunks.push(settingsOps);
  }

  try {
    for (const ops of chunks) {
      const batch = writeBatch(db);
      ops.forEach((op) => op(batch));
      await batch.commit();
    }
  } finally {
    // 캠프 설정을 썼으면 받아 둔 설정을 버린다 — 보기 화면이 새 값을 받게
    if (pairs.length) invalidateCampSettingsCache(ctx.campCode);
  }
  return { idMap, conflicts: [], savedAt };
}
