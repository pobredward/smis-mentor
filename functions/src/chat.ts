/**
 * 채팅 — 메시지가 저장되면 (Firestore 트리거, 서울 리전)
 *  1) 방의 마지막 메시지 · 시각 · 메시지 수
 *  2) 받는 사람의 안 읽은 수 +1 (chatUserState/{uid}.unread.{roomId}) — 차단한 사람의 메시지는 세지 않는다
 *  3) 푸시 — 앱(Expo) + 웹 브라우저(FCM). 알림 설정 '채팅'을 껐거나, 그 방 알림을 껐거나, 보낸 사람을 차단했으면 보내지 않는다
 * 메시지가 '모두에게서 삭제'되면 사진·동영상 파일을 지우고, 마지막 메시지였으면 방 미리보기도 바꾼다.
 *
 * 방 이름·미리보기 문구는 packages/shared/src/utils/chat.ts · i18n chat.* 와 같게 유지한다
 * (functions 는 shared 패키지를 쓰지 않는다).
 */
import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

const REGION = 'asia-northeast3';
const BUCKET = 'smis-mentor.firebasestorage.app';
const SITE = 'https://smis-mentor.com';
const STAFF = ['admin', 'mentor', 'foreign'];

type Lang = 'ko' | 'en';
const ROOM_LABEL: Record<string, Record<Lang, string>> = {
  camp_all: { ko: '전체방', en: 'Everyone' },
  camp_mentor: { ko: '멘토방', en: 'Mentors & Managers' },
  camp_mentor_only: { ko: '멘토끼리', en: 'Mentors Only' },
  camp_foreign: { ko: '원어민방', en: 'Native Teachers & Managers' },
  camp_foreign_only: { ko: '원어민끼리', en: 'Native Teachers Only' },
};

interface MediaItem { kind?: string; path?: string; thumbPath?: string }
interface MessageDoc {
  senderId?: string;
  senderName?: string;
  kind?: string;
  text?: string;
  media?: MediaItem[];
  createdAt?: admin.firestore.Timestamp;
  deleted?: boolean;
}
interface RoomDoc {
  type?: string;
  campCode?: string | null;
  memberIds?: string[];
  lastMessage?: { messageId?: string } | null;
  lastMessageAt?: admin.firestore.Timestamp | null;
}
interface UserDoc {
  name?: string;
  role?: string;
  status?: string;
  locale?: string;
  pushTokens?: Record<string, unknown>;
  webPushTokens?: Record<string, unknown>;
  notificationSettings?: Record<string, boolean | undefined>;
}
interface StateDoc {
  unread?: Record<string, number>;
  muted?: Record<string, boolean>;
  blocked?: Record<string, boolean>;
}

let expoClient: Expo | null = null;
const expo = () => (expoClient ??= new Expo());
const fdb = () => admin.firestore();

const langOf = (u: UserDoc): Lang =>
  u.locale === 'en' || u.locale === 'ko' ? u.locale : u.role === 'foreign' || u.role === 'foreign_temp' ? 'en' : 'ko';

function counts(media?: MediaItem[]) {
  const list = media ?? [];
  return { images: list.filter((m) => m.kind !== 'video').length, videos: list.filter((m) => m.kind === 'video').length };
}

function preview(m: MessageDoc, lang: Lang): string {
  const c = counts(m.media);
  const text = String(m.text ?? '').replace(/\s+/g, ' ').trim();
  let media = '';
  if (c.images && c.videos) media = lang === 'en' ? `${c.images} photo(s) · ${c.videos} video(s)` : `사진 ${c.images}장 · 동영상 ${c.videos}개`;
  else if (c.images) media = lang === 'en' ? `${c.images} photo(s)` : `사진 ${c.images}장`;
  else if (c.videos) media = c.videos === 1 ? (lang === 'en' ? 'Video' : '동영상') : lang === 'en' ? `${c.videos} videos` : `동영상 ${c.videos}개`;
  const out = text && media ? `${media} · ${text}` : text || media;
  return out.length > 180 ? `${out.slice(0, 179)}…` : out;
}

function roomTitle(room: RoomDoc, lang: Lang): string {
  const label = ROOM_LABEL[String(room.type)]?.[lang] ?? '';
  return [room.campCode, label].filter(Boolean).join(' ');
}

// 받는 사람 문서는 잠깐(60초) 기억해 둔다 — 대화가 이어질 때 같은 문서를 계속 읽지 않게
const userCache = new Map<string, { at: number; data: UserDoc | null }>();
async function loadUsers(uids: string[]): Promise<Map<string, UserDoc | null>> {
  const now = Date.now();
  const out = new Map<string, UserDoc | null>();
  const miss: string[] = [];
  uids.forEach((uid) => {
    const c = userCache.get(uid);
    if (c && now - c.at < 60_000) out.set(uid, c.data);
    else miss.push(uid);
  });
  for (let i = 0; i < miss.length; i += 100) {
    const refs = miss.slice(i, i + 100).map((uid) => fdb().collection('users').doc(uid));
    const snaps = refs.length ? await fdb().getAll(...refs) : [];
    snaps.forEach((s) => {
      const data = s.exists ? (s.data() as UserDoc) : null;
      userCache.set(s.id, { at: now, data });
      out.set(s.id, data);
    });
  }
  if (userCache.size > 2000) userCache.clear();
  return out;
}

