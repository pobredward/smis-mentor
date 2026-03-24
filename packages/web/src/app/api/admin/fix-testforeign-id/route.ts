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

export async function POST() {
  try {
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
    console.log('📋 Current user data:', {
      userId: userData?.userId,
      id: userData?.id,
      email: userData?.email,
    });
    
    // id 필드 추가
    await userRef.update({
      id: userId,
    });
    
    console.log('✅ Successfully updated id field to:', userId);
    
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
    console.error('Fix user ID error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
