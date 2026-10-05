/**
 * 학부모 홈 — 우리 아이 · 캠프 신청 현황. 아이 등록 · 정보 고치기, 캠프 신청 · 신청서 · 철회.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  getMyChildren, getMyEnrollments, logger, ENROLLMENT_STATUS_LABEL,
  type ChildProfile, type CampEnrollment, type OpenCamp,
} from '@smis-mentor/shared';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { getOpenCamps, parentCall } from '../services/parentApi';
import type { RootStackParamList } from '../navigation/types';

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  applied: { bg: '#fffbeb', fg: '#b45309' },
  confirmed: { bg: '#ecfdf5', fg: '#047857' },
  cancelled: { bg: '#f3f4f6', fg: '#6b7280' },
};

export function ParentHomeScreen() {
  const { userData } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [children, setChildren] = useState<ChildProfile[] | null>(null);
  const [enrollments, setEnrollments] = useState<CampEnrollment[]>([]);
  const [openCamps, setOpenCamps] = useState<OpenCamp[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const uid = userData?.userId;

  const load = useCallback(async () => {
    if (!uid) return;
    try {
      const [c, e] = await Promise.all([getMyChildren(db, uid), getMyEnrollments(db, uid)]);
      setChildren(c);
      setEnrollments(e);
    } catch (err) {
      logger.error('우리 아이 불러오기 실패:', err);
      setChildren([]);
    }
    getOpenCamps().then(setOpenCamps).catch(() => setOpenCamps([]));
  }, [uid]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const withdraw = (e: CampEnrollment, name: string) => {
    Alert.alert('신청 철회', `${name} — ${e.campCode} 신청을 철회할까요?`, [
      { text: '닫기', style: 'cancel' },
      {
        text: '철회', style: 'destructive', onPress: async () => {
          try {
            await parentCall('DELETE', '/api/parent/enrollments', { campCode: e.campCode, studentId: e.studentId });
            await load();
          } catch (err) {
            Alert.alert('철회하지 못했습니다', (err as Error).message);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {userData?.name ? <Text style={styles.greeting}>{userData.name}님, 반갑습니다.</Text> : null}

      {openCamps.length > 0 && (
        <View style={styles.openBox}>
          <Text style={styles.openTitle}>지금 신청할 수 있는 캠프</Text>
          {openCamps.map((c) => (
            <Text key={c.campCode} style={styles.openItem}>
              {c.name} ({c.campCode}){c.startDate ? ` · ${c.startDate}${c.endDate ? ` ~ ${c.endDate}` : ''}` : ''}
            </Text>
          ))}
          <Text style={styles.openNote}>아이 카드의 ‘캠프 신청’을 눌러주세요. 운영진이 확인한 뒤 참가가 확정됩니다.</Text>
        </View>
      )}

      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>우리 아이</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('ParentChildForm', {})}>
          <Text style={styles.addButtonText}>+ 아이 등록</Text>
        </TouchableOpacity>
      </View>

      {children === null ? (
        <Text style={styles.muted}>불러오는 중…</Text>
      ) : children.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.muted}>아직 등록한 아이가 없습니다. ‘아이 등록’으로 아이 정보를 넣어주세요.</Text>
          <Text style={[styles.muted, { marginTop: 4 }]}>예전에 SMIS 캠프에 왔던 아이는 이름이 같으면 그 기록과 이어집니다.</Text>
        </View>
      ) : (
        children.map((c) => {
          const mine = enrollments.filter((e) => e.childId === c.childId);
          const applied = new Set(mine.map((e) => e.campCode));
          const canApply = openCamps.some((oc) => !applied.has(oc.campCode));
          return (
            <View key={c.childId} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.childName}>{c.name}{c.englishName ? <Text style={styles.sub}>  {c.englishName}</Text> : null}</Text>
                  <Text style={styles.sub}>
                    {[c.gender === 'M' ? '남' : c.gender === 'F' ? '여' : '', c.birthDate, c.ssnMasked ? '주민번호 등록됨' : ''].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => navigation.navigate('ParentChildForm', { childId: c.childId })}>
                  <Text style={styles.link}>정보 고치기</Text>
                </TouchableOpacity>
              </View>
              {mine.map((e) => {
                const color = STATUS_COLOR[e.status] ?? STATUS_COLOR.cancelled;
                return (
                  <View key={`${e.campCode}_${e.studentId}`} style={styles.enrollRow}>
                    <Text style={styles.camp}>{e.campCode}</Text>
                    <View style={[styles.badge, { backgroundColor: color.bg }]}>
                      <Text style={[styles.badgeText, { color: color.fg }]}>{ENROLLMENT_STATUS_LABEL[e.status] ?? e.status}</Text>
                    </View>
                    {e.status === 'confirmed' && (e.classNumber || e.roomNumber) ? (
                      <Text style={styles.sub}>{[e.classNumber && `반 ${e.classNumber}`, e.roomNumber && `방 ${e.roomNumber}`].filter(Boolean).join(' · ')}</Text>
                    ) : null}
                    <View style={{ flex: 1 }} />
                    {e.status !== 'cancelled' && (
                      <TouchableOpacity onPress={() => navigation.navigate('ParentApplication', { childId: c.childId, campCode: e.campCode, studentId: e.studentId })}>
                        <Text style={styles.link}>신청서</Text>
                      </TouchableOpacity>
                    )}
                    {e.status === 'applied' && (
                      <TouchableOpacity onPress={() => withdraw(e, c.name)} style={{ marginLeft: 12 }}>
                        <Text style={styles.subLink}>철회</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
              {canApply && (
                <TouchableOpacity style={styles.applyButton} onPress={() => navigation.navigate('ParentApplication', { childId: c.childId })}>
                  <Text style={styles.applyText}>캠프 신청</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16, paddingBottom: 40 },
  greeting: { fontSize: 18, fontWeight: '600', color: '#0f172a', marginBottom: 12 },
  openBox: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16 },
  openTitle: { fontSize: 14, fontWeight: '700', color: '#1e3a8a', marginBottom: 6 },
  openItem: { fontSize: 14, color: '#1e3a8a', marginBottom: 2 },
  openNote: { fontSize: 12, color: '#1e40af', marginTop: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#1e293b' },
  addButton: { backgroundColor: '#3b82f6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e5e7eb', borderStyle: 'dashed' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start' },
  childName: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b', fontWeight: '400' },
  link: { fontSize: 14, color: '#2563eb', fontWeight: '500' },
  subLink: { fontSize: 14, color: '#6b7280' },
  muted: { fontSize: 14, color: '#64748b', lineHeight: 20 },
  enrollRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb', marginTop: 8 },
  camp: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  applyButton: { marginTop: 12, borderRadius: 8, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', paddingVertical: 10, alignItems: 'center' },
  applyText: { color: '#1d4ed8', fontWeight: '600', fontSize: 15 },
});
