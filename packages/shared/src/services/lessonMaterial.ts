/**
 * 수업 자료 (대제목 · 소제목 · 관리자 템플릿) — web·mobile 공용.
 */
import {
  type Firestore,
  collection,
  doc,
  getDocs,
  addDoc,
  setDoc,
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

  /**
   * 템플릿 대주제 — 문서 id 를 '사용자_템플릿' 으로 고정해서 만든다.
   * 웹·앱이 동시에 처음 열어도 같은 문서 하나만 생긴다 (예전 addDoc 은 같은 템플릿 대주제가 둘 생길 수 있었다)
   */
  async function ensureTemplateMaterial(userId: string, templateId: string, title: string, order: number) {
    const id = `${userId}_${templateId}`;
    await setDoc(doc(db, LESSON_MATERIALS, id), {
      userId,
      title,
      order,
      templateId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return id;
  }

  /**
   * 템플릿 칸에 링크 넣기 — 같은 칸(templateSectionId) 문서가 이미 있으면 그걸 고친다 (다른 기기에서 먼저 넣었어도 둘이 되지 않게).
   * 돌려주는 값은 저장된 소제목 문서 id
   */
  async function saveTemplateSection(
    lessonMaterialId: string,
    templateSectionId: string,
    data: { title: string; order: number; viewUrl: string; originalUrl: string },
  ) {
    const existing = (await getSections(lessonMaterialId)).filter((s) => s.templateSectionId === templateSectionId);
    const keep = existing.find((s) => s.viewUrl || s.originalUrl) ?? existing[0];
    if (keep) {
      await updateSection(lessonMaterialId, keep.id, { ...data, templateSectionId });
      return keep.id;
    }
    return addSection(lessonMaterialId, { ...data, templateSectionId });
  }

  /** 템플릿 칸 비우기 — 그 칸의 소제목 문서를 모두 지운다 (중복이 남아 있으면 다시 나타나므로) */
  async function clearTemplateSection(lessonMaterialId: string, templateSectionId: string) {
    const list = (await getSections(lessonMaterialId)).filter((s) => s.templateSectionId === templateSectionId);
    if (!list.length) return;
    const batch = writeBatch(db);
    list.forEach((s) => batch.delete(doc(db, LESSON_MATERIALS, lessonMaterialId, SECTIONS, s.id)));
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

  async function addLessonMaterialTemplate(
    title: string,
    sections: Omit<LessonMaterialTemplateSection, 'id'>[],
    code?: string,
    links?: { label: string; url: string }[],
    /** 누가 올리는지 · 반별로 만들기 (없으면 한국인 멘토 전원) */
    extra?: Pick<LessonMaterialTemplate, 'audience' | 'perClass' | 'order'>,
  ) {
    const docRef = await addDoc(collection(db, LESSON_MATERIAL_TEMPLATES), {
      title,
      sections: sections.map((s, idx) => ({ ...s, id: newSectionId(), order: idx, links: s.links || [] })),
      code: code || '',
      links: links || [],
      ...(extra?.audience ? { audience: extra.audience } : {}),
      ...(extra?.perClass ? { perClass: true } : {}),
      ...(typeof extra?.order === 'number' ? { order: extra.order } : {}),
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
    ensureTemplateMaterial,
    saveTemplateSection,
    clearTemplateSection,
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
