import { createLessonMaterialService } from '@smis-mentor/shared';
import { db } from '@/lib/firebase';

export type { SectionData, LessonMaterialData, LessonMaterialTemplateSection, LessonMaterialTemplate } from '@smis-mentor/shared';

/** 수업 자료 — 구현은 shared (mobile 과 같은 코드) */
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
