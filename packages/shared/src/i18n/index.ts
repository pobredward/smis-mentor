/**
 * 화면 문구 사전 (한국어 · 영어) — web·mobile 공용
 *
 * 구성 (i18next·next-intl 같은 라이브러리와 같은 방식을 작게 구현)
 *  - messages/ko.ts : 원본 문구 (키 → 한국어)
 *  - messages/en.ts : 같은 키 → 영어. 타입이 ko 와 같아서 키가 빠지면 컴파일 오류
 *  - t(locale, key, vars) : 문구 꺼내기. {{name}} 자리에 값을 끼워 넣고, 영어가 비어 있으면 한국어로 대체
 *  - tr(isEnglish, key, vars) : 예전 `isForeign ? 'EN' : 'KO'` 를 그대로 옮긴 형태 (같은 조건값을 받음)
 *
 * 언어는 계정 역할로 정한다 — 원어민(foreign, foreign_temp)이면 영어.
 * 날짜·숫자 형식은 사전이 아니라 Intl(toLocaleDateString 등)에 locale 을 넘겨 처리한다.
 */
import { ko } from './messages/ko';
import { en } from './messages/en';

export type Locale = 'ko' | 'en';
export type Messages = typeof ko;

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** 'task.save' 같은 문구 키 */
export type MessageKey = Leaves<Messages>;
export type MessageVars = Record<string, string | number | null | undefined>;

const CATALOG: Record<Locale, Messages> = { ko, en };

/** 원어민 역할인가 */
export const isForeignRole = (role?: string | null): boolean => role === 'foreign' || role === 'foreign_temp';
/** 역할 → 기본 화면 언어 (원어민이면 영어) */
export const localeOfRole = (role?: string | null): Locale => (isForeignRole(role) ? 'en' : 'ko');
export const LOCALES: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
];
const isLocale = (v: unknown): v is Locale => v === 'ko' || v === 'en';
/**
 * 화면 언어 — 항상 '보는 사람' 기준.
 * 계정에 고른 언어(users.locale)가 있으면 그것, 없으면 역할로 (원어민 영어, 나머지 한국어)
 */
export const localeOfUser = (user?: { role?: string | null; locale?: string | null } | null): Locale =>
  isLocale(user?.locale) ? user!.locale as Locale : localeOfRole(user?.role);
/** 영어 화면으로 보는 사람인가 — 예전 isForeign 자리에 쓴다 */
export const isEnglishViewer = (user?: { role?: string | null; locale?: string | null } | null): boolean => localeOfUser(user) === 'en';

function lookup(messages: Messages, key: string): string | undefined {
  let cur: unknown = messages;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as object)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(text: string, vars?: MessageVars): string {
  if (!vars) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (m, name: string) => (name in vars ? String(vars[name] ?? '') : m));
}

/** 문구 꺼내기 — 없는 키면 키 자체를 돌려 화면에서 바로 보이게 한다 */
export function t(locale: Locale, key: MessageKey, vars?: MessageVars): string {
  const text = lookup(CATALOG[locale], key) || lookup(ko, key) || key;
  return interpolate(text, vars);
}

// ── 현재 화면 언어 (로그인한 사람 기준) ─────────────────────────────
// web·mobile 의 AuthContext 가 사용자 정보를 받을 때마다 setCurrentLocale 로 맞춘다.
// 화면 코드는 L('ns.key') 로 문구를 꺼낸다 — 누구의 역할도 넘길 필요가 없다 (항상 보는 사람 기준).
// 서버(API·푸시)는 이 값을 쓰지 말고 받는 사람 언어로 t(locale, …) 를 쓴다.
let currentLocale: Locale = 'ko';
export const setCurrentLocale = (locale: Locale): void => { currentLocale = locale; };
export const getCurrentLocale = (): Locale => currentLocale;
/** 지금 화면이 영어인가 */
export const isEnglishUI = (): boolean => currentLocale === 'en';
/** 현재 화면 언어로 문구 꺼내기 */
export const L = (key: MessageKey, vars?: MessageVars): string => t(currentLocale, key, vars);

/** `isEnglish ? 영어 : 한국어` 를 사전으로 옮긴 형태 (받는 사람이 정해진 경우 — 공용 함수·서버) */
export const tr = (isEnglish: boolean | null | undefined, key: MessageKey, vars?: MessageVars): string =>
  t(isEnglish ? 'en' : 'ko', key, vars);

/**
 * 데이터에 한국어로 저장된 값(시트·DB 의 '미배정', '내원예정', '2인 가족' 등)을 화면에 보일 때 쓰는 라벨.
 * 값 자체는 바꾸지 않고(비교·저장은 원래 값으로) 표시만 보는 사람 언어로 바꾼다.
 * 사전의 `data` 네임스페이스에 한국어 값이 그대로 들어 있으면 그 번역을, 없으면 원래 값을 돌려준다.
 */
const dataIndex: Record<string, string> = Object.fromEntries(
  Object.entries(ko.data as Record<string, string>).map(([k, v]) => [v, k]),
);
const DATA_PATTERNS: ReadonlyArray<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^(\d+)인 가족$/, (m) => t('en', 'data.familyOfN', { v0: m[1] })],
  [/^차량(\d+)$/, (m) => t('en', 'data.carN', { v0: m[1] })],
  [/^택시(\d+)$/, (m) => t('en', 'data.taxiN', { v0: m[1] })],
  [/^체온계로 정상 체온 \(([\d.]+)°C 미만\)$/, (m) => t('en', 'data.retThermoNormal', { v0: m[1] })],
  [/^열 없음 \(([\d.]+)°C 미만\)$/, (m) => t('en', 'data.retNoFever', { v0: m[1] })],
];
export function dataLabel(value: string | null | undefined): string {
  if (value == null) return '';
  if (currentLocale !== 'en') return value;
  const k = dataIndex[value];
  if (k) return (en.data as Record<string, string>)[k];
  for (const [re, fn] of DATA_PATTERNS) {
    const m = value.match(re);
    if (m) return fn(m);
  }
  return value;
}

/**
 * 한국어 값을 가진 표시용 라벨 상수(Record·배열)를 감싸, 읽을 때 보는 사람 언어로 돌려준다.
 * 키·구조는 그대로라 기존 코드(LABELS[k], Object.entries 등)를 바꿀 필요가 없다.
 * 번역은 사전의 `data` 네임스페이스(dataLabel)에서 찾는다.
 */
export function localizeLabels<T extends object>(obj: T): T {
  const cache = new WeakMap<object, object>();
  const wrap = (o: object): object => {
    const hit = cache.get(o);
    if (hit) return hit;
    const p = new Proxy(o, {
      get(target, prop, receiver) {
        const v = Reflect.get(target, prop, receiver);
        if (typeof v === 'string') return dataLabel(v);
        if (v && typeof v === 'object' && !(v instanceof RegExp)) return wrap(v);
        return v;
      },
    });
    cache.set(o, p);
    return p;
  };
  return wrap(obj) as T;
}

export { ko as koMessages, en as enMessages };
export * from './format';
