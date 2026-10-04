/**
 * 답장 — 말풍선 안 위쪽 인용 칸 (이름 굵게 + 원래 글 한 줄 / 작은 그림). 누르면 원래 메시지로.
 */
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { chatReplyPreview, type ChatReplyRef, type Locale } from '@smis-mentor/shared';
import { CHAT_COLORS } from './chatTheme';

function ReplyQuoteImpl({
  reply,
  name,
  lang,
  mine,
  onPress,
  onLongPress,
}: {
  reply: ChatReplyRef;
  /** 방의 지금 이름 (없으면 보낼 때 이름) */
  name: string;
  lang: Locale;
  mine: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.box, mine ? styles.boxMine : styles.boxOther]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View style={[styles.bar, mine ? styles.barMine : styles.barOther]} />
      <View style={styles.texts}>
        <Text style={[styles.name, mine ? styles.nameMine : styles.nameOther]} numberOfLines={1}>{name}</Text>
        <Text style={[styles.text, mine ? styles.textMine : styles.textOther]} numberOfLines={1}>{chatReplyPreview(reply, lang)}</Text>
      </View>
      {reply.thumbUrl ? <Image source={{ uri: reply.thumbUrl }} style={styles.thumb} contentFit="cover" /> : null}
    </TouchableOpacity>
  );
}

export const ReplyQuote = memo(ReplyQuoteImpl);

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingVertical: 5, paddingRight: 6, marginBottom: 6, minWidth: 120 },
  boxMine: { backgroundColor: 'rgba(255,255,255,0.18)' },
  boxOther: { backgroundColor: '#f1f5f9' },
  bar: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginRight: 7 },
  barMine: { backgroundColor: 'rgba(255,255,255,0.8)' },
  barOther: { backgroundColor: CHAT_COLORS.primary },
  texts: { flexShrink: 1 },
  name: { fontSize: 12.5, fontWeight: '700' },
  nameMine: { color: '#ffffff' },
  nameOther: { color: CHAT_COLORS.text },
  text: { fontSize: 12.5, marginTop: 1 },
  textMine: { color: 'rgba(255,255,255,0.85)' },
  textOther: { color: CHAT_COLORS.sub },
  thumb: { width: 34, height: 34, borderRadius: 5, marginLeft: 8 },
});
