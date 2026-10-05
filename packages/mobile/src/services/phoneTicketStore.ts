/**
 * 문자 인증한 번호의 확인 표 (앱 메모리) — 가입 마지막 단계(complete-signup)에 함께 보낸다.
 * 서버 표는 30분짜리라 여기서는 25분 안의 것만 쓴다. 앱을 다시 켜면 사라진다 (가입 중 다시 인증).
 */
import { samePhone } from '@smis-mentor/shared';

const TTL = 25 * 60 * 1000;
let stored: { ticket: string; phone: string; at: number } | null = null;

const fresh = () => (stored && Date.now() - stored.at < TTL ? stored : null);

export const phoneTicketStore = {
  save(ticket: string, phone: string) {
    stored = { ticket, phone, at: Date.now() };
  },
  /** 이 번호(형식 무관)의 유효한 표 */
  ticketFor(phone: unknown): string | undefined {
    const v = fresh();
    return v && phone && samePhone(v.phone, phone) ? v.ticket : undefined;
  },
  clear() {
    stored = null;
  },
};
