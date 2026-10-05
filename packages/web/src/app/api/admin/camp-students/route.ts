import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';
import { writeAuditLog } from '@/lib/auditLog';
import { logger, PARENT_EDITABLE_CHILD_FIELDS, type ChildProfile, type CampEnrollment, type EnrollmentStatus } from '@smis-mentor/shared';
import {
  CampStudentError, listCampEnrollments, searchChildren, createChild, createEnrollment, updateChild, updateEnrollment,
  setChildSsn, setEnrollmentsStatus, removeEnrollment, importCampStudents, upsertFamily, setFamilyMemberSsn, getEnrollment, campRef,
} from '@/lib/campStudentsServer';

/**
 * 관리자: 캠프 학생 명단 (시트 대신 앱이 원본)
 * GET  ?camp=J29                 → 그 캠프의 모든 참가 (신청 · 확정 · 취소) + 가족
 * GET  ?search=김하나|01012345678 → 아이 찾기 (다른 캠프에 왔던 아이를 이 캠프에 넣을 때)
 * POST { action, campCode, … }
 *   add     { childId? | child, ssn?, enrollment, status? }   학생 한 명 넣기 (기본 확정)
 *   update  { studentId, child?, enrollment?, ssn? }          학생 고치기
 *   status  { studentIds[], status }                          확정 · 취소 · 신청으로 되돌리기
 *   remove  { studentId }                                     잘못 넣은 참가 지우기 (확정은 먼저 취소)
 *   import  { table: string[][], dryRun, status? }            엑셀 · 시트 붙여넣기 (1행 헤더)
 *   family  { familyId, family, ssn?: { [보호자 번호]: 주민번호 } }  가족 캠프 가족 만들기 · 고치기
 *   settings { applicationOpen }                              학부모 앱 신청 받기 켜기 · 끄기
 */

const STATUSES: EnrollmentStatus[] = ['applied', 'confirmed', 'cancelled'];
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const CAMP_RE = /^[A-Z]{1,3}\d{1,3}(_\d+)?$/;

/** 관리자가 고칠 수 있는 아이 칸 (학부모 칸 + 사진) */
const CHILD_FIELDS = new Set<string>([...PARENT_EDITABLE_CHILD_FIELDS, 'profilePhoto']);
/** 참가 문서에 받지 않는 칸 (서버가 정하는 값) */
const ENROLLMENT_BLOCKED = new Set(['studentId', 'childId', 'campCode', 'status', 'order', 'parentIds', 'appliedBy', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy']);

function pickChild(raw: unknown): Partial<ChildProfile> {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!CHILD_FIELDS.has(k)) continue;
    if (typeof v === 'string') out[k] = v.trim().slice(0, 2000);
  }
  if (out.gender !== undefined && !['M', 'F', ''].includes(out.gender as string)) delete out.gender;
  return out as Partial<ChildProfile>;
}

function pickEnrollment(raw: unknown): Partial<CampEnrollment> {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (ENROLLMENT_BLOCKED.has(k) || !/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(k)) continue;
    if (k === 'displayFields') {
      if (v && typeof v === 'object') {
        out.displayFields = Object.fromEntries(Object.entries(v as Record<string, unknown>)
          .filter(([h, x]) => h.length <= 100 && !h.includes('.') && typeof x === 'string')
          .map(([h, x]) => [h, (x as string).trim().slice(0, 2000)]));
      }
      continue;
    }
    if (typeof v === 'string') out[k] = v.trim().slice(0, 5000);
  }
  return out as Partial<CampEnrollment>;
}

