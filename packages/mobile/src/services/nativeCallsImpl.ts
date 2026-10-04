/**
 * OS 통화 화면 — 진짜 전화처럼 잠금화면에서 받기 (iOS CallKit · Android ConnectionService)
 *
 * 걸려 오는 1:1 통화가 OS 에 닿는 길
 * - iOS: 서버가 VoIP 푸시 → AppDelegate(app.config.ts withSmisCallKit)가 JS 를 기다리지 않고 CallKit 수신 화면을 띄운다.
 *        앱이 열려 있으면 통화 구독(컨트롤러)도 reportIncoming 을 부르지만 CallKit 이 같은 uuid 를 걸러 준다.
 * - Android: 서버가 데이터만 담은 Expo 푸시 → expo-notifications 백그라운드 작업(이 파일의 CHAT_CALL_PUSH_TASK)이
 *        시스템 수신 화면(ConnectionService)을 띄운다. 통화 계정이 꺼져 있거나 전화 권한이 없으면 소리 나는 알림으로 대신한다.
 *
 * OS 화면에서 받기 · 거절 · 끊기 · 음소거 → 앱 통화 연결(services/chatCalls.ts 의 컨트롤러)로.
 * 컨트롤러가 아직 없으면(앱이 꺼져 있다 깨어남) 로그인이 돌아오기를 기다려 만들고 그때 처리한다.
 * 받지 않은 채 상대가 끊거나 · 내 다른 기기에서 받거나 · 시간이 지나면 통화 문서를 보고 OS 화면을 내린다.
 *
 * index.ts 가 앱을 띄우기 전에 불러온다 (OS 이벤트 · 백그라운드 작업을 일찍 잡아야 한다).
 */
import { Alert, AppState, NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { deleteField, doc, getDoc, setDoc } from 'firebase/firestore';
import {
  CHAT_CALL_LIMITS,
  L,
  logger,
  subscribeChatCall,
  type CallController,
  type ChatCallDoc,
  type ChatCallMedia,
  type ChatCallState,
} from '@smis-mentor/shared';
import type RNCallKeepType from 'react-native-callkeep';
import { auth, db } from '../config/firebase';
import { mobileAuthenticatedPost } from './apiClient';
import { chatCallsReal, currentChatCall, ensureChatCall } from './chatCalls';
import { setNativeCalls, type NativeCalls } from './nativeCalls';

type CallKeep = typeof RNCallKeepType;

/** Android 데이터 푸시(type: 'chat-call') 를 받는 백그라운드 작업 */
export const CHAT_CALL_PUSH_TASK = 'smis-chat-call-push';
const CALL_CHANNEL = 'chat-call';
const VOIP_SAVED_KEY = 'smis.voip.saved';
const PHONE_ACCOUNT_ASKED_KEY = 'smis.callkeep.asked.v1';

// callkeep 끝난 이유 (CONSTANTS.END_CALL_REASONS — Android 는 MISSED 6, 다른 기기 거절은 REMOTE_ENDED)
const END = {
  failed: 1,
  remote: 2,
  unanswered: 3,
  elsewhere: 4,
  missed: Platform.OS === 'ios' ? 3 : 6,
} as const;
type EndWhy = keyof typeof END;

// ── 네이티브 모듈 (없는 빌드 — Expo Go · 예전 개발 빌드 — 에서는 아무것도 안 한다) ──────────────

let ckCache: CallKeep | null | undefined;
function callKeep(): CallKeep | null {
  if (ckCache !== undefined) return ckCache;
  ckCache = null;
  if (!NativeModules.RNCallKeep) return null;
  try {
    // 네이티브 모듈이 있을 때만 불러온다 (없는 빌드에서 import 하면 NativeEventEmitter 가 바로 오류)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ckCache = (require('react-native-callkeep') as { default: CallKeep }).default;
  } catch (e) {
    logger.warn('callkeep 을 불러오지 못했습니다:', e);
  }
  return ckCache;
}

type VoipPush = {
  addEventListener(type: 'register', h: (token: string) => void): void;
  addEventListener(type: 'didLoadWithEvents', h: (events: Array<{ name?: string; data?: unknown }> | null) => void): void;
};
function voipPush(): VoipPush | null {
  if (Platform.OS !== 'ios' || !NativeModules.RNVoipPushNotificationManager) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('react-native-voip-push-notification') as { default: VoipPush }).default;
  } catch (e) {
    logger.warn('voip-push 를 불러오지 못했습니다:', e);
    return null;
  }
}

