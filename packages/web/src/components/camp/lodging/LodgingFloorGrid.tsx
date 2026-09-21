'use client';

import type { CSSProperties, ReactNode } from 'react';
import {
  annexCorridorRow,
  isLodgingRoomDimmed,
  lodgingRoomCaption,
  lodgingRoomColor,
  lodgingRoomTone,
  type LodgingBuilding,
  type LodgingRoomView,
} from '@smis-mentor/shared';

interface Props {
  building: LodgingBuilding;
  floor: number;
  rooms: Map<string, LodgingRoomView>;
  /** 전체 탭용 — 칸을 작게, 이름은 4명까지 */
  compact?: boolean;
  /** 이름 숨기기 (호수·인원만) */
  names?: boolean;
  selected?: string | null;
  /** 검색에 걸린 방 — 테두리 강조 */
  highlight?: Set<string>;
  onRoom: (num: string) => void;
}

/**
 * ㅜ자 격자 — 별관(세로 복도, 왼쪽)의 통로 줄에서 본관(가로 복도)이 동쪽으로 뻗는다.
 * 층별·전체 탭이 같은 격자를 크기만 달리해 쓴다.
 */
export default function LodgingFloorGrid({
  building,
  floor,
  rooms,
  compact = false,
  names = true,
  selected,
  highlight,
  onRoom,
}: Props) {
  const annex = building.layout.annex[floor] ?? [];
  const main = building.layout.main[floor] ?? { upper: [], lower: [] };
  const COLS = building.mainCols;
  const jrow = annexCorridorRow(building, floor);
  const rowOf = (i: number) => (i <= jrow ? i + 1 : i + 2);
  const corridorRow = jrow + 2;
  const annexRows = annex.length + 1;
  const offU = COLS - main.upper.length;
  const offL = COLS - main.lower.length;

  const template = compact
    ? `64px 12px 64px 22px repeat(${COLS}, 58px)`
    : `132px 30px 132px 36px repeat(${COLS}, minmax(84px, 1fr))`;

  const cells: ReactNode[] = [];
  const at = (row: number, col: number, span?: number): CSSProperties => ({
    gridRow: String(row),
    gridColumn: span ? `${col} / span ${span}` : String(col),
  });
  const cell = (num: string, style: CSSProperties) => {
    const r = rooms.get(num);
    if (!r) return null;
    return (
      <RoomCell
        key={num}
        room={r}
        compact={compact}
        names={names}
        selected={selected === num}
        highlighted={!!highlight?.has(num)}
        style={style}
        onClick={() => onRoom(num)}
      />
    );
  };

  annex.forEach(([L, R], i) => {
    const row = rowOf(i);
    if (L) cells.push(cell(L, at(row, 1)));
    if (R) cells.push(cell(R, at(row, 3)));
  });
  cells.push(
    <div
      key="hallv"
      className="flex items-start justify-center rounded-md bg-gray-200 pt-2 text-[10px] tracking-widest text-gray-500"
      style={{ ...at(1, 2), gridRow: `1 / span ${annexRows}`, writingMode: 'vertical-rl' }}
    >
      {compact ? '' : '별관 복도'}
    </div>
  );
  cells.push(
    <div
      key="cross"
      className="z-[1] flex items-center justify-center rounded-md bg-blue-100 text-[10px] font-semibold text-blue-700"
      style={at(corridorRow, 1, 3)}
    >
      {compact ? '' : '통로'}
    </div>
  );
  cells.push(
    <div
      key="link"
      className="flex items-center justify-center rounded-md bg-blue-100 text-[10px] font-semibold text-blue-700"
      style={at(corridorRow, 4)}
    >
      →
    </div>
  );
  cells.push(
    <div
      key="hallh"
      className="flex min-h-[26px] items-center justify-between rounded-md bg-gray-200 px-2 text-[10px] tracking-widest text-gray-500"
      style={at(corridorRow, 5, COLS)}
    >
      <span>{compact ? `${floor}F` : `${floor}층 본관 복도`}</span>
      <span>{compact ? '' : '동쪽'}</span>
    </div>
  );
  if (floor === 1) {
    if (offU > 0)
      cells.push(
        <div
          key="lobby"
          className="flex items-center justify-center rounded-md border border-dashed border-gray-300 p-2 text-center text-[10px] text-gray-400"
          style={at(corridorRow - 1, 5, offU)}
        >
          {compact ? '' : '로비·프런트 (미확인)'}
        </div>
      );
    if (offL > 0)
      cells.push(
        <div
          key="lobby2"
          className="rounded-md border border-dashed border-gray-300"
          style={at(corridorRow + 1, 5, offL)}
        />
      );
  }
  main.upper.forEach((n, i) => cells.push(cell(n, at(corridorRow - 1, 5 + offU + i))));
  main.lower.forEach((n, i) => cells.push(cell(n, at(corridorRow + 1, 5 + offL + i))));

  return (
    <div className="overflow-x-auto">
      <div
        className={`grid ${compact ? 'gap-0.5' : 'gap-1'}`}
        style={{ gridTemplateColumns: template, gridAutoRows: 'min-content', minWidth: 'max-content' }}
      >
        {cells}
      </div>
    </div>
  );
}

interface CellProps {
  room: LodgingRoomView;
  compact: boolean;
  names: boolean;
  selected: boolean;
  highlighted: boolean;
  style: CSSProperties;
  onClick: () => void;
}

export function RoomCell({ room, compact, names, selected, highlighted, style, onClick }: CellProps) {
  const c = lodgingRoomColor(room);
  const tone = lodgingRoomTone(room);
  const dimmed = isLodgingRoomDimmed(room);
  // 학생방은 (필터를 거친) 학생, 학생이 없는 방은 선생님
  const people = room.students.length
    ? room.students.map((s) => ({ key: s.studentId + s.rowNumber, name: s.name, sub: s.grade }))
    : room.allStudents?.length
      ? []
      : room.teachers.map((t) => ({ key: t, name: t, sub: '' }));
  const max = compact ? 4 : 8;
  const shown = names ? people.slice(0, max) : [];
  const more = names ? people.length - shown.length : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...style, background: c.bg, color: c.ink }}
      className={`min-w-0 rounded-md border text-left transition ${dimmed ? 'opacity-35' : ''} ${
        compact ? 'px-1 py-0.5' : 'px-1.5 py-1'
      } ${
        selected
          ? 'border-blue-600 ring-2 ring-blue-500'
          : highlighted
            ? 'border-amber-500 ring-2 ring-amber-400'
            : 'border-black/10 hover:shadow-md'
      }`}
      title={`${room.num} ${tone}`}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className={`font-mono font-bold ${compact ? 'text-[11px]' : 'text-sm'}`}>{room.num}</span>
        <span className={`truncate opacity-70 ${compact ? 'text-[8px]' : 'text-[10px]'}`}>
          {lodgingRoomCaption(room)}
        </span>
      </div>
      {room.label && !compact && (
        <div className="truncate text-[10px] font-semibold">{room.label}</div>
      )}
      {shown.length > 0 && (
        <ul className={`mt-0.5 ${compact ? 'text-[9px] leading-[1.25]' : 'text-[11px] leading-snug'}`}>
          {shown.map((p) => (
            <li key={p.key} className="flex items-center justify-between gap-1">
              <span className="truncate">{p.name}</span>
              {p.sub && <span className="shrink-0 opacity-60">{p.sub}</span>}
            </li>
          ))}
          {more > 0 && <li className="opacity-60">+{more}</li>}
        </ul>
      )}
    </button>
  );
}
