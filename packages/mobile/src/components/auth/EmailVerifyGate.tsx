/**
 * 이메일 인증 안내 — 비밀번호로 가입했고 아직 이메일을 인증하지 않은 사용자는 앱을 쓸 수 없다 (웹과 동일).
 * 기존 가입자는 모두 인증된 것으로 표시했고, 구글·애플·네이버·카카오 가입은 대상이 아니다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, Alert, AppState, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { auth } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { mobileAuthenticatedPost } from '../../services/apiClient';
import { signOut } from '../../services/authService';

export function EmailVerifyGate() {
  const { userData, refreshUserData } = useAuth();
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [, force] = useState(0);
  const en = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const docVerified = (userData as { isEmailVerified?: boolean } | null)?.isEmailVerified === true;
  const needs = !!userData && !docVerified && !!auth.currentUser && !auth.currentUser.emailVerified;

  const check = useCallback(async (silent = false) => {
    const u = auth.currentUser;
    if (!u) return;
    setChecking(true);
    try {
      await u.reload();
      if (auth.currentUser?.emailVerified) {
        await auth.currentUser.getIdToken(true);
        await mobileAuthenticatedPost('/api/auth/email-verification', { action: 'sync' });
        await refreshUserData();
        force((n) => n + 1);
        Alert.alert(en ? 'Verified' : '인증 완료', en ? 'Your email has been verified.' : '이메일 인증이 완료되었습니다.');
      } else if (!silent) {
        Alert.alert(en ? 'Not yet' : '아직 인증 전', en ? 'Please tap the link in the email first.' : '메일의 링크를 먼저 눌러주세요.');
      }
    } catch {
      if (!silent) Alert.alert(en ? 'Error' : '오류', en ? 'Could not check. Please try again.' : '확인하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setChecking(false);
    }
  }, [en, refreshUserData]);

  // 메일 앱에서 링크를 누르고 돌아오면 자동 확인
  useEffect(() => {
    if (!needs) return;
    void check(true);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void check(true); });
    return () => sub.remove();
  }, [needs, check]);

  // Auth 는 인증됐는데 문서만 false 인 경우 조용히 맞춘다
  useEffect(() => {
    if (userData && !docVerified && auth.currentUser?.emailVerified) {
      mobileAuthenticatedPost('/api/auth/email-verification', { action: 'sync' }).then(() => refreshUserData()).catch(() => undefined);
    }
  }, [userData, docVerified, refreshUserData]);

  const resend = async () => {
    setSending(true);
    try {
      const r = await mobileAuthenticatedPost<{ verified?: boolean }>('/api/auth/email-verification', { action: 'resend' });
      if (r.verified) { await check(true); return; }
      Alert.alert(en ? 'Sent' : '발송 완료', en ? 'We sent the verification email again.' : '인증 메일을 다시 보냈습니다.');
    } catch (e) {
      Alert.alert(en ? 'Error' : '오류', (e as Error)?.message || (en ? 'Failed to send.' : '보내지 못했습니다.'));
    } finally {
      setSending(false);
    }
  };

  const changeEmail = async () => {
    if (!/^\S+@\S+\.\S+$/.test(newEmail.trim())) { Alert.alert(en ? 'Check email' : '확인', en ? 'Please enter a valid email.' : '올바른 이메일을 입력해주세요.'); return; }
    setSending(true);
    try {
      await mobileAuthenticatedPost('/api/user/change-email', { email: newEmail.trim() });
      await auth.currentUser?.reload();
      await refreshUserData();
      setEditing(false);
      Alert.alert(en ? 'Changed' : '변경 완료', en ? 'We sent a verification email to the new address.' : '새 주소로 인증 메일을 보냈습니다.');
    } catch (e) {
      Alert.alert(en ? 'Error' : '오류', (e as Error)?.message || (en ? 'Could not change the email.' : '이메일을 바꾸지 못했습니다.'));
    } finally {
      setSending(false);
    }
  };

  const btn = { paddingVertical: 13, borderRadius: 12, alignItems: 'center' as const };
  return (
    <Modal visible={needs} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => undefined}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', padding: 24 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={{ fontSize: 40 }}>📧</Text>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 8 }}>{en ? 'Verify your email' : '이메일 인증이 필요합니다'}</Text>
        <Text style={{ fontSize: 14, color: '#4b5563', marginTop: 10, lineHeight: 21 }}>
          {en ? 'We sent a verification link to' : '아래 주소로 인증 메일을 보냈습니다.'}{'\n'}
          <Text style={{ fontWeight: '700', color: '#111827' }}>{userData?.email}</Text>{'\n'}
          {en ? 'Tap the link in the email, then come back to the app. Check your spam folder too.' : '메일의 링크를 누른 뒤 앱으로 돌아오세요. 메일이 보이지 않으면 스팸함도 확인해주세요.'}
        </Text>

        <TouchableOpacity onPress={() => check(false)} disabled={checking} style={[btn, { backgroundColor: '#2563eb', marginTop: 24, opacity: checking ? 0.6 : 1 }]}>
          {checking ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{en ? 'I have verified' : '인증 완료했어요'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={resend} disabled={sending} style={[btn, { borderWidth: 1, borderColor: '#d1d5db', marginTop: 10, opacity: sending ? 0.6 : 1 }]}>
          <Text style={{ color: '#374151', fontWeight: '600', fontSize: 15 }}>{en ? 'Resend email' : '인증 메일 다시 보내기'}</Text>
        </TouchableOpacity>

        {editing ? (
          <View style={{ marginTop: 20, gap: 8 }}>
            <TextInput value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
              placeholder={en ? 'Correct email address' : '올바른 이메일 주소'}
              style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => setEditing(false)} style={[btn, { flex: 1, borderWidth: 1, borderColor: '#d1d5db' }]}><Text>{en ? 'Cancel' : '취소'}</Text></TouchableOpacity>
              <TouchableOpacity onPress={changeEmail} disabled={sending} style={[btn, { flex: 1, backgroundColor: '#1f2937' }]}><Text style={{ color: '#fff', fontWeight: '600' }}>{en ? 'Change & resend' : '바꾸고 다시 보내기'}</Text></TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 }}>
            <TouchableOpacity onPress={() => { setNewEmail(userData?.email || ''); setEditing(true); }}>
              <Text style={{ fontSize: 13, color: '#6b7280', textDecorationLine: 'underline' }}>{en ? 'Wrong email address?' : '이메일 주소가 틀렸나요?'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { void signOut(); }}>
              <Text style={{ fontSize: 13, color: '#9ca3af', textDecorationLine: 'underline' }}>{en ? 'Log out' : '로그아웃'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
