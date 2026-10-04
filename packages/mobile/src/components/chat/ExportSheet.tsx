/**
 * 대화 내보내기 — '사진·동영상 주소 포함'(기본 꺼짐) + 안내 → 파일로 만들어 공유
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Switch, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { L } from '@smis-mentor/shared';
import { ChatSheet } from './ChatSheet';
import { CHAT_COLORS } from './chatTheme';

interface ExportSheetProps {
  visible: boolean;
  /** 모으는 중이면 지금까지 개수 */
  loadingCount: number | null;
  onClose: () => void;
  onExport: (includeLinks: boolean) => void;
}

export function ExportSheet({ visible, loadingCount, onClose, onExport }: ExportSheetProps) {
  const [links, setLinks] = useState(false);
  useEffect(() => {
    if (visible) setLinks(false);
  }, [visible]);
  const busy = loadingCount !== null;
  return (
    <ChatSheet visible={visible} onClose={onClose} title={L('chat.export')}>
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.label}>{L('chat.exportIncludeLinks')}</Text>
          <Switch value={links} onValueChange={setLinks} trackColor={{ true: CHAT_COLORS.primary, false: '#cbd5e1' }} />
        </View>
        <Text style={styles.hint}>{L('chat.exportLinksHint')}</Text>
        <TouchableOpacity style={[styles.submit, busy && styles.disabled]} onPress={() => onExport(links)} disabled={busy}>
          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color="#ffffff" />
              <Text style={styles.submitText}>{L('chat.exportLoading', { n: loadingCount ?? 0 })}</Text>
            </View>
          ) : (
            <Text style={styles.submitText}>{L('chat.export')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </ChatSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 15, color: CHAT_COLORS.text },
  hint: { fontSize: 12.5, color: CHAT_COLORS.sub },
  submit: { marginTop: 8, backgroundColor: CHAT_COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  submitText: { color: '#ffffff', fontSize: 14.5, fontWeight: '700' },
});
