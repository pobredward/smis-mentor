import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { logger } from '@smis-mentor/shared';
import type { User } from '@smis-mentor/shared';

/**
 * jobCodeId(Firestore 문서 ID)로 해당 캠프에 속한 사용자 조회.
 * User 문서의 jobCodeIds 배열에 array-contains 쿼리를 사용해 서버에서 필터링.
 * 마이그레이션 완료 후 O(캠프 인원)으로 동작 — 유저 수가 늘어도 속도 유지.
 */
export async function getUsersByJobCodeId(jobCodeId: string): Promise<User[]> {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('jobCodeIds', 'array-contains', jobCodeId));
    const usersSnapshot = await getDocs(q);

    const users: User[] = usersSnapshot.docs.map(doc => ({
      ...(doc.data() as User),
      userId: doc.id,
    }));

    logger.info(`모바일 - 조회된 캠프 사용자 수: ${users.length}`);
    return users;
  } catch (error) {
    logger.error('모바일 - getUsersByJobCodeId 오류:', error);
    throw error;
  }
}

/**
 * 특정 캠프 코드(generation + code)에 속한 모든 사용자 조회
 * @deprecated jobCodeId를 이미 알고 있다면 getUsersByJobCodeId를 사용하세요
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

    return getUsersByJobCodeId(jobCodeSnapshot.docs[0].id);
  } catch (error) {
    logger.error('모바일 - getUsersByJobCode 오류:', error);
    throw error;
  }
}
