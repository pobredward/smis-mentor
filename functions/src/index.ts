import * as functionsV2 from 'firebase-functions/v2';
import * as firestoreV2 from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { OAuth2Client } from 'google-auth-library';

admin.initializeApp();

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
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
  role?: string;
  status?: string;
  /** 캠프 배정 (jobExperiences 의 id 들) */
  jobCodeIds?: string[];
  /** 화면·알림 언어 (설정에서 고름) */
  locale?: 'ko' | 'en';
  pushTokens?: {
    [token: string]: {
      platform: string;
      addedAt: admin.firestore.Timestamp;
      lastUsed: admin.firestore.Timestamp;
    };
  };
  notificationSettings?: {
    /** 전체 on/off — 끄면 어떤 알림도 보내지 않는다 */
    generalNotifications?: boolean;
    taskReminders?: boolean;
    [key: string]: boolean | undefined;
  };
  jobExperiences?: Array<{
    id: string;
    groupRole?: string;
    group?: string;
  }>;
}

// shared의 LEGACY_GROUP_MAP과 동일한 매핑 (영문 그룹명 → 한글)
const LEGACY_GROUP_MAP: Record<string, string> = {
  'junior': '주니어',
  'middle': '미들',
  'senior': '시니어',
  'spring': '스프링',
  'summer': '서머',
  'autumn': '어텀',
  'winter': '윈터',
  'common': '공통',
  'short1': '단기1',
  'short2': '단기2',
  'short3': '단기3',
  'short4': '단기4',
};

// Task에 notificationSentDates 필드를 추가하기 위한 확장 타입
interface TaskWithNotification extends Task {
  notificationSentDates?: string[]; // YYYY-MM-DD 형식, 당일 알림 발송 여부 추적
}

// ──────────────────────────────────────────────────────────────
// onRequest 함수 호출자 검증
//  - Cloud Scheduler: OIDC ID 토큰(Google 서명) → 서명·만료 검증 후 서비스 계정 이메일 허용 목록 확인
//  - 관리자 수동 호출: Firebase ID 토큰 → users/{uid}.role == 'admin'
//  (이전에는 'Bearer ' 접두사만 확인해 누구나 호출 가능했음)
// ──────────────────────────────────────────────────────────────
const oidcClient = new OAuth2Client();
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'smis-mentor';
const SCHEDULER_INVOKER_EMAILS = (process.env.SCHEDULER_INVOKER_EMAILS || `${PROJECT_ID}@appspot.gserviceaccount.com`)
  .split(',').map((e) => e.trim()).filter(Boolean);

function isAllowedInvokerEmail(email: string | undefined): boolean {
  if (!email) return false;
  if (SCHEDULER_INVOKER_EMAILS.includes(email)) return true;
  // 프로젝트 소속 서비스 계정 (Cloud Scheduler 작업에 지정된 SA)
  return email.endsWith(`@${PROJECT_ID}.iam.gserviceaccount.com`);
}

async function verifyInvoker(
  req: { headers: Record<string, unknown> },
  opts: { allowScheduler?: boolean; allowAdmin?: boolean } = { allowScheduler: true, allowAdmin: true }
): Promise<{ ok: true; by: 'scheduler' | 'admin'; email?: string; uid?: string } | { ok: false; reason: string }> {
  const raw = req.headers.authorization;
  const authHeader = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';
  if (!authHeader || !authHeader.startsWith('Bearer ')) return { ok: false, reason: 'no-bearer' };
  const token = authHeader.slice(7).trim();
  if (!token) return { ok: false, reason: 'empty' };

  // 1) Cloud Scheduler OIDC 토큰
  if (opts.allowScheduler !== false) {
    try {
      const ticket = await oidcClient.verifyIdToken({ idToken: token });
      const payload = ticket.getPayload();
      if (payload?.email && payload.email_verified && isAllowedInvokerEmail(payload.email)) {
        return { ok: true, by: 'scheduler', email: payload.email };
      }
      if (payload?.email) console.warn('⛔ 허용되지 않은 OIDC 호출자:', payload.email, 'aud=', payload.aud);
    } catch {
      /* Google OIDC 토큰이 아님 → Firebase ID 토큰으로 재시도 */
    }
  }

  // 2) 관리자 Firebase ID 토큰
  if (opts.allowAdmin !== false) {
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      const snap = await admin.firestore().collection('users').doc(decoded.uid).get();
      if (snap.exists && snap.data()?.role === 'admin' && snap.data()?.status === 'active') {
        return { ok: true, by: 'admin', uid: decoded.uid };
      }
      return { ok: false, reason: 'not-admin' };
    } catch {
      /* 유효한 Firebase 토큰 아님 */
    }
  }
  return { ok: false, reason: 'invalid-token' };
}

