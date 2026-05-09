import { safeGetItem } from './cacheUtils';

// localStorage 키 정의
const LAST_CAMP_TAB_KEY = 'last_camp_tab';

// 유효한 캠프 탭 목록
const VALID_CAMP_TABS = ['education', 'lesson', 'tasks', 'schedule', 'guide', 'class', 'room'] as const;

type CampTabName = typeof VALID_CAMP_TABS[number];

/**
 * 사용자 역할에 따라 접근 가능한 캠프 탭들을 반환
 * @param userRole 사용자 역할
 * @returns 접근 가능한 탭 목록
 */
export function getValidCampTabs(userRole?: string): CampTabName[] {
  // 원어민은 수업 탭 제외
  if (userRole === 'foreign' || userRole === 'foreign_temp') {
    return VALID_CAMP_TABS.filter(tab => tab !== 'lesson');
  }
  return [...VALID_CAMP_TABS];
}

/**
 * 저장된 마지막 캠프 탭을 가져오고, 사용자 역할에 따라 유효성을 검증
 * @param userRole 사용자 역할 (선택사항)
 * @returns 유효한 캠프 탭 또는 기본 탭 ('tasks')
 */
export function getLastCampTab(userRole?: string): CampTabName {
  // 서버사이드에서는 기본 탭 반환
  if (typeof window === 'undefined') {
    return 'tasks';
  }

  try {
    const savedTab = safeGetItem(LAST_CAMP_TAB_KEY);
    
    if (savedTab) {
      const validTabs = getValidCampTabs(userRole);
      
      // 저장된 탭이 현재 사용자에게 유효한지 확인
      if (validTabs.includes(savedTab as CampTabName)) {
        return savedTab as CampTabName;
      }
    }
  } catch (error) {
    console.warn('마지막 캠프 탭 조회 실패:', error);
  }

  // 기본값은 '업무' 탭
  return 'tasks';
}

/**
 * 캠프 탭의 전체 URL 경로를 생성
 * @param userRole 사용자 역할 (선택사항)
 * @param date 날짜 파라미터 (선택사항)
 * @returns 캠프 탭 URL
 */
export function getCampTabUrl(userRole?: string, date?: string): string {
  const tab = getLastCampTab(userRole);
  const basePath = `/camp/${tab}`;
  
  // 업무 탭이고 날짜가 있으면 쿼리 파라미터 추가
  if (tab === 'tasks' && date) {
    return `${basePath}?date=${date}`;
  }
  
  return basePath;
}

/**
 * 탭 이름이 유효한 캠프 탭인지 확인
 * @param tabName 확인할 탭 이름
 * @returns 유효 여부
 */
export function isValidCampTab(tabName: string): tabName is CampTabName {
  return VALID_CAMP_TABS.includes(tabName as CampTabName);
}