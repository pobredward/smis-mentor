import * as functions from 'firebase-functions';
import * as functionsV2 from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

admin.initializeApp();

const db = admin.firestore();
const expo = new Expo();

interface Task {
  id: string;
  campCode: string;
  title: string;
  description?: string;
  date: admin.firestore.Timestamp;
  time?: string;
  targetRoles: string[];
  targetGroups: string[];
  completions: Array<{
    userId: string;
    userName: string;
    completedAt: admin.firestore.Timestamp;
    role: string;
  }>;
}

interface UserData {
  userId: string;
  name: string;
  email: string;
  pushTokens?: {
    [token: string]: {
      platform: string;
      addedAt: admin.firestore.Timestamp;
      lastUsed: admin.firestore.Timestamp;
    };
  };
  notificationSettings?: {
    taskReminders?: boolean;
    generalNotifications?: boolean;
  };
  jobExperiences?: Array<{
    id: string;
    groupRole?: string;
  }>;
  activeJobExperienceId?: string;
}

export const checkOverdueTasks = functions
  .region('asia-northeast3')
  .pubsub.schedule('every 30 minutes')
  .timeZone('Asia/Seoul')
  .onRun(async (context) => {
    try {
      console.log('🔔 업무 독촉 알림 체크 시작...');
      const now = new Date();
      
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      const tasksSnapshot = await db
        .collection('tasks')
        .where('date', '>=', admin.firestore.Timestamp.fromDate(startOfToday))
        .where('date', '<=', admin.firestore.Timestamp.fromDate(endOfToday))
        .get();

      if (tasksSnapshot.empty) {
        console.log('✅ 오늘 등록된 업무가 없습니다.');
        return null;
      }

      const overdueTasks: Array<{ task: Task; users: string[] }> = [];

      for (const taskDoc of tasksSnapshot.docs) {
        const task = { id: taskDoc.id, ...taskDoc.data() } as Task;

        if (!task.time) continue;

        const [hours, minutes] = task.time.split(':').map(Number);
        const taskDateTime = new Date(task.date.toDate());
        taskDateTime.setHours(hours, minutes, 0, 0);

        if (now <= taskDateTime) continue;

        const usersSnapshot = await db
          .collection('users')
          .where('activeJobExperienceId', '!=', null)
          .get();

        const incompleteUsers: string[] = [];

        for (const userDoc of usersSnapshot.docs) {
          const userData = userDoc.data() as UserData;

          if (!userData.activeJobExperienceId || !userData.jobExperiences) continue;

          const activeExp = userData.jobExperiences.find(
            exp => exp.id === userData.activeJobExperienceId
          );

          if (!activeExp?.groupRole) continue;

          if (!task.targetRoles.includes(activeExp.groupRole)) continue;

          const isCompleted = task.completions?.some(c => c.userId === userData.userId);

          if (!isCompleted) {
            const settings = userData.notificationSettings;
            if (settings?.taskReminders !== false) {
              incompleteUsers.push(userData.userId);
            }
          }
        }

        if (incompleteUsers.length > 0) {
          overdueTasks.push({ task, users: incompleteUsers });
        }
      }

      if (overdueTasks.length === 0) {
        console.log('✅ 독촉 알림을 보낼 업무가 없습니다.');
        return null;
      }

      console.log(`📤 ${overdueTasks.length}개 업무에 대한 독촉 알림 전송 중...`);

      for (const { task, users } of overdueTasks) {
        await sendTaskReminderNotifications(task, users);
      }

      console.log('✅ 독촉 알림 전송 완료');
      return null;
    } catch (error) {
      console.error('❌ 업무 독촉 알림 체크 실패:', error);
      throw error;
    }
  });

