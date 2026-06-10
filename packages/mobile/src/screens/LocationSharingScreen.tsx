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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { jobCodesService } from '../services';
import {
  startLocationSharing,
  stopLocationSharing,
  subscribeToLocationSharing,
  getLocationPermissionStatus,
  requestLocationPermission,
  pauseLocationWatcher,
  UserLocationData,
} from '../services/locationSharingService';
import type { Unsubscribe } from 'firebase/firestore';
import type { UserRole } from '@smis-mentor/shared';

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
const UserMarker = React.memo(
  ({
    location,
    isMe,
  }: {
    location: UserLocationData;
    isMe: boolean;
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
            />
          ) : (
            <View style={[styles.markerAvatarFallback, { backgroundColor: color }]}>
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

// 한국 중심 기본 지도 영역
const DEFAULT_REGION: Region = {
  latitude: 36.5,
  longitude: 127.8,
  latitudeDelta: 3.5,
  longitudeDelta: 3.5,
};

export function LocationSharingScreen() {
  const { userData } = useAuth();
  const mapRef = useRef<MapView | null>(null);

  const [isSharing, setIsSharing] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [campCode, setCampCode] = useState<string | null>(null);
  const [sharedLocations, setSharedLocations] = useState<UserLocationData[]>([]);
  const [myLocation, setMyLocation] = useState<UserLocationData | null>(null);
  const [isLoadingCampCode, setIsLoadingCampCode] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserLocationData | null>(null);

  const unsubscribeRef = useRef<Unsubscribe | null>(null);
  const isSharingRef = useRef(false); // AppState 핸들러에서 최신 값 참조용
  const cardAnim = useRef(new Animated.Value(0)).current; // 0=숨김, 1=표시

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

  // 캠프코드가 결정되면 Firestore 실시간 구독 시작
  useEffect(() => {
    if (!campCode) return;

    unsubscribeRef.current?.();
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
      }
    );

    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [campCode, userData?.userId]);

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
          // 포그라운드 복귀 시 위치 감시 재개
          await startLocationSharing(db, userData.userId, campCode, {
            displayName: userData.name,
            photoURL: userData.profileImage ?? null,
            role: userData.role,
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

  // 유저 카드 표시
  const showUserCard = useCallback((loc: UserLocationData) => {
    setSelectedUser(loc);
    Animated.spring(cardAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
    // 해당 마커로 지도 이동
    mapRef.current?.animateToRegion(
      {
        latitude: loc.lat - 0.002,
        longitude: loc.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      400
    );
  }, [cardAnim]);

  // 유저 카드 닫기
  const hideUserCard = useCallback(() => {
    Animated.timing(cardAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setSelectedUser(null));
  }, [cardAnim]);

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

  // 위치 목록이 변경될 때 지도 범위 자동 조정
  useEffect(() => {
    if (sharedLocations.length > 0) {
      fitMapToLocations(sharedLocations);
    }
  }, [sharedLocations, fitMapToLocations]);

  // 토글 처리
  const handleToggle = async (value: boolean) => {
    if (!userData || !campCode || isToggling) return;

    setIsToggling(true);

    try {
      if (value) {
        // 1단계: 현재 권한 상태 확인
        let permStatus = await getLocationPermissionStatus();

        // 2단계: 아직 결정하지 않은 경우에만 권한 요청 (granted/denied면 재요청 불필요)
        if (permStatus !== 'granted') {
          const granted = await requestLocationPermission();
          if (granted) permStatus = 'granted' as typeof permStatus;
        }

        // 3단계: 최종적으로 권한이 없으면 설정으로 안내
        if (permStatus !== 'granted') {
          Alert.alert(
            '위치 권한 필요',
            '위치 공유를 사용하려면 설정에서 위치 권한을 허용해야 합니다.',
            [
              { text: '취소', style: 'cancel' },
              {
                text: '설정 열기',
                onPress: () => Linking.openSettings(),
              },
            ]
          );
          return;
        }

        // 4단계: 권한 확인 완료 → 위치 공유 시작
        const success = await startLocationSharing(db, userData.userId, campCode, {
          displayName: userData.name,
          photoURL: userData.profileImage ?? null,
          role: userData.role,
        });

        if (!success) {
          Alert.alert(
            '위치 공유 시작 실패',
            '잠시 후 다시 시도해 주세요.',
            [{ text: '확인' }]
          );
          return;
        }

        setIsSharing(true);
        isSharingRef.current = true;
      } else {
        // 공유 중지
        await stopLocationSharing(db, userData.userId, campCode);
        setIsSharing(false);
        isSharingRef.current = false;
        setMyLocation(null);
      }
    } finally {
      setIsToggling(false);
    }
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
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* 헤더 컨트롤 패널 */}
      <View style={styles.controlPanel}>
        <View style={styles.controlLeft}>
          <Text style={styles.controlTitle}>내 위치 공유</Text>
          <Text style={styles.controlSubtitle}>
            {isSharing
              ? `공유 중 · ${sharingCount}명 참여`
              : sharingCount > 0
              ? `${sharingCount}명이 공유 중`
              : '아무도 공유하지 않음'}
          </Text>
        </View>
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
          onPress={hideUserCard}
        >
          {/* 내 마커 */}
          {myLocation && (
            <Marker
              key={`me_${userData?.userId}`}
              coordinate={{ latitude: myLocation.lat, longitude: myLocation.lng }}
              tracksViewChanges={false}
              onPress={() => showUserCard(myLocation)}
            >
              <UserMarker location={myLocation} isMe />
            </Marker>
          )}

          {/* 다른 유저 마커 */}
          {otherLocations.map((loc) => (
            <Marker
              key={loc.userId}
              coordinate={{ latitude: loc.lat, longitude: loc.lng }}
              tracksViewChanges={false}
              onPress={() => showUserCard(loc)}
            >
              <UserMarker location={loc} isMe={false} />
            </Marker>
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

        {/* 마커 클릭 시 유저 정보 카드 */}
        {selectedUser && (
          <Animated.View
            style={[
              styles.userCard,
              {
                transform: [
                  {
                    translateY: cardAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [200, 0],
                    }),
                  },
                ],
                opacity: cardAnim,
              },
            ]}
          >
            <UserInfoCard
              location={selectedUser}
              isMe={selectedUser.userId === userData?.userId}
              onClose={hideUserCard}
              onLocate={() => {
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
          </Animated.View>
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
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.legendContent}
        style={styles.legendScroll}
      >
        {locations.map((loc) => {
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
              {/* 이름 */}
              <Text style={styles.legendName} numberOfLines={1}>
                {isMe ? '나' : loc.displayName}
              </Text>
              {/* 배터리 */}
              <View style={styles.legendBattery}>
                <Ionicons name={batIcon as any} size={11} color={batColor} />
                <Text style={[styles.legendBatteryLabel, { color: batColor }]}>{batLabel}</Text>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  controlLeft: {
    flex: 1,
    gap: 2,
  },
  controlTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  controlSubtitle: {
    fontSize: 12,
    color: '#64748b',
  },
  controlRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLoader: {
    marginRight: 4,
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
  // 유저 정보 카드
  userCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  userCardInner: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
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
