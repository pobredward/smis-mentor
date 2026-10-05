/**
 * 문자 인증 창 (앱) — 전화번호로 로그인(purpose 'login') · 번호 확인(purpose 'verify': 가입 · temp 계정 찾기)
 *
 *   const [phoneModal, startPhoneAuth] = usePhoneAuth();
 *   const r = await startPhoneAuth({ purpose: 'verify', phone: '01012345678' });   // 취소하면 null
 *   ...
 *   return <>{phoneModal} ...</>;
 *
 * 문자 인증은 네이티브 인증(services/phoneAuthNative)이 하고, 판정은 서버(/api/auth/phone)가 한다.
 * 받은 번호 확인 표는 앱 메모리에 두었다가 가입 마지막 단계에 함께 보낸다(services/phoneTicketStore).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AuthApiError,
  PHONE_COUNTRIES,
  PHONE_RESEND_SECONDS,
  formatE164ForDisplay,
  getCurrentLocale,
  logger,
  phoneAuthErrorMessage,
  phoneAuthViaApi,
  toE164,
  type PhoneAuthPurpose,
  type PhoneAuthResult,
} from '@smis-mentor/shared';
import {
  confirmPhoneCode,
  endPhoneSession,
  onPhoneAutoVerified,
  sendPhoneCode,
  type PhoneConfirmation,
} from '../../services/phoneAuthNative';
import { phoneTicketStore } from '../../services/phoneTicketStore';
import { getApiBaseUrl } from '../../services/authService';

type Lang = 'ko' | 'en';

const T = {
  ko: {
    titleLogin: '전화번호로 로그인',
    titleVerify: '휴대폰 인증',
    phone: '휴대폰 번호',
    phonePh: "'-' 없이 숫자만",
    fixedHint: '이 번호로 인증번호를 보내요.',
    send: '인증번호 받기',
    sentTo: (p: string) => `${p}(으)로 보낸 인증번호 6자리를 입력해주세요.`,
    confirm: '확인',
    resend: '다시 받기',
    resendIn: (s: number) => `${s}초 뒤 다시 받기`,
    changeNumber: '번호 바꾸기',
    cancel: '취소',
    badPhone: '휴대폰 번호를 확인해주세요.',
    badCode: '인증번호 6자리를 입력해주세요.',
    note: '보안 확인 화면이 잠깐 열릴 수 있어요.',
  },
  en: {
    titleLogin: 'Sign in with phone',
    titleVerify: 'Verify your phone',
    phone: 'Mobile number',
    phonePh: 'Numbers only',
    fixedHint: 'We will text a code to this number.',
    send: 'Send code',
    sentTo: (p: string) => `Enter the 6-digit code sent to ${p}.`,
    confirm: 'Confirm',
    resend: 'Resend',
    resendIn: (s: number) => `Resend in ${s}s`,
    changeNumber: 'Change number',
    cancel: 'Cancel',
    badPhone: 'Please check the phone number.',
    badCode: 'Please enter the 6-digit code.',
    note: 'A security check may open briefly.',
  },
};

function errorText(e: unknown, lang: Lang): string {
  if (e instanceof AuthApiError) return phoneAuthErrorMessage(e.code, lang, e.message);
  return phoneAuthErrorMessage((e as { code?: string })?.code, lang);
}

interface ModalProps {
  purpose: PhoneAuthPurpose;
  /** 정해진 번호 (E.164) — 가입 단계에서 입력한 번호 */
  fixedPhone?: string;
  lang: Lang;
  onDone: (result: PhoneAuthResult | null) => void;
}

