'use client';
/**
 * 웹 문자 인증 — Firebase 전화 인증을 '보조 앱'에서 한다.
 * 본 로그인 세션(auth)을 건드리지 않아야 해서 (소셜 가입 중에는 팝업 세션이 살아 있다) 따로 만든 앱 · 메모리 세션을 쓴다.
 * 받은 ID 토큰은 서버(/api/auth/phone)에 보내고, 서버가 임시 Auth 계정을 지운다.
 */
import { getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  type Auth,
  type ConfirmationResult,
} from 'firebase/auth';
import { app } from '@/lib/firebase';

const NAME = 'smis-phone-verify';
let phoneAuth: Auth | null = null;
let verifier: RecaptchaVerifier | null = null;
let holder: HTMLDivElement | null = null;

function getPhoneAuth(): Auth {
  if (phoneAuth) return phoneAuth;
  const existing = getApps().find((a) => a.name === NAME);
  const a = existing ?? initializeApp(app.options, NAME);
  try {
    phoneAuth = initializeAuth(a, { persistence: inMemoryPersistence });
  } catch {
    phoneAuth = getAuth(a); // 개발 중 새로고침(HMR)으로 이미 만들어진 경우
  }
  return phoneAuth;
}

function resetVerifier() {
  try { verifier?.clear(); } catch { /* 이미 정리됨 */ }
  verifier = null;
  holder?.remove();
  holder = null;
}

/** 인증번호 보내기 (보이지 않는 reCAPTCHA — 의심스러울 때만 문제를 띄운다) */
export async function sendPhoneCode(e164: string, lang: 'ko' | 'en'): Promise<ConfirmationResult> {
  resetVerifier();
  const auth = getPhoneAuth();
  auth.languageCode = lang;
  holder = document.createElement('div');
  document.body.appendChild(holder);
  verifier = new RecaptchaVerifier(auth, holder, { size: 'invisible' });
  try {
    return await signInWithPhoneNumber(auth, e164, verifier);
  } catch (e) {
    resetVerifier();
    throw e;
  }
}

/** 인증번호 확인 → 서버에 보낼 ID 토큰 */
export async function confirmPhoneCode(confirmation: ConfirmationResult, code: string): Promise<string> {
  const cred = await confirmation.confirm(code);
  return cred.user.getIdToken();
}

/** 끝나면 보조 세션 정리 */
export async function endPhoneSession(): Promise<void> {
  resetVerifier();
  if (phoneAuth) await signOut(phoneAuth).catch(() => undefined);
}
