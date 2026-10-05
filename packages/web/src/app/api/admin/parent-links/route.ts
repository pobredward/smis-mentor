import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';
import { writeAuditLog } from '@/lib/auditLog';
import { linkChild, listLinkCandidates, listParentChildren, ParentLinkError } from '@/lib/parentLinksServer';
import { logger } from '@smis-mentor/shared';

/**
 * 관리자: 학부모 계정에 아이 연결 (아이 문서 parentIds)
 * GET    ?parentUid=…                → 연결된 아이 (+ 참가한 캠프)
 * GET    ?parentUid=…&candidates=1&q=… → 연결 후보 (검색어 없으면 학부모 번호와 보호자 번호가 같은 아이, 연락처는 주지 않음)
 * POST   { parentUid, childId }      → 연결
 * DELETE { parentUid, childId }      → 해제
 */
const fail = (e: unknown) => {
  if (e instanceof ParentLinkError) return NextResponse.json({ error: e.message }, { status: e.status });
  logger.error('학부모 연결 처리 실패:', e);
  return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 });
};
const clean = (v: unknown, max = 128) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  const denied = requireAdmin(auth);
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const parentUid = clean(sp.get('parentUid'));
  if (!parentUid) return NextResponse.json({ error: 'parentUid 가 필요합니다.' }, { status: 400 });
  try {
    if (sp.get('candidates')) return NextResponse.json({ candidates: await listLinkCandidates(parentUid, clean(sp.get('q'), 50)) });
    return NextResponse.json({ children: await listParentChildren(parentUid) });
  } catch (e) {
    return fail(e);
  }
}

async function change(request: NextRequest, linked: boolean) {
  const auth = await getAuthenticatedUser(request);
  const denied = requireAdmin(auth);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const parentUid = clean(body?.parentUid);
  const childId = clean(body?.childId, 40);
  if (!parentUid || !childId) return NextResponse.json({ error: 'parentUid · childId 가 필요합니다.' }, { status: 400 });
  try {
    const children = await linkChild(parentUid, childId, linked);
    await writeAuditLog({
      action: 'PARENT_CHILD_LINK', category: 'ACCOUNT', performedBy: auth!.firebaseUid, performedByName: (auth!.user as any)?.name,
      targetUserId: parentUid, metadata: { op: linked ? 'add' : 'remove', childId }, request,
    });
    return NextResponse.json({ children });
  } catch (e) {
    return fail(e);
  }
}

export const POST = (request: NextRequest) => change(request, true);
export const DELETE = (request: NextRequest) => change(request, false);