/** 만료된 Expo 푸시 토큰 삭제 — 토큰에 '[' ']' 가 있어 문자열 경로 대신 FieldPath 사용 */
async function removeExpiredPushToken(userId: string, token: string): Promise<void> {
  try {
    await db.collection('users').doc(userId).update(
      new admin.firestore.FieldPath('pushTokens', token),
      admin.firestore.FieldValue.delete()
    );
    console.log(`🗑️ 만료 토큰 삭제 (userId: ${userId}): ${token.substring(0, 40)}...`);
  } catch (deleteError) {
    console.error('만료 토큰 삭제 실패:', deleteError);
  }
}

/**
 * 이전 실행에서 큐에 넣어 둔 푸시 영수증 확인 → DeviceNotRegistered 토큰 정리
 * (Expo 영수증은 발송 후 수 분 뒤에 확정되므로 다음 스케줄 실행에서 처리)
 */
async function processPushReceiptQueue(): Promise<void> {
  const cutoff = new Date(Date.now() - 60 * 1000);
  const snap = await db.collection('pushReceiptQueue')
    .where('createdAt', '<', cutoff)
    .orderBy('createdAt')
    .limit(600)
    .get();
  if (snap.empty) return;

  const byId = new Map<string, { token: string; userId: string }>();
  snap.docs.forEach((d) => byId.set(d.id, d.data() as { token: string; userId: string }));
  const ids = Array.from(byId.keys());

  let removed = 0;
  for (const chunk of expo.chunkPushNotificationReceiptIds(ids)) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      for (const [receiptId, receipt] of Object.entries(receipts)) {
        if (receipt.status === 'error') {
          console.warn(`푸시 영수증 오류 (${receiptId}):`, receipt.message, receipt.details?.error);
          if (receipt.details?.error === 'DeviceNotRegistered') {
            const info = byId.get(receiptId);
            if (info) { await removeExpiredPushToken(info.userId, info.token); removed += 1; }
          }
        }
      }
    } catch (error) {
      console.error('푸시 영수증 조회 실패:', error);
    }
  }

  // 처리한(또는 Expo 가 더는 보관하지 않는) 큐 문서 삭제
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  console.log(`🧾 푸시 영수증 ${ids.length}건 확인, 만료 토큰 ${removed}건 삭제`);
}

/**
 * 오래된 위치 기록 삭제 — 마지막 갱신 후 14일 지난 userLocations 문서
 * (캠프가 끝난 뒤 위치 기록이 무기한 남지 않도록. 개인정보처리방침의 보존기간과 일치시켜야 함)
 */
const LOCATION_RETENTION_DAYS = 14;
async function cleanupStaleLocations(): Promise<void> {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - LOCATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const snap = await db.collection('userLocations').where('updatedAt', '<', cutoff).limit(300).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  console.log(`📍 오래된 위치 기록 ${snap.size}건 삭제 (${LOCATION_RETENTION_DAYS}일 경과)`);
}

