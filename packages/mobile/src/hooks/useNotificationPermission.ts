import { useState, useCallback, useEffect } from 'react';
import { Alert, Linking, AppState, AppStateStatus } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { logger } from '@smis-mentor/shared';
import { L } from '@smis-mentor/shared';

export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined';

interface UseNotificationPermissionOptions {
  isForeign?: boolean;
}

export function useNotificationPermission({ isForeign = false }: UseNotificationPermissionOptions = {}) {
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionStatus>('undetermined');
  const [requesting, setRequesting] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
      if (granted) {
        setPermissionStatus('granted');
      } else if (canAskAgain) {
        setPermissionStatus('undetermined');
      } else {
        setPermissionStatus('denied');
      }
    } catch (error) {
      logger.error('알림 권한 상태 확인 실패:', error);
    }
  }, []);

  // 화면 포커스 시마다 재확인 (설정 앱에서 돌아왔을 때 반영)
  useFocusEffect(
    useCallback(() => {
      checkStatus();
    }, [checkStatus])
  );

  // 앱이 포그라운드로 돌아올 때 재확인
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkStatus();
      }
    });
    return () => subscription.remove();
  }, [checkStatus]);

  const requestPermission = useCallback(async () => {
    if (permissionStatus === 'granted') {
      Alert.alert(
        L('settings.notificationsEnabled'),
        L('settings.notificationsAreAlreadyEnabledFor')
      );
      return;
    }

    if (permissionStatus === 'undetermined') {
      try {
        setRequesting(true);
        const { granted } = await Notifications.requestPermissionsAsync();
        setPermissionStatus(granted ? 'granted' : 'denied');
        if (!granted) {
          Alert.alert(
            L('settings.permissionDenied'),
            L('settings.youCanEnableNotificationsIn'),
            [
              { text: L('common.cancel'), style: 'cancel' },
              { text: L('common.openSettings'), onPress: () => Linking.openSettings() },
            ]
          );
        }
      } catch (error) {
        logger.error('알림 권한 요청 실패:', error);
      } finally {
        setRequesting(false);
      }
      return;
    }

    // 이미 거부된 경우 → 시스템 설정으로 이동
    Alert.alert(
      L('settings.enableNotifications'),
      L('settings.notificationsAreCurrentlyBlockedPlease'),
      [
        { text: L('common.cancel'), style: 'cancel' },
        { text: L('common.openSettings'), onPress: () => Linking.openSettings() },
      ]
    );
  }, [permissionStatus, isForeign]);

  return { permissionStatus, requesting, requestPermission, checkStatus };
}
