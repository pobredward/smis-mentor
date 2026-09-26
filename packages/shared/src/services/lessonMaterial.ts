/**
 * 수업 자료 (대제목 · 소제목 · 관리자 템플릿) — web·mobile 공용.
 */
import {
  type Firestore,
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
} from 'firebase/firestore';
import { newId } from '../utils/id';
import type { LessonMaterialData, LessonMaterialTemplate, LessonMaterialTemplateSection, SectionData } from '../types/lessonMaterial';

const LESSON_MATERIALS = 'lessonMaterials';
const SECTIONS = 'sections';
const LESSON_MATERIAL_TEMPLATES = 'lessonMaterialTemplates';

/** 템플릿 섹션 id — uuid 패키지 없이 (React Native 호환) */
const newSectionId = (): string => newId();

export function createLessonMaterialService(db: Firestore) {
  // 대제목(lessonMaterial) CRUD
  async function getLessonMaterials(userId: string) {
    const q = query(
      collection(db, LESSON_MATERIALS),
      where('userId', '==', userId),
      orderBy('order', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as LessonMaterialData[];
  }

  async function addLessonMaterial(userId: string, title: string, order: number, templateId?: string) {
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

  async function updateLessonMaterial(id: string, updates: Partial<LessonMaterialData>) {
    await updateDoc(doc(db, LESSON_MATERIALS, id), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  }

  async function deleteLessonMaterial(id: string) {
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
  async function reorderLessonMaterials(userId: string, orderedIds: string[]) {
    const batch = writeBatch(db);
    orderedIds.forEach((id, idx) => {
      batch.update(doc(db, LESSON_MATERIALS, id), { order: idx });
    });
    await batch.commit();
  }

  // 소제목(section) CRUD
  async function getSections(lessonMaterialId: string) {
    const q = query(
      collection(db, LESSON_MATERIALS, lessonMaterialId, SECTIONS),
      orderBy('order', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as SectionData[];
  }

  async function addSection(lessonMaterialId: string, data: Omit<SectionData, 'id'>) {
    const docRef = await addDoc(collection(db, LESSON_MATERIALS, lessonMaterialId, SECTIONS), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async function updateSection(lessonMaterialId: string, sectionId: string, updates: Partial<SectionData>) {
    await updateDoc(doc(db, LESSON_MATERIALS, lessonMaterialId, SECTIONS, sectionId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  }

  async function deleteSection(lessonMaterialId: string, sectionId: string) {
    await deleteDoc(doc(db, LESSON_MATERIALS, lessonMaterialId, SECTIONS, sectionId));
  }

  // 소제목 순서 변경
  async function reorderSections(lessonMaterialId: string, orderedIds: string[]) {
    const batch = writeBatch(db);
    orderedIds.forEach((id, idx) => {
      batch.update(doc(db, LESSON_MATERIALS, lessonMaterialId, SECTIONS, id), { order: idx });
    });
    await batch.commit();
  }

  // 템플릿(lessonMaterialTemplates) CRUD
  async function getLessonMaterialTemplates() {
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

  async function addLessonMaterialTemplate(title: string, sections: Omit<LessonMaterialTemplateSection, 'id'>[], code?: string, links?: { label: string; url: string }[]) {
    const docRef = await addDoc(collection(db, LESSON_MATERIAL_TEMPLATES), {
      title,
      sections: sections.map((s, idx) => ({ ...s, id: newSectionId(), order: idx, links: s.links || [] })),
      code: code || '',
      links: links || [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async function updateLessonMaterialTemplate(id: string, updates: Partial<Omit<LessonMaterialTemplate, 'id'>>) {
    // sections가 있으면 links도 항상 배열로 보장
    const safeUpdates = {
      ...updates,
      ...(updates.sections ? { sections: updates.sections.map((s) => ({ ...s, order: s.order, links: s.links || [] })) } : {}),
      ...(updates.links ? { links: updates.links } : {}),
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db, LESSON_MATERIAL_TEMPLATES, id), safeUpdates);
  }

  async function deleteLessonMaterialTemplate(id: string) {
    // Soft delete: deleted 플래그만 설정
    await updateDoc(doc(db, LESSON_MATERIAL_TEMPLATES, id), {
      deleted: true,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  return {
    getLessonMaterials,
    addLessonMaterial,
    updateLessonMaterial,
    deleteLessonMaterial,
    reorderLessonMaterials,
    getSections,
    addSection,
    updateSection,
    deleteSection,
    reorderSections,
    getLessonMaterialTemplates,
    addLessonMaterialTemplate,
    updateLessonMaterialTemplate,
    deleteLessonMaterialTemplate,
  };
}
