import { describe, expect, it } from './_expect';
import { checkTempAccountByPhone } from '../src/services/socialAuthService';

const social = { providerId: 'google.com', providerUid: 'g1', email: 'a@gmail.com', name: 'Hong Gildong' } as never;

describe('소셜 가입 — 전화번호로 temp 계정 확인', () => {
  it('이름은 공백 무시하고 비교, 직무 코드는 jobExperiences 의 id 로 조회', async () => {
    let asked: string[] = [];
    const r = await checkTempAccountByPhone(
      '01012345678',
      { ...(social as object), name: '홍길동' } as never,
      async () => ({ userId: 't1', name: '홍 길동', status: 'temp', role: 'mentor_temp', email: '', jobExperiences: [{ id: 'jc1', group: '주니어', groupRole: '담임' }] }) as never,
      async (ids) => { asked = ids; return [{ generation: '29기', code: 'J29', name: '제주' }]; },
    );
    expect(r.found).toBe(true);
    expect(r.nameMatches).toBe(true);
    expect(asked).toEqual(['jc1']);
  });
  it('계정 없으면 found=false', async () => {
    const r = await checkTempAccountByPhone('010', social, async () => null);
    expect(r.found).toBe(false);
  });
});
