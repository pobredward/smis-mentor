import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';
import { CAMP_SHEET_CONFIG, getDefaultFieldConfig, type STSheetFieldConfig, type CampType } from '@smis-mentor/shared';

const COLLECTION = 'stSheetFieldConfig';

const FIXED_SECTION_IDS = ['campInfo', 'basicInfo', 'guardianInfo'] as const;

/**
 * Firestore에 저장된 기존 config에 고정 섹션이 빠져 있으면 기본값에서 보충합니다.
 */
function mergeFixedSections(stored: STSheetFieldConfig, campType: CampType): STSheetFieldConfig {
  const defaults = getDefaultFieldConfig(campType);
  const storedIds = new Set(stored.sections.map(s => s.id));
  const missingSections = defaults.sections.filter(
    s => FIXED_SECTION_IDS.includes(s.id as typeof FIXED_SECTION_IDS[number]) && !storedIds.has(s.id)
  );
  if (missingSections.length === 0) return stored;

  const fixedSections = stored.sections.filter(s => FIXED_SECTION_IDS.includes(s.id as typeof FIXED_SECTION_IDS[number]));
  const dynamicSections = stored.sections.filter(s => !FIXED_SECTION_IDS.includes(s.id as typeof FIXED_SECTION_IDS[number]));
  const allFixed = [...fixedSections, ...missingSections].sort((a, b) => {
    const aIdx = FIXED_SECTION_IDS.indexOf(a.id as typeof FIXED_SECTION_IDS[number]);
    const bIdx = FIXED_SECTION_IDS.indexOf(b.id as typeof FIXED_SECTION_IDS[number]);
    return aIdx - bIdx;
  });
  const merged = [...allFixed, ...dynamicSections].map((s, i) => ({ ...s, order: i }));
  return { ...stored, sections: merged };
}

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

  // fieldConfig 조회 — 고정 섹션 누락 시 기본값으로 보충
  const configSnap = await db.collection(COLLECTION).doc(campType).get();
  const config = configSnap.exists
    ? mergeFixedSections(configSnap.data() as STSheetFieldConfig, campType)
    : null;

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
