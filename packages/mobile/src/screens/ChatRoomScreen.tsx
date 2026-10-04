/**
 * 채팅 대화방 — 말풍선 목록(위로 올리면 이전 메시지) · 읽음 표시 · 사진·동영상 묶음 · 음성 · 투표 · 메시지 메뉴
 *
 * 글은 sendChatMessage 를 부르면 Firestore 가 바로 '보내는 중' 메시지로 목록에 넣어 준다.
 * 사진·동영상·음성은 파일을 올리는 동안 보낼 편지함(useChatOutbox)의 말풍선으로 보여 준다.
 * 대화 내용 검색 · 내보내기 · 불러온 범위 밖으로 이동은 방 전체 메시지를 한 번 불러와(useChatHistory) 쓴다.
 * 2차: 답장 · 공감 · @멘션 · 수정 · 공지(+확인) · 조용히 보내기 · 읽지 않은 곳부터 · 투표 · 예약 · 음성 · 모아보기 · 내보내기
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import {
  CHAT_REACTION_EMOJI,
  L,
  canBeNotice,
  canEditChatMessage,
  canSetNotice,
  chatExportFileName,
  chatExportText,
  chatMessageLayout,
  chatRoomDescription,
  chatRoomGeneration,
  chatRoomGroups,
  chatRoomTitle,
  closeChatPoll,
  deleteChatMessage,
  firstUnreadIndex,
  getCurrentLocale,
  isMentioned,
  isPresetRoom,
  isRoomMuted,
  isUserBlocked,
  logger,
  markChatRoomRead,
  newChatClientId,
  pollResults,
  reactionSummary,
  reportChatMessage,
  resolveActiveJobCodeId,
  scheduleChatMessage,
  scheduleTimeError,
  sendChatMessage,
  setChatReaction,
  setChatRoomHidden,
  setChatRoomMuted,
  setChatRoomPinned,
  setChatUserBlocked,
  subscribeChatRoom,
  unreadOf,
  unreadReaders,
  voteChatPoll,
  cancelScheduledChatMessage,
  extractMentions,
  type ChatMessage,
  type ChatCallMedia,
  type ChatMessageView,
  type ChatPoll,
  type ChatReactionKey,
  type ChatReportReason,
  type ChatRoom,
  type ChatScheduledMessage,
} from '@smis-mentor/shared';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useChatStore } from '../hooks/useChatUnread';
import { messageMillis, useChatMessages } from '../hooks/useChatMessages';
import { chatOutbox, useChatOutbox } from '../hooks/useChatOutbox';
import { useChatHistory } from '../hooks/useChatHistory';
import { useChatJump } from '../hooks/useChatJump';
import { useChatSearch } from '../hooks/useChatSearch';
import { useChatComposer } from '../hooks/useChatComposer';
import { useChatScheduled } from '../hooks/useChatScheduled';
import { useAppActive, useKeyboardVisible } from '../hooks/useDeviceState';
import { clearOpenChatRoom, setOpenChatRoom } from '../services/chatPresence';
import { mobileAuthenticatedPost } from '../services/apiClient';
import { MessageRow, type ChatRow, type MessageRowActions } from '../components/chat/MessageRow';
import { ChatComposer } from '../components/chat/ChatComposer';
import { EditBar, MentionPicker, ReplyBar, ScheduledBar, SilentBar } from '../components/chat/ComposerBars';
import { ChatSheet, ChatSheetOption } from '../components/chat/ChatSheet';
import { CallBanner, CallStartOptions } from '../components/chat/call/CallViews';
import { alertCallError, isCallActive, setCallRoomMembers, useChatCall } from '../services/chatCalls';
import { MembersSheet } from '../components/chat/MembersSheet';
import { ReportSheet } from '../components/chat/ReportSheet';
import { MediaViewer } from '../components/chat/MediaViewer';
import { useChatToast } from '../components/chat/ChatToast';
import { ChatSearchInput, ChatSearchNav } from '../components/chat/ChatSearchBar';
import { useChatDatePicker } from '../components/chat/ChatDatePicker';
import { ReactionPickerRow } from '../components/chat/ChatReactions';
import { UidListSheet, type UidListTab } from '../components/chat/UidListSheet';
import { NoticeBanner } from '../components/chat/NoticeBanner';
import { PollCreateSheet } from '../components/chat/PollCreateSheet';
import { ScheduleCreateSheet, ScheduledListSheet, scheduleLabel } from '../components/chat/ScheduleSheets';
import { VoiceRecorderBar } from '../components/chat/VoiceRecorderBar';
import { stopChatVoice } from '../components/chat/VoiceBubble';
import { ExportSheet } from '../components/chat/ExportSheet';
import { ChatGalleryModal } from '../components/chat/ChatGalleryModal';
import { saveChatMediaWithFeedback } from '../components/chat/saveWithFeedback';
import { CHAT_COLORS } from '../components/chat/chatTheme';
import type { RootStackScreenProps } from '../navigation/types';

/** 맨 아래(최신)에서 이만큼 안이면 '맨 아래 근처' */
const NEAR_BOTTOM_PX = 120;
/** 시트를 닫은 뒤 다른 시트·알림창·고르기 화면을 띄우기까지 (iOS 는 모달이 겹치면 안 뜬다) */
const AFTER_SHEET_MS = 350;
/** '여기까지 읽었습니다'를 찾으려고 들어올 때 더 불러오는 최대 쪽 수 */
const UNREAD_PAGES_MAX = 6;
const DIVIDER_KEY = 'unread_divider';

const later = (fn: () => void) => setTimeout(fn, AFTER_SHEET_MS);
const errorMessage = (e: unknown) => (e instanceof Error && e.message ? e.message : L('chat.sendFailed'));
const isPermissionDenied = (e: unknown) => (e as { code?: string } | null)?.code === 'permission-denied';
const confirm = (title: string, message: string | undefined, okText: string, onOk: () => void, destructive = false) =>
  Alert.alert(title, message, [
    { text: L('common.cancel'), style: 'cancel' },
    { text: okText, style: destructive ? 'destructive' : 'default', onPress: onOk },
  ]);

type SheetState =
  | { kind: 'reactions'; message: ChatMessageView }
  | { kind: 'voters'; title: string; uids: string[] }
  | null;

