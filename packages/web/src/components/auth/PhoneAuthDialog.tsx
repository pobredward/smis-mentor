'use client';
/**
 * 문자 인증 창 — 전화번호로 로그인(purpose 'login') · 번호 확인(purpose 'verify': 가입 · temp 계정 찾기)
 *
 *   const [phoneDialog, startPhoneAuth] = usePhoneAuth();
 *   const r = await startPhoneAuth({ purpose: 'verify', phone: '01012345678' });   // 취소하면 null
 *   ...
 *   return <>{phoneDialog} ...</>;
 *
 * 문자 인증은 보조 Firebase 앱에서 하고(lib/phoneVerify), 판정은 서버(/api/auth/phone)가 한다.
 * 받은 번호 확인 표는 이 탭에 저장해 가입 마지막 단계에 함께 보낸다(lib/phoneTicketStore).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import {
  AuthApiError,
  PHONE_COUNTRIES,
  PHONE_RESEND_SECONDS,
  formatE164ForDisplay,
  phoneAuthErrorMessage,
  phoneAuthViaApi,
  toE164,
  type PhoneAuthPurpose,
  type PhoneAuthResult,
} from '@smis-mentor/shared';
import { confirmPhoneCode, endPhoneSession, sendPhoneCode } from '@/lib/phoneVerify';
import { phoneTicketStore } from '@/lib/phoneTicketStore';

type Lang = 'ko' | 'en';

const T = {
  ko: {
    titleLogin: '전화번호로 로그인',
    titleVerify: '휴대폰 인증',
    country: '나라',
    phone: '휴대폰 번호',
    phonePh: "'-' 없이 숫자만",
    fixedHint: '이 번호로 인증번호를 보내요.',
    send: '인증번호 받기',
    sentTo: (p: string) => `${p}(으)로 보낸 인증번호 6자리를 입력해주세요.`,
    code: '인증번호',
    confirm: '확인',
    resend: '다시 받기',
    resendIn: (s: number) => `${s}초 뒤 다시 받기`,
    changeNumber: '번호 바꾸기',
    badPhone: '휴대폰 번호를 확인해주세요.',
    badCode: '인증번호 6자리를 입력해주세요.',
    note: '보안 확인 창이 뜰 수 있어요.',
  },
  en: {
    titleLogin: 'Sign in with phone',
    titleVerify: 'Verify your phone',
    country: 'Country',
    phone: 'Mobile number',
    phonePh: 'Numbers only',
    fixedHint: 'We will text a code to this number.',
    send: 'Send code',
    sentTo: (p: string) => `Enter the 6-digit code sent to ${p}.`,
    code: 'Code',
    confirm: 'Confirm',
    resend: 'Resend',
    resendIn: (s: number) => `Resend in ${s}s`,
    changeNumber: 'Change number',
    badPhone: 'Please check the phone number.',
    badCode: 'Please enter the 6-digit code.',
    note: 'A security check may appear.',
  },
};

function errorText(e: unknown, lang: Lang): string {
  if (e instanceof AuthApiError) return phoneAuthErrorMessage(e.code, lang, e.message);
  const code = (e as { code?: string })?.code;
  return phoneAuthErrorMessage(code, lang);
}

interface DialogProps {
  purpose: PhoneAuthPurpose;
  /** 정해진 번호 (E.164) — 가입 단계에서 입력한 번호 */
  fixedPhone?: string;
  lang: Lang;
  onDone: (result: PhoneAuthResult | null) => void;
}

