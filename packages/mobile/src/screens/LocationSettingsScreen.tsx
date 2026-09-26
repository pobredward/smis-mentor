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
import { LocationPermissionDisclosureModal } from '../components/LocationPermissionDisclosureModal';
import { L } from '@smis-mentor/shared';

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

  // Google Play 정책 명시적 공개 모달 상태
  const [showDisclosureModal, setShowDisclosureModal] = useState(false);

  // ── 상태별 배너 설정 ──────────────────────────────────────────────
  const getBannerConfig = () => {
    if (permissionLevel === 'always') {
      return {
        icon: 'location' as const,
        color: '#10b981',
        bg: '#f0fdf4',
        border: '#bbf7d0',
        title: L('settings.backgroundLocationEnabled'),
        description: L('settings.locationSharingWorksEvenWhen'),
      };
    }

    if (permissionLevel === 'whenInUse') {
      return {
        icon: 'location-outline' as const,
        color: '#f59e0b',
        bg: '#fffbeb',
        border: '#fde68a',
        title: L('settings.locationAllowedWhileUsingApp'),
        description: L('settings.backgroundLocationIsNotAllowed'),
      };
    }

    return {
      icon: 'location-outline' as const,
      color: '#ef4444',
      bg: '#fef2f2',
      border: '#fecaca',
      title: L('settings.locationAccessDenied'),
      description: L('settings.locationAccessIsRequiredTo2'),
    };
  };

  const bannerConfig = getBannerConfig();

  // ── 권한 단계별 버튼 액션 ─────────────────────────────────────────

  // Google Play 정책: 포그라운드 권한 요청 전 disclosure 모달 표시
  const handleForegroundRequest = () => {
    setShowDisclosureModal(true);
  };

  const handleDisclosureAccept = async () => {
    setShowDisclosureModal(false);
    await requestForegroundPermission();
  };

  const handleDisclosureDeny = () => {
    setShowDisclosureModal(false);
  };

  const handleBackgroundRequest = async () => {
    if (!disclosureRead) {
      Alert.alert(
        L('settings.pleaseReadFirst'),
        L('settings.pleaseReadTheBackgroundLocation')
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
          {L('common.loginRequired')}
        </Text>
        <Text style={styles.emptyText}>
          {L('common.pleaseLogInToAccess')}
        </Text>
      </View>
    );
  }

  return (
    <>
    <LocationPermissionDisclosureModal
      visible={showDisclosureModal}
      onAccept={handleDisclosureAccept}
      onDeny={handleDisclosureDeny}
      isForeign={isForeign}
      hasPermission={false}
    />
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

      {/* ── Google Play 정책 명시적 공개(Prominent Disclosure) 섹션 ── */}
      {/* 정책 요건: "필요한 콘텐츠가 바로 표시되어야 함" — 권한 요청 버튼보다 반드시 먼저 표시 */}
      <View style={styles.disclosureCard}>
        <View style={styles.disclosureHeader}>
          <Ionicons name="information-circle" size={20} color="#d97706" />
          <Text style={styles.disclosureHeaderText}>
            {L('settings.backgroundLocationCollection')}
          </Text>
        </View>

        <Text style={styles.disclosureBody}>
          {L('common.smisMentorCollectsLocationData')}
        </Text>

        <View style={styles.disclosureItem}>
          <Ionicons name="radio-button-on" size={8} color="#d97706" style={styles.bullet} />
          <Text style={styles.disclosureItemText}>
            {L('settings.collectedDataGpsCoordinatesDevice')}
          </Text>
        </View>
        <View style={styles.disclosureItem}>
          <Ionicons name="radio-button-on" size={8} color="#d97706" style={styles.bullet} />
          <Text style={styles.disclosureItemText}>
            {L('settings.purposeRealTimeLocationSharing')}
          </Text>
        </View>
        <View style={styles.disclosureItem}>
          <Ionicons name="radio-button-on" size={8} color="#d97706" style={styles.bullet} />
          <Text style={styles.disclosureItemText}>
            {L('settings.sharingOnlySharedWithStaff')}
          </Text>
        </View>
        <View style={styles.disclosureItem}>
          <Ionicons name="radio-button-on" size={8} color="#d97706" style={styles.bullet} />
          <Text style={styles.disclosureItemText}>
            {L('settings.collectionIntervalEvery15Seconds')}
          </Text>
        </View>
        <View style={styles.disclosureItem}>
          <Ionicons name="radio-button-on" size={8} color="#d97706" style={styles.bullet} />
          <Text style={styles.disclosureItemText}>
            {L('settings.stopCollectionTurnOffThe')}
          </Text>
        </View>

        {Platform.OS === 'android' && (
          <View style={styles.androidNotice}>
            <Ionicons name="logo-android" size={14} color="#374151" />
            <Text style={styles.androidNoticeText}>
              {L('settings.onAndroidAForegroundService')}
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
              L('settings.iHaveReadTheAbove')
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
              {L('settings.iHaveReadTheAbove2')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 권한 요청 버튼 영역 — disclosure 카드 다음에 배치 */}
      {permissionLevel === 'denied' && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#3b82f6" />
            <Text style={styles.sectionTitle}>
              {L('settings.grantLocationAccess')}
            </Text>
          </View>
          <Text style={styles.sectionDescription}>
            {L('settings.locationAccessIsRequiredTo')}
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleForegroundRequest}
            disabled={requesting}
            accessibilityLabel={L('settings.allowLocationAccess2')}
            accessibilityRole="button"
          >
            {requesting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="location-outline" size={18} color="#ffffff" />
                <Text style={styles.primaryButtonText}>
                  {L('settings.allowLocationAccess')}
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
              {L('settings.enableBackgroundLocation')}
            </Text>
          </View>
          <Text style={styles.sectionDescription}>
            {L('settings.allowBackgroundLocationAccessTo')}
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, styles.warningButton]}
            onPress={handleBackgroundRequest}
            disabled={requesting}
            accessibilityLabel={
              L('settings.allowBackgroundLocation2')
            }
            accessibilityRole="button"
          >
            {requesting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="navigate-outline" size={18} color="#ffffff" />
                <Text style={styles.primaryButtonText}>
                  {L('settings.allowBackgroundLocation')}
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
            {L('settings.ifThePermissionRequestWas')}
          </Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={openSettings}
            accessibilityLabel={L('settings.openDeviceSettings2')}
            accessibilityRole="button"
          >
            <Ionicons name="settings-outline" size={16} color="#3b82f6" />
            <Text style={styles.secondaryButtonText}>
              {L('settings.openDeviceSettings')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 추가 정보 안내 */}
      <View style={styles.infoCard}>
        <Ionicons name="information-circle-outline" size={18} color="#6b7280" />
        <Text style={styles.infoText}>
          {L('settings.locationAccessIsOnlyUsed')}
        </Text>
      </View>
    </ScrollView>
    </>
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
