import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { logger } from '@smis-mentor/shared';
import type { User } from '@smis-mentor/shared';

/**
 * 특정 캠프 코드(generation + code)에 속한 모든 사용자 조회
 */
export async function getUsersByJobCode(
  generation: string,
  code: string
): Promise<User[]> {
  try {
    logger.info(`모바일 - getUsersByJobCode 시작: generation=${generation}, code=${code}`);
    
    // 1. jobCodes에서 generation + code로 Firestore 문서 ID 찾기
    const jobCodesRef = collection(db, 'jobCodes');
    const jobCodeQuery = query(
      jobCodesRef,
      where('generation', '==', generation),
      where('code', '==', code)
    );
    const jobCodeSnapshot = await getDocs(jobCodeQuery);

    if (jobCodeSnapshot.empty) {
      logger.warn(`모바일 - 캠프 코드 ${generation}-${code}를 찾을 수 없습니다.`);
      return [];
    }

    const jobCodeId = jobCodeSnapshot.docs[0].id;
    logger.info(`모바일 - jobCode 문서 ID 찾음: ${jobCodeId}`);

    // 2. users에서 jobExperiences에 해당 jobCodeId를 포함하는 사용자 조회
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);

    logger.info(`모바일 - 전체 사용자 수: ${usersSnapshot.size}`);

    const users: User[] = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data() as User;
      
      // jobExperiences가 있는지 확인
      if (userData.jobExperiences) {
        const hasJobCode = userData.jobExperiences.some(exp => exp.id === jobCodeId);
        
        if (hasJobCode) {
          logger.info(`모바일 - 매칭된 사용자: ${userData.name} (${doc.id})`);
          users.push({
            ...userData,
            userId: doc.id,
          });
        }
      }
    });

    logger.info(`모바일 - 캠프 ${generation}-${code}에 속한 사용자 ${users.length}명 조회 완료`);
    return users;
  } catch (error) {
    logger.error('모바일 - getUsersByJobCode 오류:', error);
    throw error;
  }
}
