import { db } from '@/lib/firebase';
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
import { v4 as uuidv4 } from 'uuid';

export interface SectionData {
  id: string;
  title: string;
  order: number;
  viewUrl: string;
  originalUrl: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LessonMaterialData {
  id: string;
  userId: string;
  title: string;
  order: number;
  templateId?: string;
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

// 대제목 순서 변경
export async function reorderLessonMaterials(userId: string, orderedIds: string[]) {
  const batch = writeBatch(db);
  orderedIds.forEach((id, idx) => {
    batch.update(doc(db, LESSON_MATERIALS, id), { order: idx });
  });
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

// 소제목 순서 변경
export async function reorderSections(lessonMaterialId: string, orderedIds: string[]) {
  const batch = writeBatch(db);
  orderedIds.forEach((id, idx) => {
    batch.update(doc(db, LESSON_MATERIALS, lessonMaterialId, SECTIONS, id), { order: idx });
  });
  await batch.commit();
}

// 템플릿(lessonMaterialTemplates) CRUD
export async function getLessonMaterialTemplates() {
  const q = query(collection(db, LESSON_MATERIAL_TEMPLATES), orderBy('title', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as LessonMaterialTemplate[];
}

export async function addLessonMaterialTemplate(title: string, sections: Omit<LessonMaterialTemplateSection, 'id'>[], code?: string, links?: { label: string; url: string }[]) {
  const docRef = await addDoc(collection(db, LESSON_MATERIAL_TEMPLATES), {
    title,
    sections: sections.map((s, idx) => ({ ...s, id: uuidv4(), order: idx, links: s.links || [] })),
    code: code || '',
    links: links || [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateLessonMaterialTemplate(id: string, updates: Partial<Omit<LessonMaterialTemplate, 'id'>>) {
  // sections가 있으면 links도 항상 배열로 보장
  const safeUpdates = {
    ...updates,
    ...(updates.sections ? { sections: updates.sections.map((s) => ({ ...s, order: s.order, links: s.links || [] })) } : {}),
    ...(updates.links ? { links: updates.links } : {}),
    updatedAt: serverTimestamp(),
  };
  await updateDoc(doc(db, LESSON_MATERIAL_TEMPLATES, id), safeUpdates);
}

export async function deleteLessonMaterialTemplate(id: string) {
  await deleteDoc(doc(db, LESSON_MATERIAL_TEMPLATES, id));
} 