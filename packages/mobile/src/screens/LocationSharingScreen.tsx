import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  Linking,
  AppState,
  AppStateStatus,
  ActivityIndicator,
  Animated,
  ScrollView,
  Platform,
  Pressable,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { jobCodesService } from '../services';
import {
  startLocationSharing,
  stopLocationSharing,
  subscribeToLocationSharing,
  getLocationPermissionStatus,
  requestForegroundLocationPermission,
  pauseLocationWatcher,
  UserLocationData,
  type LocationPermissionLevel,
} from '../services/locationSharingService';
import { LocationPermissionDisclosureModal } from '../components/LocationPermissionDisclosureModal';
import type { Unsubscribe } from 'firebase/firestore';
import type { UserRole } from '@smis-mentor/shared';
import { getGroupLabel } from '../../../shared/src/types/camp';

// Google Play 정책: 사용자가 위치 수집 disclosure에 동의했음을 기록하는 키
// 앱 설치 후 최초 1회 동의 기록. 재설치 시 다시 동의 필요.
const LOCATION_DISCLOSURE_CONSENT_KEY = 'location_disclosure_consent_v1';

// 역할별 마커 색상
const getRoleColor = (role: UserRole | string): string => {
  switch (role) {
    case 'admin':
      return '#9333ea';
    case 'mentor':
    case 'mentor_temp':
      return '#3b82f6';
    case 'foreign':
    case 'foreign_temp':
      return '#10b981';
    default:
      return '#6b7280';
  }
};

// 배터리 레벨(0~1)을 아이콘명과 색상으로 변환
const getBatteryDisplay = (
  level: number | null,
  isCharging: boolean
): { icon: string; color: string; label: string } => {
  if (isCharging) {
    return { icon: 'battery-charging', color: '#10b981', label: '충전 중' };
  }
  if (level === null) {
    return { icon: 'battery-unknown', color: '#94a3b8', label: '-' };
  }
  const pct = Math.round(level * 100);
  if (pct >= 80) return { icon: 'battery-full', color: '#10b981', label: `${pct}%` };
  if (pct >= 50) return { icon: 'battery-half', color: '#f59e0b', label: `${pct}%` };
  if (pct >= 20) return { icon: 'battery-dead', color: '#f97316', label: `${pct}%` };
  return { icon: 'battery-dead', color: '#ef4444', label: `${pct}%` };
};

// 역할 한글 라벨
const getRoleLabel = (role: UserRole | string): string => {
  switch (role) {
    case 'admin':
      return '관리자';
    case 'mentor':
      return '멘토';
    case 'mentor_temp':
      return '멘토(임시)';
    case 'foreign':
      return '원어민';
    case 'foreign_temp':
      return '원어민(임시)';
    default:
      return '스태프';
  }
};

// 커스텀 마커 컴포넌트
// iOS/Android 모두: 렌더 완료 콜백을 받아 tracksViewChanges 전환에 사용
const UserMarker = React.memo(
  ({
    location,
    isMe,
    onReady,
  }: {
    location: UserLocationData;
    isMe: boolean;
    onReady?: () => void;
  }) => {
    const color = isMe ? '#ef4444' : getRoleColor(location.role);
    return (
      <View style={styles.markerContainer}>
        <View
          style={[
            styles.markerBubble,
            { borderColor: color, backgroundColor: isMe ? '#fee2e2' : '#ffffff' },
          ]}
        >
          {location.photoURL ? (
            <Image
              source={{ uri: location.photoURL }}
              style={styles.markerAvatar}
              contentFit="cover"
              // onLoad: expo-image가 이미지를 디코딩·렌더 완료한 시점 (iOS/Android 공통)
              onLoad={onReady}
            />
          ) : (
            <View
              style={[styles.markerAvatarFallback, { backgroundColor: color }]}
              onLayout={onReady}
            >
              <Text style={styles.markerAvatarText}>
                {location.displayName.charAt(0)}
              </Text>
            </View>
          )}
        </View>
        <View style={[styles.markerArrow, { borderTopColor: color }]} />
        <Text style={[styles.markerName, { color }]} numberOfLines={1}>
          {isMe ? '나' : location.displayName}
        </Text>
      </View>
    );
  }
);

// iOS/Android 공통: tracksViewChanges를 렌더 완료 후 false로 전환하는 마커 래퍼
// photoURL이 있는 경우 이미지 로드 완료 후, 없는 경우 레이아웃 완료 후 전환
const TrackedMarker = ({
  coordinate,
  onPress,
  location,
  isMe,
}: {
  coordinate: { latitude: number; longitude: number };
  onPress: () => void;
  location: UserLocationData;
  isMe: boolean;
}) => {
  // 항상 true로 시작해 렌더 완료 후 false로 전환 (iOS/Android 동일)
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  const handleReady = useCallback(() => {
    setTracksViewChanges(false);
  }, []);

  return (
    <Marker
      coordinate={coordinate}
      tracksViewChanges={tracksViewChanges}
      onPress={onPress}
    >
      <UserMarker location={location} isMe={isMe} onReady={handleReady} />
    </Marker>
  );
};

