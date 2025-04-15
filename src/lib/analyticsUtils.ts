import { Analytics, logEvent as firebaseLogEvent } from 'firebase/analytics';

// 주요 분석 이벤트 카테고리 - 현업 기준으로 최적화
export const AnalyticsEvents = {
  // 핵심 사용자 여정
  FUNNEL_START: 'funnel_start',
  FUNNEL_STEP: 'funnel_step',
  FUNNEL_COMPLETE: 'funnel_complete',
  
  // 사용자 행동
  USER_SIGN_UP: 'sign_up',
  USER_LOGIN: 'login',
  USER_LOGOUT: 'logout',
  
  // 검색 및 탐색
  SEARCH: 'search',
  APPLY_FILTER: 'apply_filter',
  PAGE_VIEW: 'page_view',
  
  // 콘텐츠 상호작용
  VIEW_JOB: 'view_job',
  SHARE_JOB: 'share_job',
  DOWNLOAD_FILE: 'download_file',
  
  // 폼 상호작용
  FORM_START: 'form_start',
  FORM_STEP_COMPLETE: 'form_step_complete',
  FORM_SUBMIT: 'form_submit',
  FORM_ERROR: 'form_error',
  
  // 성능 및 오류
  ERROR_OCCURRED: 'error_occurred',
  PERFORMANCE_METRIC: 'performance_metric',
} as const;

// 이벤트 매개변수 - 일관된 네이밍으로 분석 가능성 향상
export const AnalyticsParams = {
  // 사용자 컨텍스트
  USER_TYPE: 'user_type',         // 'new', 'returning', 'registered'
  USER_ID: 'user_id',             // 익명화된 ID
  
  // 페이지/화면 컨텍스트
  PAGE_PATH: 'page_path',
  PAGE_TITLE: 'page_title',
  PAGE_LOCATION: 'page_location',
  REFERRER: 'referrer',
  
  // 여정/퍼널 컨텍스트
  FUNNEL_NAME: 'funnel_name',     // 'application', 'registration'
  FUNNEL_STEP: 'funnel_step',     // 숫자 또는 단계명
  FUNNEL_STEP_NAME: 'step_name',
  FUNNEL_OPTION: 'funnel_option', // 퍼널 내 선택된 옵션
  
  // 콘텐츠 컨텍스트
  CONTENT_TYPE: 'content_type',   // 'job', 'article', 'faq'
  CONTENT_ID: 'content_id',
  CONTENT_NAME: 'content_name',
  
  // 상호작용 컨텍스트
  INTERACTION_TYPE: 'interaction_type', // 'click', 'scroll', 'hover'
  
  // 폼 컨텍스트
  FORM_ID: 'form_id',
  FORM_NAME: 'form_name',
  FORM_STEP: 'form_step',
  ERROR_TYPE: 'error_type',
  ERROR_MESSAGE: 'error_message',
  
  // 검색 컨텍스트
  SEARCH_TERM: 'search_term',
  SEARCH_TYPE: 'search_type',
  FILTER_APPLIED: 'filter_applied',
  RESULTS_COUNT: 'results_count',
  
  // 기술적 컨텍스트
  DEVICE_CATEGORY: 'device_category', // 'mobile', 'tablet', 'desktop' 
  BROWSER: 'browser',
  LOAD_TIME: 'load_time',
  
  // 비즈니스 컨텍스트
  JOB_CATEGORY: 'job_category',
  JOB_LOCATION: 'job_location',
  JOB_TYPE: 'job_type',
} as const;

// 이벤트 로깅을 위한 최적화된 클래스
export class AnalyticsLogger {
  private analytics: Analytics | null;
  private userProperties: Record<string, unknown> = {};

  constructor(analytics: Analytics | null) {
    this.analytics = analytics;
  }

  // 사용자 속성 설정 - 세션 전반에 걸쳐 적용되는 데이터
  setUserProperty(key: string, value: unknown) {
    this.userProperties[key] = value;
    // Analytics에 사용자 속성 설정 로직 추가 가능
  }

