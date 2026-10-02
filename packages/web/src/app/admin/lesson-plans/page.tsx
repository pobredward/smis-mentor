'use client';

/**
 * 관리자 → 원어민 레슨플랜 (/admin/lesson-plans)
 *
 * - 캠프를 고르면 원어민 선생님마다 맡은 교재(반 교재 L-Code × 과목)와 레슨플랜 상태 · 진행
 * - 레슨플랜을 열어(읽기 전용) 승인 · 수정 요청
 * - 캠프 합본(단권화) 링크 — Canva 공개보기 · Drive PDF. 단원 쪽 번호에 이어 붙는다
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Layout from '@/components/common/Layout';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { getAllJobCodes, getUsersByJobCodeId } from '@/lib/firebaseService';
import type { JobCodeWithId } from '@/types';
import { STATUS_STYLE } from '@/components/lessonPlan/status';
import {
  PLAN_STATUS_LABEL_KO,
  bookUnitsOf,
  classKeyLabel,
  compareCampCodes,
  contextCalendar,
  isHttpUrl,
  layoutPlan,
  lessonClassesOf,
  listLessonPlans,
  loadLessonPlanContext,
  logger,
  planBooksFor,
  planSubjectsOf,
  resolveActiveJobCodeId,
  setLessonPlanStatus,
  updateBundleLinks,
  type LessonPlanContext,
  type LessonPlanDoc,
  type PlanBook,
} from '@smis-mentor/shared';

type Member = { userId: string; name?: string; role?: string; jobExperiences?: Array<{ id: string; group?: string; groupRole?: string }> };

interface TeacherRow {
  userId: string;
  name: string;
  group: string;
  groupRole: string;
  books: Array<{ book: PlanBook; plan?: LessonPlanDoc; filled: number; total: number; warn: boolean }>;
  missing: string[];
}

export default function AdminLessonPlansPage() {
  const { userData } = useAuth();
  const [codes, setCodes] = useState<JobCodeWithId[]>([]);
  const [jobCodeId, setJobCodeId] = useState('');
  const [ctx, setCtx] = useState<LessonPlanContext | null>(null);
  const [plans, setPlans] = useState<LessonPlanDoc[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<Record<string, { canvaUrl: string; driveUrl: string }>>({});

  useEffect(() => {
    getAllJobCodes().then((list) => {
      const sorted = [...(list as JobCodeWithId[])].sort((a, b) => Number(b.generation ? String(b.generation).replace(/\D/g, '') : 0) - Number(a.generation ? String(a.generation).replace(/\D/g, '') : 0) || compareCampCodes(a.code, b.code));
      setCodes(sorted);
      const active = resolveActiveJobCodeId(userData);
      setJobCodeId((cur) => cur || (active && sorted.some((c) => c.id === active) ? active : sorted[0]?.id ?? ''));
    }).catch((e) => logger.error('캠프 목록 불러오기 실패:', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const [c, p, m] = await Promise.all([
        loadLessonPlanContext(db, { jobCodeId: id }),
        listLessonPlans(db, id),
        getUsersByJobCodeId(id) as unknown as Promise<Member[]>,
      ]);
      setCtx(c);
      setPlans(p);
      setMembers(m);
      const l: Record<string, { canvaUrl: string; driveUrl: string }> = {};
      Object.values(c.catalog.bundles).forEach((b) => { l[b.code] = { canvaUrl: b.canvaUrl ?? '', driveUrl: b.driveUrl ?? '' }; });
      setLinks(l);
    } catch (e) {
      logger.error('레슨플랜 현황 불러오기 실패:', e);
      toast.error('불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(jobCodeId); }, [jobCodeId]);

  const teachers = useMemo<TeacherRow[]>(() => {
    if (!ctx) return [];
    return members
      .filter((m) => m.role === 'foreign' || m.role === 'foreign_temp')
      .map((m) => {
        const exp = (m.jobExperiences ?? []).find((e) => e.id === jobCodeId);
        const group = String(exp?.group ?? '').trim();
        const groupRole = String(exp?.groupRole ?? '').trim();
        const classes = lessonClassesOf(group, ctx.settings.groups, ctx.settings.classInfo);
        const cal = contextCalendar(ctx, group);
        const missing = new Set<string>();
        const books: TeacherRow['books'] = [];
        planSubjectsOf(groupRole).forEach((s) => {
          const r = planBooksFor(classes, ctx.eslBooks, s);
          r.missing.forEach((k) => missing.add(k));
          r.books.forEach((b) => {
            if (books.some((x) => x.book.bookKey === b.bookKey)) return;
            const plan = plans.find((p) => p.userId === m.userId && p.bookTitle === b.bookTitle);
            const lay = plan ? layoutPlan(plan, cal, plan.classCodes[0] ?? '', { campCode: plan.campCode }) : null;
            books.push({ book: b, plan, filled: lay?.filled ?? 0, total: lay?.total ?? cal.filter((d) => d.kind === 'regular').length, warn: (lay?.warnings.length ?? 0) > 0 });
          });
        });
        return { userId: m.userId, name: m.name ?? '(이름 없음)', group, groupRole, books, missing: [...missing] };
      })
      .sort((a, b) => a.group.localeCompare(b.group) || a.groupRole.localeCompare(b.groupRole) || a.name.localeCompare(b.name));
  }, [ctx, members, plans, jobCodeId]);

  const counted = teachers.flatMap((t) => t.books);
  const count = (s: LessonPlanDoc['status']) => counted.filter((b) => b.plan?.status === s).length;
  const notStarted = counted.filter((b) => !b.plan).length;
  const others = plans.filter((p) => !teachers.some((t) => t.books.some((b) => b.plan?.id === p.id)));

  /** 이 캠프 반들이 쓰는 L-Code */
  const campCodes = useMemo(() => {
    const set = new Set<string>();
    Object.values(ctx?.settings.classInfo ?? {}).forEach((i) => {
      if (i?.bookCode?.trim()) set.add(i.bookCode.trim());
      if (i?.spareBookCode?.trim()) set.add(i.spareBookCode.trim());
    });
    Object.keys(ctx?.catalog.bundles ?? {}).forEach((c) => set.add(c));
    return [...set].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  }, [ctx]);

  const approve = async (plan: LessonPlanDoc) => {
    try {
      await setLessonPlanStatus(db, plan.id, 'approved', { reviewedBy: (userData as { name?: string } | null)?.name ?? '' });
      setPlans((ps) => ps.map((p) => (p.id === plan.id ? { ...p, status: 'approved', editedAfterApproval: false } : p)));
      toast.success('승인했습니다');
    } catch (e) {
      logger.error('승인 실패:', e);
      toast.error('저장하지 못했습니다');
    }
  };

  const saveLinks = async (code: string) => {
    const v = links[code] ?? { canvaUrl: '', driveUrl: '' };
    for (const u of [v.canvaUrl, v.driveUrl]) {
      if (u.trim() && !isHttpUrl(u.trim())) { toast.error('링크 형식이 아닙니다'); return; }
    }
    if (/canva\.com\/design\/[^/]+\/[^/]+\/edit/.test(v.canvaUrl)) { toast.error('편집 링크입니다 — 공유 → 공개 보기 링크를 넣어 주세요'); return; }
    try {
      await updateBundleLinks(db, code, v);
      toast.success(`${code} 링크를 저장했습니다`);
      void load(jobCodeId);
    } catch (e) {
      logger.error('합본 링크 저장 실패:', e);
      toast.error('저장하지 못했습니다');
    }
  };

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-5xl mx-auto px-0 sm:px-4 py-4 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">원어민 레슨플랜</h1>
            <p className="text-sm text-gray-500 mt-1">선생님이 <b>캠프 → 수업</b> 탭에서 교재마다 작성합니다. 날짜는 캠프 일정표에서 붙습니다.</p>
          </div>
          <select value={jobCodeId} onChange={(e) => setJobCodeId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            {codes.map((c) => <option key={c.id} value={c.id}>{c.generation} {c.code} {c.name}</option>)}
          </select>
        </div>

        {loading && !ctx && <div className="mt-8 h-40 rounded-2xl bg-white ring-1 ring-gray-200 animate-pulse" />}

        {ctx && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-6">
              {[
                ['전체 교재', counted.length, 'text-gray-900'],
                ['시작 전', notStarted, 'text-gray-500'],
                ['작성·수정 중', count('draft') + count('changes'), 'text-gray-700'],
                ['제출됨 (검토 대기)', count('submitted') + counted.filter((b) => b.plan?.status === 'approved' && b.plan.editedAfterApproval).length, 'text-blue-700'],
                ['승인', counted.filter((b) => b.plan?.status === 'approved' && !b.plan.editedAfterApproval).length, 'text-emerald-700'],
              ].map(([label, n, tone]) => (
                <div key={label as string} className="rounded-xl bg-white ring-1 ring-gray-200 px-3 py-2.5">
                  <p className="text-[11px] text-gray-500">{label}</p>
                  <p className={`text-xl font-extrabold ${tone}`}>{n}</p>
                </div>
              ))}
            </div>

            {!ctx.settings.dayPlan?.sets?.length && (
              <p className="mt-3 text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">이 캠프는 일정표(Day 종류)가 아직 없어 레슨플랜에 날짜가 붙지 않습니다 — 캠프 설정 → 일정표.</p>
            )}
            {!Object.keys(ctx.settings.classInfo ?? {}).length && (
              <p className="mt-2 text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">반 교재(L-Code)가 아직 없어 선생님에게 교재가 보이지 않습니다 — 캠프 설정 → 반 정보.</p>
            )}

            {/* 선생님별 */}
            <div className="mt-6 rounded-2xl bg-white ring-1 ring-gray-200 divide-y divide-gray-100 overflow-hidden">
              {teachers.length === 0 && <p className="px-4 py-6 text-sm text-gray-500 text-center">이 캠프에 원어민 선생님이 없습니다.</p>}
              {teachers.map((t) => (
                <div key={t.userId} className="px-4 py-3 flex flex-col lg:flex-row lg:items-start gap-2 lg:gap-4">
                  <div className="lg:w-48 shrink-0">
                    <p className="font-semibold text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-500">{[t.group, t.groupRole].filter(Boolean).join(' · ') || '그룹·역할 미배정'}</p>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-wrap gap-2">
                    {t.books.length === 0 && (
                      <span className="text-xs text-gray-400 py-1">{planSubjectsOf(t.groupRole).length ? '맡은 반에 교재가 없습니다' : '레슨플랜 없음 (과목 담당 아님)'}</span>
                    )}
                    {t.books.map(({ book, plan, filled, total, warn }) => (
                      <div key={book.bookKey} className="rounded-xl ring-1 ring-gray-200 px-3 py-2 min-w-[180px] max-w-full">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 truncate">{book.bookTitle}</p>
                          {plan
                            ? <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_STYLE[plan.status]}`}>{PLAN_STATUS_LABEL_KO[plan.status]}</span>
                            : <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-400 ring-1 ring-gray-200">시작 전</span>}
                          {plan?.editedAfterApproval && <span className="shrink-0 text-[10px] font-bold text-violet-700">승인 후 수정</span>}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">{book.classKeys.map(classKeyLabel).join(' · ')}{plan ? ` · ${filled}/${total}` : ''}{warn ? ' · ⚠️' : ''}</p>
                        {plan && (
                          <div className="flex gap-1.5 mt-1.5">
                            <Link href={`/camp/lesson-plan?id=${encodeURIComponent(plan.id)}`} target="_blank" className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100">열기</Link>
                            {(plan.status === 'submitted' || plan.editedAfterApproval) && (
                              <button type="button" onClick={() => approve(plan)} className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100">승인</button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {t.missing.length > 0 && <span className="text-[11px] text-amber-700 self-center">교재 미지정: {t.missing.map(classKeyLabel).join(', ')}</span>}
                  </div>
                </div>
              ))}
            </div>

            {others.length > 0 && (
              <div className="mt-4 rounded-2xl bg-white ring-1 ring-gray-200 p-4">
                <p className="text-sm font-bold text-gray-900">지금 배정과 맞지 않는 레슨플랜</p>
                <p className="text-xs text-gray-500">반·교재·역할이 바뀌기 전에 쓴 것</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {others.map((p) => (
                    <Link key={p.id} href={`/camp/lesson-plan?id=${encodeURIComponent(p.id)}`} target="_blank" className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">
                      {p.userName ?? p.userId} · {p.bookTitle} · {PLAN_STATUS_LABEL_KO[p.status]}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* 합본 링크 · 단원 목록 */}
            <div className="mt-8">
              <h2 className="text-lg font-bold text-gray-900">캠프 합본(단권화) 링크</h2>
              <p className="text-sm text-gray-500 mt-1">
                Canva <b>공유 → 공개 보기 링크</b>를 넣으면 레슨플랜의 단원마다 그 쪽으로 바로 열립니다(링크 뒤 #쪽번호). Drive PDF는 보조 링크입니다. 모든 사용자가 볼 수 있습니다.
              </p>
              <div className="mt-3 space-y-2">
                {campCodes.map((code) => {
                  const bundle = ctx.catalog.bundles[code];
                  const titles = (['speaking', 'reading', 'writing'] as const).map((s) => ctx.eslBooks.codes?.[code]?.[s]).filter((x): x is string => !!x);
                  const v = links[code] ?? { canvaUrl: '', driveUrl: '' };
                  return (
                    <div key={code} className="rounded-xl bg-white ring-1 ring-gray-200 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-gray-900 w-10">{code}</span>
                        {titles.map((t) => {
                          const n = bookUnitsOf(ctx.catalog, t).length;
                          const pages = bundle?.books?.[t]?.units?.length ?? 0;
                          const canva = ctx.catalog.books[t]?.canvaUrl;
                          const cls = `text-[11px] px-1.5 py-0.5 rounded ${n ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`;
                          const tip = `${n ? `단원 ${n}개${pages ? ` · 합본 쪽 번호 ${pages}개` : ''}` : '단원 목록 없음 — 선생님이 단원 번호를 직접 입력'}${canva ? ' · 교재 Canva 열기' : ''}`;
                          const label = `${t} ${n ? `✓${pages ? ' p.' : ''}` : '·'}${canva ? ' ↗' : ''}`;
                          return canva
                            ? <a key={t} href={canva} target="_blank" rel="noopener noreferrer" className={`${cls} hover:underline`} title={tip}>{label}</a>
                            : <span key={t} className={cls} title={tip}>{label}</span>;
                        })}
                      </div>
                      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 mt-2">
                        <input value={v.canvaUrl} onChange={(e) => setLinks((l) => ({ ...l, [code]: { ...v, canvaUrl: e.target.value } }))}
                          placeholder="Canva 공개 보기 링크" className="min-w-0 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                        <input value={v.driveUrl} onChange={(e) => setLinks((l) => ({ ...l, [code]: { ...v, driveUrl: e.target.value } }))}
                          placeholder="Drive PDF 링크" className="min-w-0 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                        <button type="button" onClick={() => saveLinks(code)} className="px-3 py-1.5 text-sm rounded-lg bg-gray-900 text-white font-medium">저장</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-2">✓ 단원 목록 있음 · p. 합본 쪽 번호 있음 · ↗ 교재 전체 Canva. 교재 목록 · 링크는 scripts/seed-esl-book-units.js 로 넣습니다.</p>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
