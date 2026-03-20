import * as functions from 'firebase-functions';
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
