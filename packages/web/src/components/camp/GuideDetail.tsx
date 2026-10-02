'use client';

import {
  guideBodyFor,
  hasBodyContent,
  hasItemContent,
  L,
  type GuideAudience,
  type GuideBody,
  type TimetableGuide,
} from '@smis-mentor/shared';

interface GuideDetailProps {
  /** 어느 칸을 눌렀는지 — 제목 */
  label: string;
  guide: TimetableGuide | undefined;
  /** 보는 사람 — 멘토·부매니저는 멘토용, 원어민은 원어민용(foreign)만 본다 */
  audience?: GuideAudience;
  /** 관리자면 멘토용 아래에 원어민용도 따로 보여 준다 */
  isAdmin?: boolean;
  onBack: () => void;
}

/**
 * 칸을 눌렀을 때 뜨는 세부 화면.
 * 관리자가 쓴 것만 보여 준다 — 담당·강의실·교재는 시간표에 이미 있으므로 되풀이하지 않는다.
 */
export default function GuideDetail({ label, guide, audience = 'mentor', isAdmin = false, onBack }: GuideDetailProps) {
  const body = guideBodyFor(guide, audience);
  const hasMain = hasBodyContent(body);
  // 관리자에게만 — 원어민에게는 이렇게 보인다
  const foreign = isAdmin && audience === 'mentor' && hasBodyContent(guide?.foreign) ? guide?.foreign : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <button
        onClick={onBack}
        className="mb-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        ← {L('schedule.backToTimetable')}
      </button>

      <h2 className="text-xl font-bold text-gray-900">{label}</h2>
      <GuideBodyView body={body} />

      {!hasMain &&
        (foreign ? (
          <p className="mt-3 text-xs text-gray-400">멘토·부매니저에게 보이는 설명은 없습니다.</p>
        ) : (
          <p className="mt-6 text-sm text-gray-400">{L('schedule.guideEmpty')}</p>
        ))}

      {foreign && (
        <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
            <span className="rounded bg-emerald-100 px-1 text-[10px] font-bold leading-4 text-emerald-700">EN</span>
            원어민에게 보이는 설명
          </div>
          <GuideBodyView body={foreign} />
        </div>
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
