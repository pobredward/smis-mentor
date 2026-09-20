'use client';

import { hasItemContent, type TimetableGuide } from '@smis-mentor/shared';

interface GuideDetailProps {
  /** 어느 칸을 눌렀는지 — 제목 */
  label: string;
  guide: TimetableGuide | undefined;
  onBack: () => void;
}

/**
 * 칸을 눌렀을 때 뜨는 세부 화면.
 * 관리자가 쓴 것만 보여 준다 — 담당·강의실·교재는 시간표에 이미 있으므로 되풀이하지 않는다.
 */
export default function GuideDetail({ label, guide, onBack }: GuideDetailProps) {
  const sections = (guide?.sections ?? []).filter((s) => s.items.some(hasItemContent));

  return (
    <div className="mx-auto max-w-2xl">
      <button
        onClick={onBack}
        className="mb-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        ← 시간표로
      </button>

      <h2 className="text-xl font-bold text-gray-900">{label}</h2>
      {guide?.summary && <p className="mt-1 text-sm text-gray-600">{guide.summary}</p>}

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

      {!guide?.summary && !sections.length && (
        <p className="mt-6 text-sm text-gray-400">
          아직 설명이 없습니다. 관리자가 시간표 편집 &gt; 칸 설명에서 쓸 수 있습니다.
        </p>
      )}
    </div>
  );
}
