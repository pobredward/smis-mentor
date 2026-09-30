import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';
import { writeAuditLog } from '@/lib/auditLog';
import { loadCampRoster, previewCampRoster, saveCampRoster, CampRosterError } from '@/lib/campRosterSheetServer';
import { logger } from '@smis-mentor/shared';

/**
 * 관리자: 캠프 선생님 표 (campRosters/{jobCodeId})
 * GET  ?jobCodeId=…                                   → 표 (S 캠프는 민감 칸 원본 포함 — 열람 기록)
 * POST { jobCodeId, mentors, foreign }                → 이름 매칭 미리보기 + 표에서 빠져 배정 해제될 사람
 * PUT  { jobCodeId, mentors, foreign, removeUserIds } → 저장 (캠프 배정·영어 이름·반 정보·숙소 방·S 개인정보 반영)
 */
const fail = (e: unknown, what: string) => {
  if (e instanceof CampRosterError) return NextResponse.json({ error: e.message }, { status: e.status });
  logger.error(`캠프 선생님 표 ${what} 실패:`, e);
  return NextResponse.json({ error: `${what}에 실패했습니다.` }, { status: 500 });
};

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  const denied = requireAdmin(auth);
  if (denied) return denied;
  const jobCodeId = new URL(request.url).searchParams.get('jobCodeId')?.trim() ?? '';
  if (!jobCodeId) return NextResponse.json({ error: 'jobCodeId 가 필요합니다.' }, { status: 400 });
  try {
    const res = await loadCampRoster(jobCodeId);
    if (res.revealed) {
      await writeAuditLog({
        action: 'CAMP_PROFILE_REVEAL', category: 'PRIVACY', performedBy: auth!.firebaseUid, performedByName: (auth!.user as any)?.name,
        targetLabel: `${res.jobCode.code} 선생님 표`, metadata: { scope: 'camp-roster', campCode: res.jobCode.code }, request,
      });
    }
    return NextResponse.json(res);
  } catch (e) {
    return fail(e, '조회');
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  const denied = requireAdmin(auth);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const jobCodeId = typeof body?.jobCodeId === 'string' ? body.jobCodeId : '';
  if (!jobCodeId) return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  try {
    return NextResponse.json(await previewCampRoster(jobCodeId, { mentors: Array.isArray(body.mentors) ? body.mentors : [], foreign: Array.isArray(body.foreign) ? body.foreign : [] }));
  } catch (e) {
    return fail(e, '매칭');
  }
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  const denied = requireAdmin(auth);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const jobCodeId = typeof body?.jobCodeId === 'string' ? body.jobCodeId : '';
  if (!jobCodeId) return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  try {
    const res = await saveCampRoster(
      jobCodeId,
      {
        mentors: Array.isArray(body.mentors) ? body.mentors : [],
        foreign: Array.isArray(body.foreign) ? body.foreign : [],
        removeUserIds: Array.isArray(body.removeUserIds) ? body.removeUserIds.filter((x: unknown) => typeof x === 'string') : [],
      },
      { uid: auth!.firebaseUid, name: (auth!.user as any)?.name },
    );
    await writeAuditLog({
      action: 'USER_CAMP_CHANGE', category: 'ACCOUNT', performedBy: auth!.firebaseUid, performedByName: (auth!.user as any)?.name,
      targetLabel: `캠프 선생님 표 저장 (${jobCodeId})`, metadata: { by: 'camp-roster', jobCodeId, assigned: res.assigned, removed: res.removed }, request,
    });
    return NextResponse.json(res);
  } catch (e) {
    return fail(e, '저장');
  }
}
