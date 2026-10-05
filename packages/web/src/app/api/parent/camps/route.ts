import { NextRequest, NextResponse } from 'next/server';
import { listOpenCamps } from '@/lib/parentLinksServer';
import { parentOnly, parentFail } from '../_auth';

/** 학부모: 지금 신청을 받는 캠프 (관리자 › 학생 명단 관리 › '학부모 신청 받기') */
export async function GET(request: NextRequest) {
  const me = await parentOnly(request);
  if (me instanceof NextResponse) return me;
  try {
    return NextResponse.json({ camps: await listOpenCamps() });
  } catch (e) {
    return parentFail(e);
  }
}
