/**
 * POST /api/st/sync-sheet
 *
 * Cloud Function 대신 Next.js 서버에서 직접 Google Sheets → Firestore 동기화.
 * Cold Start가 없어 Cloud Function 대비 훨씬 빠름.
 *
 * 권한: admin만 호출 가능
 */
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import {
  logger,
  CAMP_SHEET_CONFIG,
  buildNormalizedHeaderIndexMap,
  mapHeadersToStudent,
  isInactiveStudent,
  parseFamilySheet,
  type CampCode,
  type FamilyUnit,
} from '@smis-mentor/shared';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { getAuthenticatedUser } from '@/lib/authMiddleware';

function getSheetsClient() {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT;
  if (!raw) throw new Error('GOOGLE_SHEETS_SERVICE_ACCOUNT 환경 변수가 설정되지 않았습니다.');
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    // 동기화는 읽기 전용
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

/** GID → 시트 이름 변환 */
async function resolveSheetName(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  gid: string,
): Promise<string> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const matched = (meta.data.sheets ?? []).find(
    (s) => String(s.properties?.sheetId) === gid,
  );
  return matched?.properties?.title ?? 'ST';
}

export async function POST(request: NextRequest) {
  // 1. 인증
  const authCtx = await getAuthenticatedUser(request);
  if (!authCtx) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  if (authCtx.user.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  // 2. 요청 파싱
  let body: { campCode: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const { campCode } = body;
  if (!campCode) {
    return NextResponse.json({ error: 'campCode가 필요합니다.' }, { status: 400 });
  }

  const config = CAMP_SHEET_CONFIG[campCode as CampCode];
  if (!config) {
    return NextResponse.json({ error: `알 수 없는 캠프 코드: ${campCode}` }, { status: 400 });
  }

  try {
    const sheets = getSheetsClient();
    const sheetName = await resolveSheetName(sheets, config.spreadsheetId, config.gid);

    logger.info(`📊 [${campCode}] 시트 읽기: "${sheetName}" (gid=${config.gid})`);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: sheetName,
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const rows: string[][] = (response.data.values ?? []).map((row) =>
      (row as string[]).map((cell) => String(cell ?? '')),
    );

    if (rows.length < 2) {
      return NextResponse.json({ error: '시트에 데이터가 없습니다.' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const isFamily = config.type === 'F';

    // 동기화 시 stSheetOverrides를 초기화해야 Google Sheets 원본값이 올바르게 반영됨.
    // 오버라이드가 남아있으면 동기화 후에도 이전 편집값이 우선 적용되어 불일치 발생.
    const clearOverrides = async () => {
      const overridesRef = db.collection('stSheetOverrides').doc(campCode).collection('students');
      const docs = await overridesRef.listDocuments();
      if (docs.length === 0) return;
      const BATCH_SIZE = 500;
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        docs.slice(i, i + BATCH_SIZE).forEach(ref => batch.delete(ref));
        await batch.commit();
      }
      logger.info(`🗑️ [${campCode}] stSheetOverrides ${docs.length}건 초기화 완료`);
    };

    if (isFamily) {
      // F 캠프: 가족 단위 파싱 → familySTSheetCache
      const families: FamilyUnit[] = parseFamilySheet(rows, campCode);
      const totalStudents = families.reduce((s, f) => s + f.students.length, 0);

      const cacheData = {
        campCode,
        families: JSON.parse(JSON.stringify(families)),
        lastSyncedAt: new Date().toISOString(),
        syncedBy: authCtx.firebaseUid,
        syncedByName: authCtx.user.name ?? 'Admin',
        version: Date.now(),
        totalFamilies: families.length,
        totalStudents,
      };

      // 캐시 저장 + 오버라이드 초기화 병렬 실행
      await Promise.all([
        db.collection('familySTSheetCache').doc(campCode).set(cacheData),
        clearOverrides(),
      ]);

      logger.info(`✅ F캠프 동기화 완료: ${campCode} (${families.length}가족, 학생 ${totalStudents}명)`);
      return NextResponse.json({ success: true, count: totalStudents, familyCount: families.length, lastSync: new Date().toISOString() });
    } else {
      // 일반 캠프: 학생 단위 파싱 → stSheetCache
      const headerIndexMap = buildNormalizedHeaderIndexMap(rows[0]);
      const students = rows
        .slice(1)
        .filter((row) => row[0]?.trim())
        .map((row, idx) => mapHeadersToStudent(row, headerIndexMap, idx + 2, campCode, config.type));

      const active = students.filter((s) => !isInactiveStudent(s));
      const skipped = students.length - active.length;
      if (skipped > 0) logger.info(`[${campCode}] 이월자/취소자 ${skipped}명 제외`);

      // undefined 필드 제거 (Firestore는 undefined 허용 안 함)
      const sanitized = active.map((s) =>
        Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)),
      );

      // 캐시 저장 + 오버라이드 초기화 병렬 실행
      await Promise.all([
        db.collection('stSheetCache').doc(campCode).set({
          campCode,
          data: sanitized,
          lastSyncedAt: new Date().toISOString(),
          syncedBy: authCtx.firebaseUid,
          syncedByName: authCtx.user.name ?? 'Admin',
          version: Date.now(),
          totalStudents: active.length,
        }),
        clearOverrides(),
      ]);

      logger.info(`✅ 동기화 완료: ${campCode} (${active.length}명)`);
      return NextResponse.json({ success: true, count: active.length, lastSync: new Date().toISOString() });
    }
  } catch (error) {
    logger.error(`[${campCode}] 동기화 실패:`, error);
    return NextResponse.json({ error: '동기화에 실패했습니다.' }, { status: 500 });
  }
}
