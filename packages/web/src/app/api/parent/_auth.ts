import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { ParentLinkError } from '@/lib/parentLinksServer';
import { logger } from '@smis-mentor/shared';

/** 학부모 계정만 — 아니면 응답을 돌려준다 */
export async function parentOnly(request: NextRequest): Promise<{ uid: string } | NextResponse> {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  if (auth.user.role !== 'parent') return NextResponse.json({ error: '학부모 계정만 쓸 수 있습니다.' }, { status: 403 });
  return { uid: auth.firebaseUid };
}

export const parentFail = (e: unknown) => {
  if (e instanceof ParentLinkError) return NextResponse.json({ error: e.message }, { status: e.status });
  logger.error('학부모 요청 처리 실패:', e);
  return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 });
};

export const str = (v: unknown, max = 100) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
