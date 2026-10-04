/**
 * 채팅 — 보내는 중인 사진·동영상 묶음 · 보내지 못한 글 (방별 '보낼 편지함')
 *
 * 글은 Firestore 가 바로 '보내는 중' 메시지로 목록에 넣어 주므로 여기 두지 않는다 (실패했을 때만 남긴다).
 * 사진·동영상은 파일을 다 올린 뒤에야 메시지를 쓰므로, 그동안 여기서 '보내는 중' 말풍선을 보여 준다.
 * 화면을 나가도 올리기는 계속되고, 방에 다시 들어오면 진행 상황이 그대로 보인다 (앱 메모리에 둔다).
 */
import { useSyncExternalStore } from 'react';
import { deleteObject, ref as storageRef } from 'firebase/storage';
import {
  L,
  logger,
  newChatClientId,
  newChatMessageId,
  sendChatMessage,
  type ChatMediaItem,
} from '@smis-mentor/shared';
import { db, storage } from '../config/firebase';
import {
  ChatMediaError,
  IMAGE_MAX_MB,
  VIDEO_MAX_MB,
  prepareChatMedia,
  uploadChatMedia,
  type ChatPickedAsset,
} from '../services/chatMedia';

export interface ChatOutboxEntry {
  asset: ChatPickedAsset;
  /** 올리기가 끝난 항목 (다시 보낼 때 건너뛴다) */
  result?: ChatMediaItem;
  /** 0~1 */
  fraction: number;
}

export interface ChatOutboxItem {
  clientId: string;
  roomId: string;
  /** 사진 경로·메시지 문서 id (미리 만든다) */
  messageId: string;
  kind: 'media' | 'text';
  createdAt: number;
  /** uploading: 올리는 중 · sent: 메시지를 썼다(목록에서는 Firestore 메시지가 대신 보인다) · failed */
  status: 'uploading' | 'sent' | 'failed';
  entries: ChatOutboxEntry[];
  original: boolean;
  /** 글 메시지 — 또는 사진 묶음 뒤에 따로 보낼 글 */
  text?: string;
  error?: string;
  sender: { uid: string; name: string };
}

const EMPTY: ChatOutboxItem[] = [];
const byRoom = new Map<string, ChatOutboxItem[]>();
const listeners = new Set<() => void>();

