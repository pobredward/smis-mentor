import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Animated, Image } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useCampTab } from '../context/CampTabContext';
import { logger, getAppConfig, DEFAULT_LOADING_QUOTES } from '@smis-mentor/shared';
import { db } from '../config/firebase';

// 네이티브 스플래시 화면 유지
SplashScreen.preventAutoHideAsync().catch(() => {
  // 이미 숨겨진 경우 무시
});

interface SplashPrefetchScreenProps {
  onComplete: () => void;
  minDisplayTime?: number;
}

export function SplashPrefetchScreen({ 
  onComplete, 
  minDisplayTime = 1500 
}: SplashPrefetchScreenProps) {
  const { isPreloading, webViewPreloadComplete, webViewLoadProgress, preloadLinks } = useCampTab();
  const [fadeAnim] = useState(new Animated.Value(0));
  const [hasStarted, setHasStarted] = useState(false);
  const [startTime] = useState(Date.now());
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);
  const [randomQuote, setRandomQuote] = useState<string>('');
  const [loadingStage, setLoadingStage] = useState<'캐시 정리' | '캠프 데이터' | '페이지 프리로드' | '완료'>('캐시 정리');

  // Firebase에서 로딩 문구 불러오기
  useEffect(() => {
    const loadQuotes = async () => {
      try {
        const config = await getAppConfig(db);
        const quotes = config?.loadingQuotes && config.loadingQuotes.length > 0
          ? config.loadingQuotes
          : DEFAULT_LOADING_QUOTES;
        
        const randomIndex = Math.floor(Math.random() * quotes.length);
        setRandomQuote(quotes[randomIndex]);
        logger.info('✅ 로딩 문구 불러오기 성공:', quotes[randomIndex]);
      } catch (error) {
        logger.error('❌ 로딩 문구 불러오기 실패, 기본값 사용:', error);
        const quotes = DEFAULT_LOADING_QUOTES;
        const randomIndex = Math.floor(Math.random() * quotes.length);
        setRandomQuote(quotes[randomIndex]);
      }
    };

    loadQuotes();
  }, []);

  // 네이티브 스플래시 숨기기 및 페이드인
  useEffect(() => {
    const hideNativeSplash = async () => {
      try {
        // 짧은 딜레이 후 네이티브 스플래시 숨기기
        await new Promise(resolve => setTimeout(resolve, 500));
        await SplashScreen.hideAsync();
        setNativeSplashHidden(true);
        
        // 커스텀 로딩 화면 페이드인
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
        
        logger.info('🎬 네이티브 스플래시 숨김 → 커스텀 로딩 화면 표시');
      } catch (error) {
        logger.error('네이티브 스플래시 숨기기 실패:', error);
        setNativeSplashHidden(true);
      }
    };

    hideNativeSplash();
  }, [fadeAnim]);

  // 로딩 단계 추적
  useEffect(() => {
    if (isPreloading && !hasStarted) {
      setHasStarted(true);
      setLoadingStage('캠프 데이터');
      logger.info('🎬 SplashPrefetchScreen: 프리로딩 시작');
    }
  }, [isPreloading, hasStarted]);

  useEffect(() => {
    if (isPreloading && webViewLoadProgress.total > 0) {
      setLoadingStage('페이지 프리로드');
    }
  }, [isPreloading, webViewLoadProgress.total]);

  useEffect(() => {
    if (webViewPreloadComplete && nativeSplashHidden) {
      setLoadingStage('완료');
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, minDisplayTime - elapsed);

      logger.info(`✅ SplashPrefetchScreen: 프리로딩 완료 (경과: ${elapsed}ms, 대기: ${remainingTime}ms)`);

      setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => {
          logger.info('👋 SplashPrefetchScreen: 페이드아웃 완료');
          onComplete();
        });
      }, remainingTime);
    }
  }, [webViewPreloadComplete, nativeSplashHidden, minDisplayTime, fadeAnim, onComplete, startTime]);

  // 프리로딩이 없으면 즉시 완료
  useEffect(() => {
    if (!isPreloading && preloadLinks.length === 0 && !hasStarted && nativeSplashHidden) {
      logger.info('⏭️  SplashPrefetchScreen: 프리로딩 없음, 즉시 완료');
      setTimeout(() => onComplete(), 300);
    }
  }, [isPreloading, preloadLinks.length, hasStarted, nativeSplashHidden, onComplete]);

  const percentage = webViewLoadProgress.total > 0 
    ? Math.round((webViewLoadProgress.loaded / webViewLoadProgress.total) * 100)
    : 0;

  // 네이티브 스플래시 표시 중에는 아무것도 렌더링하지 않음
  if (!nativeSplashHidden) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.content}>
        {/* 작은 로고 */}
        <View style={styles.logoContainer}>
          <Image 
            source={require('../../assets/icon.png')} 
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        
        {/* 로딩 인디케이터 */}
        <ActivityIndicator size="large" color="#3b82f6" style={styles.loader} />
        
        {/* 로딩 단계 표시 */}
        <Text style={styles.stageText}>
          {loadingStage === '완료' ? '✅ 준비 완료' : `📦 ${loadingStage} 중...`}
        </Text>
        
        {/* 프로그레스 바 */}
        {loadingStage === '페이지 프리로드' && !webViewPreloadComplete && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBarBackground}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { width: `${percentage}%` }
                ]} 
              />
            </View>
            <Text style={styles.progressText}>
              {webViewLoadProgress.loaded} / {webViewLoadProgress.total} ({percentage}%)
            </Text>
          </View>
        )}
        
        {/* 랜덤 문구 */}
        {randomQuote && (
          <View style={styles.quoteContainer}>
            <Text style={styles.quoteText}>{randomQuote}</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 40,
    width: '100%',
  },
  logoContainer: {
    marginBottom: 24,
    alignItems: 'center',
  },
  logo: {
    width: 80,
    height: 80,
  },
  loader: {
    marginBottom: 16,
  },
  stageText: {
    fontSize: 15,
    color: '#4b5563',
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: '600',
  },
  progressContainer: {
    width: '80%',
    alignItems: 'center',
    marginBottom: 32,
  },
  progressBarBackground: {
    width: '100%',
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    color: '#9ca3af',
    fontFamily: 'monospace',
  },
  quoteContainer: {
    position: 'absolute',
    bottom: 60,
    left: 40,
    right: 40,
    alignItems: 'center',
  },
  quoteText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '500',
  },
});
