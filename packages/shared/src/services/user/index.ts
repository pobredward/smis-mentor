import {
  collection,
  doc,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  Firestore,
} from 'firebase/firestore';
import { User } from '../../types/legacy';
import { logger } from '../../utils/logger';
import { NotFoundError, DatabaseError } from '../../errors';

// ==================== User 관련 서비스 ====================

export const createUser = async (db: Firestore, userData: Omit<User, 'userId' | 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  try {
    const now = Timestamp.now();
    const docRef = await addDoc(collection(db, 'users'), {
      ...userData,
      createdAt: now,
      updatedAt: now,
    });
    await updateDoc(doc(db, 'users', docRef.id), { userId: docRef.id, id: docRef.id });
    logger.info('사용자 생성 완료:', docRef.id);
    return docRef.id;
  } catch (error) {
    logger.error('사용자 생성 실패:', error);
    throw new DatabaseError('사용자 생성에 실패했습니다', error);
  }
};

export const getUserById = async (db: Firestore, userId: string): Promise<User | null> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return null;
    
    const userData = userDoc.data() as User;
    
    // id 필드가 없는 경우 자동으로 추가 (오래된 데이터 마이그레이션)
    if (!userData.id) {
      logger.warn(`사용자 ${userId}에 id 필드가 없습니다. 자동으로 추가합니다.`);
      await updateDoc(doc(db, 'users', userId), { id: userId });
      return { ...userData, id: userId };
    }
    
    return userData;
  } catch (error) {
    logger.error('사용자 정보 가져오기 실패:', error);
    throw new DatabaseError('사용자 정보를 가져올 수 없습니다', error);
  }
};

export const getUserByEmail = async (db: Firestore, email: string): Promise<User | null> => {
  try {
    const q = query(collection(db, 'users'), where('email', '==', email));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;
    
    // deleted 상태가 아닌 사용자만 필터링
    const activeUsers = querySnapshot.docs.filter(doc => {
      const status = (doc.data() as User).status;
      return status !== 'deleted';
    });
    
    // deleted만 있거나 사용자가 없는 경우
    if (activeUsers.length === 0) {
      logger.info('삭제된 사용자만 존재 - null 반환', { email });
      return null;
    }
    
    // 여러 사용자가 있는 경우 우선순위: active > temp > inactive
    if (activeUsers.length > 1) {
      logger.warn('동일한 이메일로 여러 사용자 발견 (deleted 제외)', {
        email,
        count: activeUsers.length,
      });
      
      const activeUser = activeUsers.find(doc => (doc.data() as User).status === 'active');
      if (activeUser) {
        const userData = activeUser.data() as User;
        const userId = activeUser.id;
        if (!userData.id) {
          await updateDoc(doc(db, 'users', userId), { id: userId });
          return { ...userData, id: userId };
        }
        return userData;
      }
      
      const tempUser = activeUsers.find(doc => (doc.data() as User).status === 'temp');
      if (tempUser) {
        const userData = tempUser.data() as User;
        const userId = tempUser.id;
        if (!userData.id) {
          await updateDoc(doc(db, 'users', userId), { id: userId });
          return { ...userData, id: userId };
        }
        return userData;
      }
    }
    
    const userDoc = activeUsers[0];
    const userData = userDoc.data() as User;
    const userId = userDoc.id;
    
    // id 필드가 없는 경우 자동으로 추가
    if (!userData.id) {
      logger.warn(`사용자 ${userId}에 id 필드가 없습니다. 자동으로 추가합니다.`);
      await updateDoc(doc(db, 'users', userId), { id: userId });
      return { ...userData, id: userId };
    }
    
    return userData;
  } catch (error) {
    logger.error('이메일로 사용자 조회 실패:', error);
    throw new DatabaseError('사용자 조회에 실패했습니다', error);
  }
};

export const getUserByPhone = async (
  db: Firestore,
  phoneNumber: string
): Promise<User | null> => {
  try {
    const q = query(collection(db, 'users'), where('phoneNumber', '==', phoneNumber));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;
    
    // deleted 상태가 아닌 사용자만 필터링
    const activeUsers = querySnapshot.docs.filter(doc => {
      const status = (doc.data() as User).status;
      return status !== 'deleted';
    });
    
    // deleted만 있거나 사용자가 없는 경우
    if (activeUsers.length === 0) {
      logger.info('삭제된 사용자만 존재 - null 반환', { phoneNumber });
      return null;
    }
    
    // 여러 사용자가 있는 경우 우선순위: active > temp > inactive
    if (activeUsers.length > 1) {
      logger.warn('동일한 전화번호로 여러 사용자 발견 (deleted 제외)', {
        phoneNumber,
        count: activeUsers.length,
      });
      
      const activeUser = activeUsers.find(doc => (doc.data() as User).status === 'active');
      if (activeUser) {
        const userData = activeUser.data() as User;
        const userId = activeUser.id;
        if (!userData.id) {
          await updateDoc(doc(db, 'users', userId), { id: userId });
          return { ...userData, id: userId };
        }
        return userData;
      }
      
      const tempUser = activeUsers.find(doc => (doc.data() as User).status === 'temp');
      if (tempUser) {
        const userData = tempUser.data() as User;
        const userId = tempUser.id;
        if (!userData.id) {
          await updateDoc(doc(db, 'users', userId), { id: userId });
          return { ...userData, id: userId };
        }
        return userData;
      }
    }
    
    const userDoc = activeUsers[0];
    const userData = userDoc.data() as User;
    const userId = userDoc.id;
    
    // id 필드가 없는 경우 자동으로 추가
    if (!userData.id) {
      logger.warn(`사용자 ${userId}에 id 필드가 없습니다. 자동으로 추가합니다.`);
      await updateDoc(doc(db, 'users', userId), { id: userId });
      return { ...userData, id: userId };
    }
    
    return userData;
  } catch (error) {
    logger.error('전화번호로 사용자 조회 실패:', error);
    throw new DatabaseError('사용자 조회에 실패했습니다', error);
  }
};

