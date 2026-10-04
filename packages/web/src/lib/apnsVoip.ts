/**
 * iOS VoIP 푸시 (PushKit) — 1:1 통화 벨을 잠금화면에서도 울린다 (앱이 꺼져 있어도 CallKit 수신 화면).
 * Expo 푸시는 VoIP 를 보낼 수 없어 APNs 에 직접 보낸다 (HTTP/2, 토큰 인증 .p8).
 *
 * 환경변수 (Vercel · .env.local, 서버 전용 — 값은 로그에 남기지 않는다)
 *   APNS_KEY_ID   Apple Developer → Keys 의 Key ID (APNs 사용 체크된 키)
 *   APNS_TEAM_ID  Team ID
 *   APNS_KEY_P8   .p8 파일 내용 (줄바꿈은 \n 으로 넣어도 된다)
 *   APNS_BUNDLE_ID 앱 번들 ID (기본 com.smis.smismentor) — VoIP 토픽은 `${번들}.voip`
 * 토큰이 개발(디버그·개발 빌드)용인지 배포(TestFlight·App Store)용인지 몰라서 운영 서버에 먼저 보내고,
 * BadDeviceToken 이면 개발 서버로 한 번 더 보낸다.
 */
import { connect, constants, type ClientHttp2Session } from 'node:http2';
import { createPrivateKey, sign } from 'node:crypto';

const HOSTS = { production: 'https://api.push.apple.com', sandbox: 'https://api.sandbox.push.apple.com' } as const;
type ApnsHost = keyof typeof HOSTS;

export function apnsVoipConfigured(): boolean {
  return !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_KEY_P8);
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

let jwtCache: { token: string; at: number } | null = null;
/** APNs 인증 토큰 (ES256) — 20~60분 사이에 새로 만들어야 해서 40분 동안 쓴다 */
function providerToken(): string {
  if (jwtCache && Date.now() - jwtCache.at < 40 * 60_000) return jwtCache.token;
  const keyId = String(process.env.APNS_KEY_ID);
  const teamId = String(process.env.APNS_TEAM_ID);
  const pem = String(process.env.APNS_KEY_P8).replace(/\\n/g, '\n');
  const iat = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const body = b64url(JSON.stringify({ iss: teamId, iat }));
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' });
  const token = `${head}.${body}.${b64url(sig)}`;
  jwtCache = { token, at: Date.now() };
  return token;
}

function request(session: ClientHttp2Session, deviceToken: string, payload: string, expiresAtSec: number): Promise<{ status: number; reason?: string }> {
  const topic = `${process.env.APNS_BUNDLE_ID || 'com.smis.smismentor'}.voip`;
  return new Promise((resolve) => {
    const req = session.request({
      [constants.HTTP2_HEADER_METHOD]: 'POST',
      [constants.HTTP2_HEADER_PATH]: `/3/device/${deviceToken}`,
      authorization: `bearer ${providerToken()}`,
      'apns-topic': topic,
      'apns-push-type': 'voip',
      'apns-priority': '10',
      'apns-expiration': String(expiresAtSec),
      'content-type': 'application/json',
    });
    let status = 0;
    let data = '';
    req.setEncoding('utf8');
    req.on('response', (h) => { status = Number(h[constants.HTTP2_HEADER_STATUS] ?? 0); });
    req.on('data', (c: string) => { data += c; });
    req.on('end', () => {
      let reason: string | undefined;
      try { reason = data ? (JSON.parse(data) as { reason?: string }).reason : undefined; } catch { /* 본문 없음 */ }
      resolve({ status, reason });
    });
    req.on('error', (e) => resolve({ status: 0, reason: e instanceof Error ? e.message : 'error' }));
    req.setTimeout(8_000, () => { req.close(); resolve({ status: 0, reason: 'timeout' }); });
    req.end(payload);
  });
}

export interface VoipSendResult {
  token: string;
  ok: boolean;
  /** 지워야 할 토큰 (앱 삭제 · 만료) */
  invalid: boolean;
  reason?: string;
}

/**
 * VoIP 푸시 보내기 — tokens 마다. payload 는 앱의 PushKit 처리(AppDelegate)가 읽는 모양:
 *   { uuid, callId, roomId, callerId, callerName, hasVideo }
 */
export async function sendVoipPush(tokens: string[], payload: Record<string, unknown>, ttlSec = 45): Promise<VoipSendResult[]> {
  if (!apnsVoipConfigured() || !tokens.length) return [];
  const body = JSON.stringify(payload);
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sessions: Partial<Record<ApnsHost, ClientHttp2Session>> = {};
  const open = (h: ApnsHost) => (sessions[h] ??= connect(HOSTS[h]));
  try {
    return await Promise.all(tokens.map(async (token) => {
      let r = await request(open('production'), token, body, exp);
      if (r.status === 400 && r.reason === 'BadDeviceToken') r = await request(open('sandbox'), token, body, exp);
      const invalid = r.status === 410 || (r.status === 400 && (r.reason === 'BadDeviceToken' || r.reason === 'DeviceTokenNotForTopic'));
      return { token, ok: r.status === 200, invalid, reason: r.reason };
    }));
  } finally {
    Object.values(sessions).forEach((s) => s?.close());
  }
}
