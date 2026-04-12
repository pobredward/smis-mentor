/**
 * 앱 전역 설정 타입
 * Firestore 컬렉션: appConfig
 */

export interface AppConfig {
  id: string;
  
  /** 로딩 화면에 표시할 문구 목록 */
  loadingQuotes: string[];
  
  /** 멘토 홈 화면에 표시할 문구 */
  mentorHomeMessage?: string;
  
  /** 외국인 홈 화면에 표시할 문구 */
  foreignHomeMessage?: string;
  
  /** 최종 수정 시간 */
  updatedAt: Date;
  
  /** 수정한 관리자 ID */
  updatedBy?: string;
}

/** 앱 설정 생성/수정 DTO */
export interface AppConfigUpdateInput {
  loadingQuotes: string[];
  mentorHomeMessage?: string;
  foreignHomeMessage?: string;
}
