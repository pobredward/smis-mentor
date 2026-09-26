import { describe, expect, it } from './_expect';
import { createUserLookup } from '../src/services/userLookup';

function withFetch(reply: (body: Record<string, unknown>) => unknown) {
  const calls: Array<Record<string, unknown>> = [];
  (globalThis as { fetch: unknown }).fetch = async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return { ok: true, json: async () => ({ user: reply(body) }) };
  };
  return calls;
}

describe('사용자 조회 — 로그인 전에는 서버 API', () => {
  const lookup = createUserLookup({} as never, { currentUser: null }, 'https://x');

  it('탈퇴 포함 전화번호 조회가 includeDeleted 로 서버에 간다 (예전 모바일은 늘 없음)', async () => {
    const calls = withFetch(() => ({ userId: 'u1', status: 'inactive', name: '(탈퇴) 홍길동' }));
    const u = await lookup.getUserByPhoneIncludeDeleted('01012345678');
    expect(calls[0]).toEqual({ by: 'phone', phone: '01012345678', includeDeleted: true });
    expect(u?.status).toBe('inactive');
  });

  it('이메일 탈퇴 조회는 탈퇴·삭제 계정일 때만 돌려준다', async () => {
    withFetch(() => ({ userId: 'u2', status: 'active' }));
    expect(await lookup.getUserByEmailIncludeInactive('A@B.com')).toBeNull();
    const calls = withFetch(() => ({ userId: 'u3', status: 'inactive' }));
    expect((await lookup.getUserByEmailIncludeInactive('A@B.com'))?.userId).toBe('u3');
    expect(calls[0]).toEqual({ by: 'email', email: 'a@b.com', includeInactive: true });
  });

  it('빈 값은 조회하지 않음', async () => {
    const calls = withFetch(() => null);
    expect(await lookup.getUserByPhone('')).toBeNull();
    expect(await lookup.getUserByEmail('')).toBeNull();
    expect(calls.length).toBe(0);
  });
});
