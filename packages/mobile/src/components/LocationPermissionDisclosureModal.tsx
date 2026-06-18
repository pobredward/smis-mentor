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
              {isForeign
                ? hasPermission
                  ? 'Location Data Collection Notice'
                  : 'Location Data Collection Notice'
                : hasPermission
                  ? '위치 정보 수집 안내'
                  : '위치 정보 수집 안내'}
            </Text>

            {/* 권한이 이미 있는 경우: 재활성화임을 명확히 안내 */}
            {hasPermission && (
              <Text style={styles.resumeNotice}>
                {isForeign
                  ? 'Location sharing will restart. Please review the data collection details below.'
                  : '위치 공유를 다시 시작합니다. 아래 수집 내용을 확인해 주세요.'}
              </Text>
            )}

            {/* 수집하는 정보 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {isForeign ? 'Data Collected' : '수집하는 정보'}
              </Text>
              <View style={styles.bulletItem}>
                <Ionicons name="radio-button-on" size={8} color="#3b82f6" style={styles.bullet} />
                <Text style={styles.bulletText}>
                  {isForeign
                    ? 'GPS-based real-time location (latitude & longitude)'
                    : 'GPS 기반 실시간 위치(위도·경도)'}
                </Text>
              </View>
              <View style={styles.bulletItem}>
                <Ionicons name="radio-button-on" size={8} color="#3b82f6" style={styles.bullet} />
                <Text style={styles.bulletText}>
                  {isForeign
                    ? 'Device battery level and charging status'
                    : '기기 배터리 잔량 및 충전 상태'}
                </Text>
              </View>
            </View>

            {/* 사용 목적 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {isForeign ? 'Purpose' : '수집 목적'}
              </Text>
              <Text style={styles.bodyText}>
                {isForeign
                  ? 'Used to share real-time locations among camp staff. Location data is not used for advertising, analytics, or any other purpose.'
                  : '같은 캠프 스태프끼리 실시간으로 위치를 공유하기 위해 사용됩니다. 위치 정보는 광고·분석 등 다른 목적으로 사용되지 않습니다.'}
              </Text>
            </View>

            {/* 백그라운드 수집 안내 (핵심 — Google Play 정책) */}
            <View style={[styles.section, styles.bgWarningBox]}>
              <View style={styles.bgWarningHeader}>
                <Ionicons name="information-circle" size={18} color="#d97706" />
                <Text style={styles.bgWarningTitle}>
                  {isForeign ? 'Background Location Collection' : '백그라운드 위치 수집'}
                </Text>
              </View>
              <Text style={styles.bgWarningText}>
                {isForeign
                  ? `While location sharing is on, your location is collected even when the app is minimized or you are using another app.${Platform.OS === 'android' ? ' A foreground service notification will appear in the status bar.' : ''}\n\nTo save battery, updates occur every 15 seconds or when you move 20m.`
                  : `위치 공유를 켠 상태에서는 앱을 최소화하거나 다른 앱을 사용하는 중에도${Platform.OS === 'android' ? ' 알림 바에 표시되는 포그라운드 서비스를 통해' : ''} 위치가 수집됩니다.\n\n배터리 사용량을 줄이기 위해 15초 간격, 20m 이동 시에만 업데이트합니다.`}
              </Text>
            </View>

            {/* 공유 대상 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {isForeign ? 'Who Can See Your Location' : '공유 대상'}
              </Text>
              <Text style={styles.bodyText}>
                {isForeign
                  ? 'Visible only to staff in the same camp. Not shared with any external third parties.'
                  : '같은 캠프 코드에 속한 스태프에게만 표시됩니다. 외부 제3자와는 공유하지 않습니다.'}
              </Text>
            </View>

            {/* 보관 및 중지 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {isForeign ? 'Stop Collection' : '수집 중단'}
              </Text>
              <Text style={styles.bodyText}>
                {isForeign
                  ? 'Turning off the location sharing switch immediately stops collection and deactivates your location data.'
                  : '위치 공유 스위치를 끄면 즉시 수집이 중단되고 위치 데이터가 비활성 처리됩니다.'}
              </Text>
            </View>

            <Text style={styles.privacyNote}>
              {isForeign
                ? 'See Privacy Policy §9 for more details.'
                : '자세한 내용은 개인정보처리방침 §9를 확인하세요.'}
            </Text>
          </ScrollView>

          {/* 버튼 영역 */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.denyButton}
              onPress={onDeny}
              activeOpacity={0.75}
              accessible
              accessibilityLabel={isForeign ? 'Cancel' : '취소'}
              accessibilityRole="button"
            >
              <Text style={styles.denyText}>{isForeign ? 'Cancel' : '취소'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptButton}
              onPress={onAccept}
              activeOpacity={0.85}
              accessible
              accessibilityLabel={
                isForeign
                  ? hasPermission ? 'Confirm & Start Sharing' : 'Agree and Continue'
                  : hasPermission ? '확인하고 공유 시작' : '동의하고 계속'
              }
              accessibilityRole="button"
            >
              <Ionicons name="checkmark" size={18} color="#ffffff" />
              <Text style={styles.acceptText}>
                {isForeign
                  ? hasPermission ? 'Confirm & Start Sharing' : 'Agree & Continue'
                  : hasPermission ? '확인하고 공유 시작' : '동의하고 계속'}
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
