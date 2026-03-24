import {
  GoogleAuthProvider,
  signInWithCredential,
  linkWithCredential,
  unlink,
  OAuthProvider,
} from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import type {
  SocialUserData,
  SocialLoginResult,
  TempAccountMatchResult,
  AuthProvider,
  SocialProvider,
} from '../types/auth';

/**
 * 소셜 로그인 메인 플로우
 * 이메일로 기존 계정 확인 후 적절한 액션 반환
 */
export async function handleSocialLogin(
  socialData: SocialUserData,
  getUserByEmail: (email: string) => Promise<any | null>
): Promise<SocialLoginResult> {
  try {
    console.log('🔍 소셜 로그인 처리 시작:', socialData.email);
    
    // 1. 이메일로 기존 계정 확인
    const existingUser = await getUserByEmail(socialData.email);

    if (existingUser) {
      console.log('📧 기존 계정 발견:', {
        status: existingUser.status,
        role: existingUser.role,
        authProviders: existingUser.authProviders,
      });
      
      // 탈퇴/삭제된 계정 처리
      if (existingUser.status === 'inactive' || existingUser.status === 'deleted') {
        console.log('⚠️ 탈퇴/삭제된 계정:', existingUser.status);
        throw new Error(`ACCOUNT_${existingUser.status.toUpperCase()}`);
      }
      
      if (existingUser.status === 'active') {
        // authProviders 확인 - 이미 해당 소셜 계정이 연동되어 있는지 체크
        const hasProviderLinked = existingUser.authProviders?.some(
          (p: AuthProvider) => {
            // providerId 정규화 비교 (naver.com과 naver 모두 허용)
            const normalizedStoredId = p.providerId.replace('.com', '');
            const normalizedSocialId = socialData.providerId.replace('.com', '');
            return normalizedStoredId === normalizedSocialId;
          }
        );
        
        if (hasProviderLinked) {
          // 이미 해당 소셜 계정이 연동됨 → 바로 로그인
          console.log(`✅ 이미 ${socialData.providerId} 계정이 연동된 사용자`);
          return {
            action: 'LOGIN',
            user: existingUser,
            socialData,
          };
        } else {
          // 해당 소셜 계정이 연동 안됨 → 비밀번호 입력 필요
          console.log(`🔗 ${socialData.providerId} 연동이 필요한 기존 계정`);
          return {
            action: 'LINK_ACTIVE',
            user: existingUser,
            socialData,
          };
        }
      }
      
      // temp 계정은 이메일이 없으므로 이 함수에서 절대 발견될 수 없음
      // temp 계정은 전화번호 입력 후 checkTempAccountByPhone에서 처리됨
      // 만약 temp 계정에 이메일이 있다면 데이터 무결성 문제임
      console.error('⚠️ [데이터 무결성 오류] Temp 계정에 이메일이 있음:', existingUser);
      throw new Error('계정 상태가 비정상적입니다. 관리자에게 문의하세요.');
    }

    // 2. 이메일로 계정 없음 → 전화번호 입력 필요
    console.log('📱 신규 사용자 - 전화번호 입력 필요');
    return {
      action: 'NEED_PHONE',
      socialData,
      requiresPhone: true,
    };
  } catch (error) {
    console.error('소셜 로그인 처리 중 오류:', error);
    throw error;
  }
}

/**
 * 전화번호로 temp 계정 확인
 */
