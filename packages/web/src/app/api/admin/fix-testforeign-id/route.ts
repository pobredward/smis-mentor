import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore, getAdminAuth, adminFieldValue } from '@/lib/firebase-admin';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';

export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthenticatedUser(request);
    
    const adminCheck = requireAdmin(authContext);
    if (adminCheck) {
      return adminCheck;
    }

    const db = getAdminFirestore();
    const userId = '620AsKFbNVW0UcdD8oWHz91wbeA3';
    const userRef = db.collection('users').doc(userId);
    
    // 문서 존재 확인
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    const userData = userDoc.data();
    logger.info('📋 Current user data:', {
      userId: userData?.userId,
      id: userData?.id,
      email: userData?.email,
    });
    
    // id 필드 추가
    await userRef.update({
      id: userId,
    });
    
    logger.info('✅ Successfully updated id field to:', userId);
    
    // 업데이트 확인
    const updatedDoc = await userRef.get();
    const updatedData = updatedDoc.data();
    
    return NextResponse.json({
      success: true,
      message: 'id field added successfully',
      before: {
        userId: userData?.userId,
        id: userData?.id,
      },
      after: {
        userId: updatedData?.userId,
        id: updatedData?.id,
      },
    });
  } catch (error: any) {
    logger.error('Fix user ID error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
