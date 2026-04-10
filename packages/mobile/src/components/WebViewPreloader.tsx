import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { logger } from '@smis-mentor/shared';

export interface PreloadLink {
  id: string;
  title: string;
  url: string;
  type: 'education' | 'schedule' | 'guide' | 'lesson';
}

interface WebViewPreloaderProps {
  links: PreloadLink[];
  onLoadComplete?: () => void;
  onProgressUpdate?: (loaded: number, total: number) => void;
  enabled: boolean;
}

export function WebViewPreloader({ links, onLoadComplete, onProgressUpdate, enabled }: WebViewPreloaderProps) {
  const [loadedCount, setLoadedCount] = useState(0);
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [loadingStartTimes, setLoadingStartTimes] = useState<Record<string, number>>({});
  const [hasCompleted, setHasCompleted] = useState(false);
  
  // useRef로 동기적 중복 방지
  const completedLinksRef = useRef<Set<string>>(new Set());

  // Props 변경 감지 로그
  useEffect(() => {
    logger.info(`🔍 WebViewPreloader Props 변경:`, {
      enabled,
      linksCount: links.length,
      linkIds: links.map(l => l.id),
    });
  }, [links, enabled]);

  useEffect(() => {
    if (!enabled) {
      logger.info('⏸️ WebViewPreloader: disabled 상태');
      setLoadedCount(0);
      setLoadingStates({});
      setLoadingStartTimes({});
      setHasCompleted(false);
      completedLinksRef.current = new Set();
      return;
    }

    if (links.length === 0) {
      logger.info('⚠️ WebViewPreloader: 프리로드할 링크가 없음 - 즉시 완료 처리');
      if (!hasCompleted) {
        setHasCompleted(true);
        onLoadComplete?.();
      }
      return;
    }

    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('🔄 WebViewPreloader: 프리로드 시작');
    logger.info(`📋 총 ${links.length}개 링크 프리로드 예정:`);
    links.forEach((link, idx) => {
      logger.info(`   ${idx + 1}. [${link.type}] ${link.title}`);
      logger.info(`      URL: ${link.url}`);
    });
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 모든 링크를 로딩 중으로 초기화
    const initialStates = links.reduce((acc, link) => ({
      ...acc,
      [link.id]: true,
    }), {});
    setLoadingStates(initialStates);
    setLoadedCount(0);
    setHasCompleted(false);
    completedLinksRef.current = new Set();
  }, [links, enabled]);

  useEffect(() => {
    // 진행 상황 업데이트
    if (enabled && links.length > 0 && loadedCount > 0) {
      onProgressUpdate?.(loadedCount, links.length);
    }

    // 모든 링크 로딩 완료 확인 (한 번만 호출)
    if (loadedCount === links.length && loadedCount > 0 && enabled && !hasCompleted) {
      const totalDuration = Object.values(loadingStartTimes).length > 0
        ? Date.now() - Math.min(...Object.values(loadingStartTimes))
        : 0;
      
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.info('✅ WebViewPreloader: 모든 WebView 프리로드 완료!');
      logger.info(`📊 통계:`);
      logger.info(`   - 총 링크 수: ${links.length}개`);
      logger.info(`   - 총 소요 시간: ${(totalDuration / 1000).toFixed(2)}초`);
      logger.info(`   - 평균 로딩 시간: ${(totalDuration / links.length / 1000).toFixed(2)}초/링크`);
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      setHasCompleted(true);
      onLoadComplete?.();
    }
  }, [loadedCount, links.length, enabled, hasCompleted, loadingStartTimes]);

  const handleLoadEnd = (link: PreloadLink) => {
    // useRef로 동기적 중복 체크
    if (completedLinksRef.current.has(link.id)) {
      logger.info(`⏭️  [${link.type}] ${link.title} - 이미 완료됨 (스킵)`);
      return;
    }

    // 즉시 완료 목록에 추가 (동기적)
    completedLinksRef.current.add(link.id);

    const startTime = loadingStartTimes[link.id];
    const duration = startTime ? Date.now() - startTime : 0;
    
    logger.info(`✅ [${link.type}] ${link.title} - 로딩 완료`);
    logger.info(`   ⏱️  소요 시간: ${(duration / 1000).toFixed(2)}초`);
    logger.info(`   🔗 URL: ${link.url}`);
    
    setLoadingStates(prev => ({
      ...prev,
      [link.id]: false,
    }));
    
    setLoadedCount(prev => {
      const newCount = prev + 1;
      logger.info(`📊 진행: ${newCount}/${links.length} (${Math.round((newCount / links.length) * 100)}%)`);
      return newCount;
    });
  };

  const handleLoadError = (link: PreloadLink, error: any) => {
    // useRef로 동기적 중복 체크
    if (completedLinksRef.current.has(link.id)) {
      logger.info(`⏭️  [${link.type}] ${link.title} - 이미 완료됨 (스킵)`);
      return;
    }

    // 즉시 완료 목록에 추가 (동기적)
    completedLinksRef.current.add(link.id);

    const startTime = loadingStartTimes[link.id];
    const duration = startTime ? Date.now() - startTime : 0;
    
    logger.error(`❌ [${link.type}] ${link.title} - 로딩 실패`);
    logger.error(`   ⏱️  소요 시간: ${(duration / 1000).toFixed(2)}초`);
    logger.error(`   🔗 URL: ${link.url}`);
    logger.error(`   💥 에러:`, error);
    
    setLoadingStates(prev => ({
      ...prev,
      [link.id]: false,
    }));
    
    // 에러가 나도 카운트는 증가시켜서 다음 진행
    setLoadedCount(prev => {
      const newCount = prev + 1;
      logger.info(`📊 진행: ${newCount}/${links.length} (${Math.round((newCount / links.length) * 100)}%)`);
      return newCount;
    });
  };

  const handleLoadStart = (link: PreloadLink) => {
    const now = Date.now();
    setLoadingStartTimes(prev => ({
      ...prev,
      [link.id]: now,
    }));
    
    logger.info(`🔄 [${link.type}] ${link.title} - 로딩 시작`);
    logger.info(`   🔗 URL: ${link.url}`);
  };

  if (!enabled || links.length === 0) {
    logger.info(`🚫 WebViewPreloader: 렌더링 스킵 (enabled: ${enabled}, links: ${links.length})`);
    return null;
  }

  logger.info(`✅ WebViewPreloader: 렌더링 중 (${links.length}개 WebView)`);

  return (
    <View style={styles.preloadContainer}>
      {links.map((link) => (
        <WebView
          key={link.id}
          source={{ uri: link.url }}
          style={styles.preloadWebView}
          cacheEnabled={true}
          cacheMode="LOAD_CACHE_ELSE_NETWORK"
          incognito={false}
          androidLayerType="hardware"
          onLoadStart={() => handleLoadStart(link)}
          onLoadEnd={() => handleLoadEnd(link)}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            handleLoadError(link, nativeEvent);
          }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={false}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback={true}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          scrollEnabled={false}
          bounces={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          onShouldStartLoadWithRequest={() => true}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            logger.error(`  🌐 HTTP 오류 (${link.title}):`, {
              statusCode: nativeEvent.statusCode,
              url: nativeEvent.url,
            });
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  preloadContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 1,
    height: 1,
    overflow: 'hidden',
    zIndex: -9999,
  },
  preloadWebView: {
    width: 1,
    height: 1,
    opacity: 0.01, // 완전 투명(0)이면 OS가 로드 안 함!
  },
});
