/**
 * 채팅 — Firestore · Storage 읽기·쓰기 (web·mobile 공용, firebase JS SDK)
 *
 * 방 만들기·사람 바꾸기는 서버(/api/chat/sync · /api/chat/dm)가 한다 — 여기서는 하지 않는다.
 * 메시지가 저장되면 서버(Functions)가 방의 마지막 메시지 · 안 읽은 수 · 푸시를 처리한다.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type QuerySnapshot,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytesResumable, type FirebaseStorage } from 'firebase/storage';
import type {
  ChatCallDoc,
  ChatMediaItem,
  ChatMessage,
  ChatMessageView,
  ChatPoll,
  ChatReactionKey,
  ChatReplyRef,
  ChatReportReason,
  ChatRoom,
  ChatScheduledMessage,
  ChatUserState,
} from '../../types/chat';
import { CHAT_LIMITS, cleanChatText } from '../../utils/chat';

export const CHAT_ROOMS = 'chatRooms';
export const CHAT_USER_STATE = 'chatUserState';
export const CHAT_SCHEDULED = 'chatScheduled';
export const CHAT_CALLS = 'chatCalls';

const roomOf = (d: DocumentSnapshot<DocumentData>): ChatRoom => ({ id: d.id, ...(d.data() as Omit<ChatRoom, 'id'>) });
const messageOf = (d: DocumentSnapshot<DocumentData>): ChatMessageView => ({
  id: d.id,
  ...(d.data({ serverTimestamps: 'estimate' }) as Omit<ChatMessage, 'id'>),
  pending: d.metadata.hasPendingWrites,
});

/** 내가 들어가 있는 방 전부 (캠프 방 + DM) */
export function subscribeMyChatRooms(
  db: Firestore,
  uid: string,
  onRooms: (rooms: ChatRoom[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, CHAT_ROOMS), where('memberIds', 'array-contains', uid)),
    (snap) => onRooms(snap.docs.map(roomOf)),
    (e) => onError?.(e),
  );
}

// ── 통화 (chatCalls — 서버만 쓴다) ─────────────────────────────────

const callOf = (d: DocumentSnapshot<DocumentData>): ChatCallDoc => ({ ...(d.data() as Omit<ChatCallDoc, 'id'>), id: d.id });

/** 통화 하나 (실시간) — 없거나 읽을 수 없으면 null */
export function subscribeChatCall(db: Firestore, callId: string, cb: (call: ChatCallDoc | null) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, CHAT_CALLS, callId), (d) => cb(d.exists() ? callOf(d) : null), (e) => {
    onError?.(e);
    cb(null);
  });
}

/** 나에게 걸려 오는 1:1 통화 (벨 울리는 중) */
export function subscribeIncomingChatCalls(db: Firestore, uid: string, cb: (calls: ChatCallDoc[]) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, CHAT_CALLS), where('invitedIds', 'array-contains', uid), where('status', '==', 'ringing')),
    (snap) => cb(snap.docs.map(callOf)),
    (e) => onError?.(e),
  );
}

/** 방 한 개 */
export function subscribeChatRoom(db: Firestore, roomId: string, cb: (room: ChatRoom | null) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, CHAT_ROOMS, roomId), (d) => cb(d.exists() ? roomOf(d) : null), (e) => onError?.(e));
}

/** 내 채팅 상태 (안 읽은 수 · 알림 끈 방 · 차단) */
export function subscribeChatUserState(db: Firestore, uid: string, cb: (state: ChatUserState) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, CHAT_USER_STATE, uid), (d) => cb((d.data() as ChatUserState) ?? {}), (e) => onError?.(e));
}

/**
 * 최근 메시지 (실시간) — 오래된 것 → 최신 순으로 넘긴다.
 * 보내는 중인 메시지도 바로 들어온다 (pending: true, 시각은 추정값).
 * hasMore: 더 위에 메시지가 있을 수 있다 (loadOlderChatMessages 로 이어서)
 */
