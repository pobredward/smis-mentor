'use client';

/** 여러 칸을 골랐을 때 아래에 떠 있는 바 — 칸 n개 · [과목 ▾] [비우기] [선택 해제] */
import type { TimetableSubject } from '@smis-mentor/shared';

export function SelectionBar({
  count,
  subjects,
  onFill,
  onDeselect,
}: {
  count: number;
  subjects: TimetableSubject[];
  /** '' = 비우기 */
  onFill: (subject: string) => void;
  onDeselect: () => void;
}) {
  return (
    <div className="fixed bottom-5 left-1/2 z-[65] flex -translate-x-1/2 items-center gap-2 rounded-full bg-gray-900 px-3 py-2 text-xs text-white shadow-xl">
      <span className="font-semibold tabular-nums">칸 {count}개</span>
      <span className="h-4 w-px bg-white/20" />
      <select
        value=""
        onChange={(e) => e.target.value && onFill(e.target.value)}
        className="rounded-md border border-white/20 bg-gray-800 px-2 py-1 text-xs text-white"
        aria-label="과목으로 채우기"
      >
        <option value="">과목으로 채우기 ▾</option>
        {subjects.map((s) => (
          <option key={s.key} value={s.key}>
            {s.key}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => onFill('')} className="rounded-md px-2 py-1 hover:bg-white/10">
        비우기
      </button>
      <button type="button" onClick={onDeselect} className="rounded-md px-2 py-1 text-white/70 hover:bg-white/10 hover:text-white">
        선택 해제
      </button>
    </div>
  );
}
