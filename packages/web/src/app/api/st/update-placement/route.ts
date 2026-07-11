import { logger, getDefaultFieldConfig } from '@smis-mentor/shared';
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
  classCounsel1:     { sheetHeader: '상담(반)1',  label: '담임 상담 1주차', max: 0, permission: 'mentor'  },
  classCounsel2:     { sheetHeader: '상담(반)2',  label: '담임 상담 2주차', max: 0, permission: 'mentor'  },
  classCounsel3:     { sheetHeader: '상담(반)3',  label: '담임 상담 3주차', max: 0, permission: 'mentor'  },
  unitCounsel1:      { sheetHeader: '상담(방)1',    label: '유닛 상담 1주차', max: 0, permission: 'mentor'  },
  unitCounsel2:      { sheetHeader: '상담(방)2',    label: '유닛 상담 2주차', max: 0, permission: 'mentor'  },
  unitCounsel3:      { sheetHeader: '상담(방)3',    label: '유닛 상담 3주차', max: 0, permission: 'mentor'  },
  managerCounsel:    { sheetHeader: '상담(매니저)', label: '매니저 상담',     max: 0, permission: 'mentor'  },
};

function canEdit(permission: EditPermission, role: UserRole): boolean {
  if (permission === 'readonly') return false;
  if (role === 'admin') return true;
  if (permission === 'all') return true;               // mentor + foreign 모두 가능
  if (permission === 'mentor') return role === 'mentor' || role === 'mentor_temp';
  return false;
}

// 캐시 유효성 검증에 사용할 필수 헤더 목록 (선택적 컬럼 제외)
// 상담(매니저)는 일부 캠프에만 존재하는 컬럼이므로 캐시 hit 판정에서 제외
const OPTIONAL_SHEET_HEADERS = new Set(['상담(매니저)']);
const REQUIRED_SHEET_HEADERS = Object.values(STUDENT_EDITABLE_FIELDS)
  .filter(f => !OPTIONAL_SHEET_HEADERS.has(f.sheetHeader))
  .map(f => f.sheetHeader);
// 실제 Sheets 헤더 읽기 시 찾을 전체 헤더 목록 (선택적 포함)
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

// 프로세스 재시작 전까지 유효한 인메모리 캐시 (Vercel Serverless는 워커 재사용됨)
let _sheetsClient: ReturnType<typeof google.sheets> | null = null;

function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT;
  if (!raw) throw new Error('GOOGLE_SHEETS_SERVICE_ACCOUNT 환경 변수 누락');
  let credentials: Record<string, string>;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error(`GOOGLE_SHEETS_SERVICE_ACCOUNT JSON 파싱 실패 (길이: ${raw.length})`);
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  _sheetsClient = google.sheets({ version: 'v4', auth });
  return _sheetsClient;
}

// campCode별 열 위치 인메모리 캐시
const _columnMapCache = new Map<string, { columnMap: Record<string, string>; sheetName: string }>();

/**
 * 열 위치 맵 반환 — 인메모리 캐시 → 전달된 Firestore 데이터 → Sheets 헤더 읽기 순서
 *
 * @param requiredDynamicHeaders 반드시 columnMap에 있어야 하는 동적 헤더. 없으면 캐시 무효화.
 * @param prefetchedSettings    외부에서 미리 조회한 campSettings 데이터 (중복 Firestore 조회 방지)
 * @param allKnownDynamicHeaders 외부에서 파악한 모든 동적 헤더 (Sheets 재빌드 시 fieldConfig 재조회 방지)
 */
