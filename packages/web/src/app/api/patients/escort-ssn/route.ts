import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { writeAuditLog } from '@/lib/auditLog';
import { logger, myActiveEscortVisit } from '@smis-mentor/shared';

/**
 * 내원 인솔자용 학생 주민번호 원본
 * GET /api/patients/escort-ssn?recordId=xxx
 *
 * 병원 접수에 주민번호 뒷자리가 필요하므로, 환자 기록의 내원 인솔자(escort)로 지정된 사람에게만 원본을 준다.
 *  - 허용: 관리자, 또는 해당 기록의 "내원예정" 이거나 48시간 이내 "내원완료" 된 방문의 인솔자 본인(이름 일치)
 *  - 조회마다 감사 로그(ESCORT_SSN_VIEW)
 */

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  const recordId = new URL(request.url).searchParams.get('recordId')?.trim();
  if (!recordId) return NextResponse.json({ error: 'recordId 가 필요합니다.' }, { status: 400 });

  try {
    const db = getAdminFirestore();
    const recSnap = await db.collection('patientRecords').doc(recordId).get();
    if (!recSnap.exists) return NextResponse.json({ error: '환자 기록을 찾을 수 없습니다.' }, { status: 404 });
    const rec = recSnap.data() as any;
    const me = auth.user as any;
    const isAdmin = me.role === 'admin';

    let viaVisitId: string | null = null;
    if (!isAdmin) {
      // 같은 캠프 소속 확인
      const jc = await db.collection('jobCodes').where('code', '==', rec.campCode).limit(1).get();
      const jobCodeId = jc.empty ? null : jc.docs[0].id;
      const ids: string[] = Array.isArray(me.jobCodeIds) ? me.jobCodeIds : (me.jobExperiences ?? []).map((e: any) => e?.id);
      if (!jobCodeId || !ids.includes(jobCodeId)) {
        return NextResponse.json({ error: '이 캠프의 기록이 아닙니다.' }, { status: 403 });
      }
      const visit = myActiveEscortVisit(rec.hospitalVisits ?? [], me.name) as any;
      if (!visit) {
        return NextResponse.json({ error: '내원 인솔자로 지정된 경우에만 볼 수 있습니다.' }, { status: 403 });
      }
      viaVisitId = visit.visitId ?? null;
    }

    const sens = await db.collection('stSheetSensitive').doc(rec.campCode).get();
    const entries = (sens.data()?.entries ?? {}) as Record<string, { ssn?: string }>;
    const entry = entries[rec.studentId] ?? Object.entries(entries).find(([k]) => k.endsWith(`__${rec.studentId}`))?.[1];
    if (!entry?.ssn) {
      return NextResponse.json({ error: '주민번호 원본이 없습니다. 관리자에게 시트 동기화를 요청해주세요.' }, { status: 404 });
    }

    await writeAuditLog({
      action: 'ESCORT_SSN_VIEW',
      category: 'PRIVACY',
      performedBy: auth.firebaseUid,
      performedByName: me.name,
      targetLabel: `${rec.campCode} ${rec.studentName ?? rec.studentId}`,
      metadata: { recordId, visitId: viaVisitId, asAdmin: isAdmin },
      request,
    });
    return NextResponse.json({ ssn: entry.ssn });
  } catch (e) {
    logger.error('인솔자 주민번호 조회 실패:', e);
    return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });
  }
}
