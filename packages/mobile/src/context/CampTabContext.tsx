import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PreloadLink } from '../components/WebViewPreloader';
import { logger } from '@smis-mentor/shared';

const LAST_TAB_KEY = 'SMIS_LAST_CAMP_TAB';
const LAST_PRELOAD_LINKS_KEY = 'SMIS_LAST_PRELOAD_LINKS';

type TabName = 'education' | 'lesson' | 'tasks' | 'schedule' | 'guide' | 'class' | 'room';

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

export const CampTabProvider = ({ children }: { children: ReactNode }) => {
  const [activeTab, setActiveTabState] = useState<TabName>('schedule');
  const [preloadLinks, setPreloadLinksState] = useState<PreloadLink[]>([]);
  const [isPreloading, setIsPreloadingState] = useState(false);
  const [webViewPreloadComplete, setWebViewPreloadComplete] = useState(false);
  const [webViewLoadProgress, setWebViewLoadProgress] = useState({ loaded: 0, total: 0 });

  // 앱 시작 시 마지막 탭 복원
  useEffect(() => {
    loadLastTab();
    loadLastPreloadLinks();
  }, []);

  const loadLastTab = async () => {
    try {
      const lastTab = await AsyncStorage.getItem(LAST_TAB_KEY);
      if (lastTab) {
        setActiveTabState(lastTab as TabName);
        logger.info('✅ 마지막 캠프 탭 복원:', lastTab);
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
        logger.info(`✅ 마지막 프리로드 링크 복원: ${links.length}개`);
        
        // 링크가 있으면 자동으로 프리로드 시작
        if (links.length > 0) {
          setPreloadLinksState(links);
          setIsPreloadingState(true);
          logger.info('🔄 앱 재시작: WebView 프리로드 자동 시작');
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
