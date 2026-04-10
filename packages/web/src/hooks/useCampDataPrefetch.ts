import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@smis-mentor/shared';

/**
 * 캠프 데이터 프리페칭을 위한 query key 생성
 */
export const campQueryKeys = {
  lessonMaterials: (userId: string) => ['lessonMaterials', userId] as const,
  sections: (materialId: string) => ['sections', materialId] as const,
  templates: () => ['lessonMaterialTemplates'] as const,
  jobCodesInfo: (jobExperienceIds: string[]) => ['jobCodesInfo', jobExperienceIds] as const,
  schedule: (activeJobCodeId: string) => ['schedule', activeJobCodeId] as const,
  guide: (activeJobCodeId: string) => ['guide', activeJobCodeId] as const,
  education: (activeJobCodeId: string) => ['education', activeJobCodeId] as const,
  campPages: (activeJobCodeId: string) => ['campPages', activeJobCodeId] as const,
};

/**
 * 캠프 탭의 모든 데이터를 프리페칭하는 커스텀 훅 (웹 버전)
 */
export function useCampDataPrefetch() {
  const queryClient = useQueryClient();
  const { userData } = useAuth();

  /**
   * 특정 캠프 코드에 대한 모든 데이터를 프리페칭
   */
  const prefetchCampData = async (jobCodeId: string) => {
    if (!userData) {
      logger.warn('useCampDataPrefetch: userData가 없음');
      return;
    }

    logger.info('🚀 캠프 데이터 프리페칭 시작', { jobCodeId, userId: userData.userId });

    try {
      // 병렬로 모든 데이터 프리페칭
      await Promise.all([
        // 1. 수업 자료 관련 데이터
        prefetchLessonData(),
        
        // 2. 시간표 데이터
        prefetchScheduleData(jobCodeId),
        
        // 3. 인솔표 데이터
        prefetchGuideData(jobCodeId),
        
        // 4. 교육 자료 데이터
        prefetchEducationData(jobCodeId),

        // 5. 캠프 페이지 데이터
        prefetchCampPagesData(jobCodeId),
      ]);

      logger.info('✅ 캠프 데이터 프리페칭 완료', { jobCodeId });
    } catch (error) {
      logger.error('❌ 캠프 데이터 프리페칭 실패', { error, jobCodeId });
      throw error;
    }
  };

  /**
   * 수업 자료 데이터 프리페칭
   */
  const prefetchLessonData = async () => {
    if (!userData) return;

    try {
      const { getLessonMaterials, getLessonMaterialTemplates } = await import('@/lib/lessonMaterialService');
      const { getUserJobCodesInfo } = await import('@/lib/firebaseService');

      // 1. 템플릿 데이터
      await queryClient.prefetchQuery({
        queryKey: campQueryKeys.templates(),
        queryFn: getLessonMaterialTemplates,
      });

      // 2. 사용자 수업 자료
      await queryClient.prefetchQuery({
        queryKey: campQueryKeys.lessonMaterials(userData.userId),
        queryFn: () => getLessonMaterials(userData.userId),
      });

      // 3. Job codes 정보 (activeJobExperienceId가 있는 경우만)
      if (userData.activeJobExperienceId) {
        await queryClient.prefetchQuery({
          queryKey: campQueryKeys.jobCodesInfo([userData.activeJobExperienceId]),
          queryFn: () => getUserJobCodesInfo([userData.activeJobExperienceId!]),
        });
      }

      logger.info('  ✅ 수업 자료 데이터 프리페칭 완료');
    } catch (error) {
      logger.error('  ❌ 수업 자료 데이터 프리페칭 실패', { error });
    }
  };

  /**
   * 시간표 데이터 프리페칭
   */
  const prefetchScheduleData = async (jobCodeId: string) => {
    try {
      const { getResourcesByJobCodeId } = await import('@/lib/generationResourcesService');
      
      await queryClient.prefetchQuery({
        queryKey: campQueryKeys.schedule(jobCodeId),
        queryFn: async () => {
          const resources = await getResourcesByJobCodeId(jobCodeId);
          return resources?.scheduleLinks || [];
        },
      });
      
      logger.info('  ✅ 시간표 데이터 프리페칭 완료');
    } catch (error) {
      logger.error('  ❌ 시간표 데이터 프리페칭 실패', { error });
    }
  };

  /**
   * 인솔표 데이터 프리페칭
   */
  const prefetchGuideData = async (jobCodeId: string) => {
    try {
      const { getResourcesByJobCodeId } = await import('@/lib/generationResourcesService');
      
      await queryClient.prefetchQuery({
        queryKey: campQueryKeys.guide(jobCodeId),
        queryFn: async () => {
          const resources = await getResourcesByJobCodeId(jobCodeId);
          return resources?.guideLinks || [];
        },
      });
      
      logger.info('  ✅ 인솔표 데이터 프리페칭 완료');
    } catch (error) {
      logger.error('  ❌ 인솔표 데이터 프리페칭 실패', { error });
    }
  };

  /**
   * 교육 자료 데이터 프리페칭
   */
  const prefetchEducationData = async (jobCodeId: string) => {
    try {
      const { getResourcesByJobCodeId } = await import('@/lib/generationResourcesService');
      
      await queryClient.prefetchQuery({
        queryKey: campQueryKeys.education(jobCodeId),
        queryFn: async () => {
          const resources = await getResourcesByJobCodeId(jobCodeId);
          return resources?.educationLinks || [];
        },
      });
      
      logger.info('  ✅ 교육 자료 데이터 프리페칭 완료');
    } catch (error) {
      logger.error('  ❌ 교육 자료 데이터 프리페칭 실패', { error });
    }
  };

  /**
   * 캠프 페이지 데이터 프리페칭
   */
  const prefetchCampPagesData = async (jobCodeId: string) => {
    try {
      const { getCampPagesByJobCodeId } = await import('@/lib/campPageService');
      
      await queryClient.prefetchQuery({
        queryKey: campQueryKeys.campPages(jobCodeId),
        queryFn: () => getCampPagesByJobCodeId(jobCodeId),
      });
      
      logger.info('  ✅ 캠프 페이지 데이터 프리페칭 완료');
    } catch (error) {
      logger.error('  ❌ 캠프 페이지 데이터 프리페칭 실패', { error });
    }
  };

  /**
   * 캐시 무효화 (캠프 변경 시)
   */
  const invalidateCampData = async () => {
    logger.info('🗑️ 캠프 데이터 캐시 무효화');
    
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['lessonMaterials'] }),
      queryClient.invalidateQueries({ queryKey: ['sections'] }),
      queryClient.invalidateQueries({ queryKey: ['jobCodesInfo'] }),
      queryClient.invalidateQueries({ queryKey: ['schedule'] }),
      queryClient.invalidateQueries({ queryKey: ['guide'] }),
      queryClient.invalidateQueries({ queryKey: ['education'] }),
      queryClient.invalidateQueries({ queryKey: ['campPages'] }),
    ]);

    logger.info('✅ 캠프 데이터 캐시 무효화 완료');
  };

  return {
    prefetchCampData,
    invalidateCampData,
  };
}
