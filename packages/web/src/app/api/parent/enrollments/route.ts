import { NextRequest, NextResponse } from 'next/server';
import { parentApply, parentUpdateApplication, parentWithdraw } from '@/lib/parentLinksServer';
import { parentOnly, parentFail, str } from '../_auth';

/**
 * 학부모: 캠프 신청 (읽기는 앱이 규칙으로 바로 — collectionGroup enrollments where parentIds array-contains 내 uid)
 * POST   { campCode, childId, answers }     → 신청 (상태 '신청' — 운영진이 확정)
 * PUT    { campCode, studentId, answers }   → 신청서 고치기 (확정 뒤엔 설문 · 단체티만)
 * DELETE { campCode, studentId }            → 신청 철회 (확정 전까지)
 */
const camp = (v: unknown) => str(v, 20).toUpperCase();

export async function POST(request: NextRequest) {
  const me = await parentOnly(request);
  if (me instanceof NextResponse) return me;
  const body = await request.json().catch(() => ({}));
  const campCode = camp(body?.campCode);
  const childId = str(body?.childId, 40);
  if (!campCode || !childId) return NextResponse.json({ error: 'campCode · childId 가 필요합니다.' }, { status: 400 });
  try {
    const enr = await parentApply(me.uid, campCode, childId, body?.answers);
    return NextResponse.json({ ok: true, studentId: enr.studentId });
  } catch (e) {
    return parentFail(e);
  }
}

export async function PUT(request: NextRequest) {
  const me = await parentOnly(request);
  if (me instanceof NextResponse) return me;
  const body = await request.json().catch(() => ({}));
  const campCode = camp(body?.campCode);
  const studentId = str(body?.studentId, 100);
  if (!campCode || !studentId) return NextResponse.json({ error: 'campCode · studentId 가 필요합니다.' }, { status: 400 });
  try {
    await parentUpdateApplication(me.uid, campCode, studentId, body?.answers);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return parentFail(e);
  }
}

export async function DELETE(request: NextRequest) {
  const me = await parentOnly(request);
  if (me instanceof NextResponse) return me;
  const body = await request.json().catch(() => ({}));
  const campCode = camp(body?.campCode);
  const studentId = str(body?.studentId, 100);
  if (!campCode || !studentId) return NextResponse.json({ error: 'campCode · studentId 가 필요합니다.' }, { status: 400 });
  try {
    await parentWithdraw(me.uid, campCode, studentId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return parentFail(e);
  }
}