export function PhoneAuthDialog({ purpose, fixedPhone, lang, onDone }: DialogProps) {
  const t = T[lang];
  const [country, setCountry] = useState('+82');
  const [number, setNumber] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [e164, setE164] = useState<string | null>(fixedPhone ?? null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [left, setLeft] = useState(0);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (left <= 0) return;
    const id = window.setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [left]);

  // 창이 닫히면 보조 세션 정리
  useEffect(() => () => { void endPhoneSession(); }, []);

  const finish = useCallback((r: PhoneAuthResult | null) => {
    if (done.current) return;
    done.current = true;
    onDone(r);
  }, [onDone]);

  const send = async () => {
    const target = fixedPhone ?? toE164(number, country);
    if (!target) { setError(t.badPhone); return; }
    setBusy(true);
    setError('');
    try {
      confirmation.current = await sendPhoneCode(target, lang);
      setE164(target);
      setStep('code');
      setCode('');
      setLeft(PHONE_RESEND_SECONDS);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const c = code.replace(/\D/g, '');
    if (c.length !== 6 || !confirmation.current) { setError(t.badCode); return; }
    setBusy(true);
    setError('');
    try {
      const idToken = await confirmPhoneCode(confirmation.current, c);
      const result = await phoneAuthViaApi('', idToken, purpose);
      await endPhoneSession();
      if (result.action !== 'LOGIN') phoneTicketStore.save(result.phoneTicket, result.phone);
      finish(result);
    } catch (e) {
      setError(errorText(e, lang));
      // 서버가 거절했으면(번호 공유 · 관리자 등) 세션은 서버가 지웠다 — 처음부터
      if (e instanceof AuthApiError) { confirmation.current = null; setStep('phone'); await endPhoneSession(); }
    } finally {
      setBusy(false);
    }
  };

  const shown = e164 ? formatE164ForDisplay(e164) : '';
  return (
    <Modal isOpen onClose={() => finish(null)} title={purpose === 'login' ? t.titleLogin : t.titleVerify}>
      <div className="p-2 space-y-4">
        {step === 'phone' ? (
          <form onSubmit={(ev) => { ev.preventDefault(); void send(); }} className="space-y-3">
            {fixedPhone ? (
              <div>
                <p className="text-sm text-gray-600">{t.fixedHint}</p>
                <p className="mt-1 text-lg font-semibold tracking-wide">{formatE164ForDisplay(fixedPhone)}</p>
              </div>
            ) : (
              <div className="flex gap-2">
                <label className="sr-only" htmlFor="phone-country">{t.country}</label>
                <select
                  id="phone-country"
                  value={country}
                  onChange={(ev) => setCountry(ev.target.value)}
                  className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-2 text-sm"
                >
                  {PHONE_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{`${lang === 'en' ? c.en : c.ko} ${c.code}`}</option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="phone-number">{t.phone}</label>
                <input
                  id="phone-number"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  autoFocus
                  placeholder={t.phonePh}
                  value={number}
                  onChange={(ev) => setNumber(ev.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-base"
                />
              </div>
            )}
            {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
            <Button type="submit" fullWidth isLoading={busy}>{t.send}</Button>
            <p className="text-xs text-gray-500">{t.note}</p>
          </form>
        ) : (
          <form onSubmit={(ev) => { ev.preventDefault(); void verify(); }} className="space-y-3">
            <p className="text-sm text-gray-600">{t.sentTo(shown)}</p>
            <label className="sr-only" htmlFor="phone-code">{t.code}</label>
            <input
              id="phone-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(ev) => setCode(ev.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-center text-2xl tracking-[0.4em]"
            />
            {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
            <Button type="submit" fullWidth isLoading={busy} disabled={code.length !== 6}>{t.confirm}</Button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                disabled={left > 0 || busy}
                onClick={() => void send()}
                className="text-blue-600 disabled:text-gray-400"
              >
                {left > 0 ? t.resendIn(left) : t.resend}
              </button>
              {!fixedPhone ? (
                <button type="button" disabled={busy} onClick={() => { setStep('phone'); setError(''); }} className="text-gray-600">
                  {t.changeNumber}
                </button>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

type Request = { purpose: PhoneAuthPurpose; fixedPhone?: string; resolve: (r: PhoneAuthResult | null) => void; id: number };

/** [창, 시작 함수] — 시작 함수는 결과(취소면 null)를 돌려준다 */
export function usePhoneAuth(lang: Lang = 'ko') {
  const [req, setReq] = useState<Request | null>(null);
  const start = useCallback((opts: { purpose: PhoneAuthPurpose; phone?: string }): Promise<PhoneAuthResult | null> => {
    const fixed = opts.phone ? toE164(opts.phone) ?? undefined : undefined;
    // 방금(25분 안) 같은 번호로 인증했으면 다시 묻지 않는다
    if (opts.purpose === 'verify' && fixed) {
      const ticket = phoneTicketStore.ticketFor(fixed);
      if (ticket) return Promise.resolve({ action: 'VERIFIED', phoneTicket: ticket, phone: fixed });
    }
    return new Promise((resolve) => setReq({ purpose: opts.purpose, fixedPhone: fixed, resolve, id: Date.now() }));
  }, []);
  const node = req ? (
    <PhoneAuthDialog
      key={req.id}
      purpose={req.purpose}
      fixedPhone={req.fixedPhone}
      lang={lang}
      onDone={(r) => { req.resolve(r); setReq(null); }}
    />
  ) : null;
  return [node, start] as const;
}
