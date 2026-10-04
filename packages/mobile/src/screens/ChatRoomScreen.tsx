/**
 * 채팅 대화방 — 말풍선 목록(위로 올리면 이전 메시지) · 읽음 표시 · 사진·동영상 묶음 보내기 · 메시지 메뉴
 *
 * 글은 sendChatMessage 를 부르면 Firestore 가 바로 '보내는 중' 메시지로 목록에 넣어 준다.
 * 사진·동영상은 파일을 올리는 동안 보낼 편지함(useChatOutbox)의 말풍선으로 보여 준다.
 * 대화 내용 검색(카톡처럼): 처음 검색할 때 방 전체 메시지를 한 번 불러와 기기에서 찾는다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
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
import {
  CHAT_LIMITS,
  L,
  chatMessageLayout,
  chatRoomDescription,
  chatRoomTitle,
  cleanChatText,
  deleteChatMessage,
  getCurrentLocale,
  isRoomMuted,
  isUserBlocked,
  loadAllChatMessages,
  logger,
  markChatRoomRead,
  normalizeChatSearch,
  reportChatMessage,
  searchChatMessages,
  setChatRoomMuted,
  setChatUserBlocked,
  subscribeChatRoom,
  unreadOf,
  unreadReaders,
  type ChatMessage,
  type ChatMessageView,
  type ChatReportReason,
  type ChatRoom,
} from '@smis-mentor/shared';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useChatStore } from '../hooks/useChatUnread';
import { messageMillis, useChatMessages } from '../hooks/useChatMessages';
import { chatOutbox, useChatOutbox } from '../hooks/useChatOutbox';
import { clearOpenChatRoom, setOpenChatRoom } from '../services/chatPresence';
import { mobileAuthenticatedPost } from '../services/apiClient';
import {
  ChatMediaError,
  IMAGE_MAX_MB,
  VIDEO_MAX_MB,
  captureChatMedia,
  oversizedOf,
  pickChatMediaFromLibrary,
  type ChatPickedAsset,
} from '../services/chatMedia';
import { MessageRow, type ChatRow } from '../components/chat/MessageRow';
import { ChatComposer } from '../components/chat/ChatComposer';
import { ChatSheet, ChatSheetOption } from '../components/chat/ChatSheet';
import { MembersSheet } from '../components/chat/MembersSheet';
import { ReportSheet } from '../components/chat/ReportSheet';
import { MediaViewer } from '../components/chat/MediaViewer';
import { useChatToast } from '../components/chat/ChatToast';
import { ChatSearchInput, ChatSearchNav } from '../components/chat/ChatSearchBar';
import { saveChatMediaWithFeedback } from '../components/chat/saveWithFeedback';
import { CHAT_COLORS } from '../components/chat/chatTheme';
import type { RootStackScreenProps } from '../navigation/types';

/** 맨 아래(최신)에서 이만큼 안이면 '맨 아래 근처' */
const NEAR_BOTTOM_PX = 120;
/** 시트를 닫은 뒤 다른 시트·알림창·고르기 화면을 띄우기까지 (iOS 는 모달이 겹치면 안 뜬다) */
const AFTER_SHEET_MS = 350;

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, () => setVisible(true));
    const b = Keyboard.addListener(hideEvt, () => setVisible(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return visible;
}

const later = (fn: () => void) => setTimeout(fn, AFTER_SHEET_MS);
const errorMessage = (e: unknown) => (e instanceof Error && e.message ? e.message : L('chat.sendFailed'));
const isPermissionDenied = (e: unknown) => (e as { code?: string } | null)?.code === 'permission-denied';

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
  const { state } = useChatStore();

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

  const { messages, loaded, loadingOlder, hasMore, loadOlder, provideHistory, revealMessage, reads, error } = useChatMessages(roomId, isMember);
  const outbox = useChatOutbox(roomId);
  const visibleOutbox = useMemo(() => outbox.filter((it) => it.status !== 'sent'), [outbox]);

  // 지금 이 방을 보고 있다 — 이 방 알림은 배너·소리 없이
  useFocusEffect(
    useCallback(() => {
      setOpenChatRoom(roomId);
      return () => clearOpenChatRoom(roomId);
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

  const rows = useMemo<ChatRow[]>(() => {
    const pseudo: Array<Pick<ChatMessage, 'senderId' | 'createdAt' | 'kind'>> = visibleOutbox.map((it) => ({
      senderId: uid,
      createdAt: null,
      kind: it.kind === 'media' ? 'media' : 'text',
    }));
    const all: Array<Pick<ChatMessage, 'senderId' | 'createdAt' | 'kind'>> = [...messages, ...pseudo];
    const layout = chatMessageLayout(all, uid);
    const startsRun = (i: number) => {
      const prev = all[i - 1];
      return !prev || prev.senderId !== all[i].senderId || layout[i].showDay || prev.kind === 'system' || all[i].kind === 'system';
    };
    const out: ChatRow[] = messages.map((m, i) => ({ type: 'message', key: m.id, message: m, layout: layout[i], firstInRun: startsRun(i) }));
    visibleOutbox.forEach((item, j) => {
      const i = messages.length + j;
      out.push({ type: 'outbox', key: `o_${item.clientId}`, item, layout: layout[i], firstInRun: startsRun(i) });
    });
    // 뒤집힌 목록 — 최신이 맨 앞(화면 맨 아래)
    return out.reverse();
  }, [messages, visibleOutbox, uid]);

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
    if (!isMember || !loaded || !isFocused || !appActive || !uid) return;
    const first = !enteredRef.current;
    if (!first && (!needsRead || !nearBottom)) return;
    const t = setTimeout(() => {
      enteredRef.current = true;
      markChatRoomRead(db, roomId, uid).catch((e) => logger.warn('채팅 읽음 표시 실패:', e));
    }, first ? 250 : 800);
    return () => clearTimeout(t);
  }, [isMember, loaded, isFocused, appActive, uid, roomId, needsRead, nearBottom, latestOtherAt, roomUnread]);

  // ── 보내기 ────────────────────────────────────────────────────────
  const [text, setText] = useState('');
  const [tray, setTray] = useState<ChatPickedAsset[]>([]);
  const trayRef = useRef<ChatPickedAsset[]>([]);
  trayRef.current = tray;
  const [original, setOriginal] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [toastNode, showToast] = useChatToast(16);

  const addToTray = useCallback((picked: ChatPickedAsset[]) => {
    if (!picked.length) return;
    const tooBig = picked.filter((a) => oversizedOf(a, false) === 'video');
    const ok = picked.filter((a) => !tooBig.includes(a));
    const merged = [...trayRef.current, ...ok];
    const overflow = merged.length > CHAT_LIMITS.mediaMax;
    setTray(merged.slice(0, CHAT_LIMITS.mediaMax));
    const notes: string[] = [];
    if (tooBig.length) notes.push(L('chat.videoTooLarge', { max: VIDEO_MAX_MB }));
    if (overflow) notes.push(L('chat.selectUpTo', { n: CHAT_LIMITS.mediaMax }));
    if (notes.length) Alert.alert(notes.join('\n'));
  }, []);

  const pickFromLibrary = useCallback(async () => {
    const remaining = CHAT_LIMITS.mediaMax - trayRef.current.length;
    if (remaining <= 0) {
      Alert.alert(L('chat.selectUpTo', { n: CHAT_LIMITS.mediaMax }));
      return;
    }
    try {
      addToTray(await pickChatMediaFromLibrary({ original, limit: remaining }));
    } catch (e) {
      logger.warn('사진 고르기 실패:', e);
      const err = e as { code?: string; message?: string } | null;
      if (/permission/i.test(`${err?.code ?? ''} ${err?.message ?? ''}`)) {
        Alert.alert(L('common.permissionRequired'), L('chat.permissionPhotos'), [
          { text: L('common.cancel'), style: 'cancel' },
          { text: L('common.openSettings'), onPress: () => { Linking.openSettings().catch(() => {}); } },
        ]);
      } else {
        Alert.alert(L('common.error'), errorMessage(e));
      }
    }
  }, [original, addToTray]);

  const takeWithCamera = useCallback(async () => {
    if (trayRef.current.length >= CHAT_LIMITS.mediaMax) {
      Alert.alert(L('chat.selectUpTo', { n: CHAT_LIMITS.mediaMax }));
      return;
    }
    try {
      addToTray(await captureChatMedia({ original }));
    } catch (e) {
      if (e instanceof ChatMediaError && e.code === 'permission') {
        Alert.alert(L('common.permissionRequired'), L('chat.appPermissionCamera'), [
          { text: L('common.cancel'), style: 'cancel' },
          { text: L('common.openSettings'), onPress: () => { Linking.openSettings().catch(() => {}); } },
        ]);
      } else {
        logger.warn('카메라 실패:', e);
        Alert.alert(L('common.error'), errorMessage(e));
      }
    }
  }, [original, addToTray]);

  const send = useCallback(() => {
    if (!uid || text.length > CHAT_LIMITS.textMax) return;
    const body = cleanChatText(text);
    const sender = { uid, name: myName };
    if (tray.length) {
      // 너무 큰 것은 빼고 안내 (동영상은 늘, 사진은 원본일 때)
      const tooBig = tray.filter((a) => oversizedOf(a, original));
      const ok = tray.filter((a) => !tooBig.includes(a));
      if (tooBig.length) {
        const kinds = new Set(tooBig.map((a) => a.kind));
        const notes = [
          kinds.has('image') ? L('chat.imageTooLarge', { max: IMAGE_MAX_MB }) : '',
          kinds.has('video') ? L('chat.videoTooLarge', { max: VIDEO_MAX_MB }) : '',
        ].filter(Boolean);
        Alert.alert(notes.join('\n'));
      }
      if (!ok.length) {
        setTray([]);
        return;
      }
      chatOutbox.sendMedia(roomId, sender, ok, { original, text: body || undefined });
      setTray([]);
      setText('');
    } else if (body) {
      chatOutbox.sendText(roomId, sender, body);
      setText('');
    } else {
      return;
    }
    scrollToLatest(true);
  }, [uid, myName, text, tray, original, roomId, scrollToLatest]);

  const retry = useCallback((clientId: string) => chatOutbox.retry(roomId, clientId), [roomId]);
  const discard = useCallback(
    (clientId: string) => {
      const it = chatOutbox.discard(roomId, clientId);
      // 사진과 함께 입력했던 글은 입력창으로 되돌린다
      if (it?.kind === 'media' && it.text) setText((cur) => (cur.trim() ? cur : it.text ?? ''));
    },
    [roomId],
  );

  // ── 대화 내용 검색 ────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  /** 입력을 250ms 묶은 검색어 */
  const [query, setQuery] = useState('');
  /** 방 전체 메시지 (처음 검색할 때 한 번 불러와 화면이 있는 동안 둔다) */
  const [history, setHistory] = useState<ChatMessageView[] | null>(null);
  /** 불러오는 중이면 지금까지 받은 개수 */
  const [historyLoading, setHistoryLoading] = useState<number | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [currentHitId, setCurrentHitId] = useState<string | null>(null);
  /** 결과로 이동한 메시지 — 잠깐 밝힌다 */
  const [flashId, setFlashId] = useState<string | null>(null);
  const [jumpTick, setJumpTick] = useState(0);
  const pendingJumpRef = useRef<string | null>(null);
  const scrollRetryRef = useRef(0);
  const historyRequestedRef = useRef(false);

  const loadHistory = useCallback(() => {
    if (historyRequestedRef.current || !isMember) return;
    historyRequestedRef.current = true;
    setHistoryFailed(false);
    setHistoryLoading(0);
    loadAllChatMessages(db, roomId, { onProgress: (n) => setHistoryLoading(n) })
      .then((all) => {
        setHistory(all);
        // 이제 위로 올려 더 보기 · 결과로 이동은 이 기록에서 (Firestore 를 다시 읽지 않음)
        provideHistory(all);
      })
      .catch((e) => {
        logger.warn('대화 내용 불러오기 실패:', e);
        historyRequestedRef.current = false;
        setHistoryFailed(true);
        showToast(L('chat.loadFailed'));
      })
      .finally(() => setHistoryLoading(null));
  }, [isMember, roomId, provideHistory, showToast]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    loadHistory();
  }, [loadHistory]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchText('');
    setQuery('');
    setCurrentHitId(null);
    setFlashId(null);
    pendingJumpRef.current = null;
    Keyboard.dismiss();
  }, []);

  // Android 뒤로 가기 — 검색 중이면 검색만 닫는다
  useFocusEffect(
    useCallback(() => {
      if (!searchOpen) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        closeSearch();
        return true;
      });
      return () => sub.remove();
    }, [searchOpen, closeSearch]),
  );

  useEffect(() => {
    if (!searchOpen) return;
    const t = setTimeout(() => setQuery(searchText), 250);
    return () => clearTimeout(t);
  }, [searchText, searchOpen]);

  // 찾을 메시지 — 방 전체 기록 + 그 뒤로 온(또는 바뀐) 메시지. 기록을 못 불러왔으면 지금 가진 것만
  const searchPool = useMemo(() => {
    if (!searchOpen) return null;
    if (!history) return historyFailed ? messages : null;
    const map = new Map<string, ChatMessageView>();
    history.forEach((m) => map.set(m.id, m));
    messages.forEach((m) => map.set(m.id, m));
    return [...map.values()];
  }, [searchOpen, history, historyFailed, messages]);
  const searchReady = !!searchPool;
  /** 결과 id — 최신 것부터 (차단한 사람 메시지는 찾지 않는다) */
  const hits = useMemo(
    () => (searchPool && query ? searchChatMessages(searchPool, query, state.blocked) : []),
    [searchPool, query, state.blocked],
  );
  const hitSet = useMemo(() => new Set(hits), [hits]);
  const hitsRef = useRef(hits);
  hitsRef.current = hits;
  const currentIdx = currentHitId ? hits.indexOf(currentHitId) : -1;

  /** 이 메시지로 이동 — 목록에 없으면 받아 둔 기록에서 그 메시지까지 채운 뒤 */
  const jumpTo = useCallback(
    (id: string) => {
      if (!revealMessage(id)) return;
      pendingJumpRef.current = id;
      scrollRetryRef.current = 0;
      setFlashId(id);
      setJumpTick((n) => n + 1);
    },
    [revealMessage],
  );

  useEffect(() => {
    const id = pendingJumpRef.current;
    if (!id) return;
    const index = rows.findIndex((r) => r.type === 'message' && r.message.id === id);
    if (index < 0) return; // 목록에 들어오면 다시
    pendingJumpRef.current = null;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [rows, jumpTick]);

  // 아직 그려지지 않은(높이를 모르는) 줄 — 어림한 위치로 먼저 간 뒤 다시
  const onScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    listRef.current?.scrollToOffset({ offset: Math.max(0, info.averageItemLength * info.index), animated: false });
    if (scrollRetryRef.current >= 5) return;
    scrollRetryRef.current += 1;
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: true });
    }, 150);
  }, []);

  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 1800);
    return () => clearTimeout(t);
  }, [flashId, jumpTick]);

  // 검색어가 바뀌면(또는 기록을 다 불러오면) 가장 최근 결과로
  useEffect(() => {
    if (!searchOpen || !searchReady) return;
    const first = hitsRef.current[0] ?? null;
    setCurrentHitId(first);
    if (first) jumpTo(first);
  }, [query, searchOpen, searchReady, jumpTo]);

  const goToHit = useCallback(
    (i: number) => {
      const id = hits[i];
      if (!id) return;
      setCurrentHitId(id);
      jumpTo(id);
    },
    [hits, jumpTo],
  );
  /** ↑ 이전(더 예전) 결과 */
  const goOlder = useCallback(() => {
    if (!hits.length) return;
    goToHit(currentIdx < 0 ? 0 : Math.min(hits.length - 1, currentIdx + 1));
  }, [hits.length, currentIdx, goToHit]);
  /** ↓ 다음(더 최근) 결과 */
  const goNewer = useCallback(() => {
    if (currentIdx > 0) goToHit(currentIdx - 1);
  }, [currentIdx, goToHit]);
  /** 키보드 [검색] — 아직 묶이지 않은 검색어면 바로 찾고, 아니면 이전 결과로 */
  const submitSearch = useCallback(() => {
    if (searchText !== query) {
      setQuery(searchText);
      return;
    }
    goOlder();
  }, [searchText, query, goOlder]);

  let searchStatus = '';
  if (historyLoading !== null) searchStatus = L('chat.searching', { n: historyLoading });
  else if (!normalizeChatSearch(query)) searchStatus = '';
  else if (!hits.length) searchStatus = L('chat.searchNoResults');
  else searchStatus = L('chat.searchCount', { i: Math.max(0, currentIdx) + 1, n: hits.length });

  // ── 머리글 동작 ───────────────────────────────────────────────────
  const muted = isRoomMuted(state, roomId);
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

  const [membersOpen, setMembersOpen] = useState(false);
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
  const [viewer, setViewer] = useState<{ message: ChatMessageView; index: number } | null>(null);
  // 보기 화면을 열 때마다 새로 그린다 (시작 칸 · 재생 상태 초기화)
  const [viewerSeq, setViewerSeq] = useState(0);

  const senderNameOf = useCallback(
    (m: Pick<ChatMessage, 'senderId' | 'senderName'>) => room?.memberInfo?.[m.senderId]?.name || m.senderName || L('chat.unknownUser'),
    [room],
  );

  const actionInfo = useMemo(() => {
    const m = actionFor;
    if (!m) return null;
    const mine = m.senderId === uid;
    const blocked = !mine && isUserBlocked(state, m.senderId);
    const hidden = blocked && !revealed.has(m.id);
    return {
      m,
      mine,
      blocked,
      canCopy: !m.deleted && !hidden && !!m.text,
      mediaCount: !m.deleted && !hidden ? (m.media ?? []).length : 0,
      canDelete: mine && !m.deleted && !m.pending,
    };
  }, [actionFor, uid, state, revealed]);

  const menu = actionInfo;

  const openActions = useCallback(
    (m: ChatMessageView) => {
      const mine = m.senderId === uid;
      // 지워진 내 메시지는 할 수 있는 게 없다
      if (mine && m.deleted) return;
      Keyboard.dismiss();
      setActionFor(m);
      setActionOpen(true);
    },
    [uid],
  );
  const closeActions = useCallback(() => setActionOpen(false), []);

  const doCopy = useCallback(() => {
    const m = actionInfo?.m;
    closeActions();
    if (!m?.text) return;
    Clipboard.setStringAsync(m.text)
      .then(() => showToast(L('chat.copied')))
      .catch(() => {});
  }, [actionInfo, closeActions, showToast]);

  const doSave = useCallback(() => {
    const m = actionInfo?.m;
    closeActions();
    const media = m?.media ?? [];
    if (!m || !media.length) return;
    showToast(L('chat.appSaving', { done: 0, total: media.length }));
    later(() => {
      void saveChatMediaWithFeedback(media.map((item, index) => ({ item, index })), {
        campCode: room?.campCode,
        at: new Date(messageMillis(m) || Date.now()),
      });
    });
  }, [actionInfo, closeActions, showToast, room?.campCode]);

  const doDelete = useCallback(() => {
    const m = actionInfo?.m;
    closeActions();
    if (!m) return;
    later(() =>
      Alert.alert(L('chat.deleteForAll'), L('chat.deleteConfirm'), [
        { text: L('common.cancel'), style: 'cancel' },
        {
          text: L('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteChatMessage(db, roomId, m.id).catch((e) => Alert.alert(L('common.error'), errorMessage(e)));
          },
        },
      ]),
    );
  }, [actionInfo, closeActions, roomId]);

  const doReport = useCallback(() => {
    const m = actionInfo?.m;
    closeActions();
    if (m) later(() => setReportFor(m));
  }, [actionInfo, closeActions]);

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
    const info = actionInfo;
    closeActions();
    if (!info || info.mine || !uid) return;
    const otherUid = info.m.senderId;
    const name = senderNameOf(info.m);
    const next = !info.blocked;
    later(() =>
      Alert.alert(next ? L('chat.block') : L('chat.unblock'), next ? L('chat.blockConfirm', { name }) : L('chat.appUnblockConfirm', { name }), [
        { text: L('common.cancel'), style: 'cancel' },
        {
          text: next ? L('chat.block') : L('chat.unblock'),
          style: next ? 'destructive' : 'default',
          onPress: () => {
            setChatUserBlocked(db, uid, otherUid, next)
              .then(() => showToast(next ? L('chat.blockedDone') : L('chat.unblockedDone')))
              .catch((e) => Alert.alert(L('common.error'), errorMessage(e)));
          },
        },
      ]),
    );
  }, [actionInfo, closeActions, uid, senderNameOf, showToast]);

  const reveal = useCallback((id: string) => setRevealed((s) => new Set(s).add(id)), []);
  const openMedia = useCallback((m: ChatMessageView, index: number) => {
    Keyboard.dismiss();
    setViewerSeq((n) => n + 1);
    setViewer({ message: m, index });
  }, []);

  // ── 그리기 ────────────────────────────────────────────────────────
  const bubbleMaxWidth = Math.round(Math.min(width * 0.7, 360));
  const renderItem = useCallback(
    ({ item }: { item: ChatRow }) => {
      if (item.type === 'outbox') {
        return (
          <MessageRow
            row={item}
            lang={lang}
            unread={null}
            blocked={false}
            revealed={false}
            bubbleMaxWidth={bubbleMaxWidth}
            onReveal={reveal}
            onLongPress={openActions}
            onOpenMedia={openMedia}
            onRetry={retry}
            onDiscard={discard}
          />
        );
      }
      const m = item.message;
      const mine = m.senderId === uid;
      return (
        <MessageRow
          row={item}
          lang={lang}
          sender={room?.memberInfo?.[m.senderId]}
          unread={room ? unreadReaders(m, room.memberIds ?? [], reads) : null}
          blocked={!mine && isUserBlocked(state, m.senderId)}
          revealed={revealed.has(m.id)}
          bubbleMaxWidth={bubbleMaxWidth}
          highlight={searchOpen && hitSet.has(m.id) ? query : undefined}
          flash={flashId === m.id}
          onReveal={reveal}
          onLongPress={openActions}
          onOpenMedia={openMedia}
          onRetry={retry}
          onDiscard={discard}
        />
      );
    },
    [lang, uid, room, reads, state, revealed, bubbleMaxWidth, searchOpen, hitSet, query, flashId, reveal, openActions, openMedia, retry, discard],
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
        </View>
        {description ? <Text style={styles.headerDesc} numberOfLines={1}>{description}</Text> : null}
      </View>
      {isMember ? (
        <>
          <TouchableOpacity onPress={openSearch} style={styles.headerBtn} hitSlop={6} accessibilityLabel={L('chat.search')}>
            <Ionicons name="search" size={21} color={searchOpen ? CHAT_COLORS.primary : CHAT_COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleMute} style={styles.headerBtn} hitSlop={6} accessibilityLabel={muted ? L('chat.unmute') : L('chat.mute')}>
            <Ionicons name={muted ? 'notifications-off-outline' : 'notifications-outline'} size={22} color={muted ? CHAT_COLORS.muted : CHAT_COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMembersOpen(true)} style={styles.headerBtn} hitSlop={6} accessibilityLabel={L('chat.membersTitle')}>
            <Ionicons name="people-outline" size={23} color={CHAT_COLORS.text} />
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
  return (
    <View style={styles.root}>
      {header}
      {searchOpen ? (
        <ChatSearchInput value={searchText} onChangeText={setSearchText} onSubmit={submitSearch} onClose={closeSearch} />
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
          {showNewButton ? (
            <TouchableOpacity style={styles.newButton} onPress={() => scrollToLatest(true)} activeOpacity={0.85}>
              <Text style={styles.newButtonText}>{L('chat.newMessages')}</Text>
              <Ionicons name="arrow-down" size={14} color="#ffffff" />
            </TouchableOpacity>
          ) : null}
          {toastNode}
        </View>
        {searchOpen ? (
          // 검색 중에는 입력창 대신 결과 이동 막대 (카톡처럼)
          <ChatSearchNav
            status={searchStatus}
            loading={historyLoading !== null}
            canOlder={hits.length > 0 && currentIdx < hits.length - 1}
            canNewer={currentIdx > 0}
            onOlder={goOlder}
            onNewer={goNewer}
            bottomInset={keyboardVisible ? 0 : insets.bottom}
          />
        ) : (
          <ChatComposer
            text={text}
            onChangeText={setText}
            tray={tray}
            original={original}
            onToggleOriginal={setOriginal}
            onRemoveFromTray={(key) => setTray((list) => list.filter((a) => a.key !== key))}
            onPressAttach={() => {
              Keyboard.dismiss();
              setAttachOpen(true);
            }}
            onSend={send}
            bottomInset={keyboardVisible ? 0 : insets.bottom}
          />
        )}
      </KeyboardAvoidingView>

      {/* [+] 사진·동영상 / 카메라 */}
      <ChatSheet visible={attachOpen} onClose={() => setAttachOpen(false)}>
        <ChatSheetOption
          icon="images-outline"
          label={L('chat.attach')}
          onPress={() => {
            setAttachOpen(false);
            later(() => { void pickFromLibrary(); });
          }}
        />
        <ChatSheetOption
          icon="camera-outline"
          label={L('chat.camera')}
          onPress={() => {
            setAttachOpen(false);
            later(() => { void takeWithCamera(); });
          }}
        />
        <ChatSheetOption label={L('common.cancel')} onPress={() => setAttachOpen(false)} />
      </ChatSheet>

      {/* 메시지 메뉴 */}
      <ChatSheet visible={actionOpen} onClose={closeActions}>
        {menu?.canCopy ? <ChatSheetOption icon="copy-outline" label={L('chat.copy')} onPress={doCopy} /> : null}
        {menu?.mediaCount ? (
          <ChatSheetOption
            icon="download-outline"
            label={menu.mediaCount > 1 ? L('chat.saveAll') : L('chat.save')}
            onPress={doSave}
          />
        ) : null}
        {menu?.canDelete ? (
          <ChatSheetOption icon="trash-outline" label={L('chat.deleteForAll')} destructive onPress={doDelete} />
        ) : null}
        {menu && !menu.mine && !menu.m.deleted ? (
          <ChatSheetOption icon="flag-outline" label={L('chat.report')} destructive onPress={doReport} />
        ) : null}
        {menu && !menu.mine ? (
          <ChatSheetOption
            icon={menu.blocked ? 'person-add-outline' : 'ban-outline'}
            label={menu.blocked ? L('chat.unblock') : L('chat.block')}
            onPress={doBlock}
          />
        ) : null}
        <ChatSheetOption label={L('common.cancel')} onPress={closeActions} />
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

      <MediaViewer
        key={viewerSeq}
        visible={!!viewer}
        media={viewerMessage?.media ?? []}
        startIndex={viewer?.index ?? 0}
        senderName={viewerMessage ? senderNameOf(viewerMessage) : ''}
        at={viewerMessage ? new Date(messageMillis(viewerMessage) || Date.now()) : null}
        campCode={room?.campCode}
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
  headerDesc: { fontSize: 12, color: CHAT_COLORS.sub, marginTop: 1 },

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
});