async function getOrBuildColumnMap(
  campCode: string,
  spreadsheetId: string,
  sheetName: string,
  requiredDynamicHeaders: string[] = [],
  prefetchedSettings: Record<string, unknown> | null = null,
  allKnownDynamicHeaders: string[] = [],
): Promise<{ columnMap: Record<string, string>; sheetName: string }> {
  const allRequired = [...REQUIRED_SHEET_HEADERS, ...requiredDynamicHeaders];

  // 1단계: 인메모리 캐시 (Firestore 호출 없음)
  const cached = _columnMapCache.get(campCode);
  if (cached && allRequired.every(h => h in cached.columnMap)) {
    return cached;
  }

  // 2단계: 전달된 campSettings 데이터에서 Firestore 캐시 확인 (추가 Firestore 호출 없음)
  const fsColumnMap = prefetchedSettings?.sheetColumnMap as Record<string, string> | undefined;
  const fsSheetName = (prefetchedSettings?.sheetName as string | undefined) ?? sheetName;

  if (fsColumnMap && allRequired.every(h => h in fsColumnMap)) {
    const result = { columnMap: fsColumnMap, sheetName: fsSheetName };
    _columnMapCache.set(campCode, result);
    return result;
  }

  // 3단계: Google Sheets 헤더 읽기 (위 캐시 모두 미스일 때만 실행)
  const sheets = getSheetsClient();
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!1:1`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const headers = ((headerRes.data.values?.[0] ?? []) as string[]).map((h: string) => h.trim());

  const columnMap: Record<string, string> = { ...(fsColumnMap ?? {}) };
  const headersToSearch = [...ALL_SHEET_HEADERS, ...allKnownDynamicHeaders];
  for (const headerName of headersToSearch) {
    const idx = headers.indexOf(headerName);
    if (idx !== -1) columnMap[headerName] = columnIndexToLetter(idx);
  }

  // Firestore + 인메모리에 캐시 저장
  const db = getAdminFirestore();
  await db.collection('campSettings').doc(campCode).set(
    { sheetColumnMap: columnMap, sheetName },
    { merge: true },
  );
  const result = { columnMap, sheetName };
  _columnMapCache.set(campCode, result);
  logger.info(`📦 열 위치 캐시 저장: ${campCode}`, columnMap);

  return result;
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

  // 3. 필드별 권한 검증 + 열 위치 맵에 필요한 데이터 병렬 조회
  const db = getAdminFirestore();
  const campType = config.type;

  // fieldConfig(동적 필드 파악) + campSettings(columnMap 캐시) 동시 조회 → 순차 대기 제거
  const [fieldConfigSnap, settingsSnap] = await Promise.all([
    db.collection('stSheetFieldConfig').doc(campType).get(),
    db.collection('campSettings').doc(campCode).get(),
  ]);
  const fieldConfigData = fieldConfigSnap.exists ? fieldConfigSnap.data() : null;
  const activeSections = fieldConfigData?.sections ?? getDefaultFieldConfig(campType).sections;

  // fieldKey → { sheetHeader, permission, isEditable, label } 맵 + 전체 동적 헤더 목록 수집
  const dynamicFieldMap: Record<string, { sheetHeader: string; permission: EditPermission; isEditable: boolean; label: string; isLegacy: boolean }> = {};
  const allDynamicHeadersInConfig: string[] = [];
  for (const section of activeSections) {
    for (const field of section.fields ?? []) {
      if (!field.isLegacy) {
        dynamicFieldMap[field.fieldKey] = {
          sheetHeader: field.sheetHeader,
          permission: field.permission as EditPermission,
          isEditable: field.isEditable,
          label: field.label,
          isLegacy: false,
        };
        if (field.sheetHeader) allDynamicHeadersInConfig.push(field.sheetHeader);
      }
    }
  }

  const allowedFields: Record<string, string> = {};
  // fieldKey가 displayFields에 들어갈 신규 필드인지 구분하기 위한 맵
  const dynamicAllowedFields: Record<string, { sheetHeader: string; value: string }> = {};

  for (const [fieldKey, value] of Object.entries(fields)) {
    // 1) 기존 고정 필드
    const legacyFieldCfg = STUDENT_EDITABLE_FIELDS[fieldKey];
    if (legacyFieldCfg) {
      if (!canEdit(legacyFieldCfg.permission, role)) {
        return NextResponse.json(
          { error: `"${legacyFieldCfg.label}" 필드를 수정할 권한이 없습니다.` },
          { status: 403 },
        );
      }
      allowedFields[fieldKey] = value;
      continue;
    }

    // 2) 동적 필드 (fieldConfig에 등록된 신규 필드)
    const dynamicCfg = dynamicFieldMap[fieldKey];
    if (dynamicCfg) {
      if (!dynamicCfg.isEditable) {
        return NextResponse.json(
          { error: `"${dynamicCfg.label}" 필드는 편집이 허용되지 않습니다.` },
          { status: 403 },
        );
      }
      if (!canEdit(dynamicCfg.permission, role)) {
        return NextResponse.json(
          { error: `"${dynamicCfg.label}" 필드를 수정할 권한이 없습니다.` },
          { status: 403 },
        );
      }
      dynamicAllowedFields[fieldKey] = { sheetHeader: dynamicCfg.sheetHeader, value };
      continue;
    }

    return NextResponse.json({ error: `알 수 없는 필드: ${fieldKey}` }, { status: 400 });
  }

  if (Object.keys(allowedFields).length === 0 && Object.keys(dynamicAllowedFields).length === 0) {
    return NextResponse.json({ error: '수정할 필드가 없습니다.' }, { status: 400 });
  }

  try {
    const { spreadsheetId, sheetName: configSheetName } = config;

    // 4. 열 위치 맵 취득
    // - 이번 요청에 필요한 헤더(neededDynamicHeaders)가 캐시에 없으면 재빌드
    // - 미리 조회한 settingsSnap과 allDynamicHeadersInConfig를 전달해 Firestore 중복 조회 제거
    const neededDynamicHeaders = Object.values(dynamicAllowedFields).map(d => d.sheetHeader);
    const { columnMap, sheetName } = await getOrBuildColumnMap(
      campCode,
      spreadsheetId,
      configSheetName,
      neededDynamicHeaders,
      settingsSnap.data() ?? null,
      allDynamicHeadersInConfig,
    );

    // 5. Firestore override 데이터 구성
    // - 고정 필드: overrideData[fieldKey] = value
    // - 동적 필드: overrideData['displayFields'][sheetHeader] = value (FieldValue.serverTimestamp 불가이므로 merge 사용)
    const overrideData: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: authCtx.firebaseUid,
    };
    for (const [fieldKey, value] of Object.entries(allowedFields)) {
      overrideData[fieldKey] = value;
    }
    // 동적 필드는 displayFields 하위에 저장
    for (const [, { sheetHeader, value }] of Object.entries(dynamicAllowedFields)) {
      overrideData[`displayFields.${sheetHeader}`] = value;
    }

    // 6. Sheets 업데이트 범위 구성 (고정 + 동적 필드 모두)
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

    for (const [, { sheetHeader, value }] of Object.entries(dynamicAllowedFields)) {
      const colLetter = columnMap[sheetHeader];
      if (!colLetter) {
        // 동적 필드는 columnMap에 없을 수 있음 → Sheets 업데이트 skip, Firestore에만 저장
        logger.warn(`동적 필드 "${sheetHeader}" 열 위치 없음. Firestore에만 저장합니다.`);
        continue;
      }
      dataToUpdate.push({ range: `${sheetName}!${colLetter}${rowNumber}`, values: [[value]] });
    }

    // 7. Firestore override 저장 + Sheets batchUpdate 병렬 실행
    const overrideRef = db.collection('stSheetOverrides').doc(campCode).collection('students').doc(studentId);
    const sheetsClient = getSheetsClient();

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
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('학생 카드 필드 업데이트 실패:', errMsg);
    return NextResponse.json({ error: '업데이트에 실패했습니다.', detail: errMsg }, { status: 500 });
  }
}
