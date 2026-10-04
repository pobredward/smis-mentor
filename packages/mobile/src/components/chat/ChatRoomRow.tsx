/**
 * 채팅 목록 한 줄 — 아바타 · 제목(+ 캠프 방 인원수) · 알림 꺼짐 · 마지막 메시지 · 시각 · 안 읽은 수
 */
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  L,
  chatListTimeLabel,
  chatPreviewText,
  chatRoomTitle,
  unreadBadgeText,
  type ChatRoom,
  type Locale,
} from '@smis-mentor/shared';
import { RoomAvatar } from './ChatAvatar';
import { CHAT_COLORS } from './chatTheme';

interface ChatRoomRowProps {
  room: ChatRoom;
  myUid: string;
  lang: Locale;
  unread: number;
  muted: boolean;
  /** 마지막 메시지를 보낸 사람을 내가 차단했다 */
  lastFromBlocked: boolean;
  /** 위에 고정 (지금 기수 캠프 방 · 내가 고정한 방) */
  pinned?: boolean;
  onPress: (roomId: string) => void;
  /** 길게 누르기 — 고정 · 숨기기 메뉴 */
  onLongPress?: (room: ChatRoom) => void;
}

function ChatRoomRowImpl({ room, myUid, lang, unread, muted, lastFromBlocked, pinned, onPress, onLongPress }: ChatRoomRowProps) {
  const title = chatRoomTitle(room, lang, myUid);
  const isCamp = room.type !== 'dm';
  const at = room.lastMessageAt?.toDate?.() ?? null;
  const preview = lastFromBlocked && room.lastMessage && !room.lastMessage.deleted
    ? L('chat.blockedMessage')
    : chatPreviewText(room.lastMessage, lang);
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(room.id)}
      onLongPress={onLongPress ? () => onLongPress(room) : undefined}
      delayLongPress={400}
      activeOpacity={0.6}
    >
      <RoomAvatar room={room} myUid={myUid} size={50} />
      <View style={styles.body}>
        <View style={styles.line}>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {isCamp ? <Text style={styles.count}>{room.memberIds?.length ?? 0}</Text> : null}
            {muted ? <Ionicons name="notifications-off" size={13} color={CHAT_COLORS.muted} style={styles.mutedIcon} /> : null}
            {pinned ? <Ionicons name="pin" size={12} color={CHAT_COLORS.muted} style={styles.mutedIcon} /> : null}
          </View>
          <Text style={styles.time}>{chatListTimeLabel(at, lang)}</Text>
        </View>
        <View style={[styles.line, styles.lineBottom]}>
          <Text style={styles.preview} numberOfLines={1}>{preview}</Text>
          {unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadBadgeText(unread)}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export const ChatRoomRow = memo(ChatRoomRowImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#ffffff' },
  body: { flex: 1, marginLeft: 12 },
  line: { flexDirection: 'row', alignItems: 'center' },
  lineBottom: { marginTop: 4 },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  title: { fontSize: 16, fontWeight: '600', color: CHAT_COLORS.text, flexShrink: 1 },
  count: { fontSize: 13, color: CHAT_COLORS.muted, marginLeft: 5 },
  mutedIcon: { marginLeft: 4 },
  time: { fontSize: 11.5, color: CHAT_COLORS.muted },
  preview: { flex: 1, fontSize: 13.5, color: CHAT_COLORS.sub, paddingRight: 8 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: CHAT_COLORS.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#ffffff', fontSize: 11.5, fontWeight: '700' },
});
