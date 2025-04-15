'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import useAnalytics from '@/hooks/useAnalytics';

export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const analyticsLogger = useAnalytics();

  // 페이지 뷰 추적 - 경로 변경 시 로깅
  useEffect(() => {
    if (pathname) {
      analyticsLogger.trackPageView(
        pathname,
        document.title,
        window.location.href,
        document.referrer
      );
    }
  }, [pathname, searchParams, analyticsLogger]);

  // 웹 바이탈 성능 측정
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 웹 바이탈 측정을 위한 함수
      const reportWebVitals = () => {
        const onPerfEntry = ({ name, delta, id }: { name: string; delta: number; id: string }) => {
          analyticsLogger.trackPerformance(name, delta, { metric_id: id });
        };

        if (window.performance && 'getEntriesByType' in performance) {
          // FCP (First Contentful Paint) 측정
          const paintMetrics = performance.getEntriesByType('paint');
          paintMetrics.forEach((entry) => {
            const metric = entry as PerformanceEntry;
            if (metric.name === 'first-contentful-paint') {
              analyticsLogger.trackPerformance(
                'FCP',
                metric.startTime,
                { path: pathname }
              );
            }
          });
        }

        // Navigation Timing API를 사용한 로딩 시간 측정
        if (window.performance && performance.timing) {
          window.addEventListener('load', () => {
            setTimeout(() => {
              const timing = performance.timing;
              const pageLoadTime = timing.loadEventEnd - timing.navigationStart;
              
              analyticsLogger.trackPerformance(
                'page_load_time',
                pageLoadTime,
                { path: pathname }
              );
            }, 0);
          });
        }

        return onPerfEntry;
      };

      // 웹 바이탈 측정 시작
      reportWebVitals();
    }
  }, [pathname, analyticsLogger]);

  // 사용자 상호작용 추적 (예: 스크롤 깊이)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      let maxScrollDepth = 0;
      let lastTrackedDepth = 0;
      
      const handleScroll = () => {
        const scrollHeight = document.documentElement.scrollHeight;
        const scrollTop = window.scrollY;
        const clientHeight = window.innerHeight;
        
        // 스크롤 깊이를 백분율로 계산
        const scrollDepth = Math.floor(
          ((scrollTop + clientHeight) / scrollHeight) * 100
        );
        
        // 최대 스크롤 깊이 업데이트
        maxScrollDepth = Math.max(maxScrollDepth, scrollDepth);
        
        // 25%, 50%, 75%, 90%, 100% 단위로 이벤트 기록
        const thresholds = [25, 50, 75, 90, 100];
        
        // 아직 추적되지 않은 새로운 임계값에 도달했는지 확인
        for (const threshold of thresholds) {
          if (maxScrollDepth >= threshold && lastTrackedDepth < threshold) {
            analyticsLogger.logEvent('scroll_depth', { 
              depth_percentage: threshold,
              page_path: pathname
            });
            lastTrackedDepth = threshold;
          }
        }
      };
      
      // 스크롤 이벤트 리스너 등록
      window.addEventListener('scroll', handleScroll, { passive: true });
      
      // 페이지 이탈 시 최종 스크롤 깊이 로깅
      window.addEventListener('beforeunload', () => {
        if (maxScrollDepth > 0) {
          analyticsLogger.logEvent('max_scroll_depth', { 
            depth_percentage: maxScrollDepth,
            page_path: pathname
          });
        }
      });
      
      return () => {
        window.removeEventListener('scroll', handleScroll);
      };
    }
  }, [pathname, analyticsLogger]);

  return <>{children}</>;
} 