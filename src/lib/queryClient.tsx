'use client';

import React, { ReactNode, useState } from 'react';
import { 
  QueryClient, 
  QueryClientProvider 
} from '@tanstack/react-query';

// React Query 기본 설정
const defaultOptions = {
  queries: {
    refetchOnWindowFocus: false, // 윈도우 포커스 시 자동 리페치 비활성화
    staleTime: 5 * 60 * 1000, // 5분 동안 데이터 유효 (stale 상태가 되기 전까지)
    cacheTime: 30 * 60 * 1000, // 30분 동안 캐시 유지
    retry: 1, // 요청 실패 시 1번 재시도
  },
};

// QueryClientProvider 래퍼 컴포넌트
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

// React Query 캐시 키
export const QueryKeys = {
  USERS: 'users',
  USER: (id: string) => ['users', id],
  JOB_BOARDS: 'jobBoards',
  JOB_BOARD: (id: string) => ['jobBoards', id],
  ACTIVE_JOB_BOARDS: 'activeJobBoards',
  JOB_CODES: 'jobCodes',
  JOB_CODE: (id: string) => ['jobCodes', id],
  APPLICATIONS: 'applications',
  USER_APPLICATIONS: (userId: string) => ['applications', 'user', userId],
  JOB_BOARD_APPLICATIONS: (jobBoardId: string) => ['applications', 'jobBoard', jobBoardId],
  REVIEWS: 'reviews',
  REVIEW: (id: string) => ['reviews', id]
}; 