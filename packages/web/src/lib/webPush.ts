/**
 * 웹 푸시 (브라우저 알림) — Firebase Cloud Messaging
 *
 * - 서비스 워커: /firebase-messaging-sw.js (src/app/firebase-messaging-sw.js/route.ts 가 만든다)
 * - 토큰: users/{uid}.webPushTokens.{token} = { addedAt, lastUsed, ua } — 서버(Functions)가 여기로 보낸다
 * - 서버는 notification + webpush.fcmOptions.link 로 보내므로, 창이 뒤에 있으면 SDK(서비스 워커)가 알림을 띄우고
 *   누르면 그 주소를 연다. 창이 앞에 있으면 알림 대신 onMessage 로 들어온다 (listenForegroundPush).
 * - NEXT_PUBLIC_FIREBASE_VAPID_KEY 가 없으면 아무것도 하지 않는다.
 */
import { deleteField, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { logger } from '@smis-mentor/shared';
import { app, db } from '@/lib/firebase';

// process.env.NEXT_PUBLIC_* 는 빌드 때 값으로 바뀌므로 이렇게 그대로 적어야 한다
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';
const SW_URL = '/firebase-messaging-sw.js';
/** FCM 기본 범위 — 다른 서비스 워커와 겹치지 않게 */
const SW_SCOPE = '/firebase-cloud-messaging-push-scope';
const TOKEN_KEY = (uid: string) => `smis_webpush_${uid}`;
/** 같은 토큰이면 하루에 한 번만 lastUsed 를 고친다 */
const REFRESH_MS = 24 * 60 * 60 * 1000;

export type WebPushPermission = NotificationPermission | 'unsupported';

/** 이 브라우저가 웹 푸시를 쓸 수 있는가 (https · 서비스 워커 · Push API · Notification) */
export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

/** VAPID 키가 설정돼 있는가 */
export function webPushConfigured(): boolean {
  return !!VAPID_KEY;
}

/** 지금 알림 권한 — 지원하지 않거나 설정이 없으면 'unsupported' */
export function webPushPermission(): WebPushPermission {
  if (!isWebPushSupported() || !webPushConfigured()) return 'unsupported';
  return Notification.permission;
}

/** 짧은 브라우저 이름 — "Chrome · Windows" (전체 UA 는 저장하지 않는다) */
function browserLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /SamsungBrowser\//.test(ua) ? 'Samsung Internet'
    : /Whale\//.test(ua) ? 'Whale'
    : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux/.test(ua) ? 'Linux'
    : '';
  return os ? `${browser} · ${os}` : browser;
}

function readSaved(uid: string): { token: string; at: number } | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(TOKEN_KEY(uid)) || 'null');
    return v && typeof v.token === 'string' ? v : null;
  } catch {
    return null;
  }
}
function writeSaved(uid: string, v: { token: string; at: number } | null) {
  try {
    if (v) window.localStorage.setItem(TOKEN_KEY(uid), JSON.stringify(v));
    else window.localStorage.removeItem(TOKEN_KEY(uid));
  } catch {
    /* 저장소를 못 쓰는 브라우저 — 다음에 다시 쓴다 */
  }
}

/** 서비스 워커가 켜질 때까지 (pushManager.subscribe 는 켜진 워커가 있어야 한다) */
async function waitActive(reg: ServiceWorkerRegistration): Promise<ServiceWorkerRegistration> {
  if (reg.active) return reg;
  const sw = reg.installing || reg.waiting;
  if (!sw) return reg;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 10_000);
    sw.addEventListener('statechange', () => {
      if (sw.state === 'activated') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  return reg;
}

async function registerWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  if (existing?.active?.scriptURL.endsWith(SW_URL)) return existing;
  return waitActive(await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }));
}

async function loadMessaging() {
  const m = await import('firebase/messaging');
  if (!(await m.isSupported())) return null;
  return { m, messaging: m.getMessaging(app) };
}

