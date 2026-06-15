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
          isForeign ? 'Permission Denied' : '위치 권한 거부됨',
          isForeign
            ? 'You can enable location access in your device settings.'
            : '기기 설정에서 위치 접근을 허용할 수 있습니다.',
          [
            { text: isForeign ? 'Cancel' : '취소', style: 'cancel' },
            {
              text: isForeign ? 'Open Settings' : '설정 열기',
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
          isForeign ? 'Background Location Denied' : '백그라운드 위치 권한 거부됨',
          isForeign
            ? 'To enable background location, please select "Allow all the time" in your device settings.'
            : '백그라운드 위치 공유를 사용하려면 기기 설정에서 "항상 허용"을 선택해 주세요.',
          [
            { text: isForeign ? 'Cancel' : '취소', style: 'cancel' },
            {
              text: isForeign ? 'Open Settings' : '설정 열기',
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
