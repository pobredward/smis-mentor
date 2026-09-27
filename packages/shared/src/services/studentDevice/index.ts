/** 학생 전자기기 Firestore 서비스 — 타입은 types/studentDevice.ts */
import {
  collection, doc, query, where, getDocs, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch, arrayUnion,
  Timestamp, type Firestore, type Unsubscribe,
} from 'firebase/firestore';
import type { StudentDevice, DeviceLocation } from '../../types/studentDevice';

const COL = 'studentDevices';

export interface DeviceActor { uid: string; name: string }

const clean = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export const subscribeStudentDevices = (
  db: Firestore, campCode: string, studentId: string,
  onData: (d: StudentDevice[]) => void, onError?: (e: Error) => void,
): Unsubscribe =>
  onSnapshot(query(collection(db, COL), where('campCode', '==', campCode), where('studentId', '==', studentId)),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }) as StudentDevice)
      .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))),
    e => onError?.(e));

/** 캠프 전체 기기 (명단 일괄 처리용) */
export const getCampDevices = async (db: Firestore, campCode: string): Promise<StudentDevice[]> => {
  const snap = await getDocs(query(collection(db, COL), where('campCode', '==', campCode)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as StudentDevice);
};

export type StudentDeviceInput = Pick<StudentDevice,
  'kind' | 'model' | 'feature' | 'lockType' | 'lockCode' | 'location' | 'holderName' | 'holderId' | 'needsCharge'
  | 'batteryPercent' | 'batteryNote' | 'chargerTypes' | 'note'>;

export const addStudentDevice = async (
  db: Firestore, campCode: string,
  student: { studentId: string; name: string; classNumber?: string; roomNumber?: string },
  input: StudentDeviceInput, actor: DeviceActor,
): Promise<string> => {
  const now = Timestamp.now();
  const ref = await addDoc(collection(db, COL), clean({
    campCode,
    studentId: student.studentId,
    studentName: student.name,
    classNumber: student.classNumber || undefined,
    roomNumber: student.roomNumber || undefined,
    ...input,
    feature: input.feature?.trim() || undefined,
    lockCode: input.lockType === 'none' ? undefined : input.lockCode?.trim() || undefined,
    batteryNote: input.batteryNote?.trim() || undefined,
    note: input.note?.trim() || undefined,
    needsCharge: input.needsCharge || undefined,
    batteryPercent: input.batteryPercent ?? undefined,
    chargerTypes: input.chargerTypes?.length ? input.chargerTypes : undefined,
    holderName: input.location === 'teacher' ? input.holderName?.trim() || undefined : undefined,
    holderId: input.location === 'teacher' ? input.holderId || undefined : undefined,
    createdBy: actor.name, createdById: actor.uid, createdAt: now, updatedAt: now, updatedBy: actor.name,
  }));
  return ref.id;
};

/** 기기 정보 수정 (위치 변경은 moveStudentDevices 로) */
export const updateStudentDevice = async (
  db: Firestore, id: string, patch: Partial<Omit<StudentDeviceInput, 'location' | 'holderName' | 'holderId'>>, actor: DeviceActor,
): Promise<void> => {
  await updateDoc(doc(db, COL, id), {
    ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined || v === '' ? null : v])),
    updatedAt: Timestamp.now(), updatedBy: actor.name,
  });
};

/** 보관 위치 이동 (여러 대 한 번에) — 이동 이력 남김. 'teacher' 면 맡은 선생님(holder) 필수 */
export const moveStudentDevices = async (
  db: Firestore, devices: Pick<StudentDevice, 'id' | 'location' | 'holderName'>[], to: DeviceLocation, actor: DeviceActor,
  holder?: { name: string; id?: string },
): Promise<void> => {
  const now = Timestamp.now();
  const batch = writeBatch(db);
  const holderName = to === 'teacher' ? holder?.name?.trim() || null : null;
  devices.filter(d => d.location !== to || (to === 'teacher' && d.holderName !== holderName)).forEach(d => {
    batch.update(doc(db, COL, d.id), {
      location: to,
      holderName,
      holderId: to === 'teacher' ? holder?.id || null : null,
      moves: arrayUnion(clean({ at: now, by: actor.name, byId: actor.uid, from: d.location, to, holder: holderName || undefined })),
      updatedAt: now, updatedBy: actor.name,
    });
  });
  await batch.commit();
};

export const deleteStudentDevice = async (db: Firestore, id: string): Promise<void> => {
  await deleteDoc(doc(db, COL, id));
};
