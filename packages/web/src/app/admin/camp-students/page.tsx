'use client';
/**
 * 학생 명단 관리 (관리자) — SMIS CAMP 는 구글 시트 없이 앱이 원본이다.
 *  - 명단: 신청 · 확정 · 취소. 확정한 학생만 반 · 방 · 입퇴소 등 캠프 화면에 보인다
 *  - 학생 추가: 다른 캠프에 왔던 아이를 찾아 넣거나 새 아이로
 *  - 붙여넣기: 엑셀 · 예전 ST 시트에서 1행 헤더까지 복사해 붙여넣으면 미리 보고 한꺼번에 넣는다
 *  - 내보내기: CSV (주민번호는 가린 값)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Layout from '@/components/common/Layout';
import { authenticatedGet, authenticatedPost } from '@/lib/apiClient';
import { getAllJobCodes } from '@/lib/firebaseService';
import {
  compareCampCodes, campTypeOfCode, parseSpreadsheetText, toCsv, ST_SHEET_HEADER_MAPPING,
  type CampType, type EnrollmentStatus, type CampFamily,
} from '@smis-mentor/shared';

type JobCode = { id: string; code: string; name: string; generation: string };
type Student = Record<string, any> & {
  studentId: string; childId: string; name: string; status: EnrollmentStatus; order: number;
  parentCount: number; hasSsn: boolean; displayFields?: Record<string, string>;
};
type Found = { childId: string; name: string; englishName: string; gender: string; birthDate: string; parentName: string; parentPhone: string; ssnMasked: string };
type ImportRow = { row: number; name: string; grade?: string; familyId?: string; action: 'create' | 'enroll' | 'update' | 'skip'; reason?: string };
type ImportResult = { rows: ImportRow[]; counts: Record<string, number>; families?: number; applied: boolean; isFamily: boolean };

const STATUS_LABEL: Record<EnrollmentStatus, string> = { applied: '신청', confirmed: '확정', cancelled: '취소' };
const STATUS_STYLE: Record<EnrollmentStatus, string> = {
  applied: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
};
const ACTION_LABEL: Record<ImportRow['action'], string> = { create: '새 아이', enroll: '왔던 아이', update: '고침', skip: '건너뜀' };
const ACTION_STYLE: Record<ImportRow['action'], string> = {
  create: 'bg-blue-50 text-blue-700', enroll: 'bg-violet-50 text-violet-700', update: 'bg-emerald-50 text-emerald-700', skip: 'bg-gray-100 text-gray-500',
};

type Field = { key: string; label: string; area?: boolean; types?: CampType[]; options?: string[] };
/** 아이 칸 — 캠프가 바뀌어도 그대로 */
const CHILD_FIELDS: Field[] = [
  { key: 'name', label: '이름' }, { key: 'englishName', label: '영어 이름' },
  { key: 'gender', label: '성별', options: ['', 'M', 'F'] }, { key: 'birthDate', label: '생년월일 (YYYY-MM-DD)' },
  { key: 'parentName', label: '보호자 이름' }, { key: 'parentPhone', label: '보호자 연락처' },
  { key: 'otherName', label: '기타 연락처 이름' }, { key: 'otherPhone', label: '기타 연락처' },
  { key: 'region', label: '지역' }, { key: 'email', label: '이메일' },
  { key: 'address', label: '주소' }, { key: 'addressDetail', label: '세부 주소' },
  { key: 'medication', label: '복용약 & 알레르기', area: true },
  { key: 'passportName', label: '여권 영문 이름', types: ['S', 'DG', 'F'] },
  { key: 'passportNumber', label: '여권 번호', types: ['S', 'DG', 'F'] },
  { key: 'passportExpiry', label: '여권 만료일', types: ['S', 'DG', 'F'] },
];
/** 캠프 참가 칸 */
const ENROLLMENT_FIELDS: Field[] = [
  { key: 'grade', label: '학년' }, { key: 'registrationSource', label: '등록처' },
  { key: 'classNumber', label: '반번호' }, { key: 'className', label: '반이름' }, { key: 'classMentor', label: '반멘토' },
  { key: 'unit', label: '유닛' }, { key: 'unitMentor', label: '유닛 멘토' }, { key: 'roomNumber', label: '방호수' },
  { key: 'familyId', label: '가족번호', types: ['F'] },
  { key: 'departureRoute', label: '입소여정', types: ['EJ'] }, { key: 'arrivalRoute', label: '퇴소여정', types: ['EJ'] },
  { key: 'departureGroup', label: '입소공항조', types: ['EJ'] }, { key: 'departureInstructor', label: '입소공항인솔', types: ['EJ'] },
  { key: 'arrivalGroup', label: '퇴소공항조', types: ['EJ'] }, { key: 'arrivalInstructor', label: '퇴소공항인솔', types: ['EJ'] },
  { key: 'shirtSize', label: '단체티', types: ['S', 'DG', 'F'] },
  { key: 'notes', label: '특이사항', area: true }, { key: 'etc', label: '기타', area: true },
];
const forType = (fields: Field[], t: CampType) => fields.filter((f) => !f.types || f.types.includes(t));

