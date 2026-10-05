import { logger, getDefaultFieldConfig, isDeviceSheetHeader, campTypeOfCode } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { CampStudentError, getEnrollment, updateChild, updateEnrollment } from '@/lib/campStudentsServer';

/**
 * 학생 카드 수정 — POST /api/st/update-placement { campCode, studentId, fields }
 * (예전에는 구글 시트에 썼다. SMIS CAMP 1.0 부터 앱이 원본: 캠프 참가 문서 · 아이 문서에 바로 쓴다)
 *
 * 저장 위치:
 *   복용약 & 알레르기 → 아이 문서 (캠프와 무관한 아이 정보)
 *   그 밖의 고정 칸    → 캠프 참가 문서
 *   관리자가 정한 칸   → 캠프 참가 문서 displayFields[칸 이름]
 *
 * 권한:
 *   readonly  — 수정 불가 (표시만)
 *   all       — admin + mentor + foreign 수정 가능
 *   mentor    — admin + mentor만 수정 가능
 *   admin     — admin만
 */

type EditPermission = 'readonly' | 'admin' | 'all' | 'mentor';
type UserRole = 'admin' | 'mentor' | 'mentor_temp' | 'foreign' | 'foreign_temp' | 'parent';

interface FieldConfig {
  label: string;         // 화면 표시 레이블
  max: number;           // 만점 (표시용)
  permission: EditPermission;
  /** 아이 문서에 저장 (기본: 캠프 참가) */
  child?: boolean;
}

const STUDENT_EDITABLE_FIELDS: Record<string, FieldConfig> = {
  // 상세 정보 — 복용약·특이사항은 관리자만 (멘토는 자유 메모 사용)
  medication:        { label: '복용약 & 알레르기', max: 0, permission: 'admin', child: true },
  notes:             { label: '특이사항',          max: 0, permission: 'admin' },
  etc:               { label: '기타',              max: 0, permission: 'mentor' },
  // 레벨 테스트
  placementSpeaking: { label: '입소 스피킹',   max: 30, permission: 'readonly' },
  placementReading:  { label: '입소 리딩',     max: 30, permission: 'all'      },
  placementWriting:  { label: '입소 라이팅',   max: 40, permission: 'all'      },
  finalSpeaking:     { label: '파이널 스피킹', max: 30, permission: 'readonly' },
  finalReading:      { label: '파이널 리딩',   max: 30, permission: 'all'      },
  finalWriting:      { label: '파이널 라이팅', max: 40, permission: 'all'      },
  // 상담
  classCounsel1:     { label: '담임 상담 1주차', max: 0, permission: 'mentor'  },
  classCounsel2:     { label: '담임 상담 2주차', max: 0, permission: 'mentor'  },
  classCounsel3:     { label: '담임 상담 3주차', max: 0, permission: 'mentor'  },
  unitCounsel1:      { label: '유닛 상담 1주차', max: 0, permission: 'mentor'  },
  unitCounsel2:      { label: '유닛 상담 2주차', max: 0, permission: 'mentor'  },
  unitCounsel3:      { label: '유닛 상담 3주차', max: 0, permission: 'mentor'  },
  managerCounsel:    { label: '매니저 상담',     max: 0, permission: 'mentor'  },
};

function canEdit(permission: EditPermission, role: UserRole): boolean {
  if (permission === 'readonly') return false;
  if (role === 'admin') return true;
  if (permission === 'all') return role === 'mentor' || role === 'mentor_temp' || role === 'foreign' || role === 'foreign_temp';
  if (permission === 'mentor') return role === 'mentor' || role === 'mentor_temp';
  return false;
}

