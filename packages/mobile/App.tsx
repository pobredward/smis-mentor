import Sentry from './sentry.config';
// 앱 시작 즉시 백그라운드 위치 태스크를 등록해야 재시작 후 자동 복구가 동작함
import './src/services/locationSharingService';
import React, { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { RootNavigator } from './src/navigation';
import { WebViewCacheProvider } from './src/context/WebViewCacheContext';
import { AuthProvider, registerPrefetchTrigger, unregisterPrefetchTrigger } from './src/context/AuthContext';
import { QueryClientProvider } from './src/context/QueryClientProvider';
import { CampTabProvider, useCampTab } from './src/context/CampTabContext';
import { WebViewPreloader } from './src/components/WebViewPreloader';
import { SplashPrefetchScreen } from './src/components/SplashPrefetchScreen';
import { ForceUpdateModal } from './src/components/ForceUpdateModal';
import { useAuth } from './src/context/AuthContext';
import { useCampDataPrefetch } from './src/hooks/useCampDataPrefetch';
import { useRecruitmentDataPrefetch } from './src/hooks/useRecruitmentDataPrefetch';
import { Platform } from 'react-native';
import { logger, checkForceUpdate } from '@smis-mentor/shared';
import { db } from './src/config/firebase';

// 네이티브 스플래시 화면 유지 (앱 최상단에서 호출)
SplashScreen.preventAutoHideAsync().catch(() => {
  // 이미 숨겨진 경우 무시
});

function AppContent() {
  const { 
    preloadLinks, 
    isPreloading,
    setWebViewPreloadComplete,
    setWebViewLoadProgress,
    webViewPreloadComplete,
  } = useCampTab();
  
  const { userData, authReady, loading } = useAuth();
  const { prefetchCampData, invalidateCampData } = useCampDataPrefetch();
  const { prefetchRecruitmentData } = useRecruitmentDataPrefetch();
  const [showSplash, setShowSplash] = useState(true);
  const [hasTriggeredPrefetch, setHasTriggeredPrefetch] = useState(false);

  // 프리페칭 트리거 등록
  useEffect(() => {
    const handlePrefetch = async () => {
      if (!userData?.activeJobExperienceId) {
        logger.warn('⚠️ AppContent: activeJobExperienceId 없음, 프리페칭 스킵');
        return;
      }

      if (hasTriggeredPrefetch) {
        logger.info('⏭️  AppContent: 이미 프리페칭 실행됨, 스킵');
        return;
      }

      setHasTriggeredPrefetch(true);

      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.info('🚀 앱 시작: 데이터 프리페칭 시작');
      logger.info(`   JobCodeId: ${userData.activeJobExperienceId}`);
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      try {
        // 캠프 데이터와 채용 데이터를 병렬로 프리페칭
        await Promise.all([
          prefetchCampData(userData.activeJobExperienceId),
          prefetchRecruitmentData(),
        ]);
        
        logger.info('✅ 앱 시작: 모든 데이터 프리페칭 완료');
      } catch (error) {
        logger.error('❌ 앱 시작: 데이터 프리페칭 실패', error);
        // 에러가 발생해도 스플래시는 닫기
        setTimeout(() => {
          setShowSplash(false);
        }, 1000);
      }
    };

    // 프리페칭 콜백 등록
    registerPrefetchTrigger(handlePrefetch);

    return () => {
      unregisterPrefetchTrigger();
    };
  }, [userData?.activeJobExperienceId, prefetchCampData, prefetchRecruitmentData, hasTriggeredPrefetch]);

  // 인증 완료 및 사용자 데이터가 없으면 스플래시 숨기기 (비로그인 유저)
  useEffect(() => {
    const hideNativeSplashForGuest = async () => {
      if (authReady && !loading && !userData) {
        logger.info('⏭️  AppContent: 비로그인 상태, 네이티브 스플래시 숨기기');
        
        try {
          // 비로그인 유저는 네이티브 스플래시를 즉시 숨김
          await SplashScreen.hideAsync();
          logger.info('✅ 비로그인: 네이티브 스플래시 숨김 완료');
        } catch (error) {
          logger.error('❌ 비로그인: 네이티브 스플래시 숨기기 실패:', error);
        }
        
        setShowSplash(false);
      }
    };

    hideNativeSplashForGuest();
  }, [authReady, loading, userData]);

  // 프리로드할 링크가 없을 때 즉시 완료 처리
  useEffect(() => {
    logger.info(`🔍 AppContent 상태 체크:`, {
      isPreloading,
      preloadLinksCount: preloadLinks.length,
      webViewPreloadComplete,
    });

    if (!isPreloading && preloadLinks.length === 0 && !webViewPreloadComplete) {
      logger.info('⏭️  AppContent: 프리로드할 링크 없음, 즉시 완료 처리');
      setWebViewPreloadComplete(true);
    }
  }, [isPreloading, preloadLinks.length, webViewPreloadComplete, setWebViewPreloadComplete]);

  const handleWebViewPreloadComplete = useCallback(() => {
    console.log('✅ App: 모든 WebView 프리로드 완료');
    setWebViewPreloadComplete(true);
  }, [setWebViewPreloadComplete]);

  const handleWebViewProgressUpdate = useCallback((loaded: number, total: number) => {
    setWebViewLoadProgress({ loaded, total });
  }, [setWebViewLoadProgress]);

  const handleSplashComplete = useCallback(() => {
    logger.info('👋 App: 스플래시 화면 완료');
    setShowSplash(false);
  }, []);

  return (
    <>
      <RootNavigator />
      <StatusBar style="auto" />
      
      {/* 전역 WebView 프리로더 — 완료 후 언마운트해 Native 스레드 경합 해소 */}
      {!webViewPreloadComplete && (
        <WebViewPreloader
          links={preloadLinks}
          enabled={isPreloading}
          onLoadComplete={handleWebViewPreloadComplete}
          onProgressUpdate={handleWebViewProgressUpdate}
        />
      )}

      {/* 스플래시 화면 (프리로딩 진행 중) */}
      {showSplash && userData && (
        <>
          {logger.info('🖼️ SplashPrefetchScreen 렌더링 중', { showSplash, hasUserData: !!userData })}
          <SplashPrefetchScreen 
            onComplete={handleSplashComplete}
            minDisplayTime={1500}
          />
        </>
      )}
    </>
  );
}

function App() {
  const [forceUpdateVisible, setForceUpdateVisible] = useState(false);
  const [storeUrls, setStoreUrls] = useState({
    iosStoreUrl: '',
    androidStoreUrl: '',
  });

  useEffect(() => {
    const runVersionCheck = async () => {
      try {
        const currentVersion = Constants.expoConfig?.version ?? '0.0.0';
        const platform = Platform.OS === 'android' ? 'android' : 'ios';
        const result = await checkForceUpdate(db, currentVersion, platform);

        if (result.needsUpdate) {
          logger.info(`🔄 강제 업데이트 필요: 현재 ${currentVersion} → 스토어 이동`);
          setStoreUrls({
            iosStoreUrl: result.iosStoreUrl,
            androidStoreUrl: result.androidStoreUrl,
          });
          setForceUpdateVisible(true);
        }
      } catch (error) {
        logger.error('버전 체크 오류:', error);
      }
    };

    runVersionCheck();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider>
        <AuthProvider>
          <WebViewCacheProvider>
            <CampTabProvider>
              <AppContent />
            </CampTabProvider>
          </WebViewCacheProvider>
        </AuthProvider>
      </QueryClientProvider>
      <ForceUpdateModal
        visible={forceUpdateVisible}
        iosStoreUrl={storeUrls.iosStoreUrl}
        androidStoreUrl={storeUrls.androidStoreUrl}
      />
    </GestureHandlerRootView>
  );
}

// Sentry로 래핑된 App 컴포넌트 export
export default Sentry.wrap(App);

