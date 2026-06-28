import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { FieldValue } from 'firebase-admin/firestore';
import { CAMP_SHEET_CONFIG } from '@smis-mentor/shared';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { getAuthenticatedUser } from '@/lib/authMiddleware';

/**
 * 학생 카드 수정 가능 필드 정의
 * POST /api/st/update-placement
 *
 * 권한:
 *   readonly  — 수정 불가 (표시만)
 *   all       — admin + mentor + foreign 수정 가능
 *   mentor    — admin + mentor만 수정 가능
 */

type EditPermission = 'readonly' | 'all' | 'mentor';
type UserRole = 'admin' | 'mentor' | 'mentor_temp' | 'foreign' | 'foreign_temp';

interface FieldConfig {
  sheetHeader: string;   // Google Sheets 실제 헤더명
  label: string;         // 화면 표시 레이블
  max: number;           // 만점 (표시용)
  permission: EditPermission;
}

export const STUDENT_EDITABLE_FIELDS: Record<string, FieldConfig> = {
  // 상세 정보 (admin + mentor 수정 가능)
  medication:        { sheetHeader: '복용약 & 알레르기', label: '복용약 & 알레르기', max: 0, permission: 'mentor' },
  notes:             { sheetHeader: '특이사항',          label: '특이사항',          max: 0, permission: 'mentor' },
  etc:               { sheetHeader: '기타',              label: '기타',              max: 0, permission: 'mentor' },
  // 레벨 테스트
  placementSpeaking: { sheetHeader: 'P-Speaking', label: '입소 스피킹',   max: 30, permission: 'readonly' },
  placementReading:  { sheetHeader: 'P-Reading',  label: '입소 리딩',     max: 30, permission: 'all'      },
  placementWriting:  { sheetHeader: 'P-Writing',  label: '입소 라이팅',   max: 40, permission: 'all'      },
  finalSpeaking:     { sheetHeader: 'F-Speaking', label: '파이널 스피킹', max: 30, permission: 'readonly' },
  finalReading:      { sheetHeader: 'F-Reading',  label: '파이널 리딩',   max: 30, permission: 'all'      },
  finalWriting:      { sheetHeader: 'F-Writing',  label: '파이널 라이팅', max: 40, permission: 'all'      },
  // 상담
  classCounsel1:     { sheetHeader: '상담(반)1',  label: '멘토 상담 1주차', max: 0, permission: 'mentor'  },
  classCounsel2:     { sheetHeader: '상담(반)2',  label: '멘토 상담 2주차', max: 0, permission: 'mentor'  },
  classCounsel3:     { sheetHeader: '상담(반)3',  label: '멘토 상담 3주차', max: 0, permission: 'mentor'  },
  unitCounsel1:      { sheetHeader: '상담(방)1',  label: '유닛 상담 1주차', max: 0, permission: 'mentor'  },
  unitCounsel2:      { sheetHeader: '상담(방)2',  label: '유닛 상담 2주차', max: 0, permission: 'mentor'  },
  unitCounsel3:      { sheetHeader: '상담(방)3',  label: '유닛 상담 3주차', max: 0, permission: 'mentor'  },
};

function canEdit(permission: EditPermission, role: UserRole): boolean {
  if (permission === 'readonly') return false;
  if (role === 'admin') return true;
  if (permission === 'all') return true;               // mentor + foreign 모두 가능
  if (permission === 'mentor') return role === 'mentor' || role === 'mentor_temp';
  return false;
}

const ALL_SHEET_HEADERS = Object.values(STUDENT_EDITABLE_FIELDS).map(f => f.sheetHeader);

