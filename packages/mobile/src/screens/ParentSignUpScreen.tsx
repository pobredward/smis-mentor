/**
 * 학부모 가입 — 이름 · 휴대폰(문자 인증 필수) · 이메일/비밀번호 (소셜로 온 경우는 이메일/비밀번호 없이)
 * 가입하면 role 'parent'. 아이(캠프 학생)는 관리자가 연결한다. (웹 /sign-up/parent 와 같은 흐름)
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Linking, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { logger, TERMS_URL, PRIVACY_POLICY_URL, type SocialUserData, type SignupProviderId } from '@smis-mentor/shared';
import { usePhoneAuth } from '../components/auth/PhoneAuthModal';
import { isPhoneAuthAvailable } from '../services/phoneAuthNative';
import { signUp, signUpWithSocialToken, completeSignupViaApi } from '../services/authService';

interface Props {
  /** 소셜 로그인에서 '학부모'를 골라 온 경우 */
  socialData?: (SocialUserData & { _credential?: unknown }) | null;
  onComplete: () => void;
  onBack: () => void;
}

const digits = (v: string) => v.replace(/\D/g, '');

export function ParentSignUpScreen({ socialData, onComplete, onBack }: Props) {
  const [name, setName] = useState(socialData?.name ?? '');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phoneModal, startPhoneAuth] = usePhoneAuth();

  /** 소셜 가입: Firebase 세션 확보 (구글/애플 credential · 네이버/카카오 서버 검증) — SignUpFlow 와 같다 */
  const ensureSocialSession = async (s: SocialUserData & { _credential?: unknown }) => {
    const { auth: firebaseAuth } = await import('../config/firebase');
    if (firebaseAuth.currentUser) return;
    if (s._credential) {
      const { signInWithCredential } = await import('firebase/auth');
      await signInWithCredential(firebaseAuth, s._credential as never);
      return;
    }
    if (!s.accessToken || (s.providerId !== 'naver' && s.providerId !== 'kakao')) {
      throw new Error('소셜 인증 정보가 만료되었습니다. 다시 로그인해주세요.');
    }
    await signUpWithSocialToken({ kind: s.providerId, accessToken: s.accessToken });
  };

  const submit = async () => {
    if (busy) return;
    const phoneNumber = digits(phone);
    if (name.trim().length < 2) return Alert.alert('입력 오류', '이름은 2자 이상 입력해주세요.');
    if (phoneNumber.length < 10 || phoneNumber.length > 11) return Alert.alert('입력 오류', '휴대폰 번호를 확인해주세요.');
    if (!socialData) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return Alert.alert('입력 오류', '이메일을 확인해주세요.');
      if (password.length < 8) return Alert.alert('입력 오류', '비밀번호는 8자 이상이어야 합니다.');
      if (password !== password2) return Alert.alert('입력 오류', '비밀번호가 서로 다릅니다.');
    }
    if (!agree) return Alert.alert('입력 오류', '약관과 개인정보 처리방침에 동의해주세요.');
    if (!isPhoneAuthAvailable()) return Alert.alert('업데이트 필요', '문자 인증을 쓸 수 없는 버전입니다. 앱을 업데이트해주세요.');

    // 번호 주인 확인 (학부모 가입은 문자 인증 필수 — 서버도 다시 확인)
    const verified = await startPhoneAuth({ purpose: 'verify', phone: phoneNumber });
    if (!verified) return;

    setBusy(true);
    let createdPasswordAccount = false;
    try {
      let provider: { providerId: SignupProviderId; providerUid?: string; displayName?: string; photoURL?: string };
      if (socialData) {
        await ensureSocialSession(socialData);
        const id = socialData.providerId;
        provider = {
          providerId: (id === 'naver' || id === 'kakao' ? id : id.includes('.com') ? id : `${id}.com`) as SignupProviderId,
          providerUid: socialData.providerUid,
          ...(socialData.name && { displayName: socialData.name }),
          ...(socialData.photoURL && { photoURL: socialData.photoURL }),
        };
      } else {
        await signUp(email.trim().toLowerCase(), password);
        createdPasswordAccount = true;
        provider = { providerId: 'password' };
      }
      await completeSignupViaApi({
        kind: 'parent',
        rollbackAuthOnFailure: createdPasswordAccount,
        provider,
        profile: { name: name.trim(), phoneNumber, agreedPersonal: true },
      });
      Alert.alert('가입 완료', socialData ? '가입이 완료되었습니다.' : '가입이 완료되었습니다. 이메일로 보낸 인증 링크를 눌러 주세요.', [
        { text: '확인', onPress: onComplete },
      ]);
    } catch (e) {
      logger.error('학부모 가입 오류:', e);
      if (createdPasswordAccount) {
        const { auth: firebaseAuth } = await import('../config/firebase');
        await firebaseAuth.signOut().catch(() => undefined);
      }
      const msg = String((e as Error)?.message || '');
      const code = (e as { code?: string })?.code;
      Alert.alert('가입 실패', code === 'auth/email-already-in-use' ? '이미 가입된 이메일입니다. 로그인해주세요.' : /[가-힣]/.test(msg) ? msg : '가입 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {phoneModal}
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={onBack} style={styles.back} accessibilityLabel="뒤로">
          <Ionicons name="chevron-back" size={24} color="#334155" />
        </TouchableOpacity>
        <Text style={styles.title}>학부모 가입</Text>
        <Text style={styles.subtitle}>가입 후 캠프 운영진이 확인하여 아이를 연결해 드립니다.</Text>

        <Text style={styles.label}>이름</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="이름" textContentType="name" />
        <Text style={styles.label}>휴대폰 번호</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="01012345678" keyboardType="number-pad" textContentType="telephoneNumber" />
        {!socialData && (
          <>
            <Text style={styles.label}>이메일</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="email@example.com" keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress" />
            <Text style={styles.label}>비밀번호 (8자 이상)</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" />
            <Text style={styles.label}>비밀번호 확인</Text>
            <TextInput style={styles.input} value={password2} onChangeText={setPassword2} secureTextEntry textContentType="newPassword" />
          </>
        )}

        <TouchableOpacity style={styles.agreeRow} onPress={() => setAgree(!agree)} activeOpacity={0.7}>
          <Ionicons name={agree ? 'checkbox' : 'square-outline'} size={22} color={agree ? '#3b82f6' : '#94a3b8'} />
          <Text style={styles.agreeText}>
            <Text style={styles.link} onPress={() => Linking.openURL(TERMS_URL)}>이용약관</Text>과{' '}
            <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>개인정보 처리방침</Text>에 동의합니다.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, busy && styles.buttonDisabled]} onPress={submit} disabled={busy} activeOpacity={0.8}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>휴대폰 인증하고 가입하기</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { padding: 20, paddingBottom: 48 },
  back: { width: 40, height: 40, justifyContent: 'center', marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 6, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#0f172a' },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 20 },
  agreeText: { flex: 1, fontSize: 14, color: '#334155', lineHeight: 20 },
  link: { color: '#2563eb', textDecorationLine: 'underline' },
  button: { marginTop: 24, backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