// 한국 중심 기본 지도 영역
const DEFAULT_REGION: Region = {
  latitude: 36.5,
  longitude: 127.8,
  latitudeDelta: 3.5,
  longitudeDelta: 3.5,
};

export function LocationSharingScreen() {
  const { userData, setIsSharingLocation } = useAuth();
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const mapRef = useRef<MapView | null>(null);

  const [isSharing, setIsSharing] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [campCode, setCampCode] = useState<string | null>(null);
  const [sharedLocations, setSharedLocations] = useState<UserLocationData[]>([]);
  const [myLocation, setMyLocation] = useState<UserLocationData | null>(null);
  const [isLoadingCampCode, setIsLoadingCampCode] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserLocationData | null>(null);
  // 바텀시트 표시 여부 (pointerEvents 제어용 — 항상 마운트해 초기 딜레이 제거)
  const [sheetVisible, setSheetVisible] = useState(false);
  // Google Play 정책: OS 권한 요청 직전 명시적 공개(Prominent Disclosure) 모달
  const [showDisclosureModal, setShowDisclosureModal] = useState(false);
  // disclosure 모달 표시 시점의 권한 상태 (모달 텍스트 분기용)
  const [disclosureHasPermission, setDisclosureHasPermission] = useState(false);
  // 위치 데이터 수집 안내 배너 접힘 여부 (초기값 false — 첫 진입 시 항상 펼쳐진 상태)
  const [bannerCollapsed, setBannerCollapsed] = useState(false);

  // 바텀시트 애니메이션
  const sheetY = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const unsubscribeRef = useRef<Unsubscribe | null>(null);
  const isSharingRef = useRef(false); // AppState 핸들러에서 최신 값 참조용
  const hasInitialFitRef = useRef(false); // 최초 1회 지도 범위 조정 완료 여부
  // 앱 재시작 후 Firestore isSharing 상태로 자동 복구 시도했는지 여부
  const hasAutoResumedRef = useRef(false);

  // 배너 접힘 상태 복원 (AsyncStorage)
  useEffect(() => {
    AsyncStorage.getItem('location_disclosure_banner_collapsed')
      .then((value) => { if (value === 'true') setBannerCollapsed(true); })
      .catch(() => {});
  }, []);

  // 활성 캠프코드 로드
  useEffect(() => {
    const activeJobCodeId =
      userData?.activeJobExperienceId ?? userData?.jobExperiences?.[0]?.id;

    if (!activeJobCodeId) {
      setIsLoadingCampCode(false);
      return;
    }

    jobCodesService
      .getJobCodesByIds([activeJobCodeId])
      .then((codes) => {
        if (codes.length > 0 && codes[0].code) {
          setCampCode(codes[0].code);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingCampCode(false));
  }, [userData?.activeJobExperienceId, userData?.jobExperiences]);

  // 공유 중인 유저들이 보이도록 지도 범위 조정
  const fitMapToLocations = useCallback((locations: UserLocationData[]) => {
    if (!mapRef.current || locations.length === 0) return;

    if (locations.length === 1) {
      mapRef.current.animateToRegion(
        {
          latitude: locations[0].lat,
          longitude: locations[0].lng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        600
      );
      return;
    }

    mapRef.current.fitToCoordinates(
      locations.map((l) => ({ latitude: l.lat, longitude: l.lng })),
      {
        edgePadding: { top: 80, right: 60, bottom: 60, left: 60 },
        animated: true,
      }
    );
  }, []);

  // 캠프코드가 결정되면 Firestore 실시간 구독 시작
  useEffect(() => {
    if (!campCode) return;

    unsubscribeRef.current?.();
    hasInitialFitRef.current = false; // 캠프코드 변경 시 초기 fit 리셋

    unsubscribeRef.current = subscribeToLocationSharing(
      db,
      campCode,
      (locations) => {
        const me = locations.find((l) => l.userId === userData?.userId);
        setMyLocation(me ?? null);
        setSharedLocations(locations);

        // 내가 공유 중인 경우 공유 상태 동기화
        if (me) {
          setIsSharing(me.isSharing);
          isSharingRef.current = me.isSharing;
        }

        // 앱 재시작 후 Firestore에 isSharing=true가 남아있으면 자동으로 GPS 감시 재개
        // hasAutoResumedRef로 1회만 시도 (무한 루프 방지)
        // Google Play 정책: AsyncStorage 동의 기록이 없는 경우(최초 설치 후 미동의)
        //   자동 복구 차단 → Firestore isSharing 초기화 → 사용자가 토글로 재동의 필요
        if (!hasAutoResumedRef.current && me?.isSharing && userData) {
          hasAutoResumedRef.current = true;
          const capturedUserData = userData;

          void (async () => {
            // 동의 기록 확인 (null이면 아직 AsyncStorage를 읽지 못한 상태)
            const consentValue = await AsyncStorage.getItem(LOCATION_DISCLOSURE_CONSENT_KEY).catch(() => null);
            const hasConsent = consentValue === 'true';

            if (!hasConsent) {
              // 동의 기록 없음: 자동 복구 차단, Firestore 상태 초기화
              stopLocationSharing(db, capturedUserData.userId, campCode).catch(() => {});
              setIsSharing(false);
              isSharingRef.current = false;
              setIsSharingLocation(false);
            } else {
              const activeExp =
                capturedUserData.jobExperiences?.find(
                  (e) => e.id === capturedUserData.activeJobExperienceId
                ) ?? capturedUserData.jobExperiences?.[0];
              startLocationSharing(db, capturedUserData.userId, campCode, {
                displayName: capturedUserData.name,
                photoURL: capturedUserData.profileImage ?? null,
                role: capturedUserData.role,
                group: activeExp?.group ?? null,
                groupRole: activeExp?.groupRole ?? null,
                classCode: activeExp?.classCode ?? null,
              }).then((success) => {
                if (success) {
                  setIsSharing(true);
                  isSharingRef.current = true;
                  setIsSharingLocation(true);
                } else {
                  // GPS 재개 실패 시 Firestore isSharing 초기화 (고스트 상태 방지)
                  stopLocationSharing(db, capturedUserData.userId, campCode).catch(() => {});
                  setIsSharing(false);
                  isSharingRef.current = false;
                }
              }).catch(() => {});
            }
          })();
        }

        // 처음 데이터를 받았을 때만 1회 지도 범위 조정
        if (!hasInitialFitRef.current && locations.length > 0) {
          hasInitialFitRef.current = true;
          setTimeout(() => fitMapToLocations(locations), 300);
        }
      }
    );

    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [campCode, userData?.userId, fitMapToLocations]);

  // 앱 상태 변화 처리 (백그라운드 진입 시 위치 감시 중지)
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (!userData?.userId || !campCode) return;

      if (nextState === 'background' || nextState === 'inactive') {
        if (isSharingRef.current) {
          // 위치 감시만 중단, Firestore isSharing 상태는 유지 (포그라운드 복귀 시 재개)
          pauseLocationWatcher();
        }
      } else if (nextState === 'active') {
        if (isSharingRef.current) {
          const activeExp = userData.jobExperiences?.find(
            (e) => e.id === userData.activeJobExperienceId
          ) ?? userData.jobExperiences?.[0];
          // 포그라운드 복귀 시 위치 감시 재개
          await startLocationSharing(db, userData.userId, campCode, {
            displayName: userData.name,
            photoURL: userData.profileImage ?? null,
            role: userData.role,
            group: activeExp?.group ?? null,
            groupRole: activeExp?.groupRole ?? null,
            classCode: activeExp?.classCode ?? null,
          });
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [userData, campCode]);

  // 화면 이탈 시 위치 감시는 유지 (탭 전환이므로 공유 상태 유지)
  useFocusEffect(
    useCallback(() => {
      return () => {
        // 탭 전환 시 위치 감시는 계속 유지 (명시적 토글 OFF만 중단)
      };
    }, [])
  );

  // 유저 카드 표시 (바텀시트 슬라이드 업 — state 변경 없이 즉시 애니메이션)
  const showUserCard = useCallback((loc: UserLocationData) => {
    setSelectedUser(loc);
    setSheetVisible(true);
    // Animated 값은 이미 초기화돼 있으므로 즉시 시작
    sheetY.setValue(Dimensions.get('window').height);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(sheetY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 3,
        speed: 18,       // 더 빠르게
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [sheetY, backdropOpacity]);

  // 유저 카드 닫기 (슬라이드 다운 후 숨김)
  const hideUserCard = useCallback(() => {
    Animated.parallel([
      Animated.timing(sheetY, {
        toValue: Dimensions.get('window').height,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSheetVisible(false);
      setSelectedUser(null);
    });
  }, [sheetY, backdropOpacity]);

  // 백그라운드 권한이 없을 때 LocationSettingsScreen으로 유도
  // Google Play 정책: 백그라운드 권한 요청은 별도 공개 화면에서 처리
  const showBackgroundPermissionGuide = useCallback(() => {
    Alert.alert(
      isForeign ? 'Enable Background Location' : '백그라운드 위치 설정',
      isForeign
        ? 'Location sharing is active while the app is open. To keep sharing in the background, enable "Always" location access in Location Settings.'
        : '앱을 사용하는 동안 위치 공유가 활성화되었습니다. 앱을 최소화해도 계속 공유하려면 위치 설정에서 백그라운드 위치를 허용해 주세요.',
      [
        { text: isForeign ? 'Later' : '나중에', style: 'cancel' },
        {
          text: isForeign ? 'Location Settings' : '위치 설정',
          onPress: () => navigation.navigate('LocationSettings'),
        },
      ]
    );
  }, [isForeign, navigation]);

  // disclosure 모달에서 동의 후 실제 권한 요청 및 공유 시작
  // Google Play 정책 준수:
  // - disclosure 모달은 항상 수집 시작 직전에 표시됨 (권한 유무 무관)
  // - 동의 시 AsyncStorage에 기록 저장 (재설치 전까지 유지)
  // - 백그라운드 권한은 포그라운드 허용 후 별도 안내(LocationSettingsScreen)로 유도
  const handleDisclosureAccept = useCallback(async () => {
    setShowDisclosureModal(false);

    if (!userData || !campCode) return;

    // Google Play 정책: 동의 기록 저장
    await AsyncStorage.setItem(LOCATION_DISCLOSURE_CONSENT_KEY, 'true').catch(() => {});

    setIsToggling(true);
    try {
      const currentPerm = await getLocationPermissionStatus();

      if (currentPerm === 'denied') {
        // 권한이 없는 경우: 포그라운드 권한 요청
        const fgResult = await requestForegroundLocationPermission();

        if (fgResult === 'denied') {
          Alert.alert(
            isForeign ? 'Location Permission Required' : '위치 권한 필요',
            isForeign
              ? 'Location access is required to use location sharing. Please allow it in your device settings.'
              : '위치 공유를 사용하려면 설정에서 위치 권한을 허용해야 합니다.',
            [
              { text: isForeign ? 'Cancel' : '취소', style: 'cancel' },
              { text: isForeign ? 'Open Settings' : '설정 열기', onPress: () => Linking.openSettings() },
            ]
          );
          return;
        }
      }

      const activeExp =
        userData.jobExperiences?.find(
          (e) => e.id === userData.activeJobExperienceId
        ) ?? userData.jobExperiences?.[0];

      const success = await startLocationSharing(db, userData.userId, campCode, {
        displayName: userData.name,
        photoURL: userData.profileImage ?? null,
        role: userData.role,
        group: activeExp?.group ?? null,
        groupRole: activeExp?.groupRole ?? null,
        classCode: activeExp?.classCode ?? null,
      });

      if (!success) {
        Alert.alert(
          isForeign ? 'Failed to Start Sharing' : '위치 공유 시작 실패',
          isForeign ? 'Please try again.' : '잠시 후 다시 시도해 주세요.',
          [{ text: isForeign ? 'OK' : '확인' }]
        );
        return;
      }

      setIsSharing(true);
      isSharingRef.current = true;
      setIsSharingLocation(true);

      // 포그라운드 권한만 있는 경우 → LocationSettingsScreen에서 백그라운드 권한을 추가 허용하도록 안내
      const newPerm = await getLocationPermissionStatus();
      if (newPerm === 'whenInUse' && Platform.OS === 'android') {
        setTimeout(showBackgroundPermissionGuide, 600);
      }
    } finally {
      setIsToggling(false);
    }
  }, [userData, campCode, isForeign, showBackgroundPermissionGuide]);

  const handleDisclosureDeny = useCallback(() => {
    setShowDisclosureModal(false);
    setIsToggling(false);
  }, []);

  // 토글 처리
  const handleToggle = async (value: boolean) => {
    if (!userData || !campCode || isToggling) return;

    if (!value) {
      // 공유 중지 (disclosure 불필요)
      setIsToggling(true);
      try {
        await stopLocationSharing(db, userData.userId, campCode);
        setIsSharing(false);
        isSharingRef.current = false;
        setMyLocation(null);
        setIsSharingLocation(false);
      } finally {
        setIsToggling(false);
      }
      return;
    }

    // Google Play 정책(Prominent Disclosure & Consent):
    // 권한 유무와 무관하게 항상 disclosure 모달을 먼저 표시합니다.
    // - 이미 동의 기록이 있어도 매번 표시: 정책은 "수집 직전" disclosure를 요구하며
    //   백그라운드 수집 특성상 사용자가 수집 사실을 인지하고 확인해야 합니다.
    const currentPerm = await getLocationPermissionStatus();
    setDisclosureHasPermission(currentPerm !== 'denied');
    setIsToggling(true);
    setShowDisclosureModal(true);
  };

  // 내 위치로 이동
  const handleGoToMyLocation = () => {
    if (myLocation) {
      mapRef.current?.animateToRegion(
        {
          latitude: myLocation.lat,
          longitude: myLocation.lng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        600
      );
    }
  };

  // 전체 보기
  const handleFitAll = () => {
    if (sharedLocations.length > 0) {
      fitMapToLocations(sharedLocations);
    }
  };

  if (isLoadingCampCode) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (!campCode) {
    return (
      <View style={styles.centered}>
        <Ionicons name="map-outline" size={48} color="#cbd5e1" />
        <Text style={styles.emptyTitle}>캠프 미배정</Text>
        <Text style={styles.emptyDescription}>
          활성 캠프가 없어 위치 공유를 사용할 수 없습니다.
        </Text>
      </View>
    );
  }

  const otherLocations = sharedLocations.filter(
    (l) => l.userId !== userData?.userId
  );
  const sharingCount = sharedLocations.length;

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Google Play 정책(Prominent Disclosure) 준수: 위치 수집 시작 직전 명시적 공개 모달 */}
      <LocationPermissionDisclosureModal
        visible={showDisclosureModal}
        onAccept={handleDisclosureAccept}
        onDeny={handleDisclosureDeny}
        isForeign={isForeign}
        hasPermission={disclosureHasPermission}
      />

      {/* Google Play 정책(Prominent Disclosure) 준수:
          위치 데이터 수집 안내 배너 — 메뉴 탐색 없이 일반 사용 흐름 중 항상 표시.
          헤더(타이틀)는 항상 노출, 본문은 사용자가 접기/펼치기 가능.
          첫 진입 시에는 반드시 펼쳐진 상태로 표시됩니다. */}
      <TouchableOpacity
        style={styles.inlineDisclosureBanner}
        onPress={() => {
          const next = !bannerCollapsed;
          setBannerCollapsed(next);
          AsyncStorage.setItem('location_disclosure_banner_collapsed', next ? 'true' : 'false').catch(() => {});
        }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={
          isForeign
            ? bannerCollapsed ? 'Expand location data collection notice' : 'Collapse location data collection notice'
            : bannerCollapsed ? '위치 데이터 수집 안내 펼치기' : '위치 데이터 수집 안내 접기'
        }
      >
        <View style={styles.inlineDisclosureRow}>
          <Ionicons name="information-circle" size={16} color="#1d4ed8" />
          <Text style={styles.inlineDisclosureTitle}>
            {isForeign ? 'Location Data Collection' : '위치 데이터 수집 안내'}
          </Text>
          <Ionicons
            name={bannerCollapsed ? 'chevron-down' : 'chevron-up'}
            size={14}
            color="#1d4ed8"
            style={styles.inlineDisclosureChevron}
          />
        </View>
        {!bannerCollapsed && (
          <Text style={styles.inlineDisclosureText}>
            {isForeign
              ? 'SMIS Mentor collects GPS location and battery status to enable real-time location sharing among camp staff, even when the app is in the background. Data is shared only with staff in the same camp and is not provided to third parties.'
              : 'SMIS Mentor는 캠프 스태프 간 실시간 위치 공유를 위해 GPS 위치 및 배터리 상태를 수집합니다. 앱을 최소화해도 수집이 지속될 수 있으며, 같은 캠프 스태프에게만 공유되고 외부 제3자와는 공유하지 않습니다.'}
          </Text>
        )}
      </TouchableOpacity>

      {/* 위치 공유 컨트롤 패널 */}
      <View style={styles.controlPanel}>
        <Text style={styles.controlTitle}>
          {isForeign ? 'Share My Location' : '내 위치 공유'}
        </Text>
        <Text style={styles.controlSubtitle}>
          {isSharing
            ? isForeign
              ? `Sharing · ${sharingCount} participants`
              : `공유 중 · ${sharingCount}명 참여`
            : sharingCount > 0
            ? isForeign
              ? `${sharingCount} sharing`
              : `${sharingCount}명이 공유 중`
            : isForeign
            ? 'No one sharing'
            : '아무도 공유하지 않음'}
        </Text>
        <View style={styles.controlRight}>
          {isToggling && (
            <ActivityIndicator
              size="small"
              color="#3b82f6"
              style={styles.toggleLoader}
            />
          )}
          <Switch
            value={isSharing}
            onValueChange={handleToggle}
            disabled={isToggling}
            trackColor={{ false: '#e2e8f0', true: '#bfdbfe' }}
            thumbColor={isSharing ? '#3b82f6' : '#94a3b8'}
            ios_backgroundColor="#e2e8f0"
          />
        </View>
      </View>

      {/* iOS: 위치 공유 중 스와이프 종료 경고 — 공유 켜진 상태에서만 표시 */}
      {Platform.OS === 'ios' && isSharing && (
        <View style={styles.iosShareNotice}>
          <Ionicons name="warning-outline" size={13} color="#92400e" />
          <Text style={styles.iosShareNoticeText}>
            {isForeign
              ? 'Swiping the app closed will stop location sharing. Use the Home button instead.'
              : '앱을 스와이프로 종료하면 위치 공유가 중단됩니다. 홈 버튼으로만 내려주세요.'}
          </Text>
        </View>
      )}

      {/* 지도 */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={DEFAULT_REGION}
          showsUserLocation={false}
          showsMyLocationButton={false}
          toolbarEnabled={false}
        >
          {/* 내 마커 */}
          {myLocation && (
            <TrackedMarker
              key={`me_${userData?.userId}`}
              coordinate={{ latitude: myLocation.lat, longitude: myLocation.lng }}
              onPress={() => showUserCard(myLocation)}
              location={myLocation}
              isMe
            />
          )}

          {/* 다른 유저 마커 */}
          {otherLocations.map((loc) => (
            <TrackedMarker
              key={loc.userId}
              coordinate={{ latitude: loc.lat, longitude: loc.lng }}
              onPress={() => showUserCard(loc)}
              location={loc}
              isMe={false}
            />
          ))}
        </MapView>

        {/* 지도 우측 버튼 */}
        <View style={styles.mapButtons}>
          {isSharing && myLocation && (
            <TouchableOpacity
              style={styles.mapButton}
              onPress={handleGoToMyLocation}
              accessible
              accessibilityLabel="내 위치로 이동"
              accessibilityRole="button"
            >
              <Ionicons name="locate" size={20} color="#3b82f6" />
            </TouchableOpacity>
          )}
          {sharingCount > 1 && (
            <TouchableOpacity
              style={styles.mapButton}
              onPress={handleFitAll}
              accessible
              accessibilityLabel="전체 보기"
              accessibilityRole="button"
            >
              <Ionicons name="expand-outline" size={20} color="#64748b" />
            </TouchableOpacity>
          )}
        </View>

        {/* 공유 없을 때 오버레이 */}
        {sharingCount === 0 && (
          <View style={styles.emptyOverlay} pointerEvents="none">
            <View style={styles.emptyOverlayCard}>
              <Ionicons name="people-outline" size={32} color="#94a3b8" />
              <Text style={styles.emptyOverlayText}>
                {isSharing
                  ? '위치를 공유 중입니다.\n다른 스태프가 공유하면 지도에 표시됩니다.'
                  : '위치 공유를 켜면\n같은 캠프 스태프끼리\n실시간으로 위치를 확인할 수 있습니다.'}
              </Text>
            </View>
          </View>
        )}

      </View>

      {/* 범례 */}
      {sharingCount > 0 && (
        <View style={styles.legend}>
          <ScrollLegend
            locations={sharedLocations}
            myUserId={userData?.userId}
            onSelect={showUserCard}
          />
        </View>
      )}

      {/* 바텀시트 — 항상 마운트, pointerEvents로 터치 차단해 첫 클릭 딜레이 제거 */}
      {/* 반투명 배경 */}
      <Animated.View
        style={[styles.sheetBackdrop, { opacity: backdropOpacity }]}
        pointerEvents={sheetVisible ? 'box-none' : 'none'}
      >
        <Pressable style={{ flex: 1 }} onPress={hideUserCard} />
      </Animated.View>

      {/* 시트 본체 */}
      <Animated.View
        style={[
          styles.sheetContainer,
          { transform: [{ translateY: sheetY }] },
        ]}
        pointerEvents={sheetVisible ? 'box-none' : 'none'}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          {selectedUser && (
            <UserInfoCard
              location={selectedUser}
              isMe={selectedUser.userId === userData?.userId}
              onClose={hideUserCard}
              onLocate={() => {
                hideUserCard();
                mapRef.current?.animateToRegion(
                  {
                    latitude: selectedUser.lat,
                    longitude: selectedUser.lng,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                  },
                  400
                );
              }}
            />
          )}
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}

// 배터리 뱃지 컴포넌트
const BatteryBadge = React.memo(
  ({ level, isCharging }: { level: number | null; isCharging: boolean }) => {
    const { icon, color, label } = getBatteryDisplay(level, isCharging);
    return (
      <View style={styles.batteryBadge}>
        <Ionicons name={icon as any} size={13} color={color} />
        <Text style={[styles.batteryLabel, { color }]}>{label}</Text>
      </View>
    );
  }
);

// 마커 클릭 시 표시되는 유저 정보 카드
const UserInfoCard = React.memo(
  ({
    location,
    isMe,
    onClose,
    onLocate,
  }: {
    location: UserLocationData;
    isMe: boolean;
    onClose: () => void;
    onLocate: () => void;
  }) => {
    const color = isMe ? '#ef4444' : getRoleColor(location.role);
    return (
      <View style={styles.userCardInner}>
        {/* 드래그 핸들 */}
        <View style={styles.userCardHandle} />

        <View style={styles.userCardContent}>
          {/* 프로필 영역 */}
          <View style={styles.userCardProfile}>
            {location.photoURL ? (
              <Image
                source={{ uri: location.photoURL }}
                style={[styles.userCardAvatar, { borderColor: color }]}
                contentFit="cover"
              />
            ) : (
              <View
                style={[
                  styles.userCardAvatarFallback,
                  { backgroundColor: color },
                ]}
              >
                <Text style={styles.userCardAvatarText}>
                  {location.displayName.charAt(0)}
                </Text>
              </View>
            )}

            <View style={styles.userCardInfo}>
              <View style={styles.userCardNameRow}>
                <Text style={styles.userCardName}>
                  {isMe ? `나 (${location.displayName})` : location.displayName}
                </Text>
                {isMe && (
                  <View style={styles.userCardMeBadge}>
                    <Text style={styles.userCardMeBadgeText}>나</Text>
                  </View>
                )}
              </View>
              <View style={styles.userCardRoleBadge}>
                <View style={[styles.userCardRoleDot, { backgroundColor: color }]} />
                <Text style={[styles.userCardRoleText, { color }]}>
                  {getRoleLabel(location.role)}
                </Text>
                {location.group && (
                  <>
                    <Text style={styles.userCardRoleSep}>·</Text>
                    <Text style={styles.userCardGroupRole}>{getGroupLabel(location.group)}</Text>
                  </>
                )}
                {location.groupRole && (
                  <>
                    <Text style={styles.userCardRoleSep}>·</Text>
                    <Text style={styles.userCardGroupRole}>{location.groupRole}</Text>
                  </>
                )}
                {location.classCode && (
                  <>
                    <Text style={styles.userCardRoleSep}>·</Text>
                    <Text style={styles.userCardGroupRole}>{location.classCode}</Text>
                  </>
                )}
              </View>
              <View style={styles.userCardStatusRow}>
                <Text style={styles.userCardStatus}>위치 공유 중</Text>
                <BatteryBadge
                  level={location.batteryLevel ?? null}
                  isCharging={location.isCharging ?? false}
                />
              </View>
            </View>
          </View>

          {/* 액션 버튼 */}
          <View style={styles.userCardActions}>
            <TouchableOpacity
              style={styles.userCardActionBtn}
              onPress={onLocate}
              accessibilityLabel="이 위치로 이동"
              accessibilityRole="button"
            >
              <Ionicons name="navigate-outline" size={18} color="#3b82f6" />
              <Text style={styles.userCardActionText}>위치로</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.userCardActionBtn, styles.userCardCloseBtn]}
              onPress={onClose}
              accessibilityLabel="닫기"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={18} color="#64748b" />
              <Text style={[styles.userCardActionText, { color: '#64748b' }]}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }
);

// 역할 정렬 순서: 나(본인) → 멘토 → 원어민 → 관리자
const ROLE_ORDER: Record<string, number> = {
  mentor: 1,
  mentor_temp: 1,
  foreign: 2,
  foreign_temp: 2,
  admin: 3,
};

// 공유 중인 유저 목록 범례 (가로 스크롤 칩)
const ScrollLegend = React.memo(
  ({
    locations,
    myUserId,
    onSelect,
  }: {
    locations: UserLocationData[];
    myUserId: string | undefined;
    onSelect: (loc: UserLocationData) => void;
  }) => {
    const sorted = [...locations].sort((a, b) => {
      // 본인은 맨 앞
      const aIsMe = a.userId === myUserId ? 0 : 1;
      const bIsMe = b.userId === myUserId ? 0 : 1;
      if (aIsMe !== bIsMe) return aIsMe - bIsMe;
      // 역할 순서
      const aOrder = ROLE_ORDER[a.role] ?? 9;
      const bOrder = ROLE_ORDER[b.role] ?? 9;
      if (aOrder !== bOrder) return aOrder - bOrder;
      // 같은 역할 내 이름 가나다 순
      return a.displayName.localeCompare(b.displayName, 'ko');
    });

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.legendContent}
        style={styles.legendScroll}
      >
        {sorted.map((loc) => {
          const isMe = loc.userId === myUserId;
          const color = isMe ? '#ef4444' : getRoleColor(loc.role);
          const { icon: batIcon, color: batColor, label: batLabel } = getBatteryDisplay(
            loc.batteryLevel ?? null,
            loc.isCharging ?? false
          );
          return (
            <TouchableOpacity
              key={loc.userId}
              style={[styles.legendChip, { borderColor: color }]}
              onPress={() => onSelect(loc)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${loc.displayName} 위치로 이동`}
            >
              {/* 아바타 */}
              {loc.photoURL ? (
                <Image
                  source={{ uri: loc.photoURL }}
                  style={[styles.legendAvatar, { borderColor: color }]}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.legendAvatarFallback, { backgroundColor: color }]}>
                  <Text style={styles.legendAvatarText}>
                    {loc.displayName.charAt(0)}
                  </Text>
                </View>
              )}
              {/* 이름 + 배터리 (세로 배치) */}
              <View style={styles.legendTextCol}>
                <Text style={styles.legendName} numberOfLines={1}>
                  {isMe ? '나' : loc.displayName}
                </Text>
                <View style={styles.legendBattery}>
                  <Ionicons name={batIcon as any} size={10} color={batColor} />
                  <Text style={[styles.legendBatteryLabel, { color: batColor }]}>{batLabel}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  emptyDescription: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },
  controlPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  // Google Play 정책(Prominent Disclosure): 일반 사용 흐름 중 항상 노출되는 인라인 안내 배너
  inlineDisclosureBanner: {
    backgroundColor: '#eff6ff',
    borderBottomWidth: 1,
    borderBottomColor: '#bfdbfe',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inlineDisclosureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  inlineDisclosureTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1d4ed8',
    flex: 1,
  },
  inlineDisclosureChevron: {
    marginLeft: 'auto',
  },
  inlineDisclosureText: {
    fontSize: 10,
    color: '#1e40af',
    lineHeight: 15,
  },
  controlTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  controlSubtitle: {
    fontSize: 11,
    color: '#64748b',
    flex: 1,
  },
  controlRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
  toggleLoader: {
    marginRight: 2,
  },
  iosShareNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#fffbeb',
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
  },
  iosShareNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#92400e',
    lineHeight: 15,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  mapButtons: {
    position: 'absolute',
    right: 12,
    bottom: 16,
    gap: 8,
  },
  mapButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  emptyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyOverlayCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    maxWidth: 280,
  },
  emptyOverlayText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  legend: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  legendScroll: {
    paddingVertical: 8,
  },
  legendContent: {
    paddingHorizontal: 12,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: '#f8fafc',
  },
  legendAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  legendAvatarFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendAvatarText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  legendTextCol: {
    flexDirection: 'column',
    gap: 2,
  },
  legendName: {
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '600',
    maxWidth: 64,
  },
  legendBattery: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  legendBatteryLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  // 바텀시트 스타일
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 100,
  },
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 101,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    // iOS 그림자
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    // Android 그림자
    elevation: 16,
  },
  userCard: {
    backgroundColor: 'transparent',
  },
  userCardInner: {
    // sheetContainer가 이미 흰색 배경 — 이중 배경 방지
    backgroundColor: 'transparent',
    paddingBottom: 32,
  },
  userCardHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  userCardContent: {
    paddingHorizontal: 20,
    gap: 14,
  },
  userCardProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  userCardAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
  },
  userCardAvatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userCardAvatarText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  userCardInfo: {
    flex: 1,
    gap: 3,
  },
  userCardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userCardName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  userCardMeBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  userCardMeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ef4444',
  },
  userCardRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  userCardRoleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  userCardRoleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  userCardRoleSep: {
    fontSize: 12,
    color: '#cbd5e1',
    marginHorizontal: 2,
  },
  userCardGroupRole: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  userCardStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },
  userCardStatus: {
    fontSize: 11,
    color: '#94a3b8',
  },
  batteryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  batteryLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  userCardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  userCardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#eff6ff',
    paddingVertical: 10,
    borderRadius: 12,
  },
  userCardCloseBtn: {
    backgroundColor: '#f8fafc',
    flex: 0.5,
  },
  userCardActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3b82f6',
  },
  // 마커 스타일
  markerContainer: {
    alignItems: 'center',
    gap: 0,
  },
  markerBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  markerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  markerAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerAvatarText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  markerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  markerName: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
    textShadowColor: 'rgba(255,255,255,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    maxWidth: 60,
    textAlign: 'center',
  },
});
