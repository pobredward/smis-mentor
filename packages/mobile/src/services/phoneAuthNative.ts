/**
 * 앱 문자 인증 — React Native Firebase(네이티브) 전화 인증.
 *
 * 로그인 세션은 그대로 Firebase JS SDK 가 맡고, 네이티브 인증은 문자 확인에만 쓴다.
 * 받은 ID 토큰을 서버(/api/auth/phone)에 보내면 서버가 그 번호의 계정 로그인 토큰을 주고, 문자 인증 때 생긴 임시 계정은 지운다.
 *
 * 네이티브 모듈은 1.9.0 빌드부터 들어 있다. 없으면 isPhoneAuthAvailable() = false — 화면은 버튼을 숨기고,
 * 옛 빌드에 이 코드가 가도 앱이 죽지 않는다.
 * iOS 는 조용한 푸시(APNs)로 앱을 확인하고, 안 되면 reCAPTCHA 웹 화면으로 넘어간다. 안드로이드는 Play Integrity · 문자 자동 읽기.
 */
import { logger } from '@smis-mentor/shared';

type RnfbAuth = typeof import('@react-native-firebase/auth');
export type PhoneConfirmation = import('@react-native-firebase/auth').ConfirmationResult;

let mod: RnfbAuth | null | undefined;

function load(): RnfbAuth | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('@react-native-firebase/auth') as RnfbAuth;
    m.getAuth(); // 네이티브 모듈이 없으면 여기서 던진다
    mod = m;
  } catch (e) {
    logger.warn('📱 네이티브 전화 인증을 쓸 수 없음 (옛 빌드):', (e as Error)?.message);
    mod = null;
  }
  return mod;
}

const unavailable = () => Object.assign(new Error('phone auth unavailable'), { code: 'auth/app-not-authorized' });

/** 이 빌드에서 문자 인증을 쓸 수 있나 */
export function isPhoneAuthAvailable(): boolean {
  return !!load();
}

/** 인증번호 보내기 */
export async function sendPhoneCode(e164: string, lang: 'ko' | 'en'): Promise<PhoneConfirmation> {
  const m = load();
  if (!m) throw unavailable();
  const auth = m.getAuth();
  await m.setLanguageCode(auth, lang).catch(() => undefined);
  if (auth.currentUser) await m.signOut(auth).catch(() => undefined); // 지난 시도의 세션
  return m.signInWithPhoneNumber(auth, e164);
}

/** 인증번호 확인 → 서버에 보낼 ID 토큰 (안드로이드가 문자를 자동으로 읽어 이미 로그인됐으면 그 사용자) */
export async function confirmPhoneCode(confirmation: PhoneConfirmation, code: string): Promise<string> {
  const m = load();
  if (!m) throw unavailable();
  const cred = await confirmation.confirm(code);
  const user = cred?.user ?? m.getAuth().currentUser;
  if (!user) throw Object.assign(new Error('no phone session'), { code: 'auth/session-expired' });
  return user.getIdToken(true);
}

/** 안드로이드 자동 인증 — 이 번호로 로그인되면 그 ID 토큰을 넘긴다. 돌려준 함수로 그만 듣기 */
export function onPhoneAutoVerified(e164: string, cb: (idToken: string) => void): () => void {
  const m = load();
  if (!m) return () => undefined;
  return m.onAuthStateChanged(m.getAuth(), (u) => {
    if (u?.phoneNumber && u.phoneNumber === e164) {
      u.getIdToken(true).then(cb).catch(() => undefined);
    }
  });
}

/** 끝나면 네이티브 세션 정리 (임시 계정은 서버가 지운다) */
export async function endPhoneSession(): Promise<void> {
  const m = load();
  if (!m) return;
  const auth = m.getAuth();
  if (auth.currentUser) await m.signOut(auth).catch(() => undefined);
}
