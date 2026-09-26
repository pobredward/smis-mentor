/**
 * 여러 문서를 적은 읽기 횟수로 가져오는 도우미 (지원자 목록 N+1 제거) — web·mobile 공용
 * Firestore 'in' 은 한 번에 30개까지라 30개씩 나눠 병렬로 조회한다.
 */
import { collection, documentId, getDocs, query, where, type DocumentData, type Firestore } from 'firebase/firestore';

const chunk = <T,>(arr: T[], n = 30) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** id 목록 → Map(id → 데이터). 데이터에 id·userId(없으면 문서 id)를 채워 준다 */
export async function getDocsByIds(db: Firestore, col: string, ids: string[]): Promise<Map<string, DocumentData>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, DocumentData>();
  const snaps = await Promise.all(chunk(uniq).map((part) => getDocs(query(collection(db, col), where(documentId(), 'in', part)))));
  snaps.forEach((s) => s.docs.forEach((d) => out.set(d.id, { ...d.data(), userId: d.data().userId ?? d.id, id: d.id })));
  return out;
}

/** field 가 values 중 하나인 문서 전부 */
export async function queryWhereIn(db: Firestore, col: string, field: string, values: string[]) {
  const uniq = [...new Set(values.filter(Boolean))];
  const snaps = await Promise.all(chunk(uniq).map((part) => getDocs(query(collection(db, col), where(field, 'in', part)))));
  return snaps.flatMap((s) => s.docs);
}
