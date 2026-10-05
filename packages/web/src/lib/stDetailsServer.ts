/**
 * 학생 상세 문서 쓰기 (서버 · 동기화 전용) — stSheetCache/{캠프}/details/{학생 키}
 * 이번 동기화에 없는 학생의 상세 문서는 지운다.
 */
import { getAdminFirestore } from '@/lib/firebase-admin';
import { ST_DETAIL_SUBCOLLECTION, type StudentDetailDoc } from '@smis-mentor/shared';

export async function writeStudentDetails(campCode: string, details: Map<string, StudentDetailDoc>): Promise<{ written: number; removed: number }> {
  const db = getAdminFirestore();
  const col = db.collection('stSheetCache').doc(campCode).collection(ST_DETAIL_SUBCOLLECTION);
  const existing = await col.listDocuments();
  const stale = existing.filter((ref) => !details.has(ref.id));
  const ops: Array<(b: FirebaseFirestore.WriteBatch) => void> = [
    ...[...details].map(([key, d]) => (b: FirebaseFirestore.WriteBatch) => { b.set(col.doc(key), d); }),
    ...stale.map((ref) => (b: FirebaseFirestore.WriteBatch) => { b.delete(ref); }),
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
  return { written: details.size, removed: stale.length };
}