async function loadStates(uids: string[]): Promise<Map<string, StateDoc>> {
  const out = new Map<string, StateDoc>();
  for (let i = 0; i < uids.length; i += 100) {
    const refs = uids.slice(i, i + 100).map((uid) => fdb().collection('chatUserState').doc(uid));
    const snaps = refs.length ? await fdb().getAll(...refs) : [];
    snaps.forEach((s) => out.set(s.id, (s.data() as StateDoc) ?? {}));
  }
  return out;
}

async function removeExpoToken(uid: string, token: string) {
  try {
    await fdb().collection('users').doc(uid).update(new admin.firestore.FieldPath('pushTokens', token), admin.firestore.FieldValue.delete());
    userCache.delete(uid);
  } catch (e) {
    console.warn('채팅: 만료 토큰 삭제 실패', e);
  }
}
async function removeWebToken(uid: string, token: string) {
  try {
    await fdb().collection('users').doc(uid).update(new admin.firestore.FieldPath('webPushTokens', token), admin.firestore.FieldValue.delete());
    userCache.delete(uid);
  } catch (e) {
    console.warn('채팅: 만료 웹 토큰 삭제 실패', e);
  }
}

export const chatOnMessageCreated = onDocumentCreated(
  { document: 'chatRooms/{roomId}/messages/{messageId}', region: REGION, memory: '256MiB', timeoutSeconds: 60 },
  async (event) => {
    const m = event.data?.data() as MessageDoc | undefined;
    if (!m) return;
    const { roomId, messageId } = event.params as { roomId: string; messageId: string };
    const roomRef = fdb().collection('chatRooms').doc(roomId);
    const at = m.createdAt ?? admin.firestore.Timestamp.now();
    const c = counts(m.media);
    const last: Record<string, unknown> = {
      messageId,
      kind: m.kind ?? 'text',
      text: String(m.text ?? '').slice(0, 200),
      senderId: m.senderId ?? '',
      senderName: m.senderName ?? '',
    };
    if (c.images) last.imageCount = c.images;
    if (c.videos) last.videoCount = c.videos;

    // 1) 방 — 늦게 도착한 트리거가 더 최근 메시지를 덮지 않게
    //    메시지도 트랜잭션 안에서 다시 읽는다: 이 트리거가 늦게 돌아(콜드 스타트 등) 그사이 '모두에게서 삭제'되었고
    //    삭제 트리거가 먼저 끝났다면(그때는 이 메시지가 아직 미리보기가 아니라 아무것도 안 함) 지운 글이 미리보기에 남는다.
    let gone = false;
    const room = await fdb().runTransaction(async (tx) => {
      const [snap, msgSnap] = await Promise.all([tx.get(roomRef), event.data ? tx.get(event.data.ref) : Promise.resolve(null)]);
      if (!snap.exists) return null;
      gone = (msgSnap?.data() as MessageDoc | undefined)?.deleted === true;
      if (gone) {
        last.deleted = true;
        last.text = '';
        delete last.imageCount;
        delete last.videoCount;
      }
      const cur = snap.data() as RoomDoc;
      const curAt = cur.lastMessageAt?.toMillis?.() ?? 0;
      const patch: Record<string, unknown> = { messageCount: admin.firestore.FieldValue.increment(1) };
      if (curAt <= at.toMillis()) {
        patch.lastMessage = last;
        patch.lastMessageAt = at;
        patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      }
      tx.update(roomRef, patch);
      return cur;
    });
    if (!room) return;

    const senderId = String(m.senderId ?? '');
    const recipients = [...new Set(room.memberIds ?? [])].filter((uid) => uid && uid !== senderId);
    if (!recipients.length) return;
    const [users, states] = await Promise.all([loadUsers(recipients), loadStates(recipients)]);

    // 2) 안 읽은 수
    const counted = recipients.filter((uid) => !states.get(uid)?.blocked?.[senderId]);
    for (let i = 0; i < counted.length; i += 400) {
      const b = fdb().batch();
      counted.slice(i, i + 400).forEach((uid) => {
        b.set(fdb().collection('chatUserState').doc(uid), {
          unread: { [roomId]: admin.firestore.FieldValue.increment(1) },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      await b.commit();
    }

    // 3) 푸시 — 이미 지운 메시지는 보내지 않는다
    if (gone) return;
    const expoMessages: ExpoPushMessage[] = [];
    const expoOwner: string[] = [];
    const webByLang = new Map<string, { tokens: string[]; owners: string[]; title: string; body: string }>();
    for (const uid of counted) {
      const u = users.get(uid);
      const s = states.get(uid) ?? {};
      if (!u || !STAFF.includes(String(u.role)) || ['inactive', 'deleted', 'temp'].includes(String(u.status ?? 'active'))) continue;
      const ns = u.notificationSettings ?? {};
      if (ns.generalNotifications === false || ns.chat === false || s.muted?.[roomId]) continue;
      const lang = langOf(u);
      const body0 = preview(m, lang);
      const isDm = room.type === 'dm';
      const title = isDm ? String(m.senderName ?? '') : roomTitle(room, lang);
      const body = isDm ? body0 : `${m.senderName ?? ''}: ${body0}`;
      const unreadSum = Object.entries(s.unread ?? {}).reduce((a, [, v]) => a + (Number(v) > 0 ? Number(v) : 0), 0);
      const badge = unreadSum + 1;
      Object.keys(u.pushTokens ?? {}).filter((tk) => Expo.isExpoPushToken(tk)).forEach((tk) => {
        expoMessages.push({
          to: tk, title, body, sound: 'default', badge, priority: 'high', channelId: 'default',
          data: { type: 'chat', roomId, messageId },
        });
        expoOwner.push(uid);
      });
      const web = Object.keys(u.webPushTokens ?? {});
      if (web.length) {
        const key = `${title}\u0000${body}`;
        const g = webByLang.get(key) ?? { tokens: [], owners: [], title, body };
        web.forEach((tk) => { g.tokens.push(tk); g.owners.push(uid); });
        webByLang.set(key, g);
      }
    }

    const sends: Promise<unknown>[] = [];
    if (expoMessages.length) {
      sends.push((async () => {
        let idx = 0;
        for (const chunk of expo().chunkPushNotifications(expoMessages)) {
          const start = idx;
          idx += chunk.length;
          try {
            const tickets = await expo().sendPushNotificationsAsync(chunk);
            await Promise.all(tickets.map(async (tk, k) => {
              if (tk.status === 'error' && tk.details?.error === 'DeviceNotRegistered') {
                await removeExpoToken(expoOwner[start + k], String(chunk[k].to));
              }
            }));
          } catch (e) {
            console.error('채팅 푸시(앱) 실패', e);
          }
        }
      })());
    }
    for (const g of webByLang.values()) {
      for (let i = 0; i < g.tokens.length; i += 500) {
        const tokens = g.tokens.slice(i, i + 500);
        const owners = g.owners.slice(i, i + 500);
        sends.push(admin.messaging().sendEachForMulticast({
          tokens,
          notification: { title: g.title, body: g.body },
          data: { type: 'chat', roomId, messageId },
          webpush: {
            notification: { icon: `${SITE}/android-icon-192x192.png`, tag: `chat-${roomId}`, renotify: true },
            fcmOptions: { link: `${SITE}/chat?room=${encodeURIComponent(roomId)}` },
          },
        }).then(async (res) => {
          await Promise.all(res.responses.map(async (r, k) => {
            const code = r.error?.code ?? '';
            if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
              await removeWebToken(owners[k], tokens[k]);
            }
          }));
        }).catch((e) => console.error('채팅 푸시(웹) 실패', e)));
      }
    }
    await Promise.all(sends);
  },
);

export const chatOnMessageUpdated = onDocumentUpdated(
  { document: 'chatRooms/{roomId}/messages/{messageId}', region: REGION, memory: '256MiB' },
  async (event) => {
    const before = event.data?.before.data() as MessageDoc | undefined;
    const after = event.data?.after.data() as MessageDoc | undefined;
    if (!before || !after || before.deleted || !after.deleted) return;
    const { roomId, messageId } = event.params as { roomId: string; messageId: string };
    const bucket = admin.storage().bucket(BUCKET);
    // 보낸 사람 폴더(chat/{roomId}/{senderId}/…)의 파일만 — media.path 는 클라이언트가 쓴 값이라,
    // 같은 방 다른 사람 파일 경로를 넣고 지우면 Storage 규칙(올린 본인만 삭제)을 넘어 남의 사진이 지워졌다.
    const senderId = String(before.senderId ?? '');
    const prefix = `chat/${roomId}/${senderId}/`;
    const paths = senderId ? (before.media ?? []).flatMap((x) => [x.path, x.thumbPath]).filter((p): p is string => !!p && p.startsWith(prefix)) : [];
    await Promise.all(paths.map((p) => bucket.file(p).delete({ ignoreNotFound: true }).catch((e) => console.warn('채팅 파일 삭제 실패', p, e))));
    const roomRef = fdb().collection('chatRooms').doc(roomId);
    await fdb().runTransaction(async (tx) => {
      const snap = await tx.get(roomRef);
      const room = snap.data() as RoomDoc | undefined;
      if (room?.lastMessage?.messageId === messageId) {
        tx.update(roomRef, {
          'lastMessage.deleted': true,
          'lastMessage.text': '',
          'lastMessage.imageCount': admin.firestore.FieldValue.delete(),
          'lastMessage.videoCount': admin.firestore.FieldValue.delete(),
        });
      }
    });
  },
);