export function subscribeChatMessages(
  db: Firestore,
  roomId: string,
  cb: (messages: ChatMessageView[], info: { hasMore: boolean; oldest: DocumentSnapshot<DocumentData> | null }) => void,
  opts: { pageSize?: number; onError?: (e: Error) => void } = {},
): Unsubscribe {
  const n = opts.pageSize ?? CHAT_LIMITS.pageSize;
  return onSnapshot(
    query(collection(db, CHAT_ROOMS, roomId, 'messages'), orderBy('createdAt', 'desc'), limit(n)),
    { includeMetadataChanges: true },
    (snap) => {
      const docs = snap.docs;
      cb(docs.map(messageOf).reverse(), { hasMore: docs.length >= n, oldest: docs[docs.length - 1] ?? null });
    },
    (e) => opts.onError?.(e),
  );
}

/** 더 이전 메시지 (한 번 읽기) — before: 지금 가진 가장 오래된 메시지 문서 */
export async function loadOlderChatMessages(
  db: Firestore,
  roomId: string,
  before: DocumentSnapshot<DocumentData>,
  pageSize: number = CHAT_LIMITS.pageSize,
): Promise<{ messages: ChatMessageView[]; hasMore: boolean; oldest: DocumentSnapshot<DocumentData> | null }> {
  const snap = await getDocs(query(collection(db, CHAT_ROOMS, roomId, 'messages'), orderBy('createdAt', 'desc'), startAfter(before), limit(pageSize)));
  const docs = snap.docs;
  return { messages: docs.map(messageOf).reverse(), hasMore: docs.length >= pageSize, oldest: docs[docs.length - 1] ?? before };
}

/**
 * 방의 메시지 전부 (한 번 읽기, 오래된 것 → 최신 순) — 대화 내용 검색용.
 * 500개씩 나눠 읽는다. onProgress 로 지금까지 읽은 수를 알려 준다.
 */
export async function loadAllChatMessages(
  db: Firestore,
  roomId: string,
  opts: { pageSize?: number; onProgress?: (loaded: number) => void } = {},
): Promise<ChatMessageView[]> {
  const n = opts.pageSize ?? 500;
  const out: ChatMessageView[] = [];
  let after: DocumentSnapshot<DocumentData> | null = null;
  for (;;) {
    const base = query(collection(db, CHAT_ROOMS, roomId, 'messages'), orderBy('createdAt', 'asc'), limit(n));
    const snap: QuerySnapshot<DocumentData> = await getDocs(after ? query(base, startAfter(after)) : base);
    snap.docs.forEach((d) => out.push(messageOf(d)));
    opts.onProgress?.(out.length);
    if (snap.docs.length < n) break;
    after = snap.docs[snap.docs.length - 1];
  }
  return out;
}

/** 방 사람들이 마지막으로 본 시각 — uid → ms (안 읽은 사람 수 '1' 계산) */
export function subscribeChatReads(db: Firestore, roomId: string, cb: (reads: Record<string, number>) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    collection(db, CHAT_ROOMS, roomId, 'reads'),
    (snap) => {
      const out: Record<string, number> = {};
      snap.docs.forEach((d) => {
        const at = d.data({ serverTimestamps: 'estimate' })?.at as Timestamp | undefined;
        out[d.id] = at?.toMillis?.() ?? 0;
      });
      cb(out);
    },
    (e) => onError?.(e),
  );
}

/** 새 메시지 id (사진을 먼저 올릴 때 경로에 쓴다) */
export const newChatMessageId = (db: Firestore, roomId: string): string => doc(collection(db, CHAT_ROOMS, roomId, 'messages')).id;

export interface SendChatMessageInput {
  /** 미리 만든 id (사진·동영상을 먼저 올린 경우) */
  id?: string;
  senderId: string;
  senderName: string;
  text?: string;
  media?: ChatMediaItem[];
  clientId: string;
  /** 'voice' 면 media 에 음성 하나 · 'poll' 이면 poll */
  kind?: 'text' | 'media' | 'voice' | 'poll';
  poll?: ChatPoll;
  replyTo?: ChatReplyRef | null;
  mentions?: string[];
  mentionAll?: boolean;
  silent?: boolean;
}

