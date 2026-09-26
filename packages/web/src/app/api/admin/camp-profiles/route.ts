import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { getCampProfileStatus, privateRef, revealCampProfile, CAMP_PROFILE_ROLES, audienceOf } from '@/lib/campProfileServer';
import { writeAuditLog } from '@/lib/auditLog';
import { buildRosterRow, applyRosterEdit, RosterEditError, SENSITIVE_ROSTER_FIELDS } from '@/lib/campRosterServer';
import { logger, campProfileTierOf, missingCampProfileFields, bankCountryDef, type CampProfileDoc } from '@smis-mentor/shared';

/**
 * 관리자: 캠프별 참가 정보 현황
 * GET ?campCode=S29                      → 멘토 목록 + 입력 현황 (주민번호·계좌는 가림)
 * GET ?campCode=S29&reveal=1             → 주민번호 뒷자리·계좌번호 원본 포함 (엑셀 내려받기용, 감사 로그)
 * GET ?userId=xxx&reveal=1               → 한 명 원본 (감사 로그)
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  const denied = requireAdmin(auth);
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  let campCode = searchParams.get('campCode')?.trim();
  const jobCodeIdParam = searchParams.get('jobCodeId')?.trim();
  const userId = searchParams.get('userId')?.trim();
  const reveal = searchParams.get('reveal') === '1';

  try {
    if (userId) {
      const status = await getCampProfileStatus(userId);
      const secrets = reveal ? await revealCampProfile(userId) : null;
      if (reveal) {
        await writeAuditLog({ action: 'CAMP_PROFILE_REVEAL', category: 'PRIVACY', performedBy: auth!.firebaseUid, performedByName: (auth!.user as any)?.name, targetUserId: userId, metadata: { scope: 'single' }, request });
      }
      return NextResponse.json({ status, secrets });
    }
    if (!campCode && !jobCodeIdParam) return NextResponse.json({ error: 'campCode·jobCodeId 또는 userId 가 필요합니다.' }, { status: 400 });

    const db = getAdminFirestore();
    let jobCodeId: string;
    if (jobCodeIdParam) {
      const d = await db.collection('jobCodes').doc(jobCodeIdParam).get();
      if (!d.exists) return NextResponse.json({ error: '캠프 코드를 찾을 수 없습니다.' }, { status: 404 });
      jobCodeId = d.id;
      campCode = String(d.data()?.code ?? '');
    } else {
      const jc = await db.collection('jobCodes').where('code', '==', campCode).limit(1).get();
      if (jc.empty) return NextResponse.json({ error: '캠프 코드를 찾을 수 없습니다.' }, { status: 404 });
      jobCodeId = jc.docs[0].id;
    }
    const code = campCode as string;
    const tier = campProfileTierOf([code]);
    const users = await db.collection('users').where('jobCodeIds', 'array-contains', jobCodeId).get();
    const members = users.docs.filter((d) => CAMP_PROFILE_ROLES.includes(String(d.data().role)) && d.data().status === 'active');

    const rows = await Promise.all(members.map((d) => buildRosterRow(d, jobCodeId, code, tier, reveal)));
    rows.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    if (reveal) {
      await writeAuditLog({ action: 'CAMP_PROFILE_REVEAL', category: 'PRIVACY', performedBy: auth!.firebaseUid, performedByName: (auth!.user as any)?.name, targetLabel: `${code} 전체 (${rows.length}명)`, metadata: { scope: 'camp', campCode: code, count: rows.length }, request });
    }
    return NextResponse.json({ campCode: code, tier, rows });
  } catch (e) {
    logger.error('캠프 참가 정보 현황 조회 실패:', e);
    return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });
  }
}

/**
 * PATCH { userId, jobCodeId, field, value, reveal? } — 관리자 표에서 셀 하나 수정
 * 저장 후 그 사람의 행을 다시 만들어 돌려준다 (reveal 이면 원본 포함, 열람 기록)
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  const denied = requireAdmin(auth);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  const jobCodeId = typeof body?.jobCodeId === 'string' ? body.jobCodeId : '';
  const field = typeof body?.field === 'string' ? body.field : '';
  if (!userId || !jobCodeId || !field) return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  try {
    const db = getAdminFirestore();
    const jc = await db.collection('jobCodes').doc(jobCodeId).get();
    if (!jc.exists) return NextResponse.json({ error: '캠프 코드를 찾을 수 없습니다.' }, { status: 404 });
    await applyRosterEdit(userId, jobCodeId, field, body.value);
    const sensitive = SENSITIVE_ROSTER_FIELDS.has(field);
    await writeAuditLog({
      action: 'CAMP_PROFILE_UPDATE', category: 'PRIVACY', performedBy: auth!.firebaseUid, performedByName: (auth!.user as any)?.name,
      targetUserId: userId, metadata: { by: 'admin-roster', field, ...(sensitive ? {} : { value: body.value ?? '' }) }, request,
    });
    const code = String(jc.data()?.code ?? '');
    const row = await buildRosterRow(await db.collection('users').doc(userId).get(), jobCodeId, code, campProfileTierOf([code]), body.reveal === true);
    return NextResponse.json({ row });
  } catch (e) {
    if (e instanceof RosterEditError) return NextResponse.json({ error: e.message }, { status: e.status });
    logger.error('관리자 표 수정 실패:', e);
    return NextResponse.json({ error: '저장하지 못했습니다.' }, { status: 500 });
  }
}

/**
 * POST { jobCodeId, edits: [{ userId, field, value }], reveal? } — 엑셀에서 붙여넣은 여러 칸을 한 번에 저장
 * 칸마다 검증하고, 실패한 칸은 이유와 함께 돌려준다. 바뀐 사람들의 행을 다시 만들어 돌려준다.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  const denied = requireAdmin(auth);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const jobCodeId = typeof body?.jobCodeId === 'string' ? body.jobCodeId : '';
  const edits: Array<{ userId: string; field: string; value: unknown }> = Array.isArray(body?.edits) ? body.edits : [];
  if (!jobCodeId || !edits.length) return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  if (edits.length > 1000) return NextResponse.json({ error: '한 번에 1000칸까지 붙여넣을 수 있습니다.' }, { status: 400 });
  const db = getAdminFirestore();
  const jc = await db.collection('jobCodes').doc(jobCodeId).get();
  if (!jc.exists) return NextResponse.json({ error: '캠프 코드를 찾을 수 없습니다.' }, { status: 404 });
  const code = String(jc.data()?.code ?? '');

  let saved = 0;
  const failed: Array<{ userId: string; field: string; error: string }> = [];
  const touched = new Set<string>();
  // 같은 사람의 여러 칸이 서로 덮어쓰지 않게 순서대로 저장
  for (const ed of edits) {
    if (typeof ed?.userId !== 'string' || typeof ed?.field !== 'string') continue;
    try {
      await applyRosterEdit(ed.userId, jobCodeId, ed.field, ed.value);
      saved++;
      touched.add(ed.userId);
      await writeAuditLog({
        action: 'CAMP_PROFILE_UPDATE', category: 'PRIVACY', performedBy: auth!.firebaseUid, performedByName: (auth!.user as any)?.name,
        targetUserId: ed.userId, metadata: { by: 'admin-roster-paste', field: ed.field, ...(SENSITIVE_ROSTER_FIELDS.has(ed.field) ? {} : { value: ed.value ?? '' }) }, request,
      });
    } catch (e) {
      failed.push({ userId: ed.userId, field: ed.field, error: e instanceof RosterEditError ? e.message : '저장 실패' });
      if (!(e instanceof RosterEditError)) logger.error('붙여넣기 저장 실패:', e);
    }
  }
  const tier = campProfileTierOf([code]);
  const rows = await Promise.all([...touched].map(async (uid) => buildRosterRow(await db.collection('users').doc(uid).get(), jobCodeId, code, tier, body.reveal === true)));
  return NextResponse.json({ saved, failed, rows });
}
