import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Unsubscribe,
  Firestore,
  getFirestore,
} from 'firebase/firestore';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import * as TaskManager from 'expo-task-manager';
import { logger } from '@smis-mentor/shared';
import type { UserRole } from '@smis-mentor/shared';

// 백그라운드 위치 업데이트 Task 이름
const BG_LOCATION_TASK = 'SMIS_BG_LOCATION_UPDATE';

// 백그라운드 태스크에서 접근할 수 있도록 모듈 레벨에 컨텍스트 저장
// (태스크는 별도 컨텍스트에서 실행되므로 getFirestore()로 새로 연결)
let bgContext: {
  userId: string;
  campCode: string;
  userInfo: {
    displayName: string;
    photoURL: string | null;
    role: UserRole;
    group: string | null;
    groupRole: string | null;
    classCode: string | null;
  };
} | null = null;

// 백그라운드 위치 태스크 등록 (앱 최상위에서 한 번만 실행됨)
TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    logger.error('[BgLocation] 태스크 오류:', error.message);
    return;
  }
  if (!data || !bgContext) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const latest = locations[locations.length - 1];
  if (!latest) return;

  try {
    const db = getFirestore();
    const { batteryLevel, isCharging } = await getBatteryInfo();
    const docId = getLocationDocId(bgContext.campCode, bgContext.userId);
    await updateDoc(doc(db, 'userLocations', docId), {
      lat: latest.coords.latitude,
      lng: latest.coords.longitude,
      batteryLevel,
      isCharging,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    logger.warn('[BgLocation] Firestore 업데이트 실패:', e);
  }
});

export interface UserLocationData {
  userId: string;
  campCode: string;
  lat: number;
  lng: number;
  displayName: string;
  photoURL: string | null;
  role: UserRole;
  // 캠프 그룹 (예: 'junior', 'summer' 등). 없으면 null
  group: string | null;
  // 캠프 그룹 내 역할 (예: '담임', 'Speaking' 등). 없으면 null
  groupRole: string | null;
  // 담당 반 코드 (예: 'A1'). 없으면 null
  classCode: string | null;
  isSharing: boolean;
  // 0~1 사이 값 (예: 0.85 = 85%), null이면 미지원 기기
  batteryLevel: number | null;
  // 충전 중 여부
  isCharging: boolean;
  updatedAt: unknown; // Firestore Timestamp (서버 타임스탬프)
}

// watchPositionAsync에서 반환되는 subscription 타입
type LocationSubscription = { remove: () => void };

// 현재 활성 위치 감시 subscription (모듈 레벨 싱글톤)
let activeLocationSubscription: LocationSubscription | null = null;

// 문서 ID 생성 헬퍼: {campCode}_{userId}
const getLocationDocId = (campCode: string, userId: string): string =>
  `${campCode}_${userId}`;

// 위치 권한 허용 수준
export type LocationPermissionLevel = 'denied' | 'whenInUse' | 'always';

// 위치 권한을 요청하고 허용 수준을 반환
// 1단계: 포그라운드 권한 요청 → 2단계: 백그라운드 권한 요청 (포그라운드 허용 후에만 가능)
export const requestLocationPermission =
  async (): Promise<LocationPermissionLevel> => {
    const { status: fgStatus } =
      await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== Location.PermissionStatus.GRANTED) return 'denied';

    // 백그라운드 권한 요청 (iOS: "항상 허용" / Android: "항상 허용")
    try {
      const { status: bgStatus } =
        await Location.requestBackgroundPermissionsAsync();
      return bgStatus === Location.PermissionStatus.GRANTED
        ? 'always'
        : 'whenInUse';
    } catch {
      // Expo Go 등 백그라운드 권한 API 미지원 환경
      return 'whenInUse';
    }
  };

// 현재 위치 권한 상태 확인 (권한 요청 없이 확인만)
export const getLocationPermissionStatus =
  async (): Promise<LocationPermissionLevel> => {
    const { status: fgStatus } =
      await Location.getForegroundPermissionsAsync();
    if (fgStatus !== Location.PermissionStatus.GRANTED) return 'denied';

    try {
      const { status: bgStatus } =
        await Location.getBackgroundPermissionsAsync();
      return bgStatus === Location.PermissionStatus.GRANTED
        ? 'always'
        : 'whenInUse';
    } catch {
      return 'whenInUse';
    }
  };

