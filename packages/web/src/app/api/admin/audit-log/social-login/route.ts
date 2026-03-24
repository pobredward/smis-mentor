import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Firebase Admin SDK 초기화 (중복 방지)
if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: privateKey!,
    }),
  });
}

const db = getFirestore();

/**
 * 소셜 로그인 감사 로그 기록
 * POST /api/admin/audit-log/social-login
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      action,
      userId,
      providerId,
      email,
      status,
      metadata,
    } = body;

    if (!action || !userId) {
      return NextResponse.json(
        { error: 'action과 userId가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`📝 소셜 로그인 감사 로그 기록: ${action} - ${email || userId}`);

    // 감사 로그 기록
    await db.collection('auditLogs').add({
      action, // 'SOCIAL_LOGIN', 'SOCIAL_SIGNUP', 'SOCIAL_LINK', 'SOCIAL_UNLINK', 'SOCIAL_LOGIN_FAILED'
      category: 'SOCIAL_AUTH',
      userId,
      userEmail: email,
      providerId,
      status, // 'SUCCESS', 'FAILED', 'BLOCKED'
      metadata: {
        ...metadata,
        userAgent: request.headers.get('user-agent'),
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ 감사 로그 기록 완료');

    return NextResponse.json({
      success: true,
      message: '감사 로그가 기록되었습니다.',
    });
  } catch (error: any) {
    console.error('❌ 감사 로그 기록 실패:', {
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    
    // 로그 실패는 치명적이지 않으므로 200 반환
    return NextResponse.json(
      { 
        success: false,
        error: '감사 로그 기록 실패',
        details: error.message 
      },
      { status: 200 }
    );
  }
}
