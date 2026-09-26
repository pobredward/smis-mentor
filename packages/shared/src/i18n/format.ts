/**
 * 날짜·시간 표기 — 언어별로 다르게 (원어민: 영어식, 한국어: 한국식)
 * 시간대는 기기 현지 시간 (싱가포르·말레이시아 캠프에 있으면 현지 시간으로 보인다)
 */
import type { Locale } from './index';
import { getCurrentLocale } from './index';

type DateLike = Date | { toDate: () => Date } | string | number | null | undefined;

const toDate = (v: DateLike): Date | null => {
  if (v === null || v === undefined || v === '') return null;
  const d = typeof v === 'object' && 'toDate' in v ? v.toDate() : v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const INTL: Record<Locale, string> = { ko: 'ko-KR', en: 'en-US' };

export type DateStyle =
  | 'date'      // 2026년 9월 26일 (토)   · Sat, Sep 26, 2026
  | 'dateShort' // 9월 26일 (토)          · Sat, Sep 26
  | 'md'        // 9/26                   · 9/26
  | 'time'      // 14:30                  · 2:30 PM
  | 'dateTime'  // 9월 26일 (토) 14:30    · Sat, Sep 26, 2:30 PM
  | 'monthYear' // 2026년 9월             · September 2026
  | 'weekday'   // 토                     · Sat
  | 'mdw';      // 9/26(토)               · Sat 9/26

const OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  date: { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' },
  dateShort: { month: 'long', day: 'numeric', weekday: 'short' },
  md: { month: 'numeric', day: 'numeric' },
  time: { hour: '2-digit', minute: '2-digit' },
  dateTime: { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' },
  monthYear: { year: 'numeric', month: 'long' },
  weekday: { weekday: 'short' },
  mdw: { month: 'numeric', day: 'numeric', weekday: 'short' },
};

/** 언어에 맞는 날짜 문자열 (잘못된 값이면 '') */
export function formatDateL(locale: Locale, value: DateLike, style: DateStyle = 'date'): string {
  const d = toDate(value);
  if (!d) return '';
  if (style === 'mdw') {
    const wd = d.toLocaleString(INTL[locale], { weekday: 'short' });
    return locale === 'en' ? `${wd} ${d.getMonth() + 1}/${d.getDate()}` : `${d.getMonth() + 1}/${d.getDate()}(${wd})`;
  }
  const opts: Intl.DateTimeFormatOptions = { ...OPTIONS[style] };
  if (style === 'time' || style === 'dateTime') opts.hour12 = locale === 'en';
  if (locale === 'en' && style === 'dateShort') opts.month = 'short';
  if (locale === 'en' && style === 'date') opts.month = 'short';
  if (locale === 'en' && style === 'dateTime') opts.month = 'short';
  return d.toLocaleString(INTL[locale], opts);
}

/** Intl 로케일 문자열 ('ko-KR' | 'en-US') — toLocaleDateString 에 직접 넘길 때 */
export const intlLocale = (locale: Locale): string => INTL[locale];

/** 현재 화면 언어로 날짜 문자열 */
export const fmtDate = (value: DateLike, style: DateStyle = 'date'): string => formatDateL(getCurrentLocale(), value, style);
/** 현재 화면 언어의 Intl 로케일 */
export const currentIntlLocale = (): string => INTL[getCurrentLocale()];
