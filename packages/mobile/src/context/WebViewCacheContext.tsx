import React, { createContext, useContext, useState, useRef, ReactNode, useEffect } from 'react';
import { logger } from '@smis-mentor/shared';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { generationResourcesService, ResourceLink } from '../services';

const ZOOM_CACHE_KEY = 'SMIS_WEBVIEW_ZOOM_CACHE';

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

  // AsyncStorage에서 줌 레벨 복원
  useEffect(() => {
    loadZoomLevels();
  }, []);

  const loadZoomLevels = async () => {
    try {
      const cached = await AsyncStorage.getItem(ZOOM_CACHE_KEY);
      if (cached) {
        const parsedZoom = JSON.parse(cached);
        setZoomLevelsState(parsedZoom);
        logger.info('✅ WebView 줌 레벨 복원 완료', { count: Object.keys(parsedZoom).length });
      }
    } catch (error) {
      logger.error('❌ WebView 줌 레벨 복원 실패:', error);
    }
  };

  const saveZoomLevels = async (newZoomLevels: Record<string, number>) => {
    try {
      await AsyncStorage.setItem(ZOOM_CACHE_KEY, JSON.stringify(newZoomLevels));
      logger.info('💾 WebView 줌 레벨 저장 완료');
    } catch (error) {
      logger.error('❌ WebView 줌 레벨 저장 실패:', error);
    }
  };

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
        // Android는 0.8, iOS는 0.6 기본 줌
        const defaultZoom = Platform.OS === 'android' ? 0.8 : 0.6;
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
    setZoomLevelsState(prev => {
      const newZoomLevels = { ...prev, [id]: zoom };
      saveZoomLevels(newZoomLevels);
      return newZoomLevels;
    });
  };

  const applyZoom = (id: string, zoom: number) => {
    // #region agent log
    fetch('http://127.0.0.1:7295/ingest/3b359ebe-f39f-4e78-ab3d-8b524e10af90',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'89b1c8'},body:JSON.stringify({sessionId:'89b1c8',location:'WebViewCacheContext.tsx:applyZoom',message:'applyZoom 호출됨',data:{id,zoom,platform:Platform.OS},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // iOS: zoom CSS 속성이 WebView 프레임 자체 크기를 바꾸므로 사용 금지
    // meta viewport initial-scale을 동적으로 변경하는 방식 사용
    // Android: zoom CSS 속성이 정상 동작하므로 그대로 사용
    const zoomScript = Platform.OS === 'ios'
      ? `
        (function() {
          const z = ${zoom};
          
          // viewport meta의 initial-scale만 변경 → 프레임 크기 고정된 채 내용만 줌
          const existingMeta = document.querySelector('meta[name="viewport"]');
          if (existingMeta) {
            existingMeta.setAttribute('content',
              'width=device-width, initial-scale=' + z + ', minimum-scale=' + z + ', maximum-scale=5.0, user-scalable=yes'
            );
          } else {
            const meta = document.createElement('meta');
            meta.setAttribute('name', 'viewport');
            meta.setAttribute('content',
              'width=device-width, initial-scale=' + z + ', minimum-scale=' + z + ', maximum-scale=5.0, user-scalable=yes'
            );
            document.getElementsByTagName('head')[0].appendChild(meta);
          }
          
          // zoom CSS 완전 제거 (이전 값 초기화)
          document.documentElement.style.zoom = '';
          document.body.style.zoom = '';
          
          // wrapper 방식 제거 (이전 시도 정리)
          const oldWrapper = document.getElementById('__smis_zoom_wrapper__');
          if (oldWrapper) {
            while (oldWrapper.firstChild) {
              oldWrapper.parentNode.insertBefore(oldWrapper.firstChild, oldWrapper);
            }
            oldWrapper.parentNode.removeChild(oldWrapper);
          }
        })();
        true;
      `
      : `
        (function() {
          const z = ${zoom};
          document.body.style.zoom = z;
          document.documentElement.style.zoom = z;
        })();
        true;
      `;
    webViewRefs.current[id]?.injectJavaScript(zoomScript);
  };

  const renderWebView = (id: string, visible: boolean) => {
    const allSheets = [...schedules, ...guides];
    const sheet = allSheets.find(s => s.id === id);
    if (!sheet) return null;

    // Android는 0.8, iOS는 0.6 기본 줌
    const defaultZoom = Platform.OS === 'android' ? 0.8 : 0.6;
    const initialZoom = zoomLevels[id] || defaultZoom;

    // #region agent log
    fetch('http://127.0.0.1:7295/ingest/3b359ebe-f39f-4e78-ab3d-8b524e10af90',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'89b1c8'},body:JSON.stringify({sessionId:'89b1c8',location:'WebViewCacheContext.tsx:renderWebView',message:'renderWebView 호출됨',data:{id,visible,initialZoom,platform:Platform.OS},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return (
      <WebView
        key={id}
        ref={(ref) => { webViewRefs.current[id] = ref; }}
        source={{ uri: sheet.url }}
        style={[styles.webView, !visible && styles.hiddenWebView]}
        onLoadEnd={() => {
          setLoadingState(id, false);
          // #region agent log
          fetch('http://127.0.0.1:7295/ingest/3b359ebe-f39f-4e78-ab3d-8b524e10af90',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'89b1c8'},body:JSON.stringify({sessionId:'89b1c8',location:'WebViewCacheContext.tsx:onLoadEnd',message:'onLoadEnd - applyZoom 예정',data:{id,initialZoom,platform:Platform.OS},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          setTimeout(() => {
            applyZoom(id, initialZoom);
          }, 300);
        }}
        onLoadStart={() => {
          setLoadingState(id, true);
        }}
        scalesPageToFit={Platform.OS !== 'ios'}
        showsVerticalScrollIndicator={true}
        showsHorizontalScrollIndicator={true}
        scrollEnabled={true}
        bounces={true}
        cacheEnabled={true}
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        incognito={false}
        androidLayerType="hardware"
        injectedJavaScript={Platform.OS === 'ios'
          ? `
            (function() {
              const z = ${initialZoom};
              
              // iOS: viewport meta의 initial-scale로 줌 조절
              // zoom CSS 속성은 WebView 프레임 자체를 변경하므로 사용 금지
              const existingMeta = document.querySelector('meta[name="viewport"]');
              if (existingMeta) {
                existingMeta.setAttribute('content',
                  'width=device-width, initial-scale=' + z + ', minimum-scale=' + z + ', maximum-scale=5.0, user-scalable=yes'
                );
              } else {
                const meta = document.createElement('meta');
                meta.setAttribute('name', 'viewport');
                meta.setAttribute('content',
                  'width=device-width, initial-scale=' + z + ', minimum-scale=' + z + ', maximum-scale=5.0, user-scalable=yes'
                );
                document.getElementsByTagName('head')[0].appendChild(meta);
              }
              
              const style = document.createElement('style');
              style.textContent = \`
                * { max-width: none !important; }
                body, html { overflow: auto !important; }
              \`;
              document.head.appendChild(style);
            })();
            true;
          `
          : `
            (function() {
              const z = ${initialZoom};
              
              const existingMeta = document.querySelector('meta[name="viewport"]');
              if (existingMeta) existingMeta.remove();
              const meta = document.createElement('meta');
              meta.setAttribute('name', 'viewport');
              meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes');
              document.getElementsByTagName('head')[0].appendChild(meta);
              
              const style = document.createElement('style');
              style.textContent = \`
                * { max-width: none !important; overflow-x: auto !important; }
                body, html { overflow: auto !important; position: relative !important; }
              \`;
              document.head.appendChild(style);
              
              document.body.style.zoom = z;
              document.documentElement.style.zoom = z;
            })();
            true;
          `
        }
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
