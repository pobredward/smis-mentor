'use client';

/**
 * 칸 설명(세부페이지) 편집기 — 시간표 편집기와 일정표(익사이팅) 편집기가 같이 쓴다.
 * 저장은 부모가 한다 (campSettings.timetableGuides 를 통째로).
 *
 * 한 칸 안에서 위는 멘토·부매니저에게 보이는 설명, 아래는 원어민에게 보이는 설명(foreign).
 * 원어민용은 몇 칸에만 붙이는 게 보통이라 '+ 원어민에게도 보여주기' 를 눌러야 생긴다.
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  copyGuideBody,
  DEFAULT_FOREIGN_GUIDE_SECTIONS,
  DEFAULT_GUIDE_SECTIONS,
  guideKeyOf,
  guideUploadError,
  hasGuideContent,
  timetableDraft as D,
  uploadGuideMedia,
  type GuideAudience,
  type GuideBody,
  type GuideItem,
  type GuideItemType,
  type GuideSection,
  type TimetableGuide,
} from '@smis-mentor/shared';
import { storage } from '@/lib/firebase';

export function GuideEditorPanel({
  campCode,
  labels,
  guides,
  setGuides,
}: {
  campCode: string;
  /** 설명을 붙일 칸 이름들 */
  labels: string[];
  guides: Record<string, TimetableGuide>;
  setGuides: (fn: (prev: Record<string, TimetableGuide>) => Record<string, TimetableGuide>) => void;
}) {
  const [guideLabel, setGuideLabel] = useState<string | null>(null);
  const guideTargets = labels;
  // ── 칸 설명 ───────────────────────────────────────────────────────
  const guideOf = (label: string): TimetableGuide => guides[guideKeyOf(label)] ?? {};
  const patchGuide = (label: string, fn: (g: TimetableGuide) => TimetableGuide) =>
    setGuides((prev) => {
      const key = guideKeyOf(label);
      return { ...prev, [key]: fn(prev[key] ?? {}) };
    });
  /**
   * 설명 한 벌 — 멘토·부매니저용은 칸의 바깥 summary·sections, 원어민용은 foreign.
   * 아래 편집 함수들은 audience 만 바꿔서 위·아래 두 칸이 같이 쓴다.
   */
  const bodyOf = (label: string, aud: GuideAudience): GuideBody =>
    aud === 'foreign' ? guideOf(label).foreign ?? {} : guideOf(label);
  const patchBody = (label: string, aud: GuideAudience, fn: (b: GuideBody) => GuideBody) =>
    patchGuide(label, (g) => (aud === 'foreign' ? { ...g, foreign: fn(g.foreign ?? {}) } : { ...g, ...fn(g) }));

  const newId = () => D.newBlockId().slice(-6);
  const addGuideSection = (label: string, aud: GuideAudience) =>
    patchBody(label, aud, (b) => ({
      ...b,
      sections: [...(b.sections ?? []), { id: newId(), title: '', items: [] }],
    }));
  /** 아직 아무것도 없는 칸은 기본 섹션을 깔아 준다 — 빈 화면보다 낫다 */
  const startGuide = (label: string) => {
    setGuideLabel(label);
    if (!guides[guideKeyOf(label)]?.sections?.length) {
      patchGuide(label, (g) => ({
        ...g,
        sections: DEFAULT_GUIDE_SECTIONS.map((title) => ({ id: newId(), title, items: [] })),
      }));
    }
  };
  /** 원어민에게도 보여 주기 — 영어 기본 섹션을 깔아 준다 */
  const startForeign = (label: string) =>
    patchGuide(label, (g) => ({
      ...g,
      foreign: { sections: DEFAULT_FOREIGN_GUIDE_SECTIONS.map((title) => ({ id: newId(), title, items: [] })) },
    }));
  /**
   * 위(멘토·부매니저용) 내용을 원어민용으로 복사.
   * 올린 사진·동영상은 주소만 같이 쓰고 storagePath 는 넘기지 않는다 — 한쪽을 지워도 다른 쪽 파일은 남게.
   */
  const copyMentorToForeign = (label: string) => {
    if (
      hasGuideContent(guideOf(label), 'foreign') &&
      !window.confirm('원어민 설명을 위 내용으로 바꿀까요? 지금 쓴 원어민 설명은 사라집니다.')
    )
      return;
    patchGuide(label, (g) => ({ ...g, foreign: copyGuideBody(g, newId) }));
  };
  const removeForeign = (label: string) => {
    if (!window.confirm(`"${label}" 의 원어민 설명을 지울까요? 저장을 눌러야 반영됩니다.`)) return;
    patchGuide(label, (g) => ({ ...g, foreign: undefined }));
  };

  const patchSection = (label: string, aud: GuideAudience, si: number, fn: (s: GuideSection) => GuideSection) =>
    patchBody(label, aud, (b) => ({
      ...b,
      sections: (b.sections ?? []).map((s, i) => (i === si ? fn(s) : s)),
    }));

  const addItem = (label: string, aud: GuideAudience, si: number, type: GuideItemType) =>
    patchSection(label, aud, si, (s) => ({ ...s, items: [...s.items, { id: newId(), type }] }));
  const patchItem = (label: string, aud: GuideAudience, si: number, ii: number, patch: Partial<GuideItem>) =>
    patchSection(label, aud, si, (s) => ({
      ...s,
      items: s.items.map((x, i) => (i === ii ? { ...x, ...patch } : x)),
    }));
  const removeItem = (label: string, aud: GuideAudience, si: number, ii: number) =>
    patchSection(label, aud, si, (s) => ({ ...s, items: s.items.filter((_, i) => i !== ii) }));

  /** 사진·동영상은 Storage 에 올리고 주소만 설명에 남긴다 (원어민용은 칸 폴더 아래 foreign/) */
  const [uploading, setUploading] = useState<string | null>(null);
  const uploadMedia = async (label: string, aud: GuideAudience, si: number, ii: number, file: File) => {
    const key = `${aud}:${si}:${ii}`;
    setUploading(key);
    try {
      const { url, storagePath } = await uploadGuideMedia(
        storage,
        campCode,
        aud === 'foreign' ? `${guideKeyOf(label)}/foreign` : guideKeyOf(label),
        file,
        file.name,
        file.type
      );
      patchItem(label, aud, si, ii, {
        url,
        storagePath,
        type: file.type.startsWith('video/') ? 'video' : 'image',
        text: file.name,
      });
      toast.success('올렸습니다. 저장을 눌러야 반영됩니다.');
    } catch (e) {
      toast.error(guideUploadError(e));
      console.error(e);
    } finally {
      setUploading(null);
    }
  };

  /** 설명 한 벌 편집 — 요약 + 섹션(줄: 글·링크·사진·동영상). 위(멘토·부매니저용)·아래(원어민용)가 같이 쓴다 */
  const renderBodyEditor = (label: string, aud: GuideAudience) => {
    const body = bodyOf(label, aud);
    return (
      <>
        <input
          value={body.summary ?? ''}
          onChange={(e) => patchBody(label, aud, (x) => ({ ...x, summary: e.target.value }))}
          placeholder={
            aud === 'foreign'
              ? '한 줄 요약 (원어민용) — 이 시간이 무엇을 하는 시간인지'
              : '한 줄 요약 — 이 시간이 무엇을 하는 시간인지'
          }
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />

        {/* 섹션 — 제목은 관리자가 정하고, 줄 하나가 항목 하나 */}
        {(body.sections ?? []).map((sec, si) => (
          <div key={sec.id} className="rounded-md border border-gray-200 bg-white p-2.5">
            <div className="mb-1.5 flex items-center gap-2">
              <input
                value={sec.title}
                onChange={(e) => patchSection(label, aud, si, (s) => ({ ...s, title: e.target.value }))}
                placeholder={aud === 'foreign' ? '섹션 제목 (예: How it works)' : '섹션 제목 (예: 진행 방법)'}
                className="w-48 rounded border border-gray-300 px-2 py-1 text-xs font-medium"
              />
              <button
                onClick={() =>
                  patchBody(label, aud, (x) => ({
                    ...x,
                    sections: (x.sections ?? []).filter((_, i) => i !== si),
                  }))
                }
                className="ml-auto text-xs text-red-500 hover:text-red-700"
              >
                섹션 삭제
              </button>
            </div>
            <div className="space-y-1">
              {sec.items.map((item, ii) => (
                <div key={item.id} className="flex items-center gap-1.5">
                  <span className="w-4 shrink-0 text-center text-xs text-gray-400">
                    {item.type === 'text' ? '•' : item.type === 'link' ? '🔗' : '🖼'}
                  </span>

                  {item.type === 'text' ? (
                    <input
                      value={item.text ?? ''}
                      onChange={(e) => patchItem(label, aud, si, ii, { text: e.target.value })}
                      onKeyDown={(e) => {
                        // 엔터로 다음 줄 — 목록을 빠르게 적어 내려가도록
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        addItem(label, aud, si, 'text');
                      }}
                      placeholder="한 줄에 하나씩"
                      className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-sm"
                    />
                  ) : item.type === 'link' ? (
                    <>
                      <input
                        value={item.text ?? ''}
                        onChange={(e) => patchItem(label, aud, si, ii, { text: e.target.value })}
                        placeholder="링크 이름"
                        className="w-28 shrink-0 rounded border border-gray-200 px-2 py-1 text-sm"
                      />
                      <input
                        value={item.url ?? ''}
                        onChange={(e) => patchItem(label, aud, si, ii, { url: e.target.value })}
                        placeholder="https://"
                        className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-sm"
                      />
                    </>
                  ) : (
                    <>
                      {item.url ? (
                        <>
                          {item.type === 'image' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.url}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded border border-gray-200 object-cover"
                            />
                          ) : (
                            <span className="w-10 shrink-0 text-center text-xs text-gray-400">🎬</span>
                          )}
                          <input
                            value={item.text ?? ''}
                            onChange={(e) => patchItem(label, aud, si, ii, { text: e.target.value })}
                            placeholder="설명 (선택)"
                            className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-sm"
                          />
                        </>
                      ) : (
                        <label className="min-w-0 flex-1 cursor-pointer rounded border border-dashed border-gray-300 px-2 py-1 text-center text-xs text-gray-500 hover:bg-gray-50">
                          {uploading === `${aud}:${si}:${ii}` ? '올리는 중…' : '사진·동영상 고르기'}
                          <input
                            type="file"
                            accept="image/*,video/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void uploadMedia(label, aud, si, ii, f);
                            }}
                          />
                        </label>
                      )}
                    </>
                  )}

                  <button
                    onClick={() => removeItem(label, aud, si, ii)}
                    className="text-xs text-gray-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-2">
              <button
                onClick={() => addItem(label, aud, si, 'text')}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                + 줄
              </button>
              <button
                onClick={() => addItem(label, aud, si, 'link')}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                + 링크
              </button>
              <button
                onClick={() => addItem(label, aud, si, 'image')}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                + 사진·동영상
              </button>
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <button
            onClick={() => addGuideSection(label, aud)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            + 섹션 추가
          </button>
        </div>
      </>
    );
  };

  return (
    <section className="rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">
          칸 설명 ({guideTargets.filter((l) => hasGuideContent(guideOf(l))).length}/{guideTargets.length})
        </h3>
        <span className="flex items-center gap-1 text-[11px] text-gray-400">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> 멘토·부매니저
          <EnBadge className="ml-1.5" /> 원어민
        </span>
      </div>

      {/* 이 표에 나오는 칸 이름들 — 멘토·부매니저용 설명이 있으면 점, 원어민용이 있으면 EN */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {guideTargets.map((label) => {
          const on = label === guideLabel;
          const filled = hasGuideContent(guideOf(label), 'mentor');
          const forForeign = hasGuideContent(guideOf(label), 'foreign');
          return (
            <button
              key={label}
              onClick={() => (on ? setGuideLabel(null) : startGuide(label))}
              className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                on
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {filled && (
                <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-white' : 'bg-blue-500'}`} />
              )}
              {label}
              {forForeign && <EnBadge on={on} />}
            </button>
          );
        })}
      </div>

      {guideLabel && (
        <div className="mt-4 space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{guideLabel}</span>
            <button
              onClick={() => setGuideLabel(null)}
              className="ml-auto text-xs text-gray-500 hover:text-gray-800"
            >
              접기
            </button>
          </div>

          {/* 위 — 멘토·부매니저에게 보이는 설명 */}
          <h4 className="text-xs font-semibold text-gray-700">멘토·부매니저에게 보이는 설명</h4>
          {renderBodyEditor(guideLabel, 'mentor')}

          {/* 아래 — 원어민에게 보이는 설명. 없으면 원어민에게는 이 칸 설명이 안 보인다 */}
          <div className="space-y-3 border-t border-dashed border-gray-300 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                <EnBadge />
                원어민에게 보이는 설명
              </h4>
              {guideOf(guideLabel).foreign && (
                <div className="ml-auto flex gap-3">
                  <button
                    onClick={() => copyMentorToForeign(guideLabel)}
                    className="text-xs text-gray-500 hover:text-gray-800"
                  >
                    위 내용 복사
                  </button>
                  <button
                    onClick={() => removeForeign(guideLabel)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    원어민 설명 삭제
                  </button>
                </div>
              )}
            </div>
            {guideOf(guideLabel).foreign ? (
              renderBodyEditor(guideLabel, 'foreign')
            ) : (
              <>
                <button
                  onClick={() => startForeign(guideLabel)}
                  className="w-full rounded-md border border-dashed border-gray-300 bg-white px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
                >
                  + 원어민에게도 보여주기
                </button>
                <p className="text-[11px] text-gray-400">
                  만들지 않으면 원어민에게는 이 칸 설명이 보이지 않습니다.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** 원어민에게 보이는 설명이 있다는 표시 */
function EnBadge({ on = false, className = '' }: { on?: boolean; className?: string }) {
  return (
    <span
      className={`rounded px-1 text-[9px] font-bold leading-4 ${
        on ? 'bg-white text-gray-900' : 'bg-emerald-100 text-emerald-700'
      } ${className}`}
    >
      EN
    </span>
  );
}
