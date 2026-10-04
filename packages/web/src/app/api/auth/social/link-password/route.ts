import { NextRequest, NextResponse } from 'next/server';
import { IdentityError } from '@/lib/authIdentity';
import { linkWithPassword } from '@/lib/socialLoginServer';
import { logger } from '@smis-mentor/shared';

/**
 * POST /api/auth/social/link-password — 같은 이메일의 기존 계정에 소셜을 연결 (비밀번호 확인)
 * body: { linkTicket (POST /api/auth/social 의 LINK_ACTIVE), password } → { result: { userId, customToken } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await linkWithPassword(body?.linkTicket, body?.password);
    return NextResponse.json({ result });
  } catch (e) {
    if (e instanceof IdentityError) {
      return NextResponse.json({ error: { status: e.code, message: e.message } }, { status: e.status });
    }
    logger.error('❌ 비밀번호 연결 실패:', e);
    return NextResponse.json({ error: { status: 'INTERNAL', message: '계정 연결 중 오류가 발생했습니다.' } }, { status: 500 });
  }
}
