import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore, getAdminAuth, adminFieldValue } from '@/lib/firebase-admin';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';

export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthenticatedUser(request);
    
    const adminCheck = requireAdmin(authContext);
    if (adminCheck) {
      return adminCheck;
    }

    const db = getAdminFirestore();
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    
    if (!email) {
      return NextResponse.json(
        { success: false, error: 'email 파라미터가 필요합니다.' },
        { status: 400 }
      );
    }
    
    // 백업 데이터에서 검색
    const backupSnapshot = await db.collection('user_id_mappings_backup')
      .where('email', '==', email)
      .limit(1)
      .get();
    
    if (backupSnapshot.empty) {
      return NextResponse.json({
        success: false,
        found: false,
        message: `${email}에 대한 백업 데이터를 찾을 수 없습니다.`,
      });
    }
    
    const backupData = backupSnapshot.docs[0].data();
    
    return NextResponse.json({
      success: true,
      found: true,
      backup: backupData,
    });
    
  } catch (error: any) {
    logger.error('❌ 백업 조회 실패:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