// ── OS 화면에 띄운 통화 ───────────────────────────────────────────────

type Entry = {
  uuid: string;
  callId?: string;
  roomId?: string;
  media?: ChatCallMedia;
  createdAt?: number;
  /** 걸려 온 통화 (false 면 내가 건 통화 — iOS 만) */
  incoming: boolean;
  /** 받았다 (OS 화면 · 앱 어느 쪽이든) */
  answered: boolean;
  ended: boolean;
  /** Android 대체 알림을 띄웠다 */
  notified?: boolean;
  unwatch?: () => void;
  timer?: ReturnType<typeof setTimeout>;
  /** 끝나기를 기다리는 쪽 (Android 백그라운드 작업 — 끝나면 화면 없는 JS 가 정리된다) */
  waiters?: Array<() => void>;
};
const entries = new Map<string, Entry>();
const byCall = new Map<string, string>();
/** 컨트롤러가 아직 없어 미뤄 둔 받기 (callId → media) */
const pendingAccept = new Map<string, ChatCallMedia | undefined>();
/** callId 를 아직 모르는 uuid 에 온 받기 · 거절 */
const pendingByUuid = new Map<string, 'accept' | 'end'>();

const norm = (u: unknown) => String(u ?? '').trim().toLowerCase();
const appActive = () => AppState.currentState === 'active';
const controller = (): CallController | null => currentChatCall()?.controller ?? null;

function track(uuid: string, patch: Partial<Omit<Entry, 'uuid'>>): Entry {
  const e = entries.get(uuid) ?? { uuid, incoming: true, answered: false, ended: false };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) (e as Record<string, unknown>)[k] = v;
  entries.set(uuid, e);
  if (e.callId) byCall.set(e.callId, uuid);
  // callId 를 몰라 미뤄 둔 OS 동작
  const act = pendingByUuid.get(uuid);
  if (act && e.callId) {
    pendingByUuid.delete(uuid);
    if (act === 'accept') onAnswer(uuid);
    else onEnd(uuid);
  }
  return e;
}

/** 끝났다고 표시 — 구독 · 타이머 정리, 기다리던 쪽 깨우기 */
function markEnded(e: Entry) {
  e.ended = true;
  cleanup(e);
  const ws = e.waiters ?? [];
  e.waiters = undefined;
  ws.forEach((w) => w());
}

