'use client';

import type { PatientRecord } from '@smis-mentor/shared';
import { myActiveEscortVisit } from '@smis-mentor/shared';
import EscortSsn from './EscortSsn';

/**
 * 환자 탭 상단 — "내가 인솔할 학생"
 * 내원 인솔자로 지정되면 학생 카드와 병원 접수에 필요한 주민번호가 바로 보인다.
 */
export default function MyEscortPanel({
  records,
  myName,
  onOpen,
}: {
  records: PatientRecord[];
  myName?: string | null;
  onOpen: (recordId: string) => void;
}) {
  const mine = records
    .map((r) => ({ r, v: myActiveEscortVisit(r.hospitalVisits, myName) }))
    .filter((x): x is { r: PatientRecord; v: NonNullable<typeof x.v> } => !!x.v);
  if (mine.length === 0) return null;

  return (
    <div className="mx-4 mt-3 rounded-xl border-2 border-orange-300 bg-orange-50 p-3">
      <p className="text-xs font-bold text-orange-800 mb-2">🚑 내가 인솔할 학생 {mine.length}명 — 병원 접수용 정보</p>
      <div className="space-y-2">
        {mine.map(({ r, v }) => (
          <button key={r.id} type="button" onClick={() => onOpen(r.id)}
            className="w-full text-left rounded-lg bg-white border border-orange-200 p-3 hover:border-orange-400">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-gray-900">
                {r.studentName}
                <span className="ml-1.5 text-xs font-normal text-gray-500">{[r.grade, r.className, r.roomNumber && `${r.roomNumber}호`].filter(Boolean).join(' · ')}</span>
              </p>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${v.hospitalStatus === '내원예정' ? 'bg-orange-500 text-white' : 'bg-green-500 text-white'}`}>{v.hospitalStatus}</span>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-600" onClick={(e) => e.stopPropagation()}>
              <span className="col-span-2">주민번호: <EscortSsn recordId={r.id} auto /></span>
              {v.hospitalName && <span className="col-span-2">병원: <b className="text-gray-800">{v.hospitalName}</b></span>}
              {v.departureTime && <span>출발: <b className="text-gray-800">{v.departureTime}</b></span>}
              {v.transportSlot && <span>방식: <b className="text-gray-800">{v.transportSlot}</b></span>}
              {r.symptom && <span className="col-span-2">증상: <b className="text-gray-800">{r.symptom}</b></span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
