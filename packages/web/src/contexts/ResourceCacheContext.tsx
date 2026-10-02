'use client';

import { resolveActiveJobCodeId } from '@smis-mentor/shared';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { generationResourcesService, ResourceLink } from '@/lib/generationResourcesService';
import { logger } from '@smis-mentor/shared';

interface ResourceCache {
  scheduleLinks: ResourceLink[];
  guideLinks: ResourceLink[];
  loading: boolean;
  loadingStates: Record<string, boolean>;
  setLoadingState: (id: string, loading: boolean) => void;
  refreshResources: () => Promise<void>;
}

const ResourceCacheContext = createContext<ResourceCache | null>(null);

export function ResourceCacheProvider({ children }: { children: ReactNode }) {
  const { userData, authReady } = useAuth();
  const [scheduleLinks, setScheduleLinks] = useState<ResourceLink[]>([]);
  const [guideLinks, setGuideLinks] = useState<ResourceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStates, setLoadingStatesMap] = useState<Record<string, boolean>>({});
  
  const activeJobCodeId = resolveActiveJobCodeId(userData); // 관리자 임시 캠프 포함

  useEffect(() => {
    // Auth가 준비될 때까지 대기
    if (!authReady) {
      return;
    }

    if (!userData) {
      // 로그인하지 않은 경우 로딩 즉시 종료
      setLoading(false);
      return;
    }

    // 수업 자료는 수업 탭(LessonContent)이 직접 불러온다 — 템플릿 대상(담임·수업·원어민) 규칙이 그쪽에 있다
    if (activeJobCodeId) {
      loadResources();
    } else {
      // 활성 캠프가 없는 경우 로딩 종료
      setLoading(false);
    }
  }, [activeJobCodeId, userData, authReady]);

  const loadResources = async () => {
    if (!activeJobCodeId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setScheduleLinks([]);
      setGuideLinks([]);
      
      const resources = await generationResourcesService.getResourcesByJobCodeId(activeJobCodeId);
      
      if (resources) {
        setScheduleLinks(resources.scheduleLinks || []);
        setGuideLinks(resources.guideLinks || []);

        const allLinks = [...(resources.scheduleLinks || []), ...(resources.guideLinks || [])];
        const initialLoadingStates = allLinks.reduce((acc, link) => ({ ...acc, [link.id]: true }), {});
        setLoadingStatesMap(initialLoadingStates);
      }
    } catch (error) {
      logger.error('리소스 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshResources = async () => {
    await loadResources();
  };

  const setLoadingState = (id: string, loading: boolean) => {
    setLoadingStatesMap(prev => ({ ...prev, [id]: loading }));
  };

  return (
    <ResourceCacheContext.Provider
      value={{
        scheduleLinks,
        guideLinks,
        loading,
        loadingStates,
        setLoadingState,
        refreshResources,
      }}
    >
      {children}
    </ResourceCacheContext.Provider>
  );
}

export function useResourceCache() {
  const context = useContext(ResourceCacheContext);
  if (!context) {
    throw new Error('useResourceCache must be used within ResourceCacheProvider');
  }
  return context;
}