export async function POST(request: NextRequest) {
  // 1. 인증
  const authCtx = await getAuthenticatedUser(request);
  if (!authCtx) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  const role = authCtx.user.role as UserRole;
  if (!['admin', 'mentor', 'mentor_temp', 'foreign', 'foreign_temp'].includes(role)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  // 2. 요청 바디
  let body: { campCode?: string; studentId?: string; fields?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }
  const campCode = String(body.campCode ?? '').trim();
  const studentId = String(body.studentId ?? '').trim();
  const fields = body.fields;
  if (!campCode || !studentId || !fields || typeof fields !== 'object') {
    return NextResponse.json({ error: 'campCode, studentId, fields는 필수입니다.' }, { status: 400 });
  }

  // 3. 필드별 권한 검증 (관리자가 정한 칸은 stSheetFieldConfig)
  const db = getAdminFirestore();
  const campType = campTypeOfCode(campCode);
  const fieldConfigSnap = await db.collection('stSheetFieldConfig').doc(campType).get();
  const activeSections = fieldConfigSnap.data()?.sections ?? getDefaultFieldConfig(campType).sections;

  const dynamicFieldMap: Record<string, { sheetHeader: string; permission: EditPermission; isEditable: boolean; label: string }> = {};
  for (const section of activeSections) {
    for (const field of section.fields ?? []) {
      // 전자기기 칸은 studentDevices 전용 (여기서 저장하지 않음)
      if (!field.isLegacy && field.sheetHeader && !isDeviceSheetHeader(field.sheetHeader)) {
        dynamicFieldMap[field.fieldKey] = {
          sheetHeader: field.sheetHeader,
          permission: field.permission as EditPermission,
          isEditable: field.isEditable,
          label: field.label,
        };
      }
    }
  }

  const childPatch: Record<string, string> = {};
  const enrollmentPatch: Record<string, unknown> = {};
  const displayFields: Record<string, string> = {};

  for (const [fieldKey, raw] of Object.entries(fields)) {
    const value = raw == null ? '' : String(raw);
    if (value.length > 5000) {
      return NextResponse.json({ error: '내용이 너무 깁니다.' }, { status: 400 });
    }
    const fixed = STUDENT_EDITABLE_FIELDS[fieldKey];
    if (fixed) {
      if (!canEdit(fixed.permission, role)) {
        return NextResponse.json({ error: `"${fixed.label}" 필드를 수정할 권한이 없습니다.` }, { status: 403 });
      }
      if (fixed.child) childPatch[fieldKey] = value;
      else enrollmentPatch[fieldKey] = value;
      continue;
    }
    const dyn = dynamicFieldMap[fieldKey];
    if (dyn) {
      if (!dyn.isEditable) {
        return NextResponse.json({ error: `"${dyn.label}" 필드는 편집이 허용되지 않습니다.` }, { status: 403 });
      }
      if (!canEdit(dyn.permission, role)) {
        return NextResponse.json({ error: `"${dyn.label}" 필드를 수정할 권한이 없습니다.` }, { status: 403 });
      }
      displayFields[dyn.sheetHeader] = value;
      continue;
    }
    return NextResponse.json({ error: `알 수 없는 필드: ${fieldKey}` }, { status: 400 });
  }
  if (Object.keys(displayFields).length) enrollmentPatch.displayFields = displayFields;

  if (!Object.keys(childPatch).length && !Object.keys(enrollmentPatch).length) {
    return NextResponse.json({ error: '수정할 필드가 없습니다.' }, { status: 400 });
  }

  // 4. 저장
  try {
    const enr = await getEnrollment(campCode, studentId);
    if (!enr) return NextResponse.json({ error: '이 캠프의 학생을 찾을 수 없습니다.' }, { status: 404 });
    const by = authCtx.firebaseUid;
    if (Object.keys(enrollmentPatch).length) await updateEnrollment(campCode, studentId, enrollmentPatch, by);
    if (Object.keys(childPatch).length) {
      if (!enr.childId) return NextResponse.json({ error: '아이 정보가 연결되지 않은 학생입니다.' }, { status: 409 });
      await updateChild(enr.childId, childPatch, by);
    }
    logger.info(`✅ 학생 카드 저장: ${campCode}/${studentId} (${Object.keys(fields).join(', ')})`);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof CampStudentError) return NextResponse.json({ error: error.message }, { status: error.status });
    logger.error('학생 카드 필드 업데이트 실패:', error);
    return NextResponse.json({ error: '업데이트에 실패했습니다.' }, { status: 500 });
  }
}
