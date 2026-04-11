import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { logger } from '@smis-mentor/shared';

/**
 * 채용 데이터 프리페칭을 위한 query key 생성
 */
export const recruitmentQueryKeys = {
  jobBoards: () => ['jobBoards'] as const,
  applications: (userId: string) => ['applications', userId] as const,
  reviews: () => ['reviews'] as const,
};

/**
 * 채용 탭의 모든 데이터를 프리페칭하는 커스텀 훅
 */
export function useRecruitmentDataPrefetch() {
  const queryClient = useQueryClient();
  const { userData } = useAuth();

  /**
   * 채용 관련 모든 데이터를 프리페칭
   */
  const prefetchRecruitmentData = async () => {
    if (!userData) {
      logger.warn('useRecruitmentDataPrefetch: userData가 없음');
      return;
    }

    // 원어민은 채용 탭 접근 불가
    if (userData.role === 'foreign' || userData.role === 'foreign_temp') {
      logger.info('⏭️  원어민 사용자 - 채용 데이터 프리페칭 스킵');
      return;
    }

    logger.info('🚀 채용 데이터 프리페칭 시작', { userId: userData.userId });

    try {
      // 병렬로 모든 데이터 프리페칭
      await Promise.all([
        // 1. 채용 공고 목록
        prefetchJobBoards(),
        
        // 2. 지원 내역 (비관리자만)
        userData.role !== 'admin' ? prefetchApplications() : Promise.resolve(),
        
        // 3. 멘토 후기
        prefetchReviews(),
      ]);

      logger.info('✅ 채용 데이터 프리페칭 완료');
    } catch (error) {
      logger.error('❌ 채용 데이터 프리페칭 실패', { error });
      throw error;
    }
  };

  /**
   * 채용 공고 목록 프리페칭
   */
  const prefetchJobBoards = async () => {
    try {
      const { getAllJobBoards } = await import('../services/jobBoardService');
      
      await queryClient.prefetchQuery({
        queryKey: recruitmentQueryKeys.jobBoards(),
        queryFn: getAllJobBoards,
        staleTime: 5 * 60 * 1000, // 5분
      });
      
      logger.info('  ✅ 채용 공고 목록 프리페칭 완료');
    } catch (error) {
      logger.error('  ❌ 채용 공고 목록 프리페칭 실패', { error });
    }
  };

  /**
   * 지원 내역 프리페칭
   */
  const prefetchApplications = async () => {
    if (!userData) return;

    try {
      const { getApplicationsByUserId } = await import('../services/recruitmentService');
      
      await queryClient.prefetchQuery({
        queryKey: recruitmentQueryKeys.applications(userData.userId),
        queryFn: () => getApplicationsByUserId(userData.userId),
        staleTime: 2 * 60 * 1000, // 2분
      });
      
      logger.info('  ✅ 지원 내역 프리페칭 완료');
    } catch (error) {
      logger.error('  ❌ 지원 내역 프리페칭 실패', { error });
    }
  };

  /**
   * 멘토 후기 프리페칭
   */
  const prefetchReviews = async () => {
    try {
      const { getAllReviews } = await import('../services/recruitmentService');
      
      await queryClient.prefetchQuery({
        queryKey: recruitmentQueryKeys.reviews(),
        queryFn: getAllReviews,
        staleTime: 10 * 60 * 1000, // 10분
      });
      
      logger.info('  ✅ 멘토 후기 프리페칭 완료');
    } catch (error) {
      logger.error('  ❌ 멘토 후기 프리페칭 실패', { error });
    }
  };

  /**
   * 캐시 무효화 (필요 시)
   */
  const invalidateRecruitmentData = async () => {
    logger.info('🗑️ 채용 데이터 캐시 무효화');
    
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['jobBoards'] }),
      queryClient.invalidateQueries({ queryKey: ['applications'] }),
      queryClient.invalidateQueries({ queryKey: ['reviews'] }),
    ]);
  };

  return {
    prefetchRecruitmentData,
    invalidateRecruitmentData,
  };
}
