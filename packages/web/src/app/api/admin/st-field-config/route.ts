import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';
import { CAMP_SHEET_CONFIG, type STSheetFieldConfig, type CampType } from '@smis-mentor/shared';

const COLLECTION = 'stSheetFieldConfig';

/**
 * GET /api/admin/st-field-config?campType=EJ
 * fieldConfig + availableHeaders(가장 최근 캠프 기준)를 함께 반환
 */
export async function GET(req: NextRequest) {
  const authUser = await getAuthenticatedUser(req);
  const adminCheck = requireAdmin(authUser);
  if (adminCheck) return adminCheck;

  const campType = req.nextUrl.searchParams.get('campType') as CampType | null;
  if (!campType) {
    return NextResponse.json({ error: 'campType 파라미터가 필요합니다.' }, { status: 400 });
  }

  const db = getAdminFirestore();

  // fieldConfig 조회
  const configSnap = await db.collection(COLLECTION).doc(campType).get();
  const config = configSnap.exists ? configSnap.data() : null;

  // 해당 campType의 가장 최근 캠프에서 availableHeaders 조회
  const codesForType = Object.entries(CAMP_SHEET_CONFIG)
    .filter(([, cfg]) => cfg.type === campType)
    .map(([code]) => code)
    .sort((a, b) => b.localeCompare(a)); // 역순 = 최신 기수 우선

  let availableHeaders: string[] = [];
  for (const code of codesForType) {
    const settingsSnap = await db.collection('campSettings').doc(code).get();
    const headers = settingsSnap.data()?.availableHeaders as string[] | undefined;
    if (headers && headers.length > 0) {
      availableHeaders = headers;
      break;
    }
  }

  return NextResponse.json({ config, availableHeaders });
}

/** POST /api/admin/st-field-config */
export async function POST(req: NextRequest) {
  const authUser = await getAuthenticatedUser(req);
  const adminCheck = requireAdmin(authUser);
  if (adminCheck) return adminCheck;

  const config: STSheetFieldConfig = await req.json();
  if (!config?.campType) {
    return NextResponse.json({ error: '유효하지 않은 설정 데이터입니다.' }, { status: 400 });
  }

  const db = getAdminFirestore();
  await db.collection(COLLECTION).doc(config.campType).set(config);

  return NextResponse.json({ ok: true });
}
