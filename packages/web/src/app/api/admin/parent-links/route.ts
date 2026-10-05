import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';
import { writeAuditLog } from '@/lib/auditLog';
import { addParentLink, getParentLinks, listLinkCandidates, removeParentLink, ParentLinkError } from '@/lib/parentLinksServer';
import { logger } from '@smis-mentor/shared';

/**
 * 관리자: 학부모 계정에 아이(캠프 학생) 연결
 * GET    ?parentUid=…                 → 연결된 아이 목록
 * GET    ?parentUid=…&campCode=J29    → 그 캠프 학생 목록 (보호자 번호가 같은 학생이 앞, 연락처는 주지 않음)
 * POST   { parentUid, campCode, studentId }  → 연결
 * DELETE { parentUid, campCode, studentId }  → 해제
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
  const campCode = clean(sp.get('campCode'), 20);
  if (!parentUid) return NextResponse.json({ error: 'parentUid 가 필요합니다.' }, { status: 400 });
  try {
    if (campCode) return NextResponse.json({ students: await listLinkCandidates(parentUid, campCode) });
    return NextResponse.json({ children: await getParentLinks(parentUid) });
  } catch (e) {
    return fail(e);
  }
}

async function change(request: NextRequest, op: 'add' | 'remove') {
  const auth = await getAuthenticatedUser(request);
  const denied = requireAdmin(auth);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const parentUid = clean(body?.parentUid);
  const campCode = clean(body?.campCode, 20);
  const studentId = clean(body?.studentId);
  if (!parentUid || !campCode || !studentId) return NextResponse.json({ error: 'parentUid · campCode · studentId 가 필요합니다.' }, { status: 400 });
  try {
    const children = op === 'add'
      ? await addParentLink(parentUid, campCode, studentId, auth!.firebaseUid)
      : await removeParentLink(parentUid, campCode, studentId);
    await writeAuditLog({
      action: 'PARENT_CHILD_LINK', category: 'ACCOUNT', performedBy: auth!.firebaseUid, performedByName: (auth!.user as any)?.name,
      targetUserId: parentUid, metadata: { op, campCode, studentId }, request,
    });
    return NextResponse.json({ children });
  } catch (e) {
    return fail(e);
  }
}

export const POST = (request: NextRequest) => change(request, 'add');
export const DELETE = (request: NextRequest) => change(request, 'remove');
