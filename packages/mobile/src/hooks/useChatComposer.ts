/**
 * 대화방 입력창 상태 — 글 · 커서(@멘션) · 보내기 전 사진 · 원본 · 답장 · 수정 · 조용히 보내기 · 음성 녹음
 * 보내기(글 · 사진 묶음 · 수정)와 사진 고르기·카메라 · 🎤 권한까지 여기서.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Linking, type TextInput } from 'react-native';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import {
  CHAT_LIMITS,
  CHAT_MENTION_ALL_TOKENS,
  L,
  canEditChatMessage,
  canMentionAll,
  chatReplyRefOf,
  cleanChatText,
  editChatMessage,
  extractMentions,
  logger,
  mentionCandidates,
  type ChatMessageView,
  type ChatReplyRef,
  type ChatRoom,
} from '@smis-mentor/shared';
import { db } from '../config/firebase';
import { chatOutbox } from './useChatOutbox';
import {
  ChatMediaError,
  IMAGE_MAX_MB,
  VIDEO_MAX_MB,
  captureChatMedia,
  oversizedOf,
  pickChatMediaFromLibrary,
  type ChatPickedAsset,
} from '../services/chatMedia';
import { stopChatVoice } from '../components/chat/VoiceBubble';
import type { MentionOption } from '../components/chat/ComposerBars';

const errorMessage = (e: unknown) => (e instanceof Error && e.message ? e.message : L('chat.sendFailed'));
const openSettingsButtons = () => [
  { text: L('common.cancel'), style: 'cancel' as const },
  { text: L('common.openSettings'), onPress: () => { Linking.openSettings().catch(() => {}); } },
];

interface Params {
  roomId: string;
  room: ChatRoom | null | undefined;
  uid: string;
  myName: string;
  scrollToLatest: (animated?: boolean) => void;
  showToast: (message: string) => void;
}

export function useChatComposer({ roomId, room, uid, myName, scrollToLatest, showToast }: Params) {
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const [cursor, setCursor] = useState(0);
  const [tray, setTray] = useState<ChatPickedAsset[]>([]);
  const trayRef = useRef<ChatPickedAsset[]>([]);
  trayRef.current = tray;
  const [original, setOriginal] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatReplyRef | null>(null);
  const [editTarget, setEditTarget] = useState<ChatMessageView | null>(null);
  const draftRef = useRef('');
  const [silent, setSilent] = useState(false);
  const [recording, setRecording] = useState(false);

  const sender = useMemo(() => ({ uid, name: myName }), [uid, myName]);

  // ── 답장 · 수정 ───────────────────────────────────────────────────
  const startReply = useCallback((m: ChatMessageView) => {
    if (editTarget) {
      setEditTarget(null);
      setText(draftRef.current);
    }
    setReplyTo(chatReplyRefOf(m));
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [editTarget]);

  const startEdit = useCallback((m: ChatMessageView) => {
    if (!editTarget) draftRef.current = text;
    setReplyTo(null);
    setEditTarget(m);
    setText(m.text ?? '');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [editTarget, text]);

  const cancelEdit = useCallback(() => {
    setEditTarget(null);
    setText(draftRef.current);
    draftRef.current = '';
  }, []);

  // ── @멘션 ─────────────────────────────────────────────────────────
  /** 커서 앞이 '@글자…' 이면 그 글자 (아니면 null) */
  const mentionQuery = useMemo(() => {
    if (!room || room.type === 'dm' || editTarget) return null;
    const before = text.slice(0, cursor);
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(before);
    return m ? m[2] : null;
  }, [room, editTarget, text, cursor]);

  const mentionOptions = useMemo<MentionOption[]>(() => {
    if (mentionQuery === null || !room) return [];
    const q = mentionQuery.toLocaleLowerCase();
    const out: MentionOption[] = [];
    const allName = L('chat.mentionAll');
    if (canMentionAll(room, uid) && (!q || [...CHAT_MENTION_ALL_TOKENS, allName].some((tk) => tk.toLocaleLowerCase().startsWith(q)))) {
      out.push({ key: 'all', name: allName });
    }
    mentionCandidates(room, uid, mentionQuery)
      .slice(0, 30)
      .forEach((c) => out.push({ key: c.uid, name: c.name, label: c.label, kind: c.kind, photo: room.memberInfo?.[c.uid]?.photo }));
    return out;
  }, [mentionQuery, room, uid]);

  const pickMention = useCallback((o: MentionOption) => {
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(before);
    if (!m) return;
    const at = before.length - m[2].length - 1;
    const insert = `@${o.name} `;
    const next = before.slice(0, at) + insert + after;
    const pos = at + insert.length;
    setText(next);
    setCursor(pos);
    requestAnimationFrame(() => inputRef.current?.setSelection(pos, pos));
  }, [text, cursor]);

  // ── 사진 고르기 ───────────────────────────────────────────────────
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
        Alert.alert(L('common.permissionRequired'), L('chat.permissionPhotos'), openSettingsButtons());
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
        Alert.alert(L('common.permissionRequired'), L('chat.appPermissionCamera'), openSettingsButtons());
      } else {
        logger.warn('카메라 실패:', e);
        Alert.alert(L('common.error'), errorMessage(e));
      }
    }
  }, [original, addToTray]);

  const removeFromTray = useCallback((key: string) => setTray((list) => list.filter((a) => a.key !== key)), []);

  // ── 조용히 보내기 ─────────────────────────────────────────────────
  const toggleSilent = useCallback(() => {
    showToast(silent ? L('chat.appSilentOffToast') : L('chat.appSilentOnToast'));
    setSilent(!silent);
  }, [silent, showToast]);

  // ── 보내기 ────────────────────────────────────────────────────────
  const send = useCallback(() => {
    if (!uid || !room || text.length > CHAT_LIMITS.textMax) return;
    const body = cleanChatText(text);

    // 수정
    if (editTarget) {
      if (!body) return;
      if (!canEditChatMessage(editTarget, uid)) {
        Alert.alert(L('chat.editExpired'));
        return;
      }
      editChatMessage(db, roomId, editTarget.id, body).catch((e) => Alert.alert(L('common.error'), errorMessage(e)));
      setEditTarget(null);
      setText(draftRef.current);
      draftRef.current = '';
      return;
    }

    const mention = body ? extractMentions(body, room, uid) : { mentions: [], mentionAll: false };
    const textExtra = { replyTo, mentions: mention.mentions, mentionAll: mention.mentionAll, silent };
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
      // 답장은 사진 묶음에, 멘션은 뒤따르는 글에
      chatOutbox.sendMedia(roomId, sender, ok, {
        original,
        text: body || undefined,
        extra: { replyTo, silent },
        textExtra: { mentions: mention.mentions, mentionAll: mention.mentionAll, silent },
      });
      setTray([]);
    } else if (body) {
      chatOutbox.sendText(roomId, sender, body, textExtra);
    } else {
      return;
    }
    setText('');
    setReplyTo(null);
    scrollToLatest(true);
  }, [uid, room, text, editTarget, roomId, replyTo, silent, tray, original, sender, scrollToLatest]);

  // ── 음성 ──────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(L('common.permissionRequired'), L('chat.permissionMic'), openSettingsButtons());
        return;
      }
      stopChatVoice();
      Keyboard.dismiss();
      setRecording(true);
    } catch (e) {
      logger.warn('마이크 권한 확인 실패:', e);
      Alert.alert(L('common.error'), errorMessage(e));
    }
  }, []);

  const finishRecording = useCallback(
    (voice: { uri: string; durationMs: number }) => {
      setRecording(false);
      chatOutbox.sendVoice(roomId, sender, voice, { replyTo, silent });
      setReplyTo(null);
      scrollToLatest(true);
    },
    [roomId, sender, replyTo, silent, scrollToLatest],
  );

  const cancelRecording = useCallback(() => setRecording(false), []);
  const recordingFailed = useCallback((e: unknown) => {
    setRecording(false);
    Alert.alert(L('common.error'), errorMessage(e));
  }, []);

  return {
    inputRef,
    text,
    setText,
    setCursor,
    tray,
    original,
    setOriginal,
    removeFromTray,
    pickFromLibrary,
    takeWithCamera,
    replyTo,
    setReplyTo,
    startReply,
    editTarget,
    startEdit,
    cancelEdit,
    silent,
    setSilent,
    toggleSilent,
    mentionOptions,
    pickMention,
    send,
    recording,
    startRecording,
    finishRecording,
    cancelRecording,
    recordingFailed,
  };
}