/** 메시지 보내기 — 글 · 사진/동영상 · 음성 · 투표 (답장 · 멘션 · 조용히 보내기 함께) */
export async function sendChatMessage(db: Firestore, roomId: string, input: SendChatMessageInput): Promise<string> {
  const text = cleanChatText(input.text ?? '');
  const media = (input.media ?? []).slice(0, CHAT_LIMITS.mediaMax).map(cleanMedia);
  const kind = input.kind === 'poll' ? 'poll' : input.kind === 'voice' ? 'voice' : media.length ? 'media' : 'text';
  if (kind === 'poll' && !input.poll) throw new Error('empty poll');
  if (kind === 'voice' && media.length !== 1) throw new Error('voice needs one audio');
  if (kind !== 'poll' && !text && media.length === 0) throw new Error('empty message');
  const ref = input.id ? doc(db, CHAT_ROOMS, roomId, 'messages', input.id) : doc(collection(db, CHAT_ROOMS, roomId, 'messages'));
  const data: Record<string, unknown> = {
    senderId: input.senderId,
    senderName: String(input.senderName ?? '').slice(0, 60),
    kind,
    text: kind === 'poll' ? '' : text,
    media: kind === 'poll' ? [] : media,
    clientId: input.clientId,
    createdAt: serverTimestamp(),
  };
  if (input.replyTo) data.replyTo = cleanReply(input.replyTo);
  if (input.mentions?.length) data.mentions = [...new Set(input.mentions)].slice(0, 100);
  if (input.mentionAll) data.mentionAll = true;
  if (input.silent) data.silent = true;
  if (kind === 'poll' && input.poll) data.poll = cleanPoll(input.poll);
  await setDoc(ref, data);
  return ref.id;
}

function cleanReply(r: ChatReplyRef): ChatReplyRef {
  const out: ChatReplyRef = { id: r.id, senderId: r.senderId, senderName: String(r.senderName ?? '').slice(0, 60), kind: r.kind, text: String(r.text ?? '').slice(0, CHAT_LIMITS.replyTextMax) };
  if (r.thumbUrl) out.thumbUrl = r.thumbUrl;
  return out;
}

function cleanPoll(p: ChatPoll): ChatPoll {
  const out: ChatPoll = {
    question: String(p.question ?? '').slice(0, CHAT_LIMITS.pollQuestionMax),
    options: (p.options ?? []).slice(0, CHAT_LIMITS.pollOptionsMax).map((o) => ({ id: String(o.id), text: String(o.text ?? '').slice(0, CHAT_LIMITS.pollOptionMax) })),
    multi: !!p.multi,
    anonymous: !!p.anonymous,
  };
  if (p.closesAt) out.closesAt = p.closesAt;
  return out;
}

function cleanMedia(m: ChatMediaItem): ChatMediaItem {
  const out: ChatMediaItem = { kind: m.kind === 'video' || m.kind === 'audio' ? m.kind : 'image', url: m.url, path: m.path };
  if (m.thumbUrl) out.thumbUrl = m.thumbUrl;
  if (m.thumbPath) out.thumbPath = m.thumbPath;
  if (m.w) out.w = Math.round(m.w);
  if (m.h) out.h = Math.round(m.h);
  if (m.size) out.size = Math.round(m.size);
  if (m.durationMs) out.durationMs = Math.round(m.durationMs);
  if (m.contentType) out.contentType = m.contentType;
  if (m.original) out.original = true;
  return out;
}

/** 글 고치기 — 내 글 메시지, 보낸 뒤 24시간 안 (규칙이 검사) */
export async function editChatMessage(db: Firestore, roomId: string, messageId: string, text: string): Promise<void> {
  const clean = cleanChatText(text);
  if (!clean) throw new Error('empty message');
  await updateDoc(doc(db, CHAT_ROOMS, roomId, 'messages', messageId), { text: clean, editedAt: serverTimestamp() });
}

/** 공감 달기 · 바꾸기 · 지우기 (key = null) — 한 사람 하나 */
export async function setChatReaction(db: Firestore, roomId: string, messageId: string, uid: string, key: ChatReactionKey | null): Promise<void> {
  await updateDoc(doc(db, CHAT_ROOMS, roomId, 'messages', messageId), new FieldPath('reactions', uid), key ?? deleteField());
}

