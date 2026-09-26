import { useState, useCallback, useEffect } from 'react';
import { Alert, Linking, AppState, AppStateStatus, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { logger } from '@smis-mentor/shared';
import {
  getLocationPermissionStatus,
  requestForegroundLocationPermission,
  requestBackgroundLocationPermission,
  type LocationPermissionLevel,
} from '../services/locationSharingService';
import { L } from '@smis-mentor/shared';

export type { LocationPermissionLevel };

interface UseLocationPermissionOptions {
  isForeign?: boolean;
}

export function useLocationPermission({
  isForeign = false,
}: UseLocationPermissionOptions = {}) {
  const [permissionLevel, setPermissionLevel] =
    useState<LocationPermissionLevel>('denied');
  const [requesting, setRequesting] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const level = await getLocationPermissionStatus();
      setPermissionLevel(level);
    } catch (error) {
      logger.error('위치 권한 상태 확인 실패:', error);
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
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active') {
          checkStatus();
        }
      }
    );
    return () => subscription.remove();
  }, [checkStatus]);

  // 포그라운드 위치 권한 요청
  const requestForegroundPermission = useCallback(async () => {
    if (permissionLevel !== 'denied') return;

    try {
      setRequesting(true);
      const result = await requestForegroundLocationPermission();
      if (result === 'granted') {
        setPermissionLevel('whenInUse');
      } else {
        setPermissionLevel('denied');
        Alert.alert(
          L('location.permissionDenied'),
          L('location.youCanEnableLocationAccess'),
          [
            { text: L('common.cancel'), style: 'cancel' },
            {
              text: L('common.openSettings'),
              onPress: () => Linking.openSettings(),
            },
          ]
        );
      }
    } catch (error) {
      logger.error('포그라운드 위치 권한 요청 실패:', error);
    } finally {
      setRequesting(false);
    }
  }, [permissionLevel, isForeign]);

  // 백그라운드 위치 권한 요청 (포그라운드 허용 후에만 호출)
  // Android에서만 별도로 필요하며, iOS는 단일 단계로 처리됨
  const requestBackgroundPermission = useCallback(async () => {
    if (permissionLevel !== 'whenInUse') return;
    if (Platform.OS !== 'android') return;

    try {
      setRequesting(true);
      const result = await requestBackgroundLocationPermission();
      setPermissionLevel(result);

      if (result !== 'always') {
        Alert.alert(
          L('location.backgroundLocationDenied'),
          L('location.toEnableBackgroundLocationPlease'),
          [
            { text: L('common.cancel'), style: 'cancel' },
            {
              text: L('common.openSettings'),
              onPress: () => Linking.openSettings(),
            },
          ]
        );
      }
    } catch (error) {
      logger.error('백그라운드 위치 권한 요청 실패:', error);
    } finally {
      setRequesting(false);
    }
  }, [permissionLevel, isForeign]);

  // 시스템 설정 앱 열기
  const openSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  return {
    permissionLevel,
    requesting,
    checkStatus,
    requestForegroundPermission,
    requestBackgroundPermission,
    openSettings,
  };
}
