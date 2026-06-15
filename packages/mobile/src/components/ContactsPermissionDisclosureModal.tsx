import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ContactsPermissionDisclosureModalProps {
  visible: boolean;
  /** 사용자가 "동의하고 계속" 버튼을 누름 */
  onAccept: () => void;
  /** 사용자가 "취소" 버튼을 누름 */
  onDeny: () => void;
}

/**
 * Google Play 정책(Prominent Disclosure & Consent) 준수를 위한 연락처 권한 명시적 공개 모달.
 *
 * 정책 요구사항:
 * - OS 권한 다이얼로그 요청 직전에 표시되어야 함
 * - 수집하는 데이터 유형, 사용 목적, 공유 대상을 명시해야 함
 * - 뒤로가기·화면 탭으로 닫히는 것을 동의로 간주하면 안 됨
 */
export function ContactsPermissionDisclosureModal({
  visible,
  onAccept,
  onDeny,
}: ContactsPermissionDisclosureModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
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
                <Ionicons name="people" size={32} color="#10b981" />
              </View>
            </View>

            <Text style={styles.title}>연락처 접근 권한 안내</Text>

            {/* 수집 정보 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>접근하는 정보</Text>
              <View style={styles.bulletItem}>
                <Ionicons name="radio-button-on" size={8} color="#10b981" style={styles.bullet} />
                <Text style={styles.bulletText}>기기 연락처 읽기 (중복 확인용)</Text>
              </View>
              <View style={styles.bulletItem}>
                <Ionicons name="radio-button-on" size={8} color="#10b981" style={styles.bullet} />
                <Text style={styles.bulletText}>기기 연락처 쓰기 (저장)</Text>
              </View>
            </View>

            {/* 사용 목적 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>사용 목적</Text>
              <Text style={styles.bodyText}>
                학생 부모님의 전화번호를 기기 연락처 앱에 저장합니다.
                저장된 연락처는 캠프 운영 연락 목적으로만 사용되며,
                외부 서버나 제3자와 공유되지 않습니다.
              </Text>
            </View>

            {/* 저장 형식 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>저장 형식</Text>
              <Text style={styles.bodyText}>
                연락처 이름: <Text style={styles.mono}>[캠프코드] [학생이름] [학년] 학부모</Text>
                {'\n'}예) J28 홍길동 G4M 학부모
              </Text>
            </View>

            {/* 중요 안내 */}
            <View style={[styles.section, styles.infoBox]}>
              <View style={styles.infoHeader}>
                <Ionicons name="information-circle" size={18} color="#0284c7" />
                <Text style={styles.infoTitle}>중복 확인 안내</Text>
              </View>
              <Text style={styles.infoText}>
                이미 저장된 연락처는 건너뜁니다.
                기존 연락처를 수정하거나 삭제하지 않습니다.
              </Text>
            </View>
          </ScrollView>

          {/* 버튼 영역 */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.denyButton}
              onPress={onDeny}
              activeOpacity={0.75}
              accessible
              accessibilityLabel="취소"
              accessibilityRole="button"
            >
              <Text style={styles.denyText}>취소</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptButton}
              onPress={onAccept}
              activeOpacity={0.85}
              accessible
              accessibilityLabel="동의하고 계속"
              accessibilityRole="button"
            >
              <Ionicons name="checkmark" size={18} color="#ffffff" />
              <Text style={styles.acceptText}>동의하고 계속</Text>
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
    maxHeight: '80%',
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
    backgroundColor: '#f0fdf4',
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
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#1e293b',
    backgroundColor: '#f1f5f9',
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
  infoBox: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#bae6fd',
    marginBottom: 8,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0c4a6e',
  },
  infoText: {
    fontSize: 13,
    color: '#075985',
    lineHeight: 20,
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
    backgroundColor: '#10b981',
  },
  acceptText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
});
