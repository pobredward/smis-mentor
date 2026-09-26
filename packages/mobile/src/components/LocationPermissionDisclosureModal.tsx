import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { L } from '@smis-mentor/shared';

interface LocationPermissionDisclosureModalProps {
  visible: boolean;
  /** 사용자가 "동의하고 계속" 버튼을 누름 */
  onAccept: () => void;
  /** 사용자가 "취소" 버튼을 누름 */
  onDeny: () => void;
  /** true면 영어 UI (foreign 역할) */
  isForeign?: boolean;
  /** true면 이미 위치 권한이 있는 경우 — 텍스트를 "재동의" 형태로 조정 */
  hasPermission?: boolean;
}

/**
 * Google Play 정책(Prominent Disclosure & Consent) 준수를 위한 위치 권한 명시적 공개 모달.
 *
 * 정책 요구사항:
 * - OS 권한 다이얼로그 요청 직전에 표시되어야 함
 * - 수집하는 데이터 유형, 사용 목적, 공유 대상을 명시해야 함
 * - 백그라운드 수집 여부를 명확히 설명해야 함
 * - 뒤로가기·화면 탭으로 닫히는 것을 동의로 간주하면 안 됨
 * - 사용자가 명시적으로 긍정 행동(탭)을 해야 동의로 인정됨
 */
export function LocationPermissionDisclosureModal({
  visible,
  onAccept,
  onDeny,
  isForeign = false,
  hasPermission = false,
}: LocationPermissionDisclosureModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      // 뒤로가기로 닫히는 것을 동의로 간주하지 않음 → onDeny 호출
      onRequestClose={onDeny}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* 헤더 아이콘 */}
            <View style={styles.iconContainer}>
              <View style={styles.iconBg}>
                <Ionicons name="location" size={32} color="#3b82f6" />
              </View>
            </View>

            <Text style={styles.title}>
              {L('location.locationDataCollectionNotice2')}
            </Text>

            {/* Google Play 정책 필수 형식 요약 문단 — 제목 바로 아래에 스크롤 없이 보여야 함 */}
            <View style={styles.mandatoryDisclosure}>
              <Text style={styles.mandatoryText}>
                {L('common.smisMentorCollectsLocationData')}
              </Text>
            </View>

            {/* 권한이 이미 있는 경우: 재활성화임을 명확히 안내 */}
            {hasPermission && (
              <Text style={styles.resumeNotice}>
                {L('location.locationSharingWillRestartPlease')}
              </Text>
            )}

            {/* 수집하는 정보 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {L('location.dataCollected')}
              </Text>
              <View style={styles.bulletItem}>
                <Ionicons name="radio-button-on" size={8} color="#3b82f6" style={styles.bullet} />
                <Text style={styles.bulletText}>
                  {L('location.gpsBasedRealTimeLocation')}
                </Text>
              </View>
              <View style={styles.bulletItem}>
                <Ionicons name="radio-button-on" size={8} color="#3b82f6" style={styles.bullet} />
                <Text style={styles.bulletText}>
                  {L('location.deviceBatteryLevelAndCharging')}
                </Text>
              </View>
            </View>

            {/* 사용 목적 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {L('location.purpose')}
              </Text>
              <Text style={styles.bodyText}>
                {L('location.usedToShareRealTime')}
              </Text>
            </View>

            {/* 백그라운드 수집 안내 (핵심 — Google Play 정책) */}
            <View style={[styles.section, styles.bgWarningBox]}>
              <View style={styles.bgWarningHeader}>
                <Ionicons name="information-circle" size={18} color="#d97706" />
                <Text style={styles.bgWarningTitle}>
                  {L('location.backgroundAlwaysOnLocationCollection')}
                </Text>
              </View>
              <Text style={styles.bgWarningText}>
                {L('location.whileLocationSharingIsOn', { v0: Platform.OS === 'android' ? ' A persistent foreground service notification will appear in the status bar while active.' : '', v1: Platform.OS === 'android' ? ' 공유 중에는 알림 바에 포그라운드 서비스 알림이 상시 표시됩니다.' : '' })}
              </Text>
            </View>

            {/* 공유 대상 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {L('location.whoCanSeeYourLocation')}
              </Text>
              <Text style={styles.bodyText}>
                {L('location.visibleOnlyToStaffIn')}
              </Text>
            </View>

            {/* 보관 및 중지 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {L('location.stopCollection')}
              </Text>
              <Text style={styles.bodyText}>
                {L('location.turningOffTheLocationSharing')}
              </Text>
            </View>

            <Text style={styles.privacyNote}>
              {L('location.seePrivacyPolicy9For')}
            </Text>
          </ScrollView>

          {/* 버튼 영역 */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.denyButton}
              onPress={onDeny}
              activeOpacity={0.75}
              accessible
              accessibilityLabel={L('common.cancel')}
              accessibilityRole="button"
            >
              <Text style={styles.denyText}>{L('common.cancel')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptButton}
              onPress={onAccept}
              activeOpacity={0.85}
              accessible
              accessibilityLabel={
                isForeign
                  ? hasPermission ? 'Confirm & Start Sharing' : 'Agree and Continue'
                  : hasPermission ? L('location.confirmAndStartSharing') : L('location.agreeAndContinue')
              }
              accessibilityRole="button"
            >
              <Ionicons name="checkmark" size={18} color="#ffffff" />
              <Text style={styles.acceptText}>
                {isForeign
                  ? hasPermission ? 'Confirm & Start Sharing' : 'Agree & Continue'
                  : hasPermission ? L('location.confirmAndStartSharing') : L('location.agreeAndContinue')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
    overflow: 'hidden',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 8,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 20,
  },
  mandatoryDisclosure: {
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  mandatoryText: {
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 22,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bodyText: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 22,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  bullet: {
    marginTop: 1,
  },
  bulletText: {
    fontSize: 14,
    color: '#4b5563',
    flex: 1,
    lineHeight: 20,
  },
  bgWarningBox: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fcd34d',
    marginBottom: 16,
  },
  bgWarningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  bgWarningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
  },
  bgWarningText: {
    fontSize: 13,
    color: '#78350f',
    lineHeight: 20,
  },
  resumeNotice: {
    fontSize: 13,
    color: '#1e40af',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 18,
  },
  privacyNote: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  denyButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  denyText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  acceptButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
  },
  acceptText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
});
