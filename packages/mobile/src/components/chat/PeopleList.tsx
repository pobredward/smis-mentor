/**
 * 사람 목록 한 줄 (대화 상대 · 새 1:1 대화 공용)
 */
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { L, type ChatMemberInfo } from '@smis-mentor/shared';
import { PersonAvatar } from './ChatAvatar';
import { CHAT_COLORS, MEMBER_KIND_LABEL_KEY } from './chatTheme';

export function PersonRow({
  info,
  isMe,
  busy,
  disabled,
  showKind,
  onPress,
}: {
  info: ChatMemberInfo;
  isMe?: boolean;
  busy?: boolean;
  disabled?: boolean;
  /** 이름 옆에 매니저/멘토/원어민 표시 */
  showKind?: boolean;
  onPress?: () => void;
}) {
  const sub = [showKind ? L(MEMBER_KIND_LABEL_KEY[info.kind] ?? 'chat.kindMentor') : '', info.label ?? ''].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={disabled || isMe || !onPress} activeOpacity={0.6}>
      <PersonAvatar name={info.name} photo={info.photo} size={42} />
      <View style={styles.texts}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1}>{info.name}</Text>
          {isMe ? (
            <View style={styles.meBadge}>
              <Text style={styles.meText}>{L('chat.you')}</Text>
            </View>
          ) : null}
        </View>
        {sub ? <Text style={styles.sub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {busy ? <ActivityIndicator size="small" color={CHAT_COLORS.primary} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 9 },
  texts: { flex: 1, marginLeft: 12 },
  nameLine: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 15.5, fontWeight: '600', color: CHAT_COLORS.text, flexShrink: 1 },
  meBadge: { marginLeft: 6, backgroundColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  meText: { fontSize: 11, color: CHAT_COLORS.sub, fontWeight: '600' },
  sub: { fontSize: 12.5, color: CHAT_COLORS.sub, marginTop: 2 },
});
