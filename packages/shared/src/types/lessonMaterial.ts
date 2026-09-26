/**
 * 수업 자료 (lessonMaterials / sections / lessonMaterialTemplates) — web·mobile·shared 공용 타입
 * 예전에는 web·mobile 서비스와 shared utils 에 모양이 다른 같은 이름 타입이 세 벌 있었다.
 */
import type { Timestamp } from 'firebase/firestore';

export interface SectionData {
  id: string;
  title: string;
  order: number;
  viewUrl: string;
  originalUrl: string;
  /** 템플릿 섹션 ID (템플릿 기반 섹션인 경우) */
  templateSectionId?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LessonMaterialData {
  id: string;
  userId: string;
  title: string;
  order: number;
  templateId?: string;
  /** 사용자가 추가한 대주제의 코드 (D26, F26 등) */
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
  /** 삭제된 섹션 ID 추적 */
  deletedSectionIds?: string[];
}
