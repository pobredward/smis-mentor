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

