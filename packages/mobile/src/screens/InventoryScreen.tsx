import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

/** 캠프 › 재고 — 아직 자리만 잡아 둔 탭 */
export function InventoryScreen() {
  const { userData } = useAuth();
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  return (
    <View style={styles.wrap}>
      <Ionicons name="cube-outline" size={40} color="#cbd5e1" />
      <Text style={styles.title}>{isForeign ? 'Coming soon' : '추후 구현 예정'}</Text>
      <Text style={styles.body}>{isForeign ? 'Inventory will be available here.' : '캠프 재고 관리 기능이 이곳에 들어올 예정입니다.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', paddingHorizontal: 32, gap: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#334155' },
  body: { fontSize: 13, color: '#94a3b8', textAlign: 'center' },
});
