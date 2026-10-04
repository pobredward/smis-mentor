/**
 * 짧게 쓰는 서명 표 (서버 전용) — 서버가 방금 확인한 소셜 신원을 다음 단계(비밀번호로 연결 등)로 넘길 때.
 * 표 = base64url(내용) + '.' + base64url(HMAC-SHA256). 비밀키: AUTH_TICKET_SECRET (없으면 서버 비밀키에서 만든다).
 */
import crypto from 'crypto';

function key(): Buffer {
  const base = process.env.AUTH_TICKET_SECRET || process.env.FIREBASE_PRIVATE_KEY || '';
  if (!base) throw new Error('AUTH_TICKET_SECRET 이 없습니다.');
  return crypto.createHash('sha256').update(`smis-auth-ticket:${base}`).digest();
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signTicket(kind: string, payload: Record<string, unknown>, ttlMs: number): string {
  const body = b64(JSON.stringify({ ...payload, k: kind, exp: Date.now() + ttlMs }));
  const sig = b64(crypto.createHmac('sha256', key()).update(body).digest());
  return `${body}.${sig}`;
}

/** 서명 · 종류 · 만료를 확인한 내용 (아니면 null) */
export function readTicket<T extends Record<string, unknown>>(kind: string, ticket: unknown): T | null {
  if (typeof ticket !== 'string' || ticket.length > 4000) return null;
  const [body, sig] = ticket.split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', key()).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { k?: string; exp?: number };
    if (data.k !== kind || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}
