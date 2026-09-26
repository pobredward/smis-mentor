import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { TERMS_URL, PRIVACY_POLICY_URL } from '@smis-mentor/shared';

/**
 * 약관·개인정보 동의 체크박스 (가입 화면 공용, 한/영)
 * 동의 버전은 users 문서의 consentVersion 으로 저장된다.
 */
export function ConsentCheckbox({
  checked,
  onChange,
  english = false,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  english?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.row}
        onPress={() => onChange(!checked)}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        <View style={[styles.box, checked && styles.boxChecked]}>
          {checked && <Text style={styles.check}>✓</Text>}
        </View>
        <Text style={styles.label}>
          {english
            ? 'I agree to the Terms of Service and the Privacy Policy (required)'
            : '이용약관 및 개인정보 수집·이용에 동의합니다 (필수)'}
        </Text>
      </TouchableOpacity>
      <View style={styles.links}>
        <Text style={styles.link} onPress={() => Linking.openURL(TERMS_URL)}>
          {english ? 'Terms of Service' : '이용약관 보기'}
        </Text>
        <Text style={styles.sep}>·</Text>
        <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
          {english ? 'Privacy Policy' : '개인정보처리방침 보기'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  box: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#9ca3af',
    alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 1, backgroundColor: '#fff',
  },
  boxChecked: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  check: { color: '#fff', fontSize: 14, fontWeight: '700' },
  label: { flex: 1, fontSize: 14, color: '#1f2937', lineHeight: 20 },
  links: { flexDirection: 'row', marginTop: 6, marginLeft: 32 },
  link: { fontSize: 13, color: '#2563eb', textDecorationLine: 'underline' },
  sep: { marginHorizontal: 6, color: '#9ca3af' },
});
