import Sentry from './sentry.config';
import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './src/navigation';
import { WebViewCacheProvider } from './src/context/WebViewCacheContext';
import { AuthProvider, registerPrefetchTrigger, unregisterPrefetchTrigger } from './src/context/AuthContext';
import { QueryClientProvider } from './src/context/QueryClientProvider';
import { CampTabProvider, useCampTab } from './src/context/CampTabContext';
import { WebViewPreloader } from './src/components/WebViewPreloader';
import { SplashPrefetchScreen } from './src/components/SplashPrefetchScreen';
import { useAuth } from './src/context/AuthContext';
import { useCampDataPrefetch } from './src/hooks/useCampDataPrefetch';
import { logger } from '@smis-mentor/shared';

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
        await prefetchCampData(userData.activeJobExperienceId);
        logger.info('✅ 앱 시작: 데이터 프리페칭 완료');
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
  }, [userData?.activeJobExperienceId, prefetchCampData, hasTriggeredPrefetch]);

  // 인증 완료 및 사용자 데이터가 없으면 스플래시 숨기기
  useEffect(() => {
    if (authReady && !loading && !userData) {
      logger.info('⏭️  AppContent: 비로그인 상태, 스플래시 숨기기');
      setShowSplash(false);
    }
  }, [authReady, loading, userData]);

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
      
      {/* 전역 WebView 프리로더 */}
      <WebViewPreloader
        links={preloadLinks}
        enabled={isPreloading}
        onLoadComplete={handleWebViewPreloadComplete}
        onProgressUpdate={handleWebViewProgressUpdate}
      />

      {/* 스플래시 화면 (프리로딩 진행 중) */}
      {showSplash && userData && (
        <SplashPrefetchScreen 
          onComplete={handleSplashComplete}
          minDisplayTime={1000}
        />
      )}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider>
      <AuthProvider>
        <WebViewCacheProvider>
          <CampTabProvider>
            <AppContent />
          </CampTabProvider>
        </WebViewCacheProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

// Sentry로 래핑된 App 컴포넌트 export
export default Sentry.wrap(App);