/** 통화가 끝날 때까지 (받았으면 통화가 끝날 때까지) — 길어도 maxMs */
function untilEnded(e: Entry, maxMs: number): Promise<void> {
  if (e.ended) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, maxMs);
    (e.waiters ??= []).push(() => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** OS 화면을 내린다 (이미 내렸으면 그대로) */
function endNative(uuid: string, why: EndWhy) {
  const e = entries.get(uuid);
  if (!e || e.ended) return;
  markEnded(e);
  if (e.notified && e.callId) void Notifications.dismissNotificationAsync(`chat-call-${e.callId}`).catch(() => undefined);
  try {
    callKeep()?.reportEndCallWithUUID(uuid, END[why]);
  } catch (err) {
    logger.warn('OS 통화 화면 내리기 실패:', err);
  }
}

function cleanup(e: Entry) {
  e.unwatch?.();
  e.unwatch = undefined;
  if (e.timer) clearTimeout(e.timer);
  e.timer = undefined;
  // 늦게 온 푸시가 같은 통화를 다시 띄우지 않게 잠시 기억한다
  setTimeout(() => {
    if (entries.get(e.uuid) === e && e.ended) {
      entries.delete(e.uuid);
      if (e.callId && byCall.get(e.callId) === e.uuid) byCall.delete(e.callId);
    }
  }, 3 * 60_000);
}

/** 받기 전까지 통화 문서를 본다 — 상대가 끊음 · 다른 기기에서 받음 · 시간 초과면 OS 화면을 내린다 */
function watchEntry(e: Entry) {
  if (e.ended || e.unwatch || e.timer || !e.callId) return;
  const callId = e.callId;
  const left = (e.createdAt ?? Date.now()) + CHAT_CALL_LIMITS.ringMs + 8_000 - Date.now();
  e.timer = setTimeout(() => {
    e.timer = undefined;
    if (!e.answered) endNative(e.uuid, 'unanswered');
  }, Math.max(5_000, left));
  void authUser(15_000).then((u) => {
    if (e.ended || e.unwatch) return;
    if (!u) {
      if (!e.answered) endNative(e.uuid, 'failed');
      return;
    }
    e.unwatch = subscribeChatCall(db, callId, (c) => onCallDoc(e, c), (err) => logger.warn('통화 문서 구독 오류:', err));
  });
}

function onCallDoc(e: Entry, c: ChatCallDoc | null) {
  if (e.ended) return;
  if (!c) return endNative(e.uuid, e.answered ? 'remote' : 'missed');
  if (c.status === 'ringing') return;
  if (c.status === 'ended') return endNative(e.uuid, e.answered ? 'remote' : 'missed');
  // active — 받은 뒤라면 끝날 때까지 본다 (컨트롤러가 없을 때 대비). 받기 전인데 active 면 내 다른 기기에서 받았다
  if (!e.answered && e.incoming) endNative(e.uuid, 'elsewhere');
}

// ── 로그인 · 컨트롤러 ────────────────────────────────────────────────

function authUser(timeoutMs: number): Promise<User | null> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    let done = false;
    let off: () => void = () => undefined;
    const finish = (u: User | null) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      setTimeout(() => off(), 0);
      resolve(u);
    };
    const t = setTimeout(() => finish(null), timeoutMs);
    off = onAuthStateChanged(auth, (u) => {
      if (u) finish(u);
    });
  });
}

let booting: Promise<void> | null = null;
/** 화면 없이 깨어났을 때 (잠금화면에서 받음) — 컨트롤러를 만든다. 화면이 곧 만들면 그쪽 것을 쓴다 */
function bootController(): Promise<void> {
  if (booting) return booting;
  booting = (async () => {
    const u = await authUser(15_000);
    if (!u) {
      for (const callId of pendingAccept.keys()) {
        const uuid = byCall.get(callId);
        if (uuid) endNative(uuid, 'failed');
      }
      pendingAccept.clear();
      return;
    }
    if (!controller()) await new Promise((r) => setTimeout(r, 1_200));
    if (!controller() && chatCallsReal()) {
      const snap = await getDoc(doc(db, 'users', u.uid)).catch(() => null);
      const data = (snap?.data() ?? {}) as { name?: unknown; profileImage?: unknown };
      const photo = typeof data.profileImage === 'string' && /^https?:\/\//.test(data.profileImage) ? data.profileImage : undefined;
      ensureChatCall({ uid: u.uid, name: String(data.name ?? u.displayName ?? ''), photo });
    }
    flushPending();
  })()
    .catch((e) => logger.warn('통화 연결 준비 실패:', e))
    .finally(() => {
      booting = null;
    });
  return booting;
}

function flushPending(c: CallController | null = controller()) {
  if (!c) return;
  for (const [callId, media] of [...pendingAccept]) {
    pendingAccept.delete(callId);
    void c.acceptById(callId, media);
  }
}

const post = (action: 'decline' | 'leave', callId: string) =>
  authUser(15_000).then((u) => {
    if (!u) return;
    return mobileAuthenticatedPost('/api/chat/call', { action, callId }).then(() => undefined);
  }).catch((e) => logger.warn(`통화 ${action} 실패:`, e));

// ── OS 화면 이벤트 ───────────────────────────────────────────────────

function onDisplayed(d: { callUUID?: string; payload?: unknown; error?: string; errorCode?: string }) {
  const uuid = norm(d.callUUID);
  if (!uuid) return;
  if (d.error && d.errorCode !== 'CallUUIDAlreadyExists') {
    // 방해 금지 · 차단 등으로 띄우지 못했다
    const e = entries.get(uuid);
    if (e && !e.ended) markEnded(e);
    return;
  }
  const p = (d.payload && typeof d.payload === 'object' ? d.payload : {}) as Record<string, unknown>;
  const createdAt = Number(p.createdAt);
  const e = track(uuid, {
    callId: typeof p.callId === 'string' ? p.callId : undefined,
    roomId: typeof p.roomId === 'string' ? p.roomId : undefined,
    media: p.media === 'video' || p.media === 'voice' ? p.media : undefined,
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : undefined,
    incoming: true,
  });
  if (!e.callId) {
    // 우리 통화가 아닌 VoIP 푸시 — iOS 가 요구해서 띄웠을 뿐이니 바로 내린다
    setTimeout(() => endNative(uuid, 'failed'), 300);
    return;
  }
  watchEntry(e);
}

