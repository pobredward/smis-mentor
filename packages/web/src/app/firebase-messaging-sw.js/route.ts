import { SDK_VERSION } from 'firebase/app';

/**
 * GET /firebase-messaging-sw.js — 웹 푸시(FCM) 서비스 워커
 *
 * Firebase 설정(NEXT_PUBLIC_FIREBASE_*)을 요청 때 환경변수에서 읽어 넣는다 (값을 코드에 적지 않는다).
 * 서버는 notification + webpush.fcmOptions.link 로 보내므로, 창이 뒤에 있으면 SDK 가 알림을 띄우고
 * 누르면 그 주소(/chat?room=…)를 연다. 창이 앞에 있으면 페이지의 onMessage 로 간다 (src/lib/webPush.ts).
 * compat 스크립트 버전은 설치된 firebase 와 같게 (SDK_VERSION).
 */
export const dynamic = 'force-dynamic';

export function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const version = /^\d+\.\d+\.\d+$/.test(SDK_VERSION) ? SDK_VERSION : '11.10.0';
  const ready = !!(config.apiKey && config.projectId && config.messagingSenderId && config.appId);
  const base = `https://www.gstatic.com/firebasejs/${version}`;

  const script = `/* SMIS CAMP — 웹 푸시 서비스 워커 (Firebase Cloud Messaging ${version}) */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });
${ready ? `importScripts('${base}/firebase-app-compat.js');
importScripts('${base}/firebase-messaging-compat.js');
firebase.initializeApp(${JSON.stringify(config)});
firebase.messaging();` : '/* Firebase 설정이 없어 알림을 받지 않는다 */'}
`;

  return new Response(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Robots-Tag': 'noindex',
    },
  });
}
