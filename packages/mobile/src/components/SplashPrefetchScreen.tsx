import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { useCampTab } from '../context/CampTabContext';
import { logger } from '@smis-mentor/shared';

interface SplashPrefetchScreenProps {
  onComplete: () => void;
  minDisplayTime?: number; // 최소 표시 시간 (ms)
}

export function SplashPrefetchScreen({ 
  onComplete, 
  minDisplayTime = 1000 
}: SplashPrefetchScreenProps) {
  const { isPreloading, webViewPreloadComplete, webViewLoadProgress, preloadLinks } = useCampTab();
  const [fadeAnim] = useState(new Animated.Value(1));
  const [hasStarted, setHasStarted] = useState(false);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    if (isPreloading && !hasStarted) {
      setHasStarted(true);
      logger.info('🎬 SplashPrefetchScreen: 프리로딩 시작');
    }
  }, [isPreloading, hasStarted]);

  useEffect(() => {
    // 프리로딩이 완료되고, 최소 표시 시간이 지났으면 페이드아웃 후 완료
    if (webViewPreloadComplete && hasStarted) {
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, minDisplayTime - elapsed);

      logger.info(`✅ SplashPrefetchScreen: 프리로딩 완료 (경과: ${elapsed}ms, 대기: ${remainingTime}ms)`);

      setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          logger.info('👋 SplashPrefetchScreen: 페이드아웃 완료');
          onComplete();
        });
      }, remainingTime);
    }
  }, [webViewPreloadComplete, hasStarted, minDisplayTime, fadeAnim, onComplete, startTime]);

  // 프리로딩이 시작되지 않았거나, 링크가 없으면 바로 완료
  if (!hasStarted && !isPreloading && preloadLinks.length === 0) {
    logger.info('⏭️  SplashPrefetchScreen: 프리로딩 없음, 즉시 완료');
    setTimeout(() => onComplete(), 0);
    return null;
  }

  const percentage = webViewLoadProgress.total > 0 
    ? Math.round((webViewLoadProgress.loaded / webViewLoadProgress.total) * 100)
    : 0;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.content}>
        {/* 로고 또는 앱 이름 */}
        <Text style={styles.appName}>SMIS Mentor</Text>
        
        {/* 로딩 인디케이터 */}
        <ActivityIndicator size="large" color="#3b82f6" style={styles.loader} />
        
        {/* 프리로딩 상태 표시 */}
        {hasStarted && (
          <>
            <Text style={styles.statusText}>
              {webViewPreloadComplete 
                ? '✅ 데이터 로딩 완료' 
                : '📦 데이터 로딩 중...'}
            </Text>
            
            {isPreloading && !webViewPreloadComplete && (
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
          </>
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
  },
  appName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#3b82f6',
    marginBottom: 40,
    letterSpacing: 1,
  },
  loader: {
    marginBottom: 24,
  },
  statusText: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressBarBackground: {
    width: '100%',
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#9ca3af',
    fontFamily: 'monospace',
  },
});