export function ChatRoomScreen({ navigation, route }: RootStackScreenProps<'ChatRoom'>) {
  const { roomId } = route.params;
  const { userData } = useAuth();
  const uid = userData?.userId ?? '';
  const myName = userData?.name ?? '';
  const lang = getCurrentLocale();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isFocused = useIsFocused();
  const appActive = useAppActive();
  const keyboardVisible = useKeyboardVisible();
  const store = useChatStore();
  const { state } = store;
  const [toastNode, showToast] = useChatToast(16);

  // ── 방 ────────────────────────────────────────────────────────────
  const [room, setRoom] = useState<ChatRoom | null | undefined>(undefined);
  useEffect(() => {
    setRoom(undefined);
    return subscribeChatRoom(db, roomId, setRoom, (e) => {
      logger.warn('채팅방 구독 실패:', e);
      setRoom(null);
    });
  }, [roomId]);
  const isMember = !!room && !!uid && (room.memberIds ?? []).includes(uid);

  const {
    messages,
    loaded,
    loadingOlder,
    hasMore,
    loadOlder,
    provideHistory,
    revealMessage,
    reads,
    readsLoaded,
    error,
  } = useChatMessages(roomId, isMember);
  const outbox = useChatOutbox(roomId);
  const visibleOutbox = useMemo(() => outbox.filter((it) => it.status !== 'sent'), [outbox]);
  const history = useChatHistory(roomId, isMember, provideHistory);
  const scheduled = useChatScheduled(uid, roomId, isMember);

  // 지금 기수 — 지난 기수 방 · 1:1 은 고정·숨기기를 할 수 있다 (지금 기수 캠프 방은 늘 고정)
  const activeJobCodeId = resolveActiveJobCodeId(userData) ?? null;
  const currentGeneration = useMemo(
    () => chatRoomGroups(store.rooms, { activeJobCodeId }).generation,
    [store.rooms, activeJobCodeId],
  );
  const canPinOrHide = !!room && (room.type === 'dm' || (!!currentGeneration && chatRoomGeneration(room) !== currentGeneration));

  // 지금 이 방을 보고 있다 — 이 방 알림은 배너·소리 없이
  useFocusEffect(
    useCallback(() => {
      setOpenChatRoom(roomId);
      return () => {
        clearOpenChatRoom(roomId);
        stopChatVoice();
      };
    }, [roomId]),
  );

  // ── 목록 · 스크롤 ─────────────────────────────────────────────────
  const listRef = useRef<FlatList<ChatRow>>(null);
  const nearBottomRef = useRef(true);
  const [nearBottom, setNearBottom] = useState(true);
  const [showNewButton, setShowNewButton] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());

  const scrollToLatest = useCallback((animated = true) => {
    listRef.current?.scrollToOffset({ offset: 0, animated });
    setShowNewButton(false);
  }, []);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const near = e.nativeEvent.contentOffset.y < NEAR_BOTTOM_PX;
    if (near !== nearBottomRef.current) {
      nearBottomRef.current = near;
      setNearBottom(near);
      if (near) setShowNewButton(false);
    }
  }, []);

  // ── 읽지 않은 곳부터 ('여기까지 읽었습니다') ───────────────────────
  // 들어올 때의 내 마지막 읽은 시각 — 읽음 표시를 하기 전에 잡는다
  const [entryReadMs, setEntryReadMs] = useState<number | null>(null);
  const [divider, setDivider] = useState<{ id: string | null } | null>(null);
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const unreadPagesRef = useRef(0);
  useEffect(() => {
    setEntryReadMs(null);
    setDivider(null);
    setMentionDismissed(false);
    unreadPagesRef.current = 0;
  }, [roomId]);
  useEffect(() => {
    if (readsLoaded && isMember && uid && entryReadMs === null) setEntryReadMs(reads[uid] ?? 0);
  }, [readsLoaded, isMember, uid, entryReadMs, reads]);

  const rows = useMemo<ChatRow[]>(() => {
    const pseudo: Array<Pick<ChatMessage, 'senderId' | 'createdAt' | 'kind'>> = visibleOutbox.map((it) => ({
      senderId: uid,
      createdAt: null,
      kind: it.kind === 'media' ? 'media' : it.kind === 'voice' ? 'voice' : 'text',
    }));
    const all: Array<Pick<ChatMessage, 'senderId' | 'createdAt' | 'kind'>> = [...messages, ...pseudo];
    const layout = chatMessageLayout(all, uid);
    const startsRun = (i: number) => {
      const prev = all[i - 1];
      return !prev || prev.senderId !== all[i].senderId || layout[i].showDay || prev.kind === 'system' || all[i].kind === 'system';
    };
    const out: ChatRow[] = [];
    messages.forEach((m, i) => {
      if (divider?.id === m.id) out.push({ type: 'divider', key: DIVIDER_KEY });
      out.push({ type: 'message', key: m.id, message: m, layout: layout[i], firstInRun: startsRun(i) });
    });
    visibleOutbox.forEach((item, j) => {
      const i = messages.length + j;
      out.push({ type: 'outbox', key: `o_${item.clientId}`, item, layout: layout[i], firstInRun: startsRun(i) });
    });
    // 뒤집힌 목록 — 최신이 맨 앞(화면 맨 아래)
    return out.reverse();
  }, [messages, visibleOutbox, uid, divider]);

  const { jumpTo, scrollToKey, flashId, onScrollToIndexFailed, cancelPending } = useChatJump({
    rows,
    listRef,
    revealMessage,
    ensureHistory: history.ensure,
  });

  // 들어올 때: 읽은 곳이 불러온 범위보다 예전이면 더 불러오고, '여기까지 읽었습니다' 줄을 정한 뒤 그 자리로
  useEffect(() => {
    if (divider || entryReadMs === null || !loaded) return;
    const oldest = messages[0] ? messageMillis(messages[0]) : 0;
    const needMore = entryReadMs > 0 && hasMore && oldest > entryReadMs && unreadPagesRef.current < UNREAD_PAGES_MAX;
    if (needMore) {
      if (!loadingOlder) {
        unreadPagesRef.current += 1;
        loadOlder();
      }
      return;
    }
    if (loadingOlder) return;
    const idx = entryReadMs > 0 ? firstUnreadIndex(messages, entryReadMs, uid) : -1;
    const id = idx >= 0 ? messages[idx].id : null;
    setDivider({ id });
    // 안 읽은 게 한 화면보다 많으면 그 줄이 위쪽에 오게
    if (id && messages.length - idx > 6) scrollToKey(DIVIDER_KEY, 0.85);
  }, [divider, entryReadMs, loaded, messages, hasMore, loadingOlder, loadOlder, uid, scrollToKey]);

  // 나를 언급한 안 읽은 메시지 — 떠 있는 칩 '@ 나를 언급'
  const mentionTargetId = useMemo(() => {
    if (!entryReadMs || !divider || mentionDismissed) return null;
    const m = messages.find((x) => messageMillis(x) > entryReadMs && !x.deleted && isMentioned(x, uid));
    return m?.id ?? null;
  }, [entryReadMs, divider, mentionDismissed, messages, uid]);

  // 새 메시지: 내가 보냈거나 맨 아래 근처면 내려가고, 위를 보고 있으면 [새 메시지 ↓]
  const lastId = messages.length ? messages[messages.length - 1].id : '';
  const lastSender = messages.length ? messages[messages.length - 1].senderId : '';
  const prevLastIdRef = useRef('');
  useEffect(() => {
    prevLastIdRef.current = '';
    nearBottomRef.current = true;
    setNearBottom(true);
    setShowNewButton(false);
  }, [roomId]);
  useEffect(() => {
    if (!lastId) return;
    const prev = prevLastIdRef.current;
    prevLastIdRef.current = lastId;
    if (!prev || prev === lastId) return;
    if (lastSender === uid || nearBottomRef.current) scrollToLatest(true);
    else setShowNewButton(true);
  }, [lastId, lastSender, uid, scrollToLatest]);

  // ── 읽음 표시 ─────────────────────────────────────────────────────
  // 이 방이 보이고(포커스 · 앱 활성) 맨 아래 근처일 때, 안 읽은 메시지가 있으면 (800ms 묶어서). 들어올 때 1번.
  const latestOtherAt = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.senderId !== uid && !m.pending) return messageMillis(m);
    }
    return 0;
  }, [messages, uid]);
  const roomUnread = unreadOf(state, roomId);
  const needsRead = latestOtherAt > (reads[uid] ?? 0) || roomUnread > 0;
  const enteredRef = useRef(false);
  useEffect(() => {
    enteredRef.current = false;
  }, [roomId]);
  useEffect(() => {
    // 들어올 때의 읽은 시각(entryReadMs)을 잡은 뒤에만
    if (!isMember || !loaded || !isFocused || !appActive || !uid || entryReadMs === null) return;
    const first = !enteredRef.current;
    if (!first && (!needsRead || !nearBottom)) return;
    const t = setTimeout(() => {
      enteredRef.current = true;
      markChatRoomRead(db, roomId, uid).catch((e) => logger.warn('채팅 읽음 표시 실패:', e));
    }, first ? 250 : 800);
    return () => clearTimeout(t);
  }, [isMember, loaded, isFocused, appActive, uid, roomId, needsRead, nearBottom, latestOtherAt, roomUnread, entryReadMs]);

  // ── 입력창 ────────────────────────────────────────────────────────
  const composer = useChatComposer({ roomId, room, uid, myName, scrollToLatest, showToast });
  const [attachOpen, setAttachOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledListOpen, setScheduledListOpen] = useState(false);

  // ── 대화 내용 검색 ────────────────────────────────────────────────
  const onHistoryFailed = useCallback(() => showToast(L('chat.loadFailed')), [showToast]);
  const search = useChatSearch({ messages, history, blocked: state.blocked, jumpTo, onLoadFailed: onHistoryFailed });
  // 검색 중 📅 — 그날 첫 메시지로 (없으면 가까운 날)
  const goToDate = search.goToDate;
  const [datePickerNode, openDatePicker] = useChatDatePicker(
    useCallback((day: Date) => {
      void goToDate(day).then((r) => {
        if (r === 'nearest') showToast(L('chat.jumpDateNearest'));
        else if (r === 'none') showToast(L('chat.jumpDateEmpty'));
      });
    }, [goToDate, showToast]),
  );
  const searchClose = search.closeSearch;
  const closeSearch = useCallback(() => {
    searchClose();
    cancelPending();
  }, [searchClose, cancelPending]);

  // Android 뒤로 가기 — 검색 · 녹음 중이면 그것만 닫는다
  const recording = composer.recording;
  const cancelRecording = composer.cancelRecording;
  useFocusEffect(
    useCallback(() => {
      if (!search.open && !recording) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (recording) cancelRecording();
        else closeSearch();
        return true;
      });
      return () => sub.remove();
    }, [search.open, recording, cancelRecording, closeSearch]),
  );

  // ── 공지 ──────────────────────────────────────────────────────────
  const notice = room?.notice ?? null;
  const canNotice = !!room && canSetNotice(room, uid);

  const postNotice = useCallback(
    (messageId: string | null) => {
      mobileAuthenticatedPost('/api/chat/notice', { roomId, messageId }).catch((e) =>
        Alert.alert(L('common.error'), errorMessage(e)),
      );
    },
    [roomId],
  );

  // ── 머리글 · 방 메뉴 ──────────────────────────────────────────────
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);

  // ── 통화 ──────────────────────────────────────────────────────────
  const callCtx = useChatCall();
  const callAdapter = callCtx.adapter;
  const callState = callCtx.state;
  const [callSheetOpen, setCallSheetOpen] = useState(false);
  useEffect(() => {
    if (room) setCallRoomMembers(roomId, room.memberInfo);
  }, [roomId, room]);
  const callDirect = room?.type === 'dm';
  const callPeer = useMemo(() => {
    if (!room || room.type !== 'dm') return undefined;
    const peerUid = (room.memberIds ?? []).find((u) => u !== uid);
    const info = peerUid ? room.memberInfo?.[peerUid] : undefined;
    return peerUid ? { uid: peerUid, name: info?.name ?? L('chat.unknownUser'), photo: info?.photo } : undefined;
  }, [room, uid]);
  const startCall = useCallback((media: ChatCallMedia) => {
    setCallSheetOpen(false);
    if (!callAdapter) return;
    if (isCallActive(callAdapter.getState())) {
      Alert.alert(L('chat.callAlreadyInCall'));
      return;
    }
    callAdapter.start({ roomId, media, direct: callDirect, peer: callPeer }).catch(alertCallError);
  }, [callAdapter, roomId, callDirect, callPeer]);
  const activeCall = room?.activeCall?.callId ? room.activeCall : null;
  const inThisCall = !!activeCall && callState.callId === activeCall.callId && isCallActive(callState);
  const joinCall = useCallback((media: ChatCallMedia) => {
    if (!callAdapter || !activeCall) return;
    if (isCallActive(callAdapter.getState())) {
      Alert.alert(L('chat.callAlreadyInCall'));
      return;
    }
    callAdapter.join({ roomId, callId: activeCall.callId, media }).catch(alertCallError);
  }, [callAdapter, activeCall, roomId]);
  const [membersOpen, setMembersOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const muted = isRoomMuted(state, roomId);
  const pinned = !!state.pinned?.[roomId];

  const toggleMute = useCallback(() => {
    if (!uid) return;
    setChatRoomMuted(db, uid, roomId, !muted)
      .then(() => showToast(muted ? L('chat.appUnmutedDone') : L('chat.appMutedDone')))
      .catch((e) => Alert.alert(L('common.error'), errorMessage(e)));
  }, [uid, roomId, muted, showToast]);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('MainTabs', { screen: 'Chat' });
  }, [navigation]);

  const togglePin = useCallback(() => {
    setChatRoomPinned(db, uid, roomId, !pinned).catch((e) => Alert.alert(L('common.error'), errorMessage(e)));
  }, [uid, roomId, pinned]);

  const hideRoom = useCallback(() => {
    setChatRoomHidden(db, uid, roomId, true)
      .then(() => {
        showToast(L('chat.hideHint'));
        goBack();
      })
      .catch((e) => Alert.alert(L('common.error'), errorMessage(e)));
  }, [uid, roomId, showToast, goBack]);

  const exportChat = useCallback(
    async (includeLinks: boolean) => {
      if (!room) return;
      const all = await history.ensure();
      if (!all) {
        Alert.alert(L('chat.loadFailed'));
        return;
      }
      try {
        const map = new Map<string, ChatMessageView>();
        all.forEach((m) => map.set(m.id, m));
        messages.forEach((m) => map.set(m.id, m));
        const list = [...map.values()].filter((m) => !m.pending).sort((a, b) => messageMillis(a) - messageMillis(b));
        const body = chatExportText(room, list, { lang, myUid: uid, includeMediaLinks: includeLinks });
        const file = new File(Paths.cache, chatExportFileName(room, lang, uid));
        if (file.exists) file.delete();
        file.create();
        file.write(body);
        setExportOpen(false);
        later(() => {
          void (async () => {
            try {
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', UTI: 'public.plain-text', dialogTitle: L('chat.export') });
              }
              showToast(L('chat.exportDone'));
            } catch (e) {
              logger.warn('대화 내보내기 공유 실패:', e);
            }
          })();
        });
      } catch (e) {
        logger.warn('대화 내보내기 실패:', e);
        Alert.alert(L('common.error'), errorMessage(e));
      }
    },
    [room, history, messages, lang, uid, showToast],
  );

  const [dmBusyUid, setDmBusyUid] = useState<string | null>(null);
  const openDmWith = useCallback(
    async (otherUid: string) => {
      if (!room || otherUid === uid || dmBusyUid) return;
      if (room.type === 'dm' && room.memberIds.includes(otherUid)) {
        setMembersOpen(false);
        return;
      }
      setDmBusyUid(otherUid);
      try {
        const r = await mobileAuthenticatedPost<{ roomId: string }>('/api/chat/dm', { userId: otherUid });
        setMembersOpen(false);
        later(() => navigation.navigate('ChatRoom', { roomId: r.roomId }));
      } catch (e) {
        Alert.alert(L('common.error'), errorMessage(e));
      } finally {
        setDmBusyUid(null);
      }
    },
    [room, uid, dmBusyUid, navigation],
  );

  // ── 메시지 메뉴 ───────────────────────────────────────────────────
  // 메뉴를 연 메시지 — 닫는 동안(사라지는 애니메이션)에도 내용이 그대로 보이도록 열림 여부는 따로 둔다
  const [actionFor, setActionFor] = useState<ChatMessageView | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [reportFor, setReportFor] = useState<ChatMessageView | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [viewer, setViewer] = useState<{ message: ChatMessageView; index: number } | null>(null);
  // 보기 화면을 열 때마다 새로 그린다 (시작 칸 · 재생 상태 초기화)
  const [viewerSeq, setViewerSeq] = useState(0);

  const senderNameOf = useCallback(
    (m: Pick<ChatMessage, 'senderId' | 'senderName'>) => room?.memberInfo?.[m.senderId]?.name || m.senderName || L('chat.unknownUser'),
    [room],
  );

  const menu = useMemo(() => {
    const m = actionFor;
    if (!m || !room) return null;
    const mine = m.senderId === uid;
    const blocked = !mine && isUserBlocked(state, m.senderId);
    const hidden = blocked && !revealed.has(m.id);
    const live = !m.deleted && !hidden && !m.pending;
    const mediaItems = (m.media ?? []).filter((x) => x.kind === 'image' || x.kind === 'video');
    return {
      m,
      mine,
      blocked,
      canReact: live && m.kind !== 'system',
      myReaction: (m.reactions?.[uid] ?? null) as ChatReactionKey | null,
      canReply: live,
      canCopy: live && !!m.text && m.kind === 'text',
      canEdit: live && canEditChatMessage(m, uid),
      canNotice: live && canSetNotice(room, uid) && canBeNotice(m),
      mediaCount: live && m.kind === 'media' ? mediaItems.length : 0,
      canDelete: mine && !m.deleted && !m.pending,
      canReport: !mine && !m.deleted,
    };
  }, [actionFor, room, uid, state, revealed]);

  const openActions = useCallback(
    (m: ChatMessageView) => {
      // 지워진 내 메시지 · 알림 메시지는 할 수 있는 게 없다
      if ((m.senderId === uid && m.deleted) || m.kind === 'system') return;
      Keyboard.dismiss();
      setActionFor(m);
      setActionOpen(true);
    },
    [uid],
  );
  const closeActions = useCallback(() => setActionOpen(false), []);
  const openActionsRef = useRef(openActions);
  openActionsRef.current = openActions;

  const react = useCallback(
    (key: ChatReactionKey | null) => {
      const m = menu?.m;
      closeActions();
      if (!m) return;
      setChatReaction(db, roomId, m.id, uid, key).catch((e) => Alert.alert(L('common.error'), errorMessage(e)));
    },
    [menu, closeActions, roomId, uid],
  );

  const doReply = useCallback(() => {
    const m = menu?.m;
    closeActions();
    if (m) later(() => composer.startReply(m));
  }, [menu, closeActions, composer]);

  const doCopy = useCallback(() => {
    const m = menu?.m;
    closeActions();
    if (!m?.text) return;
    Clipboard.setStringAsync(m.text)
      .then(() => showToast(L('chat.copied')))
      .catch(() => {});
  }, [menu, closeActions, showToast]);

  const doEdit = useCallback(() => {
    const m = menu?.m;
    closeActions();
    if (m) later(() => composer.startEdit(m));
  }, [menu, closeActions, composer]);

  const doNotice = useCallback(() => {
    const m = menu?.m;
    closeActions();
    if (!m) return;
    if (notice && notice.messageId !== m.id) {
      later(() => confirm(L('chat.setNotice'), L('chat.noticeReplaceConfirm'), L('common.ok'), () => postNotice(m.id)));
    } else {
      postNotice(m.id);
    }
  }, [menu, closeActions, notice, postNotice]);

  const doSave = useCallback(() => {
    const m = menu?.m;
    closeActions();
    const media = (m?.media ?? []).filter((x) => x.kind === 'image' || x.kind === 'video');
    if (!m || !media.length) return;
    showToast(L('chat.appSaving', { done: 0, total: media.length }));
    later(() => {
      void saveChatMediaWithFeedback(media.map((item, index) => ({ item, index })), {
        campCode: room?.campCode,
        at: new Date(messageMillis(m) || Date.now()),
      });
    });
  }, [menu, closeActions, showToast, room?.campCode]);

  const doDelete = useCallback(() => {
    const m = menu?.m;
    closeActions();
    if (!m) return;
    later(() =>
      confirm(L('chat.deleteForAll'), L('chat.deleteConfirm'), L('common.delete'), () => {
        deleteChatMessage(db, roomId, m.id).catch((e) => Alert.alert(L('common.error'), errorMessage(e)));
      }, true),
    );
  }, [menu, closeActions, roomId]);

  const doReport = useCallback(() => {
    const m = menu?.m;
    closeActions();
    if (m) later(() => setReportFor(m));
  }, [menu, closeActions]);

  const submitReport = useCallback(
    async (reason: ChatReportReason, detail: string) => {
      const m = reportFor;
      if (!m || !uid) return;
      try {
        await reportChatMessage(db, { roomId, message: m, reporterId: uid, reason, detail });
        setReportFor(null);
        showToast(L('chat.reportDone'));
      } catch (e) {
        // 같은 메시지는 한 번만 신고된다 — 이미 신고했으면 규칙이 거절한다
        if (isPermissionDenied(e)) {
          setReportFor(null);
          showToast(L('chat.reportDone'));
          return;
        }
        Alert.alert(L('common.error'), errorMessage(e));
      }
    },
    [reportFor, uid, roomId, showToast],
  );

  const doBlock = useCallback(() => {
    const info = menu;
    closeActions();
    if (!info || info.mine || !uid) return;
    const otherUid = info.m.senderId;
    const name = senderNameOf(info.m);
    const next = !info.blocked;
    later(() =>
      confirm(
        next ? L('chat.block') : L('chat.unblock'),
        next ? L('chat.blockConfirm', { name }) : L('chat.appUnblockConfirm', { name }),
        next ? L('chat.block') : L('chat.unblock'),
        () => {
          setChatUserBlocked(db, uid, otherUid, next)
            .then(() => showToast(next ? L('chat.blockedDone') : L('chat.unblockedDone')))
            .catch((e) => Alert.alert(L('common.error'), errorMessage(e)));
        },
        next,
      ),
    );
  }, [menu, closeActions, uid, senderNameOf, showToast]);

  // ── 말풍선 동작 (한 번 만든 것을 계속 넘긴다) ─────────────────────
  const latest = useRef({ room, uid, roomId, composer, jumpTo, showToast });
  latest.current = { room, uid, roomId, composer, jumpTo, showToast };
  const rowActions = useMemo<MessageRowActions>(
    () => ({
      onReveal: (id) => setRevealed((s) => new Set(s).add(id)),
      onLongPress: (m) => openActionsRef.current(m),
      onOpenMedia: (m, index) => {
        Keyboard.dismiss();
        setViewerSeq((n) => n + 1);
        setViewer({ message: m, index });
      },
      onRetry: (clientId) => chatOutbox.retry(latest.current.roomId, clientId),
      onDiscard: (clientId) => {
        const it = chatOutbox.discard(latest.current.roomId, clientId);
        // 사진과 함께 입력했던 글은 입력창으로 되돌린다
        if (it?.kind === 'media' && it.text) latest.current.composer.setText((cur) => (cur.trim() ? cur : it.text ?? ''));
      },
      onJumpTo: (id) => {
        void latest.current.jumpTo(id);
      },
      onShowReactions: (m) => setSheet({ kind: 'reactions', message: m }),
      onReply: (m) => latest.current.composer.startReply(m),
      onVote: async (m, ids) => {
        try {
          await voteChatPoll(db, latest.current.roomId, m.id, latest.current.uid, ids);
        } catch (e) {
          Alert.alert(L('common.error'), errorMessage(e));
        }
      },
      onClosePoll: (m) =>
        confirm(L('chat.pollClose'), L('chat.pollCloseConfirm'), L('chat.pollClose'), () => {
          closeChatPoll(db, latest.current.roomId, m.id).catch((e) => Alert.alert(L('common.error'), errorMessage(e)));
        }, true),
      onShowVoters: (m, optionId) => {
        const r = pollResults(m, latest.current.uid);
        const o = r.options.find((x) => x.id === optionId);
        if (o) setSheet({ kind: 'voters', title: o.text, uids: o.uids });
      },
    }),
    [],
  );

  // ── 보내기 (투표 · 예약) ──────────────────────────────────────────
  const createPoll = useCallback(
    async (poll: ChatPoll) => {
      try {
        await sendChatMessage(db, roomId, {
          senderId: uid,
          senderName: myName,
          kind: 'poll',
          poll,
          clientId: newChatClientId(),
          silent: composer.silent || undefined,
        });
        setPollOpen(false);
        scrollToLatest(true);
      } catch (e) {
        Alert.alert(L('common.error'), errorMessage(e));
      }
    },
    [roomId, uid, myName, composer.silent, scrollToLatest],
  );

  const createSchedule = useCallback(
    async (sendAt: Date, body: string) => {
      if (!room) return;
      const err = scheduleTimeError(sendAt);
      if (err) {
        Alert.alert(err === 'past' ? L('chat.schedulePast') : L('chat.scheduleTooFar'));
        return;
      }
      try {
        const mention = extractMentions(body, room, uid);
        await scheduleChatMessage(db, {
          roomId,
          senderId: uid,
          senderName: myName,
          text: body,
          sendAt,
          mentions: mention.mentions,
          mentionAll: mention.mentionAll,
          silent: composer.silent,
        });
        setScheduleOpen(false);
        if (composer.text.trim()) composer.setText('');
        showToast(L('chat.scheduleSet', { at: scheduleLabel(sendAt) }));
      } catch (e) {
        Alert.alert(L('common.error'), errorMessage(e));
      }
    },
    [room, roomId, uid, myName, composer, showToast],
  );

  const cancelScheduled = useCallback((item: ChatScheduledMessage) => {
    confirm(L('chat.scheduleCancel'), L('chat.scheduleCancelConfirm'), L('chat.scheduleCancel'), () => {
      cancelScheduledChatMessage(db, item.id).catch((e) => Alert.alert(L('common.error'), errorMessage(e)));
    }, true);
  }, []);

  // ── 시트 내용 (공감한 사람 · 투표한 사람) ─────────────────────────
  const sheetTabs = useMemo<{ title: string; tabs: UidListTab[] } | null>(() => {
    if (!sheet) return null;
    if (sheet.kind === 'reactions') {
      const list = reactionSummary(sheet.message.reactions);
      const reactions = sheet.message.reactions ?? {};
      const badgeOf = (u: string) => (reactions[u] ? CHAT_REACTION_EMOJI[reactions[u]] : '');
      return {
        title: L('chat.reactionsTitle'),
        tabs: [
          { key: 'all', label: L('chat.filterAll'), uids: list.flatMap((r) => r.uids), badgeOf },
          ...list.map((r) => ({ key: r.key, label: r.emoji, uids: r.uids, badgeOf })),
        ],
      };
    }
    return { title: sheet.title, tabs: [{ key: 'v', label: '', uids: sheet.uids }] };
  }, [sheet]);

  // ── 그리기 ────────────────────────────────────────────────────────
  const bubbleMaxWidth = Math.round(Math.min(width * 0.7, 360));
  const renderItem = useCallback(
    ({ item }: { item: ChatRow }) => {
      if (item.type !== 'message') {
        return (
          <MessageRow
            row={item}
            lang={lang}
            myUid={uid}
            room={room ?? null}
            unread={null}
            blocked={false}
            revealed={false}
            bubbleMaxWidth={bubbleMaxWidth}
            actions={rowActions}
          />
        );
      }
      const m = item.message;
      const mine = m.senderId === uid;
      return (
        <MessageRow
          row={item}
          lang={lang}
          myUid={uid}
          room={room ?? null}
          sender={room?.memberInfo?.[m.senderId]}
          unread={room ? unreadReaders(m, room.memberIds ?? [], reads) : null}
          blocked={!mine && isUserBlocked(state, m.senderId)}
          revealed={revealed.has(m.id)}
          bubbleMaxWidth={bubbleMaxWidth}
          highlight={search.open && search.hitSet.has(m.id) ? search.query : undefined}
          flash={flashId === m.id}
          actions={rowActions}
        />
      );
    },
    [lang, uid, room, reads, state, revealed, bubbleMaxWidth, search.open, search.hitSet, search.query, flashId, rowActions],
  );

  const title = room ? chatRoomTitle(room, lang, uid) : '';
  const description = room && room.type !== 'dm' ? chatRoomDescription(room.type, lang) : '';
  const memberCount = room?.memberIds?.length ?? 0;

  const header = (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <TouchableOpacity onPress={goBack} style={styles.headerBtn} hitSlop={8} accessibilityLabel={L('common.back')}>
        <Ionicons name="chevron-back" size={26} color={CHAT_COLORS.text} />
      </TouchableOpacity>
      <View style={styles.headerTitleWrap}>
        <View style={styles.headerTitleLine}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {room && room.type !== 'dm' ? <Text style={styles.headerCount}>{memberCount}</Text> : null}
          {muted ? <Ionicons name="notifications-off" size={13} color={CHAT_COLORS.muted} style={styles.headerMuted} /> : null}
        </View>
        {description ? <Text style={styles.headerDesc} numberOfLines={1}>{description}</Text> : null}
      </View>
      {isMember ? (
        <>
          {callCtx.enabled && callAdapter ? (
            <TouchableOpacity
              onPress={() => {
                Keyboard.dismiss();
                setCallSheetOpen(true);
              }}
              style={styles.headerBtn}
              hitSlop={6}
              accessibilityLabel={L('chat.callStartTitle')}
            >
              <Ionicons name="call-outline" size={21} color={CHAT_COLORS.text} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={search.openSearch} style={styles.headerBtn} hitSlop={6} accessibilityLabel={L('chat.search')}>
            <Ionicons name="search" size={21} color={search.open ? CHAT_COLORS.primary : CHAT_COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              Keyboard.dismiss();
              setRoomMenuOpen(true);
            }}
            style={styles.headerBtn}
            hitSlop={6}
            accessibilityLabel={L('chat.roomMenu')}
          >
            <Ionicons name="ellipsis-vertical" size={21} color={CHAT_COLORS.text} />
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );

  if (room === undefined || (isMember && !loaded)) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={CHAT_COLORS.primary} />
        </View>
      </View>
    );
  }

  if (!isMember || (error && isPermissionDenied(error) && !messages.length)) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={40} color={CHAT_COLORS.muted} />
          <Text style={styles.notInRoom}>{L('chat.notInRoom')}</Text>
        </View>
      </View>
    );
  }

  const viewerMessage = viewer?.message;
  const viewerMedia = (viewerMessage?.media ?? []).filter((x) => x.kind === 'image' || x.kind === 'video');
  const bottomInset = keyboardVisible ? 0 : insets.bottom;
  const replyName = composer.replyTo ? room.memberInfo?.[composer.replyTo.senderId]?.name || composer.replyTo.senderName : '';

  const composerBars = (
    <>
      {scheduled.length ? <ScheduledBar count={scheduled.length} onPress={() => setScheduledListOpen(true)} /> : null}
      {composer.silent ? <SilentBar onOff={composer.toggleSilent} /> : null}
      {composer.editTarget ? <EditBar onClose={composer.cancelEdit} /> : null}
      {composer.replyTo ? (
        <ReplyBar reply={composer.replyTo} name={replyName} lang={lang} onClose={() => composer.setReplyTo(null)} />
      ) : null}
      <MentionPicker options={composer.mentionOptions} onPick={composer.pickMention} />
    </>
  );

  return (
    <View style={styles.root}>
      {header}
      {search.open ? (
        <ChatSearchInput value={search.text} onChangeText={search.setText} onSubmit={search.submit} onClose={closeSearch} />
      ) : null}
      {activeCall && callCtx.enabled && callAdapter && !search.open ? (
        <CallBanner
          info={activeCall}
          direct={callDirect}
          lang={lang}
          inThisCall={inThisCall}
          onJoin={joinCall}
          onReturn={() => callAdapter.setMinimized(false)}
        />
      ) : null}
      {notice && !search.open ? (
        <NoticeBanner
          roomId={roomId}
          notice={notice}
          lang={lang}
          canClear={canNotice}
          onPress={() => {
            void jumpTo(notice.messageId);
          }}
          onClear={() => confirm(L('chat.clearNotice'), L('chat.appNoticeClearConfirm'), L('chat.clearNotice'), () => postNotice(null), true)}
        />
      ) : null}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <View style={styles.listWrap}>
          <FlatList
            ref={listRef}
            data={rows}
            inverted
            keyExtractor={(r) => r.key}
            renderItem={renderItem}
            onScroll={onScroll}
            scrollEventThrottle={32}
            onEndReached={hasMore ? loadOlder : undefined}
            onEndReachedThreshold={0.4}
            onScrollToIndexFailed={onScrollToIndexFailed}
            maintainVisibleContentPosition={{ minIndexForVisible: 1, autoscrollToTopThreshold: NEAR_BOTTOM_PX }}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={15}
            ListFooterComponent={
              loadingOlder ? (
                <View style={styles.older}>
                  <ActivityIndicator size="small" color={CHAT_COLORS.sub} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.empty}>{L('chat.noMessagesYet')}</Text>
              </View>
            }
          />
          {mentionTargetId ? (
            <View style={styles.mentionChipWrap} pointerEvents="box-none">
              <TouchableOpacity
                style={styles.mentionChip}
                onPress={() => {
                  setMentionDismissed(true);
                  void jumpTo(mentionTargetId);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.mentionChipText}>{L('chat.mentionJump')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMentionDismissed(true)} hitSlop={10} style={styles.mentionClose}>
                <Ionicons name="close" size={14} color="#ffffff" />
              </TouchableOpacity>
            </View>
          ) : null}
          {showNewButton ? (
            <TouchableOpacity style={styles.newButton} onPress={() => scrollToLatest(true)} activeOpacity={0.85}>
              <Text style={styles.newButtonText}>{L('chat.newMessages')}</Text>
              <Ionicons name="arrow-down" size={14} color="#ffffff" />
            </TouchableOpacity>
          ) : null}
          {toastNode}
          {datePickerNode}
        </View>
        {search.open ? (
          // 검색 중에는 입력창 대신 결과 이동 막대 (카톡처럼)
          <ChatSearchNav
            status={search.status}
            loading={search.loading}
            canOlder={search.hits.length > 0 && search.currentIdx < search.hits.length - 1}
            canNewer={search.currentIdx > 0}
            onOlder={search.goOlder}
            onNewer={search.goNewer}
            onPickDate={() => {
              Keyboard.dismiss();
              openDatePicker({ minimumDate: search.loading ? null : search.firstDate });
            }}
            bottomInset={bottomInset}
          />
        ) : composer.recording ? (
          <VoiceRecorderBar
            bottomInset={bottomInset}
            onDone={composer.finishRecording}
            onCancel={composer.cancelRecording}
            onError={composer.recordingFailed}
          />
        ) : (
          <ChatComposer
            text={composer.text}
            onChangeText={composer.setText}
            onSelectionChange={(e) => composer.setCursor(e.nativeEvent.selection.end)}
            inputRef={composer.inputRef}
            topBars={composerBars}
            tray={composer.tray}
            original={composer.original}
            onToggleOriginal={composer.setOriginal}
            onRemoveFromTray={composer.removeFromTray}
            onPressAttach={() => {
              Keyboard.dismiss();
              setAttachOpen(true);
            }}
            onSend={composer.send}
            onLongPressSend={composer.toggleSilent}
            silent={composer.silent}
            editing={!!composer.editTarget}
            onPressMic={() => {
              void composer.startRecording();
            }}
            bottomInset={bottomInset}
          />
        )}
      </KeyboardAvoidingView>

      {/* [+] 사진·동영상 / 카메라 / 투표 / 예약 메시지 */}
      <ChatSheet visible={attachOpen} onClose={() => setAttachOpen(false)}>
        <ChatSheetOption
          icon="images-outline"
          label={L('chat.attach')}
          onPress={() => {
            setAttachOpen(false);
            later(() => { void composer.pickFromLibrary(); });
          }}
        />
        <ChatSheetOption
          icon="camera-outline"
          label={L('chat.camera')}
          onPress={() => {
            setAttachOpen(false);
            later(() => { void composer.takeWithCamera(); });
          }}
        />
        <ChatSheetOption
          icon="stats-chart-outline"
          label={L('chat.poll')}
          onPress={() => {
            setAttachOpen(false);
            later(() => setPollOpen(true));
          }}
        />
        <ChatSheetOption
          icon="alarm-outline"
          label={L('chat.schedule')}
          onPress={() => {
            setAttachOpen(false);
            later(() => setScheduleOpen(true));
          }}
        />
        <ChatSheetOption label={L('common.cancel')} onPress={() => setAttachOpen(false)} />
      </ChatSheet>

      {/* 메시지 메뉴 — 공감 줄 → 답장 · 복사 · 수정 · 공지 · 저장 · 삭제 · 신고 · 차단 */}
      <ChatSheet visible={actionOpen} onClose={closeActions}>
        {menu?.canReact ? <ReactionPickerRow mine={menu.myReaction} onPick={react} /> : null}
        {menu?.canReply ? <ChatSheetOption icon="arrow-undo-outline" label={L('chat.reply')} onPress={doReply} /> : null}
        {menu?.canCopy ? <ChatSheetOption icon="copy-outline" label={L('chat.copy')} onPress={doCopy} /> : null}
        {menu?.canEdit ? <ChatSheetOption icon="create-outline" label={L('chat.edit')} onPress={doEdit} /> : null}
        {menu?.canNotice ? <ChatSheetOption icon="megaphone-outline" label={L('chat.setNotice')} onPress={doNotice} /> : null}
        {menu?.mediaCount ? (
          <ChatSheetOption icon="download-outline" label={menu.mediaCount > 1 ? L('chat.saveAll') : L('chat.save')} onPress={doSave} />
        ) : null}
        {menu?.canDelete ? <ChatSheetOption icon="trash-outline" label={L('chat.deleteForAll')} destructive onPress={doDelete} /> : null}
        {menu?.canReport ? <ChatSheetOption icon="flag-outline" label={L('chat.report')} destructive onPress={doReport} /> : null}
        {menu && !menu.mine ? (
          <ChatSheetOption
            icon={menu.blocked ? 'person-add-outline' : 'ban-outline'}
            label={menu.blocked ? L('chat.unblock') : L('chat.block')}
            onPress={doBlock}
          />
        ) : null}
        <ChatSheetOption label={L('common.cancel')} onPress={closeActions} />
      </ChatSheet>

      {/* 통화하기 (📞) — 음성 · 영상 */}
      <ChatSheet visible={callSheetOpen} onClose={() => setCallSheetOpen(false)} title={L('chat.callStartTitle')}>
        <CallStartOptions direct={callDirect} lang={lang} mock={!!callState.mock || !!callAdapter?.simulateIncoming} busy={isCallActive(callState)} onStart={startCall} />
      </ChatSheet>

      {/* 방 메뉴 (⋮) */}
      <ChatSheet visible={roomMenuOpen} onClose={() => setRoomMenuOpen(false)} title={L('chat.roomMenu')}>
        <ChatSheetOption
          icon="images-outline"
          label={L('chat.gallery')}
          onPress={() => {
            setRoomMenuOpen(false);
            later(() => setGalleryOpen(true));
          }}
        />
        <ChatSheetOption
          icon="share-outline"
          label={L('chat.export')}
          onPress={() => {
            setRoomMenuOpen(false);
            later(() => setExportOpen(true));
          }}
        />
        <ChatSheetOption
          icon={muted ? 'notifications-outline' : 'notifications-off-outline'}
          label={muted ? L('chat.unmute') : L('chat.mute')}
          onPress={() => {
            setRoomMenuOpen(false);
            toggleMute();
          }}
        />
        <ChatSheetOption
          icon="people-outline"
          label={L('chat.members', { n: memberCount })}
          onPress={() => {
            setRoomMenuOpen(false);
            later(() => setMembersOpen(true));
          }}
        />
        {canPinOrHide ? (
          <>
            <ChatSheetOption
              icon={pinned ? 'pin' : 'pin-outline'}
              label={pinned ? L('chat.unpin') : L('chat.pin')}
              onPress={() => {
                setRoomMenuOpen(false);
                togglePin();
              }}
            />
            <ChatSheetOption
              icon="eye-off-outline"
              label={L('chat.hideRoom')}
              onPress={() => {
                setRoomMenuOpen(false);
                later(() => confirm(L('chat.hideRoom'), L('chat.hideHint'), L('chat.hideRoom'), hideRoom));
              }}
            />
          </>
        ) : isPresetRoom(room) ? (
          <Text style={styles.presetNote}>{L('chat.presetPinned')}</Text>
        ) : null}
        <ChatSheetOption label={L('common.cancel')} onPress={() => setRoomMenuOpen(false)} />
      </ChatSheet>

      <ReportSheet visible={!!reportFor} onClose={() => setReportFor(null)} onSubmit={submitReport} />

      <MembersSheet
        visible={membersOpen}
        room={room}
        myUid={uid}
        busyUid={dmBusyUid}
        onClose={() => setMembersOpen(false)}
        onPressMember={openDmWith}
      />

      <UidListSheet
        visible={!!sheet}
        title={sheetTabs?.title ?? ''}
        tabs={sheetTabs?.tabs ?? []}
        memberInfo={room.memberInfo}
        myUid={uid}
        onClose={() => setSheet(null)}
      />

      <PollCreateSheet visible={pollOpen} onClose={() => setPollOpen(false)} onCreate={createPoll} />

      <ScheduleCreateSheet
        visible={scheduleOpen}
        composerText={composer.text}
        hasMedia={composer.tray.length > 0}
        onClose={() => setScheduleOpen(false)}
        onSubmit={createSchedule}
      />
      <ScheduledListSheet
        visible={scheduledListOpen}
        items={scheduled}
        onClose={() => setScheduledListOpen(false)}
        onCancelItem={cancelScheduled}
      />

      <ExportSheet
        visible={exportOpen}
        loadingCount={history.loading}
        onClose={() => setExportOpen(false)}
        onExport={(links) => {
          void exportChat(links);
        }}
      />

      <ChatGalleryModal
        visible={galleryOpen}
        roomId={roomId}
        campCode={room.campCode}
        memberInfo={room.memberInfo}
        onClose={() => setGalleryOpen(false)}
      />

      <MediaViewer
        key={viewerSeq}
        visible={!!viewer}
        media={viewerMedia}
        startIndex={viewer?.index ?? 0}
        senderName={viewerMessage ? senderNameOf(viewerMessage) : ''}
        at={viewerMessage ? new Date(messageMillis(viewerMessage) || Date.now()) : null}
        campCode={room.campCode}
        onClose={() => setViewer(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: CHAT_COLORS.roomBg, paddingHorizontal: 32 },
  notInRoom: { marginTop: 10, fontSize: 15, color: CHAT_COLORS.sub, textAlign: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 6,
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CHAT_COLORS.border,
  },
  headerBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flex: 1, paddingHorizontal: 2 },
  headerTitleLine: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: CHAT_COLORS.text, flexShrink: 1 },
  headerCount: { fontSize: 14, color: CHAT_COLORS.muted, marginLeft: 6 },
  headerMuted: { marginLeft: 4 },
  headerDesc: { fontSize: 12, color: CHAT_COLORS.sub, marginTop: 1 },
  presetNote: { fontSize: 13, color: CHAT_COLORS.sub, paddingHorizontal: 20, paddingVertical: 12 },

  listWrap: { flex: 1, backgroundColor: CHAT_COLORS.roomBg },
  listContent: { paddingTop: 10, paddingBottom: 6 },
  older: { paddingVertical: 12 },
  emptyWrap: { alignItems: 'center', paddingVertical: 40 },
  empty: { color: CHAT_COLORS.sub, fontSize: 14 },
  newButton: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(30, 41, 59, 0.88)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  mentionChipWrap: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CHAT_COLORS.primary,
    borderRadius: 18,
    paddingLeft: 4,
    paddingRight: 8,
  },
  mentionChip: { paddingHorizontal: 10, paddingVertical: 8 },
  mentionChipText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  mentionClose: { paddingLeft: 2 },
});
