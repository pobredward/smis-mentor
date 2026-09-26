import React, { useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { CampProfileForm, fetchCampProfileStatus } from './CampProfileForm';
import { signOut } from '../../services/authService';

/**
 * 진행 예정 캠프 코드가 있는 멘토·원어민이 캠프 참가 정보를 다 입력하지 않았으면 앱 사용 전 필수 입력 화면을 띄운다.
 * (앱 실행·로그인·캠프 배정 변경 때 확인)
 */
export function CampProfileGate() {
  const { userData } = useAuth();
  const [visible, setVisible] = useState(false);
  const uid = userData?.userId;
  const role = userData?.role;
  const en = role === 'foreign';
  const campKey = (userData?.jobExperiences ?? []).map((e: any) => e?.id).join(',');

  useEffect(() => {
    let cancelled = false;
    if (!uid || (role !== 'mentor' && role !== 'foreign')) { setVisible(false); return; }
    fetchCampProfileStatus()
      .then((st) => { if (!cancelled) setVisible(st.applies && !!st.active && !!st.tier && st.missing.length > 0); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [uid, role, campKey]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => undefined}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: Platform.OS === 'ios' ? 64 : 32, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#111827' }}>{en ? 'Camp Information' : '캠프 참가 정보 입력'}</Text>
          <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 16 }}>{en ? 'Please fill in the details below to prepare for your camp.' : '배정된 캠프 준비를 위해 아래 정보를 입력해주세요.'}</Text>
          <CampProfileForm mode="required" onDone={(st) => { if (st.missing.length === 0) setVisible(false); }} />
          <TouchableOpacity onPress={() => { setVisible(false); void signOut(); }} style={{ marginTop: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: '#9ca3af', textDecorationLine: 'underline' }}>{en ? 'Log out' : '로그아웃'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
