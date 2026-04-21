// 사용자 관리 서비스 (모바일/웹 공용)
import { doc, getDoc, updateDoc, Timestamp, Firestore } from 'firebase/firestore';
import { Auth, User as FirebaseUser, deleteUser } from 'firebase/auth';
import { logger } from '../utils/logger';

export interface User {
  userId: string;
  name: string;
  email: string;
  status: 'active' | 'inactive' | 'temp' | 'deleted';
  originalEmail?: string;
  updatedAt?: Timestamp;
}

/**
 * 사용자 계정을 비활성화 (회원 탈퇴) - 모바일용
 */
export const deactivateUserMobile = async (userId: string, db: Firestore, auth: Auth): Promise<void> => {
  try {
    logger.info('📤 회원 탈퇴 시작:', userId);
    
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }
    
    const userData = userDoc.data() as User;
    const now = Timestamp.now();
    
    // Firestore 사용자 정보 업데이트 (소프트 삭제)
    await updateDoc(userRef, {
      status: 'inactive',
      name: `(탈퇴)${userData.name}`,
      originalEmail: userData.email, // 원본 이메일 저장
      deactivatedAt: now, // 탈퇴 일시 기록
      updatedAt: now
    });
    
    logger.info('✅ Firestore 사용자 정보 업데이트 완료');
    
    // 현재 로그인된 사용자가 탈퇴하려는 사용자인 경우 Authentication 계정 삭제
    if (auth.currentUser && auth.currentUser.email === userData.email) {
      try {
        await deleteUser(auth.currentUser);
        logger.info('✅ Firebase Authentication 계정 삭제 완료');
      } catch (authError: any) {
        logger.error('❌ Firebase Authentication 계정 삭제 실패:', authError);
        
        // 재인증이 필요한 경우 에러를 다시 throw
        if (authError?.code === 'auth/requires-recent-login') {
          throw new Error('보안을 위해 재로그인이 필요합니다. 다시 로그인 후 탈퇴를 진행해주세요.');
        }
        
        // 다른 Authentication 오류는 무시하고 Firestore 업데이트는 성공으로 처리
        logger.warn('⚠️ Authentication 계정 삭제에 실패했지만 Firestore 업데이트는 성공');
      }
    }
    
    logger.info('✅ 회원 탈퇴 처리 완료:', userData.email);
  } catch (error) {
    logger.error('❌ 회원 탈퇴 처리 실패:', error);
    throw error;
  }
};

/**
 * 계정 복구 (탈퇴 취소)
 */
export const restoreUser = async (userId: string, db: Firestore): Promise<void> => {
  try {
    logger.info('🔄 계정 복구 시작:', userId);
    
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }
    
    const userData = userDoc.data() as any;
    const originalName = userData.originalName || userData.name.replace(/^\(탈퇴\)\s*/, '');
    const now = Timestamp.now();
    
    await updateDoc(userRef, {
      status: 'active',
      name: originalName,
      updatedAt: now
    });
    
    logger.info('✅ 계정 복구 완료:', userData.email);
  } catch (error) {
    logger.error('❌ 계정 복구 실패:', error);
    throw error;
  }
};