'use client';

import { useState } from 'react';
import {
  guideBodyFor,
  hasBodyContent,
  hasItemContent,
  L,
  type GuideAudience,
  type GuideBody,
  type TimetableGuide,
} from '@smis-mentor/shared';
import { GuideAudienceTabs } from './GuideAudienceTabs';

interface GuideDetailProps {
  /** 어느 칸을 눌렀는지 — 제목 */
  label: string;
  guide: TimetableGuide | undefined;
  /** 보는 사람 — 처음에 열 쪽 (원어민 → 원어민용, 그 밖 → 멘토·부매니저용) */
  audience?: GuideAudience;
  onBack: () => void;
}

/**
 * 칸을 눌렀을 때 뜨는 세부 화면.
 * 관리자가 쓴 것만 보여 준다 — 담당·강의실·교재는 시간표에 이미 있으므로 되풀이하지 않는다.
 * 누구나 오른쪽 위 Mentor / Foreign 으로 두 벌을 오가며 본다 — 원어민도 멘토 멘트를, 멘토도 원어민용을.
 */
export default function GuideDetail({ label, guide, audience = 'mentor', onBack }: GuideDetailProps) {
  const filled = {
    mentor: hasBodyContent(guideBodyFor(guide, 'mentor')),
    foreign: hasBodyContent(guide?.foreign),
  };
  // 처음엔 자기 쪽 — 비어 있고 다른 쪽에 내용이 있으면 그쪽
  const other: GuideAudience = audience === 'foreign' ? 'mentor' : 'foreign';
  const firstTab: GuideAudience = filled[audience] || !filled[other] ? audience : other;
  // 고른 쪽은 그 칸에서만 — 다른 칸을 열면 다시 처음 규칙대로
  const [pick, setPick] = useState<{ label: string; tab: GuideAudience } | null>(null);
  const tab = pick?.label === label ? pick.tab : firstTab;
  const body = guideBodyFor(guide, tab);

  return (
    <div className="mx-auto max-w-2xl">
      <button
        onClick={onBack}
        className="mb-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        ← {L('schedule.backToTimetable')}
      </button>

      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 text-xl font-bold text-gray-900">{label}</h2>
        <GuideAudienceTabs
          className="mt-0.5 shrink-0"
          value={tab}
          onChange={(t) => setPick({ label, tab: t })}
          filled={filled}
          labels={{ mentor: L('schedule.guideMentor'), foreign: L('schedule.guideForeign') }}
          emptyHint={false}
        />
      </div>
      <GuideBodyView body={body} />

      {!hasBodyContent(body) && (
        <p className="mt-6 text-sm text-gray-400">
          {!filled.mentor && !filled.foreign
            ? L('schedule.guideEmpty')
            : L(tab === 'foreign' ? 'schedule.guideEmptyForeign' : 'schedule.guideEmptyMentor')}
        </p>
      )}
    </div>
  );
}

/** 설명 한 벌 — 요약 + 섹션 */
function GuideBodyView({ body }: { body: GuideBody | undefined }) {
  const sections = (body?.sections ?? []).filter((s) => s.items.some(hasItemContent));

  return (
    <>
      {body?.summary && <p className="mt-1 text-sm text-gray-600">{body.summary}</p>}

      {sections.map((sec) => (
        <section key={sec.id} className="mt-5">
          {sec.title && <h3 className="text-sm font-semibold text-gray-900">{sec.title}</h3>}
          <div className="mt-1.5 space-y-2">
            {sec.items.filter(hasItemContent).map((item) => {
              if (item.type === 'text') {
                return (
                  <div key={item.id} className="flex gap-2 text-sm leading-relaxed text-gray-700">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                    <span>{item.text}</span>
                  </div>
                );
              }
              if (item.type === 'link') {
                return (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-md border border-gray-300 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50"
                  >
                    {item.text || item.url}
                  </a>
                );
              }
              if (item.type === 'image') {
                return (
                  <figure key={item.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={item.text ?? ''}
                      className="max-h-96 w-full rounded-lg border border-gray-200 object-contain"
                    />
                    {item.text && (
                      <figcaption className="mt-1 text-xs text-gray-500">{item.text}</figcaption>
                    )}
                  </figure>
                );
              }
              return (
                <figure key={item.id}>
                  <video
                    src={item.url}
                    controls
                    className="max-h-96 w-full rounded-lg border border-gray-200 bg-black"
                  />
                  {item.text && (
                    <figcaption className="mt-1 text-xs text-gray-500">{item.text}</figcaption>
                  )}
                </figure>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