const fail = (e: unknown) => {
  if (e instanceof CampStudentError) return NextResponse.json({ error: e.message }, { status: e.status });
  logger.error('캠프 학생 명단 처리 실패:', e);
  return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 });
};

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  const denied = requireAdmin(auth);
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  try {
    const search = str(sp.get('search'), 50);
    if (search) {
      const children = await searchChildren(search);
      return NextResponse.json({
        children: children.map((c) => ({
          childId: c.childId, name: c.name, englishName: c.englishName ?? '', gender: c.gender ?? '', birthDate: c.birthDate ?? '',
          parentName: c.parentName ?? '', parentPhone: c.parentPhone ?? '', ssnMasked: c.ssnMasked ?? '',
        })),
      });
    }
    const campCode = str(sp.get('camp'), 20).toUpperCase();
    if (!CAMP_RE.test(campCode)) return NextResponse.json({ error: '캠프 코드를 확인해주세요.' }, { status: 400 });
    const [list, camp] = await Promise.all([listCampEnrollments(campCode), campRef(campCode).get()]);
    return NextResponse.json({ campCode, applicationOpen: camp.get('applicationOpen') === true, ...list });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  const denied = requireAdmin(auth);
  if (denied) return denied;
  const by = auth!.firebaseUid;
  const body = (await request.json().catch(() => ({}))) as Record<string, any>;
  const action = str(body.action, 20);
  const campCode = str(body.campCode, 20).toUpperCase();
  if (!CAMP_RE.test(campCode)) return NextResponse.json({ error: '캠프 코드를 확인해주세요.' }, { status: 400 });

  const audit = (metadata: Record<string, unknown>, targetLabel?: string) => writeAuditLog({
    action: 'CAMP_STUDENT_CHANGE', category: 'PRIVACY', performedBy: by, performedByName: (auth!.user as any)?.name,
    targetLabel: targetLabel ?? campCode, metadata: { campCode, action, ...metadata }, request,
  });

  try {
    switch (action) {
      case 'add': {
        const status = STATUSES.includes(body.status) ? (body.status as EnrollmentStatus) : 'confirmed';
        const enrollment = pickEnrollment(body.enrollment);
        let childId = str(body.childId, 40);
        if (!childId) {
          const child = pickChild(body.child);
          if (!child.name) return NextResponse.json({ error: '학생 이름이 필요합니다.' }, { status: 400 });
          childId = await createChild(child, by, str(body.ssn, 20) || undefined);
        } else if (str(body.ssn, 20)) {
          await setChildSsn(childId, str(body.ssn, 20));
        }
        const enr = await createEnrollment(campCode, childId, { ...enrollment, status }, by);
        await audit({ studentId: enr.studentId, childId, status, ssn: !!str(body.ssn, 20) });
        return NextResponse.json({ ok: true, studentId: enr.studentId, childId });
      }
      case 'update': {
        const studentId = str(body.studentId, 100);
        const enr = await getEnrollment(campCode, studentId);
        if (!enr) return NextResponse.json({ error: '이 캠프의 학생을 찾을 수 없습니다.' }, { status: 404 });
        const child = pickChild(body.child);
        const enrollment = pickEnrollment(body.enrollment);
        if (Object.keys(enrollment).length) await updateEnrollment(campCode, studentId, enrollment as Record<string, unknown>, by);
        if (Object.keys(child).length) await updateChild(enr.childId, child, by);
        const ssn = str(body.ssn, 20);
        if (ssn) await setChildSsn(enr.childId, ssn);
        await audit({ studentId, fields: [...Object.keys(child), ...Object.keys(enrollment)], ssn: !!ssn });
        return NextResponse.json({ ok: true });
      }
      case 'status': {
        const status = body.status as EnrollmentStatus;
        if (!STATUSES.includes(status)) return NextResponse.json({ error: '상태를 확인해주세요.' }, { status: 400 });
        const ids: string[] = Array.isArray(body.studentIds) ? body.studentIds.map((x: unknown) => str(x, 100)).filter(Boolean).slice(0, 2000) : [];
        if (!ids.length) return NextResponse.json({ error: '학생을 골라주세요.' }, { status: 400 });
        const n = await setEnrollmentsStatus(campCode, ids, status, by);
        await audit({ status, count: n, studentIds: ids.slice(0, 50) });
        return NextResponse.json({ ok: true, count: n });
      }
      case 'remove': {
        const studentId = str(body.studentId, 100);
        await removeEnrollment(campCode, studentId);
        await audit({ studentId });
        return NextResponse.json({ ok: true });
      }
      case 'import': {
        const table: string[][] = Array.isArray(body.table)
          ? body.table.slice(0, 2001).map((r: unknown) => (Array.isArray(r) ? r.slice(0, 300).map((c) => (c == null ? '' : String(c).slice(0, 5000))) : []))
          : [];
        const status = STATUSES.includes(body.status) ? (body.status as EnrollmentStatus) : 'confirmed';
        const dryRun = body.dryRun !== false;
        const result = await importCampStudents(campCode, table, by, { dryRun, status });
        if (!dryRun) await audit({ counts: result.counts, families: result.families ?? null, status });
        return NextResponse.json(result);
      }
      case 'family': {
        const familyId = str(body.familyId, 40);
        const f = (body.family ?? {}) as Record<string, any>;
        const parents = Array.isArray(f.parents)
          ? f.parents.slice(0, 10).map((p: any) => ({
            id: str(p?.id, 40), name: str(p?.name, 60), phone: str(p?.phone, 30), email: str(p?.email, 120),
            passportName: str(p?.passportName, 80), passportNumber: str(p?.passportNumber, 30), passportExpiry: str(p?.passportExpiry, 30),
            region: str(p?.region, 60), address: str(p?.address, 300), notes: str(p?.notes, 2000),
          })).filter((p: any) => p.id && p.name)
          : undefined;
        await upsertFamily(campCode, familyId, {
          ...(typeof f.familyType === 'string' ? { familyType: str(f.familyType, 40) } : {}),
          ...(typeof f.roomNumber === 'string' ? { roomNumber: str(f.roomNumber, 20) } : {}),
          ...(typeof f.order === 'number' ? { order: f.order } : {}),
          ...(parents ? { parents } : {}),
        }, by);
        const ssnMap = (body.ssn ?? {}) as Record<string, unknown>;
        for (const [pid, v] of Object.entries(ssnMap).slice(0, 10)) if (str(v, 20)) await setFamilyMemberSsn(campCode, familyId, str(pid, 40), str(v, 20));
        await audit({ familyId, ssn: Object.keys(ssnMap).length > 0 });
        return NextResponse.json({ ok: true });
      }
      case 'settings': {
        const applicationOpen = body.applicationOpen === true;
        await campRef(campCode).set({ campCode, applicationOpen, applicationUpdatedAt: new Date().toISOString(), applicationUpdatedBy: by }, { merge: true });
        await audit({ applicationOpen });
        return NextResponse.json({ ok: true, applicationOpen });
      }
      default:
        return NextResponse.json({ error: '알 수 없는 작업입니다.' }, { status: 400 });
    }
  } catch (e) {
    return fail(e);
  }
}