// Cloud Scheduler 가 HTTP POST 로 매분 호출 (업무 시각이 지난 뒤 30분 안의 첫 실행에서 한 번 보낸다 — notificationSentDates 로 중복 방지)
// gcloud functions deploy --build-service-account 옵션으로 배포 (Compute Engine SA 없이 Cloud Build SA 활용)
export const checkOverdueTasks = functionsV2.https.onRequest(
  {
    region: 'asia-northeast3',
    serviceAccount: 'smis-mentor@appspot.gserviceaccount.com',
  },
  async (req, res) => {
    // Cloud Scheduler OIDC 토큰(서명 검증 + SA 허용 목록) 또는 관리자 Firebase ID 토큰만 허용
    const invoker = await verifyInvoker(req as any);
    if (!invoker.ok) {
      console.warn('⛔ checkOverdueTasks 비인가 호출:', invoker.reason);
      res.status(403).json({ error: '허가되지 않은 접근입니다.' });
      return;
    }

    try {
      console.log('🔔 업무 알림 체크 시작...');
      // 이전 실행의 푸시 영수증 확인 (만료 토큰 정리)
      await processPushReceiptQueue().catch((e) => console.error('영수증 큐 처리 실패:', e));
      await cleanupStaleLocations().catch((e) => console.error('위치 기록 정리 실패:', e));
      const now = new Date();

      // 30분 이전 시각 (이 창 안에 time이 있는 업무만 알림 발송)
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

      // Cloud Function 서버는 UTC 기준으로 실행되므로 KST(UTC+9) 보정 필요
      const KST_OFFSET = 9 * 60 * 60 * 1000;
      const nowKST = new Date(now.getTime() + KST_OFFSET);

      // KST 기준 오늘 자정(00:00)을 UTC 타임스탬프로 변환
      const startOfTodayUTC = new Date(
        Date.UTC(nowKST.getUTCFullYear(), nowKST.getUTCMonth(), nowKST.getUTCDate(), 0, 0, 0) - KST_OFFSET
      );
      const endOfTodayUTC = new Date(
        Date.UTC(nowKST.getUTCFullYear(), nowKST.getUTCMonth(), nowKST.getUTCDate(), 23, 59, 59) - KST_OFFSET
      );
      // YYYY-MM-DD (KST 기준)
      const todayStr = `${nowKST.getUTCFullYear()}-${String(nowKST.getUTCMonth() + 1).padStart(2, '0')}-${String(nowKST.getUTCDate()).padStart(2, '0')}`;

      // campTasks 컬렉션 조회 (tasks 아님)
      const tasksSnapshot = await db
        .collection('campTasks')
        .where('date', '>=', admin.firestore.Timestamp.fromDate(startOfTodayUTC))
        .where('date', '<=', admin.firestore.Timestamp.fromDate(endOfTodayUTC))
        .get();

      if (tasksSnapshot.empty) {
        console.log('✅ 오늘 등록된 업무가 없습니다.');
        res.json({ success: true, message: '오늘 등록된 업무 없음', notified: 0 });
        return;
      }

      const tasksToNotify: Array<{ task: TaskWithNotification; users: Array<{ userId: string; data: UserData }> }> = [];
      // 이번 실행 안에서만 쓰는 캐시 (캠프 코드 → id, 캠프 → 배정된 사람)
      const jobCodeIds = new Map<string, string | null>();
      const jobCodeIdOf = async (campCode: string): Promise<string | null> => {
        if (!jobCodeIds.has(campCode)) {
          const snap = await db.collection('jobCodes').where('code', '==', campCode).limit(1).get();
          jobCodeIds.set(campCode, snap.empty ? null : snap.docs[0].id);
        }
        return jobCodeIds.get(campCode) ?? null;
      };
      const campUsers = new Map<string, admin.firestore.QuerySnapshot>();

      for (const taskDoc of tasksSnapshot.docs) {
        const task = { id: taskDoc.id, ...taskDoc.data() } as TaskWithNotification;

        if (!task.time) continue;

        const [hours, minutes] = task.time.split(':').map(Number);
        // task.time은 KST 기준 "HH:mm" → startOfTodayUTC(KST 00:00의 UTC값)에 해당 시간(ms)을 더해 UTC 타임스탬프로 변환
        const taskDateTimeUTC = new Date(startOfTodayUTC.getTime() + (hours * 60 + minutes) * 60 * 1000);

        // 업무 시간이 지난 30분 이내에 있는 경우에만 알림 발송
        if (taskDateTimeUTC < thirtyMinutesAgo || taskDateTimeUTC > now) continue;

        // 이미 오늘 알림을 보낸 업무는 건너뜀 (중복 발송 방지)
        if (task.notificationSentDates?.includes(todayStr)) {
          console.log(`⏭️ 업무 "${task.title}" 오늘 이미 알림 발송 완료, 건너뜀`);
          continue;
        }

        // campCode → jobCodeId (jobCodes.code 는 유일 — 같은 실행에서는 한 번만 읽는다)
        const jobCodeId = await jobCodeIdOf(task.campCode);
        if (!jobCodeId) continue;

        // 캠프 배정(jobCodeIds) 기준 — 채팅 · 재고 · 수동 독촉과 같은 기준
        // (예전에는 화면에서 고른 캠프 activeJobExperienceId 로 찾아, 캠프를 고르지 않은 사람은 알림을 못 받았다)
        let usersSnapshot = campUsers.get(jobCodeId);
        if (!usersSnapshot) {
          usersSnapshot = await db.collection('users').where('jobCodeIds', 'array-contains', jobCodeId).get();
          campUsers.set(jobCodeId, usersSnapshot);
        }

        const incompleteUsers: Array<{ userId: string; data: UserData }> = [];

        for (const userDoc of usersSnapshot.docs) {
          const userData = userDoc.data() as UserData;

          if (!userData.jobExperiences) continue;

          const campExperience = userData.jobExperiences.find(exp => exp.id === jobCodeId);
          if (!campExperience?.groupRole) continue;

          // 대상 역할 확인
          if (!task.targetRoles.includes(campExperience.groupRole)) continue;

          // 대상 그룹 확인
          const userGroupKorean = LEGACY_GROUP_MAP[campExperience.group ?? ''] || campExperience.group;
          if (!task.targetGroups.includes('공통') && !task.targetGroups.includes(userGroupKorean ?? '')) continue;

          if (userData.status && userData.status !== 'active') continue;
          const isCompleted = task.completions?.some(c => c.userId === userDoc.id);
          if (isCompleted) continue;

          // 알림 설정 — 전체를 껐거나 업무 알림을 껐으면 제외
          const settings = userData.notificationSettings;
          if (settings?.generalNotifications === false) continue;
          if (settings?.taskReminders === false) continue;

          incompleteUsers.push({ userId: userDoc.id, data: userData });
        }

        if (incompleteUsers.length > 0) {
          tasksToNotify.push({ task, users: incompleteUsers });
        }
      }

      if (tasksToNotify.length === 0) {
        console.log('✅ 이번 주기에 알림을 보낼 업무가 없습니다.');
        res.json({ success: true, message: '알림 대상 없음', notified: 0 });
        return;
      }

      console.log(`📤 ${tasksToNotify.length}개 업무에 대한 알림 전송 중...`);

      for (const { task, users } of tasksToNotify) {
        await sendTaskReminderNotifications(task, users);

        // 당일 알림 발송 완료 표시 (중복 방지)
        await db.collection('campTasks').doc(task.id).update({
          notificationSentDates: admin.firestore.FieldValue.arrayUnion(todayStr),
        });
        console.log(`✅ 업무 "${task.title}" 알림 발송 완료 (${users.length}명), 발송 기록 저장`);
      }

      console.log('✅ 업무 알림 전송 완료');
      res.json({ success: true, message: '알림 전송 완료', notified: tasksToNotify.length });
    } catch (error) {
      console.error('❌ 업무 알림 체크 실패:', error);
      res.status(500).json({ error: '업무 알림 체크 중 오류가 발생했습니다.' });
    }
  }
);

