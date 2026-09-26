import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { newId as uuidv4 } from '../utils/id';
import type {
  CampTimetable,
  TimetableBlock,
  TimetableClassColumn,
  TimetableExtraColumn,
  TimetableLayout,
  TimetableSubject,
} from '../types/campTimetable';

const COLLECTION = 'campTimetables';

export interface CreateTimetableInput {
  campCode: string;
  jobCodeId: string;
  groupName: string;
  dayType: string;
  dayTypeLabel: string;
  layout?: TimetableLayout;
  classes: TimetableClassColumn[];
  extraColumns?: TimetableExtraColumn[];
  subjects?: TimetableSubject[];
  blocks?: TimetableBlock[];
  note?: string;
  order?: number;
  userId: string;
}

export type UpdateTimetableInput = Partial<
  Pick<
    CampTimetable,
    | 'groupName'
    | 'dayType'
    | 'dayTypeLabel'
    | 'layout'
    | 'order'
    | 'classes'
    | 'extraColumns'
    | 'subjects'
    | 'blocks'
    | 'note'
  >
>;

/** 반 구성이 바뀔 때 칸 키와 주제 담당(ownerClassCode)을 새 반번호로 옮긴다 */
function remap(
  blocks: TimetableBlock[],
  subjects: TimetableSubject[] | undefined,
  codeMap: Map<string, string>
): { blocks: TimetableBlock[]; subjects?: TimetableSubject[] } {
  const nextBlocks = blocks.map((b) => {
    if (b.kind !== 'class' || !b.cells) return { ...b, id: uuidv4() };
    const cells: NonNullable<TimetableBlock['cells']> = {};
    Object.entries(b.cells).forEach(([key, cell]) => {
      cells[codeMap.get(key) ?? key] = { ...cell };
    });
    return { ...b, id: uuidv4(), cells };
  });
  const nextSubjects = subjects?.map((s) =>
    s.ownerClassCode ? { ...s, ownerClassCode: codeMap.get(s.ownerClassCode) ?? s.ownerClassCode } : s
  );
  return { blocks: nextBlocks, subjects: nextSubjects };
}

export class CampTimetableService {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  async listByJobCodeId(jobCodeId: string): Promise<CampTimetable[]> {
    const q = query(collection(this.db, COLLECTION), where('jobCodeId', '==', jobCodeId));
    const snap = await getDocs(q);
    const rows: CampTimetable[] = [];
    snap.forEach((d) => rows.push({ id: d.id, ...d.data() } as CampTimetable));
    return rows.sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.groupName.localeCompare(b.groupName)
    );
  }

  async get(id: string): Promise<CampTimetable | null> {
    const snap = await getDoc(doc(this.db, COLLECTION, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as CampTimetable;
  }

  async create(input: CreateTimetableInput): Promise<CampTimetable> {
    const id = uuidv4();
    const now = Timestamp.now();

    let order = input.order;
    if (order === undefined) {
      const existing = await this.listByJobCodeId(input.jobCodeId);
      order = existing.length ? Math.max(...existing.map((t) => t.order ?? 0)) + 1 : 0;
    }

    const timetable: Omit<CampTimetable, 'id'> = {
      campCode: input.campCode,
      jobCodeId: input.jobCodeId,
      groupName: input.groupName,
      dayType: input.dayType,
      dayTypeLabel: input.dayTypeLabel,
      layout: input.layout ?? 'time',
      order,
      classes: input.classes,
      extraColumns: input.extraColumns ?? [],
      subjects: input.subjects ?? [],
      blocks: input.blocks ?? [],
      note: input.note ?? '',
      createdAt: now,
      createdBy: input.userId,
      updatedAt: now,
      updatedBy: input.userId,
    };

    await setDoc(doc(this.db, COLLECTION, id), timetable);
    return { id, ...timetable };
  }

  async update(id: string, data: UpdateTimetableInput, userId: string): Promise<void> {
    await updateDoc(doc(this.db, COLLECTION, id), {
      ...data,
      updatedAt: Timestamp.now(),
      updatedBy: userId,
    });
  }

  async remove(id: string): Promise<void> {
    await deleteDoc(doc(this.db, COLLECTION, id));
  }

  /** 다른 그룹 / 다른 일과 / 다른 캠프로 복사 */
  async duplicate(
    sourceId: string,
    target: {
      groupName?: string;
      dayType?: string;
      dayTypeLabel?: string;
      layout?: TimetableLayout;
      campCode?: string;
      jobCodeId?: string;
      classes?: TimetableClassColumn[];
    },
    userId: string
  ): Promise<CampTimetable> {
    const source = await this.get(sourceId);
    if (!source) throw new Error('원본 시간표를 찾을 수 없습니다.');

    const classes = target.classes ?? source.classes;
    const codeMap = new Map<string, string>();
    source.classes.forEach((c, i) => {
      const next = classes[i];
      if (next) codeMap.set(c.classCode, next.classCode);
    });
    const { blocks, subjects } = remap(source.blocks, source.subjects, codeMap);

    return this.create({
      campCode: target.campCode ?? source.campCode,
      jobCodeId: target.jobCodeId ?? source.jobCodeId,
      groupName: target.groupName ?? source.groupName,
      dayType: target.dayType ?? source.dayType,
      dayTypeLabel: target.dayTypeLabel ?? source.dayTypeLabel,
      layout: target.layout ?? source.layout ?? 'time',
      classes,
      extraColumns: source.extraColumns,
      subjects,
      blocks,
      note: source.note,
      userId,
    });
  }

  async reorder(ids: string[]): Promise<void> {
    const batch = writeBatch(this.db);
    ids.forEach((id, index) => {
      batch.update(doc(this.db, COLLECTION, id), { order: index, updatedAt: Timestamp.now() });
    });
    await batch.commit();
  }
}