  // 기본 이벤트 로깅 함수
  logEvent(eventName: string, eventParams?: Record<string, unknown>) {
    // 기본 컨텍스트 추가 (모든 이벤트에 공통으로 들어갈 정보)
    const enrichedParams = {
      ...eventParams,
      ...this.getCommonParams(),
    };

    if (this.analytics) {
      firebaseLogEvent(this.analytics, eventName, enrichedParams);
    } else if (process.env.NODE_ENV !== 'production') {
      console.log(`Analytics Event (${eventName}):`, enrichedParams);
    }
  }

  // 모든 이벤트에 공통으로 추가할 파라미터
  private getCommonParams(): Record<string, unknown> {
    return {
      // 현재 URL 경로
      [AnalyticsParams.PAGE_PATH]: typeof window !== 'undefined' ? window.location.pathname : '',
      // 타임스탬프 - 이벤트 순서 분석에 유용
      timestamp: new Date().toISOString(),
      // 사용자 유형 (익명 또는 로그인)
      [AnalyticsParams.USER_TYPE]: this.userProperties?.userType || 'anonymous',
      // 기기 유형 감지
      [AnalyticsParams.DEVICE_CATEGORY]: this.getDeviceCategory(),
    };
  }

  // 기기 카테고리 감지 헬퍼 함수
  private getDeviceCategory(): string {
    if (typeof window === 'undefined') return 'unknown';
    
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  // ===== 최적화된 사용자 여정 이벤트 =====

  // 퍼널 시작 (ex: 지원서 작성 시작)
  trackFunnelStart(funnelName: string, options?: Record<string, unknown>) {
    this.logEvent(AnalyticsEvents.FUNNEL_START, {
      [AnalyticsParams.FUNNEL_NAME]: funnelName,
      ...options,
    });
  }

  // 퍼널 단계 완료 (ex: 지원서 1단계 완료)
  trackFunnelStep(funnelName: string, stepNumber: number, stepName: string, options?: Record<string, unknown>) {
    this.logEvent(AnalyticsEvents.FUNNEL_STEP, {
      [AnalyticsParams.FUNNEL_NAME]: funnelName,
      [AnalyticsParams.FUNNEL_STEP]: stepNumber,
      [AnalyticsParams.FUNNEL_STEP_NAME]: stepName,
      ...options,
    });
  }

  // 퍼널 완료 (ex: 지원서 제출 완료)
  trackFunnelComplete(funnelName: string, options?: Record<string, unknown>) {
    this.logEvent(AnalyticsEvents.FUNNEL_COMPLETE, {
      [AnalyticsParams.FUNNEL_NAME]: funnelName,
      ...options,
    });
  }

  // ===== 최적화된 사용자 행동 이벤트 =====

  // 회원가입
  trackSignUp(method: string, options?: Record<string, unknown>) {
    this.logEvent(AnalyticsEvents.USER_SIGN_UP, {
      method,
      ...options,
    });
  }

  // 로그인
  trackLogin(method: string, options?: Record<string, unknown>) {
    this.logEvent(AnalyticsEvents.USER_LOGIN, {
      method,
      ...options,
    });
  }

  // 로그아웃
  trackLogout(options?: Record<string, unknown>) {
    this.logEvent(AnalyticsEvents.USER_LOGOUT, options);
  }

  // ===== 최적화된 콘텐츠 상호작용 이벤트 =====

  // 페이지 뷰 - 더 많은 컨텍스트 추가
  trackPageView(
    pagePath: string,
    pageTitle: string,
    pageLocation: string,
    referrer?: string,
    options?: Record<string, unknown>
  ) {
    this.logEvent(AnalyticsEvents.PAGE_VIEW, {
      [AnalyticsParams.PAGE_PATH]: pagePath,
      [AnalyticsParams.PAGE_TITLE]: pageTitle,
      [AnalyticsParams.PAGE_LOCATION]: pageLocation,
      [AnalyticsParams.REFERRER]: referrer || document.referrer,
      ...options,
    });
  }

  // 채용 공고 조회 - 상세한 컨텍스트 추가
  trackJobView(
    jobId: string,
    jobTitle: string,
    jobCategory: string,
    jobLocation: string,
    jobType: string,
    options?: Record<string, unknown>
  ) {
    this.logEvent(AnalyticsEvents.VIEW_JOB, {
      [AnalyticsParams.CONTENT_ID]: jobId,
      [AnalyticsParams.CONTENT_NAME]: jobTitle,
      [AnalyticsParams.JOB_CATEGORY]: jobCategory,
      [AnalyticsParams.JOB_LOCATION]: jobLocation,
      [AnalyticsParams.JOB_TYPE]: jobType,
      [AnalyticsParams.CONTENT_TYPE]: 'job',
      ...options,
    });
  }

  // ===== 최적화된 검색 및 필터 이벤트 =====

  // 검색 이벤트
  trackSearch(
    searchTerm: string,
    searchType: string,
    resultsCount: number,
    options?: Record<string, unknown>
  ) {
    this.logEvent(AnalyticsEvents.SEARCH, {
      [AnalyticsParams.SEARCH_TERM]: searchTerm,
      [AnalyticsParams.SEARCH_TYPE]: searchType,
      [AnalyticsParams.RESULTS_COUNT]: resultsCount,
      ...options,
    });
  }

  // 필터 적용 이벤트
  trackApplyFilter(
    filterName: string,
    filterValue: string | string[],
    resultsCount: number,
    options?: Record<string, unknown>
  ) {
    this.logEvent(AnalyticsEvents.APPLY_FILTER, {
      [AnalyticsParams.FILTER_APPLIED]: Array.isArray(filterValue) 
        ? filterValue.join(',') 
        : filterValue,
      filter_name: filterName,
      [AnalyticsParams.RESULTS_COUNT]: resultsCount,
      ...options,
    });
  }

  // ===== 최적화된 폼 상호작용 이벤트 =====

  // 폼 시작 이벤트
  trackFormStart(
    formName: string,
    formId: string,
    options?: Record<string, unknown>
  ) {
    this.logEvent(AnalyticsEvents.FORM_START, {
      [AnalyticsParams.FORM_NAME]: formName,
      [AnalyticsParams.FORM_ID]: formId,
      ...options,
    });
  }

  // 폼 단계 완료 이벤트
  trackFormStepComplete(
    formName: string,
    formId: string,
    stepNumber: number,
    stepName: string,
    options?: Record<string, unknown>
  ) {
    this.logEvent(AnalyticsEvents.FORM_STEP_COMPLETE, {
      [AnalyticsParams.FORM_NAME]: formName,
      [AnalyticsParams.FORM_ID]: formId,
      [AnalyticsParams.FORM_STEP]: stepNumber,
      step_name: stepName,
      ...options,
    });
  }

  // 폼 제출 이벤트
  trackFormSubmit(
    formName: string,
    formId: string,
    isSuccess: boolean,
    options?: Record<string, unknown>
  ) {
    this.logEvent(AnalyticsEvents.FORM_SUBMIT, {
      [AnalyticsParams.FORM_NAME]: formName,
      [AnalyticsParams.FORM_ID]: formId,
      is_success: isSuccess,
      ...options,
    });
  }

  // 폼 오류 이벤트
  trackFormError(
    formName: string,
    formId: string,
    errorType: string,
    errorMessage: string,
    options?: Record<string, unknown>
  ) {
    this.logEvent(AnalyticsEvents.FORM_ERROR, {
      [AnalyticsParams.FORM_NAME]: formName,
      [AnalyticsParams.FORM_ID]: formId,
      [AnalyticsParams.ERROR_TYPE]: errorType,
      [AnalyticsParams.ERROR_MESSAGE]: errorMessage,
      ...options,
    });
  }

  // ===== 성능 및 오류 이벤트 =====

  // 성능 지표 이벤트
  trackPerformance(
    metricName: string,
    metricValue: number,
    options?: Record<string, unknown>
  ) {
    this.logEvent(AnalyticsEvents.PERFORMANCE_METRIC, {
      metric_name: metricName,
      metric_value: metricValue,
      ...options,
    });
  }

  // 오류 이벤트
  trackError(
    errorType: string,
    errorMessage: string,
    errorCode?: string,
    options?: Record<string, unknown>
  ) {
    this.logEvent(AnalyticsEvents.ERROR_OCCURRED, {
      [AnalyticsParams.ERROR_TYPE]: errorType,
      [AnalyticsParams.ERROR_MESSAGE]: errorMessage,
      error_code: errorCode,
      ...options,
    });
  }
} 