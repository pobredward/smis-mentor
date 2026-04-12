import { db } from '../config/firebase';
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';

export interface SectionData {
  id: string;
  title: string;
  order: number;
  viewUrl?: string;
  originalUrl?: string;
  templateSectionId?: string; // 템플릿 섹션 ID
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LessonMaterialData {
  id: string;
  userId: string;
  title: string;
  order: number;
  templateId?: string;
  userCode?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LessonMaterialTemplateSection {
  id: string;
  title: string;
  order: number;
  links?: { label: string; url: string }[];
}

export interface LessonMaterialTemplate {
  id: string;
  title: string;
  sections: LessonMaterialTemplateSection[];
  code?: string;
  links?: { label: string; url: string }[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  deleted?: boolean;
  deletedAt?: Timestamp;
  deletedSectionIds?: string[];
}

const LESSON_MATERIALS = 'lessonMaterials';
const SECTIONS = 'sections';
const LESSON_MATERIAL_TEMPLATES = 'lessonMaterialTemplates';

// 대제목(lessonMaterial) CRUD
export async function getLessonMaterials(userId: string) {
  const q = query(
    collection(db, LESSON_MATERIALS),
    where('userId', '==', userId),
    orderBy('order', 'asc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as LessonMaterialData[];
}

export async function addLessonMaterial(userId: string, title: string, order: number, templateId?: string) {
  const docRef = await addDoc(collection(db, LESSON_MATERIALS), {
    userId,
    title,
    order,
    templateId: templateId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateLessonMaterial(id: string, updates: Partial<LessonMaterialData>) {
  await updateDoc(doc(db, LESSON_MATERIALS, id), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteLessonMaterial(id: string) {
  // 하위 section도 삭제
  const sectionsQ = query(collection(db, LESSON_MATERIALS, id, SECTIONS));
  const sectionsSnap = await getDocs(sectionsQ);
  const batch = writeBatch(db);
  sectionsSnap.forEach(sectionDoc => {
    batch.delete(sectionDoc.ref);
  });
  batch.delete(doc(db, LESSON_MATERIALS, id));
  await batch.commit();
}

// 소제목(section) CRUD
export async function getSections(lessonMaterialId: string) {
  const q = query(
    collection(db, LESSON_MATERIALS, lessonMaterialId, SECTIONS),
    orderBy('order', 'asc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as SectionData[];
}

export async function addSection(lessonMaterialId: string, data: Omit<SectionData, 'id'>) {
  const docRef = await addDoc(collection(db, LESSON_MATERIALS, lessonMaterialId, SECTIONS), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateSection(lessonMaterialId: string, sectionId: string, updates: Partial<SectionData>) {
  await updateDoc(doc(db, LESSON_MATERIALS, lessonMaterialId, SECTIONS, sectionId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSection(lessonMaterialId: string, sectionId: string) {
  await deleteDoc(doc(db, LESSON_MATERIALS, lessonMaterialId, SECTIONS, sectionId));
}

// 템플릿(lessonMaterialTemplates) CRUD
export async function getLessonMaterialTemplates() {
  const snapshot = await getDocs(collection(db, LESSON_MATERIAL_TEMPLATES));
  const templates = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as LessonMaterialTemplate[];
  
  // 클라이언트에서 필터링 및 정렬
  return templates
    .filter(t => !t.deleted)
    .sort((a, b) => {
      const timeA = a.createdAt?.toMillis?.() || 0;
      const timeB = b.createdAt?.toMillis?.() || 0;
      return timeA - timeB;
    });
}

export async function addLessonMaterialTemplate(
  title: string,
  sections: LessonMaterialTemplateSection[],
  code?: string,
  links?: { label: string; url: string }[]
) {
  const docRef = await addDoc(collection(db, LESSON_MATERIAL_TEMPLATES), {
    title,
    sections,
    code: code || null,
    links: links || [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateLessonMaterialTemplate(
  id: string,
  updates: Partial<Omit<LessonMaterialTemplate, 'id'>>
) {
  await updateDoc(doc(db, LESSON_MATERIAL_TEMPLATES, id), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteLessonMaterialTemplate(id: string) {
  await updateDoc(doc(db, LESSON_MATERIAL_TEMPLATES, id), {
    deleted: true,
    deletedAt: serverTimestamp(),
  });
}