async function sendTaskReminderNotifications(task: Task, users: Array<{ userId: string; data: UserData }>): Promise<void> {
  try {
    const messages: ExpoPushMessage[] = [];
    // 만료 토큰 삭제를 위한 매핑: token → userId
    const tokenUserMap = new Map<string, string>();

    // 대상 조회 때 읽은 문서를 그대로 쓴다 (사람마다 다시 읽지 않음)
    for (const { userId, data: userData } of users) {
      if (!userData?.pushTokens) continue;

      const tokens = Object.keys(userData.pushTokens).filter(token =>
        Expo.isExpoPushToken(token)
      );

      // 받는 사람 언어 — 설정에서 고른 언어, 없으면 원어민은 영어 (web·mobile shared/i18n 의 push.taskReminder* 와 같은 문구)
      const english = userData.locale ? userData.locale === 'en' : (userData.role === 'foreign' || userData.role === 'foreign_temp');
      for (const token of tokens) {
        messages.push({
          to: token,
          sound: 'default',
          title: english ? '🔔 Task Reminder' : '🔔 업무 알림',
          body: english ? `Please check the task "${task.title}".` : `"${task.title}" 업무를 확인해주세요.`,
          data: {
            type: 'task-reminder',
            taskId: task.id,
            taskDate: task.date.toDate().toISOString().split('T')[0],
            screen: 'Camp',
            tab: 'tasks',
          },
          priority: 'high',
          channelId: 'task-reminders',
        });
        tokenUserMap.set(token, userId);
      }
    }

    if (messages.length === 0) {
      console.log(`⚠️ 업무 "${task.title}"에 대한 유효한 푸시 토큰이 없습니다.`);
      return;
    }

    const chunks = expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];
    const sentMessages: ExpoPushMessage[] = []; // tickets 와 1:1 정렬 유지 (실패한 청크는 제외)

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
        sentMessages.push(...chunk);
      } catch (error) {
        console.error('푸시 알림 전송 실패:', error);
      }
    }

    console.log(`✅ 업무 "${task.title}"에 대한 알림 전송 완료: ${tickets.length}개`);

    // 1) 티켓 단계 오류(DeviceNotRegistered)는 즉시 토큰 삭제
    // 2) 정상 티켓은 영수증 큐에 넣고 다음 스케줄 실행 때 확인
    //    (응답 후 setTimeout 은 Cloud Functions 에서 실행이 보장되지 않아 폐기)
    const queueBatch = db.batch();
    let queued = 0;
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const token = sentMessages[i]?.to as string | undefined;
      const userId = token ? tokenUserMap.get(token) : undefined;
      if (ticket.status === 'error') {
        console.error('푸시 티켓 오류:', ticket.message, ticket.details?.error);
        if (ticket.details?.error === 'DeviceNotRegistered' && token && userId) {
          await removeExpiredPushToken(userId, token);
        }
      } else if ('id' in ticket && token && userId) {
        queueBatch.set(db.collection('pushReceiptQueue').doc(ticket.id), {
          token,
          userId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        queued += 1;
      }
    }
    if (queued > 0) {
      await queueBatch.commit();
    }
  } catch (error) {
    console.error('푸시 알림 전송 중 오류:', error);
    throw error;
  }
}

