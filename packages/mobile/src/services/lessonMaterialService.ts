import { createLessonMaterialService } from '@smis-mentor/shared';
import { db } from '../config/firebase';

export type { SectionData, LessonMaterialData, LessonMaterialTemplateSection, LessonMaterialTemplate } from '@smis-mentor/shared';

/** 수업 자료 — 구현은 shared (web 과 같은 코드) */
export const {
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
} = createLessonMaterialService(db);
