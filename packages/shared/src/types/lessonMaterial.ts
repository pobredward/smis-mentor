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

/** 템플릿을 받는 사람 — 'mentor' 한국인 멘토, 'foreign' 원어민 */
export type LessonAudienceRole = 'mentor' | 'foreign';

/**
 * 템플릿을 누가 올리는지.
 * 예) 패턴 = 한국인 멘토 중 '수업' / 방OT = '담임'·'수업' / 반OT·인문학… = '담임' / 레슨플랜 = 원어민 전원
 * 없으면 예전처럼 한국인 멘토 전원 (원어민에게는 보이지 않는다)
 */
export interface LessonMaterialAudience {
  roles: LessonAudienceRole[];
  /** 그 안의 역할(users.jobExperiences[].groupRole). 비어 있으면 전원 — 예: ['수업'], ['Speaking','Reading','Writing','Mix'] */
  groupRoles?: string[];
}

export interface LessonMaterialTemplate {
  id: string;
  title: string;
  sections: LessonMaterialTemplateSection[];
  code?: string;
  links?: { label: string; url: string }[];
  /** 누가 올리는지 — 없으면 한국인 멘토 전원 */
  audience?: LessonMaterialAudience;
  /**
   * 반별로 만들기 (원어민 레슨플랜) — 그 사람이 맡은 그룹의 반마다 소제목이 하나씩 생기고,
   * 보조 교재(spare)가 있는 반은 하나 더 생긴다. sections 에 넣은 소제목(예: Outdoor Class)은 그 뒤에 붙는다.
   */
  perClass?: boolean;
  /** 같은 캠프 코드 안에서 보이는 차례 (수업 탭 주제 순서). 없으면 만든 순서 */
  order?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  deleted?: boolean;
  deletedAt?: Timestamp;
  /** 삭제된 섹션 ID 추적 */
  deletedSectionIds?: string[];
}
