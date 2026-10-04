/**
 * 사람 목록 시트 (탭 여러 개) — 공감한 사람 · 투표한 사람 · 공지 확인/미확인
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { L, type ChatMemberInfo } from '@smis-mentor/shared';
import { ChatSheet } from './ChatSheet';
import { PersonRow } from './PeopleList';
import { CHAT_COLORS } from './chatTheme';

export interface UidListTab {
  key: string;
  label: string;
  uids: string[];
  /** 이름 옆에 붙일 것 (공감 이모지 등) */
  badgeOf?: (uid: string) => string;
}

interface UidListSheetProps {
  visible: boolean;
  title: string;
  tabs: UidListTab[];
  memberInfo?: Record<string, ChatMemberInfo>;
  myUid: string;
  onClose: () => void;
  /** 사람 누르기 (없으면 누를 수 없음) */
  onPressPerson?: (uid: string) => void;
}

export function UidListSheet({ visible, title, tabs, memberInfo, myUid, onClose, onPressPerson }: UidListSheetProps) {
  const [tab, setTab] = useState(tabs[0]?.key ?? '');
  useEffect(() => {
    if (visible) setTab(tabs[0]?.key ?? '');
    // 열 때만 첫 탭으로
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];
  const rows = useMemo(
    () =>
      (current?.uids ?? []).map((uid) => ({
        uid,
        info: memberInfo?.[uid] ?? { name: L('chat.unknownUser'), kind: 'mentor' as const },
        badge: current?.badgeOf?.(uid) ?? '',
      })),
    [current, memberInfo],
  );
  return (
    <ChatSheet visible={visible} onClose={onClose} title={title} heightRatio={0.7}>
      {tabs.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabs}>
          {tabs.map((t) => {
            const on = t.key === current?.key;
            return (
              <TouchableOpacity key={t.key} style={[styles.tab, on && styles.tabOn]} onPress={() => setTab(t.key)}>
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{`${t.label} ${t.uids.length}`}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.uid}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.person}>
              <PersonRow
                info={item.info}
                isMe={item.uid === myUid}
                showKind
                onPress={onPressPerson ? () => onPressPerson(item.uid) : undefined}
              />
            </View>
            {item.badge ? <Text style={styles.badge}>{item.badge}</Text> : null}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>—</Text>}
        contentContainerStyle={styles.content}
      />
    </ChatSheet>
  );
}

const styles = StyleSheet.create({
  tabBar: { flexGrow: 0 },
  tabs: { paddingHorizontal: 14, paddingBottom: 8, gap: 8 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CHAT_COLORS.border,
  },
  tabOn: { backgroundColor: CHAT_COLORS.primary, borderColor: CHAT_COLORS.primary },
  tabText: { fontSize: 13.5, color: CHAT_COLORS.text, fontWeight: '600' },
  tabTextOn: { color: '#ffffff' },
  row: { flexDirection: 'row', alignItems: 'center' },
  person: { flex: 1 },
  badge: { fontSize: 18, paddingRight: 18 },
  content: { paddingBottom: 16 },
  empty: { textAlign: 'center', color: CHAT_COLORS.muted, marginTop: 24 },
});
