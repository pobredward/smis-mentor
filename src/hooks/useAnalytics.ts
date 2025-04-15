import { useEffect, useState } from 'react';
import { analytics } from '@/lib/firebase';
import { AnalyticsLogger } from '@/lib/analyticsUtils';

/**
 * Firebase Analytics를 사용하기 위한 훅
 * 클라이언트 컴포넌트에서만 사용 가능
 */
const useAnalytics = () => {
  const [logger, setLogger] = useState<AnalyticsLogger | null>(null);

  useEffect(() => {
    if (analytics instanceof Promise) {
      analytics.then((instance) => {
        setLogger(new AnalyticsLogger(instance));
      });
    }
  }, []);

  return logger || new AnalyticsLogger(null);
};

export default useAnalytics; 