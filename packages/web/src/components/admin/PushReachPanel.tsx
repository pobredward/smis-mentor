'use client';

/**
 * 알림 수신 현황 (관리자) — 캠프 인원 중 푸시 알림을 못 받는 사람 (예전 '캠프별 유저 조회'에서 옮김)
 */
import { useEffect, useState } from 'react';
import { getUsersByJobCodeId } from '@/lib/firebaseService';
import type { User } from '@/types';
import { pushReachOf, PUSH_REACH_LABELS, type PushReachState } from '@smis-mentor/shared';

const PUSH_TONE: Record<'ok' | 'warn' | 'bad', string> = {
  ok: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  warn: 'bg-amber-100 text-amber-800 border-amber-200',
  bad: 'bg-red-100 text-red-700 border-red-200',
};
const fmtDay = (ms?: number) => (ms ? new Date(ms).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }) : '-');

export default function PushReachPanel({ jobCodeId, campCode }: { jobCodeId: string; campCode?: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [onlyProblem, setOnlyProblem] = useState(false);
  useEffect(() => {
    let alive = true;
    getUsersByJobCodeId(jobCodeId)
      .then((us) => alive && setUsers((us as User[]).filter((u) => u.status !== 'deleted' && u.status !== 'inactive')))
      .catch(() => alive && setUsers([]));
    return () => { alive = false; };
  }, [jobCodeId]);

  if (!users.length) return <p className="text-sm text-gray-400 py-10 text-center">이 캠프에 배정된 사람이 없습니다.</p>;
  const rows = users.map((u) => ({ u, r: pushReachOf(u) }));
  const count = (s: PushReachState) => rows.filter((x) => x.r.state === s).length;
  const problem = rows.filter((x) => x.r.state !== 'ok');
  const shown = onlyProblem ? problem : rows;

  return (
    <div className="bg-white p-4 rounded-xl border">
      <div className="flex items-center flex-wrap gap-2 mb-3">
        <h2 className="text-base font-bold text-gray-900">알림 수신 현황</h2>
        <span className="text-xs text-gray-400">{campCode} · {users.length}명</span>
        {problem.length > 0 && (
          <button onClick={() => setOnlyProblem((v) => !v)}
            className={`ml-auto px-3 py-1 text-xs rounded-full border font-semibold ${onlyProblem ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-red-200 text-red-700 hover:bg-red-50'}`}>
            {onlyProblem ? '전체 보기' : `못 받는 사람만 보기 (${problem.length})`}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(['ok', 'noToken', 'denied', 'muted'] as PushReachState[]).map((s) => (
          <div key={s} className={`rounded-lg border px-3 py-2 ${count(s) > 0 ? PUSH_TONE[PUSH_REACH_LABELS[s].tone] : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
            <p className="text-[11px] font-semibold">{PUSH_REACH_LABELS[s].label}</p>
            <p className="text-lg font-extrabold leading-tight">{count(s)}<span className="text-[11px] font-semibold ml-0.5">명</span></p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-gray-200 divide-y divide-gray-100">
        {shown.map(({ u, r }) => {
          const exp = u.jobExperiences?.find((e) => e.id === jobCodeId);
          return (
            <div key={u.userId} className="flex items-center gap-2 px-3 py-2 text-xs">
              <span className="font-bold text-gray-900 w-28 truncate">{u.name}</span>
              <span className="text-gray-500 w-32 truncate">{exp?.group ?? '-'} {exp?.groupRole ?? ''}</span>
              <span className={`px-1.5 py-0.5 rounded-full border font-bold ${PUSH_TONE[PUSH_REACH_LABELS[r.state].tone]}`}>{PUSH_REACH_LABELS[r.state].label}</span>
              <span className="ml-auto text-gray-400">
                {r.devices > 0
                  ? `기기 ${r.devices} · 최근 ${fmtDay(r.lastUsedMs)}`
                  : r.lastMobileMs
                    ? `앱 사용 ${fmtDay(r.lastMobileMs)} · 토큰 없음`
                    : `마지막 로그인 ${u.lastLoginAt ? fmtDay(u.lastLoginAt.toMillis()) : '기록 없음'}`}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <p className="font-semibold text-gray-700 mb-1">‘알림 못 받음’은 등록된 푸시 토큰이 없다는 뜻입니다. 이유는 셋 중 하나입니다.</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>앱으로 로그인한 적이 없음 (웹만 사용)</li>
          <li>앱에서 <b>알림 권한을 거부</b> — 이 경우 토큰이 아예 발급되지 않습니다</li>
          <li>앱을 지웠거나 기기를 바꿔 <b>토큰이 만료</b> — 업무 알림 발송 때 서버가 자동으로 정리합니다</li>
        </ul>
      </div>
    </div>
  );
}
