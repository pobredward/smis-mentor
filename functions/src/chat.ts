/**
 * 채팅 — 메시지가 저장되면 (Firestore 트리거, 서울 리전)
 *  1) 방의 마지막 메시지 · 시각 · 메시지 수
 *  2) 받는 사람의 안 읽은 수 +1 (chatUserState/{uid}.unread.{roomId}) — 차단한 사람의 메시지는 세지 않는다
 *  3) 푸시 — 앱(Expo) + 웹 브라우저(FCM). 알림 설정 '채팅'을 껐거나, 그 방 알림을 껐거나, 보낸 사람을 차단했으면 보내지 않는다
 *     · @멘션(나 · @모두)과 공지 등록은 방 알림을 꺼 둬도 보낸다 (제목도 따로)
 *     · 조용히 보내기(silent)는 소리·진동 없이 (Android 'chat-silent' 채널 · 웹 silent)
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
const GROUP_LABEL: Record<string, string> = {
  spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter', junior: 'Junior', middle: 'Middle', senior: 'Senior',
  common: 'Common', manager: '운영진', short1: '단기 1', short2: '단기 2', short3: '단기 3', short4: '단기 4',
};
const ROOM_LABEL: Record<string, Record<Lang, string>> = {
  camp_all: { ko: '전체방', en: 'Everyone' },
  camp_mentor: { ko: '멘토방', en: 'Mentors & Managers' },
  camp_mentor_only: { ko: '멘토끼리', en: 'Mentors Only' },
  camp_foreign: { ko: '원어민방', en: 'Native Teachers & Managers' },
  camp_foreign_only: { ko: '원어민끼리', en: 'Native Teachers Only' },
  camp_manager: { ko: '매니저방', en: 'Managers' },
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
  mentions?: string[];
  mentionAll?: boolean;
  silent?: boolean;
  poll?: { question?: string } | null;
  systemType?: string;
  editedAt?: admin.firestore.Timestamp | null;
}
interface RoomDoc {
  type?: string;
  campCode?: string | null;
  groupKey?: string | null;
  memberIds?: string[];
  lastMessage?: { messageId?: string } | null;
  lastMessageAt?: admin.firestore.Timestamp | null;
  notice?: { messageId?: string } | null;
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
  const text = String(m.text ?? '').replace(/\s+/g, ' ').trim();
  const cut = (v: string) => (v.length > 180 ? `${v.slice(0, 179)}…` : v);
  if (m.kind === 'voice') return lang === 'en' ? 'Voice message' : '음성 메시지';
  if (m.kind === 'poll') return cut(`${lang === 'en' ? 'Poll' : '투표'}: ${String(m.poll?.question ?? '')}`);
  if (m.kind === 'system' && m.systemType === 'notice') return cut(text || (lang === 'en' ? 'A notice was posted' : '공지가 등록되었어요'));
  const c = counts(m.media);
  let media = '';
  if (c.images && c.videos) media = lang === 'en' ? `${c.images} photo(s) · ${c.videos} video(s)` : `사진 ${c.images}장 · 동영상 ${c.videos}개`;
  else if (c.images) media = lang === 'en' ? `${c.images} photo(s)` : `사진 ${c.images}장`;
  else if (c.videos) media = c.videos === 1 ? (lang === 'en' ? 'Video' : '동영상') : lang === 'en' ? `${c.videos} videos` : `동영상 ${c.videos}개`;
  return cut(text && media ? `${media} · ${text}` : text || media);
}

function roomTitle(room: RoomDoc, lang: Lang): string {
  const label = room.type === 'camp_group'
    ? (lang === 'en' ? `${GROUP_LABEL[String(room.groupKey)] ?? room.groupKey ?? ''} Group` : `${GROUP_LABEL[String(room.groupKey)] ?? room.groupKey ?? ''}방`)
    : ROOM_LABEL[String(room.type)]?.[lang] ?? '';
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
    const c = m.kind === 'voice' ? { images: 0, videos: 0 } : counts(m.media);
    const last: Record<string, unknown> = {
      messageId,
      kind: m.kind ?? 'text',
      text: String(m.kind === 'poll' ? m.poll?.question ?? '' : m.text ?? '').slice(0, 200),
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
    const webByLang = new Map<string, { tokens: string[]; owners: string[]; title: string; body: string; silent: boolean }>();
    for (const uid of counted) {
      const u = users.get(uid);
      const s = states.get(uid) ?? {};
      if (!u || !STAFF.includes(String(u.role)) || ['inactive', 'deleted', 'temp'].includes(String(u.status ?? 'active'))) continue;
      const ns = u.notificationSettings ?? {};
      // @멘션 · 공지 등록은 방 알림을 꺼 둬도 온다 (전체 알림 · '채팅' 알림을 껐으면 안 온다)
      const mentioned = !!m.mentionAll || (m.mentions ?? []).includes(uid);
      const isNotice = m.kind === 'system' && m.systemType === 'notice';
      if (ns.generalNotifications === false || ns.chat === false || (s.muted?.[roomId] && !mentioned && !isNotice)) continue;
      const lang = langOf(u);
      const body0 = preview(m, lang);
      const isDm = room.type === 'dm';
      const rt = isDm ? String(m.senderName ?? '') : roomTitle(room, lang);
      const sender = String(m.senderName ?? '');
      let title = rt;
      let body = isDm ? body0 : `${sender}: ${body0}`;
      if (isNotice) {
        title = `${lang === 'en' ? '[Notice]' : '[공지]'} ${roomTitle(room, lang) || sender}`;
        body = body0;
      } else if (mentioned) {
        title = m.mentionAll
          ? (lang === 'en' ? `${sender} mentioned everyone` : `${sender}님이 모두를 언급했어요`)
          : (lang === 'en' ? `${sender} mentioned you` : `${sender}님이 회원님을 언급했어요`);
        body = isDm ? body0 : `${rt} · ${body0}`;
      }
      const silent = !!m.silent && !isNotice;
      const unreadSum = Object.entries(s.unread ?? {}).reduce((a, [, v]) => a + (Number(v) > 0 ? Number(v) : 0), 0);
      const badge = unreadSum + 1;
      Object.keys(u.pushTokens ?? {}).filter((tk) => Expo.isExpoPushToken(tk)).forEach((tk) => {
        expoMessages.push({
          to: tk, title, body, badge, priority: 'high',
          // 조용히 보내기 — 소리 없이 (Android 는 앱이 만든 'chat-silent' 채널: 소리·진동 없음)
          ...(silent ? { channelId: 'chat-silent' } : { sound: 'default', channelId: 'default' }),
          data: { type: 'chat', roomId, messageId, ...(mentioned ? { mention: true } : {}), ...(isNotice ? { notice: true } : {}) },
        });
        expoOwner.push(uid);
      });
      const web = Object.keys(u.webPushTokens ?? {});
      if (web.length) {
        const key = `${title}\u0000${body}\u0000${silent ? 1 : 0}`;
        const g = webByLang.get(key) ?? { tokens: [], owners: [], title, body, silent };
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
            notification: { icon: `${SITE}/android-icon-192x192.png`, tag: `chat-${roomId}`, renotify: !g.silent, silent: g.silent },
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
    if (!before || !after) return;
    const { roomId, messageId } = event.params as { roomId: string; messageId: string };
    // 글을 고쳤으면 — 마지막 메시지였다면 방 미리보기도, 방 공지였다면 공지 글도 고친 글로
    if (!after.deleted && after.editedAt && String(before.text ?? '') !== String(after.text ?? '')) {
      const ref = fdb().collection('chatRooms').doc(roomId);
      await fdb().runTransaction(async (tx) => {
        const room = (await tx.get(ref)).data() as RoomDoc | undefined;
        const patch: Record<string, unknown> = {};
        if (room?.lastMessage?.messageId === messageId) patch['lastMessage.text'] = String(after.text ?? '').slice(0, 200);
        if (room?.notice?.messageId === messageId) patch['notice.text'] = String(after.text ?? '').slice(0, 500); // shared CHAT_LIMITS.noticeTextMax
        if (Object.keys(patch).length) tx.update(ref, patch);
      });
      return;
    }
    if (before.deleted || !after.deleted) return;
    const bucket = admin.storage().bucket(BUCKET);
    // 보낸 사람 폴더(chat/{roomId}/{senderId}/…)의 파일만 — media.path 는 클라이언트가 쓴 값이라,
    // 같은 방 다른 사람 파일 경로를 넣고 지우면 Storage 규칙(올린 본인만 삭제)을 넘어 남의 사진이 지워졌다.
    const senderId = String(before.senderId ?? '');
    const prefix = `chat/${roomId}/${senderId}/`;
    const paths = senderId ? (before.media ?? []).flatMap((x) => [x.path, x.thumbPath]).filter((p): p is string => !!p && p.startsWith(prefix)) : [];
    await Promise.all(paths.map((p) => bucket.file(p).delete({ ignoreNotFound: true }).catch((e) => console.warn('채팅 파일 삭제 실패', p, e))));
    const roomRef = fdb().collection('chatRooms').doc(roomId);
    // 이 메시지를 공지로 올린 '공지 등록' 알림 메시지들 (글을 복사해 두므로 함께 지운다)
    const noticeLogs = roomRef.collection('messages').where('noticeOf', '==', messageId);
    await fdb().runTransaction(async (tx) => {
      const [snap, logs] = await Promise.all([tx.get(roomRef), tx.get(noticeLogs)]);
      const room = snap.data() as RoomDoc | undefined;
      if (!room) return;
      const patch: Record<string, unknown> = {};
      if (room.lastMessage?.messageId === messageId) {
        Object.assign(patch, {
          'lastMessage.deleted': true,
          'lastMessage.text': '',
          'lastMessage.imageCount': admin.firestore.FieldValue.delete(),
          'lastMessage.videoCount': admin.firestore.FieldValue.delete(),
        });
      }
      // 지운 메시지가 방 공지였으면 공지를 내린다 — 그대로 두면 공지 띠(notice.text)에 지운 글이 계속 보였다
      if (room.notice?.messageId === messageId) patch.notice = null;
      logs.docs.forEach((d) => { if (d.data().text) tx.update(d.ref, { text: '' }); });
      if (room.lastMessage?.messageId && logs.docs.some((d) => d.id === room.lastMessage?.messageId)) patch['lastMessage.text'] = '';
      if (Object.keys(patch).length) tx.update(roomRef, patch);
    });
    // 지운 메시지에 남은 내용도 비운다 — 투표 질문·항목·표, 공감, 확인, 답장 인용 (규칙상 보낸 사람은 글·사진만 비울 수 있다)
    const msgRef = roomRef.collection('messages').doc(messageId);
    const FVd = admin.firestore.FieldValue.delete();
    await msgRef.update({ poll: FVd, pollVotes: FVd, pollClosed: FVd, reactions: FVd, acks: FVd, replyTo: FVd, mentions: FVd, mentionAll: FVd })
      .catch((e) => console.warn('지운 메시지 정리 실패', messageId, e));
    // 이 메시지를 인용한 답장들 — 인용 글·작은 그림을 지운다 (화면에는 '삭제된 메시지입니다')
    const quoting = await roomRef.collection('messages').where('replyTo.id', '==', messageId).get();
    await Promise.all(quoting.docs.map((d) => d.ref.update({ 'replyTo.text': '', 'replyTo.thumbUrl': FVd, 'replyTo.deleted': true })
      .catch((e) => console.warn('인용 정리 실패', d.id, e))));
  },
);
