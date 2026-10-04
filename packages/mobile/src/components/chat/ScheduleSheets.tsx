/**
 * 예약 메시지 — 만들기 시트(보낼 시각 + 글) · 이 방의 예약 목록(하나씩 취소)
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import {
  CHAT_LIMITS,
  L,
  chatDayLabel,
  chatTimeLabel,
  getCurrentLocale,
  type ChatScheduledMessage,
} from '@smis-mentor/shared';
import { ChatSheet } from './ChatSheet';
import { DateTimeField, roundUpTo10Min } from './DateTimeField';
import { CHAT_COLORS } from './chatTheme';

export const scheduleLabel = (d: Date) => {
  const lang = getCurrentLocale();
  return `${chatDayLabel(d, lang)} ${chatTimeLabel(d, lang)}`;
};

interface ScheduleCreateSheetProps {
  visible: boolean;
  /** 입력창에 쓴 글 (비었으면 시트 안에서 쓴다) */
  composerText: string;
  /** 사진이 담겨 있으면 안내 (예약은 글만) */
  hasMedia: boolean;
  onClose: () => void;
  onSubmit: (sendAt: Date, text: string) => Promise<void>;
}

export function ScheduleCreateSheet({ visible, composerText, hasMedia, onClose, onSubmit }: ScheduleCreateSheetProps) {
  const [at, setAt] = useState(() => roundUpTo10Min(new Date(Date.now() + 60 * 60 * 1000)));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setAt(roundUpTo10Min(new Date(Date.now() + 60 * 60 * 1000)));
    setText('');
    setBusy(false);
  }, [visible]);
  const useComposer = !!composerText.trim();
  const body = useComposer ? composerText : text;
  const submit = async () => {
    if (busy || !body.trim()) return;
    setBusy(true);
    try {
      await onSubmit(at, body);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ChatSheet visible={visible} onClose={onClose} title={L('chat.schedule')}>
      <View style={styles.body}>
        <Text style={styles.label}>{L('chat.scheduleAt')}</Text>
        <DateTimeField
          value={at}
          onChange={setAt}
          minimumDate={new Date()}
          maximumDate={new Date(Date.now() + CHAT_LIMITS.scheduleMaxDays * 86400000)}
        />
        {hasMedia ? <Text style={styles.note}>{L('chat.scheduleTextOnly')}</Text> : null}
        {useComposer ? (
          <Text style={styles.preview} numberOfLines={4}>{composerText}</Text>
        ) : (
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={L('chat.inputPlaceholder')}
            placeholderTextColor={CHAT_COLORS.muted}
            multiline
            maxLength={CHAT_LIMITS.textMax}
          />
        )}
        <TouchableOpacity style={[styles.submit, (!body.trim() || busy) && styles.disabled]} onPress={submit} disabled={!body.trim() || busy}>
          {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitText}>{L('chat.scheduleSet', { at: scheduleLabel(at) })}</Text>}
        </TouchableOpacity>
      </View>
    </ChatSheet>
  );
}

interface ScheduledListSheetProps {
  visible: boolean;
  items: ChatScheduledMessage[];
  onClose: () => void;
  onCancelItem: (item: ChatScheduledMessage) => void;
}

export function ScheduledListSheet({ visible, items, onClose, onCancelItem }: ScheduledListSheetProps) {
  return (
    <ChatSheet visible={visible} onClose={onClose} title={L('chat.scheduledN', { n: items.length })} heightRatio={0.6}>
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowTexts}>
              <Text style={styles.rowAt}>{scheduleLabel(item.sendAt.toDate())}</Text>
              <Text style={styles.rowText} numberOfLines={3}>{item.text}</Text>
            </View>
            <TouchableOpacity style={styles.cancel} onPress={() => onCancelItem(item)}>
              <Text style={styles.cancelText}>{L('chat.scheduleCancel')}</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </ChatSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 8, gap: 10 },
  label: { fontSize: 13, color: CHAT_COLORS.sub },
  note: { fontSize: 12.5, color: '#b45309' },
  preview: {
    fontSize: 14.5,
    color: CHAT_COLORS.text,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 10,
  },
  input: {
    minHeight: 80,
    maxHeight: 160,
    borderWidth: 1,
    borderColor: CHAT_COLORS.border,
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    color: CHAT_COLORS.text,
    textAlignVertical: 'top',
  },
  submit: { backgroundColor: CHAT_COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  disabled: { opacity: 0.45 },
  submitText: { color: '#ffffff', fontSize: 14.5, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CHAT_COLORS.border,
  },
  rowTexts: { flex: 1, paddingRight: 10 },
  rowAt: { fontSize: 12.5, color: CHAT_COLORS.primary, fontWeight: '600' },
  rowText: { fontSize: 14, color: CHAT_COLORS.text, marginTop: 2 },
  cancel: { borderWidth: 1, borderColor: CHAT_COLORS.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  cancelText: { fontSize: 12.5, color: CHAT_COLORS.danger, fontWeight: '600' },
});
