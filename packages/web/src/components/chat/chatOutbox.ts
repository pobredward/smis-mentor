/**
 * 보내는 중인 사진·동영상 묶음 (web) — 방을 옮겨도 올리기가 이어지도록 화면 밖(모듈)에 둔다.
 *
 * 순서: newChatMessageId → 파일마다 (일반 화질로 만들기 →) uploadChatFile(본 파일 + 작은 그림)
 *       → sendChatMessage({ id, media }) → 글도 있었으면 글을 따로 한 메시지로.
 * sendChatMessage 를 부르면 Firestore 가 바로 '보내는 중' 메시지를 목록에 넣으므로, 그 메시지가 보이면 여기서 뺀다.
 * 글만 보내다 실패한 것(규칙 거절 등)도 여기 두고 [다시 보내기][지우기]를 보여 준다.
 */
import { useSyncExternalStore } from 'react';
import toast from 'react-hot-toast';
import { deleteObject, ref as storageRef } from 'firebase/storage';
import {
  CHAT_LIMITS,
  L,
  chatMediaPath,
  logger,
  newChatClientId,
  newChatMessageId,
  sendChatMessage,
  uploadChatFile,
  type ChatMediaItem,
} from '@smis-mentor/shared';
import { db, storage } from '@/lib/firebase';
import { ChatMediaError, prepareChatImage, prepareChatVideo, type PreparedChatMedia } from '@/lib/chatMedia';
import type { ChatOutgoing, ChatTrayItem } from './chatTypes';

interface Entry extends ChatOutgoing {
  uid: string;
  senderName: string;
  files: ChatTrayItem[];
  original: boolean;
  /** 이번 시도에서 올린 Storage 경로 (지우기·다시 보내기 때 정리) */
  uploaded: string[];
}

let entries: Entry[] = [];
let views: ChatOutgoing[] = [];
const listeners = new Set<() => void>();
const byRoomCache = new Map<string, { src: ChatOutgoing[]; out: ChatOutgoing[] }>();

function publish() {
  views = entries.map(({ uid: _u, senderName: _s, files: _f, original: _o, uploaded: _p, ...v }) => ({ ...v, items: [...v.items] }));
  byRoomCache.clear();
  listeners.forEach((l) => l());
}

let publishTimer: ReturnType<typeof setTimeout> | null = null;
/** 진행률은 자주 바뀌므로 0.1초에 한 번만 화면에 알린다 */
function publishSoon() {
  if (publishTimer) return;
  publishTimer = setTimeout(() => {
    publishTimer = null;
    publish();
  }, 100);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function roomView(roomId: string): ChatOutgoing[] {
  const cached = byRoomCache.get(roomId);
  if (cached && cached.src === views) return cached.out;
  const out = views.filter((v) => v.roomId === roomId);
  byRoomCache.set(roomId, { src: views, out });
  return out;
}

const EMPTY: ChatOutgoing[] = [];

/** 이 방의 보내는 중 메시지 */
export function useChatOutbox(roomId: string): ChatOutgoing[] {
  return useSyncExternalStore(subscribe, () => roomView(roomId), () => EMPTY);
}

/** 올리는 중인 파일이 있는가 (창을 닫기 전에 묻기) */
export const hasActiveChatUploads = () => entries.some((e) => e.status === 'uploading');

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (!hasActiveChatUploads()) return;
    e.preventDefault();
    // 예전 브라우저는 returnValue 가 있어야 묻는다
    e.returnValue = '';
  });
}

