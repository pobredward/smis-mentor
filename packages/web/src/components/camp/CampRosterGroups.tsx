'use client';

/**
 * 캠프 선생님 배정 (자동) — 관리자가 '선생님 명단 관리'에 붙여넣은 값으로 그룹별 표·입퇴소 항공 명단을 만든다.
 * 교육 탭 맨 위에 보인다. 표가 아직 없으면 아무것도 그리지 않는다.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
  getCampRoster,
  resolveActiveJobCodeId,
  rosterColumnsOf,
  rosterFillInherited,
  type CampRosterDoc,
  type CampRosterRow,
} from '@smis-mentor/shared';

const MENTOR_COLS: Array<[string, string]> = [['classCode', '반'], ['name', '이름'], ['englishName', '영어 이름'], ['grade', '학년'], ['classroom', '강의실'], ['className', '반이름'], ['textbook', '교재'], ['room', '방']];
const FOREIGN_COLS: Array<[string, string]> = [['subject', '과목'], ['englishName', '이름'], ['room', '방']];
const FLIGHT_COLS: Array<[string, string]> = [['name', '이름'], ['group', '그룹'], ['arrAirport', '입소공항'], ['arrBooking', '예약번호'], ['arrSeat', '좌석'], ['depAirport', '퇴소공항'], ['depBooking', '예약번호'], ['depSeat', '좌석']];

export default function CampRosterGroups() {
  const { userData } = useAuth();
  const jobCodeId = resolveActiveJobCodeId(userData);
  const [doc, setDoc] = useState<CampRosterDoc | null>(null);
  const [open, setOpen] = useState(true);
  const [view, setView] = useState<'groups' | 'flights'>('groups');

  useEffect(() => {
    let alive = true;
    setDoc(null);
    if (jobCodeId) getCampRoster(db, jobCodeId).then((d) => alive && setDoc(d)).catch(() => alive && setDoc(null));
    return () => { alive = false; };
  }, [jobCodeId]);

  const data = useMemo(() => {
    if (!doc) return null;
    const mentors = rosterFillInherited(doc.mentors ?? [], rosterColumnsOf('mentor', doc.tier));
    const foreign = rosterFillInherited(doc.foreign ?? [], rosterColumnsOf('foreign', doc.tier));
    const groups: string[] = [];
    [...mentors, ...foreign].forEach((r) => { const g = r.cells.group || '기타'; if (!groups.includes(g)) groups.push(g); });
    const by = (rows: CampRosterRow[], g: string) => rows.filter((r) => (r.cells.group || '기타') === g);
    const flights = mentors.filter((r) => r.cells.arrAirport || r.cells.depAirport || r.cells.arrBooking || r.cells.depBooking);
    return { mentors, foreign, groups, by, flights };
  }, [doc]);

  if (!doc || !data || (!data.mentors.length && !data.foreign.length)) return null;
  const me = userData?.userId;
  const cell = (r: CampRosterRow, k: string) => r.cells[k] || '';
  const hasCol = (rows: CampRosterRow[], k: string) => rows.some((r) => r.cells[k]);

  return (
    <div className="mb-6 border rounded-xl bg-white">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <button onClick={() => setOpen((o) => !o)} className="font-semibold text-gray-900 flex items-center gap-1">
          <span className="text-gray-400">{open ? '▾' : '▸'}</span> 📍 선생님 배정 <span className="text-xs font-normal text-gray-400">({doc.campCode})</span>
        </button>
        <div className="flex-1" />
        {open && (
          <div className="flex text-xs rounded-lg bg-gray-100 p-0.5">
            <button onClick={() => setView('groups')} className={`px-2 py-1 rounded-md ${view === 'groups' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>그룹별</button>
            {data.flights.length > 0 && <button onClick={() => setView('flights')} className={`px-2 py-1 rounded-md ${view === 'flights' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>입·퇴소 항공</button>}
          </div>
        )}
        {userData?.role === 'admin' && <Link href="/admin/camp-roster" className="text-xs text-blue-600 hover:underline">표 수정</Link>}
      </div>
      {open && view === 'groups' && (
        <div className="p-4 grid gap-5 md:grid-cols-2">
          {data.groups.map((g) => {
            const ms = data.by(data.mentors, g);
            const fs = data.by(data.foreign, g);
            const mcols = MENTOR_COLS.filter(([k]) => k === 'name' || hasCol(ms, k));
            const fcols = FOREIGN_COLS.filter(([k]) => k === 'englishName' || hasCol(fs, k));
            return (
              <div key={g}>
                <p className="font-semibold text-sm mb-1.5">[{g}]</p>
                {ms.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border">
                      <thead className="bg-gray-50 text-gray-600"><tr>
                        <th className="px-2 py-1.5 text-left font-medium border-b">역할</th>
                        {mcols.map(([k, h]) => <th key={k} className="px-2 py-1.5 text-left font-medium border-b whitespace-nowrap">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {ms.map((r, i) => (
                          <tr key={i} className={`border-t ${r.userId && r.userId === me ? 'bg-yellow-50 font-semibold' : ''}`}>
                            <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{(cell(r, 'role') || '').replace(/\s*멘토$/, '')}</td>
                            {mcols.map(([k]) => <td key={k} className="px-2 py-1.5 whitespace-nowrap">{cell(r, k)}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {fs.length > 0 && (
                  <table className="w-full text-xs border mt-2">
                    <thead className="bg-blue-50 text-blue-800"><tr>{fcols.map(([k, h]) => <th key={k} className="px-2 py-1.5 text-left font-medium border-b">{k === 'englishName' ? '원어민' : h}</th>)}</tr></thead>
                    <tbody>
                      {fs.map((r, i) => (
                        <tr key={i} className={`border-t ${r.userId && r.userId === me ? 'bg-yellow-50 font-semibold' : ''}`}>
                          {fcols.map(([k]) => <td key={k} className="px-2 py-1.5 whitespace-nowrap">{cell(r, k)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
      {open && view === 'flights' && (
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-xs border">
            <thead className="bg-gray-50 text-gray-600"><tr>{FLIGHT_COLS.map(([k, h], i) => <th key={i} className="px-2 py-1.5 text-left font-medium border-b whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {[...data.flights].sort((a, b) => (a.cells.arrAirport || '').localeCompare(b.cells.arrAirport || '', 'ko')).map((r, i) => (
                <tr key={i} className={`border-t ${r.userId && r.userId === me ? 'bg-yellow-50 font-semibold' : ''}`}>
                  {FLIGHT_COLS.map(([k], j) => <td key={j} className="px-2 py-1.5 whitespace-nowrap">{cell(r, k)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-400 mt-1">입소공항 순으로 정렬했습니다.</p>
        </div>
      )}
    </div>
  );
}
