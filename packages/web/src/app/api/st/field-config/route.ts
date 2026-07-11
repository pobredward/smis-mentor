import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { getAuthenticatedUser, requireMentor } from '@/lib/authMiddleware';
import { getDefaultFieldConfig, type CampType } from '@smis-mentor/shared';

const COLLECTION = 'stSheetFieldConfig';

/**
 * GET /api/st/field-config?campType=EJ
 * 캠프 운영진(admin, mentor, foreign) 이상 접근 가능
 */
export async function GET(req: NextRequest) {
  const authUser = await getAuthenticatedUser(req);
  const mentorCheck = requireMentor(authUser);
  if (mentorCheck) return mentorCheck;

  const campType = req.nextUrl.searchParams.get('campType') as CampType | null;
  if (!campType) {
    return NextResponse.json({ error: 'campType 파라미터가 필요합니다.' }, { status: 400 });
  }

  const db = getAdminFirestore();
  const snap = await db.collection(COLLECTION).doc(campType).get();

  if (!snap.exists) {
    return NextResponse.json(getDefaultFieldConfig(campType));
  }

  return NextResponse.json(snap.data());
}