export async function checkTempAccountByPhone(
  phone: string,
  socialData: SocialUserData,
  getUserByPhone: (phone: string) => Promise<any | null>,
  getUserJobCodesInfo?: (jobExperiences: string[]) => Promise<Array<{
    generation: string;
    code: string;
    name: string;
  }>>
): Promise<TempAccountMatchResult> {
  try {
    console.log('📱 전화번호로 계정 확인:', phone);
    const user = await getUserByPhone(phone);

    if (!user) {
      console.log('❌ 전화번호로 사용자를 찾을 수 없음');
      return { found: false };
    }

    console.log('👤 사용자 발견:', {
      name: user.name,
      email: user.email,
      status: user.status,
      role: user.role,
    });
    
    // inactive/deleted 계정 처리
    if (user.status === 'inactive' || user.status === 'deleted') {
      console.log('⚠️ 탈퇴/삭제된 계정:', user.status);
      throw new Error(`ACCOUNT_${user.status.toUpperCase()}`);
    }

    if (user.status === 'active') {
      // active 계정 발견
      // 이메일이 다른 경우: 소셜 계정 연동이 필요함
      if (user.email && user.email !== socialData.email) {
        console.log('🔗 다른 이메일의 active 계정 - 연동 필요');
        
        // 이름도 확인하여 본인 계정인지 검증
        const nameMatches = user.name === socialData.name;
        if (!nameMatches) {
          console.warn('⚠️ 이름이 일치하지 않음:', {
            dbName: user.name,
            inputName: socialData.name,
          });
        }
        
        return {
          found: true,
          user,
          isActive: true,
          needsLink: true,
          nameMatches,
        };
      }
      
      // 이메일이 같은 경우: 이미 등록된 계정
      console.error('⚠️ 동일한 이메일로 이미 활성화된 계정입니다');
      throw new Error('ALREADY_REGISTERED');
    }

    // temp 계정 발견
    const nameMatches = user.name === socialData.name;
    console.log('🔍 이름 일치 여부:', {
      dbName: user.name,
      socialName: socialData.name,
      matches: nameMatches,
    });
    
    let jobCodes;
    if (getUserJobCodesInfo && user.jobExperiences?.length > 0) {
      try {
        jobCodes = await getUserJobCodesInfo(user.jobExperiences);
        console.log('💼 직무 코드 정보:', jobCodes);
      } catch (error) {
        console.error('직무 코드 정보 조회 실패:', error);
      }
    }

    return {
      found: true,
      user,
      nameMatches,
      jobCodes,
    };
  } catch (error) {
    if ((error as Error).message === 'ALREADY_REGISTERED' || 
        (error as Error).message === 'ACCOUNT_INACTIVE' || 
        (error as Error).message === 'ACCOUNT_DELETED') {
      throw error;
    }
    console.error('전화번호로 계정 확인 중 오류:', error);
    throw error;
  }
}

/**
 * temp 계정을 소셜 계정으로 활성화
 */
