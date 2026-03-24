import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Firebase Admin 초기화
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

export async function GET() {
  try {
    console.log('🔍 userId 참조 관계 분석 중...');

    const collections = [
      'jobExperiences',
      'applications',
      'tasks',
      'evaluations',
      'lessonMaterials',
      'reviews',
      'interviews',
      'jobBoards',
    ];

    const references: any = {};

    for (const collectionName of collections) {
      const snapshot = await db.collection(collectionName).limit(10).get();
      
      if (!snapshot.empty) {
        const sample = snapshot.docs[0].data();
        const userIdFields: string[] = [];

        // userId 관련 필드 찾기
        const findUserIdFields = (obj: any, prefix = '') => {
          for (const key in obj) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            
            if (key === 'userId' || key === 'evaluatorId' || key === 'evaluateeId' || 
                key === 'authorId' || key === 'uploadedBy' || key === 'mentorId') {
              userIdFields.push(fullKey);
            }
            
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
              findUserIdFields(obj[key], fullKey);
            }
            
            if (Array.isArray(obj[key]) && obj[key].length > 0 && typeof obj[key][0] === 'object') {
              findUserIdFields(obj[key][0], `${fullKey}[0]`);
            }
          }
        };

        findUserIdFields(sample);

        if (userIdFields.length > 0) {
          references[collectionName] = {
            count: snapshot.size,
            totalDocs: (await db.collection(collectionName).count().get()).data().count,
            userIdFields,
            sampleDoc: sample,
          };
        }
      }
    }

    return NextResponse.json({
      success: true,
      references,
    });
  } catch (error: any) {
    console.error('❌ 분석 실패:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
