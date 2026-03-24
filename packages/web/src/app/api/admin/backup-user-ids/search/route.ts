import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });
}

const db = getFirestore();

export async function GET(request: Request) {
  try {
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
    console.error('❌ 백업 조회 실패:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