/** 투표 — optionIds 가 비면 내 투표 취소 */
export async function voteChatPoll(db: Firestore, roomId: string, messageId: string, uid: string, optionIds: string[]): Promise<void> {
  const ids = [...new Set(optionIds)].slice(0, CHAT_LIMITS.pollOptionsMax);
  await updateDoc(doc(db, CHAT_ROOMS, roomId, 'messages', messageId), new FieldPath('pollVotes', uid), ids.length ? ids : deleteField());
}

/** 투표 마감 (만든 사람) */
export async function closeChatPoll(db: Firestore, roomId: string, messageId: string): Promise<void> {
  await updateDoc(doc(db, CHAT_ROOMS, roomId, 'messages', messageId), { pollClosed: true });
}

/** 공지 '확인' — 공지 메시지에 내 확인 시각 */
export async function ackChatNotice(db: Firestore, roomId: string, messageId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, CHAT_ROOMS, roomId, 'messages', messageId), new FieldPath('acks', uid), serverTimestamp());
}

/** 메시지 한 개 (실시간) — 공지 확인 현황 등 */
export function subscribeChatMessage(db: Firestore, roomId: string, messageId: string, cb: (m: ChatMessageView | null) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, CHAT_ROOMS, roomId, 'messages', messageId), (d) => cb(d.exists() ? messageOf(d) : null), (e) => onError?.(e));
}

/** 모두에게서 삭제 (보낸 사람) — 사진·동영상 파일은 서버가 지운다 */
export async function deleteChatMessage(db: Firestore, roomId: string, messageId: string): Promise<void> {
  await updateDoc(doc(db, CHAT_ROOMS, roomId, 'messages', messageId), {
    deleted: true,
    deletedAt: serverTimestamp(),
    text: '',
    media: [],
  });
}

/** 읽음 표시 — 방을 보고 있을 때 새 메시지가 오면 부른다 (안 읽은 수 0 · 마지막으로 본 시각) */
export async function markChatRoomRead(db: Firestore, roomId: string, uid: string): Promise<void> {
  const b = writeBatch(db);
  b.set(doc(db, CHAT_ROOMS, roomId, 'reads', uid), { uid, at: serverTimestamp() });
  b.set(doc(db, CHAT_USER_STATE, uid), { unread: { [roomId]: 0 }, updatedAt: serverTimestamp() }, { merge: true });
  await b.commit();
}

/** 방 알림 끄기·켜기 */
export async function setChatRoomMuted(db: Firestore, uid: string, roomId: string, muted: boolean): Promise<void> {
  await setDoc(doc(db, CHAT_USER_STATE, uid), { muted: { [roomId]: muted ? true : deleteField() }, updatedAt: serverTimestamp() }, { merge: true });
}

/** 사람 차단·해제 — 그 사람 메시지를 가리고 알림도 받지 않는다 */
export async function setChatUserBlocked(db: Firestore, uid: string, otherUid: string, blocked: boolean): Promise<void> {
  await setDoc(doc(db, CHAT_USER_STATE, uid), { blocked: { [otherUid]: blocked ? true : deleteField() }, updatedAt: serverTimestamp() }, { merge: true });
}

/** 방 위에 고정 · 해제 (미리 만든 방은 늘 고정이라 부르지 않는다) */
export async function setChatRoomPinned(db: Firestore, uid: string, roomId: string, pinned: boolean): Promise<void> {
  await setDoc(doc(db, CHAT_USER_STATE, uid), { pinned: { [roomId]: pinned ? Date.now() : deleteField() }, updatedAt: serverTimestamp() }, { merge: true });
}