async function sendTaskReminderNotifications(task: Task, userIds: string[]): Promise<void> {
  try {
    const messages: ExpoPushMessage[] = [];

    for (const userId of userIds) {
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data() as UserData;

      if (!userData.pushTokens) continue;

      const tokens = Object.keys(userData.pushTokens).filter(token =>
        Expo.isExpoPushToken(token)
      );

      for (const token of tokens) {
        messages.push({
          to: token,
          sound: 'default',
          title: '📌 업무 알림',
          body: `"${task.title}" 업무 확인이 필요합니다.`,
          data: {
            type: 'task-reminder',
            taskId: task.id,
            taskDate: task.date.toDate().toISOString().split('T')[0],
          },
          priority: 'high',
          channelId: 'task-reminders',
        });
      }
    }

    if (messages.length === 0) {
      console.log(`⚠️ 업무 "${task.title}"에 대한 유효한 푸시 토큰이 없습니다.`);
      return;
    }

    const chunks = expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('푸시 알림 전송 실패:', error);
      }
    }

    console.log(`✅ 업무 "${task.title}"에 대한 알림 전송 완료: ${tickets.length}개`);

    const receiptsIds = tickets
      .filter(ticket => ticket.status === 'ok')
      .map(ticket => 'id' in ticket ? ticket.id : null)
      .filter((id): id is string => id !== null);

    if (receiptsIds.length > 0) {
      setTimeout(async () => {
        try {
          const receiptChunks = expo.chunkPushNotificationReceiptIds(receiptsIds);
          for (const chunk of receiptChunks) {
            const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
            
            for (const [receiptId, receipt] of Object.entries(receipts)) {
              if (receipt.status === 'error') {
                console.error(`푸시 알림 수신 실패 (${receiptId}):`, receipt.message);
                
                if (receipt.details?.error === 'DeviceNotRegistered') {
                  console.log(`만료된 토큰 감지, 정리 필요: ${receiptId}`);
                }
              }
            }
          }
        } catch (error) {
          console.error('푸시 알림 수신 확인 실패:', error);
        }
      }, 10000);
    }
  } catch (error) {
    console.error('푸시 알림 전송 중 오류:', error);
    throw error;
  }
}

export const sendTestNotification = functions
  .region('asia-northeast3')
  .https.onCall(async (data: { userId: string; message: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', '인증이 필요합니다.');
    }

    try {
      const userDoc = await db.collection('users').doc(data.userId).get();
      const userData = userDoc.data() as UserData;

      if (!userData.pushTokens) {
        throw new functions.https.HttpsError('not-found', '푸시 토큰이 없습니다.');
      }

      const tokens = Object.keys(userData.pushTokens).filter(token =>
        Expo.isExpoPushToken(token)
      );

      if (tokens.length === 0) {
        throw new functions.https.HttpsError('not-found', '유효한 푸시 토큰이 없습니다.');
      }

      const messages: ExpoPushMessage[] = tokens.map(token => ({
        to: token,
        sound: 'default',
        title: '테스트 알림',
        body: data.message || '테스트 메시지입니다.',
        data: { type: 'test' },
      }));

      const chunks = expo.chunkPushNotifications(messages);
      const tickets: ExpoPushTicket[] = [];

      for (const chunk of chunks) {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      }

      return { success: true, ticketsCount: tickets.length };
    } catch (error) {
      console.error('테스트 알림 전송 실패:', error);
      throw new functions.https.HttpsError('internal', '알림 전송에 실패했습니다.');
    }
  });

