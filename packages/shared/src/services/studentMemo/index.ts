/** 학생 자유 메모 Firestore 서비스 — 타입은 types/studentMemo.ts */
import { doc, onSnapshot, setDoc, deleteField, Timestamp, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { studentMemoId, type StudentMemo, type StudentMemoKey } from '../../types/studentMemo';

const COL = 'studentMemos';

export const subscribeStudentMemo = (
  db: Firestore, campCode: string, studentId: string,
  onData: (m: StudentMemo | null) => void, onError?: (e: Error) => void,
): Unsubscribe =>
  onSnapshot(doc(db, COL, studentMemoId(campCode, studentId)),
    snap => onData(snap.exists() ? ({ id: snap.id, ...snap.data() } as StudentMemo) : null),
    e => onError?.(e));

/** 메모 한 칸 저장 (빈 문자열이면 지움) */
export const saveStudentMemo = async (
  db: Firestore, campCode: string, student: { studentId: string; name?: string },
  key: StudentMemoKey, text: string, actor: { uid: string; name: string },
): Promise<void> => {
  const t = text.trim();
  await setDoc(doc(db, COL, studentMemoId(campCode, student.studentId)), {
    campCode,
    studentId: student.studentId,
    ...(student.name ? { studentName: student.name } : {}),
    [key]: t ? { text: t, by: actor.name, byId: actor.uid, at: Timestamp.now() } : deleteField(),
  }, { merge: true });
};
