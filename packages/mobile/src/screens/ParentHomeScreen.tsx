/**
 * 학부모 홈 — 1.0 은 연결된 아이만 보여 준다 (캠프 소식 · 일정은 다음 업데이트).
 * 아이 연결은 관리자가 한다 (웹 관리자 › 사용자 관리 › 학부모).
 */
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getMyParentLinks, logger, type ParentChildLink } from '@smis-mentor/shared';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

export function ParentHomeScreen() {
  const { userData } = useAuth();
  const [children, setChildren] = useState<ParentChildLink[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const uid = userData?.userId;

  const load = useCallback(async () => {
    if (!uid) return;
    try {
      setChildren(await getMyParentLinks(db, uid));
    } catch (e) {
      logger.error('연결된 아이 불러오기 실패:', e);
      setChildren([]);
    }
  }, [uid]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {userData?.name ? <Text style={styles.greeting}>{userData.name}님, 반갑습니다.</Text> : null}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>우리 아이</Text>
        {children === null ? (
          <Text style={styles.muted}>불러오는 중…</Text>
        ) : children.length === 0 ? (
          <Text style={styles.muted}>아직 연결된 아이가 없습니다. 캠프 운영진이 확인한 뒤 연결해 드립니다.</Text>
        ) : (
          children.map((c) => (
            <View key={`${c.campCode}_${c.studentId}`} style={styles.row}>
              <Text style={styles.childName}>{c.studentName}</Text>
              <Text style={styles.camp}>{c.campCode}</Text>
            </View>
          ))
        )}
      </View>
      <Text style={styles.note}>캠프 일정 · 소식은 곧 이곳에서 볼 수 있습니다.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16 },
  greeting: { fontSize: 18, fontWeight: '600', color: '#0f172a', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  muted: { fontSize: 14, color: '#64748b', lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' },
  childName: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  camp: { fontSize: 14, color: '#64748b' },
  note: { marginTop: 16, fontSize: 13, color: '#64748b' },
});
