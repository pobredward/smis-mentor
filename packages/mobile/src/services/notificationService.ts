import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { doc, setDoc, getDoc, deleteField } from 'firebase/firestore';
import { db } from '../config/firebase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,    // 배너 표시 (상단 알림)
    shouldShowList: true,      // 알림 센터에 표시
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface NotificationSettings {
  taskReminders: boolean;
  generalNotifications: boolean;
}

// Expo Go 환경인지 확인
function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  let token: string | undefined;

  // Expo Go에서는 원격 푸시 알림이 지원되지 않으므로 스킵
  if (isExpoGo()) {
    console.log('⚠️ Expo Go에서는 원격 푸시 알림이 지원되지 않습니다.');
    console.log('💡 Development Build를 사용하여 푸시 알림을 테스트하세요.');
    return undefined;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3b82f6',
    });
    
    await Notifications.setNotificationChannelAsync('task-reminders', {
      name: '업무 알림',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3b82f6',
      description: '업무 마감 시간 알림',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('푸시 알림 권한이 거부되었습니다.');
      return;
    }
    
    try {
      token = (await Notifications.getExpoPushTokenAsync({
        projectId: '684d0445-c299-4e77-a362-42efa9c671ac',
      })).data;
      
      console.log('Expo Push Token:', token);
    } catch (error) {
      console.error('푸시 토큰 발급 실패:', error);
      return undefined;
    }
  } else {
    console.log('실제 기기에서만 푸시 알림을 사용할 수 있습니다.');
  }

  return token;
}

export async function savePushToken(userId: string, token: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(
      userRef,
      {
        pushTokens: {
          [token]: {
            platform: Platform.OS,
            addedAt: new Date(),
            lastUsed: new Date(),
          },
        },
      },
      { merge: true }
    );
    console.log('푸시 토큰 저장 완료:', token);
  } catch (error) {
    console.error('푸시 토큰 저장 실패:', error);
    throw error;
  }
}

export async function removePushToken(userId: string, token: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(
      userRef,
      {
        pushTokens: {
          [token]: deleteField(),
        },
      },
      { merge: true }
    );
    console.log('푸시 토큰 제거 완료:', token);
  } catch (error) {
    console.error('푸시 토큰 제거 실패:', error);
    throw error;
  }
}

export async function getNotificationSettings(userId: string): Promise<NotificationSettings> {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return {
        taskReminders: true,
        generalNotifications: true,
      };
    }
    
    const data = userDoc.data();
    return {
      taskReminders: data.notificationSettings?.taskReminders ?? true,
      generalNotifications: data.notificationSettings?.generalNotifications ?? true,
    };
  } catch (error) {
    console.error('알림 설정 조회 실패:', error);
    return {
      taskReminders: true,
      generalNotifications: true,
    };
  }
}

export async function updateNotificationSettings(
  userId: string,
  settings: Partial<NotificationSettings>
): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(
      userRef,
      {
        notificationSettings: settings,
      },
      { merge: true }
    );
    console.log('알림 설정 업데이트 완료:', settings);
  } catch (error) {
    console.error('알림 설정 업데이트 실패:', error);
    throw error;
  }
}

export async function scheduleTaskReminderNotification(
  taskId: string,
  title: string,
  scheduledTime: Date
): Promise<string> {
  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: '📌 업무 알림',
      body: `"${title}" 업무 확인이 필요합니다.`,
      data: { taskId, type: 'task-reminder' },
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
      categoryIdentifier: 'task-reminders',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: scheduledTime,
    },
  });
  
  return identifier;
}

export async function cancelScheduledNotification(identifier: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier);
}

export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseReceivedListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}