export async function activateTempAccountWithSocial(
  tempUserId: string,
  socialData: SocialUserData,
  additionalData: Record<string, any>,
  updateUser: (userId: string, data: any) => Promise<void>
): Promise<void> {
  try {
    await updateUser(tempUserId, {
      email: socialData.email,
      profileImage: socialData.photoURL,
      status: 'active',
      authProviders: [
        {
          providerId: socialData.providerId,
          uid: socialData.providerUid,
          email: socialData.email,
          linkedAt: Timestamp.now(),
          displayName: socialData.name,
          photoURL: socialData.photoURL,
        },
      ],
      primaryAuthMethod: 'social',
      ...additionalData,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('temp 계정 활성화 중 오류:', error);
    throw error;
  }
}

/**
 * 기존 active 계정에 소셜 제공자 연동
 * FieldValue.arrayUnion 사용으로 동시성 문제 방지
 */
export async function linkSocialProvider(
  userId: string,
  socialData: SocialUserData,
  getUserById: (userId: string) => Promise<any | null>,
  updateUser: (userId: string, data: any) => Promise<void>,
  arrayUnion?: (elements: any[]) => any // Firestore FieldValue.arrayUnion
): Promise<void> {
  try {
    const user = await getUserById(userId);
    
    if (!user) {
      throw new Error('사용자를 찾을 수 없습니다');
    }

    const existingProviders = user.authProviders || [];

    // 이미 연동된 제공자인지 확인 (providerId 정규화 비교)
    const normalizedSocialId = socialData.providerId.replace('.com', '');
    const alreadyLinked = existingProviders.some(
      (p: AuthProvider) => {
        const normalizedStoredId = p.providerId.replace('.com', '');
        return normalizedStoredId === normalizedSocialId;
      }
    );

    if (alreadyLinked) {
      console.log('⚠️ 이미 연동된 제공자:', socialData.providerId);
      return;
    }

    const newProvider: AuthProvider = {
      providerId: socialData.providerId,
      uid: socialData.providerUid,
      email: socialData.email,
      linkedAt: Timestamp.now(),
      displayName: socialData.name,
      photoURL: socialData.photoURL,
    };

    // ✅ arrayUnion을 사용하면 동시성 문제 해결 (Firestore 서버에서 원자적 연산)
    if (arrayUnion) {
      console.log('✅ arrayUnion 사용 (동시성 안전)');
      await updateUser(userId, {
        authProviders: arrayUnion([newProvider]),
        updatedAt: Timestamp.now(),
      });
    } else {
      // arrayUnion 없으면 기존 방식 (GET → UPDATE)
      console.log('⚠️ 기존 방식 사용 (동시성 취약)');
      await updateUser(userId, {
        authProviders: [
          ...existingProviders,
          newProvider,
        ],
        updatedAt: Timestamp.now(),
      });
    }
  } catch (error) {
    console.error('소셜 제공자 연동 중 오류:', error);
    throw error;
  }
}

/**
 * 기존 active 계정에 소셜 연결 (비밀번호 재확인 필요)
 */
export async function linkSocialToExistingAccount(
  auth: any,
  email: string,
  password: string,
  socialData: SocialUserData,
  signIn: (email: string, password: string) => Promise<any>,
  getUserByEmail: (email: string) => Promise<any | null>,
  getUserById: (userId: string) => Promise<any | null>,
  updateUser: (userId: string, data: any) => Promise<void>
): Promise<void> {
  try {
    // 1. 기존 계정으로 로그인
    await signIn(email, password);

    // 2. Firebase Auth에 소셜 제공자 연결
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('로그인이 필요합니다');
    }

    let credential;
    if (socialData.providerId === 'google.com') {
      credential = GoogleAuthProvider.credential(
        socialData.idToken,
        socialData.accessToken
      );
    } else if (socialData.providerId === 'apple.com') {
      credential = new OAuthProvider('apple.com').credential({
        idToken: socialData.idToken,
      });
    }

    if (credential) {
      try {
        await linkWithCredential(currentUser, credential);
      } catch (error: any) {
        if (error.code === 'auth/credential-already-in-use') {
          throw new Error('이 소셜 계정은 이미 다른 계정에 연결되어 있습니다.');
        } else if (error.code === 'auth/provider-already-linked') {
          throw new Error('이미 이 제공자가 연결되어 있습니다.');
        }
        throw error;
      }
    }

    // 3. Firestore 업데이트
    const user = await getUserByEmail(email);
    if (user) {
      await linkSocialProvider(
        user.userId || user.id,
        socialData,
        getUserById,
        updateUser
      );
    }
  } catch (error) {
    console.error('계정 연결 중 오류:', error);
    throw error;
  }
}

/**
 * 소셜 제공자 연동 해제
 * Transaction 또는 일반 업데이트 지원
 */
export async function unlinkSocialProvider(
  auth: any,
  providerId: SocialProvider,
  firestoreUserId: string, // Firestore userId 직접 전달
  getUserById: (userId: string) => Promise<any | null>,
  updateUser: (userId: string, data: any) => Promise<void>,
  runTransaction?: (updateFn: (user: any) => any) => Promise<void> // Transaction 함수 (선택)
): Promise<void> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('로그인이 필요합니다');
    }

    console.log('🔓 소셜 제공자 연동 해제 시작:', {
      providerId,
      firestoreUserId,
      firebaseAuthUid: currentUser.uid,
      email: currentUser.email,
    });

    // 1. 사용자 정보 조회 (Firestore userId 사용)
    console.log('📥 사용자 정보 조회 시도 #1 (userId):', firestoreUserId);
    let user = await getUserById(firestoreUserId);
    
    // 만약 userId로 찾지 못하면, Firebase Auth UID로 재시도
    if (!user && firestoreUserId !== currentUser.uid) {
      console.log('⚠️ userId로 찾지 못함, Firebase Auth UID로 재시도:', currentUser.uid);
      user = await getUserById(currentUser.uid);
    }
    
    console.log('📊 조회된 사용자 정보:', {
      found: !!user,
      userId: user?.userId,
      documentId: user ? firestoreUserId : 'N/A',
      authProviders: user?.authProviders?.length,
    });
    
    if (!user) {
      throw new Error('사용자 정보를 찾을 수 없습니다. 페이지를 새로고침해주세요.');
    }

    // 실제 문서 ID 결정 (userId 필드가 다를 수 있음)
    const actualDocumentId = user.userId || firestoreUserId;
    console.log('📄 실제 문서 ID:', actualDocumentId);
    
    // 2. 연동 해제 가능한지 확인
    const canUnlinkResult = canUnlinkProvider(user, providerId);
    
    if (!canUnlinkResult.canUnlink) {
      throw new Error(canUnlinkResult.reason || '연동 해제할 수 없습니다');
    }

    // 3. Firebase Auth에서 연동 해제 (공식 지원 제공업체만)
    // 네이버, 카카오는 Custom Token으로 생성했으므로 Firebase Auth에서 unlink 불필요
    const firebaseNativeProviders = ['google.com', 'apple.com', 'facebook.com', 'twitter.com', 'github.com'];
    
    if (firebaseNativeProviders.includes(providerId)) {
      try {
        console.log('🔗 Firebase Auth 연동 해제 시도:', providerId);
        await unlink(currentUser, providerId);
        console.log('✅ Firebase Auth 연동 해제 완료:', providerId);
      } catch (error: any) {
        // Firebase Auth에서 연동 해제 실패해도 Firestore는 업데이트
        console.warn('⚠️ Firebase Auth 연동 해제 실패 (무시):', error.message);
      }
    } else {
      console.log('ℹ️ Custom Token 제공업체 - Firebase Auth 연동 해제 생략:', providerId);
    }

    // 4. Firestore 업데이트 (Transaction 또는 일반 업데이트)
    if (runTransaction) {
      // ✅ Transaction 사용 (동시성 안전)
      console.log('✅ Transaction 사용 (동시성 안전)');
      await runTransaction(async (latestUser: any) => {
        // Transaction 내부에서 최신 데이터로 필터링
        const latestProviders = latestUser.authProviders || [];
        const updatedProviders = latestProviders.filter(
          (p: AuthProvider) => {
            // providerId 정규화 비교
            const normalizedStoredId = p.providerId.replace('.com', '');
            const normalizedTargetId = providerId.replace('.com', '');
            return normalizedStoredId !== normalizedTargetId;
          }
        );
        
        return {
          authProviders: updatedProviders,
          updatedAt: Timestamp.now(),
        };
      });
    } else {
      // ⚠️ 일반 업데이트 (동시성 취약)
      console.log('⚠️ 기존 방식 사용 (동시성 취약)');
      const updatedProviders = (user.authProviders || []).filter(
        (p: AuthProvider) => {
          // providerId 정규화 비교
          const normalizedStoredId = p.providerId.replace('.com', '');
          const normalizedTargetId = providerId.replace('.com', '');
          return normalizedStoredId !== normalizedTargetId;
        }
      );

      console.log('💾 Firestore 업데이트 시작:', {
        documentId: actualDocumentId,
        before: user.authProviders?.length,
        after: updatedProviders.length,
      });

      await updateUser(actualDocumentId, {
        authProviders: updatedProviders,
        updatedAt: Timestamp.now(),
      });
    }
    
    console.log('✅ 연동 해제 완료');
  } catch (error: any) {
    console.error('❌ 소셜 제공자 연동 해제 중 오류:', error);
    throw error;
  }
}