function onAnswer(uuidRaw: unknown) {
  const uuid = norm(uuidRaw);
  const e = entries.get(uuid);
  if (!e?.callId) {
    pendingByUuid.set(uuid, 'accept');
    return;
  }
  if (e.ended || e.answered) return;
  e.answered = true;
  if (e.timer) clearTimeout(e.timer);
  e.timer = undefined;
  if (e.notified) void Notifications.dismissNotificationAsync(`chat-call-${e.callId}`).catch(() => undefined);
  // 잠금화면 · 다른 앱 위에서 받으면 카메라를 켤 수 없다 — 음성으로 받고, 앱을 열어 카메라를 켠다
  const media: ChatCallMedia | undefined = appActive() ? undefined : 'voice';
  const c = controller();
  if (c) void c.acceptById(e.callId, media);
  else {
    pendingAccept.set(e.callId, media);
    void bootController();
  }
  if (Platform.OS === 'android' && !appActive()) {
    try {
      callKeep()?.backToForeground();
    } catch {
      /* 앱을 앞으로 못 가져와도 통화는 이어진다 */
    }
    const callId = e.callId;
    setTimeout(() => {
      if (appActive() || e.ended) return;
      void Notifications.scheduleNotificationAsync({
        identifier: `chat-call-open-${callId}`,
        content: { title: L('chat.callVoice'), body: L('chat.callOpenToContinue'), data: { type: 'chat-call', roomId: e.roomId ?? '', callId } },
        trigger: null,
      }).catch(() => undefined);
    }, 2_500);
  }
}

function onEnd(uuidRaw: unknown) {
  const uuid = norm(uuidRaw);
  const e = entries.get(uuid);
  if (!e?.callId) {
    if (uuid) pendingByUuid.set(uuid, 'end');
    return;
  }
  if (e.ended) return;
  markEnded(e);
  const callId = e.callId;
  const c = controller();
  const st = c?.getState();
  if (e.answered || !e.incoming) {
    if (c && st?.callId === callId) void c.leave();
    else void post('leave', callId);
    pendingAccept.delete(callId);
  } else if (c) {
    void c.declineById(callId);
  } else {
    void post('decline', callId);
  }
}

function onMuted(d: { muted?: boolean; callUUID?: string }) {
  const e = entries.get(norm(d.callUUID));
  const c = currentChatCall();
  if (!e?.callId || !c) return;
  const st = c.getState();
  if (st.callId !== e.callId) return;
  const micOn = !d.muted;
  if (st.micOn !== micOn) c.setMic(micOn);
}

type RawEvent = { name?: string; data?: unknown };
function replay(events: RawEvent[] | null | undefined) {
  for (const ev of events ?? []) {
    const data = (ev?.data ?? {}) as Record<string, unknown>;
    switch (ev?.name) {
      case 'RNCallKeepDidDisplayIncomingCall': {
        let payload = data.payload;
        if (typeof payload === 'string' && payload) {
          try { payload = JSON.parse(payload); } catch { payload = {}; }
        }
        onDisplayed({ ...(data as { callUUID?: string; error?: string; errorCode?: string }), payload });
        break;
      }
      case 'RNCallKeepPerformAnswerCallAction': onAnswer(data.callUUID); break;
      case 'RNCallKeepPerformEndCallAction': onEnd(data.callUUID); break;
      case 'RNCallKeepDidPerformSetMutedCallAction': onMuted(data as { muted?: boolean; callUUID?: string }); break;
      default: break;
    }
  }
}

// ── Android — 통화 계정 · 백그라운드 데이터 푸시 ─────────────────────────

