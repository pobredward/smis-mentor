/**
 * 입력창 — [+] (사진·동영상 / 카메라 / 투표 / 예약) · 여러 줄 입력(최대 5줄 높이) · 보내기(길게 누르면 조용히 보내기) · 🎤
 * 위에는 화면이 넘겨 준 줄들(답장 · 수정 · 조용히 · 예약 · @멘션)과 보내기 전 미리보기 줄
 */
import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CHAT_LIMITS, L } from '@smis-mentor/shared';
import type { ChatPickedAsset } from '../../services/chatMedia';
import { AttachTray } from './AttachTray';
import { CHAT_COLORS } from './chatTheme';

interface ChatComposerProps {
  text: string;
  onChangeText: (text: string) => void;
  onSelectionChange?: (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => void;
  inputRef?: React.Ref<TextInput>;
  /** 입력창 위 줄들 */
  topBars?: React.ReactNode;
  tray: ChatPickedAsset[];
  original: boolean;
  onToggleOriginal: (value: boolean) => void;
  onRemoveFromTray: (key: string) => void;
  onPressAttach: () => void;
  onSend: () => void;
  /** 보내기 길게 누르기 — 조용히 보내기 켜고 끄기 */
  onLongPressSend: () => void;
  silent: boolean;
  /** 메시지 수정 중 (첨부·음성 숨김) */
  editing: boolean;
  /** 비었을 때 보내기 자리에 🎤 */
  onPressMic: () => void;
  /** 아래 안전 영역 (키보드가 올라와 있으면 0) */
  bottomInset: number;
}

/** 한 줄 높이 (대략) — 5줄까지 늘어난다 */
const LINE = 20;
const MAX_LINES = 5;

export function ChatComposer({
  text,
  onChangeText,
  onSelectionChange,
  inputRef,
  topBars,
  tray,
  original,
  onToggleOriginal,
  onRemoveFromTray,
  onPressAttach,
  onSend,
  onLongPressSend,
  silent,
  editing,
  onPressMic,
  bottomInset,
}: ChatComposerProps) {
  const tooLong = text.length > CHAT_LIMITS.textMax;
  const canSend = !tooLong && (text.trim().length > 0 || (!editing && tray.length > 0));
  const showMic = !editing && !text.trim() && !tray.length;
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(bottomInset, 6) }]}>
      {topBars}
      {tray.length && !editing ? (
        <AttachTray items={tray} original={original} onToggleOriginal={onToggleOriginal} onRemove={onRemoveFromTray} />
      ) : null}
      {tooLong ? <Text style={styles.warn}>{L('chat.textTooLong', { max: CHAT_LIMITS.textMax })}</Text> : null}
      <View style={styles.row}>
        {editing ? (
          <View style={styles.attach} />
        ) : (
          <TouchableOpacity style={styles.attach} onPress={onPressAttach} accessibilityLabel={L('chat.attach')} hitSlop={6}>
            <Ionicons name="add" size={26} color={CHAT_COLORS.sub} />
          </TouchableOpacity>
        )}
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={onChangeText}
          onSelectionChange={onSelectionChange}
          placeholder={L('chat.inputPlaceholder')}
          placeholderTextColor={CHAT_COLORS.muted}
          multiline
          textAlignVertical="center"
          // 너무 긴 글도 일단 받고 안내한다 (자르지 않음)
          maxLength={CHAT_LIMITS.textMax + 1000}
        />
        {showMic ? (
          <TouchableOpacity style={styles.mic} onPress={onPressMic} onLongPress={onLongPressSend} accessibilityLabel={L('chat.voiceRecord')}>
            <Ionicons name="mic" size={22} color={CHAT_COLORS.primary} />
            {silent ? <Text style={styles.silentBadge}>🔕</Text> : null}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.send, !canSend && styles.sendDisabled, silent && styles.sendSilent]}
            onPress={onSend}
            onLongPress={onLongPressSend}
            delayLongPress={400}
            disabled={!canSend}
            accessibilityLabel={editing ? L('chat.editSave') : silent ? L('chat.silentSend') : L('chat.send')}
          >
            <Ionicons name={editing ? 'checkmark' : 'arrow-up'} size={20} color="#ffffff" />
            {silent && !editing ? <Text style={styles.silentBadge}>🔕</Text> : null}
          </TouchableOpacity>
        )}
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
  sendSilent: { backgroundColor: '#64748b' },
  mic: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  silentBadge: { position: 'absolute', top: -6, right: -6, fontSize: 12 },
});
