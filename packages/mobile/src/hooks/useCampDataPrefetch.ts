import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useCampTab } from '../context/CampTabContext';
import { logger } from '@smis-mentor/shared';
import type { PreloadLink } from '../components/WebViewPreloader';

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
   * WebView 프리로딩 시작
   */
  const startWebViewPreloading = async (jobCodeId: string) => {
    try {
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.info('🌐 WebView 프리로딩 설정 시작');
      
      const { generationResourcesService } = await import('../services');
      const resources = await generationResourcesService.getResourcesByJobCodeId(jobCodeId);
      
      if (!resources) {
        logger.warn('⚠️ 리소스 없음 - WebView 프리로딩 스킵');
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        setIsPreloading(false);
        setWebViewPreloadComplete(true);
        return;
      }

      const allLinks: PreloadLink[] = [];

      // 교육 링크는 프리로드하지 않음 (구글 시트 없음)
      if (resources.educationLinks) {
        logger.info(`📚 교육 링크: ${resources.educationLinks.length}개 (프리로드 제외)`);
      }

      // 시간표 링크 추가 (구글 시트만)
      if (resources.scheduleLinks) {
        logger.info(`📅 시간표 링크: ${resources.scheduleLinks.length}개`);
        const googleSheetLinks = resources.scheduleLinks.filter(link => 
          link.url.includes('docs.google.com')
        );
        logger.info(`   → 구글 시트만 프리로드: ${googleSheetLinks.length}개`);
        googleSheetLinks.forEach((link, idx) => {
          logger.info(`   ${idx + 1}. ${link.title} - ${link.url}`);
          allLinks.push({
            id: `schedule-${link.id}`,
            title: link.title,
            url: link.url,
            type: 'schedule',
          });
        });
      }

      // 인솔표 링크 추가 (구글 시트만)
      if (resources.guideLinks) {
        logger.info(`🧭 인솔표 링크: ${resources.guideLinks.length}개`);
        const googleSheetLinks = resources.guideLinks.filter(link => 
          link.url.includes('docs.google.com')
        );
        logger.info(`   → 구글 시트만 프리로드: ${googleSheetLinks.length}개`);
        googleSheetLinks.forEach((link, idx) => {
          logger.info(`   ${idx + 1}. ${link.title} - ${link.url}`);
          allLinks.push({
            id: `guide-${link.id}`,
            title: link.title,
            url: link.url,
            type: 'guide',
          });
        });
      }

      // 수업 자료 섹션 링크 추가 (구글 시트만)
      if (userData?.userId && userData?.activeJobExperienceId) {
        logger.info(`📖 수업 자료 섹션 링크 수집 시작...`);
        
        try {
          const { getLessonMaterials, getLessonMaterialTemplates, getSections } = await import('../services/lessonMaterialService');
          const { getUserJobCodesInfo } = await import('../services/authService');
          
          // 1. 활성화된 jobCode 가져오기
          const activeJobCodes = await getUserJobCodesInfo([userData.activeJobExperienceId]);
          const activeCodesList = activeJobCodes.map(jc => jc.code);
          logger.info(`   활성 코드: ${activeCodesList.join(', ')}`);
          
          // 2. 템플릿 가져오기
          const allTemplates = await getLessonMaterialTemplates();
          
          // 3. 사용자 수업 자료 가져오기
          const materials = await getLessonMaterials(userData.userId);
          logger.info(`   수업 자료: ${materials.length}개`);
          
          // 4. 활성화된 코드에 해당하는 자료만 필터링
          const filteredMaterials = materials.filter(mat => {
            if (mat.templateId) {
              const template = allTemplates.find(t => t.id === mat.templateId);
              return template?.code && activeCodesList.includes(template.code);
            }
            return mat.userCode && activeCodesList.includes(mat.userCode);
          });
          
          logger.info(`   활성 자료: ${filteredMaterials.length}개`);
          
          // 5. 각 자료의 섹션에서 구글 시트 링크 수집
          let lessonLinkCount = 0;
          for (const material of filteredMaterials) {
            const sections = await getSections(material.id);
            
            // 유저 섹션의 viewUrl 확인
            for (const section of sections) {
              if (section.viewUrl?.includes('docs.google.com')) {
                lessonLinkCount++;
                logger.info(`   ${lessonLinkCount}. [${material.title}] ${section.title}`);
                allLinks.push({
                  id: `lesson-${section.id}`,
                  title: `${material.title} - ${section.title}`,
                  url: section.viewUrl,
                  type: 'lesson',
                });
              }
            }
            
            // 템플릿 섹션의 links도 확인
            const template = material.templateId 
              ? allTemplates.find(t => t.id === material.templateId)
              : null;
            
            if (template?.sections) {
              for (const templateSection of template.sections) {
                if (templateSection.links) {
                  for (const link of templateSection.links) {
                    if (link.url.includes('docs.google.com')) {
                      lessonLinkCount++;
                      logger.info(`   ${lessonLinkCount}. [${material.title}] ${templateSection.title} - ${link.label}`);
                      allLinks.push({
                        id: `lesson-template-${templateSection.id}-${link.label}`,
                        title: `${material.title} - ${templateSection.title} - ${link.label}`,
                        url: link.url,
                        type: 'lesson',
                      });
                    }
                  }
                }
              }
            }
          }
          
          logger.info(`   → 구글 시트만 프리로드: ${lessonLinkCount}개`);
        } catch (error) {
          logger.error('❌ 수업 자료 섹션 링크 수집 실패:', error);
        }
      }

      logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      logger.info(`📊 총 ${allLinks.length}개 WebView 프리로드 시작 (구글 시트만)`);
      logger.info(`   - 시간표: ${resources.scheduleLinks?.filter(l => l.url.includes('docs.google.com')).length || 0}개`);
      logger.info(`   - 인솔표: ${resources.guideLinks?.filter(l => l.url.includes('docs.google.com')).length || 0}개`);
      logger.info(`   - 수업: ${allLinks.filter(l => l.type === 'lesson').length}개`);


      // 링크가 없으면 프리로딩 스킵
      if (allLinks.length === 0) {
        logger.info('⚠️ 프리로드할 링크 없음');
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        setIsPreloading(false);
        setWebViewPreloadComplete(true);
        return;
      }

      // 프리로드 링크 설정 및 프리로딩 시작
      logger.info(`🎯 setPreloadLinks 호출: ${allLinks.length}개 링크`);
      await setPreloadLinks(allLinks);
      
      logger.info(`🎯 setIsPreloading(true) 호출`);
      setIsPreloading(true);

      logger.info('✅ WebView 프리로딩 대기열 설정 완료');
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (error) {
      logger.error('❌ WebView 프리로딩 설정 실패:', error);
      setIsPreloading(false);
      setWebViewPreloadComplete(true);
    }
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
