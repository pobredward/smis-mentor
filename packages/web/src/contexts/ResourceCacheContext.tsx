'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { generationResourcesService, ResourceLink } from '@/lib/generationResourcesService';

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
  const { userData } = useAuth();
  const [scheduleLinks, setScheduleLinks] = useState<ResourceLink[]>([]);
  const [guideLinks, setGuideLinks] = useState<ResourceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStates, setLoadingStatesMap] = useState<Record<string, boolean>>({});

  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  useEffect(() => {
    if (activeJobCodeId) {
      loadResources();
    }
  }, [activeJobCodeId]);

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
      console.error('리소스 로드 실패:', error);
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