function revokeItems(e: Entry) {
  e.files.forEach((f) => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
}

function cleanupUploads(paths: string[]) {
  paths.forEach((p) => { deleteObject(storageRef(storage, p)).catch(() => undefined); });
}

function skippedToast(err: unknown, f: ChatTrayItem) {
  if (err instanceof ChatMediaError && err.code === 'tooLarge') {
    toast.error(f.kind === 'video'
      ? L('chat.videoTooLarge', { max: Math.round(CHAT_LIMITS.videoMaxBytes / 1024 / 1024) })
      : L('chat.imageTooLarge', { max: Math.round(CHAT_LIMITS.imageMaxBytes / 1024 / 1024) }));
  } else {
    toast.error(L('chat.webImageDecodeFailed', { name: f.file.name }));
  }
}

/** n 개씩 동시에 — 하나가 실패해도 나머지는 끝까지 돌리고, 첫 오류를 던진다 */
async function pool<T>(list: T[], n: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  let firstError: unknown = null;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      try {
        await fn(list[i], i);
      } catch (e) {
        if (firstError == null) firstError = e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, worker));
  if (firstError != null) throw firstError;
}

function sendText(roomId: string, uid: string, senderName: string, text: string, clientId = newChatClientId()) {
  sendChatMessage(db, roomId, { senderId: uid, senderName, text, clientId }).catch((e) => {
    logger.warn('채팅 글 보내기 실패:', e);
    toast.error(L('chat.sendFailed'));
    entries = [...entries, {
      clientId, roomId, kind: 'text', text, items: [], status: 'failed', progress: 0, done: 0, createdAt: Date.now(),
      uid, senderName, files: [], original: false, uploaded: [],
    }];
    publish();
  });
}

async function runMedia(e: Entry) {
  e.status = 'uploading';
  e.progress = 0;
  e.done = 0;
  e.uploaded = [];
  const messageId = newChatMessageId(db, e.roomId);
  e.messageId = messageId;
  publish();

  const weights = e.files.map((f) => Math.max(1, f.file.size));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const parts = e.files.map(() => 0);
  const setPart = (i: number, p: number) => {
    parts[i] = Math.max(0, Math.min(1, p));
    e.progress = parts.reduce((s, v, k) => s + v * weights[k], 0) / totalWeight;
    publishSoon();
  };
  const media: Array<ChatMediaItem | null> = e.files.map(() => null);

  try {
    await pool(e.files, 3, async (f, i) => {
      let prepared: PreparedChatMedia;
      try {
        prepared = f.kind === 'image'
          ? await prepareChatImage(f.file, e.original, f.imageProbe)
          : await prepareChatVideo(f.file, e.original, f.videoProbe);
      } catch (err) {
        // 못 여는 사진 · 너무 큰 파일은 빼고 나머지는 보낸다
        skippedToast(err, f);
        setPart(i, 1);
        return;
      }
      const path = chatMediaPath(e.roomId, e.uid, messageId, i, prepared.ext);
      const thumbPath = prepared.thumb ? chatMediaPath(e.roomId, e.uid, messageId, i, 'jpg', true) : undefined;
      const total = prepared.body.size + (prepared.thumb?.size ?? 0) || 1;
      let sentMain = 0;
      let sentThumb = 0;
      const url = await uploadChatFile(storage, path, prepared.body, prepared.contentType, (sent) => {
        sentMain = sent;
        setPart(i, (sentMain + sentThumb) / total);
      });
      e.uploaded.push(path);
      let thumbUrl: string | undefined;
      if (prepared.thumb && thumbPath) {
        thumbUrl = await uploadChatFile(storage, thumbPath, prepared.thumb, 'image/jpeg', (sent) => {
          sentThumb = sent;
          setPart(i, (sentMain + sentThumb) / total);
        });
        e.uploaded.push(thumbPath);
      }
      media[i] = {
        kind: prepared.kind,
        url,
        path,
        thumbUrl,
        thumbPath: thumbUrl ? thumbPath : undefined,
        w: prepared.w || undefined,
        h: prepared.h || undefined,
        size: prepared.body.size,
        durationMs: prepared.durationMs,
        contentType: prepared.contentType,
        original: prepared.original || undefined,
      };
      e.done += 1;
      setPart(i, 1);
    });
  } catch (err) {
    logger.warn('채팅 사진·동영상 올리기 실패:', err);
    if (!entries.includes(e)) {
      // 그 사이 지움 — 뒤늦게 올라간 파일도 정리
      cleanupUploads(e.uploaded);
      return;
    }
    e.status = 'failed';
    publish();
    toast.error(L('chat.sendFailed'));
    return;
  }
  if (!entries.includes(e)) {
    cleanupUploads(e.uploaded);
    return;
  }

  const list = media.filter((m): m is ChatMediaItem => !!m);
  if (!list.length) {
    // 보낼 파일이 하나도 남지 않음 — 글만 있었으면 글은 보낸다
    entries = entries.filter((x) => x !== e);
    revokeItems(e);
    publish();
    if (e.text) sendText(e.roomId, e.uid, e.senderName, e.text);
    return;
  }

  e.status = 'sent';
  e.progress = 1;
  publish();
  sendChatMessage(db, e.roomId, { id: messageId, senderId: e.uid, senderName: e.senderName, media: list, clientId: e.clientId }).catch((err) => {
    logger.warn('채팅 사진 메시지 쓰기 실패:', err);
    if (!entries.includes(e)) return;
    e.status = 'failed';
    publish();
    toast.error(L('chat.sendFailed'));
  });
  // 카톡처럼 — 묶음 다음에 글을 따로 (같은 순서로 쓰이므로 글이 뒤에 온다)
  if (e.text) {
    sendText(e.roomId, e.uid, e.senderName, e.text);
    e.text = '';
  }
}

