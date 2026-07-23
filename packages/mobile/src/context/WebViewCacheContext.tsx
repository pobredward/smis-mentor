import React, { createContext, useContext, useState, useRef, ReactNode, useEffect, useCallback } from 'react';
import { logger } from '@smis-mentor/shared';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from './AuthContext';
import { generationResourcesService, subscribeToResources, ResourceLink } from '../services';

const WEBVIEW_LOAD_TIMEOUT_MS = 30_000;

const ZOOM_CACHE_KEY = 'SMIS_WEBVIEW_ZOOM_CACHE';

interface WebViewCache {
  schedules: ResourceLink[];
  guides: ResourceLink[];
  loadingStates: Record<string, boolean>;
  errorStates: Record<string, string | null>;
  zoomLevels: Record<string, number>;
  webViewRefs: React.MutableRefObject<Record<string, WebView | null>>;
  setLoadingState: (id: string, loading: boolean) => void;
  setZoomLevel: (id: string, zoom: number) => void;
  applyZoom: (id: string, zoom: number) => void;
  retryWebView: (id: string) => void;
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
  const [errorStates, setErrorStates] = useState<Record<string, string | null>>({});
  const [retryCounts, setRetryCounts] = useState<Record<string, number>>({});
  const [zoomLevels, setZoomLevelsState] = useState<Record<string, number>>({});
  const webViewRefs = useRef<Record<string, WebView | null>>({});
  const loadingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const retryTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // stale closure 방지용 ref
  const loadingStatesRef = useRef(loadingStates);
  const errorStatesRef = useRef(errorStates);
  const prevIsConnected = useRef<boolean | null>(null);

  useEffect(() => { loadingStatesRef.current = loadingStates; }, [loadingStates]);
  useEffect(() => { errorStatesRef.current = errorStates; }, [errorStates]);

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

    if (!activeJobCodeId) {
      logger.info('⚠️ WebViewCache: activeJobCodeId 없음, 구독 중단');
      setLoading(false);
      return;
    }

    setLoading(true);
    setSchedules([]);
    setGuides([]);

    const unsubscribe = subscribeToResources(
      activeJobCodeId,
      (resources) => {
        if (resources) {
          logger.info('✅ WebViewCache: 실시간 데이터 수신');
          logger.info('  - scheduleLinks:', resources.scheduleLinks?.length || 0);
          logger.info('  - guideLinks:', resources.guideLinks?.length || 0);

          const newSchedules = resources.scheduleLinks || [];
          const newGuides = resources.guideLinks || [];

          setSchedules(newSchedules);
          setGuides(newGuides);

          // 새로 추가된 시트에만 초기 loadingState/zoomLevel 설정 (기존 값 유지)
          setLoadingStates(prev => {
            const defaultZoom = Platform.OS === 'android' ? 0.8 : 0.6;
            const allSheets = [...newSchedules, ...newGuides];
            const next = { ...prev };
            allSheets.forEach(sheet => {
              if (next[sheet.id] === undefined) {
                next[sheet.id] = true;
              }
            });
            return next;
          });
          setZoomLevelsState(prev => {
            const defaultZoom = Platform.OS === 'android' ? 0.8 : 0.6;
            const allSheets = [...newSchedules, ...newGuides];
            const next = { ...prev };
            allSheets.forEach(sheet => {
              if (next[sheet.id] === undefined) {
                next[sheet.id] = defaultZoom;
              }
            });
            return next;
          });
        } else {
          logger.info('⚠️ WebViewCache: 해당 기수의 리소스 없음');
          setSchedules([]);
          setGuides([]);
        }
        setLoading(false);
      },
      (error) => {
        logger.error('❌ WebViewCache: 실시간 구독 실패:', error);
        setSchedules([]);
        setGuides([]);
        setLoading(false);
      }
    );

