/**
 * 캠프 생활 평가 기준 업데이트 스크립트
 * 
 * 사용법:
 * 브라우저 콘솔에서 실행:
 * window.updateCampLifeCriteria()
 */

import { db } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc,
  Timestamp 
} from 'firebase/firestore';

export const updateCampLifeCriteria = async () => {
  try {
    console.log('🔄 캠프 생활 평가 기준 업데이트를 시작합니다...');
    
    // 캠프 생활 평가 기준 조회
    const q = query(
      collection(db, 'evaluationCriteria'),
      where('stage', '==', '캠프 생활'),
      where('isDefault', '==', true)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log('❌ 캠프 생활 평가 기준을 찾을 수 없습니다.');
      return {
        success: false,
        message: '캠프 생활 평가 기준을 찾을 수 없습니다.'
      };
    }
    
    // 첫 번째 문서 업데이트
    const criteriaDoc = snapshot.docs[0];
    const criteriaId = criteriaDoc.id;
    
    console.log(`📝 문서 ID: ${criteriaId} 업데이트 중...`);
    
    // 새로운 평가 항목
    const newCriteria = [
      {
        id: 'mentor_manager_collaboration',
        name: '멘토&매니저 협업',
        description: '멘토 간 협업 및 매니저와의 원활한 소통 및 협력',
        maxScore: 10,
        order: 1
      },
      {
        id: 'student_management',
        name: '학생 생활 관리',
        description: '학생들의 생활 관리 및 지도 능력',
        maxScore: 10,
        order: 2
      },
      {
        id: 'responsibility',
        name: '책임감',
        description: '맡은 역할에 대한 책임감 및 성실성',
        maxScore: 10,
        order: 3
      },
      {
        id: 'popularity',
        name: '인기도',
        description: '학생들이 이 멘토를 얼마나 좋아하고 따르는지',
        maxScore: 10,
        order: 4
      }
    ];
    
    // 문서 업데이트
    await updateDoc(doc(db, 'evaluationCriteria', criteriaId), {
      criteria: newCriteria,
      updatedAt: Timestamp.now()
    });
    
    console.log('✅ 캠프 생활 평가 기준이 성공적으로 업데이트되었습니다!');
    console.log('📋 새로운 평가 항목:');
    newCriteria.forEach(item => {
      console.log(`  ${item.order}. ${item.name} - ${item.description}`);
    });
    
    return {
      success: true,
      message: '캠프 생활 평가 기준이 성공적으로 업데이트되었습니다.',
      criteriaId,
      newCriteria
    };
  } catch (error) {
    console.error('❌ 평가 기준 업데이트 중 오류 발생:', error);
    return {
      success: false,
      message: '평가 기준 업데이트에 실패했습니다.',
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    };
  }
};

// 브라우저 환경에서 직접 실행할 수 있도록 전역으로 노출
if (typeof window !== 'undefined') {
  (window as any).updateCampLifeCriteria = updateCampLifeCriteria;
}
