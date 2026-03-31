'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { generationResourcesService, ResourceLink } from '@/lib/generationResourcesService';
import {
  getLessonMaterials,
  addLessonMaterial,
  getSections,
  LessonMaterialData,
  SectionData,
  getLessonMaterialTemplates,
  LessonMaterialTemplate,
  deleteLessonMaterial,
  updateLessonMaterial,
} from '@/lib/lessonMaterialService';
import { getUserJobCodesInfo } from '@/lib/firebaseService';
import { JobCodeWithGroup } from '@/types';
import { logger } from '@smis-mentor/shared';

type SectionDataWithLinks = SectionData & {
  links?: { label: string; url: string }[];
  isFromTemplate?: boolean;
  templateSectionId?: string;
};

interface ResourceCache {
  scheduleLinks: ResourceLink[];
  guideLinks: ResourceLink[];
  materials: LessonMaterialData[];
  sections: Record<string, SectionDataWithLinks[]>;
  templates: LessonMaterialTemplate[];
  userJobCodes: JobCodeWithGroup[];
  loading: boolean;
  lessonLoading: boolean;
  loadingStates: Record<string, boolean>;
  setLoadingState: (id: string, loading: boolean) => void;
  refreshResources: () => Promise<void>;
  refreshLessonMaterials: () => Promise<void>;
}

const ResourceCacheContext = createContext<ResourceCache | null>(null);