export const updateUser = async (
  db: Firestore,
  userId: string,
  updates: Partial<User>
): Promise<void> => {
  try {
    const now = Timestamp.now();
    const userRef = doc(db, 'users', userId);

    await updateDoc(userRef, {
      ...updates,
      updatedAt: now,
    });
    logger.info('사용자 정보 업데이트 완료:', userId);
  } catch (error) {
    logger.error('사용자 업데이트 실패:', error);
    throw new DatabaseError('사용자 정보 업데이트에 실패했습니다', error);
  }
};

export const deactivateUser = async (db: Firestore, userId: string): Promise<boolean> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      throw new NotFoundError('사용자', userId);
    }

    const userData = userDoc.data() as User;
    const now = Timestamp.now();

    await updateDoc(userRef, {
      status: 'inactive',
      name: `(탈퇴)${userData.name}`,
      originalEmail: userData.email,
      updatedAt: now,
    });

    logger.info('사용자 비활성화 완료:', userId);
    return true;
  } catch (error) {
    logger.error('사용자 비활성화 실패:', error);
    throw new DatabaseError('사용자 비활성화에 실패했습니다', error);
  }
};

export const deleteUser = async (db: Firestore, userId: string): Promise<boolean> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      throw new NotFoundError('사용자', userId);
    }

    await deleteDoc(userRef);
    logger.info('사용자 삭제 완료:', userId);
    return true;
  } catch (error) {
    logger.error('사용자 삭제 실패:', error);
    throw new DatabaseError('사용자 삭제에 실패했습니다', error);
  }
};

export const getAllUsers = async (db: Firestore): Promise<User[]> => {
  try {
    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersRef);

    const users: User[] = [];
    const updatePromises: Promise<void>[] = [];
    
    querySnapshot.forEach((docSnapshot) => {
      const userData = docSnapshot.data() as User;
      const userId = docSnapshot.id;
      
      // id 필드가 없는 경우 자동으로 추가
      if (!userData.id) {
        logger.warn(`사용자 ${userId}에 id 필드가 없습니다. 자동으로 추가합니다.`);
        updatePromises.push(updateDoc(doc(db, 'users', userId), { id: userId }));
        users.push({ ...userData, id: userId });
      } else {
        users.push(userData);
      }
    });
    
    // 모든 업데이트를 병렬로 실행
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    logger.info(`전체 사용자 조회 완료: ${users.length}명`);
    return users;
  } catch (error) {
    logger.error('모든 사용자 조회 실패:', error);
    throw new DatabaseError('사용자 목록 조회에 실패했습니다', error);
  }
};

interface JobExperience {
  id: string;
  group?: string;
  groupRole?: string;
  classCode?: string;
}

export const getUsersByJobCode = async (
  db: Firestore,
  generation: string,
  code: string
): Promise<User[]> => {
  try {
    const users: User[] = [];

    // jobCodes 컬렉션에서 해당 코드와 세대에 맞는 문서 ID 찾기
    const jobCodesRef = collection(db, 'jobCodes');
    const codeQuery = query(
      jobCodesRef,
      where('generation', '==', generation),
      where('code', '==', code)
    );

    const jobCodeSnapshot = await getDocs(codeQuery);

    if (jobCodeSnapshot.empty) {
      return users;
    }

    const jobCodeId = jobCodeSnapshot.docs[0].id;

    // 해당 jobCodeId를 jobExperiences 배열의 id 필드에 포함하는 사용자 조회
    const usersRef = collection(db, 'users');
    const userSnapshot = await getDocs(usersRef);
    
    const updatePromises: Promise<void>[] = [];

    userSnapshot.forEach((docSnapshot) => {
      const userData = docSnapshot.data() as User;
      const userId = docSnapshot.id;
      
      if (
        userData.jobExperiences &&
        userData.jobExperiences.some((exp: JobExperience) => exp.id === jobCodeId)
      ) {
        // id 필드가 없는 경우 자동으로 추가
        if (!userData.id) {
          logger.warn(`사용자 ${userId}에 id 필드가 없습니다. 자동으로 추가합니다.`);
          updatePromises.push(updateDoc(doc(db, 'users', userId), { id: userId }));
          users.push({ ...userData, id: userId });
        } else {
          users.push(userData);
        }
      }
    });
    
    // 모든 업데이트를 병렬로 실행
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    logger.info(`직무 코드별 사용자 조회 완료: ${users.length}명`);
    return users;
  } catch (error) {
    logger.error('직무 코드별 사용자 조회 실패:', error);
    throw new DatabaseError('사용자 조회에 실패했습니다', error);
  }
};
