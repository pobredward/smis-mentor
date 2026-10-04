/**
 * 새 1:1 대화 — 내가 들어간 모든 캠프 전체방(camp_all)의 사람을 합친 목록에서 고르기 (이름 검색)
 */
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, TextInput, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { L, type ChatMemberInfo, type ChatRoom } from '@smis-mentor/shared';
import { ChatSheet } from './ChatSheet';
import { PersonRow } from './PeopleList';
import { CHAT_COLORS } from './chatTheme';

interface NewDmSheetProps {
  visible: boolean;
  /** 내 방 전부 (지금 캠프 방이 앞에 오도록 넘기면 그 캠프의 역할 표시가 쓰인다) */
  rooms: ChatRoom[];
  myUid: string;
  busyUid: string | null;
  onClose: () => void;
  onPick: (uid: string) => void;
}

export function NewDmSheet({ visible, rooms, myUid, busyUid, onClose, onPick }: NewDmSheetProps) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const people = useMemo(() => {
    const map = new Map<string, ChatMemberInfo>();
    rooms
      .filter((r) => r.type === 'camp_all')
      .forEach((r) => {
        Object.entries(r.memberInfo ?? {}).forEach(([uid, info]) => {
          if (uid !== myUid && info && !map.has(uid)) map.set(uid, info);
        });
      });
    return [...map.entries()]
      .map(([uid, info]) => ({ uid, info }))
      .sort((a, b) => a.info.name.localeCompare(b.info.name, 'ko'));
  }, [rooms, myUid]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => p.info.name.toLowerCase().includes(q));
  }, [people, query]);

  return (
    <ChatSheet visible={visible} onClose={onClose} title={L('chat.newDm')} heightRatio={0.85}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={17} color={CHAT_COLORS.muted} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={L('chat.searchPeople')}
          placeholderTextColor={CHAT_COLORS.muted}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.uid}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <PersonRow
            info={item.info}
            showKind
            busy={busyUid === item.uid}
            disabled={!!busyUid}
            onPress={() => onPick(item.uid)}
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>{L('chat.noPeople')}</Text>}
        contentContainerStyle={styles.content}
      />
    </ChatSheet>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  search: { flex: 1, paddingVertical: 9, paddingHorizontal: 8, fontSize: 15, color: CHAT_COLORS.text },
  content: { paddingBottom: 16 },
  empty: { textAlign: 'center', color: CHAT_COLORS.sub, marginTop: 32, fontSize: 14 },
});
