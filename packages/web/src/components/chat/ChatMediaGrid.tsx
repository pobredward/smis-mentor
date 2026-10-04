'use client';

/**
 * 사진·동영상 묶음 말풍선 (카톡 '묶어 보내기')
 * - 한 장: 원래 비율 (가로 최대 240 · 세로 최대 320)
 * - 여러 장: bundleRows(n) 줄 — 줄마다 같은 높이의 정사각 칸, 칸 사이 2px, 바깥 모서리 둥글게
 * - 동영상 칸: ▶ + 길이
 */
import type { ReactNode } from 'react';
import { FiPlay } from 'react-icons/fi';
import { bundleRows } from '@smis-mentor/shared';
import { formatDuration } from './chatUi';

export interface ChatGridCell {
  kind: 'image' | 'video';
  /** 칸에 보일 그림 (작은 그림 → 없으면 원본) */
  src: string | null;
  /** 동영상인데 작은 그림이 없을 때 첫 장면을 보여 줄 주소 */
  videoSrc?: string | null;
  w?: number;
  h?: number;
  durationMs?: number;
}

const GRID_W = 240;
const SINGLE_MAX_H = 320;
const SINGLE_MIN = 96;

function singleSize(w?: number, h?: number): { w: number; h: number } {
  if (!w || !h) return { w: 200, h: 200 };
  const s = Math.min(GRID_W / w, SINGLE_MAX_H / h);
  return { w: Math.max(SINGLE_MIN, Math.round(w * s)), h: Math.max(SINGLE_MIN, Math.round(h * s)) };
}

function Cell({ cell, width, height, onClick, rounded }: { cell: ChatGridCell; width: number; height: number; onClick?: () => void; rounded?: boolean }) {
  const body: ReactNode = cell.src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={cell.src} alt="" loading="lazy" draggable={false} className="w-full h-full object-cover" />
  ) : cell.kind === 'video' && cell.videoSrc ? (
    <video src={cell.videoSrc} preload="metadata" muted playsInline className="w-full h-full object-cover pointer-events-none" />
  ) : (
    <div className="w-full h-full bg-gray-300" />
  );
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{ width, height }}
      className={`relative block overflow-hidden bg-gray-200 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-default ${rounded ? 'rounded-2xl' : ''}`}
    >
      {body}
      {cell.kind === 'video' && (
        <>
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center">
              <FiPlay size={18} className="ml-0.5" />
            </span>
          </span>
          {!!cell.durationMs && (
            <span className="absolute right-1.5 bottom-1.5 rounded bg-black/55 px-1 text-[11px] font-medium text-white">
              {formatDuration(cell.durationMs)}
            </span>
          )}
        </>
      )}
    </button>
  );
}

export default function ChatMediaGrid({ cells, onOpen, overlay }: { cells: ChatGridCell[]; onOpen?: (index: number) => void; overlay?: ReactNode }) {
  if (!cells.length) return null;
  if (cells.length === 1) {
    const { w, h } = singleSize(cells[0].w, cells[0].h);
    return (
      <div className="relative rounded-2xl overflow-hidden" style={{ width: w, height: h }}>
        <Cell cell={cells[0]} width={w} height={h} onClick={onOpen ? () => onOpen(0) : undefined} rounded />
        {overlay}
      </div>
    );
  }
  const rows = bundleRows(cells.length);
  let index = 0;
  return (
    <div className="relative flex flex-col gap-[2px] rounded-2xl overflow-hidden" style={{ width: GRID_W }}>
      {rows.map((k, r) => {
        const size = (GRID_W - (k - 1) * 2) / k;
        return (
          <div key={r} className="flex gap-[2px]">
            {Array.from({ length: k }, () => {
              const i = index++;
              return <Cell key={i} cell={cells[i]} width={size} height={size} onClick={onOpen ? () => onOpen(i) : undefined} />;
            })}
          </div>
        );
      })}
      {overlay}
    </div>
  );
}
