/**
 * 채팅 탭 — 방 목록 (기수별)
 *  1) 지금 기수의 캠프 방·그룹방 (늘 위에 고정) — 캠프가 2개 이상이면 위에 [All][J29][E29][S29]… 버튼으로 골라 본다
 *  2) 고정한 대화  3) 1:1 대화 (최근 순)  4) 지난 기수 (접힘, 기수 › 캠프별)  5) 숨긴 채팅방 n개
 * 길게 누르면 고정 · 숨기기 (1:1 · 지난 기수 방만 — 지금 기수 캠프 방은 늘 고정)
 * 방 목록·안 읽은 수는 MainTabs 가 구독해 둔 것(useChatStore)을 읽는다.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  L,
  chatRoomGroups,
  filterCampGroups,
  getCurrentLocale,
  isRoomHidden,
  isRoomMuted,
  isUserBlocked,
  setChatRoomHidden,
  setChatRoomPinned,
  chatRoomTitle,
  logger,
  resolveActiveJobCodeId,
  totalUnread,
  unreadBadgeText,
  unreadOf,
  type ChatRoom,
} from '@smis-mentor/shared';
import { useAuth } from '../context/AuthContext';
import { useChatStore } from '../hooks/useChatUnread';
import { mobileAuthenticatedPost } from '../services/apiClient';
import { ChatRoomRow } from '../components/chat/ChatRoomRow';
import { NewDmSheet } from '../components/chat/NewDmSheet';
import { ChatSheet, ChatSheetOption } from '../components/chat/ChatSheet';
import { db } from '../config/firebase';
import { CHAT_COLORS } from '../components/chat/chatTheme';
import type { MainTabScreenProps } from '../navigation/types';

type ListItem =
  | { type: 'header'; key: string; title: string; collapsible?: boolean; open?: boolean; unread?: number }
  /** 지난 기수 안의 기수 이름 ('28기') */
  | { type: 'generation'; key: string; title: string }
  /** 지난 기수 안의 캠프 코드 */
  | { type: 'sub'; key: string; title: string }
  | { type: 'room'; key: string; room: ChatRoom }
  /** 맨 아래 '숨긴 채팅방 n개' */
  | { type: 'hidden'; key: string; count: number };

/** 캠프 버튼 — 'all' 또는 jobCodeId */
const FILTER_ALL = 'all';