export function ResourceCacheProvider({ children }: { children: ReactNode }) {
  const { userData, authReady } = useAuth();
  const [scheduleLinks, setScheduleLinks] = useState<ResourceLink[]>([]);
  const [guideLinks, setGuideLinks] = useState<ResourceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStates, setLoadingStatesMap] = useState<Record<string, boolean>>({});
  
  // 교육 자료 관련 상태
  const [materials, setMaterials] = useState<LessonMaterialData[]>([]);
  const [sections, setSections] = useState<Record<string, SectionDataWithLinks[]>>({});
  const [templates, setTemplates] = useState<LessonMaterialTemplate[]>([]);
  const [userJobCodes, setUserJobCodes] = useState<JobCodeWithGroup[]>([]);
  const [lessonLoading, setLessonLoading] = useState(true);

  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  useEffect(() => {
    // Auth가 준비될 때까지 대기
    if (!authReady) {
      return;
    }

    if (!userData) {
      // 로그인하지 않은 경우 로딩 즉시 종료
      setLoading(false);
      setLessonLoading(false);
      return;
    }

    if (activeJobCodeId) {
      loadResources();
      loadLessonMaterials();
    } else {
      // 활성 캠프가 없는 경우 로딩 종료
      setLoading(false);
      setLessonLoading(false);
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

  const fetchActiveJobCode = async () => {
    if (!userData?.activeJobExperienceId) {
      setUserJobCodes([]);
      return [];
    }
    
    try {
      const jobCodesInfo = await getUserJobCodesInfo([userData.activeJobExperienceId]);
      setUserJobCodes(jobCodesInfo);
      return jobCodesInfo;
    } catch (error) {
      logger.error('활성화된 직무 코드 정보 가져오기 오류:', error);
      return [];
    }
  };

  const getAccessibleTemplates = (
    allTemplates: LessonMaterialTemplate[],
    activeJobCode: JobCodeWithGroup[]
  ) => {
    if (!activeJobCode.length) return [];
    const codes = activeJobCode.map((jc) => jc.code);
    return allTemplates.filter((template) => template.code && codes.includes(template.code));
  };

  const loadLessonMaterials = async () => {
    if (!userData || !activeJobCodeId) {
      setLessonLoading(false);
      setMaterials([]);
      setSections({});
      return;
    }

    setLessonLoading(true);
    try {
      const activeJobCode = await fetchActiveJobCode();
      const allTemplates = await getLessonMaterialTemplates();
      setTemplates(allTemplates);

      const accessibleTemplates = getAccessibleTemplates(allTemplates, activeJobCode);
      const mats = await getLessonMaterials(userData.userId);

      const activeCodesList = activeJobCode.map((uc) => uc.code);
      const seenTemplateIds = new Set<string>();
      const materialsToUpdate: { id: string; newTitle: string }[] = [];

      for (const mat of mats) {
        if (!mat.templateId) {
          if (mat.userCode && !activeCodesList.includes(mat.userCode)) {
            continue;
          }
          continue;
        }

        const template = allTemplates.find((t) => t.id === mat.templateId);
        if (!template) {
          // 템플릿이 존재하지 않는 경우에도 유지 (사용자 데이터 보호)
          continue;
        }

        if (!template.code || !activeCodesList.includes(template.code)) {
          // 활성화된 코드가 아닌 템플릿도 유지 (사용자 데이터 보호)
          continue;
        }

        if (seenTemplateIds.has(mat.templateId)) {
          // 중복된 템플릿도 유지 (첫 번째 것만 표시)
          continue;
        }

        seenTemplateIds.add(mat.templateId);

        if (mat.title !== template.title) {
          materialsToUpdate.push({ id: mat.id, newTitle: template.title });
        }
      }

      for (const { id, newTitle } of materialsToUpdate) {
        await updateLessonMaterial(id, { title: newTitle });
      }

      for (let i = 0; i < accessibleTemplates.length; i++) {
        const template = accessibleTemplates[i];
        if (!seenTemplateIds.has(template.id)) {
          await addLessonMaterial(userData.userId, template.title, i, template.id);
        }
      }

      const finalMats = await getLessonMaterials(userData.userId);
      
      // 활성화된 코드에 해당하는 자료만 필터링 + 중복 제거
      const seenTemplateIdsInFinal = new Set<string>();
      const filteredMats = finalMats.filter((mat) => {
        if (mat.templateId) {
          const template = allTemplates.find((t) => t.id === mat.templateId);
          if (!template?.code || !activeCodesList.includes(template.code)) {
            return false;
          }
          
          // 중복 templateId 체크 (첫 번째만 표시)
          if (seenTemplateIdsInFinal.has(mat.templateId)) {
            logger.info('🚫 중복 제거:', mat.id, mat.title, `(templateId: ${mat.templateId})`);
            return false;
          }
          seenTemplateIdsInFinal.add(mat.templateId);
          return true;
        } else {
          return mat.userCode && activeCodesList.includes(mat.userCode);
        }
      });
      
      setMaterials(filteredMats);

      const allSections: Record<string, SectionDataWithLinks[]> = {};
      for (const mat of finalMats) {
        const matSections = await getSections(mat.id);
        const template = mat.templateId ? allTemplates.find((t) => t.id === mat.templateId) : null;

        const mergedSections: SectionDataWithLinks[] = [];
        const processedUserSectionIds = new Set<string>();

        if (template?.sections) {
          // 삭제된 섹션 ID 목록
          const deletedSectionIds = new Set(template.deletedSectionIds || []);
          
          for (const templateSection of template.sections) {
            // 삭제된 섹션은 건너뛰기
            if (deletedSectionIds.has(templateSection.id)) {
              continue;
            }
            
            const userSection = matSections.find((s) => s.templateSectionId === templateSection.id);

            if (userSection) {
              mergedSections.push({
                ...userSection,
                isFromTemplate: true,
                templateSectionId: templateSection.id,
                title: templateSection.title,
                links: templateSection.links || [],
                order: templateSection.order,
              });
              processedUserSectionIds.add(userSection.id);
            } else {
              mergedSections.push({
                id: `template-${templateSection.id}`,
                title: templateSection.title,
                order: templateSection.order,
                viewUrl: '',
                originalUrl: '',
                links: templateSection.links || [],
                isFromTemplate: true,
                templateSectionId: templateSection.id,
              });
            }
          }
        }

        const additionalUserSections = matSections
          .filter((s) => !processedUserSectionIds.has(s.id))
          .map((section) => ({
            ...section,
            isFromTemplate: false,
          }));

        allSections[mat.id] = [...mergedSections, ...additionalUserSections];
      }
      setSections(allSections);
    } catch (error) {
      logger.error('교육 자료 로드 오류:', error);
    } finally {
      setLessonLoading(false);
    }
  };

  const refreshResources = async () => {
    await loadResources();
  };

  const refreshLessonMaterials = async () => {
    await loadLessonMaterials();
  };

  const setLoadingState = (id: string, loading: boolean) => {
    setLoadingStatesMap(prev => ({ ...prev, [id]: loading }));
  };

  return (
    <ResourceCacheContext.Provider
      value={{
        scheduleLinks,
        guideLinks,
        materials,
        sections,
        templates,
        userJobCodes,
        loading,
        lessonLoading,
        loadingStates,
        setLoadingState,
        refreshResources,
        refreshLessonMaterials,
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