const androidOptions = () => ({
  ios: { appName: 'SMIS Mentor' },
  android: {
    alertTitle: L('chat.callPhoneAccountTitle'),
    alertDescription: L('chat.callPhoneAccountDesc'),
    cancelButton: L('chat.callPhoneAccountLater'),
    okButton: L('chat.callPhoneAccountOk'),
    additionalPermissions: [] as string[],
    selfManaged: false,
    // 받은 통화가 백그라운드에서도 마이크를 쓰게 (callkeep 이 받을 때 포그라운드 서비스를 켠다)
    foregroundService: { channelId: 'chat-call-ongoing', channelName: L('chat.callChannel'), notificationTitle: L('chat.callVoice'), notificationIcon: 'ic_launcher' },
  },
});

let androidReady = false;
let androidInited = false;
function initAndroidSilently(ck: CallKeep) {
  if (androidInited) return;
  androidInited = true;
  try {
    ck.registerPhoneAccount(androidOptions());
    ck.registerAndroidEvents();
    ck.setAvailable(true);
  } catch (e) {
    logger.warn('통화 계정 등록 실패:', e);
  }
}
async function refreshAndroidReady(): Promise<boolean> {
  const ck = callKeep();
  if (Platform.OS !== 'android' || !ck) return false;
  initAndroidSilently(ck);
  androidReady = await ck.hasPhoneAccount().catch(() => false);
  return androidReady;
}

/** 처음 한 번 — '전화' 권한 · 통화 계정 켜기를 안내한다 (앱이 열려 있을 때만) */
async function askPhoneAccountOnce() {
  const ck = callKeep();
  if (Platform.OS !== 'android' || !ck || !appActive()) return;
  if (await refreshAndroidReady()) return;
  if (await AsyncStorage.getItem(PHONE_ACCOUNT_ASKED_KEY).catch(() => '1')) return;
  await AsyncStorage.setItem(PHONE_ACCOUNT_ASKED_KEY, String(Date.now())).catch(() => undefined);
  Alert.alert(L('chat.callPhoneAccountTitle'), L('chat.callPhoneAccountDesc'), [
    { text: L('chat.callPhoneAccountLater'), style: 'cancel' },
    {
      text: L('chat.callPhoneAccountOk'),
      onPress: () => {
        // 권한 요청 → (통화 계정이 꺼져 있으면) 안내 후 통화 계정 설정 화면
        ck.setup(androidOptions())
          .catch(() => false)
          .finally(() => void refreshAndroidReady());
      },
    },
  ]);
}

type CallPush = { callId: string; uuid: string; roomId: string; callerName: string; media: ChatCallMedia; createdAt: number };
/** 백그라운드 작업 데이터에서 통화 푸시 찾기 — { data: { dataString: '{...}' } } · Expo 가 body 에 JSON 으로 담기도 한다 */
export function callPushFrom(raw: unknown, depth = 0): CallPush | null {
  if (raw == null || depth > 5) return null;
  if (typeof raw === 'string') {
    if (!raw.includes('chat-call')) return null;
    try { return callPushFrom(JSON.parse(raw), depth + 1); } catch { return null; }
  }
  if (typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.type === 'chat-call' && typeof o.callId === 'string' && typeof o.uuid === 'string') {
    const createdAt = Number(o.createdAt);
    return {
      callId: o.callId,
      uuid: o.uuid,
      roomId: typeof o.roomId === 'string' ? o.roomId : '',
      callerName: typeof o.callerName === 'string' && o.callerName ? o.callerName : 'SMIS Mentor',
      media: o.media === 'video' ? 'video' : 'voice',
      createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now(),
    };
  }
  for (const k of ['data', 'dataString', 'body', 'notification', 'request', 'content']) {
    const r = callPushFrom(o[k], depth + 1);
    if (r) return r;
  }
  return null;
}

async function ensureCallChannel() {
  await Notifications.setNotificationChannelAsync(CALL_CHANNEL, {
    name: L('chat.callChannel'),
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 900, 700, 900, 700, 900, 700, 900],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    lightColor: '#22c55e',
  }).catch(() => undefined);
}

