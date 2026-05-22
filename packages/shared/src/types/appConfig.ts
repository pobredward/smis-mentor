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

  /** 강제 업데이트 최소 버전 (이 버전 미만이면 스토어로 이동) */
  minVersion?: string;

  /** iOS App Store URL */
  iosStoreUrl?: string;

  /** Android Google Play Store URL */
  androidStoreUrl?: string;
  
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
  minVersion?: string;
  iosStoreUrl?: string;
  androidStoreUrl?: string;
}

/** 버전 체크 결과 */
export interface VersionCheckResult {
  /** 강제 업데이트가 필요한지 여부 */
  needsUpdate: boolean;
  /** iOS 스토어 URL */
  iosStoreUrl: string;
  /** Android 스토어 URL */
  androidStoreUrl: string;
}

/** 캠프별 홈 메시지 */
export interface CampHomeMessage {
  campCode: string;
  mentorMessage: string;
  foreignMessage: string;
  updatedAt: Date;
  updatedBy?: string;
}

/** 캠프별 홈 메시지 수정 DTO */
export interface CampHomeMessageUpdateInput {
  mentorMessage?: string;
  foreignMessage?: string;
}
