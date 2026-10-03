'use client';

/**
 * 칸 설명의 두 벌 — 멘토·부매니저용 / 원어민용 — 을 오가는 탭과 칩 표시.
 * 두 쪽이 동등하다는 게 보이도록 색을 따로 주지 않고 같은 모양으로 둔다
 * (보기 화면 — 누구나 Mentor / Foreign, 편집기 — 관리자 공용).
 */
import type { GuideAudience } from '@smis-mentor/shared';

export const GUIDE_AUDIENCES: GuideAudience[] = ['mentor', 'foreign'];
export const GUIDE_AUDIENCE_LABEL: Record<GuideAudience, string> = { mentor: '멘토·부매니저용', foreign: '원어민용' };
/** 칩에 붙는 짧은 표시 — 멘토·부매니저용은 한국어, 원어민용은 영어로 쓴다 */
const GUIDE_AUDIENCE_BADGE: Record<GuideAudience, string> = { mentor: 'KO', foreign: 'EN' };

export function GuideAudienceTabs({
  value,
  onChange,
  filled,
  labels = GUIDE_AUDIENCE_LABEL,
  emptyHint = true,
  className = '',
}: {
  value: GuideAudience;
  onChange: (a: GuideAudience) => void;
  /** 내용이 있는 쪽 — 없는 쪽은 흐리게 (emptyHint 면 '없음' 도 붙인다) */
  filled: Record<GuideAudience, boolean>;
  labels?: Record<GuideAudience, string>;
  emptyHint?: boolean;
  className?: string;
}) {
  return (
    <div role="tablist" className={`inline-flex rounded-lg bg-gray-100 p-0.5 ${className}`}>
      {GUIDE_AUDIENCES.map((a) => {
        const on = value === a;
        return (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(a)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              on
                ? 'bg-white text-gray-900 shadow-sm'
                : filled[a]
                  ? 'text-gray-500 hover:text-gray-800'
                  : 'text-gray-300 hover:text-gray-500'
            }`}
          >
            {labels[a]}
            {emptyHint && !filled[a] && <span className="text-[10px] font-normal text-gray-400">없음</span>}
          </button>
        );
      })}
    </div>
  );
}

/** 칸 칩에 붙는 표시 — 그 쪽 설명이 있으면 붙인다 (KO = 멘토·부매니저용, EN = 원어민용) */
export function GuideBadge({ audience, on = false, className = '' }: { audience: GuideAudience; on?: boolean; className?: string }) {
  return (
    <span
      className={`rounded px-1 text-[9px] font-bold leading-4 ${on ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'} ${className}`}
    >
      {GUIDE_AUDIENCE_BADGE[audience]}
    </span>
  );
}