/** Android — 앱이 닫혀 있거나 뒤에 있을 때 온 통화 푸시 */
async function ringFromPush(p: CallPush): Promise<Entry | null> {
  if (appActive()) return null; // 열려 있으면 통화 구독(컨트롤러)이 맡는다
  const uuid = norm(p.uuid);
  if (!uuid || entries.has(uuid)) return null;
  if (Date.now() - p.createdAt > CHAT_CALL_LIMITS.ringMs) return null;
  const e = track(uuid, { callId: p.callId, roomId: p.roomId, media: p.media, createdAt: p.createdAt, incoming: true });
  const ck = callKeep();
  if (ck && (await refreshAndroidReady())) {
    ck.displayIncomingCall(uuid, p.callerName, p.callerName, 'generic', p.media === 'video');
  } else {
    // 시스템 수신 화면을 못 쓴다 — 소리 나는 알림 (누르면 그 방이 열리고 앱 안 벨 화면)
    await ensureCallChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: `chat-call-${p.callId}`,
      content: {
        title: p.callerName,
        body: L('chat.callTapToAnswer', { media: L(p.media === 'video' ? 'chat.callVideo' : 'chat.callVoice') }),
        data: { type: 'chat-call', roomId: p.roomId, callId: p.callId },
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: { channelId: CALL_CHANNEL },
    }).then(() => { e.notified = true; }).catch((err) => logger.warn('통화 알림 실패:', err));
  }
  watchEntry(e);
  return e;
}

if (Platform.OS === 'android') {
  TaskManager.defineTask(CHAT_CALL_PUSH_TASK, async ({ data, error }) => {
    if (error) return;
    const p = callPushFrom(data);
    if (!p) return;
    const e = await ringFromPush(p).catch((err) => {
      logger.warn('통화 푸시 처리 실패:', err);
      return null;
    });
    // 작업이 끝나면 화면 없이 깨어난 JS 가 2초 뒤 정리된다 — 벨 · 통화가 끝날 때까지 붙잡아 둔다
    if (e) await untilEnded(e, 3 * 60 * 60_000);
  });
}

// ── iOS — VoIP 토큰 ─────────────────────────────────────────────────

let voipToken = '';
async function saveVoipToken(uid: string, token: string) {
  const key = `${uid}:${token}`;
  if ((await AsyncStorage.getItem(VOIP_SAVED_KEY).catch(() => null)) === key) return;
  await setDoc(doc(db, 'users', uid), { voipTokens: { [token]: { platform: 'ios', addedAt: new Date() } } }, { merge: true });
  await AsyncStorage.setItem(VOIP_SAVED_KEY, key).catch(() => undefined);
}
function onVoipToken(token: unknown) {
  if (typeof token !== 'string' || !/^[0-9a-f]{32,200}$/i.test(token)) return;
  voipToken = token;
  const u = auth.currentUser;
  if (u) void saveVoipToken(u.uid, token).catch((e) => logger.warn('VoIP 토큰 저장 실패:', e));
}

/** 로그아웃 — 이 기기의 VoIP 토큰을 지운다 (다른 사람 통화가 이 폰에 울리지 않게) */
export async function removeMyVoipToken(uid: string): Promise<void> {
  if (!voipToken) return;
  await setDoc(doc(db, 'users', uid), { voipTokens: { [voipToken]: deleteField() } }, { merge: true });
  await AsyncStorage.removeItem(VOIP_SAVED_KEY).catch(() => undefined);
}

// ── 앱 통화 연결이 부르는 쪽 ─────────────────────────────────────────

const IOS_INCOMING = { ios: { supportsHolding: false, supportsDTMF: false, supportsGrouping: false, supportsUngrouping: false } };

function endWhyOf(reason: ChatCallState['endedReason']): EndWhy {
  if (reason === 'elsewhere') return 'elsewhere';
  if (reason === 'missed') return 'missed';
  if (reason === 'failed') return 'failed';
  return 'remote';
}