/** 내보내기 헤더 — 예전 ST 시트 헤더 그대로 (다시 붙여넣기 할 수 있게) */
const EXPORT_HEADERS: Array<[string, string]> = (() => {
  const seen = new Set<string>();
  const out: Array<[string, string]> = [];
  for (const [header, key] of Object.entries(ST_SHEET_HEADER_MAPPING)) {
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([key, key === 'studentId' ? '고유번호' : header]);
  }
  return out;
})();

export default function CampStudentsPage() {
  const [codes, setCodes] = useState<JobCode[]>([]);
  const [gen, setGen] = useState('');
  const [camp, setCamp] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [families, setFamilies] = useState<CampFamily[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'list' | 'paste'>('list');
  const [filter, setFilter] = useState<EnrollmentStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Student | 'new' | null>(null);
  const [familyEditing, setFamilyEditing] = useState<CampFamily | 'new' | null>(null);

  const campType: CampType = camp ? campTypeOfCode(camp) : 'EJ';

  useEffect(() => {
    getAllJobCodes().then((list: any[]) => {
      const cs = (list as JobCode[]).filter((c) => c.code)
        .sort((a, b) => String(b.generation).localeCompare(String(a.generation), 'ko', { numeric: true }) || compareCampCodes(a.code, b.code));
      setCodes(cs);
      const want = new URLSearchParams(window.location.search).get('camp')?.toUpperCase() ?? '';
      const hit = cs.find((c) => c.code === want);
      setGen(String((hit ?? cs[0])?.generation ?? ''));
      if (hit) setCamp(hit.code);
    }).catch(() => toast.error('캠프 코드를 불러오지 못했습니다.'));
  }, []);

  const load = useCallback(async (code: string) => {
    if (!code) return;
    setLoading(true);
    try {
      const res = await authenticatedGet<{ students: Student[]; families: CampFamily[] }>(`/api/admin/camp-students?camp=${encodeURIComponent(code)}`);
      setStudents(res.students);
      setFamilies(res.families ?? []);
      setSelected(new Set());
    } catch (e) {
      toast.error((e as Error).message || '명단을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!camp) return;
    void load(camp);
    const u = new URL(window.location.href);
    u.searchParams.set('camp', camp);
    window.history.replaceState(null, '', u.toString());
  }, [camp, load]);

  const gens = useMemo(() => [...new Set(codes.map((c) => String(c.generation)))], [codes]);
  const counts = useMemo(() => {
    const c = { all: students.length, applied: 0, confirmed: 0, cancelled: 0 } as Record<string, number>;
    students.forEach((s) => { c[s.status] = (c[s.status] ?? 0) + 1; });
    return c;
  }, [students]);
  const shown = useMemo(() => {
    const text = q.trim();
    const digits = text.replace(/\D/g, '');
    return students.filter((s) => (filter === 'all' || s.status === filter) && (!text
      || String(s.name ?? '').includes(text) || String(s.englishName ?? '').toLowerCase().includes(text.toLowerCase())
      || (digits.length >= 3 && String(s.parentPhone ?? '').replace(/\D/g, '').includes(digits))
      || String(s.classNumber ?? '').toUpperCase() === text.toUpperCase()));
  }, [students, filter, q]);

  const toggle = (id: string) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShownSelected = shown.length > 0 && shown.every((s) => selected.has(s.studentId));

  const setStatus = async (status: EnrollmentStatus) => {
    const ids = [...selected];
    if (!ids.length) return;
    if (status === 'cancelled' && !window.confirm(`${ids.length}명을 취소할까요? 캠프 화면 명단에서 빠집니다.`)) return;
    setBusy(true);
    try {
      await authenticatedPost('/api/admin/camp-students', { action: 'status', campCode: camp, studentIds: ids, status });
      toast.success(`${ids.length}명 ${STATUS_LABEL[status]}`);
      await load(camp);
    } catch (e) {
      toast.error((e as Error).message || '바꾸지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const rows = filter === 'all' ? students : shown;
    const used = EXPORT_HEADERS.filter(([key]) => rows.some((s) => s[key] !== undefined && s[key] !== ''));
    const dyn = [...new Set(rows.flatMap((s) => Object.keys(s.displayFields ?? {})))];
    const table = [
      ['상태', ...used.map(([, h]) => h), ...dyn],
      ...rows.map((s) => [STATUS_LABEL[s.status], ...used.map(([key]) => s[key] ?? ''), ...dyn.map((h) => s.displayFields?.[h] ?? '')]),
    ];
    const blob = new Blob([toCsv(table)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${camp}_학생명단_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-[1600px] mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">학생 명단 관리</h1>
        <p className="text-sm text-gray-500 mt-1 mb-5">
          학생 정보는 앱이 원본입니다 (구글 시트 연동 없음). 확정한 학생만 반 · 방 · 입퇴소 등 캠프 화면에 보입니다.
          학부모가 앱에서 신청하면 &lsquo;신청&rsquo;으로 들어오고, 여기서 확정합니다.
        </p>

        {/* 캠프 고르기 */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <select value={gen} onChange={(e) => setGen(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
            {gens.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          {codes.filter((c) => String(c.generation) === gen).map((c) => (
            <button key={c.id} onClick={() => setCamp(c.code)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${camp === c.code ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
              {c.code}
            </button>
          ))}
        </div>

        {!camp ? (
          <p className="text-gray-500 text-sm">캠프를 골라주세요.</p>
        ) : (
          <>
            <div className="flex gap-1 border-b mb-4">
              {([['list', `명단 (${counts.all})`], ['paste', '엑셀 붙여넣기']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`px-4 py-2 text-sm -mb-px border-b-2 ${tab === k ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>

            {tab === 'paste' ? (
              <PastePanel camp={camp} campType={campType} onDone={() => { setTab('list'); void load(camp); }} />
            ) : (
              <>
                {/* 도구 */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {(['all', 'applied', 'confirmed', 'cancelled'] as const).map((k) => (
                    <button key={k} onClick={() => setFilter(k)}
                      className={`px-3 py-1 rounded-full text-xs border ${filter === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600'}`}>
                      {k === 'all' ? '전체' : STATUS_LABEL[k]} {counts[k] ?? 0}
                    </button>
                  ))}
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 보호자 번호 · 반번호"
                    className="border rounded-lg px-3 py-1.5 text-sm w-56" />
                  <div className="flex-1" />
                  <button onClick={() => setEditing('new')} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">+ 학생 추가</button>
                  <button onClick={exportCsv} disabled={!students.length} className="px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-40">CSV 내보내기</button>
                  <button onClick={() => load(camp)} className="px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50">새로고침</button>
                </div>
                {selected.size > 0 && (
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-blue-50 text-sm">
                    <span className="font-medium text-blue-800">{selected.size}명 선택</span>
                    <button disabled={busy} onClick={() => setStatus('confirmed')} className="px-2.5 py-1 rounded bg-emerald-600 text-white disabled:opacity-50">확정</button>
                    <button disabled={busy} onClick={() => setStatus('applied')} className="px-2.5 py-1 rounded bg-amber-500 text-white disabled:opacity-50">신청으로</button>
                    <button disabled={busy} onClick={() => setStatus('cancelled')} className="px-2.5 py-1 rounded bg-gray-600 text-white disabled:opacity-50">취소</button>
                    <button onClick={() => setSelected(new Set())} className="ml-auto text-blue-700 underline">선택 해제</button>
                  </div>
                )}

                {campType === 'F' && (
                  <FamilySection families={families} students={students} onEdit={setFamilyEditing} />
                )}

                <div className="overflow-x-auto border rounded-lg bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 text-xs">
                      <tr>
                        <th className="px-2 py-2 w-8">
                          <input type="checkbox" checked={allShownSelected}
                            onChange={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((s) => s.studentId)))} />
                        </th>
                        <th className="px-2 py-2 text-left">#</th>
                        <th className="px-2 py-2 text-left">상태</th>
                        <th className="px-2 py-2 text-left">이름</th>
                        <th className="px-2 py-2 text-left">성별 · 학년</th>
                        <th className="px-2 py-2 text-left">반</th>
                        <th className="px-2 py-2 text-left">방</th>
                        {campType === 'F' && <th className="px-2 py-2 text-left">가족</th>}
                        <th className="px-2 py-2 text-left">보호자</th>
                        <th className="px-2 py-2 text-left">주민번호</th>
                        <th className="px-2 py-2 text-left">학부모 계정</th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={12} className="px-3 py-10 text-center text-gray-400">불러오는 중…</td></tr>
                      ) : shown.length === 0 ? (
                        <tr><td colSpan={12} className="px-3 py-10 text-center text-gray-400">
                          {students.length ? '조건에 맞는 학생이 없습니다.' : '아직 학생이 없습니다. 학생 추가 또는 엑셀 붙여넣기로 넣어주세요.'}
                        </td></tr>
                      ) : shown.map((s) => (
                        <tr key={s.studentId} className={`border-t ${s.status === 'cancelled' ? 'text-gray-400' : ''}`}>
                          <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={selected.has(s.studentId)} onChange={() => toggle(s.studentId)} /></td>
                          <td className="px-2 py-1.5 text-gray-400">{s.order || ''}</td>
                          <td className="px-2 py-1.5"><span className={`px-2 py-0.5 rounded-full border text-xs ${STATUS_STYLE[s.status]}`}>{STATUS_LABEL[s.status]}</span></td>
                          <td className="px-2 py-1.5 font-medium">{s.name}{s.englishName ? <span className="text-gray-400 font-normal"> · {s.englishName}</span> : null}</td>
                          <td className="px-2 py-1.5">{s.gender === 'M' ? '남' : s.gender === 'F' ? '여' : ''} {s.grade}</td>
                          <td className="px-2 py-1.5">{[s.classNumber, s.className].filter(Boolean).join(' ')}{s.classMentor ? <span className="text-gray-400"> · {s.classMentor}</span> : null}</td>
                          <td className="px-2 py-1.5">{s.roomNumber}</td>
                          {campType === 'F' && <td className="px-2 py-1.5">{s.familyId}</td>}
                          <td className="px-2 py-1.5">{s.parentName} {s.parentPhone}</td>
                          <td className="px-2 py-1.5 text-xs">{s.hasSsn ? <span className="text-gray-600">{s.ssn}</span> : <span className="text-red-400">없음</span>}</td>
                          <td className="px-2 py-1.5 text-xs">{s.parentCount ? `${s.parentCount}명` : <span className="text-gray-400">없음</span>}</td>
                          <td className="px-2 py-1.5 text-right"><button onClick={() => setEditing(s)} className="text-blue-600 hover:underline text-xs">고치기</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  학부모 계정 연결은 <Link href="/admin/user-manage" className="underline">사용자 관리</Link>에서 학부모를 골라 합니다.
                </p>
              </>
            )}
          </>
        )}
      </div>

      {editing && (
        <StudentModal camp={camp} campType={campType} student={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(camp); }} />
      )}
      {familyEditing && (
        <FamilyModal camp={camp} family={familyEditing === 'new' ? null : familyEditing}
          onClose={() => setFamilyEditing(null)} onSaved={() => { setFamilyEditing(null); void load(camp); }} />
      )}
    </Layout>
  );
}

// ─── 학생 추가 · 고치기 ───────────────────────────────────

function StudentModal({ camp, campType, student, onClose, onSaved }: {
  camp: string; campType: CampType; student: Student | null; onClose: () => void; onSaved: () => void;
}) {
  const isNew = !student;
  const [found, setFound] = useState<Found[] | null>(null);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Found | null>(null);
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (student) for (const f of [...CHILD_FIELDS, ...ENROLLMENT_FIELDS]) init[f.key] = String(student[f.key] ?? '');
    return init;
  });
  const [ssn, setSsn] = useState('');
  const [status, setStatus] = useState<EnrollmentStatus>('confirmed');
  const [saving, setSaving] = useState(false);

  const childFields = forType(CHILD_FIELDS, campType);
  const enrollmentFields = forType(ENROLLMENT_FIELDS, campType);

  const runSearch = async () => {
    if (search.trim().length < 2) { toast.error('이름 두 글자 이상 또는 보호자 번호를 넣어주세요.'); return; }
    try {
      const res = await authenticatedGet<{ children: Found[] }>(`/api/admin/camp-students?search=${encodeURIComponent(search.trim())}`);
      setFound(res.children);
    } catch (e) {
      toast.error((e as Error).message || '찾지 못했습니다.');
    }
  };

  const changed = (keys: Field[]) => Object.fromEntries(keys
    .filter((f) => (form[f.key] ?? '') !== String(student?.[f.key] ?? ''))
    .map((f) => [f.key, form[f.key] ?? '']));

  const save = async () => {
    setSaving(true);
    try {
      if (isNew) {
        const child = picked ? undefined : Object.fromEntries(childFields.map((f) => [f.key, form[f.key] ?? '']).filter(([, v]) => v));
        if (!picked && !child?.name) { toast.error('이름을 넣어주세요.'); setSaving(false); return; }
        const enrollment = Object.fromEntries(enrollmentFields.map((f) => [f.key, form[f.key] ?? '']).filter(([, v]) => v));
        await authenticatedPost('/api/admin/camp-students', {
          action: 'add', campCode: camp, status, childId: picked?.childId, child, enrollment, ssn: ssn || undefined,
        });
        toast.success('학생을 넣었습니다.');
      } else {
        const child = changed(childFields);
        const enrollment = changed(enrollmentFields);
        if (!Object.keys(child).length && !Object.keys(enrollment).length && !ssn) { onClose(); return; }
        await authenticatedPost('/api/admin/camp-students', {
          action: 'update', campCode: camp, studentId: student!.studentId, child, enrollment, ssn: ssn || undefined,
        });
        toast.success('저장했습니다.');
      }
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!student || !window.confirm(`${student.name} 학생의 이 캠프 참가를 지울까요? (아이 정보는 남습니다)`)) return;
    try {
      await authenticatedPost('/api/admin/camp-students', { action: 'remove', campCode: camp, studentId: student.studentId });
      toast.success('지웠습니다.');
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || '지우지 못했습니다.');
    }
  };

  const input = (f: Field) => (
    <label key={f.key} className={`block ${f.area ? 'col-span-2' : ''}`}>
      <span className="text-xs text-gray-500">{f.label}</span>
      {f.options ? (
        <select value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="mt-0.5 w-full border rounded px-2 py-1.5 text-sm">
          {f.options.map((o) => <option key={o} value={o}>{o === 'M' ? '남' : o === 'F' ? '여' : '-'}</option>)}
        </select>
      ) : f.area ? (
        <textarea value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} rows={2} className="mt-0.5 w-full border rounded px-2 py-1.5 text-sm" />
      ) : (
        <input value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="mt-0.5 w-full border rounded px-2 py-1.5 text-sm" />
      )}
    </label>
  );

  return (
    <div data-modal-overlay className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl my-8 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold">{isNew ? `${camp} 학생 추가` : `${student!.name} · ${camp}`}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {isNew && (
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-600 mb-2">다른 캠프에 왔던 아이면 찾아서 고르세요 (아이 정보를 다시 넣지 않아도 됩니다).</p>
              <div className="flex gap-2">
                <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(); }}
                  placeholder="이름 또는 보호자 번호" className="flex-1 border rounded px-2 py-1.5 text-sm" />
                <button onClick={runSearch} className="px-3 py-1.5 text-sm rounded border bg-white">찾기</button>
              </div>
              {found && (
                <ul className="mt-2 space-y-1">
                  {found.length === 0 && <li className="text-xs text-gray-400">없습니다 — 아래에 새로 넣어주세요.</li>}
                  {found.map((c) => (
                    <li key={c.childId}>
                      <button onClick={() => setPicked(picked?.childId === c.childId ? null : c)}
                        className={`w-full text-left px-2 py-1.5 rounded text-sm border ${picked?.childId === c.childId ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:bg-white'}`}>
                        <b>{c.name}</b> {c.englishName} · {c.gender === 'M' ? '남' : c.gender === 'F' ? '여' : ''} {c.birthDate} · 보호자 {c.parentName} {c.parentPhone} {c.ssnMasked && `· ${c.ssnMasked}`}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!(isNew && picked) && (
            <section>
              <h3 className="text-sm font-semibold mb-2">아이 정보 <span className="text-xs font-normal text-gray-400">— 다음 캠프에도 그대로 씁니다</span></h3>
              <div className="grid grid-cols-2 gap-3">{childFields.map(input)}</div>
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold mb-2">주민등록번호</h3>
            <div className="flex items-center gap-2">
              {!isNew && <span className="text-sm text-gray-500">{student!.hasSsn ? `지금: ${student!.ssn}` : '없음'}</span>}
              <input value={ssn} onChange={(e) => setSsn(e.target.value)} placeholder={isNew || !student!.hasSsn ? '13자리 (암호화해서 저장)' : '바꿀 때만 넣기'}
                className="border rounded px-2 py-1.5 text-sm w-60" autoComplete="off" />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">{camp} 참가</h3>
            {isNew && (
              <div className="mb-3 flex gap-2 text-sm">
                {(['confirmed', 'applied'] as const).map((k) => (
                  <label key={k} className="flex items-center gap-1">
                    <input type="radio" checked={status === k} onChange={() => setStatus(k)} /> {STATUS_LABEL[k]}
                  </label>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">{enrollmentFields.map(input)}</div>
          </section>
        </div>
        <div className="flex items-center gap-2 px-5 py-4 border-t">
          {!isNew && student!.status !== 'confirmed' && (
            <button onClick={remove} className="text-sm text-red-600 hover:underline">이 캠프 참가 지우기</button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">닫기</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {saving ? '저장 중…' : isNew ? '넣기' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 엑셀 붙여넣기 ───────────────────────────────────────

function PastePanel({ camp, campType, onDone }: { camp: string; campType: CampType; onDone: () => void }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<EnrollmentStatus>('confirmed');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const table = useMemo(() => parseSpreadsheetText(text), [text]);

  const run = async (dryRun: boolean) => {
    if (table.length < 2) { toast.error('1행 헤더와 학생 줄을 함께 붙여넣어 주세요.'); return; }
    setBusy(true);
    try {
      const res = await authenticatedPost<ImportResult>('/api/admin/camp-students', { action: 'import', campCode: camp, table, dryRun, status });
      if (dryRun) setPreview(res);
      else {
        toast.success(`넣었습니다 — 새 아이 ${res.counts.create} · 왔던 아이 ${res.counts.enroll} · 고침 ${res.counts.update}`);
        setText(''); setPreview(null); onDone();
      }
    } catch (e) {
      toast.error((e as Error).message || '처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) { toast.error('CSV 파일만 올릴 수 있습니다 (엑셀은 다른 이름으로 저장 → CSV UTF-8).'); return; }
    setText(await file.text()); setPreview(null);
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600 space-y-1">
        <p>엑셀(또는 예전 ST 시트)에서 <b>1행 헤더까지</b> 복사해 아래에 붙여넣거나 CSV 파일을 고르세요. 헤더 이름은 예전 ST 시트와 같습니다 (학생 이름 · 성별 · 학년 · 부모님 연락처 · 반번호 · 방호수 …).</p>
        <p className="text-xs text-gray-500">
          {campType === 'F'
            ? '가족 캠프는 예전 가족 ST 시트 모양(가족번호 · 보호자 칸 + 학생 칸) 그대로 붙여넣습니다.'
            : '고유번호가 같은 학생 · 이름과 보호자 번호가 같은 아이는 새로 만들지 않고 고칩니다. 빈 칸은 기존 값을 지우지 않습니다. 이월 · 취소 줄은 건너뜁니다.'}
          {' '}주민등록번호는 13자리일 때만 암호화해서 저장합니다.
        </p>
      </div>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} rows={10}
        placeholder="여기에 붙여넣기 (⌘/Ctrl+V)" className="w-full border rounded-lg p-3 font-mono text-xs" />
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" accept=".csv,.tsv,.txt" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
        <span className="text-xs text-gray-500">{table.length ? `${table.length - 1}줄 · 헤더 ${table[0]?.filter(Boolean).length ?? 0}칸` : ''}</span>
        <div className="flex-1" />
        <label className="text-sm flex items-center gap-2">새로 넣는 학생
          <select value={status} onChange={(e) => setStatus(e.target.value as EnrollmentStatus)} className="border rounded px-2 py-1">
            <option value="confirmed">확정</option><option value="applied">신청</option>
          </select>
        </label>
        <button onClick={() => run(true)} disabled={busy || table.length < 2} className="px-4 py-2 text-sm rounded-lg border bg-white disabled:opacity-40">미리 보기</button>
        <button onClick={() => run(false)} disabled={busy || !preview} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40">넣기</button>
      </div>
      {preview && (
        <div className="border rounded-lg bg-white">
          <div className="px-4 py-2 border-b text-sm flex flex-wrap gap-3">
            <span>새 아이 <b>{preview.counts.create}</b></span>
            <span>다른 캠프에 왔던 아이 <b>{preview.counts.enroll}</b></span>
            <span>이미 있어서 고침 <b>{preview.counts.update}</b></span>
            <span className="text-gray-500">건너뜀 {preview.counts.skip}</span>
            {preview.isFamily && <span>가족 <b>{preview.families ?? 0}</b></span>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="min-w-full text-sm">
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={`${r.row}-${i}`} className="border-t">
                    <td className="px-3 py-1 text-gray-400 w-16">{r.row}행</td>
                    <td className="px-3 py-1"><span className={`px-2 py-0.5 rounded text-xs ${ACTION_STYLE[r.action]}`}>{ACTION_LABEL[r.action]}</span></td>
                    <td className="px-3 py-1">{r.name}</td>
                    <td className="px-3 py-1 text-gray-500">{r.grade}{r.familyId ? ` · 가족 ${r.familyId}` : ''}</td>
                    <td className="px-3 py-1 text-xs text-gray-400">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 가족 캠프 ───────────────────────────────────────────

function FamilySection({ families, students, onEdit }: { families: CampFamily[]; students: Student[]; onEdit: (f: CampFamily | 'new') => void }) {
  const kids = (id: string) => students.filter((s) => s.familyId === id && s.status !== 'cancelled').map((s) => s.name).join(', ');
  return (
    <div className="mb-4 border rounded-lg bg-white">
      <div className="flex items-center px-3 py-2 border-b">
        <span className="text-sm font-semibold">가족 {families.length}</span>
        <div className="flex-1" />
        <button onClick={() => onEdit('new')} className="text-xs text-blue-600 hover:underline">+ 가족 추가</button>
      </div>
      <div className="divide-y max-h-64 overflow-y-auto">
        {families.length === 0 && <p className="px-3 py-4 text-xs text-gray-400">가족이 없습니다. 학생의 가족번호와 같은 번호로 가족을 만들어 주세요.</p>}
        {[...families].sort((a, b) => (Number(a.order ?? 0) - Number(b.order ?? 0)) || a.familyId.localeCompare(b.familyId)).map((f) => (
          <div key={f.familyId} className="flex items-center gap-3 px-3 py-1.5 text-sm">
            <span className="w-10 text-gray-500">{f.familyId}</span>
            <span className="w-20">{f.familyType}</span>
            <span className="w-14 text-gray-500">{f.roomNumber}</span>
            <span className="flex-1 truncate">{(f.parents ?? []).map((p) => `${p.name} ${p.phone ?? ''}`).join(' · ')} <span className="text-gray-400">/ {kids(f.familyId)}</span></span>
            <button onClick={() => onEdit(f)} className="text-xs text-blue-600 hover:underline">고치기</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function FamilyModal({ camp, family, onClose, onSaved }: { camp: string; family: CampFamily | null; onClose: () => void; onSaved: () => void }) {
  const [familyId, setFamilyId] = useState(family?.familyId ?? '');
  const [familyType, setFamilyType] = useState(family?.familyType ?? '');
  const [roomNumber, setRoomNumber] = useState(family?.roomNumber ?? '');
  const [parents, setParents] = useState<Array<{ id: string; name: string; phone: string; email: string; ssn: string; masked?: string }>>(
    (family?.parents ?? []).map((p) => ({ id: p.id, name: p.name, phone: p.phone ?? '', email: p.email ?? '', ssn: '', masked: p.ssn })),
  );
  const [saving, setSaving] = useState(false);
  const setP = (i: number, k: string, v: string) => setParents((cur) => cur.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  const save = async () => {
    if (!familyId.trim()) { toast.error('가족번호를 넣어주세요.'); return; }
    setSaving(true);
    try {
      await authenticatedPost('/api/admin/camp-students', {
        action: 'family', campCode: camp, familyId: familyId.trim(),
        family: { familyType, roomNumber, parents: parents.filter((p) => p.name.trim()).map(({ ssn: _s, masked: _m, ...p }) => p) },
        ssn: Object.fromEntries(parents.filter((p) => p.ssn.trim()).map((p) => [p.id, p.ssn.trim()])),
      });
      toast.success('저장했습니다.');
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-modal-overlay className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl my-8 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold">{family ? `가족 ${family.familyId}` : '가족 추가'} · {camp}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><span className="text-xs text-gray-500">가족번호</span>
              <input value={familyId} disabled={!!family} onChange={(e) => setFamilyId(e.target.value)} className="mt-0.5 w-full border rounded px-2 py-1.5 text-sm disabled:bg-gray-50" /></label>
            <label className="block"><span className="text-xs text-gray-500">가족 유형</span>
              <input value={familyType} onChange={(e) => setFamilyType(e.target.value)} placeholder="2인 가족" className="mt-0.5 w-full border rounded px-2 py-1.5 text-sm" /></label>
            <label className="block"><span className="text-xs text-gray-500">방호수</span>
              <input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} className="mt-0.5 w-full border rounded px-2 py-1.5 text-sm" /></label>
          </div>
          <div>
            <div className="flex items-center mb-2">
              <h3 className="text-sm font-semibold">함께 오는 보호자</h3>
              <div className="flex-1" />
              <button onClick={() => setParents((cur) => [...cur, { id: `P${familyId || '00'}.${cur.length + 1}`, name: '', phone: '', email: '', ssn: '' }])}
                className="text-xs text-blue-600 hover:underline">+ 보호자</button>
            </div>
            <div className="space-y-2">
              {parents.map((p, i) => (
                <div key={i} className="grid grid-cols-5 gap-2">
                  <input value={p.id} onChange={(e) => setP(i, 'id', e.target.value)} placeholder="번호" className="border rounded px-2 py-1 text-sm" />
                  <input value={p.name} onChange={(e) => setP(i, 'name', e.target.value)} placeholder="이름" className="border rounded px-2 py-1 text-sm" />
                  <input value={p.phone} onChange={(e) => setP(i, 'phone', e.target.value)} placeholder="연락처" className="border rounded px-2 py-1 text-sm" />
                  <input value={p.email} onChange={(e) => setP(i, 'email', e.target.value)} placeholder="이메일" className="border rounded px-2 py-1 text-sm" />
                  <input value={p.ssn} onChange={(e) => setP(i, 'ssn', e.target.value)} placeholder={p.masked || '주민번호 13자리'} autoComplete="off" className="border rounded px-2 py-1 text-sm" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">닫기</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  );
}