/**
 * 연동 해제 가능 여부 확인
 */
export function canUnlinkProvider(
  user: any,
  providerId: string
): { canUnlink: boolean; reason?: string } {
  const providers = user.authProviders || [];
  
  console.log('🔍 연동 해제 가능 여부 확인:', {
    providerId,
    totalProviders: providers.length,
    providers: providers.map((p: AuthProvider) => p.providerId),
  });

  // 최소 1개의 로그인 방법 유지 필요
  if (providers.length <= 1) {
    return {
      canUnlink: false,
      reason: '최소 1개의 로그인 방법을 유지해야 합니다.',
    };
  }

  // 해당 제공자가 연동되어 있는지 확인
  const hasProvider = providers.some((p: AuthProvider) => p.providerId === providerId);
  if (!hasProvider) {
    return {
      canUnlink: false,
      reason: '연동되지 않은 제공자입니다.',
    };
  }

  return { canUnlink: true };
}

/**
 * 로그인한 상태에서 추가 소셜 계정 연동
 */
export async function linkAdditionalProvider(
  auth: any,
  socialData: SocialUserData,
  getUserById: (userId: string) => Promise<any | null>,
  updateUser: (userId: string, data: any) => Promise<void>
): Promise<void> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('로그인이 필요합니다');
    }

    console.log('🔗 추가 소셜 계정 연동:', socialData.providerId);

    // 1. 이미 연동되어 있는지 확인
    const user = await getUserById(currentUser.uid);
    const alreadyLinked = user.authProviders?.some(
      (p: AuthProvider) => p.providerId === socialData.providerId
    );

    if (alreadyLinked) {
      throw new Error('이미 연동된 제공자입니다.');
    }

    // 2. Firebase Auth 연동
    let credential;
    if (socialData.providerId === 'google.com') {
      credential = GoogleAuthProvider.credential(
        socialData.idToken,
        socialData.accessToken
      );
    } else if (socialData.providerId === 'apple.com') {
      credential = new OAuthProvider('apple.com').credential({
        idToken: socialData.idToken,
      });
    }
    // Kakao, Naver는 추후 구현

    if (credential) {
      try {
        await linkWithCredential(currentUser, credential);
        console.log('✅ Firebase Auth 연동 완료');
      } catch (error: any) {
        if (error.code === 'auth/credential-already-in-use') {
          throw new Error('이 소셜 계정은 이미 다른 계정에 연결되어 있습니다.');
        } else if (error.code === 'auth/provider-already-linked') {
          throw new Error('이미 연동된 제공자입니다.');
        }
        throw error;
      }
    }

    // 3. Firestore 업데이트
    const newProvider: AuthProvider = {
      providerId: socialData.providerId,
      uid: socialData.providerUid,
      email: socialData.email,
      linkedAt: Timestamp.now(),
      displayName: socialData.name,
      photoURL: socialData.photoURL,
    };

    await updateUser(currentUser.uid, {
      authProviders: [...(user.authProviders || []), newProvider],
      updatedAt: Timestamp.now(),
    });
    console.log('✅ Firestore 업데이트 완료');
  } catch (error) {
    console.error('추가 소셜 계정 연동 중 오류:', error);
    throw error;
  }
}