/** 토큰을 받아 users 문서에 저장 (force: 하루가 안 지났어도 쓴다) */
async function syncToken(uid: string, force: boolean): Promise<string | null> {
  const loaded = await loadMessaging();
  if (!loaded) return null;
  const registration = await registerWorker();
  const token = await loaded.m.getToken(loaded.messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) return null;
  const prev = readSaved(uid);
  if (!force && prev?.token === token && Date.now() - prev.at < REFRESH_MS) return token;
  const now = serverTimestamp();
  const entry: Record<string, unknown> = { lastUsed: now, ua: browserLabel() };
  if (prev?.token !== token) entry.addedAt = now;
  const tokens: Record<string, unknown> = { [token]: entry };
  // 토큰이 바뀌었으면 예전 토큰은 지운다 (서버가 죽은 토큰으로 보내지 않게)
  if (prev?.token && prev.token !== token) tokens[prev.token] = deleteField();
  await setDoc(doc(db, 'users', uid), { webPushTokens: tokens }, { merge: true });
  writeSaved(uid, { token, at: Date.now() });
  return token;
}

/**
 * 알림 켜기 — 권한 묻기 → 서비스 워커 → 토큰 저장.
 * 돌려주는 값: 'granted' 켜짐 · 'denied' 막힘 · 'default' 대답 안 함 · 'unsupported' · 'error'
 */
export async function enableWebPush(uid: string): Promise<WebPushPermission | 'error'> {
  if (!uid || !isWebPushSupported() || !webPushConfigured()) return 'unsupported';
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return 'error';
  }
  if (permission !== 'granted') return permission;
  try {
    const token = await syncToken(uid, true);
    return token ? 'granted' : 'unsupported';
  } catch (e) {
    logger.warn('웹 푸시 켜기 실패:', e);
    return 'error';
  }
}

/** 이미 허용된 브라우저 — 조용히 토큰을 확인하고 lastUsed 를 고친다 (하루 한 번) */
export async function refreshWebPushToken(uid: string): Promise<void> {
  if (!uid || webPushPermission() !== 'granted') return;
  try {
    await syncToken(uid, false);
  } catch (e) {
    logger.warn('웹 푸시 토큰 갱신 실패:', e);
  }
}

/** 로그아웃 전에 — 이 브라우저 토큰을 지운다 (다른 사람이 같은 브라우저를 쓸 때 알림이 가지 않게) */
export async function removeWebPushToken(uid: string): Promise<void> {
  if (!uid || typeof window === 'undefined') return;
  const saved = readSaved(uid);
  if (!saved) return;
  writeSaved(uid, null);
  try {
    await setDoc(doc(db, 'users', uid), { webPushTokens: { [saved.token]: deleteField() } }, { merge: true });
    const loaded = await loadMessaging();
    if (loaded) await loaded.m.deleteToken(loaded.messaging);
  } catch (e) {
    logger.warn('웹 푸시 토큰 삭제 실패:', e);
  }
}

export interface ForegroundPush {
  title: string;
  body: string;
  data: Record<string, string>;
  messageId?: string;
}

/** 창이 앞에 있을 때 오는 푸시 — 끊는 함수를 돌려준다 */
export function listenForegroundPush(cb: (p: ForegroundPush) => void): () => void {
  if (!isWebPushSupported() || !webPushConfigured()) return () => undefined;
  let stop: (() => void) | null = null;
  let cancelled = false;
  loadMessaging()
    .then((loaded) => {
      if (!loaded || cancelled) return;
      stop = loaded.m.onMessage(loaded.messaging, (payload) => {
        cb({
          title: payload.notification?.title ?? '',
          body: payload.notification?.body ?? '',
          data: (payload.data ?? {}) as Record<string, string>,
          messageId: payload.messageId,
        });
      });
    })
    .catch((e) => logger.warn('웹 푸시 수신 준비 실패:', e));
  return () => {
    cancelled = true;
    stop?.();
  };
}
