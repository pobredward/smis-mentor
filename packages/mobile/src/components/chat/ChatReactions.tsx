/**
 * 공감 — 메시지 메뉴 위 이모지 줄 · 말풍선 아래 칩 "✅ 3 ❤️ 1"
 */
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CHAT_REACTIONS, CHAT_REACTION_EMOJI, reactionSummary, type ChatReactionKey } from '@smis-mentor/shared';
import { CHAT_COLORS } from './chatTheme';

/** 메시지 메뉴 맨 위 — 이모지 6개 (내가 단 것 강조, 다시 누르면 취소) */
export function ReactionPickerRow({ mine, onPick }: { mine: ChatReactionKey | null; onPick: (key: ChatReactionKey | null) => void }) {
  return (
    <View style={styles.picker}>
      {CHAT_REACTIONS.map((k) => {
        const on = mine === k;
        return (
          <TouchableOpacity key={k} style={[styles.pickBtn, on && styles.pickBtnOn]} onPress={() => onPick(on ? null : k)} hitSlop={4}>
            <Text style={styles.pickEmoji}>{CHAT_REACTION_EMOJI[k]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ReactionChipsImpl({
  reactions,
  myUid,
  alignEnd,
  onPress,
}: {
  reactions: Record<string, ChatReactionKey> | null | undefined;
  myUid: string;
  alignEnd: boolean;
  onPress: () => void;
}) {
  const list = reactionSummary(reactions);
  if (!list.length) return null;
  return (
    <View style={[styles.chips, alignEnd ? styles.chipsEnd : styles.chipsStart]}>
      {list.map((r) => {
        const mine = r.uids.includes(myUid);
        return (
          <TouchableOpacity key={r.key} style={[styles.chip, mine && styles.chipMine]} onPress={onPress} activeOpacity={0.7}>
            <Text style={styles.chipEmoji}>{r.emoji}</Text>
            <Text style={[styles.chipCount, mine && styles.chipCountMine]}>{r.count}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export const ReactionChips = memo(ReactionChipsImpl);

const styles = StyleSheet.create({
  picker: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CHAT_COLORS.border,
  },
  pickBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  pickBtnOn: { backgroundColor: '#dbeafe' },
  pickEmoji: { fontSize: 26 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 },
  chipsEnd: { justifyContent: 'flex-end' },
  chipsStart: { justifyContent: 'flex-start' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CHAT_COLORS.border,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  chipMine: { borderColor: CHAT_COLORS.primary, backgroundColor: '#eff6ff' },
  chipEmoji: { fontSize: 13 },
  chipCount: { fontSize: 12, color: CHAT_COLORS.sub, fontWeight: '600' },
  chipCountMine: { color: CHAT_COLORS.primary },
});
