import Sentry from './sentry.config';
import React, { useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './src/navigation';
import { WebViewCacheProvider } from './src/context/WebViewCacheContext';
import { AuthProvider } from './src/context/AuthContext';
import { QueryClientProvider } from './src/context/QueryClientProvider';
import { CampTabProvider, useCampTab } from './src/context/CampTabContext';
import { WebViewPreloader } from './src/components/WebViewPreloader';

function AppContent() {
  const { 
    preloadLinks, 
    isPreloading,
    setWebViewPreloadComplete,
    setWebViewLoadProgress,
  } = useCampTab();

  const handleWebViewPreloadComplete = useCallback(() => {
    console.log('✅ App: 모든 WebView 프리로드 완료');
    setWebViewPreloadComplete(true);
  }, [setWebViewPreloadComplete]);

  const handleWebViewProgressUpdate = useCallback((loaded: number, total: number) => {
    setWebViewLoadProgress({ loaded, total });
  }, [setWebViewLoadProgress]);

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

