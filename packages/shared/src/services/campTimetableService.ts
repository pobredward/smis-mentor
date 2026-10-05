import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import type { CampTimetable } from '../types/campTimetable';
import { campCodeOf } from './campKey';

/**
 * 캠프 시간표 읽기 (web·mobile 공용).
 * 쓰기는 시간표 편집기가 한 번에 한다 — timetableWorkspaceService.commitTimetableWorkspace
 */
const COLLECTION = 'campTimetables';

export class CampTimetableService {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  /** 캠프의 시간표 — 캠프 열쇠(campCode)로 찾는다 (모든 시간표에 campCode 가 있다) */
  async listByJobCodeId(jobCodeId: string): Promise<CampTimetable[]> {
    const campCode = await campCodeOf(this.db, jobCodeId);
    if (!campCode) return [];
    return this.listByCampCode(campCode);
  }

  async listByCampCode(campCode: string): Promise<CampTimetable[]> {
    const q = query(collection(this.db, COLLECTION), where('campCode', '==', campCode));
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
}
