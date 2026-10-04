/**
 * 대화 상대 — 매니저 / 멘토 / 원어민 묶음, 역할(label) 표시, '나' 표시. 다른 사람을 누르면 1:1 대화
 */
import React, { useMemo } from 'react';
import { SectionList, Text, StyleSheet, View } from 'react-native';
import { L, type ChatMemberInfo, type ChatRoom } from '@smis-mentor/shared';
import { ChatSheet } from './ChatSheet';
import { PersonRow } from './PeopleList';
import { CHAT_COLORS, MEMBER_KIND_LABEL_KEY, MEMBER_KIND_ORDER } from './chatTheme';

interface MembersSheetProps {
  visible: boolean;
  room: ChatRoom | null;
  myUid: string;
  /** 1:1 대화를 여는 중인 사람 */
  busyUid: string | null;
  onClose: () => void;
  onPressMember: (uid: string) => void;
}

type MemberEntry = { uid: string; info: ChatMemberInfo };

export function MembersSheet({ visible, room, myUid, busyUid, onClose, onPressMember }: MembersSheetProps) {
  const sections = useMemo(() => {
    if (!room) return [];
    const all: MemberEntry[] = (room.memberIds ?? []).map((uid) => ({
      uid,
      info: room.memberInfo?.[uid] ?? { name: L('chat.unknownUser'), kind: 'mentor' as const },
    }));
    const byName = (a: MemberEntry, b: MemberEntry) =>
      a.uid === myUid ? -1 : b.uid === myUid ? 1 : a.info.name.localeCompare(b.info.name, 'ko');
    return MEMBER_KIND_ORDER.map((kind) => ({
      kind,
      title: L(MEMBER_KIND_LABEL_KEY[kind]),
      data: all.filter((m) => (m.info.kind ?? 'mentor') === kind).sort(byName),
    })).filter((s) => s.data.length > 0);
  }, [room, myUid]);

  const count = room?.memberIds?.length ?? 0;
  return (
    <ChatSheet visible={visible} onClose={onClose} title={L('chat.members', { n: count })} heightRatio={0.8}>
      <SectionList
        sections={sections}
        keyExtractor={(m) => m.uid}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.header}>
            <Text style={styles.headerText}>{`${section.title} ${section.data.length}`}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <PersonRow
            info={item.info}
            isMe={item.uid === myUid}
            busy={busyUid === item.uid}
            disabled={!!busyUid}
            onPress={() => onPressMember(item.uid)}
          />
        )}
        contentContainerStyle={styles.content}
      />
    </ChatSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 12 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  headerText: { fontSize: 12.5, fontWeight: '700', color: CHAT_COLORS.sub },
});