// 관리자가 특정 업무의 미완료자에게 푸시 알림 보내기
export const sendTaskReminderToUsers = functions
  .region('asia-northeast3')
  .https.onCall(async (data: { taskId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', '인증이 필요합니다.');
    }

    try {
      // 관리자 권한 확인
      const adminDoc = await db.collection('users').doc(context.auth.uid).get();
      const adminData = adminDoc.data();
      
      if (!adminData || adminData.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', '관리자 권한이 필요합니다.');
      }

      // 업무 정보 조회
      const taskDoc = await db.collection('tasks').doc(data.taskId).get();
      
      if (!taskDoc.exists) {
        throw new functions.https.HttpsError('not-found', '업무를 찾을 수 없습니다.');
      }

      const task = { id: taskDoc.id, ...taskDoc.data() } as Task;

      // campCode로 jobCode 문서 ID 찾기
      const jobCodesSnapshot = await db
        .collection('jobCodes')
        .where('code', '==', task.campCode)
        .get();

      if (jobCodesSnapshot.empty) {
        throw new functions.https.HttpsError('not-found', '캠프 코드를 찾을 수 없습니다.');
      }

      const jobCodeId = jobCodesSnapshot.docs[0].id;

      // 모든 사용자 조회하여 대상자 필터링
      const usersSnapshot = await db.collection('users').get();
      const incompleteUsers: string[] = [];

      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data() as UserData;

        // jobExperiences에서 해당 캠프 코드가 있는지 확인
        if (!userData.jobExperiences) continue;

        const campExperience = userData.jobExperiences.find(exp => exp.id === jobCodeId);
        if (!campExperience || !campExperience.groupRole) continue;

        // 대상 역할 확인
        if (!task.targetRoles.includes(campExperience.groupRole)) continue;

        // 대상 그룹 확인 (공통 또는 해당 그룹)
        // Note: UserData에 group 정보가 있다면 추가 확인 필요

        // 완료 여부 확인
        const isCompleted = task.completions?.some(c => c.userId === userData.userId);
        if (isCompleted) continue;

        // 알림 설정 확인
        const settings = userData.notificationSettings;
        if (settings?.taskReminders === false) continue;

        incompleteUsers.push(userData.userId);
      }

      if (incompleteUsers.length === 0) {
        return { 
          success: true, 
          message: '알림을 보낼 미완료자가 없습니다.',
          sentCount: 0 
        };
      }

      // 푸시 알림 전송
      await sendTaskReminderNotifications(task, incompleteUsers);

      console.log(`✅ 업무 "${task.title}"에 대한 알림 전송 완료: ${incompleteUsers.length}명`);

      return { 
        success: true, 
        message: `${incompleteUsers.length}명에게 알림을 전송했습니다.`,
        sentCount: incompleteUsers.length 
      };
    } catch (error) {
      console.error('업무 알림 전송 실패:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError('internal', '알림 전송에 실패했습니다.');
    }
  });

// Custom Token 생성 함수 (소셜 로그인용)
export const createCustomToken = functions
  .region('asia-northeast3')
  .https.onCall(async (data: { userId: string; email: string; existingUid?: string }, context) => {
    try {
      console.log('🔑 Custom Token 생성 요청:', {
        userId: data.userId,
        email: data.email,
        existingUid: data.existingUid ? `${data.existingUid.substring(0, 8)}...` : undefined,
      });

      // userId와 email 검증
      if (!data.userId || !data.email) {
        throw new functions.https.HttpsError('invalid-argument', 'userId와 email이 필요합니다.');
      }

      // userId로 Firestore에서 사용자 확인
      const userDoc = await db.collection('users').doc(data.userId).get();
      
      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', '사용자를 찾을 수 없습니다.');
      }

      const userData = userDoc.data() as UserData;
      
      // 이메일 검증
      if (userData.email !== data.email) {
        throw new functions.https.HttpsError('permission-denied', '이메일이 일치하지 않습니다.');
      }

      // ✅ existingUid가 있으면 기존 UID 사용, 없으면 새로 생성
      const targetUid = data.existingUid || data.userId;
      console.log(`🎯 사용할 UID: ${targetUid} (${data.existingUid ? '기존 UID 재사용' : '신규 생성'})`);

      // Firebase Auth에 사용자가 있는지 확인
      let firebaseUser;
      try {
        firebaseUser = await admin.auth().getUser(targetUid);
        console.log('✅ 기존 Firebase Auth 사용자 발견:', firebaseUser.uid);
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          // Firebase Auth에 사용자가 없으면 생성
          console.log('🆕 Firebase Auth 사용자 생성:', {
            uid: targetUid,
            email: data.email,
          });
          
          firebaseUser = await admin.auth().createUser({
            uid: targetUid,
            email: data.email,
            displayName: userData.name,
            emailVerified: true,
          });
        } else {
          console.error('❌ Firebase Auth 사용자 조회 실패:', error);
          throw error;
        }
      }

      // Custom Token 생성
      const customToken = await admin.auth().createCustomToken(firebaseUser.uid, {
        email: data.email,
        provider: 'custom',
      });
      
      console.log('✅ Custom Token 생성 완료:', {
        uid: firebaseUser.uid,
        uidMatch: firebaseUser.uid === targetUid,
      });
      
      return { 
        customToken,
        uid: firebaseUser.uid 
      };
    } catch (error) {
      console.error('❌ Custom Token 생성 실패:', error);
      
      // 에러 타입에 따라 적절한 HttpsError 반환
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError('internal', 'Custom Token 생성에 실패했습니다.');
    }
  });