function setRoom(roomId: string, fn: (list: ChatOutboxItem[]) => ChatOutboxItem[]) {
  const next = fn(byRoom.get(roomId) ?? EMPTY);
  if (next.length) byRoom.set(roomId, next);
  else byRoom.delete(roomId);
  listeners.forEach((l) => l());
}
function patchItem(roomId: string, clientId: string, fn: (it: ChatOutboxItem) => ChatOutboxItem) {
  setRoom(roomId, (list) => list.map((it) => (it.clientId === clientId ? fn(it) : it)));
}
function patchEntry(roomId: string, clientId: string, index: number, patch: Partial<ChatOutboxEntry>) {
  patchItem(roomId, clientId, (it) => ({
    ...it,
    entries: it.entries.map((e, i) => (i === index ? { ...e, ...patch } : e)),
  }));
}
function getItem(roomId: string, clientId: string): ChatOutboxItem | undefined {
  return byRoom.get(roomId)?.find((it) => it.clientId === clientId);
}
function removeItem(roomId: string, clientId: string) {
  setRoom(roomId, (list) => list.filter((it) => it.clientId !== clientId));
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function errorText(e: unknown): string {
  if (e instanceof ChatMediaError && e.code === 'too-large') {
    return e.message === 'video' ? L('chat.videoTooLarge', { max: VIDEO_MAX_MB }) : L('chat.imageTooLarge', { max: IMAGE_MAX_MB });
  }
  return L('chat.sendFailed');
}

function addFailedText(roomId: string, sender: ChatOutboxItem['sender'], text: string, clientId: string = newChatClientId()) {
  setRoom(roomId, (list) => [
    ...list.filter((it) => it.clientId !== clientId),
    {
      clientId, roomId, messageId: '', kind: 'text', createdAt: Date.now(), status: 'failed',
      entries: [], original: false, text, sender, error: L('chat.sendFailed'),
    },
  ]);
}

/** 글 보내기 — Firestore 가 거절하면(권한 등) 실패 말풍선으로 남긴다 */
function sendText(roomId: string, sender: ChatOutboxItem['sender'], text: string, clientId: string = newChatClientId()): void {
  sendChatMessage(db, roomId, { senderId: sender.uid, senderName: sender.name, text, clientId }).catch((e) => {
    logger.warn('채팅 글 보내기 실패:', e);
    addFailedText(roomId, sender, text, clientId);
  });
}

async function runMedia(roomId: string, clientId: string): Promise<void> {
  const start = getItem(roomId, clientId);
  if (!start) return;
  patchItem(roomId, clientId, (it) => ({ ...it, status: 'uploading', error: undefined }));
  try {
    for (let i = 0; i < start.entries.length; i += 1) {
      const cur = getItem(roomId, clientId);
      if (!cur) return; // 지웠다
      if (cur.entries[i].result) continue;
      const file = await prepareChatMedia(cur.entries[i].asset, cur.original);
      let last = 0;
      const result = await uploadChatMedia(
        { roomId, uid: cur.sender.uid, messageId: cur.messageId, index: i, file },
        (f) => {
          // 화면 갱신은 2% 단위로만
          if (f < 1 && f - last < 0.02) return;
          last = f;
          patchEntry(roomId, clientId, i, { fraction: f });
        },
      );
      patchEntry(roomId, clientId, i, { result, fraction: 1 });
    }
    const done = getItem(roomId, clientId);
    if (!done) return;
    const media = done.entries.map((e) => e.result).filter((m): m is ChatMediaItem => !!m);
    const followText = done.text?.trim() ? done.text : '';
    // 메시지를 쓰면 Firestore 의 '보내는 중' 메시지가 이 말풍선을 대신한다
    patchItem(roomId, clientId, (it) => ({ ...it, status: 'sent', text: undefined }));
    const sending = sendChatMessage(db, roomId, {
      id: done.messageId, senderId: done.sender.uid, senderName: done.sender.name, media, clientId,
    });
    // 함께 입력한 글은 사진 묶음 다음에 따로 한 메시지로 (카톡처럼)
    if (followText) sendText(roomId, done.sender, followText);
    await sending;
    removeItem(roomId, clientId);
  } catch (e) {
    logger.warn('채팅 사진·동영상 보내기 실패:', e);
    patchItem(roomId, clientId, (it) => ({ ...it, status: 'failed', error: errorText(e) }));
  }
}

/** 사진·동영상 묶음 보내기 (+ 뒤에 보낼 글) */
function sendMedia(
  roomId: string,
  sender: ChatOutboxItem['sender'],
  assets: ChatPickedAsset[],
  opts: { original: boolean; text?: string },
): void {
  if (!assets.length) return;
  const clientId = newChatClientId();
  const item: ChatOutboxItem = {
    clientId,
    roomId,
    messageId: newChatMessageId(db, roomId),
    kind: 'media',
    createdAt: Date.now(),
    status: 'uploading',
    entries: assets.map((asset) => ({ asset, fraction: 0 })),
    original: opts.original,
    text: opts.text,
    sender,
  };
  setRoom(roomId, (list) => [...list, item]);
  void runMedia(roomId, clientId);
}

/** 다시 보내기 */
function retry(roomId: string, clientId: string): void {
  const it = getItem(roomId, clientId);
  if (!it || it.status !== 'failed') return;
  if (it.kind === 'text') {
    removeItem(roomId, clientId);
    sendText(roomId, it.sender, it.text ?? '', clientId);
    return;
  }
  void runMedia(roomId, clientId);
}

/** 지우기 — 이미 올라간 파일도 지운다 (실패해도 무시). 지운 항목을 돌려준다 (함께 쓴 글을 입력창으로 되돌릴 때) */
function discard(roomId: string, clientId: string): ChatOutboxItem | undefined {
  const it = getItem(roomId, clientId);
  if (!it) return undefined;
  removeItem(roomId, clientId);
  it.entries.forEach((e) => {
    const paths = [e.result?.path, e.result?.thumbPath].filter((p): p is string => !!p);
    paths.forEach((p) => {
      deleteObject(storageRef(storage, p)).catch(() => {});
    });
  });
  return it;
}

export const chatOutbox = { sendText, sendMedia, retry, discard };

/** 이 방의 보낼 편지함 (보내는 중 · 실패) */
export function useChatOutbox(roomId: string): ChatOutboxItem[] {
  return useSyncExternalStore(
    subscribe,
    () => byRoom.get(roomId) ?? EMPTY,
    () => byRoom.get(roomId) ?? EMPTY,
  );
}
