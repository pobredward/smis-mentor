/**
 * 방 공지 띠 — 📢 글(2줄)/작은 그림 · 'OO 님이 올린 공지' · [공지 내리기]
 * 누르면 그 메시지로 이동, 접기/펼치기는 방마다 기억한다 (같은 공지인 동안). 누가 확인했는지는 보이지 않는다.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { L, chatPreviewText, type ChatNotice, type Locale } from '@smis-mentor/shared';
import { CHAT_COLORS } from './chatTheme';

const KEY = (roomId: string) => `chat.noticeCollapsed.${roomId}`;

interface NoticeBannerProps {
  roomId: string;
  notice: ChatNotice;
  lang: Locale;
  canClear: boolean;
  onPress: () => void;
  onClear: () => void;
}

export function NoticeBanner({
  roomId,
  notice,
  lang,
  canClear,
  onPress,
  onClear,
}: NoticeBannerProps) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY(roomId))
      .then((v) => {
        if (alive) setCollapsed(v === notice.messageId);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [roomId, notice.messageId]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    (next ? AsyncStorage.setItem(KEY(roomId), notice.messageId) : AsyncStorage.removeItem(KEY(roomId))).catch(() => {});
  };

  const text = notice.text || chatPreviewText({ kind: notice.kind, text: '', media: notice.thumbUrl ? [{ kind: 'image', url: notice.thumbUrl, path: '' }] : [] }, lang);

  if (collapsed) {
    return (
      <TouchableOpacity style={[styles.wrap, styles.collapsed]} onPress={toggle} activeOpacity={0.8}>
        <Text style={styles.icon}>📢</Text>
        <Text style={styles.oneLine} numberOfLines={1}>{text}</Text>
        <Ionicons name="chevron-down" size={18} color={CHAT_COLORS.sub} />
      </TouchableOpacity>
    );
  }
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <TouchableOpacity style={styles.main} onPress={onPress} activeOpacity={0.7}>
          <Text style={styles.icon}>📢</Text>
          <View style={styles.texts}>
            <Text style={styles.text} numberOfLines={2}>{text}</Text>
            <Text style={styles.by} numberOfLines={1}>{L('chat.noticeBy', { name: notice.setByName || notice.senderName })}</Text>
          </View>
          {notice.thumbUrl ? <Image source={{ uri: notice.thumbUrl }} style={styles.thumb} contentFit="cover" /> : null}
        </TouchableOpacity>
        <TouchableOpacity onPress={toggle} hitSlop={10} style={styles.chev}>
          <Ionicons name="chevron-up" size={18} color={CHAT_COLORS.sub} />
        </TouchableOpacity>
      </View>
      {canClear ? (
        <View style={styles.bottom}>
          <View style={styles.spacer} />
          <TouchableOpacity onPress={onClear} style={styles.ghost} hitSlop={4}>
            <Text style={styles.ghostText}>{L('chat.clearNotice')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CHAT_COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  collapsed: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  oneLine: { flex: 1, fontSize: 13.5, color: CHAT_COLORS.text },
  top: { flexDirection: 'row', alignItems: 'flex-start' },
  main: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  icon: { fontSize: 16 },
  texts: { flex: 1 },
  text: { fontSize: 14, color: CHAT_COLORS.text, lineHeight: 19 },
  by: { fontSize: 11.5, color: CHAT_COLORS.sub, marginTop: 2 },
  thumb: { width: 40, height: 40, borderRadius: 6 },
  chev: { paddingLeft: 8, paddingTop: 1 },
  bottom: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  spacer: { flex: 1 },
  ghost: { paddingHorizontal: 8, paddingVertical: 4 },
  ghostText: { fontSize: 12.5, color: CHAT_COLORS.danger },
});
