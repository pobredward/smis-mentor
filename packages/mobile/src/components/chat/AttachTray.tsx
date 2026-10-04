/**
 * 보내기 전 미리보기 줄 — 작은 그림 · 하나씩 빼기 · [원본으로 보내기]
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { L } from '@smis-mentor/shared';
import type { ChatPickedAsset } from '../../services/chatMedia';
import { CHAT_COLORS, formatDuration } from './chatTheme';

interface AttachTrayProps {
  items: ChatPickedAsset[];
  original: boolean;
  onToggleOriginal: (value: boolean) => void;
  onRemove: (key: string) => void;
}

const THUMB = 64;

export function AttachTray({ items, original, onToggleOriginal, onRemove }: AttachTrayProps) {
  // iOS: 일반 화질로 고른 동영상은 이미 720p 로 내보내져 원본으로 바꿀 수 없다
  const videoNote = Platform.OS === 'ios' && original && items.some((a) => a.kind === 'video' && !a.exportedOriginal);
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs} keyboardShouldPersistTaps="handled">
        {items.map((a) => {
          const uri = a.previewUri ?? (a.kind === 'image' ? a.uri : undefined);
          return (
            <View key={a.key} style={styles.thumb}>
              {uri ? (
                <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={uri} />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.thumbEmpty]} />
              )}
              {a.kind === 'video' ? (
                <View style={styles.videoTag} pointerEvents="none">
                  <Ionicons name="videocam" size={11} color="#ffffff" />
                  <Text style={styles.videoTagText}>{formatDuration(a.durationMs)}</Text>
                </View>
              ) : null}
              <TouchableOpacity style={styles.remove} onPress={() => onRemove(a.key)} hitSlop={8}>
                <Ionicons name="close" size={13} color="#ffffff" />
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.optionRow}>
        <View style={styles.optionTexts}>
          <Text style={styles.optionTitle}>{L('chat.sendOriginal')}</Text>
          <Text style={styles.optionHint}>{L('chat.sendOriginalHint')}</Text>
        </View>
        <Text style={styles.count}>{L('chat.appSelectedN', { n: items.length })}</Text>
        <Switch
          value={original}
          onValueChange={onToggleOriginal}
          trackColor={{ true: CHAT_COLORS.primary, false: '#cbd5e1' }}
          thumbColor={Platform.OS === 'android' ? '#ffffff' : undefined}
        />
      </View>
      {videoNote ? <Text style={styles.note}>{L('chat.appVideoOriginalNote')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CHAT_COLORS.border, paddingTop: 8 },
  thumbs: { paddingHorizontal: 10, gap: 8 },
  thumb: { width: THUMB, height: THUMB, borderRadius: 10, overflow: 'hidden', backgroundColor: '#e2e8f0' },
  thumbEmpty: { backgroundColor: '#334155' },
  videoTag: {
    position: 'absolute',
    left: 4,
    bottom: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  videoTagText: { color: '#ffffff', fontSize: 10, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 2 },
  remove: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8 },
  optionTexts: { flex: 1, paddingRight: 8 },
  optionTitle: { fontSize: 14, fontWeight: '600', color: CHAT_COLORS.text },
  optionHint: { fontSize: 11.5, color: CHAT_COLORS.sub, marginTop: 1 },
  count: { fontSize: 12, color: CHAT_COLORS.sub, marginRight: 8 },
  note: { fontSize: 11.5, color: '#b45309', paddingHorizontal: 12, paddingTop: 4 },
});