// 관리자 권한으로 사용자 삭제 (Firebase Auth + Firestore) - v2
export const adminDeleteUser = functionsV2.https.onCall(
  {
    region: 'asia-northeast3',
  },
  async (request) => {
    try {
      const { userId } = request.data;

      // 1. 인증 체크
      if (!request.auth) {
        throw new functionsV2.https.HttpsError('unauthenticated', '인증이 필요합니다.');
      }

      // 2. 관리자 권한 체크
      const adminDoc = await db.collection('users').doc(request.auth.uid).get();
      const adminData = adminDoc.data();
      
      if (!adminData || adminData.role !== 'admin') {
        throw new functionsV2.https.HttpsError('permission-denied', '관리자 권한이 필요합니다.');
      }

      if (!userId) {
        throw new functionsV2.https.HttpsError('invalid-argument', 'userId가 필요합니다.');
      }

      console.log(`🗑️ 사용자 삭제 시작: ${userId}`);

      // 3. Firestore에서 사용자 정보 조회
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        throw new functionsV2.https.HttpsError('not-found', '사용자를 찾을 수 없습니다.');
      }

      const userData = userDoc.data();
      console.log(`📋 사용자 정보: ${userData?.name} (${userData?.email})`);

      // 4. Firebase Auth에서 사용자 삭제 시도
      let authDeleted = false;
      try {
        await admin.auth().deleteUser(userId);
        console.log('✅ Firebase Auth 사용자 삭제 완료');
        authDeleted = true;
      } catch (authError: any) {
        if (authError.code === 'auth/user-not-found') {
          console.log('⚠️ Firebase Auth에 사용자가 없음 (이미 삭제됨 또는 존재하지 않음)');
        } else {
          console.error('❌ Firebase Auth 삭제 실패:', authError);
        }
      }

      // 5. Firestore에서 사용자 문서 삭제
      await db.collection('users').doc(userId).delete();
      console.log('✅ Firestore 사용자 문서 삭제 완료');

      return {
        success: true,
        authDeleted,
        message: authDeleted 
          ? '사용자가 Firebase Auth 및 Firestore에서 삭제되었습니다.'
          : '사용자가 Firestore에서 삭제되었습니다. (Firebase Auth에는 존재하지 않았습니다.)',
      };
    } catch (error) {
      console.error('❌ 사용자 삭제 실패:', error);
      
      if (error instanceof functionsV2.https.HttpsError) {
        throw error;
      }
      
      throw new functionsV2.https.HttpsError('internal', '사용자 삭제에 실패했습니다.');
    }
  }
);