const impl: NativeCalls = {
  handlesIncoming: () => (Platform.OS === 'ios' ? !!callKeep() : androidReady),
  reportIncoming(call, callerName) {
    const ck = callKeep();
    const uuid = norm(call.uuid);
    if (!ck || !uuid) return;
    const known = entries.get(uuid);
    const e = track(uuid, { callId: call.id, roomId: call.roomId, media: call.media, createdAt: call.createdAt, incoming: true });
    if (known && !known.notified) {
      // VoIP 푸시 · 데이터 푸시가 이미 띄웠다
      watchEntry(e);
      return;
    }
    if (e.ended) return;
    const name = callerName || 'SMIS Mentor';
    if (Platform.OS === 'ios') ck.displayIncomingCall(uuid, name, name, 'generic', call.media === 'video', IOS_INCOMING);
    else ck.displayIncomingCall(uuid, name, name, 'generic', call.media === 'video');
    watchEntry(e);
  },
  reportOutgoing(call, peerName) {
    // iOS 만 — CallKit 이 오디오 세션 · 잠금화면 통화 표시를 맡는다 (Android 는 앱 화면 그대로)
    if (Platform.OS !== 'ios') return;
    const ck = callKeep();
    const uuid = norm(call.uuid);
    if (!ck || !uuid || entries.has(uuid)) return;
    track(uuid, { callId: call.id, roomId: call.roomId, media: call.media, createdAt: call.createdAt, incoming: false, answered: true });
    const name = peerName || 'SMIS Mentor';
    ck.startCall(uuid, name, name, 'generic', call.media === 'video');
  },
  reportConnected(callId) {
    const ck = callKeep();
    const uuid = byCall.get(callId);
    const e = uuid ? entries.get(uuid) : undefined;
    if (!ck || !uuid || !e || e.ended) return;
    e.answered = true;
    if (e.timer) clearTimeout(e.timer);
    e.timer = undefined;
    if (Platform.OS === 'ios') {
      if (!e.incoming) ck.reportConnectedOutgoingCallWithUUID(uuid);
    } else {
      ck.setCurrentCallActive(uuid);
    }
  },
  reportEnded(callId, reason) {
    const uuid = byCall.get(callId);
    if (uuid) endNative(uuid, endWhyOf(reason));
  },
  setMuted(callId, muted) {
    const ck = callKeep();
    const uuid = byCall.get(callId);
    const e = uuid ? entries.get(uuid) : undefined;
    if (ck && uuid && e && !e.ended) ck.setMutedCall(uuid, muted);
  },
  onController(c) {
    flushPending(c);
    if (Platform.OS === 'android') setTimeout(() => void askPhoneAccountOnce().catch(() => undefined), 3_000);
  },
};

// ── 시작 ────────────────────────────────────────────────────────────

let started = false;
/** index.ts 가 부른다 — 통화가 켜진 빌드에서만 OS 통화 화면을 쓴다 */
export function initNativeCalls() {
  if (started) return;
  started = true;
  const ck = callKeep();
  if (!ck || !chatCallsReal()) return;

  ck.addEventListener('didLoadWithEvents', (events) => replay(events as RawEvent[]));
  ck.addEventListener('didDisplayIncomingCall', (d) => onDisplayed(d));
  ck.addEventListener('answerCall', (d) => onAnswer(d.callUUID));
  ck.addEventListener('endCall', (d) => onEnd(d.callUUID));
  ck.addEventListener('didPerformSetMutedCallAction', (d) => onMuted(d));
  // 듣기 전에 쌓인 이벤트 (didLoadWithEvents 와 겹쳐도 같은 처리는 한 번만 된다)
  ck.getInitialEvents()
    .then((events) => {
      replay(events as RawEvent[]);
      ck.clearInitialEvents();
    })
    .catch(() => undefined);

  if (Platform.OS === 'android') {
    void refreshAndroidReady();
    AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshAndroidReady();
    });
    void Notifications.registerTaskAsync(CHAT_CALL_PUSH_TASK).catch((e) => logger.warn('통화 푸시 작업 등록 실패:', e));
    void ensureCallChannel();
  }

  const voip = voipPush();
  if (voip) {
    voip.addEventListener('didLoadWithEvents', (events) => {
      for (const ev of events ?? []) if (ev?.name === 'RNVoipPushRemoteNotificationsRegisteredEvent') onVoipToken(ev.data);
    });
    voip.addEventListener('register', (token) => onVoipToken(token));
  }
  onAuthStateChanged(auth, (u) => {
    if (u && voipToken) void saveVoipToken(u.uid, voipToken).catch((e) => logger.warn('VoIP 토큰 저장 실패:', e));
  });

  setNativeCalls(impl);
}