export function PhoneAuthModal({ purpose, fixedPhone, lang, onDone }: ModalProps) {
  const t = T[lang];
  const [country, setCountry] = useState('+82');
  const [number, setNumber] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [e164, setE164] = useState<string | null>(fixedPhone ?? null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [left, setLeft] = useState(0);
  const confirmation = useRef<PhoneConfirmation | null>(null);
  const stopAuto = useRef<() => void>(() => undefined);
  const submitting = useRef(false);
  const done = useRef(false);

  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);

  // 닫히면 자동 인증 듣기 · 네이티브 세션 정리
  useEffect(() => () => { stopAuto.current(); void endPhoneSession(); }, []);

  const finish = useCallback((r: PhoneAuthResult | null) => {
    if (done.current) return;
    done.current = true;
    stopAuto.current();
    onDone(r);
  }, [onDone]);

  /** 네이티브 ID 토큰 → 서버 판정 */
  const submitIdToken = useCallback(async (idToken: string) => {
    if (submitting.current || done.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await phoneAuthViaApi(getApiBaseUrl(), idToken, purpose);
      await endPhoneSession();
      if (result.action !== 'LOGIN') phoneTicketStore.save(result.phoneTicket, result.phone);
      finish(result);
    } catch (e) {
      logger.warn('📱 전화번호 인증 서버 처리 실패:', (e as { code?: string })?.code);
      setError(errorText(e, lang));
      if (e instanceof AuthApiError) {
        // 서버가 거절(번호 공유 · 관리자 등) — 임시 계정은 서버가 지웠다. 처음부터
        stopAuto.current();
        confirmation.current = null;
        setStep('phone');
        await endPhoneSession();
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }, [purpose, lang, finish]);

  const send = async () => {
    const target = fixedPhone ?? toE164(number, country);
    if (!target) { setError(t.badPhone); return; }
    setBusy(true);
    setError('');
    try {
      stopAuto.current();
      confirmation.current = await sendPhoneCode(target, lang);
      setE164(target);
      setStep('code');
      setCode('');
      setLeft(PHONE_RESEND_SECONDS);
      // 안드로이드: 문자를 자동으로 읽으면 바로 넘어간다
      stopAuto.current = onPhoneAutoVerified(target, (idToken) => { void submitIdToken(idToken); });
    } catch (e) {
      logger.warn('📱 인증번호 보내기 실패:', (e as { code?: string })?.code);
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
      setBusy(false);
      await submitIdToken(idToken);
    } catch (e) {
      setError(errorText(e, lang));
      setBusy(false);
    }
  };

  const shown = e164 ? formatE164ForDisplay(e164) : '';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => finish(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => (busy ? undefined : finish(null))} accessibilityLabel={t.cancel} />
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons name="phone-portrait-outline" size={26} color="#3b82f6" />
            </View>
            <Text style={styles.title}>{purpose === 'login' ? t.titleLogin : t.titleVerify}</Text>
          </View>

          {step === 'phone' ? (
            <>
              {fixedPhone ? (
                <View style={styles.block}>
                  <Text style={styles.hint}>{t.fixedHint}</Text>
                  <Text style={styles.fixed}>{formatE164ForDisplay(fixedPhone)}</Text>
                </View>
              ) : (
                <View style={styles.block}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
                    {PHONE_COUNTRIES.map((c) => {
                      const on = c.code === country;
                      return (
                        <TouchableOpacity
                          key={c.code}
                          onPress={() => setCountry(c.code)}
                          style={[styles.chip, on && styles.chipOn]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`${lang === 'en' ? c.en : c.ko} ${c.code}`}
                        >
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>{`${lang === 'en' ? c.en : c.ko} ${c.code}`}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <Text style={styles.label}>{t.phone}</Text>
                  <View style={styles.phoneRow}>
                    <Text style={styles.cc}>{country}</Text>
                    <TextInput
                      style={[styles.input, styles.phoneInput]}
                      value={number}
                      onChangeText={setNumber}
                      placeholder={t.phonePh}
                      placeholderTextColor="#94a3b8"
                      keyboardType="phone-pad"
                      textContentType="telephoneNumber"
                      autoComplete="tel"
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => void send()}
                    />
                  </View>
                </View>
              )}
              {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
              <TouchableOpacity style={[styles.primary, busy && styles.dim]} onPress={() => void send()} disabled={busy} accessibilityRole="button">
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t.send}</Text>}
              </TouchableOpacity>
              <Text style={styles.note}>{t.note}</Text>
            </>
          ) : (
            <>
              <Text style={[styles.hint, styles.block]}>{t.sentTo(shown)}</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                placeholderTextColor="#cbd5e1"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={6}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => void verify()}
              />
              {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
              <TouchableOpacity
                style={[styles.primary, (busy || code.length !== 6) && styles.dim]}
                onPress={() => void verify()}
                disabled={busy || code.length !== 6}
                accessibilityRole="button"
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t.confirm}</Text>}
              </TouchableOpacity>
              <View style={styles.linkRow}>
                <TouchableOpacity onPress={() => void send()} disabled={left > 0 || busy} accessibilityRole="button">
                  <Text style={[styles.link, (left > 0 || busy) && styles.linkOff]}>{left > 0 ? t.resendIn(left) : t.resend}</Text>
                </TouchableOpacity>
                {!fixedPhone ? (
                  <TouchableOpacity onPress={() => { stopAuto.current(); setStep('phone'); setError(''); }} disabled={busy} accessibilityRole="button">
                    <Text style={styles.linkGray}>{t.changeNumber}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          )}

          <TouchableOpacity style={styles.cancel} onPress={() => finish(null)} disabled={busy} accessibilityRole="button">
            <Text style={styles.cancelText}>{t.cancel}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type Request = { purpose: PhoneAuthPurpose; fixedPhone?: string; resolve: (r: PhoneAuthResult | null) => void; id: number };

/** [창, 시작 함수] — 시작 함수는 결과(취소면 null)를 돌려준다 */
export function usePhoneAuth() {
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
  const lang: Lang = getCurrentLocale() === 'en' ? 'en' : 'ko';
  const node = req ? (
    <PhoneAuthModal
      key={req.id}
      purpose={req.purpose}
      fixedPhone={req.fixedPhone}
      lang={lang}
      onDone={(r) => { req.resolve(r); setReq(null); }}
    />
  ) : null;
  return [node, start] as const;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 16 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  card: {
    width: '100%', maxWidth: 400, backgroundColor: '#fff', borderRadius: 16, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 10,
  },
  header: { alignItems: 'center', marginBottom: 20 },
  iconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 19, fontWeight: '700', color: '#1e293b' },
  block: { marginBottom: 16 },
  hint: { fontSize: 14, color: '#64748b', lineHeight: 20 },
  fixed: { marginTop: 6, fontSize: 20, fontWeight: '700', color: '#1e293b', letterSpacing: 0.5 },
  chips: { gap: 8, paddingBottom: 12 },
  chip: { paddingHorizontal: 12, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', justifyContent: 'center' },
  chipOn: { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  chipText: { fontSize: 13, color: '#475569' },
  chipTextOn: { color: '#1d4ed8', fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', color: '#1e293b', marginBottom: 8 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cc: { fontSize: 16, fontWeight: '600', color: '#334155', minWidth: 40 },
  input: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#1e293b',
  },
  phoneInput: { flex: 1 },
  codeInput: { textAlign: 'center', fontSize: 24, letterSpacing: 8, marginBottom: 12 },
  error: { color: '#dc2626', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  primary: { backgroundColor: '#3b82f6', borderRadius: 8, height: 48, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  dim: { opacity: 0.6 },
  note: { marginTop: 10, fontSize: 12, color: '#94a3b8', textAlign: 'center' },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  link: { color: '#2563eb', fontSize: 14, fontWeight: '500', paddingVertical: 4 },
  linkOff: { color: '#94a3b8' },
  linkGray: { color: '#64748b', fontSize: 14, paddingVertical: 4 },
  cancel: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  cancelText: { color: '#64748b', fontSize: 15 },
});
