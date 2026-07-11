import type { CampType } from './student';

export type FieldPermission = 'readonly' | 'mentor' | 'all';
export type FieldType = 'text' | 'score';

/**
 * 학생 상세 화면에서 하나의 필드를 어떻게 표시·편집할지 정의
 */
export interface FieldItemConfig {
  sheetHeader: string;   // Google Sheets 1행 헤더명 (예: '상담(특별)')
  fieldKey: string;      // STSheetStudent[fieldKey] 또는 displayFields[sheetHeader] 접근 키
  label: string;         // UI 표시명
  isLegacy: boolean;     // ST_SHEET_HEADER_MAPPING에 이미 정의된 기존 필드 여부
  permission: FieldPermission;
  isEditable: boolean;   // true면 Google Sheets batchUpdate 지원
  fieldType: FieldType;
  maxScore?: number;     // fieldType === 'score'일 때 만점 (0이면 표시 안 함)
  order: number;
  isVisible: boolean;
}

/**
 * 학생 상세 화면의 한 섹션(예: '상담', '레벨 테스트')
 */
export interface FieldSectionConfig {
  id: string;
  label: string;
  order: number;
  isVisible: boolean;
  fields: FieldItemConfig[];
}

/**
 * Firestore stSheetFieldConfig/{campType} 문서
 */
export interface STSheetFieldConfig {
  campType: CampType;
  sections: FieldSectionConfig[];
  updatedAt: string;
  updatedBy: string;
}
