/**
 * 학부모 — 연결된 아이 읽기 (학부모 본인 · 관리자, 규칙 parentLinks)
 */
import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { PARENT_LINKS_COLLECTION, type ParentChildLink, type ParentLinksDoc } from '../types/parent';

export async function getMyParentLinks(db: Firestore, uid: string): Promise<ParentChildLink[]> {
  if (!uid) return [];
  const snap = await getDoc(doc(db, PARENT_LINKS_COLLECTION, uid));
  const children = (snap.data() as ParentLinksDoc | undefined)?.children;
  return Array.isArray(children) ? children : [];
}
