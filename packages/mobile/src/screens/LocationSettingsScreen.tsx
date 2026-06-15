import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLocationPermission } from '../hooks/useLocationPermission';

export function LocationSettingsScreen() {
  const { userData } = useAuth();
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';

  const {
    permissionLevel,
    requesting,
    requestForegroundPermission,
    requestBackgroundPermission,
    openSettings,
  } = useLocationPermission({ isForeign });

  // 백그라운드 권한 disclosure를 인라인으로 읽었다는 확인 상태
  const [disclosureRead, setDisclosureRead] = useState(false);

  // ── 상태별 배너 설정 ──────────────────────────────────────────────
  const getBannerConfig = () => {
    if (permissionLevel === 'always') {
      return {
        icon: 'location' as const,
        color: '#10b981',
        bg: '#f0fdf4',
        border: '#bbf7d0',
        title: isForeign ? 'Background Location Enabled' : '백그라운드 위치 권한 허용됨',
        description: isForeign
          ? 'Location sharing works even when the app is in the background.'
          : '앱을 최소화해도 위치 공유가 정상 작동합니다.',
      };
    }

    if (permissionLevel === 'whenInUse') {
      return {
        icon: 'location-outline' as const,
        color: '#f59e0b',
        bg: '#fffbeb',
        border: '#fde68a',
        title: isForeign ? 'Location Allowed (While Using App)' : '앱 사용 중에만 위치 허용됨',
        description: isForeign
          ? 'Background location is not allowed. Location sharing will stop when the app is minimized.'
          : '백그라운드 위치는 허용되지 않았습니다. 앱을 최소화하면 위치 공유가 중단됩니다.',
      };
    }

    return {
      icon: 'location-outline' as const,
      color: '#ef4444',
      bg: '#fef2f2',
      border: '#fecaca',
      title: isForeign ? 'Location Access Denied' : '위치 접근이 허용되지 않았습니다',
      description: isForeign
        ? 'Location access is required to use the location sharing feature.'
        : '위치 공유 기능을 사용하려면 위치 접근 권한이 필요합니다.',
    };
  };

  const bannerConfig = getBannerConfig();

  // ── 권한 단계별 버튼 액션 ─────────────────────────────────────────
  const handleForegroundRequest = async () => {
    await requestForegroundPermission();
  };

  const handleBackgroundRequest = async () => {
    if (!disclosureRead) {
      Alert.alert(
        isForeign ? 'Please Read First' : '안내를 먼저 읽어주세요',
        isForeign
          ? 'Please read the "Background Location" notice below before enabling.'
          : '아래 "백그라운드 위치 수집" 안내를 먼저 확인해 주세요.'
      );
      return;
    }
    await requestBackgroundPermission();
  };

  if (!userData) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="lock-closed-outline" size={64} color="#cbd5e1" />
        <Text style={styles.emptyTitle}>
          {isForeign ? 'Login Required' : '로그인 필요'}
        </Text>
        <Text style={styles.emptyText}>
          {isForeign
            ? 'Please log in to access this page.'
            : '로그인 후 이용 가능합니다.'}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* 현재 권한 상태 배너 */}
      <View
        style={[
          styles.statusBanner,
          { backgroundColor: bannerConfig.bg, borderColor: bannerConfig.border },
        ]}
      >
        <Ionicons name={bannerConfig.icon} size={28} color={bannerConfig.color} />
        <View style={styles.bannerText}>
          <Text style={[styles.bannerTitle, { color: bannerConfig.color }]}>
            {bannerConfig.title}
          </Text>
          <Text style={styles.bannerDescription}>{bannerConfig.description}</Text>
        </View>
      </View>

      {/* 권한 요청 버튼 영역 */}
      {permissionLevel === 'denied' && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#3b82f6" />
            <Text style={styles.sectionTitle}>
              {isForeign ? 'Grant Location Access' : '위치 접근 허용'}
            </Text>
          </View>
          <Text style={styles.sectionDescription}>
            {isForeign
              ? 'Location access is required to use the location sharing feature in the Camp tab. Without this permission, you cannot share your location with other staff.'
              : '캠프 탭의 위치 공유 기능을 사용하려면 위치 접근 권한이 필요합니다. 이 권한 없이는 다른 스태프와 위치를 공유할 수 없습니다.'}
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleForegroundRequest}
            disabled={requesting}
            accessibilityLabel={isForeign ? 'Allow location access' : '위치 접근 허용하기'}
            accessibilityRole="button"
          >
            {requesting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="location-outline" size={18} color="#ffffff" />
                <Text style={styles.primaryButtonText}>
                  {isForeign ? 'Allow Location Access' : '위치 접근 허용하기'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Android: 포그라운드만 허용된 경우 → 백그라운드 권한 추가 요청 */}
      {permissionLevel === 'whenInUse' && Platform.OS === 'android' && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#f59e0b" />
            <Text style={styles.sectionTitle}>
              {isForeign ? 'Enable Background Location' : '백그라운드 위치 허용'}
            </Text>
          </View>
          <Text style={styles.sectionDescription}>
            {isForeign
              ? 'Allow background location access to keep sharing your location even when the app is minimized.'
              : '앱을 최소화해도 위치 공유가 계속되도록 백그라운드 위치 접근을 허용해 주세요.'}
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, styles.warningButton]}
            onPress={handleBackgroundRequest}
            disabled={requesting}
            accessibilityLabel={
              isForeign ? 'Allow background location' : '백그라운드 위치 허용하기'
            }
            accessibilityRole="button"
          >
            {requesting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="navigate-outline" size={18} color="#ffffff" />
                <Text style={styles.primaryButtonText}>
                  {isForeign ? 'Allow Background Location' : '백그라운드 위치 허용하기'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* 권한이 거부된 경우 설정 앱으로 이동 안내 */}
      {permissionLevel === 'denied' && (
        <View style={styles.openSettingsSection}>
          <Text style={styles.openSettingsHint}>
            {isForeign
              ? 'If the permission request was previously denied, open your device settings to enable it manually.'
              : '이전에 권한 요청을 거부했다면 기기 설정에서 직접 허용해야 합니다.'}
          </Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={openSettings}
            accessibilityLabel={isForeign ? 'Open device settings' : '기기 설정 열기'}
            accessibilityRole="button"
          >
            <Ionicons name="settings-outline" size={16} color="#3b82f6" />
            <Text style={styles.secondaryButtonText}>
              {isForeign ? 'Open Device Settings' : '기기 설정 열기'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Google Play 정책 명시적 공개(Prominent Disclosure) 섹션 ── */}
      {/* 이 섹션은 Google Play 정책 준수를 위해 항상 표시합니다 */}
      <View style={styles.disclosureCard}>
        <View style={styles.disclosureHeader}>
          <Ionicons name="information-circle" size={20} color="#d97706" />
          <Text style={styles.disclosureHeaderText}>
            {isForeign ? 'Background Location Collection' : '백그라운드 위치 수집'}
          </Text>
        </View>

        <Text style={styles.disclosureBody}>
          {isForeign
            ? 'This app collects location data (GPS coordinates) and battery status even when the app is minimized or closed, to support the real-time location sharing feature.'
            : '이 앱은 실시간 위치 공유 기능을 지원하기 위해 앱을 최소화하거나 닫은 상태에서도 위치 정보(GPS 좌표) 및 배터리 상태를 수집합니다.'}
        </Text>

        <View style={styles.disclosureItem}>
          <Ionicons name="radio-button-on" size={8} color="#d97706" style={styles.bullet} />
          <Text style={styles.disclosureItemText}>
            {isForeign
              ? 'Collected data: GPS coordinates, device battery level and charging status'
              : '수집 정보: GPS 좌표, 기기 배터리 잔량 및 충전 상태'}
          </Text>
        </View>
        <View style={styles.disclosureItem}>
          <Ionicons name="radio-button-on" size={8} color="#d97706" style={styles.bullet} />
          <Text style={styles.disclosureItemText}>
            {isForeign
              ? 'Purpose: Real-time location sharing among camp staff within the same camp code'
              : '수집 목적: 같은 캠프 코드의 스태프 간 실시간 위치 공유'}
          </Text>
        </View>
        <View style={styles.disclosureItem}>
          <Ionicons name="radio-button-on" size={8} color="#d97706" style={styles.bullet} />
          <Text style={styles.disclosureItemText}>
            {isForeign
              ? 'Sharing: Only shared with staff in the same camp. Not shared with third parties.'
              : '공유 대상: 같은 캠프 스태프에게만 표시. 외부 제3자와 공유하지 않음.'}
          </Text>
        </View>
        <View style={styles.disclosureItem}>
          <Ionicons name="radio-button-on" size={8} color="#d97706" style={styles.bullet} />
          <Text style={styles.disclosureItemText}>
            {isForeign
              ? 'Collection interval: Every 15 seconds or when moved 20m (to save battery)'
              : '수집 주기: 15초마다 또는 20m 이동 시 (배터리 절약)'}
          </Text>
        </View>
        <View style={styles.disclosureItem}>
          <Ionicons name="radio-button-on" size={8} color="#d97706" style={styles.bullet} />
          <Text style={styles.disclosureItemText}>
            {isForeign
              ? 'Stop collection: Turn off the location sharing switch in the Camp tab to stop immediately.'
              : '수집 중단: 캠프 탭의 위치 공유 스위치를 끄면 즉시 수집이 중단됩니다.'}
          </Text>
        </View>

        {Platform.OS === 'android' && (
          <View style={styles.androidNotice}>
            <Ionicons name="logo-android" size={14} color="#374151" />
            <Text style={styles.androidNoticeText}>
              {isForeign
                ? 'On Android, a foreground service notification is shown in the status bar while location sharing is active.'
                : 'Android에서는 위치 공유 중 상태 표시줄에 포그라운드 서비스 알림이 표시됩니다.'}
            </Text>
          </View>
        )}

        {/* 읽음 확인 체크박스 (백그라운드 권한 요청 전 필수) */}
        {permissionLevel === 'whenInUse' && Platform.OS === 'android' && (
          <TouchableOpacity
            style={styles.confirmRow}
            onPress={() => setDisclosureRead((v) => !v)}
            activeOpacity={0.7}
            accessibilityLabel={
              isForeign ? 'I have read the above notice' : '위 안내를 읽었습니다'
            }
            accessibilityRole="checkbox"
            accessibilityState={{ checked: disclosureRead }}
          >
            <View style={[styles.checkbox, disclosureRead && styles.checkboxChecked]}>
              {disclosureRead && (
                <Ionicons name="checkmark" size={13} color="#ffffff" />
              )}
            </View>
            <Text style={styles.confirmText}>
              {isForeign
                ? 'I have read the above notice and agree to background location collection.'
                : '위 안내를 읽었으며 백그라운드 위치 수집에 동의합니다.'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 추가 정보 안내 */}
      <View style={styles.infoCard}>
        <Ionicons name="information-circle-outline" size={18} color="#6b7280" />
        <Text style={styles.infoText}>
          {isForeign
            ? 'Location access is only used for the location sharing feature in the Camp tab and is not used for advertising, analytics, or any other purpose. For more details, see Privacy Policy §9.'
            : '위치 접근은 캠프 탭의 위치 공유 기능에만 사용되며, 광고·분석 등 다른 목적으로는 사용되지 않습니다. 자세한 내용은 개인정보처리방침 §9를 확인하세요.'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: '#f8fafc',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  // ── 상태 배너 ──────────────────────────────────────────────────────
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  bannerDescription: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  // ── 공통 섹션 ─────────────────────────────────────────────────────
  section: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  sectionDescription: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 14,
  },
  // ── 버튼 ──────────────────────────────────────────────────────────
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
  },
  warningButton: {
    backgroundColor: '#f59e0b',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  openSettingsSection: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  openSettingsHint: {
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 18,
    marginBottom: 8,
    textAlign: 'center',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  secondaryButtonText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
  },
  // ── 명시적 공개 카드 (Google Play 정책 필수) ──────────────────────
  disclosureCard: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  disclosureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  disclosureHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400e',
  },
  disclosureBody: {
    fontSize: 13,
    color: '#78350f',
    lineHeight: 20,
    marginBottom: 12,
  },
  disclosureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  bullet: {
    marginTop: 5,
  },
  disclosureItemText: {
    flex: 1,
    fontSize: 13,
    color: '#78350f',
    lineHeight: 19,
  },
  androidNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  androidNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#374151',
    lineHeight: 18,
  },
  // ── 읽음 확인 체크박스 ────────────────────────────────────────────
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#fde68a',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#d97706',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#d97706',
    borderColor: '#d97706',
  },
  confirmText: {
    flex: 1,
    fontSize: 13,
    color: '#92400e',
    lineHeight: 19,
  },
  // ── 하단 안내 카드 ────────────────────────────────────────────────
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    backgroundColor: '#f0f9ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#374151',
    lineHeight: 18,
  },
});