    return () => {
      logger.info('🔌 WebViewCache: 실시간 구독 해제');
      unsubscribe();
    };
  }, [userData?.activeJobExperienceId, userData?.jobExperiences?.[0]?.id]);

  // 실시간 구독 중이므로 refreshResources는 no-op (인터페이스 호환 유지)
  const refreshResources = async () => {
    logger.info('ℹ️ WebViewCache: 실시간 구독 중 - refreshResources no-op');
  };

  const setLoadingState = (id: string, loading: boolean) => {
    setLoadingStates(prev => ({ ...prev, [id]: loading }));
  };

  const setErrorState = (id: string, error: string | null) => {
    setErrorStates(prev => ({ ...prev, [id]: error }));
  };

  const retryWebView = useCallback((id: string) => {
    clearTimeout(loadingTimers.current[id]);
    setRetryCounts(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    setErrorStates(prev => ({ ...prev, [id]: null }));
    setLoadingStates(prev => ({ ...prev, [id]: true }));
    logger.info('🔄 WebView 재시도:', { id });
  }, []);

  // 네트워크 재연결 시 에러 상태인 시트 자동 재시도
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isNowConnected = state.isConnected ?? false;
      if (!prevIsConnected.current && isNowConnected) {
        const failedIds = Object.keys(errorStatesRef.current).filter(
          id => errorStatesRef.current[id] !== null
        );
        if (failedIds.length > 0) {
          logger.info('📶 네트워크 재연결 - 실패한 WebView 자동 재시도:', { count: failedIds.length });
          failedIds.forEach(id => retryWebView(id));
        }
      }
      prevIsConnected.current = isNowConnected;
    });
    return () => unsubscribe();
  }, [retryWebView]);

  const setZoomLevel = (id: string, zoom: number) => {
    setZoomLevelsState(prev => {
      const newZoomLevels = { ...prev, [id]: zoom };
      saveZoomLevels(newZoomLevels);
      return newZoomLevels;
    });
  };

  const applyZoom = (id: string, zoom: number) => {
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
    const retryCount = retryCounts[id] || 0;

    return (
      <WebView
        key={`${id}-${retryCount}`}
        ref={(ref) => { webViewRefs.current[id] = ref; }}
        source={{ uri: sheet.url }}
        style={[styles.webView, !visible && styles.hiddenWebView]}
        onLoadEnd={() => {
          clearTimeout(loadingTimers.current[id]);
          setLoadingState(id, false);
          setErrorState(id, null);
          setTimeout(() => {
            applyZoom(id, initialZoom);
          }, 300);
        }}
        onLoadStart={() => {
          setLoadingState(id, true);
          setErrorState(id, null);
          // 30초 타임아웃
          clearTimeout(loadingTimers.current[id]);
          loadingTimers.current[id] = setTimeout(() => {
            if (loadingStatesRef.current[id]) {
              setLoadingState(id, false);
              setErrorState(id, 'timeout');
              logger.warn('⏰ WebView 로딩 타임아웃:', { id });
            }
          }, WEBVIEW_LOAD_TIMEOUT_MS);
        }}
        onNavigationStateChange={(navState) => {
          const url = navState.url || '';
          const isGoogleLoginRedirect =
            url.includes('accounts.google.com') ||
            url.includes('ServiceLogin') ||
            url.includes('signin/oauth') ||
            url.includes('CheckCookie');
          if (isGoogleLoginRedirect) {
            webViewRefs.current[id]?.stopLoading();
            clearTimeout(loadingTimers.current[id]);
            clearTimeout(retryTimers.current[id]);
            setLoadingState(id, false);
            setErrorState(id, 'google_redirect');
            logger.warn('⚠️ WebView: 구글 로그인 페이지 감지 - 30초 후 자동 재시도', { id, url });
            // 30초 후 자동 재시도 (CDN 캐싱 대기)
            retryTimers.current[id] = setTimeout(() => {
              retryWebView(id);
            }, 30_000);
          }
        }}
        onError={(e) => {
          clearTimeout(loadingTimers.current[id]);
          setLoadingState(id, false);
          setErrorState(id, e.nativeEvent.description || 'error');
          logger.error('❌ WebView 로드 실패:', { id, error: e.nativeEvent.description, code: e.nativeEvent.code });
        }}
        onHttpError={(e) => {
          if (e.nativeEvent.statusCode >= 400) {
            clearTimeout(loadingTimers.current[id]);
            setLoadingState(id, false);
            setErrorState(id, `HTTP ${e.nativeEvent.statusCode}`);
            logger.error('❌ WebView HTTP 오류:', { id, statusCode: e.nativeEvent.statusCode });
          }
        }}
        scalesPageToFit={Platform.OS !== 'ios'}
        showsVerticalScrollIndicator={true}
        showsHorizontalScrollIndicator={true}
        scrollEnabled={true}
        bounces={true}
        cacheEnabled={true}
        cacheMode={retryCount > 0 ? 'LOAD_NO_CACHE' : 'LOAD_CACHE_ELSE_NETWORK'}
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
        errorStates,
        zoomLevels,
        webViewRefs,
        setLoadingState,
        setZoomLevel,
        applyZoom,
        retryWebView,
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
    // opacity:0 / width:0 / height:0 이면 iOS WKWebView가 네트워크 요청을 건너뜀
    // 1px + opacity:0.01 로 레이아웃을 확보해야 백그라운드 로딩이 실제로 이루어짐
    opacity: 0.01,
    position: 'absolute',
    width: 1,
    height: 1,
    zIndex: -9999,
  },
});