export function ChatListScreen({ navigation }: MainTabScreenProps<'Chat'>) {
  const { userData } = useAuth();
  const uid = userData?.userId ?? '';
  const { rooms, state, roomsReady, error } = useChatStore();
  const lang = getCurrentLocale();
  const activeJobCodeId = resolveActiveJobCodeId(userData) ?? null;

  const [keepEmptyDmId, setKeepEmptyDmId] = useState<string | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);
  // 지금 기수에서 볼 캠프 (이 화면이 살아 있는 동안 기억)
  const [campFilter, setCampFilter] = useState<string>(FILTER_ALL);
  // 길게 누른 방 (고정 · 숨기기 메뉴) · 숨긴 방 목록
  const [menuRoom, setMenuRoom] = useState<ChatRoom | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [dmSheetOpen, setDmSheetOpen] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 캠프 방을 캠프 배정대로 맞춘다 (조용히 — 실패해도 이미 있는 방은 보인다)
  const sync = useCallback(async () => {
    try {
      await mobileAuthenticatedPost('/api/chat/sync', {});
    } catch (e) {
      logger.info('채팅방 동기화 건너뜀:', e);
    }
  }, []);

  useEffect(() => {
    if (uid) void sync();
  }, [uid, activeJobCodeId, sync]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await sync();
    setRefreshing(false);
  }, [sync]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setDmSheetOpen(true)}
          style={styles.headerBtn}
          accessibilityLabel={L('chat.newDm')}
          hitSlop={8}
        >
          <Ionicons name="create-outline" size={24} color={CHAT_COLORS.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const groups = useMemo(
    () => chatRoomGroups(rooms, { activeJobCodeId, keepEmptyDmId, state }),
    [rooms, activeJobCodeId, keepEmptyDmId, state],
  );
  /** 지금 기수의 캠프 방 · 그룹방 — 늘 고정 (고정 해제 · 숨기기 불가) */
  const presetIds = useMemo(() => new Set(groups.camps.flatMap((c) => c.rooms.map((r) => r.id))), [groups]);
  const showCampChips = groups.camps.length >= 2;
  // 고른 캠프가 목록에서 사라지면(배정 해제 등) 전체로
  const selectedFilter = groups.camps.some((c) => c.jobCodeId === campFilter) ? campFilter : FILTER_ALL;
  useEffect(() => {
    if (roomsReady && campFilter !== FILTER_ALL && selectedFilter === FILTER_ALL) setCampFilter(FILTER_ALL);
  }, [roomsReady, campFilter, selectedFilter]);

  useEffect(() => {
    if (error) logger.warn('채팅방 목록을 불러오지 못함:', error);
  }, [error]);

  const items = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [];
    const pushRooms = (list: ChatRoom[]) => list.forEach((room) => out.push({ type: 'room', key: room.id, room }));
    // 1) 지금 기수의 캠프 방 (버튼으로 고른 캠프만, 또는 전부)
    filterCampGroups(groups.camps, showCampChips ? selectedFilter : FILTER_ALL).forEach((camp) => {
      out.push({ type: 'header', key: `h_camp_${camp.jobCodeId}`, title: L('chat.campRooms', { camp: camp.campCode || camp.jobCodeId }) });
      pushRooms(camp.rooms);
    });
    // 2) 고정한 대화
    if (groups.pinned.length) {
      out.push({ type: 'header', key: 'h_pinned', title: L('chat.pinnedSection') });
      pushRooms(groups.pinned);
    }
    // 3) 1:1 대화
    if (groups.dms.length) {
      out.push({ type: 'header', key: 'h_dms', title: L('chat.sectionDms') });
      pushRooms(groups.dms);
    }
    // 4) 지난 기수 (접힘)
    if (groups.otherGenerations.length) {
      const pastRooms = groups.otherGenerations.flatMap((g) => g.camps.flatMap((c) => c.rooms));
      out.push({
        type: 'header',
        key: 'h_past',
        title: L('chat.sectionOtherGenerations'),
        collapsible: true,
        open: otherOpen,
        unread: totalUnread(state, pastRooms),
      });
      if (otherOpen) {
        groups.otherGenerations.forEach((g) => {
          out.push({ type: 'generation', key: `g_${g.generation}`, title: g.generation });
          g.camps.forEach((camp) => {
            out.push({ type: 'sub', key: `s_${camp.jobCodeId}`, title: camp.campCode || camp.jobCodeId });
            pushRooms(camp.rooms);
          });
        });
      }
    }
    // 5) 숨긴 채팅방
    if (groups.hiddenCount > 0) out.push({ type: 'hidden', key: 'hidden', count: groups.hiddenCount });
    return out;
    // lang: 화면 언어가 바뀌면 머리글도 다시
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, showCampChips, selectedFilter, otherOpen, state, lang]);

  // [All][J29][E29]… — 캠프마다 안 읽은 수
  const chips = useMemo(() => {
    if (!showCampChips) return [];
    return [
      { id: FILTER_ALL, label: L('chat.filterAll'), unread: totalUnread(state, groups.camps.flatMap((c) => c.rooms)) },
      ...groups.camps.map((c) => ({ id: c.jobCodeId, label: c.campCode || c.jobCodeId, unread: totalUnread(state, c.rooms) })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCampChips, groups, state, lang]);

  const chipRow = showCampChips ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      style={styles.chipBar}
    >
      {chips.map((chip) => {
        const on = chip.id === selectedFilter;
        return (
          <TouchableOpacity
            key={chip.id}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => setCampFilter(chip.id)}
            activeOpacity={0.7}
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{chip.label}</Text>
            {chip.unread > 0 ? (
              <View style={[styles.chipBadge, on && styles.chipBadgeOn]}>
                <Text style={[styles.chipBadgeText, on && styles.chipBadgeTextOn]}>{unreadBadgeText(chip.unread)}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  ) : null;

  const openRoom = useCallback((roomId: string) => navigation.navigate('ChatRoom', { roomId }), [navigation]);

  const startDm = useCallback(
    async (userId: string) => {
      if (busyUid) return;
      setBusyUid(userId);
      try {
        const r = await mobileAuthenticatedPost<{ roomId: string }>('/api/chat/dm', { userId });
        setKeepEmptyDmId(r.roomId);
        setDmSheetOpen(false);
        // 시트가 닫힌 뒤에 연다 (iOS 는 모달이 닫히는 중에 화면을 바꾸면 어긋날 수 있다)
        setTimeout(() => navigation.navigate('ChatRoom', { roomId: r.roomId }), 300);
      } catch (e) {
        Alert.alert(L('common.error'), e instanceof Error && e.message ? e.message : L('chat.sendFailed'));
      } finally {
        setBusyUid(null);
      }
    },
    [busyUid, navigation],
  );

  // 새 1:1 대화 후보 — 지금 기수 캠프 먼저 (같은 사람이면 지금 캠프의 역할 표시가 쓰인다)
  const dmSourceRooms = useMemo(() => [...groups.camps.flatMap((c) => c.rooms), ...rooms], [groups, rooms]);

  // 숨긴 방 목록 · 길게 누른 방 메뉴
  const hiddenRooms = useMemo(() => rooms.filter((r) => isRoomHidden(state, r)), [rooms, state]);
  const openRowMenu = useCallback((room: ChatRoom) => {
    setMenuRoom(room);
    setMenuOpen(true);
  }, []);
  const menuIsPreset = !!menuRoom && presetIds.has(menuRoom.id);
  const menuPinned = !!menuRoom && !!state.pinned?.[menuRoom.id];
  const togglePin = useCallback(() => {
    setMenuOpen(false);
    if (!menuRoom || !uid) return;
    setChatRoomPinned(db, uid, menuRoom.id, !menuPinned).catch((e) => Alert.alert(L('common.error'), e instanceof Error ? e.message : ''));
  }, [menuRoom, uid, menuPinned]);
  const hideRoom = useCallback(() => {
    setMenuOpen(false);
    if (!menuRoom || !uid) return;
    setChatRoomHidden(db, uid, menuRoom.id, true).catch((e) => Alert.alert(L('common.error'), e instanceof Error ? e.message : ''));
  }, [menuRoom, uid]);
  const unhide = useCallback(
    (roomId: string) => {
      setChatRoomHidden(db, uid, roomId, false).catch((e) => Alert.alert(L('common.error'), e instanceof Error ? e.message : ''));
    },
    [uid],
  );

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === 'header') {
        const content = (
          <>
            <Text style={styles.headerText}>{item.title}</Text>
            {item.collapsible ? (
              <View style={styles.headerRight}>
                {!item.open && item.unread ? (
                  <View style={styles.headerBadge}>
                    <Text style={styles.headerBadgeText}>{unreadBadgeText(item.unread)}</Text>
                  </View>
                ) : null}
                <Ionicons name={item.open ? 'chevron-up' : 'chevron-down'} size={16} color={CHAT_COLORS.sub} />
              </View>
            ) : null}
          </>
        );
        return item.collapsible ? (
          <TouchableOpacity style={styles.header} onPress={() => setOtherOpen((v) => !v)} activeOpacity={0.6}>
            {content}
          </TouchableOpacity>
        ) : (
          <View style={styles.header}>{content}</View>
        );
      }
      if (item.type === 'generation') {
        return <Text style={styles.generation}>{item.title}</Text>;
      }
      if (item.type === 'sub') {
        return <Text style={styles.sub}>{item.title}</Text>;
      }
      if (item.type === 'hidden') {
        return (
          <TouchableOpacity style={styles.hiddenRow} onPress={() => setHiddenOpen(true)} activeOpacity={0.6}>
            <Ionicons name="eye-off-outline" size={16} color={CHAT_COLORS.sub} />
            <Text style={styles.hiddenText}>{L('chat.hiddenN', { n: item.count })}</Text>
            <Ionicons name="chevron-forward" size={15} color={CHAT_COLORS.muted} />
          </TouchableOpacity>
        );
      }
      const room = item.room;
      return (
        <ChatRoomRow
          room={room}
          myUid={uid}
          lang={lang}
          unread={unreadOf(state, room.id)}
          muted={isRoomMuted(state, room.id)}
          lastFromBlocked={!!room.lastMessage?.senderId && isUserBlocked(state, room.lastMessage.senderId)}
          pinned={presetIds.has(room.id) || !!state.pinned?.[room.id]}
          onPress={openRoom}
          onLongPress={openRowMenu}
        />
      );
    },
    [uid, lang, state, openRoom, presetIds, openRowMenu],
  );

  if (!roomsReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CHAT_COLORS.primary} />
        <Text style={styles.loadingText}>{L('chat.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {chipRow}
      <FlatList
        data={items}
        keyExtractor={(it) => it.key}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={items.length ? styles.listContent : styles.emptyContent}
        ListEmptyComponent={
          error ? (
            // 목록 구독 실패 (규칙 미배포 · 권한 등) — 원래 오류 문구 대신 안내
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyHint}>{L('chat.loadFailed')}</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>{L('chat.noRooms')}</Text>
              <Text style={styles.emptyHint}>{L('chat.noRoomsHint')}</Text>
            </View>
          )
        }
      />
      {/* 길게 누른 방 — 고정 · 숨기기 (지금 기수 캠프 방은 안내만) */}
      <ChatSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={menuRoom ? chatRoomTitle(menuRoom, lang, uid) : ''}>
        {menuIsPreset ? (
          <Text style={styles.presetNote}>{L('chat.presetPinned')}</Text>
        ) : (
          <>
            <ChatSheetOption icon={menuPinned ? 'pin' : 'pin-outline'} label={menuPinned ? L('chat.unpin') : L('chat.pin')} onPress={togglePin} />
            <ChatSheetOption icon="eye-off-outline" label={L('chat.hideRoom')} onPress={hideRoom} />
            <Text style={styles.presetNote}>{L('chat.hideHint')}</Text>
          </>
        )}
        <ChatSheetOption label={L('common.cancel')} onPress={() => setMenuOpen(false)} />
      </ChatSheet>

      {/* 숨긴 채팅방 — 다시 보이기 */}
      <ChatSheet visible={hiddenOpen} onClose={() => setHiddenOpen(false)} title={L('chat.showHidden')} heightRatio={0.6}>
        <FlatList
          data={hiddenRooms}
          keyExtractor={(r) => r.id}
          renderItem={({ item: room }) => (
            <View style={styles.hiddenItem}>
              <Text style={styles.hiddenTitle} numberOfLines={1}>{chatRoomTitle(room, lang, uid)}</Text>
              <TouchableOpacity style={styles.unhideBtn} onPress={() => unhide(room.id)}>
                <Text style={styles.unhideText}>{L('chat.unhideRoom')}</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.presetNote}>—</Text>}
        />
      </ChatSheet>

      <NewDmSheet
        visible={dmSheetOpen}
        rooms={dmSourceRooms}
        myUid={uid}
        busyUid={busyUid}
        onClose={() => setDmSheetOpen(false)}
        onPick={startDm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  loadingText: { marginTop: 8, color: CHAT_COLORS.sub, fontSize: 13 },
  headerBtn: { paddingHorizontal: 16 },
  listContent: { paddingBottom: 24 },
  emptyContent: { flexGrow: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    backgroundColor: '#ffffff',
  },
  headerText: { flex: 1, fontSize: 13, fontWeight: '700', color: CHAT_COLORS.sub },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: CHAT_COLORS.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: { color: '#ffffff', fontSize: 10.5, fontWeight: '700' },
  presetNote: { fontSize: 13, color: CHAT_COLORS.sub, paddingHorizontal: 20, paddingVertical: 10 },
  hiddenRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 16 },
  hiddenText: { flex: 1, fontSize: 13.5, color: CHAT_COLORS.sub },
  hiddenItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CHAT_COLORS.border,
  },
  hiddenTitle: { flex: 1, fontSize: 15, color: CHAT_COLORS.text },
  unhideBtn: { borderWidth: 1, borderColor: CHAT_COLORS.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  unhideText: { fontSize: 13, color: CHAT_COLORS.primary, fontWeight: '600' },
  generation: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2, fontSize: 13, fontWeight: '700', color: CHAT_COLORS.text },
  sub: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2, fontSize: 12, fontWeight: '600', color: CHAT_COLORS.muted },
  chipBar: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CHAT_COLORS.border,
    backgroundColor: '#ffffff',
  },
  chips: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CHAT_COLORS.border,
    backgroundColor: '#ffffff',
  },
  chipOn: { backgroundColor: CHAT_COLORS.primary, borderColor: CHAT_COLORS.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: CHAT_COLORS.text },
  chipTextOn: { color: '#ffffff' },
  chipBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: CHAT_COLORS.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipBadgeOn: { backgroundColor: '#ffffff' },
  chipBadgeText: { color: '#ffffff', fontSize: 10.5, fontWeight: '700' },
  chipBadgeTextOn: { color: CHAT_COLORS.badge },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { marginTop: 12, fontSize: 16, fontWeight: '600', color: CHAT_COLORS.text },
  emptyHint: { marginTop: 6, fontSize: 13.5, color: CHAT_COLORS.sub, textAlign: 'center' },
});
