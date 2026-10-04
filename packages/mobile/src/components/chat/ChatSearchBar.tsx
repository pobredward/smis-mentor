/**
 * 대화 내용 검색 (카톡처럼)
 * - ChatSearchInput: 머리글 아래 검색창 + [닫기]
 * - ChatSearchNav: 입력창 자리에 "2/15" · ↑(이전 결과) · ↓(다음 결과)
 */
import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { L } from '@smis-mentor/shared';
import { CHAT_COLORS } from './chatTheme';

export function ChatSearchInput({
  value,
  onChangeText,
  onSubmit,
  onClose,
}: {
  value: string;
  onChangeText: (text: string) => void;
  /** 키보드의 [검색] — 다음(더 예전) 결과 */
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.inputBar}>
      <View style={styles.inputBox}>
        <Ionicons name="search" size={16} color={CHAT_COLORS.muted} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={L('chat.searchPlaceholder')}
          placeholderTextColor={CHAT_COLORS.muted}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          submitBehavior="submit"
          onSubmitEditing={onSubmit}
          accessibilityLabel={L('chat.search')}
        />
        {value ? (
          <TouchableOpacity onPress={() => onChangeText('')} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color={CHAT_COLORS.muted} />
          </TouchableOpacity>
        ) : null}
      </View>
      <TouchableOpacity onPress={onClose} style={styles.close} hitSlop={6} accessibilityLabel={L('chat.searchClose')}>
        <Text style={styles.closeText}>{L('common.close')}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function ChatSearchNav({
  status,
  loading,
  canOlder,
  canNewer,
  onOlder,
  onNewer,
  bottomInset,
}: {
  /** "2/15" · "검색 결과가 없어요" · "대화를 불러오는 중… 1,500개" */
  status: string;
  loading: boolean;
  canOlder: boolean;
  canNewer: boolean;
  onOlder: () => void;
  onNewer: () => void;
  bottomInset: number;
}) {
  return (
    <View style={[styles.nav, { paddingBottom: Math.max(bottomInset, 8) }]}>
      <View style={styles.statusWrap}>
        {loading ? <ActivityIndicator size="small" color={CHAT_COLORS.sub} style={styles.spinner} /> : null}
        <Text style={styles.status} numberOfLines={1}>{status}</Text>
      </View>
      <TouchableOpacity
        style={[styles.arrow, !canOlder && styles.arrowOff]}
        onPress={onOlder}
        disabled={!canOlder}
        accessibilityLabel={L('chat.searchOlder')}
      >
        <Ionicons name="chevron-up" size={22} color={CHAT_COLORS.text} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.arrow, !canNewer && styles.arrowOff]}
        onPress={onNewer}
        disabled={!canNewer}
        accessibilityLabel={L('chat.searchNewer')}
      >
        <Ionicons name="chevron-down" size={22} color={CHAT_COLORS.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CHAT_COLORS.border,
  },
  inputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  input: { flex: 1, paddingVertical: 8, paddingHorizontal: 8, fontSize: 15, color: CHAT_COLORS.text },
  close: { paddingHorizontal: 10, paddingVertical: 6 },
  closeText: { fontSize: 15, color: CHAT_COLORS.primary, fontWeight: '600' },

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CHAT_COLORS.border,
  },
  statusWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  spinner: { marginRight: 8 },
  status: { fontSize: 14, color: CHAT_COLORS.sub, flexShrink: 1 },
  arrow: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  arrowOff: { opacity: 0.3 },
});
