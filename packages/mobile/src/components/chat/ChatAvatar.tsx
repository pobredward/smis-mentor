/**
 * 채팅 아바타 — 사람(사진 또는 이름 첫 글자) · 방(캠프 방은 종류별 색 + 아이콘, DM 은 상대)
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { dmPeerOf, type ChatRoom } from '@smis-mentor/shared';
import { ROOM_AVATAR, initialColor } from './chatTheme';

export function PersonAvatar({ name, photo, size = 40 }: { name?: string | null; photo?: string | null; size?: number }) {
  const label = String(name ?? '').trim();
  const radius = size / 2;
  if (photo) {
    return (
      <Image
        source={{ uri: photo }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#e2e8f0' }}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={photo}
      />
    );
  }
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: radius, backgroundColor: initialColor(label || '?') }]}>
      <Text style={[styles.initial, { fontSize: Math.round(size * 0.42) }]}>{label ? label.slice(0, 1) : '?'}</Text>
    </View>
  );
}

export function RoomAvatar({ room, myUid, size = 48 }: { room: ChatRoom; myUid: string; size?: number }) {
  if (room.type === 'dm') {
    const peer = dmPeerOf(room, myUid) ?? '';
    const info = room.memberInfo?.[peer];
    return <PersonAvatar name={info?.name} photo={info?.photo} size={size} />;
  }
  const look = ROOM_AVATAR[room.type] ?? ROOM_AVATAR.camp_all;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2.6, backgroundColor: look.color }]}>
      <Ionicons name={look.icon} size={Math.round(size * 0.5)} color="#ffffff" />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initial: { color: '#ffffff', fontWeight: '700' },
});
