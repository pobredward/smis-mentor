import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore, getAdminAuth } from './firebase-admin';
import type { User } from '@/types';
import { logger } from '@smis-mentor/shared';

export interface AuthContext {
  user: User;
  firebaseUid: string;
}

/**
 * API 라우트에서 인증된 사용자 정보를 가져오는 헬퍼
 * Authorization 헤더에서 Firebase ID Token을 검증하고 사용자 정보를 반환
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<AuthContext | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    
    const idToken = authHeader.substring(7);
    
    // Firebase Admin SDK를 사용하여 토큰 검증
    const adminAuth = getAdminAuth();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const firebaseUid = decodedToken.uid;
    
    // Firestore에서 사용자 정보 조회
    const db = getAdminFirestore();
    const userDoc = await db.collection('users').doc(firebaseUid).get();
    
    if (!userDoc.exists) {
      logger.warn('인증은 성공했으나 사용자 정보를 찾을 수 없음:', firebaseUid);
      return null;
    }
    
    const user = { ...userDoc.data(), userId: firebaseUid } as User;
    
    return {
      user,
      firebaseUid,
    };
  } catch (error) {
    logger.error('사용자 인증 실패:', error);
    return null;
  }
}

/**
 * 관리자 권한 확인
 */
export function requireAdmin(authContext: AuthContext | null): NextResponse | null {
  if (!authContext) {
    return NextResponse.json(
      { error: '인증이 필요합니다.' },
      { status: 401 }
    );
  }
  
  if (authContext.user.role !== 'admin') {
    return NextResponse.json(
      { error: '관리자 권한이 필요합니다.' },
      { status: 403 }
    );
  }
  
  return null;
}

/**
 * 멘토 이상 권한 확인
 */
export function requireMentor(authContext: AuthContext | null): NextResponse | null {
  if (!authContext) {
    return NextResponse.json(
      { error: '인증이 필요합니다.' },
      { status: 401 }
    );
  }
  
  if (!['admin', 'mentor', 'foreign'].includes(authContext.user.role)) {
    return NextResponse.json(
      { error: '멘토 이상의 권한이 필요합니다.' },
      { status: 403 }
    );
  }
  
  return null;
}

/**
 * 본인 또는 관리자 권한 확인
 */
export function requireSelfOrAdmin(
  authContext: AuthContext | null,
  targetUserId: string
): NextResponse | null {
  if (!authContext) {
    return NextResponse.json(
      { error: '인증이 필요합니다.' },
      { status: 401 }
    );
  }
  
  const isSelf = authContext.user.userId === targetUserId;
  const isAdmin = authContext.user.role === 'admin';
  
  if (!isSelf && !isAdmin) {
    return NextResponse.json(
      { error: '본인 또는 관리자만 접근할 수 있습니다.' },
      { status: 403 }
    );
  }
  
  return null;
}