// 헤더명 → 열 문자(A, B, ...) 변환
function columnIndexToLetter(index: number): string {
  let letter = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

async function getSheetsClient() {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT;
  if (!raw) throw new Error('GOOGLE_SHEETS_SERVICE_ACCOUNT 환경 변수가 설정되지 않았습니다.');
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * 열 위치 맵 반환 — Firestore 캐시 우선, 없으면 Sheets 헤더를 읽어서 캐싱
 * { 'P-Speaking': 'AK', 'P-Reading': 'AL', ... } 형태
 */
async function getOrBuildColumnMap(
  campCode: string,
  spreadsheetId: string,
  gid: string,
): Promise<{ columnMap: Record<string, string>; sheetName: string }> {
  const db = getAdminFirestore();
  const settingsRef = db.collection('campSettings').doc(campCode);
  const settingsSnap = await settingsRef.get();
  const cached = settingsSnap.data()?.sheetColumnMap as Record<string, string> | undefined;
  const cachedSheetName = settingsSnap.data()?.sheetName as string | undefined;

  if (cached && cachedSheetName && ALL_SHEET_HEADERS.every(h => h in cached)) {
    return { columnMap: cached, sheetName: cachedSheetName };
  }

  const sheets = await getSheetsClient();

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const matched = (meta.data.sheets ?? []).find(s => String(s.properties?.sheetId) === gid);
  const sheetName = matched?.properties?.title ?? 'ST';

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!1:1`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const headers = ((headerRes.data.values?.[0] ?? []) as string[]).map((h: string) => h.trim());

  const columnMap: Record<string, string> = { ...(cached ?? {}) };
  for (const headerName of ALL_SHEET_HEADERS) {
    const idx = headers.indexOf(headerName);
    if (idx !== -1) columnMap[headerName] = columnIndexToLetter(idx);
  }

  await settingsRef.set({ sheetColumnMap: columnMap, sheetName }, { merge: true });
  logger.info(`📦 열 위치 캐시 저장: ${campCode}`, columnMap);

  return { columnMap, sheetName };
}

export async function POST(request: NextRequest) {
  // 1. 인증
  const authCtx = await getAuthenticatedUser(request);
  if (!authCtx) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  const role = authCtx.user.role as UserRole;

  // 2. 요청 바디 파싱
  let body: {
    campCode: string;
    studentId: string;
    rowNumber: number;
    fields: Record<string, string>;  // { placementReading: '25', classCounsel1: '...' }
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const { campCode, studentId, rowNumber, fields } = body;

  if (!campCode || !studentId || !rowNumber || !fields) {
    return NextResponse.json({ error: 'campCode, studentId, rowNumber, fields는 필수입니다.' }, { status: 400 });
  }

  const config = CAMP_SHEET_CONFIG[campCode as keyof typeof CAMP_SHEET_CONFIG];
  if (!config) {
    return NextResponse.json({ error: `알 수 없는 캠프 코드: ${campCode}` }, { status: 400 });
  }

  // 3. 필드별 권한 검증 — 수정 불가 필드나 권한 없는 필드는 거부
  const allowedFields: Record<string, string> = {};
  for (const [fieldKey, value] of Object.entries(fields)) {
    const fieldCfg = STUDENT_EDITABLE_FIELDS[fieldKey];
    if (!fieldCfg) {
      return NextResponse.json({ error: `알 수 없는 필드: ${fieldKey}` }, { status: 400 });
    }
    if (!canEdit(fieldCfg.permission, role)) {
      return NextResponse.json(
        { error: `"${fieldCfg.label}" 필드를 수정할 권한이 없습니다.` },
        { status: 403 },
      );
    }
    allowedFields[fieldKey] = value;
  }

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: '수정할 필드가 없습니다.' }, { status: 400 });
  }

  try {
    const db = getAdminFirestore();
    const { spreadsheetId, gid } = config;

    // 4. 열 위치 맵 취득 (캐시 우선)
    const { columnMap, sheetName } = await getOrBuildColumnMap(campCode, spreadsheetId, gid);

    // 5. Firestore override 데이터 구성
    const overrideData: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: authCtx.firebaseUid,
    };
    for (const [fieldKey, value] of Object.entries(allowedFields)) {
      overrideData[fieldKey] = value;
    }

    // 6. Sheets 업데이트 범위 구성
    const dataToUpdate: { range: string; values: string[][] }[] = [];
    for (const [fieldKey, value] of Object.entries(allowedFields)) {
      const sheetHeader = STUDENT_EDITABLE_FIELDS[fieldKey].sheetHeader;
      const colLetter = columnMap[sheetHeader];
      if (!colLetter) {
        logger.warn(`열 위치 캐시에 "${sheetHeader}" 없음. 건너뜁니다.`);
        continue;
      }
      dataToUpdate.push({ range: `${sheetName}!${colLetter}${rowNumber}`, values: [[value]] });
    }

    // 7. Firestore override 저장 + Sheets batchUpdate 병렬 실행
    const overrideRef = db.collection('stSheetOverrides').doc(campCode).collection('students').doc(studentId);
    const sheetsClient = await getSheetsClient();

    await Promise.all([
      overrideRef.set(overrideData, { merge: true }),
      dataToUpdate.length > 0
        ? sheetsClient.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: { valueInputOption: 'USER_ENTERED', data: dataToUpdate },
          })
        : Promise.resolve(),
    ]);

    logger.info(`✅ 저장 완료: ${campCode}/${studentId} → ${dataToUpdate.map(d => d.range).join(', ')}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('학생 카드 필드 업데이트 실패:', error);
    return NextResponse.json({ error: '업데이트에 실패했습니다.' }, { status: 500 });
  }
}