/** 사진·동영상 묶음 보내기 (글이 있으면 묶음 뒤에 따로) */
export function queueChatMedia(args: { roomId: string; uid: string; senderName: string; files: ChatTrayItem[]; original: boolean; text?: string }) {
  if (!args.files.length) return;
  const e: Entry = {
    clientId: newChatClientId(),
    roomId: args.roomId,
    kind: 'media',
    text: args.text ?? '',
    items: args.files.map((f) => ({ kind: f.kind, previewUrl: f.previewUrl, w: f.w, h: f.h, durationMs: f.durationMs })),
    status: 'uploading',
    progress: 0,
    done: 0,
    createdAt: Date.now(),
    uid: args.uid,
    senderName: args.senderName,
    files: args.files,
    original: args.original,
    uploaded: [],
  };
  entries = [...entries, e];
  void runMedia(e);
}

/** 글 보내기 — 보통은 Firestore 가 바로 '보내는 중' 메시지를 보여 주고, 실패할 때만 여기 남는다 */
export function sendChatText(args: { roomId: string; uid: string; senderName: string; text: string }) {
  if (!args.text) return;
  sendText(args.roomId, args.uid, args.senderName, args.text);
}

/** 다시 보내기 */
export function retryChatOutgoing(clientId: string) {
  const e = entries.find((x) => x.clientId === clientId);
  if (!e || e.status !== 'failed') return;
  if (e.kind === 'text') {
    entries = entries.filter((x) => x !== e);
    publish();
    sendText(e.roomId, e.uid, e.senderName, e.text);
    return;
  }
  // 올린 파일 경로는 덮어쓸 수 없으므로(규칙) 새 메시지 id 로 처음부터
  cleanupUploads(e.uploaded);
  void runMedia(e);
}

/** 지우기 — 함께 보내려던 글을 돌려준다 (입력창에 되돌리기) */
export function discardChatOutgoing(clientId: string): string {
  const e = entries.find((x) => x.clientId === clientId);
  if (!e) return '';
  entries = entries.filter((x) => x !== e);
  if (e.status !== 'sent') cleanupUploads(e.uploaded);
  revokeItems(e);
  publish();
  return e.text;
}

/** 서버 메시지 목록에 나타난 묶음은 뺀다 */
export function settleChatOutbox(roomId: string, messageIds: ReadonlySet<string>) {
  const done = entries.filter((e) => e.roomId === roomId && e.status === 'sent' && e.messageId && messageIds.has(e.messageId));
  if (!done.length) return;
  entries = entries.filter((e) => !done.includes(e));
  // 서버 사진이 뜰 시간을 조금 두고 미리보기 주소를 푼다
  setTimeout(() => done.forEach(revokeItems), 5_000);
  publish();
}