/**
 * 소셜 인증 에러 처리
 */
export function handleSocialAuthError(error: any): string {
  if (error.code === 'auth/account-exists-with-different-credential') {
    return '이 이메일은 다른 로그인 방법으로 가입되어 있습니다. 해당 방법으로 로그인해주세요.';
  } else if (error.code === 'auth/credential-already-in-use') {
    return '이 소셜 계정은 이미 다른 계정에 연결되어 있습니다.';
  } else if (error.code === 'auth/cancelled-popup-request') {
    return '로그인이 취소되었습니다.';
  } else if (error.code === 'auth/popup-closed-by-user') {
    return '로그인 창이 닫혔습니다. 다시 시도해주세요.';
  } else if (error.code === 'auth/popup-blocked') {
    return '팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용한 후 다시 시도해주세요.';
  } else if (error.message === 'ALREADY_REGISTERED') {
    return '이미 가입된 계정입니다. 로그인 화면에서 해당 방법으로 로그인을 시도해주세요.';
  } else if (error.message === 'ACCOUNT_INACTIVE') {
    return '탈퇴한 계정입니다. 계정 복구를 원하시면 관리자에게 문의하세요.\n\n관리자: 010-7656-7933 (신선웅)';
  } else if (error.message === 'ACCOUNT_DELETED') {
    return '삭제된 계정입니다. 계정 복구를 원하시면 관리자에게 문의하세요.\n\n관리자: 010-7656-7933 (신선웅)';
  } else if (error.code === 'auth/wrong-password') {
    return '비밀번호가 일치하지 않습니다.';
  } else if (error.code === 'auth/user-not-found') {
    return '사용자를 찾을 수 없습니다.';
  }
  return '로그인 중 오류가 발생했습니다. 다시 시도해주세요.';
}

/**
 * 소셜 제공자 이름 가져오기
 */
export function getSocialProviderName(providerId: string): string {
  switch (providerId) {
    case 'google.com':
      return 'Google';
    case 'apple.com':
      return 'Apple';
    case 'naver':
      return '네이버';
    case 'kakao':
      return '카카오';
    case 'password':
      return '이메일/비밀번호';
    default:
      return '소셜';
  }
}

/**
 * 소셜 제공자 아이콘 이름 가져오기
 */
export function getSocialProviderIcon(providerId: string): string {
  switch (providerId) {
    case 'google.com':
      return '🔵';
    case 'apple.com':
      return '🍎';
    case 'naver':
      return '🟢';
    case 'kakao':
      return '💬';
    case 'password':
      return '📧';
    default:
      return '🔗';
  }
}
