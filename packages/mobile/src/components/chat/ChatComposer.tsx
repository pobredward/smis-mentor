/**
 * 입력창 — [+] (사진·동영상 / 카메라) · 여러 줄 입력(최대 5줄 높이) · 보내기, 위에 보내기 전 미리보기 줄
 */
import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CHAT_LIMITS, L } from '@smis-mentor/shared';
import type { ChatPickedAsset } from '../../services/chatMedia';
import { AttachTray } from './AttachTray';
import { CHAT_COLORS } from './chatTheme';

interface ChatComposerProps {
  text: string;
  onChangeText: (text: string) => void;
  tray: ChatPickedAsset[];
  original: boolean;
  onToggleOriginal: (value: boolean) => void;
  onRemoveFromTray: (key: string) => void;
  onPressAttach: () => void;
  onSend: () => void;
  /** 아래 안전 영역 (키보드가 올라와 있으면 0) */
  bottomInset: number;
}

/** 한 줄 높이 (대략) — 5줄까지 늘어난다 */
const LINE = 20;
const MAX_LINES = 5;

export function ChatComposer({
  text,
  onChangeText,
  tray,
  original,
  onToggleOriginal,
  onRemoveFromTray,
  onPressAttach,
  onSend,
  bottomInset,
}: ChatComposerProps) {
  const tooLong = text.length > CHAT_LIMITS.textMax;
  const canSend = !tooLong && (text.trim().length > 0 || tray.length > 0);
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(bottomInset, 6) }]}>
      {tray.length ? (
        <AttachTray items={tray} original={original} onToggleOriginal={onToggleOriginal} onRemove={onRemoveFromTray} />
      ) : null}
      {tooLong ? <Text style={styles.warn}>{L('chat.textTooLong', { max: CHAT_LIMITS.textMax })}</Text> : null}
      <View style={styles.row}>
        <TouchableOpacity style={styles.attach} onPress={onPressAttach} accessibilityLabel={L('chat.attach')} hitSlop={6}>
          <Ionicons name="add" size={26} color={CHAT_COLORS.sub} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={onChangeText}
          placeholder={L('chat.inputPlaceholder')}
          placeholderTextColor={CHAT_COLORS.muted}
          multiline
          textAlignVertical="center"
          // 너무 긴 글도 일단 받고 안내한다 (자르지 않음)
          maxLength={CHAT_LIMITS.textMax + 1000}
        />
        <TouchableOpacity
          style={[styles.send, !canSend && styles.sendDisabled]}
          onPress={onSend}
          disabled={!canSend}
          accessibilityLabel={L('chat.send')}
        >
          <Ionicons name="arrow-up" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#ffffff', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CHAT_COLORS.border },
  warn: { color: CHAT_COLORS.danger, fontSize: 12, paddingHorizontal: 14, paddingTop: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 6, paddingTop: 6 },
  attach: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: LINE * MAX_LINES + 18,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    color: CHAT_COLORS.text,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CHAT_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    marginBottom: 2,
  },
  sendDisabled: { backgroundColor: '#cbd5e1' },
});
