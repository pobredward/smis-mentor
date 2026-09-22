import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PreloadLink } from '../components/WebViewPreloader';
import { logger } from '@smis-mentor/shared';

const LAST_TAB_KEY = 'SMIS_LAST_CAMP_TAB';
const LAST_PRELOAD_LINKS_KEY = 'SMIS_LAST_PRELOAD_LINKS';

type TabName = 'education' | 'lesson' | 'tasks' | 'schedule' | 'guide' | 'roster' | 'patient' | 'location' | 'inventory';

interface CampTabContextType {
  activeTab: TabName;
  setActiveTab: (tab: TabName) => Promise<void>;
  preloadLinks: PreloadLink[];
  setPreloadLinks: (links: PreloadLink[]) => Promise<void>;
  isPreloading: boolean;
  setIsPreloading: (loading: boolean) => void;
  webViewPreloadComplete: boolean;
  setWebViewPreloadComplete: (complete: boolean) => void;
  webViewLoadProgress: { loaded: number; total: number };
  setWebViewLoadProgress: (progress: { loaded: number; total: number }) => void;
}

const CampTabContext = createContext<CampTabContextType>({
  activeTab: 'schedule',
  setActiveTab: async () => {},
  preloadLinks: [],
  setPreloadLinks: async () => {},
  isPreloading: false,
  setIsPreloading: () => {},
  webViewPreloadComplete: false,
  setWebViewPreloadComplete: () => {},
  webViewLoadProgress: { loaded: 0, total: 0 },
  setWebViewLoadProgress: () => {},
});

export const useCampTab = () => useContext(CampTabContext);

// 알림 클릭 시 외부(AuthContext 등)에서 업무 탭으로 이동하기 위한 싱글톤 콜백
let navigateToTasksTabCallback: (() => void) | null = null;

export const registerNavigateToTasksTab = (callback: () => void) => {
  navigateToTasksTabCallback = callback;
};

export const unregisterNavigateToTasksTab = () => {
  navigateToTasksTabCallback = null;
};

export const navigateToTasksTab = () => {
  navigateToTasksTabCallback?.();
};

// 알림 클릭 시 캠프 세부 탭(재고 등)으로 이동
let navigateToCampTabCallback: ((tab: TabName) => void) | null = null;
export const registerNavigateToCampTab = (callback: (tab: TabName) => void) => { navigateToCampTabCallback = callback; };
export const unregisterNavigateToCampTab = () => { navigateToCampTabCallback = null; };
export const navigateToCampTab = (tab: TabName) => { navigateToCampTabCallback?.(tab); };

export const CampTabProvider = ({ children }: { children: ReactNode }) => {
  const [activeTab, setActiveTabState] = useState<TabName>('schedule');
  const [preloadLinks, setPreloadLinksState] = useState<PreloadLink[]>([]);
  const [isPreloading, setIsPreloadingState] = useState(false);
  const [webViewPreloadComplete, setWebViewPreloadComplete] = useState(false);
  const [webViewLoadProgress, setWebViewLoadProgress] = useState({ loaded: 0, total: 0 });

  // 앱 시작 시 마지막 탭 및 프리로드 링크 복원
  useEffect(() => {
    loadLastTab();
    loadLastPreloadLinks();
  }, []);

  const loadLastTab = async () => {
    try {
      const lastTab = await AsyncStorage.getItem(LAST_TAB_KEY);
      if (lastTab) {
        // 이전 버전에서 저장된 class/room 탭은 roster로, 숨긴 위치 탭은 기본(시간표)으로
        const migratedTab =
          lastTab === 'class' || lastTab === 'room' ? 'roster' : lastTab === 'location' ? 'schedule' : lastTab;
        setActiveTabState(migratedTab as TabName);
        logger.info('✅ 마지막 캠프 탭 복원:', migratedTab);
      }
    } catch (error) {
      logger.error('❌ 마지막 캠프 탭 복원 실패:', error);
    }
  };

  const loadLastPreloadLinks = async () => {
    try {
      const cached = await AsyncStorage.getItem(LAST_PRELOAD_LINKS_KEY);
      if (cached) {
        const links = JSON.parse(cached) as PreloadLink[];
        logger.info(`📦 마지막 프리로드 링크 복원: ${links.length}개`);
        
        // 링크만 복원하고, 프리로드는 AuthContext에서 트리거
        if (links.length > 0) {
          setPreloadLinksState(links);
          logger.info('💾 프리로드 링크 복원 완료 (프리로드는 로그인 후 자동 시작)');
        }
      }
    } catch (error) {
      logger.error('❌ 마지막 프리로드 링크 복원 실패:', error);
    }
  };

  const setActiveTab = async (tab: TabName) => {
    setActiveTabState(tab);
    try {
      await AsyncStorage.setItem(LAST_TAB_KEY, tab);
      logger.info('💾 캠프 탭 저장:', tab);
    } catch (error) {
      logger.error('❌ 캠프 탭 저장 실패:', error);
    }
  };

  const setPreloadLinks = async (links: PreloadLink[]) => {
    logger.info(`🎯 CampTabContext.setPreloadLinks 호출: ${links.length}개 링크`);
    setPreloadLinksState(links);
    
    // AsyncStorage에 저장 (앱 재시작 시 복원용)
    try {
      await AsyncStorage.setItem(LAST_PRELOAD_LINKS_KEY, JSON.stringify(links));
      logger.info('💾 프리로드 링크 저장 완료');
    } catch (error) {
      logger.error('❌ 프리로드 링크 저장 실패:', error);
    }
  };

  const setIsPreloading = (loading: boolean) => {
    logger.info(`🎯 CampTabContext.setIsPreloading 호출: ${loading}`);
    setIsPreloadingState(loading);
  };

  return (
    <CampTabContext.Provider value={{ 
      activeTab, 
      setActiveTab,
      preloadLinks,
      setPreloadLinks,
      isPreloading,
      setIsPreloading,
      webViewPreloadComplete,
      setWebViewPreloadComplete,
      webViewLoadProgress,
      setWebViewLoadProgress,
    }}>
      {children}
    </CampTabContext.Provider>
  );
};

// ── 재고 탭 딥링크 (푸시 알림 클릭 → 재고 요청 열기) ──
export interface InventoryDeepLink { requestId?: string; view?: 'buy' | 'settle'; itemId?: string }
let pendingInventoryDeepLink: InventoryDeepLink | null = null;
let inventoryDeepLinkListener: ((t: InventoryDeepLink) => void) | null = null;

/** 알림 클릭 시 호출 — 재고 화면이 떠 있으면 바로 전달, 아니면 보관했다가 다음에 전달 */
export const setInventoryDeepLink = (target: InventoryDeepLink) => {
  if (inventoryDeepLinkListener) inventoryDeepLinkListener(target);
  else pendingInventoryDeepLink = target;
};
/** 재고 화면이 뜰 때 보관된 값 가져오기 (한 번만) */
export const takeInventoryDeepLink = (): InventoryDeepLink | null => {
  const t = pendingInventoryDeepLink;
  pendingInventoryDeepLink = null;
  return t;
};
export const subscribeInventoryDeepLink = (cb: (t: InventoryDeepLink) => void) => {
  inventoryDeepLinkListener = cb;
  return () => { if (inventoryDeepLinkListener === cb) inventoryDeepLinkListener = null; };
};
