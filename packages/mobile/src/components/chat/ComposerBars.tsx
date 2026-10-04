/**
 * 입력창 위 줄들 — 답장 중 · 수정 중 · 조용히 보내기 안내 · 예약 메시지 n개 · @멘션 고르기
 */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { L, chatReplyPreview, type ChatMemberKind, type ChatReplyRef, type Locale } from '@smis-mentor/shared';
import { PersonAvatar } from './ChatAvatar';
import { CHAT_COLORS, MEMBER_KIND_LABEL_KEY } from './chatTheme';

/** 답장 중 — 이름 · 원래 글 한 줄 / 작은 그림 · ✕ */
export function ReplyBar({ reply, name, lang, onClose }: { reply: ChatReplyRef; name: string; lang: Locale; onClose: () => void }) {
  return (
    <View style={styles.bar}>
      <Ionicons name="return-down-forward" size={18} color={CHAT_COLORS.primary} style={styles.icon} />
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={1}>{L('chat.replyingTo', { name })}</Text>
        <Text style={styles.sub} numberOfLines={1}>{chatReplyPreview(reply, lang)}</Text>
      </View>
      {reply.thumbUrl ? <Image source={{ uri: reply.thumbUrl }} style={styles.thumb} contentFit="cover" /> : null}
      <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.close}>
        <Ionicons name="close" size={20} color={CHAT_COLORS.sub} />
      </TouchableOpacity>
    </View>
  );
}

/** 메시지 수정 중 · ✕ */
export function EditBar({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.bar}>
      <Ionicons name="create-outline" size={18} color={CHAT_COLORS.primary} style={styles.icon} />
      <Text style={[styles.title, styles.flex]}>{L('chat.editing')}</Text>
      <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.close}>
        <Ionicons name="close" size={20} color={CHAT_COLORS.sub} />
      </TouchableOpacity>
    </View>
  );
}

/** 조용히 보내기 켜짐 안내 */
export function SilentBar({ onOff }: { onOff: () => void }) {
  return (
    <View style={[styles.bar, styles.silent]}>
      <Ionicons name="notifications-off" size={16} color="#92400e" style={styles.icon} />
      <Text style={[styles.silentText, styles.flex]} numberOfLines={2}>{L('chat.silentOn')}</Text>
      <TouchableOpacity onPress={onOff} hitSlop={10} style={styles.close}>
        <Ionicons name="close" size={18} color="#92400e" />
      </TouchableOpacity>
    </View>
  );
}

/** 예약 메시지 n개 — 누르면 목록 */
export function ScheduledBar({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.bar} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name="alarm-outline" size={17} color={CHAT_COLORS.primary} style={styles.icon} />
      <Text style={[styles.link, styles.flex]}>{L('chat.scheduledN', { n: count })}</Text>
      <Ionicons name="chevron-forward" size={16} color={CHAT_COLORS.muted} />
    </TouchableOpacity>
  );
}

export interface MentionOption {
  /** 사람 uid · 'all' */
  key: string;
  name: string;
  label?: string;
  kind?: ChatMemberKind;
  photo?: string;
}

/** @ 를 치면 뜨는 고르기 목록 (@모두 맨 위) */
export function MentionPicker({ options, onPick }: { options: MentionOption[]; onPick: (o: MentionOption) => void }) {
  if (!options.length) return null;
  return (
    <ScrollView style={styles.mentions} keyboardShouldPersistTaps="always" nestedScrollEnabled>
      {options.map((o) => (
        <TouchableOpacity key={o.key} style={styles.mentionRow} onPress={() => onPick(o)}>
          {o.key === 'all' ? (
            <View style={styles.allIcon}>
              <Ionicons name="megaphone-outline" size={16} color="#ffffff" />
            </View>
          ) : (
            <PersonAvatar name={o.name} photo={o.photo} size={30} />
          )}
          <View style={styles.mentionTexts}>
            <Text style={styles.mentionName} numberOfLines={1}>{o.key === 'all' ? `@${o.name}` : o.name}</Text>
            {o.key === 'all' ? (
              <Text style={styles.sub} numberOfLines={1}>{L('chat.mentionAllDesc')}</Text>
            ) : o.label || o.kind ? (
              <Text style={styles.sub} numberOfLines={1}>
                {[o.kind ? L(MEMBER_KIND_LABEL_KEY[o.kind]) : '', o.label ?? ''].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CHAT_COLORS.border,
    backgroundColor: '#ffffff',
  },
  flex: { flex: 1 },
  icon: { marginRight: 8 },
  texts: { flex: 1 },
  title: { fontSize: 13, fontWeight: '700', color: CHAT_COLORS.text },
  sub: { fontSize: 12.5, color: CHAT_COLORS.sub, marginTop: 1 },
  link: { fontSize: 13.5, color: CHAT_COLORS.primary, fontWeight: '600' },
  thumb: { width: 34, height: 34, borderRadius: 5, marginLeft: 8 },
  close: { paddingLeft: 10 },
  silent: { backgroundColor: '#fffbeb' },
  silentText: { fontSize: 12.5, color: '#92400e' },
  mentions: {
    maxHeight: 210,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CHAT_COLORS.border,
    backgroundColor: '#ffffff',
  },
  mentionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7 },
  allIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: CHAT_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mentionTexts: { flex: 1, marginLeft: 10 },
  mentionName: { fontSize: 14.5, fontWeight: '600', color: CHAT_COLORS.text },
});