// Firebase Auth와 Firestore 일관성 검증 함수 (Admin SDK 사용)
export const verifyAuthFirestoreConsistency = functions
  .region('asia-northeast3')
  .https.onCall(async (data, context) => {
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
        const listUsersResult = await admin.auth().listUsers(1000, nextPageToken);
        
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

      // 3. 불일치 분석
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

        const issue: any = {
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
            issue.issues.push('documentId ≠ userId');
          }
          if (docId !== firestoreUser.id) {
            issue.issues.push('documentId ≠ id');
          }
        }

        // Firebase Auth 검증
        if (!authUserByDocId && !authUserByUserId && !authUserByEmail) {
          issue.issues.push('Firebase Auth에 존재하지 않음');
          orphanedFirestoreUsers.push(issue);
        } else {
          let authUid = null;

          if (authUserByDocId) {
            authUid = authUserByDocId.uid;
          } else if (authUserByUserId) {
            authUid = authUserByUserId.uid;
            issue.issues.push(`Auth UID는 userId(${firestoreUser.userId})와 일치하나 documentId와 불일치`);
          } else if (authUserByEmail) {
            authUid = authUserByEmail.uid;
            issue.issues.push(`Auth UID(${authUserByEmail.uid})가 documentId, userId 모두와 불일치 (이메일로만 찾음)`);
          }

          issue.authUid = authUid;

          if (authUid !== docId) {
            issue.issues.push(`Firebase Auth UID(${authUid}) ≠ Firestore documentId(${docId})`);
          }
        }

        if (issue.issues.length > 0) {
          inconsistencies.push(issue);
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
          inconsistentUsers: inconsistencies.length,
          orphanedFirestoreUsers: orphanedFirestoreUsers.length,
          orphanedAuthUsers: orphanedAuthUsers.length,
        },
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

      return result;
    } catch (error) {
      console.error('❌ 검증 실패:', error);
      throw new functions.https.HttpsError('internal', '검증에 실패했습니다.');
    }
  });

/**
 * 소셜 제공자 연동 해제 시 Firebase Auth에서도 계정 삭제
 * Multiple Email Policy에서 별도 계정으로 생성된 소셜 계정 정리
 */
export const deleteOrphanedSocialAccount = functionsV2.https.onCall({
  region: 'asia-northeast3',
  cors: true, // ✅ CORS 허용
}, async (request) => {
  try {
    // 인증 확인
    if (!request.auth) {
      throw new functionsV2.https.HttpsError('unauthenticated', '로그인이 필요합니다.');
    }

    const { providerId, providerEmail } = request.data;
    const currentUserId = request.auth.uid;

    console.log('🗑️ 고아 소셜 계정 삭제 요청:', {
      currentUserId,
      providerId,
      providerEmail,
    });

    if (!providerId || !providerEmail) {
      throw new functionsV2.https.HttpsError('invalid-argument', 'providerId와 providerEmail이 필요합니다.');
    }

    // 1. Firestore에서 현재 사용자 확인
    const userDoc = await db.collection('users').doc(currentUserId).get();
    if (!userDoc.exists) {
      throw new functionsV2.https.HttpsError('not-found', '사용자를 찾을 수 없습니다.');
    }

    const userData = userDoc.data();
    console.log('👤 현재 사용자:', {
      userId: currentUserId,
      email: userData?.email,
    });

    // 2. providerEmail로 Firebase Auth 사용자 검색
    let targetAuthUser;
    try {
      targetAuthUser = await admin.auth().getUserByEmail(providerEmail);
      console.log('🔍 Firebase Auth 사용자 발견:', {
        uid: targetAuthUser.uid,
        email: targetAuthUser.email,
        providers: targetAuthUser.providerData?.map(p => p.providerId),
      });
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        console.log('ℹ️ Firebase Auth에 해당 이메일 없음 (이미 삭제됨)');
        return { success: true, message: 'Firebase Auth 계정 없음 (정상)' };
      }
      throw error;
    }

    // 3. 안전성 검증: 현재 사용자와 다른 계정인지 확인
    if (targetAuthUser.uid === currentUserId) {
      throw new functionsV2.https.HttpsError(
        'failed-precondition',
        '본인 계정은 삭제할 수 없습니다.'
      );
    }

    // 4. Firestore에 해당 UID가 없거나 active가 아닌지 확인
    const targetUserDoc = await db.collection('users').doc(targetAuthUser.uid).get();
    if (targetUserDoc.exists && targetUserDoc.data()?.status === 'active') {
      console.warn('⚠️ Firestore에 active 상태로 존재하는 계정 - 삭제 거부');
      throw new functionsV2.https.HttpsError(
        'failed-precondition',
        'Firestore에 존재하는 active 계정은 삭제할 수 없습니다.'
      );
    }

    // 5. Firebase Auth에서 삭제
    await admin.auth().deleteUser(targetAuthUser.uid);
    console.log('✅ Firebase Auth 사용자 삭제 완료:', targetAuthUser.uid);

    return {
      success: true,
      deletedUid: targetAuthUser.uid,
      deletedEmail: targetAuthUser.email,
      message: 'Firebase Auth 계정이 성공적으로 삭제되었습니다.',
    };
  } catch (error: any) {
    console.error('❌ 고아 소셜 계정 삭제 실패:', error);
    if (error instanceof functionsV2.https.HttpsError) {
      throw error;
    }
    throw new functionsV2.https.HttpsError('internal', error.message || '계정 삭제에 실패했습니다.');
  }
});