// 백그라운드 위치 업데이트 시작
// Expo Go에서는 백그라운드 태스크가 지원되지 않으므로 조용히 실패
const startBackgroundLocationUpdates = async (
  userId: string,
  campCode: string,
  userInfo: {
    displayName: string;
    photoURL: string | null;
    role: UserRole;
    group: string | null;
    groupRole: string | null;
    classCode: string | null;
  }
): Promise<void> => {
  try {
    // 이미 실행 중이면 중복 등록 방지
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);
    if (isRunning) return;

    bgContext = { userId, campCode, userInfo };

    await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15000, // 백그라운드에서는 15초 간격 (배터리 절약)
      distanceInterval: 20, // 20m 이동 시 업데이트
      // iOS: 백그라운드 앱 새로고침 허용 알림 표시
      showsBackgroundLocationIndicator: true,
      // Android: foreground service 알림 (백그라운드 위치 권한 필요)
      foregroundService: {
        notificationTitle: 'SMIS Mentor',
        notificationBody: '위치 공유 중',
        notificationColor: '#3b82f6',
      },
    });
  } catch (e) {
    // Expo Go / 개발 빌드 미지원 환경에서는 무시
    logger.warn('[BgLocation] 백그라운드 위치 업데이트 시작 실패 (Expo Go에서는 미지원):', e);
  }
};

// 백그라운드 위치 업데이트 중지
const stopBackgroundLocationUpdates = async (): Promise<void> => {
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
    }
    bgContext = null;
  } catch (e) {
    logger.warn('[BgLocation] 백그라운드 위치 업데이트 중지 실패:', e);
  }
};

// 배터리 정보 가져오기 (실패해도 null 반환)
const getBatteryInfo = async (): Promise<{
  batteryLevel: number | null;
  isCharging: boolean;
}> => {
  try {
    const [level, state] = await Promise.all([
      Battery.getBatteryLevelAsync(),
      Battery.getBatteryStateAsync(),
    ]);
    return {
      batteryLevel: level >= 0 ? level : null,
      isCharging:
        state === Battery.BatteryState.CHARGING ||
        state === Battery.BatteryState.FULL,
    };
  } catch {
    return { batteryLevel: null, isCharging: false };
  }
};

