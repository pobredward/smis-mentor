import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Firebase Admin 초기화 (singleton)
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
const auth = getAuth();

export async function GET() {
  try {
    console.log('🔍 Firebase Auth ↔ Firestore 일관성 검증 시작...');

    // 1. 모든 Firestore 사용자 조회
    const usersSnapshot = await db.collection('users').get();
    const firestoreUsers = new Map<string, any>();
    
    usersSnapshot.forEach((doc) => {
      const userData = doc.data();
      firestoreUsers.set(doc.id, {
        documentId: doc.id,
        userId: userData.userId,
        id: userData.id,
        email: userData.email,
        name: userData.name,
        status: userData.status,
        role: userData.role,
        authProviders: userData.authProviders || [],
      });
    });

    console.log(`📊 Firestore 사용자 수: ${firestoreUsers.size}`);

    // 2. 모든 Firebase Auth 사용자 조회 (페이징)
    const authUsers = new Map<string, any>();
    let nextPageToken: string | undefined;

    do {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      
      listUsersResult.users.forEach((userRecord) => {
        authUsers.set(userRecord.uid, {
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName,
          emailVerified: userRecord.emailVerified,
          disabled: userRecord.disabled,
          providerData: userRecord.providerData,
        });
      });

      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);

    console.log(`📊 Firebase Auth 사용자 수: ${authUsers.size}`);

    // 3. 일관성 분석 (모든 사용자 포함)
    const allUsers: any[] = [];
    const inconsistencies: any[] = [];
    const orphanedFirestoreUsers: any[] = [];
    const orphanedAuthUsers: any[] = [];

    // Firestore 사용자 기준으로 검증
    for (const [docId, firestoreUser] of firestoreUsers) {
      // Firestore 내부 일관성 체크
      const internalConsistent = 
        docId === firestoreUser.userId && 
        docId === firestoreUser.id;

      // Firebase Auth UID와 비교
      const authUserByDocId = authUsers.get(docId);
      const authUserByUserId = authUsers.get(firestoreUser.userId);
      const authUserByEmail = firestoreUser.email 
        ? Array.from(authUsers.values()).find(u => u.email === firestoreUser.email)
        : null;

      const userRecord: any = {
        firestoreDocId: docId,
        firestoreUserId: firestoreUser.userId,
        firestoreId: firestoreUser.id,
        email: firestoreUser.email,
        name: firestoreUser.name,
        status: firestoreUser.status,
        role: firestoreUser.role,
        internalConsistent,
        issues: [],
      };

      // 불일치 타입 분류
      if (!internalConsistent) {
        if (docId !== firestoreUser.userId) {
          userRecord.issues.push('documentId ≠ userId');
        }
        if (docId !== firestoreUser.id) {
          userRecord.issues.push('documentId ≠ id');
        }
      }

      // Firebase Auth 검증
      if (!authUserByDocId && !authUserByUserId && !authUserByEmail) {
        userRecord.issues.push('Firebase Auth에 존재하지 않음');
        orphanedFirestoreUsers.push(userRecord);
      } else {
        let authUid = null;

        if (authUserByDocId) {
          authUid = authUserByDocId.uid;
        } else if (authUserByUserId) {
          authUid = authUserByUserId.uid;
          userRecord.issues.push(`Auth UID는 userId(${firestoreUser.userId})와 일치하나 documentId와 불일치`);
        } else if (authUserByEmail) {
          authUid = authUserByEmail.uid;
          userRecord.issues.push(`Auth UID(${authUserByEmail.uid})가 documentId, userId 모두와 불일치 (이메일로만 찾음)`);
        }

        userRecord.authUid = authUid;

        if (authUid !== docId) {
          userRecord.issues.push(`Firebase Auth UID(${authUid}) ≠ Firestore documentId(${docId})`);
        }
      }

      // 모든 사용자를 allUsers에 추가
      allUsers.push(userRecord);

      // 문제가 있는 경우만 inconsistencies에 추가
      if (userRecord.issues.length > 0) {
        inconsistencies.push(userRecord);
      }
    }

    // Firebase Auth에만 있는 사용자 (Firestore에 없음)
    for (const [authUid, authUser] of authUsers) {
      const hasFirestoreDoc = firestoreUsers.has(authUid);
      const hasUserIdMatch = Array.from(firestoreUsers.values()).some(
        u => u.userId === authUid
      );
      const hasEmailMatch = authUser.email 
        ? Array.from(firestoreUsers.values()).some(u => u.email === authUser.email)
        : false;

      if (!hasFirestoreDoc && !hasUserIdMatch && !hasEmailMatch) {
        orphanedAuthUsers.push({
          authUid,
          email: authUser.email,
          displayName: authUser.displayName,
          issue: 'Firestore에 존재하지 않음',
        });
      }
    }

    // 결과 정리
    const result = {
      summary: {
        totalFirestoreUsers: firestoreUsers.size,
        totalAuthUsers: authUsers.size,
        consistentUsers: allUsers.length - inconsistencies.length,
        inconsistentUsers: inconsistencies.length,
        orphanedFirestoreUsers: orphanedFirestoreUsers.length,
        orphanedAuthUsers: orphanedAuthUsers.length,
      },
      allUsers: allUsers.sort((a, b) => {
        // active 먼저, 그 다음 이름 순
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        return (a.name || '').localeCompare(b.name || '');
      }),
      inconsistencies: inconsistencies.sort((a, b) => {
        // active 먼저, 그 다음 이슈 개수 많은 순
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        return b.issues.length - a.issues.length;
      }),
      orphanedFirestoreUsers,
      orphanedAuthUsers,
    };

    console.log('✅ 검증 완료:', result.summary);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('❌ 검증 실패:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
