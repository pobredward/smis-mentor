'use client';

/**
 * 내 캠프 배정 — 관리자가 '캠프 선생님 표'에 넣은 내 줄 (그룹·반·강의실·영어 이름·방·입퇴소 항공)
 * 마이페이지에 보인다. 표에 내가 없으면 아무것도 그리지 않는다.
 */
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
  getCampRoster,
  resolveActiveJobCodeId,
  rosterColumnsOf,
  rosterFillInherited,
  type CampRosterDoc,
} from '@smis-mentor/shared';

const LINES: Array<[string, string]> = [
  ['role', '역할'], ['group', '그룹'], ['classCode', '반'], ['subject', '과목'], ['englishName', '영어 이름'], ['grade', '학년'],
  ['classroom', '강의실'], ['className', '반이름'], ['textbook', '교재'], ['room', '방'],
];

export default function MyCampRosterCard() {
  const { userData } = useAuth();
  const jobCodeId = resolveActiveJobCodeId(userData);
  const [doc, setDoc] = useState<CampRosterDoc | null>(null);
  useEffect(() => {
    let alive = true;
    if (jobCodeId) getCampRoster(db, jobCodeId).then((d) => alive && setDoc(d)).catch(() => undefined);
    return () => { alive = false; };
  }, [jobCodeId]);

  if (!doc || !userData?.userId) return null;
  const find = (kind: 'mentor' | 'foreign') =>
    rosterFillInherited((kind === 'mentor' ? doc.mentors : doc.foreign) ?? [], rosterColumnsOf(kind, doc.tier)).find((r) => r.userId === userData.userId);
  const row = find('mentor') ?? find('foreign');
  if (!row) return null;
  const c = row.cells;
  const flight = (a: string, b: string, s: string) => [c[a], c[b] && `예약 ${c[b]}`, c[s] && `좌석 ${c[s]}`].filter(Boolean).join(' · ');
  const arr = flight('arrAirport', 'arrBooking', 'arrSeat');
  const dep = flight('depAirport', 'depBooking', 'depSeat');
  const extra: Array<[string, string]> = [['입소', arr], ['퇴소', dep], ['비자', c.visa ?? ''], ['공항 도착', c.arrival ?? '']];

  return (
    <div className="bg-white rounded-xl border p-5 mb-6">
      <h2 className="font-semibold text-gray-900 mb-3">📍 {doc.campCode} 내 배정</h2>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
        {[...LINES.map(([k, l]) => [l, c[k] ?? ''] as [string, string]), ...extra].filter(([, v]) => v).map(([l, v]) => (
          <div key={l}><dt className="text-xs text-gray-400">{l}</dt><dd className="text-gray-900">{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}
