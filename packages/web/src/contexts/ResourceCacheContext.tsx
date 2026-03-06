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
  const { userData } = useAuth();
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
    if (activeJobCodeId) {
      loadResources();
      loadLessonMaterials();
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
      console.error('활성화된 직무 코드 정보 가져오기 오류:', error);
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
      const materialsToRemove: string[] = [];
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
          materialsToRemove.push(mat.id);
          continue;
        }

        if (!template.code || !activeCodesList.includes(template.code)) {
          materialsToRemove.push(mat.id);
          continue;
        }

        if (seenTemplateIds.has(mat.templateId)) {
          materialsToRemove.push(mat.id);
          continue;
        }

        seenTemplateIds.add(mat.templateId);

        if (mat.title !== template.title) {
          materialsToUpdate.push({ id: mat.id, newTitle: template.title });
        }
      }

      for (const matId of materialsToRemove) {
        await deleteLessonMaterial(matId);
      }

      for (const { id, newTitle } of materialsToUpdate) {
        await updateLessonMaterial(id, { title: newTitle });
      }

      for (const template of accessibleTemplates) {
        if (!seenTemplateIds.has(template.id)) {
          await addLessonMaterial(userData.userId, template.title, 0, template.id);
        }
      }

      const finalMats = await getLessonMaterials(userData.userId);
      
      const filteredMats = finalMats.filter((mat) => {
        if (mat.templateId) {
          const template = allTemplates.find((t) => t.id === mat.templateId);
          return template?.code && activeCodesList.includes(template.code);
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
          for (const templateSection of template.sections) {
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
      console.error('교육 자료 로드 오류:', error);
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
