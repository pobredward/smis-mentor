import { readSsnByKey } from '@/lib/campStudentsServer';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';
import { writeAuditLog } from '@/lib/auditLog';
import { logger } from '@smis-mentor/shared';

/**
 * 학생·가족 주민번호 원본 조회 (관리자 전용, 건별)
 * GET /api/st/sensitive?campCode=J28&key=<studentId | familyId__personId>&label=<표시 이름>
 *
 * - 원본은 암호화해서 아이 children/{id}/private/identity · 가족 보호자 camps/{캠프}/families/{가족}/private/identity 에만 있다 (규칙상 클라이언트 읽기 불가).
 * - 조회할 때마다 감사 로그(STUDENT_SENSITIVE_VIEW)를 남긴다.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  const denied = requireAdmin(auth);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const campCode = searchParams.get('campCode')?.trim();
  const key = searchParams.get('key')?.trim();
  const label = searchParams.get('label')?.trim() || null;
  if (!campCode || !key) {
    return NextResponse.json({ error: 'campCode, key 가 필요합니다.' }, { status: 400 });
  }

  try {
    const ssn = await readSsnByKey(campCode, key);
    if (!ssn) {
      return NextResponse.json({ error: '주민등록번호가 등록되지 않았습니다.' }, { status: 404 });
    }
    await writeAuditLog({
      action: 'STUDENT_SENSITIVE_VIEW',
      category: 'PRIVACY',
      performedBy: auth!.firebaseUid,
      performedByName: (auth!.user as any)?.name,
      targetLabel: label ? `${campCode} ${label}` : `${campCode} ${key}`,
      metadata: { campCode, key, field: 'ssn' },
      request,
    });
    return NextResponse.json({ ssn });
  } catch (e) {
    logger.error('학생 민감정보 조회 실패:', e);
    return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });
  }
}
