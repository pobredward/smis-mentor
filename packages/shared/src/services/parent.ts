/**
 * 학부모 — 내 아이 · 내 아이 캠프 참가 읽기 (규칙: parentIds 에 내 uid 가 있는 문서만)
 * 쓰기는 서버 API (/api/parent/children · /api/parent/enrollments).
 */
import { collection, collectionGroup, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { CHILDREN_COLLECTION, ENROLLMENTS_SUBCOLLECTION, type ChildProfile, type CampEnrollment } from '../types/campStudent';

export async function getMyChildren(db: Firestore, uid: string): Promise<ChildProfile[]> {
  if (!uid) return [];
  const snap = await getDocs(query(collection(db, CHILDREN_COLLECTION), where('parentIds', 'array-contains', uid)));
  return snap.docs
    .map((d) => ({ ...(d.data() as ChildProfile), childId: d.id }))
    .sort((a, b) => String(a.birthDate ?? '').localeCompare(String(b.birthDate ?? '')) || a.name.localeCompare(b.name));
}

/** 내 아이들의 캠프 참가 (모든 캠프) — 최근 캠프부터 */
export async function getMyEnrollments(db: Firestore, uid: string): Promise<CampEnrollment[]> {
  if (!uid) return [];
  const snap = await getDocs(query(collectionGroup(db, ENROLLMENTS_SUBCOLLECTION), where('parentIds', 'array-contains', uid)));
  return snap.docs
    .map((d) => ({ ...(d.data() as CampEnrollment), studentId: d.id, campCode: String(d.get('campCode') || d.ref.parent.parent?.id || '') }))
    .sort((a, b) => b.campCode.localeCompare(a.campCode, 'ko', { numeric: true }));
}
