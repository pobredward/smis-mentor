import { NextRequest, NextResponse } from 'next/server';
import { parentCreateChild, parentUpdateChild } from '@/lib/parentLinksServer';
import { parentOnly, parentFail, str } from '../_auth';

/**
 * 학부모: 아이 등록 · 고치기 (읽기는 앱이 규칙으로 바로 — children where parentIds array-contains 내 uid)
 * POST { child, ssn?, consent }   → 등록 (보호자 동의 필수 · 인증된 내 번호 + 이름이 같은 아이가 이미 있으면 그 아이와 이어진다)
 * PUT  { childId, child, ssn? }   → 고치기
 * 주민등록번호는 암호화해서 서버에만 — 앱에는 가린 값(YYMMDD-G******)만 보인다.
 */
export async function POST(request: NextRequest) {
  const me = await parentOnly(request);
  if (me instanceof NextResponse) return me;
  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(await parentCreateChild(me.uid, body?.child, str(body?.ssn, 20) || undefined, body?.consent === true));
  } catch (e) {
    return parentFail(e);
  }
}

export async function PUT(request: NextRequest) {
  const me = await parentOnly(request);
  if (me instanceof NextResponse) return me;
  const body = await request.json().catch(() => ({}));
  const childId = str(body?.childId, 40);
  if (!childId) return NextResponse.json({ error: 'childId 가 필요합니다.' }, { status: 400 });
  try {
    await parentUpdateChild(me.uid, childId, body?.child, str(body?.ssn, 20) || undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return parentFail(e);
  }
}
