'use client';
/**
 * 학부모 홈 — 우리 아이 등록 · 정보 고치기, 캠프 참가 신청 · 신청서 고치기 · 철회
 * 읽기는 규칙(parentIds)으로 바로, 쓰기는 /api/parent/* (주민등록번호는 서버에서 암호화).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import Layout from '@/components/common/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { authenticatedFetch, authenticatedGet } from '@/lib/apiClient';
import {
  getMyChildren, getMyEnrollments, logger, PARENT_CHILD_FORM_FIELDS, applicationQuestionsFor, campTypeOfCode,
  SCALE_CHOICES, ENROLLMENT_STATUS_LABEL, PARENT_EDITABLE_AFTER_CONFIRM,
  type ChildProfile, type CampEnrollment, type OpenCamp, type ApplicationQuestion,
} from '@smis-mentor/shared';

async function call(method: 'POST' | 'PUT' | 'DELETE', url: string, body: unknown) {
  const res = await authenticatedFetch(url, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || '처리하지 못했습니다.');
  return data;
}

const STATUS_STYLE: Record<string, string> = {
  applied: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
};

export default function ParentHomePage() {
  const { userData, loading } = useAuth() as { userData: any; loading?: boolean };
  const router = useRouter();
  const uid: string = userData?.userId || userData?.id || '';
  const [children, setChildren] = useState<ChildProfile[] | null>(null);
  const [enrollments, setEnrollments] = useState<CampEnrollment[]>([]);
  const [openCamps, setOpenCamps] = useState<OpenCamp[]>([]);
  const [childForm, setChildForm] = useState<ChildProfile | 'new' | null>(null);
  const [applying, setApplying] = useState<{ child: ChildProfile; enrollment?: CampEnrollment } | null>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    try {
      const [c, e] = await Promise.all([getMyChildren(db, uid), getMyEnrollments(db, uid)]);
      setChildren(c);
      setEnrollments(e);
    } catch (err) {
      logger.error('우리 아이 불러오기 실패:', err);
      setChildren([]);
    }
    authenticatedGet<{ camps: OpenCamp[] }>('/api/parent/camps').then((r) => setOpenCamps(r.camps ?? [])).catch(() => setOpenCamps([]));
  }, [uid]);

  useEffect(() => {
    if (loading) return;
    if (!userData) { router.replace('/sign-in?redirect=/parent'); return; }
    if (userData.role !== 'parent') { router.replace('/'); return; }
    void load();
  }, [userData, loading, router, load]);

  const withdraw = async (e: CampEnrollment, name: string) => {
    if (!window.confirm(`${name} — ${e.campCode} 신청을 철회할까요?`)) return;
    try {
      await call('DELETE', '/api/parent/enrollments', { campCode: e.campCode, studentId: e.studentId });
      toast.success('신청을 철회했습니다.');
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto py-6 px-1">
        <h1 className="text-2xl font-bold text-gray-900">학부모 홈</h1>
        {userData?.name && <p className="mt-1 text-gray-600">{userData.name}님, 반갑습니다.</p>}

        {openCamps.length > 0 && (
          <section className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <h2 className="text-sm font-semibold text-blue-900">지금 신청할 수 있는 캠프</h2>
            <ul className="mt-2 space-y-1 text-sm text-blue-900">
              {openCamps.map((c) => (
                <li key={c.campCode}>
                  <b>{c.name}</b> ({c.campCode}){c.startDate ? ` · ${c.startDate}${c.endDate ? ` ~ ${c.endDate}` : ''}` : ''}{c.location ? ` · ${c.location}` : ''}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-blue-800">아래 아이 카드에서 &lsquo;캠프 신청&rsquo;을 눌러주세요. 운영진이 확인한 뒤 참가가 확정됩니다.</p>
          </section>
        )}

        <section className="mt-5">
          <div className="flex items-center">
            <h2 className="text-lg font-semibold text-gray-800">우리 아이</h2>
            <div className="flex-1" />
            <button onClick={() => setChildForm('new')} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">+ 아이 등록</button>
          </div>
          {children === null ? (
            <p className="mt-3 text-sm text-gray-500">불러오는 중…</p>
          ) : children.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600">
              아직 등록한 아이가 없습니다. &lsquo;아이 등록&rsquo;으로 아이 정보를 넣어주세요.
              <br />예전에 SMIS 캠프에 왔던 아이는 이름이 같으면 그 기록과 이어집니다.
            </div>
          ) : (
            <ul className="mt-3 space-y-3">
              {children.map((c) => {
                const mine = enrollments.filter((e) => e.childId === c.childId);
                const applied = new Set(mine.map((e) => e.campCode));
                const canApply = openCamps.some((oc) => !applied.has(oc.campCode));
                return (
                  <li key={c.childId} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">{c.name}{c.englishName ? <span className="ml-1 font-normal text-gray-500">{c.englishName}</span> : null}</p>
                        <p className="text-sm text-gray-500">
                          {[c.gender === 'M' ? '남' : c.gender === 'F' ? '여' : '', c.birthDate, c.ssnMasked ? '주민번호 등록됨' : ''].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <button onClick={() => setChildForm(c)} className="text-sm text-blue-600 hover:underline">정보 고치기</button>
                    </div>
                    {mine.length > 0 && (
                      <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
                        {mine.map((e) => (
                          <li key={`${e.campCode}_${e.studentId}`} className="flex items-center gap-2 py-2 text-sm">
                            <span className="font-medium text-gray-800">{e.campCode}</span>
                            <span className={`px-2 py-0.5 rounded-full border text-xs ${STATUS_STYLE[e.status] ?? ''}`}>{ENROLLMENT_STATUS_LABEL[e.status] ?? e.status}</span>
                            {e.status === 'confirmed' && (e.classNumber || e.roomNumber) && (
                              <span className="text-gray-500">{[e.classNumber && `반 ${e.classNumber}`, e.roomNumber && `방 ${e.roomNumber}`].filter(Boolean).join(' · ')}</span>
                            )}
                            <div className="flex-1" />
                            {e.status !== 'cancelled' && (
                              <button onClick={() => setApplying({ child: c, enrollment: e })} className="text-blue-600 hover:underline">신청서</button>
                            )}
                            {e.status === 'applied' && (
                              <button onClick={() => withdraw(e, c.name)} className="text-gray-500 hover:underline">철회</button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {canApply && (
                      <button onClick={() => setApplying({ child: c })} className="mt-3 w-full rounded-lg border border-blue-200 bg-blue-50 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">
                        캠프 신청
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {childForm && (
        <ChildFormModal child={childForm === 'new' ? null : childForm} defaults={{ parentName: userData?.name ?? '', parentPhone: userData?.phoneNumber ?? '' }}
          onClose={() => setChildForm(null)} onSaved={() => { setChildForm(null); void load(); }} />
      )}
      {applying && (
        <ApplicationModal child={applying.child} enrollment={applying.enrollment}
          camps={openCamps.filter((oc) => !enrollments.some((e) => e.childId === applying.child.childId && e.campCode === oc.campCode))}
          onClose={() => setApplying(null)} onSaved={() => { setApplying(null); void load(); }} />
      )}
    </Layout>
  );
}

// ─── 아이 등록 · 고치기 ───────────────────────────────────

function ChildFormModal({ child, defaults, onClose, onSaved }: {
  child: ChildProfile | null; defaults: { parentName: string; parentPhone: string }; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of PARENT_CHILD_FORM_FIELDS) init[f.key] = String((child as Record<string, unknown> | null)?.[f.key] ?? '');
    if (!child) { init.parentName = defaults.parentName; init.parentPhone = defaults.parentPhone; }
    return init;
  });
  const [ssn, setSsn] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const missing = PARENT_CHILD_FORM_FIELDS.filter((f) => f.required && !form[f.key]?.trim());
    if (missing.length) { toast.error(`${missing.map((f) => f.label).join(', ')}을(를) 넣어주세요.`); return; }
    if (ssn && ssn.replace(/\D/g, '').length !== 13) { toast.error('주민등록번호 13자리를 확인해주세요.'); return; }
    setSaving(true);
    try {
      if (child) {
        const changed = Object.fromEntries(PARENT_CHILD_FORM_FIELDS
          .filter((f) => (form[f.key] ?? '') !== String((child as unknown as Record<string, unknown>)[f.key] ?? ''))
          .map((f) => [f.key, form[f.key] ?? '']));
        await call('PUT', '/api/parent/children', { childId: child.childId, child: changed, ssn: ssn || undefined });
        toast.success('저장했습니다.');
      } else {
        const res = await call('POST', '/api/parent/children', { child: form, ssn: ssn || undefined });
        toast.success(res.linkedExisting ? '예전 캠프 기록과 이어서 등록했습니다.' : '등록했습니다.');
      }
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={child ? `${child.name} 정보` : '아이 등록'} onClose={onClose}
      footer={<button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? '저장 중…' : '저장'}</button>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PARENT_CHILD_FORM_FIELDS.map((f) => (
          <label key={f.key} className={`block ${f.kind === 'area' ? 'sm:col-span-2' : ''}`}>
            <span className="text-xs text-gray-600">{f.label}{f.required ? ' *' : ''}{f.hint ? <span className="text-gray-400"> · {f.hint}</span> : null}</span>
            {f.kind === 'gender' ? (
              <div className="mt-1 flex gap-2">
                {[['M', '남'], ['F', '여']].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setForm({ ...form, gender: v })}
                    className={`flex-1 rounded-lg border py-1.5 text-sm ${form.gender === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'bg-white'}`}>{l}</button>
                ))}
              </div>
            ) : f.kind === 'area' ? (
              <textarea value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} rows={2} placeholder={f.placeholder}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
            ) : (
              <input value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder}
                type={f.kind === 'date' ? 'date' : f.kind === 'phone' ? 'tel' : 'text'} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
            )}
          </label>
        ))}
        <label className="block sm:col-span-2">
          <span className="text-xs text-gray-600">주민등록번호 <span className="text-gray-400">· 보험 · 병원 접수에 필요 (암호화해서 보관)</span></span>
          <input value={ssn} onChange={(e) => setSsn(e.target.value)} autoComplete="off" inputMode="numeric"
            placeholder={child?.ssnMasked ? `등록됨 (${child.ssnMasked}) — 바꿀 때만 넣기` : '13자리'} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
        </label>
      </div>
    </Modal>
  );
}

// ─── 캠프 신청서 ─────────────────────────────────────────

function ApplicationModal({ child, enrollment, camps, onClose, onSaved }: {
  child: ChildProfile; enrollment?: CampEnrollment; camps: OpenCamp[]; onClose: () => void; onSaved: () => void;
}) {
  const [campCode, setCampCode] = useState(enrollment?.campCode ?? camps[0]?.campCode ?? '');
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (enrollment) for (const [k, v] of Object.entries(enrollment)) if (typeof v === 'string') init[k] = v;
    return init;
  });
  const [saving, setSaving] = useState(false);
  const confirmed = enrollment?.status === 'confirmed';
  const questions = useMemo(() => (campCode ? applicationQuestionsFor(campTypeOfCode(campCode)) : []), [campCode]);
  const locked = (q: ApplicationQuestion) => confirmed && !PARENT_EDITABLE_AFTER_CONFIRM.has(q.key);

  const save = async () => {
    if (!campCode) { toast.error('캠프를 골라주세요.'); return; }
    const missing = questions.filter((q) => q.required && !answers[q.key]?.trim() && !locked(q));
    if (missing.length) { toast.error(`${missing.map((q) => q.label).join(', ')}을(를) 넣어주세요.`); return; }
    setSaving(true);
    try {
      const payload = Object.fromEntries(questions.filter((q) => !locked(q)).map((q) => [q.key, answers[q.key] ?? '']));
      if (enrollment) {
        await call('PUT', '/api/parent/enrollments', { campCode, studentId: enrollment.studentId, answers: payload });
        toast.success('신청서를 고쳤습니다.');
      } else {
        await call('POST', '/api/parent/enrollments', { campCode, childId: child.childId, answers: payload });
        toast.success('신청했습니다. 운영진이 확인한 뒤 확정됩니다.');
      }
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const field = (q: ApplicationQuestion) => {
    const v = answers[q.key] ?? '';
    const set = (x: string) => setAnswers({ ...answers, [q.key]: x });
    const disabled = locked(q);
    return (
      <div key={q.key} className="py-2">
        <p className="text-sm text-gray-800">{q.label}{q.required ? ' *' : ''}{disabled ? <span className="ml-1 text-xs text-gray-400">(확정 뒤에는 운영진에게)</span> : null}</p>
        {q.kind === 'scale' ? (
          <div className="mt-1 grid grid-cols-5 gap-1">
            {SCALE_CHOICES.map((c) => (
              <button key={c.value} type="button" disabled={disabled} onClick={() => set(v === c.value ? '' : c.value)}
                className={`rounded-lg border px-1 py-1.5 text-xs ${v === c.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'bg-white text-gray-600'} disabled:opacity-50`}>
                {c.value}<br />{c.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <input value={v} disabled={disabled} onChange={(e) => set(q.kind === 'mbti' ? e.target.value.toUpperCase().slice(0, 4) : e.target.value)}
              inputMode={q.kind === 'number' ? 'decimal' : undefined} placeholder={q.placeholder}
              className="flex-1 rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50" />
            {q.unit && <span className="text-sm text-gray-500">{q.unit}</span>}
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal title={`${child.name} 캠프 ${enrollment ? '신청서' : '신청'}`} onClose={onClose}
      footer={<button onClick={save} disabled={saving || !campCode} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? '저장 중…' : enrollment ? '저장' : '신청하기'}</button>}>
      {enrollment ? (
        <p className="text-sm text-gray-600">{enrollment.campCode} · {ENROLLMENT_STATUS_LABEL[enrollment.status]}</p>
      ) : camps.length === 0 ? (
        <p className="text-sm text-gray-600">지금 신청할 수 있는 캠프가 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {camps.map((c) => (
            <button key={c.campCode} onClick={() => setCampCode(c.campCode)}
              className={`rounded-lg border px-3 py-2 text-sm text-left ${campCode === c.campCode ? 'border-blue-500 bg-blue-50' : 'bg-white'}`}>
              <b>{c.name}</b> <span className="text-gray-500">{c.campCode}</span>
              {c.startDate && <span className="block text-xs text-gray-500">{c.startDate}{c.endDate ? ` ~ ${c.endDate}` : ''}</span>}
            </button>
          ))}
        </div>
      )}
      {campCode && (
        <>
          <h3 className="mt-4 text-sm font-semibold text-gray-900">캠프 정보</h3>
          {questions.filter((q) => q.section === 'camp').map(field)}
          {questions.some((q) => q.section === 'survey') && (
            <>
              <h3 className="mt-4 text-sm font-semibold text-gray-900">사전 설문 <span className="font-normal text-gray-500">— 반 배정 · 상담에 씁니다 (아이와 함께 답해주세요)</span></h3>
              <div className="divide-y divide-gray-100">{questions.filter((q) => q.section === 'survey').map(field)}</div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

function Modal({ title, onClose, footer, children }: { title: string; onClose: () => void; footer: React.ReactNode; children: React.ReactNode }) {
  return (
    <div data-modal-overlay className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="닫기">✕</button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">닫기</button>
          {footer}
        </div>
      </div>
    </div>
  );
}
