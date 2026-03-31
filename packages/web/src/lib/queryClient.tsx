'use client';

import React, { ReactNode, useState } from 'react';
import { 
  QueryClient, 
  QueryClientProvider 
} from '@tanstack/react-query';

// React Query 기본 설정
const defaultOptions = {
  queries: {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5분 동안 데이터가 fresh 상태 유지
    gcTime: 30 * 60 * 1000, // 30분 동안 가비지 컬렉션 방지 (v5에서 cacheTime에서 변경)
    retry: 1,
    networkMode: 'online' as const, // 네트워크 상태 확인
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
  USER: (id: string) => ['users', id] as const,
  JOB_BOARDS: 'jobBoards',
  JOB_BOARD: (id: string) => ['jobBoards', id] as const,
  ACTIVE_JOB_BOARDS: 'activeJobBoards',
  JOB_CODES: 'jobCodes',
  JOB_CODE: (id: string) => ['jobCodes', id] as const,
  APPLICATIONS: 'applications',
  USER_APPLICATIONS: (userId: string) => ['applications', 'user', userId] as const,
  JOB_BOARD_APPLICATIONS: (jobBoardId: string) => ['applications', 'jobBoard', jobBoardId] as const,
  REVIEWS: 'reviews',
  REVIEW: (id: string) => ['reviews', id] as const,
  EVALUATIONS: 'evaluations',
  EVALUATION: (id: string) => ['evaluations', id] as const,
  USER_EVALUATIONS: (userId: string) => ['evaluations', 'user', userId] as const,
  TASKS: 'tasks',
  TASK: (id: string) => ['tasks', id] as const,
  SMS_TEMPLATES: 'smsTemplates',
  SMS_TEMPLATE: (id: string) => ['smsTemplates', id] as const,
}; 