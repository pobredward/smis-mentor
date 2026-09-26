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
import { L } from '@smis-mentor/shared';

export function EmailVerifyGate() {
  const { userData, refreshUserData } = useAuth();
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [, force] = useState(0);
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
        Alert.alert(L('profile.verified'), L('profile.yourEmailHasBeenVerified'));
      } else if (!silent) {
        Alert.alert(L('profile.notVerifiedYet'), L('profile.pleaseTapTheLinkIn'));
      }
    } catch {
      if (!silent) Alert.alert(L('common.error'), L('profile.couldNotVerifyPleaseTry'));
    } finally {
      setChecking(false);
    }
  }, [refreshUserData]);

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
      Alert.alert(L('profile.sent'), L('profile.verificationEmailSentAgain'));
    } catch (e) {
      Alert.alert(L('common.error'), (e as Error)?.message || (L('profile.couldNotSend')));
    } finally {
      setSending(false);
    }
  };

  const changeEmail = async () => {
    if (!/^\S+@\S+\.\S+$/.test(newEmail.trim())) { Alert.alert(L('common.ok'), L('profile.pleaseEnterAValidEmail')); return; }
    setSending(true);
    try {
      await mobileAuthenticatedPost('/api/user/change-email', { email: newEmail.trim() });
      await auth.currentUser?.reload();
      await refreshUserData();
      setEditing(false);
      Alert.alert(L('profile.changed'), L('profile.verificationEmailSentToThe'));
    } catch (e) {
      Alert.alert(L('common.error'), (e as Error)?.message || (L('profile.couldNotChangeTheEmail')));
    } finally {
      setSending(false);
    }
  };

  const btn = { paddingVertical: 13, borderRadius: 12, alignItems: 'center' as const };
  return (
    <Modal visible={needs} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => undefined}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', padding: 24 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={{ fontSize: 40 }}>📧</Text>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 8 }}>{L('profile.verifyYourEmail')}</Text>
        <Text style={{ fontSize: 14, color: '#4b5563', marginTop: 10, lineHeight: 21 }}>
          {L('profile.weSentAVerificationLink')}{'\n'}
          <Text style={{ fontWeight: '700', color: '#111827' }}>{userData?.email}</Text>{'\n'}
          {L('profile.tapTheLinkInThe')}
        </Text>

        <TouchableOpacity onPress={() => check(false)} disabled={checking} style={[btn, { backgroundColor: '#2563eb', marginTop: 24, opacity: checking ? 0.6 : 1 }]}>
          {checking ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{L('profile.iHaveVerified')}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={resend} disabled={sending} style={[btn, { borderWidth: 1, borderColor: '#d1d5db', marginTop: 10, opacity: sending ? 0.6 : 1 }]}>
          <Text style={{ color: '#374151', fontWeight: '600', fontSize: 15 }}>{L('profile.resendEmail')}</Text>
        </TouchableOpacity>

        {editing ? (
          <View style={{ marginTop: 20, gap: 8 }}>
            <TextInput value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
              placeholder={L('profile.correctEmailAddress')}
              style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => setEditing(false)} style={[btn, { flex: 1, borderWidth: 1, borderColor: '#d1d5db' }]}><Text>{L('common.cancel')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={changeEmail} disabled={sending} style={[btn, { flex: 1, backgroundColor: '#1f2937' }]}><Text style={{ color: '#fff', fontWeight: '600' }}>{L('profile.changeResend')}</Text></TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 }}>
            <TouchableOpacity onPress={() => { setNewEmail(userData?.email || ''); setEditing(true); }}>
              <Text style={{ fontSize: 13, color: '#6b7280', textDecorationLine: 'underline' }}>{L('profile.wrongEmailAddress')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { void signOut(); }}>
              <Text style={{ fontSize: 13, color: '#9ca3af', textDecorationLine: 'underline' }}>{L('profile.logOut2')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
