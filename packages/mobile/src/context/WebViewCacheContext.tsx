import React, { createContext, useContext, useState, useRef, ReactNode, useEffect } from 'react';
import { logger } from '@smis-mentor/shared';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAuth } from './AuthContext';
import { generationResourcesService, ResourceLink } from '../services';

interface WebViewCache {
  schedules: ResourceLink[];
  guides: ResourceLink[];
  loadingStates: Record<string, boolean>;
  zoomLevels: Record<string, number>;
  webViewRefs: React.MutableRefObject<Record<string, WebView | null>>;
  setLoadingState: (id: string, loading: boolean) => void;
  setZoomLevel: (id: string, zoom: number) => void;
  applyZoom: (id: string, zoom: number) => void;
  renderWebView: (id: string, visible: boolean) => React.ReactElement | null;
  refreshResources: () => Promise<void>;
  loading: boolean;
}

const WebViewCacheContext = createContext<WebViewCache | null>(null);

export function WebViewCacheProvider({ children }: { children: ReactNode }) {
  const { userData } = useAuth();
  const [schedules, setSchedules] = useState<ResourceLink[]>([]);
  const [guides, setGuides] = useState<ResourceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [zoomLevels, setZoomLevelsState] = useState<Record<string, number>>({});
  const webViewRefs = useRef<Record<string, WebView | null>>({});

  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  useEffect(() => {
    logger.info('🔄 WebViewCache: activeJobCodeId 변경됨:', activeJobCodeId);
    if (activeJobCodeId) {
      loadResources();
    }
  }, [userData?.activeJobExperienceId, userData?.jobExperiences?.[0]?.id]);

  const loadResources = async () => {
    if (!activeJobCodeId) {
      logger.info('⚠️ WebViewCache: activeJobCodeId 없음, 리소스 로드 중단');
      setLoading(false);
      return;
    }

    try {
      logger.info('📥 WebViewCache: 리소스 로드 시작 -', activeJobCodeId);
      setLoading(true);
      
      // 기존 데이터 초기화
      setSchedules([]);
      setGuides([]);
      
      const resources = await generationResourcesService.getResourcesByJobCodeId(activeJobCodeId);
      
      if (resources) {
        logger.info('✅ WebViewCache: 리소스 로드 성공');
        logger.info('  - scheduleLinks:', resources.scheduleLinks?.length || 0);
        logger.info('  - guideLinks:', resources.guideLinks?.length || 0);
        
        setSchedules(resources.scheduleLinks || []);
        setGuides(resources.guideLinks || []);

        const allSheets = [...(resources.scheduleLinks || []), ...(resources.guideLinks || [])];
        const initialLoadingStates = allSheets.reduce((acc, sheet) => ({ ...acc, [sheet.id]: true }), {});
        // Android는 1.0, iOS는 0.6 기본 줌
        const defaultZoom = Platform.OS === 'android' ? 1.0 : 0.6;
        const initialZoomLevels = allSheets.reduce((acc, sheet) => ({ ...acc, [sheet.id]: defaultZoom }), {});
        
        setLoadingStates(initialLoadingStates);
        setZoomLevelsState(initialZoomLevels);
      } else {
        logger.info('⚠️ WebViewCache: 해당 기수의 리소스 없음');
        setSchedules([]);
        setGuides([]);
      }
    } catch (error) {
      logger.error('❌ WebViewCache: 리소스 로드 실패:', error);
      setSchedules([]);
      setGuides([]);
    } finally {
      setLoading(false);
    }
  };

  const refreshResources = async () => {
    await loadResources();
  };

  const setLoadingState = (id: string, loading: boolean) => {
    setLoadingStates(prev => ({ ...prev, [id]: loading }));
  };

  const setZoomLevel = (id: string, zoom: number) => {
    setZoomLevelsState(prev => ({ ...prev, [id]: zoom }));
  };

  const applyZoom = (id: string, zoom: number) => {
    const zoomScript = `
      (function() {
        document.body.style.zoom = "${zoom}";
        document.documentElement.style.zoom = "${zoom}";
        
        const iframes = document.getElementsByTagName('iframe');
        for (let i = 0; i < iframes.length; i++) {
          try {
            iframes[i].style.transform = "scale(${zoom})";
            iframes[i].style.transformOrigin = "0 0";
            iframes[i].style.width = (100 / ${zoom}) + "%";
            iframes[i].style.height = (100 / ${zoom}) + "%";
          } catch(e) {
            logger.info('iframe access error:', e);
          }
        }
        
        const allElements = document.querySelectorAll('div, table, tbody, tr, td');
        allElements.forEach(el => {
          el.style.zoom = "${zoom}";
        });
      })();
      true;
    `;
    webViewRefs.current[id]?.injectJavaScript(zoomScript);
  };

  const renderWebView = (id: string, visible: boolean) => {
    const allSheets = [...schedules, ...guides];
    const sheet = allSheets.find(s => s.id === id);
    if (!sheet) return null;

    // Notion 페이지 확인
    const isNotionPage = sheet.url.includes('notion.site') || sheet.url.includes('notion.so');
    
    // Android는 1.0, iOS는 0.6 기본 줌 (Notion 페이지는 1.0)
    const defaultZoom = Platform.OS === 'android' ? 1.0 : 0.6;
    const initialZoom = isNotionPage ? 1.0 : (zoomLevels[id] || defaultZoom);

    return (
      <WebView
        key={id}
        ref={(ref) => { webViewRefs.current[id] = ref; }}
        source={{ uri: sheet.url }}
        style={[styles.webView, !visible && styles.hiddenWebView]}
        onLoadEnd={() => {
          setLoadingState(id, false);
          // Notion 페이지가 아닌 경우에만 zoom 적용
          if (!isNotionPage) {
            setTimeout(() => {
              applyZoom(id, initialZoom);
            }, 300);
          }
        }}
        onLoadStart={() => {
          setLoadingState(id, true);
        }}
        scalesPageToFit={!isNotionPage}
        showsVerticalScrollIndicator={true}
        showsHorizontalScrollIndicator={true}
        scrollEnabled={true}
        bounces={true}
        cacheEnabled={true}
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        incognito={false}
        androidLayerType="hardware"
        injectedJavaScript={isNotionPage ? undefined : `
          (function() {
            // 초기 zoom 적용 (구글 시트용)
            const initialZoom = ${initialZoom};
            
            const meta = document.createElement('meta');
            meta.setAttribute('content', 'width=device-width, initial-scale=' + initialZoom + ', maximum-scale=5.0, user-scalable=yes');
            meta.setAttribute('name', 'viewport');
            document.getElementsByTagName('head')[0].appendChild(meta);
            
            const style = document.createElement('style');
            style.textContent = \`
              * { 
                max-width: none !important;
                overflow-x: auto !important;
              }
              body, html {
                overflow: auto !important;
                position: relative !important;
                zoom: \${initialZoom} !important;
              }
            \`;
            document.head.appendChild(style);
            
            // 초기 zoom 즉시 적용
            document.body.style.zoom = initialZoom;
            document.documentElement.style.zoom = initialZoom;
          })();
          true;
        `}
      />
    );
  };

  return (
    <WebViewCacheContext.Provider
      value={{
        schedules,
        guides,
        loadingStates,
        zoomLevels,
        webViewRefs,
        setLoadingState,
        setZoomLevel,
        applyZoom,
        renderWebView,
        refreshResources,
        loading,
      }}
    >
      {children}
    </WebViewCacheContext.Provider>
  );
}

export function useWebViewCache() {
  const context = useContext(WebViewCacheContext);
  if (!context) {
    throw new Error('useWebViewCache must be used within WebViewCacheProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  webView: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  hiddenWebView: {
    opacity: 0,
    position: 'absolute',
    width: 0,
    height: 0,
    zIndex: -9999,
  },
});
