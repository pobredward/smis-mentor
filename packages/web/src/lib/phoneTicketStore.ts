/**
 * 문자 인증한 번호의 확인 표 (이 탭의 sessionStorage) — 가입 마지막 단계(complete-signup)에 함께 보낸다.
 * 서버 표는 30분짜리라 여기서는 25분 안의 것만 쓴다.
 */
import { samePhone } from '@smis-mentor/shared';

const KEY = 'smis_phone_ticket';
const TTL = 25 * 60 * 1000;

interface Stored { ticket: string; phone: string; at: number }

function read(): Stored | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Stored) : null;
    return v && typeof v.ticket === 'string' && typeof v.phone === 'string' && Date.now() - v.at < TTL ? v : null;
  } catch {
    return null;
  }
}

export const phoneTicketStore = {
  save(ticket: string, phone: string) {
    try { window.sessionStorage.setItem(KEY, JSON.stringify({ ticket, phone, at: Date.now() })); } catch { /* 표시용 아님 — 무시 */ }
  },
  /** 이 번호(형식 무관)의 유효한 표 */
  ticketFor(phone: unknown): string | undefined {
    const v = read();
    return v && phone && samePhone(v.phone, phone) ? v.ticket : undefined;
  },
  /** 저장된 표의 번호 (E.164) */
  phone(): string | undefined {
    return read()?.phone;
  },
  clear() {
    try { window.sessionStorage.removeItem(KEY); } catch { /* 무시 */ }
  },
};
