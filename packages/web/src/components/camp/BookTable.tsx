'use client';

import {
  booksFor,
  classNameLabel,
  isEmptyBookSet,
  subjectTint,
  type CampClassInfo,
  type EslBookList,
  type TimetableClassColumn,
  type TimetableSubject,
} from '@smis-mentor/shared';
import { L } from '@smis-mentor/shared';

interface BookTableProps {
  /** 이 표의 반 목록 (순서 그대로) */
  classes: TimetableClassColumn[];
  /** 반코드 → 반이름·강의실·교재코드 */
  classInfo: Record<string, CampClassInfo>;
  /** L-Code → 교재 3권 */
  books: EslBookList | undefined;
  /** 시간표의 과목 목록 — 줄 배경을 그 과목 색으로 맞추는 데 쓴다 */
  subjects?: TimetableSubject[];
  isForeign?: boolean;
}

const ROWS = [
  { key: 'speaking' as const, label: 'Speaking' },
  { key: 'reading' as const, label: 'Reading' },
  { key: 'writing' as const, label: 'Writing' },
];

/**
 * 반별 교재표.
 * 반에는 코드(Bc)만 붙어 있고 교재 세 권은 교재 리스트에서 조회한다 —
 * 리스트를 고치면 그 코드를 쓰는 모든 반이 한 번에 따라 바뀐다.
 */
export default function BookTable({
  classes,
  classInfo,
  books,
  subjects,
  isForeign = false,
}: BookTableProps) {
  // 시간표 칸과 같은 색을 연하게 깔아 어느 과목 줄인지 바로 보이게
  const tint = (key: string) => subjectTint(subjects, key);
  const codeOf = (c: TimetableClassColumn) => classInfo[c.classCode]?.bookCode?.trim() ?? '';
  const spareOf = (c: TimetableClassColumn) => classInfo[c.classCode]?.spareBookCode?.trim() ?? '';

  // 코드가 하나도 없으면 표 자체를 띄우지 않는다
  if (!classes.some((c) => codeOf(c) || spareOf(c))) return null;

  const hasSpare = classes.some((c) => spareOf(c));

  const cell = (code: string, field: 'speaking' | 'reading' | 'writing') => {
    if (!code) return <span className="text-gray-400">미정</span>;
    const set = booksFor(books, code);
    if (!set) return <span className="text-amber-600">?</span>;
    return set[field] || <span className="text-gray-300">—</span>;
  };

  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-sm font-semibold text-gray-900">{L('schedule.books')}</h3>
        <span className="text-[11px] text-gray-400">
          {L('schedule.setByLevelCode')}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full table-fixed border-collapse bg-white text-[11px] leading-tight">
          <colgroup>
            <col className="w-[64px]" />
            {classes.map((c) => (
              <col key={c.classCode} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="border-b border-r border-gray-200 bg-gray-50 px-1 py-1 text-[10px] font-medium text-gray-500">
                {L('schedule.code')}
              </th>
              {classes.map((c) => {
                const info = classInfo[c.classCode];
                return (
                  <th
                    key={c.classCode}
                    className="border-x border-b border-gray-200 border-b-gray-300 bg-gray-50 px-1 py-1 text-center"
                  >
                    <div className="truncate text-xs font-semibold text-gray-900">{c.classCode}</div>
                    {info?.className && (
                      <div className="truncate text-[11px] text-gray-700">
                        {classNameLabel(info.className)}
                      </div>
                    )}
                    <div className="mt-0.5 truncate text-[11px] font-medium text-blue-700">
                      {codeOf(c) || <span className="font-normal text-gray-400">미정</span>}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, ri) => (
              <tr key={row.key}>
                <td
                  className={`border-r border-gray-200 px-1 py-0.5 text-center text-[10px] text-gray-600 ${
                    ri === ROWS.length - 1 ? 'border-b border-b-gray-300' : 'border-b border-b-gray-100'
                  }`}
                  style={{ backgroundColor: tint(row.label) }}
                >
                  {row.label}
                </td>
                {classes.map((c) => (
                  <td
                    key={c.classCode}
                    className={`border-x border-gray-200 px-1 py-0.5 text-center text-gray-900 ${
                      ri === ROWS.length - 1 ? 'border-b border-b-gray-300' : 'border-b border-b-gray-100'
                    }`}
                    style={{ backgroundColor: tint(row.label) }}
                  >
                    {cell(codeOf(c), row.key)}
                  </td>
                ))}
              </tr>
            ))}

            {/* 보조 교재 — 있는 반만 */}
            {hasSpare && (
              <>
                <tr>
                  <td className="border-b border-r border-gray-200 bg-gray-50 px-1 py-0.5 text-center text-[10px] text-gray-500">
                    Spare
                  </td>
                  {classes.map((c) => (
                    <td
                      key={c.classCode}
                      className="border-x border-b border-gray-200 px-1 py-0.5 text-center text-[11px] font-medium text-blue-700"
                    >
                      {spareOf(c) || <span className="font-normal text-gray-400">미정</span>}
                    </td>
                  ))}
                </tr>
                {ROWS.map((row, ri) => (
                  <tr key={`spare-${row.key}`}>
                    <td
                      className={`border-r border-gray-200 px-1 py-0.5 text-center text-[10px] text-gray-400 ${
                        ri === ROWS.length - 1 ? 'border-b border-b-gray-300' : 'border-b border-b-gray-100'
                      }`}
                      style={{ backgroundColor: subjectTint(subjects, row.label, 0.75) }}
                    >
                      {row.label}
                    </td>
                    {classes.map((c) => (
                      <td
                        key={c.classCode}
                        className={`border-x border-gray-200 px-1 py-0.5 text-center text-gray-600 ${
                          ri === ROWS.length - 1
                            ? 'border-b border-b-gray-300'
                            : 'border-b border-b-gray-100'
                        }`}
                        style={{ backgroundColor: subjectTint(subjects, row.label, 0.75) }}
                      >
                        {cell(spareOf(c), row.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {classes.some((c) => {
        const code = codeOf(c) || spareOf(c);
        return code && !booksFor(books, code);
      }) && (
        <p className="mt-2 text-[11px] text-amber-600">
          교재 리스트에 없는 코드가 있습니다 (? 표시). 관리자에게 교재 리스트 확인을 요청하세요.
        </p>
      )}
      {classes.some((c) => isEmptyBookSet(booksFor(books, codeOf(c)))) && (
        <p className="mt-1 text-[11px] text-gray-400">
          교재가 비어 있는 코드는 해당 과목 교재가 없는 레벨입니다.
        </p>
      )}
    </section>
  );
}
