/**
import { logger } from '@smis-mentor/shared';
 * 평가 기준 초기화 스크립트
 * 
 * 사용법:
 * 1. Firebase Console에서 직접 실행
 * 2. 또는 관리자 페이지에서 버튼을 통해 실행
 */

import { EvaluationCriteriaService } from '@smis-mentor/shared';
import { db } from '@/lib/firebase';

export const initializeDefaultEvaluationCriteria = async () => {
  try {
    logger.info('기본 평가 기준 생성을 시작합니다...');
    
    await EvaluationCriteriaService.createDefaultCriteria(db);
    
    logger.info('기본 평가 기준이 성공적으로 생성되었습니다.');
    
    // 생성된 기준 확인
    const documentCriteria = await EvaluationCriteriaService.getDefaultCriteria(db, '서류 전형');
    const interviewCriteria = await EvaluationCriteriaService.getDefaultCriteria(db, '면접 전형');
    const educationCriteria = await EvaluationCriteriaService.getDefaultCriteria(db, '대면 교육');
    const campCriteria = await EvaluationCriteriaService.getDefaultCriteria(db, '캠프 생활');
    
    logger.info('생성된 평가 기준:');
    logger.info('- 서류 전형:', documentCriteria?.name);
    logger.info('- 면접 전형:', interviewCriteria?.name);
    logger.info('- 대면 교육:', educationCriteria?.name);
    logger.info('- 캠프 생활:', campCriteria?.name);
    
    return {
      success: true,
      message: '기본 평가 기준이 성공적으로 생성되었습니다.',
      criteria: {
        documentReview: documentCriteria,
        interview: interviewCriteria,
        faceToFaceEducation: educationCriteria,
        campLife: campCriteria
      }
    };
  } catch (error) {
    logger.error('기본 평가 기준 생성 중 오류 발생:', error);
    
    return {
      success: false,
      message: '기본 평가 기준 생성에 실패했습니다.',
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    };
  }
};

// 브라우저 환경에서 직접 실행할 수 있도록 전역으로 노출
if (typeof window !== 'undefined') {
  (window as any).initializeDefaultEvaluationCriteria = initializeDefaultEvaluationCriteria;
}