/**
 * 매일 자동으로 고아 소셜 계정 정리
 * Firestore authProviders에 없는 Firebase Auth 계정 삭제
 */
export const cleanupOrphanedSocialAccounts = functionsV2.scheduler.onSchedule({
  schedule: 'every 24 hours',
  timeZone: 'Asia/Seoul',
  region: 'asia-northeast3',
}, async (event) => {
    try {
      console.log('🧹 고아 소셜 계정 정리 시작');

      // 1. 모든 Firebase Auth 사용자 가져오기
      const authUsers = new Map<string, any>();
      let nextPageToken: string | undefined;

      do {
        const listUsersResult = await admin.auth().listUsers(1000, nextPageToken);
        listUsersResult.users.forEach(user => {
          authUsers.set(user.uid, user);
        });
        nextPageToken = listUsersResult.pageToken;
      } while (nextPageToken);

      console.log('📊 Firebase Auth 사용자 총 개수:', authUsers.size);

      // 2. 모든 Firestore 사용자 가져오기
      const firestoreUsersSnapshot = await db.collection('users')
        .where('status', '==', 'active')
        .get();

      const firestoreUsers = new Set<string>();
      const authProvidersMap = new Map<string, string[]>(); // email -> [uids]

      firestoreUsersSnapshot.forEach(doc => {
        const userData = doc.data();
        firestoreUsers.add(doc.id); // Document ID
        if (userData.userId) firestoreUsers.add(userData.userId); // userId 필드

        // authProviders에서 연동된 소셜 계정 UID 수집
        const authProviders = userData.authProviders || [];
        authProviders.forEach((p: any) => {
          if (p.email && p.uid) {
            const existing = authProvidersMap.get(p.email) || [];
            existing.push(p.uid);
            authProvidersMap.set(p.email, existing);
          }
        });
      });

      console.log('📊 Firestore active 사용자:', firestoreUsers.size);
      console.log('📊 authProviders 매핑:', authProvidersMap.size);

      // 3. 고아 계정 찾기 및 삭제
      let deletedCount = 0;
      const deletedAccounts: string[] = [];

      for (const [uid, authUser] of authUsers) {
        // Firestore에 존재하지 않고
        if (!firestoreUsers.has(uid)) {
          // authProviders에도 없는 경우
          const linkedUids = authUser.email ? authProvidersMap.get(authUser.email) || [] : [];
          const isLinkedAccount = linkedUids.includes(uid);

          if (!isLinkedAccount) {
            // 진짜 고아 계정 → 삭제
            try {
              await admin.auth().deleteUser(uid);
              deletedCount++;
              deletedAccounts.push(`${authUser.email || 'no-email'} (${uid})`);
              console.log('🗑️ 고아 계정 삭제:', {
                uid,
                email: authUser.email,
                displayName: authUser.displayName,
              });
            } catch (deleteError) {
              console.error('❌ 고아 계정 삭제 실패:', uid, deleteError);
            }
          }
        }
      }

      console.log('✅ 고아 계정 정리 완료:', {
        deletedCount,
        deletedAccounts: deletedAccounts.slice(0, 10), // 처음 10개만 로그
      });

      // ✅ Scheduler 함수는 return 값 없음
    } catch (error) {
      console.error('❌ 고아 계정 정리 실패:', error);
    }
  });


