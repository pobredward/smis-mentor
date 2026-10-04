/**
 * 메시지 신고 — 이유 고르기 + 자세한 내용(선택)
 */
import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { L, type ChatReportReason, type MessageKey } from '@smis-mentor/shared';
import { ChatSheet } from './ChatSheet';
import { CHAT_COLORS } from './chatTheme';

const REASONS: Array<{ value: ChatReportReason; key: MessageKey }> = [
  { value: 'spam', key: 'chat.reasonSpam' },
  { value: 'abuse', key: 'chat.reasonAbuse' },
  { value: 'sexual', key: 'chat.reasonSexual' },
  { value: 'privacy', key: 'chat.reasonPrivacy' },
  { value: 'other', key: 'chat.reasonOther' },
];

interface ReportSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: ChatReportReason, detail: string) => Promise<void>;
}

export function ReportSheet({ visible, onClose, onSubmit }: ReportSheetProps) {
  const [reason, setReason] = useState<ChatReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetail('');
      setBusy(false);
    }
  }, [visible]);

  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true);
    try {
      await onSubmit(reason, detail.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <ChatSheet visible={visible} onClose={onClose} title={L('chat.reportTitle')}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <Text style={styles.label}>{L('chat.appReportReason')}</Text>
        {REASONS.map((r) => {
          const on = reason === r.value;
          return (
            <TouchableOpacity key={r.value} style={styles.reason} onPress={() => setReason(r.value)}>
              <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? CHAT_COLORS.primary : CHAT_COLORS.muted} />
              <Text style={styles.reasonText}>{L(r.key)}</Text>
            </TouchableOpacity>
          );
        })}
        <TextInput
          style={styles.input}
          value={detail}
          onChangeText={setDetail}
          placeholder={L('chat.reportDetail')}
          placeholderTextColor={CHAT_COLORS.muted}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />
        <TouchableOpacity style={[styles.submit, (!reason || busy) && styles.submitDisabled]} onPress={submit} disabled={!reason || busy}>
          {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitText}>{L('chat.report')}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </ChatSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 8 },
  label: { fontSize: 13, color: CHAT_COLORS.sub, marginTop: 4, marginBottom: 4 },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  reasonText: { fontSize: 15, color: CHAT_COLORS.text },
  input: {
    minHeight: 80,
    maxHeight: 140,
    borderWidth: 1,
    borderColor: CHAT_COLORS.border,
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: CHAT_COLORS.text,
    marginTop: 8,
  },
  submit: {
    marginTop: 14,
    backgroundColor: CHAT_COLORS.danger,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});
