import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useCampTab } from '../context/CampTabContext';
import { logger } from '@smis-mentor/shared';

/**
 * 캠프 데이터 프리페칭을 위한 query key 생성
 */
export const campQueryKeys = {
  lessonMaterials: (userId: string) => ['lessonMaterials', userId] as const,
  sections: (materialId: string) => ['sections', materialId] as const,
  templates: () => ['lessonMaterialTemplates'] as const,
  jobCodesInfo: (jobExperienceIds: string[]) => ['jobCodesInfo', jobExperienceIds] as const,
  tasks: (userId: string) => ['tasks', userId] as const,
  schedule: (activeJobCodeId: string) => ['schedule', activeJobCodeId] as const,
  guide: (activeJobCodeId: string) => ['guide', activeJobCodeId] as const,
  classData: (activeJobCodeId: string) => ['classData', activeJobCodeId] as const,
  roomData: (activeJobCodeId: string) => ['roomData', activeJobCodeId] as const,
  education: (activeJobCodeId: string) => ['education', activeJobCodeId] as const,
};

/**
 * 캠프 탭의 모든 데이터를 프리페칭하는 커스텀 훅
 */
export function useCampDataPrefetch() {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const { setPreloadLinks, setIsPreloading, setWebViewPreloadComplete } = useCampTab();

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
        
        // 2. 업무 데이터
        prefetchTasksData(),
        
        // 3. 시간표 데이터
        prefetchScheduleData(jobCodeId),
        
        // 4. 인솔표 데이터
        prefetchGuideData(jobCodeId),
        
        // 5. 반명단 데이터
        prefetchClassData(jobCodeId),
        
        // 6. 방명단 데이터
        prefetchRoomData(jobCodeId),
        
        // 7. 교육 자료 데이터
        prefetchEducationData(jobCodeId),
      ]);

      // 8. WebView 프리로딩 시작
      await startWebViewPreloading(jobCodeId);

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

    // LessonScreen에서 사용하는 데이터 프리페칭
    const { getLessonMaterials, getLessonMaterialTemplates } = await import('../services/lessonMaterialService');
    const { getUserJobCodesInfo } = await import('../services/authService');

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
  };

  /**
   * 업무 데이터 프리페칭
   */
  const prefetchTasksData = async () => {
    if (!userData) return;

    try {
      // TasksScreen에서 사용하는 데이터가 있다면 여기서 프리페칭
      // 현재는 실시간 리스너를 사용하므로 프리페칭 불필요
      logger.info('  ✅ 업무 데이터 프리페칭 완료 (실시간 리스너 사용)');
    } catch (error) {
      logger.error('  ❌ 업무 데이터 프리페칭 실패', { error });
    }
  };

  /**
   * 시간표 데이터 프리페칭
   */
  const prefetchScheduleData = async (jobCodeId: string) => {
    try {
      // ScheduleScreen의 링크 목록 프리페칭
      const { generationResourcesService } = await import('../services');
      
      await queryClient.prefetchQuery({
        queryKey: campQueryKeys.schedule(jobCodeId),
        queryFn: async () => {
          const resources = await generationResourcesService.getResourcesByJobCodeId(jobCodeId);
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
      // GuideScreen의 링크 목록 프리페칭
      const { generationResourcesService } = await import('../services');
      
      await queryClient.prefetchQuery({
        queryKey: campQueryKeys.guide(jobCodeId),
        queryFn: async () => {
          const resources = await generationResourcesService.getResourcesByJobCodeId(jobCodeId);
          return resources?.guideLinks || [];
        },
      });
      
      logger.info('  ✅ 인솔표 데이터 프리페칭 완료');
    } catch (error) {
      logger.error('  ❌ 인솔표 데이터 프리페칭 실패', { error });
    }
  };

  /**
   * 반명단 데이터 프리페칭
   */
  const prefetchClassData = async (jobCodeId: string) => {
    try {
      const { stSheetService, jobCodesService } = await import('../services');
      
      // 1. jobCodeId로 캠프 코드 가져오기
      const jobCodes = await jobCodesService.getJobCodesByIds([jobCodeId]);
      if (jobCodes.length === 0 || !jobCodes[0].code) {
        logger.info('  ⚠️ 반명단: 캠프 코드 없음');
        return;
      }
      
      const campCode = jobCodes[0].code as import('@smis-mentor/shared').CampCode;
      
      // 2. ST시트 학생 데이터 프리페칭
      const students = await queryClient.fetchQuery({
        queryKey: ['students', campCode, 'class'],
        queryFn: () => stSheetService.getCachedData(campCode),
        staleTime: 5 * 60 * 1000, // 5분
      });
      
      logger.info(`  ✅ 반명단 데이터 프리페칭 완료 (${students.length}명)`);
    } catch (error) {
      logger.error('  ❌ 반명단 데이터 프리페칭 실패', { error });
      // 에러 발생해도 계속 진행 (빈 배열 반환)
    }
  };

  /**
   * 방명단 데이터 프리페칭
   */
  const prefetchRoomData = async (jobCodeId: string) => {
    try {
      const { stSheetService, jobCodesService } = await import('../services');
      
      // 1. jobCodeId로 캠프 코드 가져오기
      const jobCodes = await jobCodesService.getJobCodesByIds([jobCodeId]);
      if (jobCodes.length === 0 || !jobCodes[0].code) {
        logger.info('  ⚠️ 방명단: 캠프 코드 없음');
        return;
      }
      
      const campCode = jobCodes[0].code as import('@smis-mentor/shared').CampCode;
      
      // 2. ST시트 학생 데이터 프리페칭 (반명단과 동일한 데이터, 필터만 다름)
      const students = await queryClient.fetchQuery({
        queryKey: ['students', campCode, 'room'],
        queryFn: () => stSheetService.getCachedData(campCode),
        staleTime: 5 * 60 * 1000, // 5분
      });
      
      logger.info(`  ✅ 방명단 데이터 프리페칭 완료 (${students.length}명)`);
    } catch (error) {
      logger.error('  ❌ 방명단 데이터 프리페칭 실패', { error });
      // 에러 발생해도 계속 진행 (빈 배열 반환)
    }
  };

  /**
   * 교육 자료 데이터 프리페칭
   */
  const prefetchEducationData = async (jobCodeId: string) => {
    try {
      // EducationScreen의 링크 목록 프리페칭
      const { generationResourcesService } = await import('../services');
      
      await queryClient.prefetchQuery({
        queryKey: campQueryKeys.education(jobCodeId),
        queryFn: async () => {
          const resources = await generationResourcesService.getResourcesByJobCodeId(jobCodeId);
          return resources?.educationLinks || [];
        },
      });
      
      logger.info('  ✅ 교육 자료 데이터 프리페칭 완료');
    } catch (error) {
      logger.error('  ❌ 교육 자료 데이터 프리페칭 실패', { error });
    }
  };

  /**
   * WebView 프리로딩 완료 처리
   *
   * WebViewPreloader 컴포넌트는 현재 마운트되지 않으며,
   * 시트 WebView 백그라운드 로딩은 WebViewCacheContext의 hiddenWebView가 담당합니다.
   * (hiddenWebView: opacity 0.01, width/height 1 → 실제 네트워크 요청 발생)
   */
  const startWebViewPreloading = async (_jobCodeId: string) => {
    logger.info('✅ WebView 프리로딩 완료 (WebViewCacheContext에서 직접 처리)');
    setIsPreloading(false);
    setWebViewPreloadComplete(true);
  };

  /**
   * 캐시 무효화 (캠프 변경 시)
   */
  const invalidateCampData = async () => {
    logger.info('🗑️ 캠프 데이터 캐시 무효화');
    
    // WebView 프리로더 완전 초기화
    await setPreloadLinks([]);
    setIsPreloading(false);
    setWebViewPreloadComplete(false);
    
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['lessonMaterials'] }),
      queryClient.invalidateQueries({ queryKey: ['sections'] }),
      queryClient.invalidateQueries({ queryKey: ['jobCodesInfo'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['schedule'] }),
      queryClient.invalidateQueries({ queryKey: ['guide'] }),
      queryClient.invalidateQueries({ queryKey: ['classData'] }),
      queryClient.invalidateQueries({ queryKey: ['roomData'] }),
      queryClient.invalidateQueries({ queryKey: ['education'] }),
      queryClient.invalidateQueries({ queryKey: ['students'] }), // 반명단/방명단
    ]);
  };

  return {
    prefetchCampData,
    invalidateCampData,
  };
}