/** 방 숨기기 · 다시 보이기 — 숨기면 고정도 푼다. 숨긴 뒤 새 메시지가 오면 다시 보인다 */
export async function setChatRoomHidden(db: Firestore, uid: string, roomId: string, hidden: boolean): Promise<void> {
  await setDoc(doc(db, CHAT_USER_STATE, uid), {
    hidden: { [roomId]: hidden ? Date.now() : deleteField() },
    ...(hidden ? { pinned: { [roomId]: deleteField() }, unread: { [roomId]: 0 } } : {}),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** 예약 메시지 만들기 (글만) — 서버가 그 시각에 보낸다 */
export async function scheduleChatMessage(
  db: Firestore,
  input: { roomId: string; senderId: string; senderName: string; text: string; sendAt: Date; mentions?: string[]; mentionAll?: boolean; silent?: boolean },
): Promise<string> {
  const text = cleanChatText(input.text);
  if (!text) throw new Error('empty message');
  const data: Record<string, unknown> = {
    roomId: input.roomId,
    senderId: input.senderId,
    senderName: String(input.senderName ?? '').slice(0, 60),
    text,
    sendAt: Timestamp.fromDate(input.sendAt),
    createdAt: serverTimestamp(),
  };
  if (input.mentions?.length) data.mentions = [...new Set(input.mentions)].slice(0, 100);
  if (input.mentionAll) data.mentionAll = true;
  if (input.silent) data.silent = true;
  const ref = await addDoc(collection(db, CHAT_SCHEDULED), data);
  return ref.id;
}

/** 내 예약 메시지 (모든 방) — 화면에서 방으로 거른다 */
export function subscribeMyScheduledChatMessages(db: Firestore, uid: string, cb: (list: ChatScheduledMessage[]) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, CHAT_SCHEDULED), where('senderId', '==', uid)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatScheduledMessage, 'id'>) })).sort((a, b) => a.sendAt.toMillis() - b.sendAt.toMillis())),
    (e) => onError?.(e),
  );
}

export async function cancelScheduledChatMessage(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, CHAT_SCHEDULED, id));
}

/** 사진·동영상 모아보기 — 사진·동영상 메시지만 최신 순으로 한 쪽씩 (색인: messages kind + createdAt) */
export async function loadChatMediaPage(
  db: Firestore,
  roomId: string,
  opts: { before?: DocumentSnapshot<DocumentData> | null; pageSize?: number } = {},
): Promise<{ messages: ChatMessageView[]; hasMore: boolean; oldest: DocumentSnapshot<DocumentData> | null }> {
  const n = opts.pageSize ?? 60;
  const base = query(collection(db, CHAT_ROOMS, roomId, 'messages'), where('kind', '==', 'media'), orderBy('createdAt', 'desc'), limit(n));
  const snap: QuerySnapshot<DocumentData> = await getDocs(opts.before ? query(base, startAfter(opts.before)) : base);
  const docs = snap.docs;
  return { messages: docs.map(messageOf).filter((m) => !m.deleted), hasMore: docs.length >= n, oldest: docs[docs.length - 1] ?? opts.before ?? null };
}

/** 메시지 신고 → 관리자 '신고' 목록 (같은 메시지는 한 번만) */
export async function reportChatMessage(
  db: Firestore,
  args: { roomId: string; message: Pick<ChatMessage, 'id' | 'senderId' | 'text' | 'media'>; reporterId: string; reason: ChatReportReason; detail?: string },
): Promise<void> {
  const id = `chatMessage_${args.roomId}_${args.message.id}_${args.reporterId}`;
  const excerpt = String(args.message.text ?? '').slice(0, 500);
  await setDoc(doc(db, 'reports', id), {
    targetType: 'chatMessage',
    roomId: args.roomId,
    messageId: args.message.id,
    targetAuthorId: args.message.senderId,
    reporterId: args.reporterId,
    reason: args.reason,
    detail: String(args.detail ?? '').slice(0, 500),
    excerpt,
    mediaCount: (args.message.media ?? []).length,
    status: 'open',
    createdAt: serverTimestamp(),
  });
}

/**
 * 파일 한 개 올리기 → 내려받기 주소.
 * data: 웹은 Blob/File, 모바일은 fetch(uri).blob()
 */
export function uploadChatFile(
  storage: FirebaseStorage,
  path: string,
  data: Blob | Uint8Array | ArrayBuffer,
  contentType: string,
  onProgress?: (sent: number, total: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef(storage, path), data, { contentType, cacheControl: 'public, max-age=31536000, immutable' });
    task.on(
      'state_changed',
      (s) => onProgress?.(s.bytesTransferred, s.totalBytes),
      reject,
      () => { getDownloadURL(task.snapshot.ref).then(resolve, reject); },
    );
  });
}
