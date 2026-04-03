import React, { ReactNode } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@smis-mentor/shared';

// React Query 클라이언트 설정
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5분
      gcTime: 24 * 60 * 60 * 1000, // 24시간 (persist와 맞춤)
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

// AsyncStorage persister 생성
const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'SMIS_MENTOR_QUERY_CACHE',
  throttleTime: 5000, // 5초마다 저장 (로그 스팸 방지)
  serialize: (data) => JSON.stringify(data),
  deserialize: (data) => JSON.parse(data),
});

interface QueryClientProviderProps {
  children: ReactNode;
}

export function QueryClientProvider({ children }: QueryClientProviderProps) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        maxAge: 24 * 60 * 60 * 1000, // 24시간
        buster: '', // 캐시 버전 (변경 시 모든 캐시 무효화)
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            // 캠프 관련 데이터만 저장
            const queryKey = query.queryKey[0] as string;
            const persistKeys = [
              'lessonMaterials',
              'sections', 
              'tasks',
              'schedule',
              'guide',
              'classData',
              'roomData',
              'education',
              'jobCodesInfo',
              'students', // 반명단/방명단 데이터
            ];
            
            return persistKeys.includes(queryKey);
          },
        },
        onSuccess: () => {
          logger.info('✅ React Query 캐시 복원 완료');
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

// queryClient를 직접 export하여 다른 곳에서 사용 가능하게 함
export { queryClient };