/**
 * 매일 자동으로 고아 소셜 계정 정리
 * Firestore authProviders에 없는 Firebase Auth 계정 삭제
 */
// Cloud Scheduler에서 HTTP POST로 매일 1회 호출
// gcloud functions deploy --build-service-account 옵션으로 배포
export const cleanupOrphanedSocialAccounts = functionsV2.https.onRequest(
  {
    region: 'asia-northeast3',
    serviceAccount: 'smis-mentor@appspot.gserviceaccount.com',
  },
  async (req, res) => {
    const invoker = await verifyInvoker(req as any);
    if (!invoker.ok) {
      console.warn('⛔ cleanupOrphanedSocialAccounts 비인가 호출:', invoker.reason);
      res.status(403).json({ error: '허가되지 않은 접근입니다.' });
      return;
    }

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
        deletedAccounts: deletedAccounts.slice(0, 10),
      });

      res.json({ success: true, deletedCount, message: '고아 소셜 계정 정리 완료' });
    } catch (error) {
      console.error('❌ 고아 계정 정리 실패:', error);
      res.status(500).json({ error: '고아 소셜 계정 정리 중 오류가 발생했습니다.' });
    }
  });



// ──────────────────────────────────────────────────────────────
// 감사 로그: users 문서의 역할·상태·캠프 배정·이메일 변경 기록
// 관리자 화면이 클라이언트에서 직접 updateDoc 하므로 서버 트리거로 모든 경로를 커버한다.
// (민감값은 남기지 않음 — 변경된 필드명과 이전/이후 값만)
// ──────────────────────────────────────────────────────────────
export const auditUserChanges = firestoreV2.onDocumentUpdatedWithAuthContext(
  // 이 프로젝트에는 기본 Compute 서비스 계정이 없어 다른 함수처럼 App Engine 계정으로 돌린다
  { document: 'users/{userId}', region: 'asia-northeast3', serviceAccount: 'smis-mentor@appspot.gserviceaccount.com', memory: '256MiB' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const changes: Array<{ action: string; field: string; from: unknown; to: unknown }> = [];
    if (!same(before.role, after.role)) changes.push({ action: 'USER_ROLE_CHANGE', field: 'role', from: before.role ?? null, to: after.role ?? null });
    if (!same(before.status, after.status)) changes.push({ action: 'USER_STATUS_CHANGE', field: 'status', from: before.status ?? null, to: after.status ?? null });
    if (!same(before.jobCodeIds, after.jobCodeIds)) changes.push({ action: 'USER_CAMP_CHANGE', field: 'jobCodeIds', from: before.jobCodeIds ?? [], to: after.jobCodeIds ?? [] });
    if (!same(before.email, after.email)) changes.push({ action: 'EMAIL_CHANGE', field: 'email', from: before.email ?? null, to: after.email ?? null });
    if (changes.length === 0) return;

    const actor = event.authType === 'system' || event.authType === 'service_account' ? 'server' : (event.authId ?? 'unknown');
    const batch = db.batch();
    for (const c of changes) {
      batch.set(db.collection('auditLogs').doc(), {
        action: c.action,
        category: 'ACCOUNT',
        source: 'trigger',
        performedBy: actor,
        authType: event.authType ?? null,
        targetUserId: event.params.userId,
        targetLabel: typeof after.name === 'string' ? after.name : null,
        metadata: { field: c.field, from: c.from, to: c.to },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
);

// 채팅 — 메시지 저장 뒤 방 미리보기 · 안 읽은 수 · 푸시 (functions/src/chat.ts)
export { chatOnMessageCreated, chatOnMessageUpdated } from './chat';
// 채팅 — 캠프 코드를 만들면 방 5개, 배정이 바뀌면 방 사람 맞추기 (functions/src/chatSync.ts)
export { chatOnUserWritten, chatOnJobCodeWritten } from './chatSync';
// 채팅 — 예약 메시지를 1분마다 보낸다 (functions/src/chatScheduled.ts)
export { chatSendScheduled } from './chatScheduled';
