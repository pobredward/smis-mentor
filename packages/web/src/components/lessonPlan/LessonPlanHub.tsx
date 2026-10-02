'use client';

/**
 * 수업 탭 맨 위 — 원어민 레슨플랜 (교재마다 하나)
 * 맡은 그룹의 반 · 반 교재(L-Code) · 과목으로 교재 목록을 만들고, 이미 쓴 레슨플랜의 상태 · 진행을 보여 준다.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { getUsersByJobCodeId } from '@/lib/firebaseService';
import {
  PLAN_STATUS_LABEL,
  classKeyLabel,
  contextCalendar,
  layoutPlan,
  lessonViewerOf,
  loadMyPlanBooks,
  logger,
  type MyPlanBooks,
  type PlanUser,
} from '@smis-mentor/shared';
import { STATUS_STYLE } from './status';

export default function LessonPlanHub({ jobCodeId }: { jobCodeId: string }) {
  const { userData } = useAuth();
  const [my, setMy] = useState<MyPlanBooks | null>(null);
  const [failed, setFailed] = useState(false);
  const uid = userData?.userId ?? '';
  const viewerKey = JSON.stringify(lessonViewerOf(userData as never, jobCodeId));

  useEffect(() => {
    if (!userData || !jobCodeId) return;
    let alive = true;
    const user: PlanUser = {
      userId: userData.userId,
      name: (userData as { name?: string }).name,
      role: userData.role,
      jobExperiences: (userData.jobExperiences ?? []) as unknown as PlanUser['jobExperiences'],
    };
    loadMyPlanBooks(db, { user, jobCodeId, members: () => getUsersByJobCodeId(jobCodeId) as never })
      .then((r) => { if (alive) { setMy(r); setFailed(false); } })
      .catch((e) => { logger.error('레슨플랜 목록 불러오기 실패:', e); if (alive) setFailed(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, jobCodeId, viewerKey]);

  const rows = useMemo(() => {
    if (!my) return [];
    const cal = contextCalendar(my.ctx, my.viewer.group);
    return my.books.map((b) => {
      const plan = my.plans.find((p) => p.bookTitle === b.bookTitle);
      const lay = plan ? layoutPlan(plan, cal, plan.classCodes[0] ?? b.classKeys[0] ?? '', { campCode: plan.campCode }) : null;
      return { book: b, plan, filled: lay?.filled ?? 0, total: lay?.total ?? cal.filter((d) => d.kind === 'regular').length, warn: (lay?.warnings.length ?? 0) > 0 };
    });
  }, [my]);

  if (failed) {
    return <p className="text-xs text-red-600 px-1">Could not load your lesson plans. Pull to refresh or try again later.</p>;
  }
  if (!my) {
    return <div className="h-24 rounded-2xl bg-white ring-1 ring-gray-200 animate-pulse" />;
  }
  if (!my.subjects.length) return null;

  const orphans = my.plans.filter((p) => !my.books.some((b) => b.bookTitle === p.bookTitle));

  return (
    <div className="rounded-2xl bg-white ring-1 ring-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-gray-900 flex-1">Lesson plans</h3>
          <Link href={`/camp/lesson-plan?sample=${encodeURIComponent((my.subjects[0] ?? 'Reading').toLowerCase())}`}
            className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-sky-50 text-sky-800 ring-1 ring-sky-200 hover:bg-sky-100">
            See a sample
          </Link>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">One plan per book — dates come from the camp schedule. Classes with the same book share one plan.</p>
      </div>
      {rows.length === 0 && (
        <p className="px-4 py-4 text-sm text-gray-500">
          {my.classes.length ? 'Your classes have no books yet.' : 'Your group has no classes yet.'} Ask your manager — plans appear here when books are set.
        </p>
      )}
      <ul className="divide-y divide-gray-100">
        {rows.map(({ book, plan, filled, total, warn }) => (
          <li key={book.bookKey}>
            <Link href={`/camp/lesson-plan?book=${encodeURIComponent(book.bookKey)}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 truncate">
                  {book.bookTitle} <span className="text-xs font-medium text-gray-400">{my.subjects.length > 1 ? book.subject : ''}</span>
                </p>
                <p className="text-xs text-gray-500 truncate">{book.classKeys.map(classKeyLabel).join(' · ')}</p>
              </div>
              <div className="text-right shrink-0">
                {plan ? (
                  <>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[plan.status]}`}>{PLAN_STATUS_LABEL[plan.status]}</span>
                    <p className={`text-[11px] mt-1 ${warn ? 'text-amber-700 font-semibold' : 'text-gray-400'}`}>{warn ? '⚠️ ' : ''}{filled}/{total} lessons</p>
                  </>
                ) : (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">Start</span>
                )}
              </div>
              <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </Link>
          </li>
        ))}
      </ul>
      {my.missing.length > 0 && rows.length > 0 && (
        <p className="px-4 py-2.5 text-xs text-amber-800 bg-amber-50 border-t border-amber-100">
          No book set for {my.missing.map(classKeyLabel).join(', ')} yet — ask your manager.
        </p>
      )}
      {orphans.length > 0 && (
        <div className="px-4 py-2.5 border-t border-gray-100">
          <p className="text-[11px] font-semibold text-gray-400 mb-1">Earlier plans (book no longer assigned)</p>
          <div className="flex flex-wrap gap-1.5">
            {orphans.map((p) => (
              <Link key={p.id} href={`/camp/lesson-plan?id=${encodeURIComponent(p.id)}`} className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200">{p.bookTitle}</Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
