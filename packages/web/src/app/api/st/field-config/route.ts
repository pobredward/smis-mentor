import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { getAuthenticatedUser, requireMentor } from '@/lib/authMiddleware';
import { getDefaultFieldConfig, type CampType, type STSheetFieldConfig } from '@smis-mentor/shared';

const COLLECTION = 'stSheetFieldConfig';

const FIXED_SECTION_IDS = ['campInfo', 'basicInfo', 'guardianInfo'] as const;

/**
 * Firestore에 저장된 기존 config에 고정 섹션이 빠져 있으면 기본값에서 보충합니다.
 * 이미 존재하는 고정 섹션은 Firestore 값을 우선합니다.
 */
function mergeFixedSections(stored: STSheetFieldConfig, campType: CampType): STSheetFieldConfig {
  const defaults = getDefaultFieldConfig(campType);
  const storedIds = new Set(stored.sections.map(s => s.id));
  const missingSections = defaults.sections.filter(
    s => FIXED_SECTION_IDS.includes(s.id as typeof FIXED_SECTION_IDS[number]) && !storedIds.has(s.id)
  );
  if (missingSections.length === 0) return stored;

  // 고정 섹션을 동적 섹션보다 앞에 삽입하고 order를 재정렬
  const fixedSections = stored.sections.filter(s => FIXED_SECTION_IDS.includes(s.id as typeof FIXED_SECTION_IDS[number]));
  const dynamicSections = stored.sections.filter(s => !FIXED_SECTION_IDS.includes(s.id as typeof FIXED_SECTION_IDS[number]));
  const allFixed = [
    ...fixedSections,
    ...missingSections,
  ].sort((a, b) => {
    const aIdx = FIXED_SECTION_IDS.indexOf(a.id as typeof FIXED_SECTION_IDS[number]);
    const bIdx = FIXED_SECTION_IDS.indexOf(b.id as typeof FIXED_SECTION_IDS[number]);
    return aIdx - bIdx;
  });
  const merged = [...allFixed, ...dynamicSections].map((s, i) => ({ ...s, order: i }));
  return { ...stored, sections: merged };
}

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

  const stored = snap.data() as STSheetFieldConfig;
  return NextResponse.json(mergeFixedSections(stored, campType));
}