// Firestore에 위치 문서를 upsert하는 내부 헬퍼
const upsertLocationDoc = async (
  db: Firestore,
  userId: string,
  campCode: string,
  coords: { latitude: number; longitude: number },
  userInfo: {
    displayName: string;
    photoURL: string | null;
    role: UserRole;
    group: string | null;
    groupRole: string | null;
    classCode: string | null;
  },
  isSharing: boolean
): Promise<void> => {
  const { batteryLevel, isCharging } = await getBatteryInfo();
  const docId = getLocationDocId(campCode, userId);
  await setDoc(
    doc(db, 'userLocations', docId),
    {
      userId,
      campCode,
      lat: coords.latitude,
      lng: coords.longitude,
      displayName: userInfo.displayName,
      photoURL: userInfo.photoURL,
      role: userInfo.role,
      group: userInfo.group,
      groupRole: userInfo.groupRole,
      classCode: userInfo.classCode,
      isSharing,
      batteryLevel,
      isCharging,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

// 현재 위치를 가져오는 내부 헬퍼
// 1순위: 캐시된 마지막 위치 (즉시 반환) → 2순위: getCurrentPositionAsync (3초 타임아웃)
const getInitialPosition =
  async (): Promise<Location.LocationObject | null> => {
    // 캐시된 위치를 먼저 시도 (즉시 반환 → 빠른 UX)
    try {
      const last = await Location.getLastKnownPositionAsync({
        maxAge: 10 * 60 * 1000, // 10분 이내 캐시 허용
      });
      if (last) return last;
    } catch (e) {
      logger.warn('[LocationSharing] getLastKnownPositionAsync 실패:', e);
    }

    // 캐시 없으면 현재 위치 요청 (3초 타임아웃)
    try {
      const result = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      if (result) return result;
    } catch (e) {
      logger.warn('[LocationSharing] getCurrentPositionAsync 실패:', e);
    }

    return null;
  };

// 위치 공유 시작: Firestore에 isSharing=true 문서 생성/업데이트 + 위치 감시 시작
// 권한 확인은 호출 측(LocationSharingScreen)에서 사전 처리하므로 여기서는 재요청하지 않음
export const startLocationSharing = async (
  db: Firestore,
  userId: string,
  campCode: string,
  userInfo: {
    displayName: string;
    photoURL: string | null;
    role: UserRole;
    group: string | null;
    groupRole: string | null;
    classCode: string | null;
  }
): Promise<boolean> => {
  // 기존 감시가 있으면 먼저 중지
  if (activeLocationSubscription) {
    activeLocationSubscription.remove();
    activeLocationSubscription = null;
  }

  // 초기 위치 획득과 watchPositionAsync 시작을 병렬 처리
  // → 초기 위치를 기다리는 동안 감시도 미리 준비
  const [initialPosition, watchSubscription] = await Promise.all([
    getInitialPosition(),
    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000, // 5초마다
        distanceInterval: 10, // 10m 이동 시
      },
      async (locationUpdate) => {
        try {
          const { batteryLevel, isCharging } = await getBatteryInfo();
          const docId = getLocationDocId(campCode, userId);
          await updateDoc(doc(db, 'userLocations', docId), {
            lat: locationUpdate.coords.latitude,
            lng: locationUpdate.coords.longitude,
            batteryLevel,
            isCharging,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // 위치 업데이트 실패는 무시 (네트워크 오류 등)
        }
      }
    ).catch((e) => {
      logger.error('[LocationSharing] watchPositionAsync 시작 실패:', e);
      return null;
    }),
  ]);

  if (!watchSubscription) return false;
  activeLocationSubscription = watchSubscription;

  // 초기 위치로 Firestore 문서 생성 (있는 경우)
  // 없으면 watchPositionAsync 첫 콜백에서 updateDoc이 실패하므로 upsert로 처리
  if (initialPosition) {
    try {
      await upsertLocationDoc(db, userId, campCode, initialPosition.coords, userInfo, true);
    } catch (e) {
      logger.error('[LocationSharing] Firestore 초기 위치 저장 실패:', e);
      activeLocationSubscription.remove();
      activeLocationSubscription = null;
      return false;
    }
  } else {
    // 캐시된 위치도 없는 경우: watchPositionAsync 첫 콜백에서 upsert로 문서 생성
    const originalCallback = activeLocationSubscription;
    let firstUpdateDone = false;
    activeLocationSubscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
      async (locationUpdate) => {
        try {
          if (!firstUpdateDone) {
            firstUpdateDone = true;
            await upsertLocationDoc(db, userId, campCode, locationUpdate.coords, userInfo, true);
          } else {
            const { batteryLevel, isCharging } = await getBatteryInfo();
            const docId = getLocationDocId(campCode, userId);
            await updateDoc(doc(db, 'userLocations', docId), {
              lat: locationUpdate.coords.latitude,
              lng: locationUpdate.coords.longitude,
              batteryLevel,
              isCharging,
              updatedAt: serverTimestamp(),
            });
          }
        } catch {
          // 위치 업데이트 실패는 무시
        }
      }
    ).catch(() => null);
    originalCallback.remove(); // 이전 감시 중단
    if (!activeLocationSubscription) return false;
  }

  // 백그라운드 위치 업데이트 시작 (Expo Go에서는 조용히 실패)
  startBackgroundLocationUpdates(userId, campCode, userInfo); // await 없이 논블로킹

  return true;
};

// 위치 공유 중지: 위치 감시 중단 + Firestore에 isSharing=false 업데이트
export const stopLocationSharing = async (
  db: Firestore,
  userId: string,
  campCode: string
): Promise<void> => {
  if (activeLocationSubscription) {
    activeLocationSubscription.remove();
    activeLocationSubscription = null;
  }

  // Firestore 업데이트와 백그라운드 중지를 병렬 처리 (순서 의존성 없음)
  await Promise.all([
    (async () => {
      try {
        const docId = getLocationDocId(campCode, userId);
        await updateDoc(doc(db, 'userLocations', docId), {
          isSharing: false,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // 문서가 없는 경우 등 무시
      }
    })(),
    stopBackgroundLocationUpdates(),
  ]);
};

// 포그라운드 위치 감시만 중단 (백그라운드 태스크는 계속 실행)
// AppState가 background로 전환될 때 호출 — 백그라운드 태스크가 대신 업데이트를 이어받음
export const pauseLocationWatcher = (): void => {
  if (activeLocationSubscription) {
    activeLocationSubscription.remove();
    activeLocationSubscription = null;
  }
};

// 같은 캠프코드에서 공유 중인 유저 위치를 실시간 구독
export const subscribeToLocationSharing = (
  db: Firestore,
  campCode: string,
  callback: (locations: UserLocationData[]) => void
): Unsubscribe => {
  const q = query(
    collection(db, 'userLocations'),
    where('campCode', '==', campCode),
    where('isSharing', '==', true)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const locations: UserLocationData[] = snapshot.docs.map(
        (d) => d.data() as UserLocationData
      );
      callback(locations);
    },
    () => {
      // 구독 오류 시 빈 배열 반환
      callback([]);
    }
  );
};
