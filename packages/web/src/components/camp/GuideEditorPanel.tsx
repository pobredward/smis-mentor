'use client';

/**
 * 칸 설명(세부페이지) 편집기 — 시간표 편집기와 일정표(익사이팅) 편집기가 같이 쓴다.
 * 저장은 부모가 한다 (campSettings.timetableGuides 를 통째로).
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  DEFAULT_GUIDE_SECTIONS,
  guideKeyOf,
  guideUploadError,
  hasGuideContent,
  timetableDraft as D,
  uploadGuideMedia,
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

  const newId = () => D.newBlockId().slice(-6);
  const addGuideSection = (label: string) =>
    patchGuide(label, (g) => ({
      ...g,
      sections: [...(g.sections ?? []), { id: newId(), title: '', items: [] }],
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
  const patchSection = (label: string, si: number, fn: (s: GuideSection) => GuideSection) =>
    patchGuide(label, (g) => ({
      ...g,
      sections: (g.sections ?? []).map((s, i) => (i === si ? fn(s) : s)),
    }));

  const addItem = (label: string, si: number, type: GuideItemType) =>
    patchSection(label, si, (s) => ({ ...s, items: [...s.items, { id: newId(), type }] }));
  const patchItem = (label: string, si: number, ii: number, patch: Partial<GuideItem>) =>
    patchSection(label, si, (s) => ({
      ...s,
      items: s.items.map((x, i) => (i === ii ? { ...x, ...patch } : x)),
    }));
  const removeItem = (label: string, si: number, ii: number) =>
    patchSection(label, si, (s) => ({ ...s, items: s.items.filter((_, i) => i !== ii) }));

  /** 사진·동영상은 Storage 에 올리고 주소만 설명에 남긴다 */
  const [uploading, setUploading] = useState<string | null>(null);
  const uploadMedia = async (label: string, si: number, ii: number, file: File) => {
    const key = `${si}:${ii}`;
    setUploading(key);
    try {
      const { url, storagePath } = await uploadGuideMedia(
        storage,
        campCode,
        guideKeyOf(label),
        file,
        file.name,
        file.type
      );
      patchItem(label, si, ii, {
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

  return (
    <section className="rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">
          칸 설명 ({guideTargets.filter((l) => hasGuideContent(guideOf(l))).length}/{guideTargets.length})
        </h3>
      </div>

      {/* 이 표에 나오는 칸 이름들 — 설명이 있는 것에는 점을 찍어 둔다 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {guideTargets.map((label) => {
          const on = label === guideLabel;
          const filled = hasGuideContent(guideOf(label));
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

          <input
            value={guideOf(guideLabel).summary ?? ''}
            onChange={(e) => patchGuide(guideLabel, (g) => ({ ...g, summary: e.target.value }))}
            placeholder="한 줄 요약 — 이 시간이 무엇을 하는 시간인지"
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />

          {/* 섹션 — 제목은 관리자가 정하고, 줄 하나가 항목 하나 */}
          {(guideOf(guideLabel).sections ?? []).map((sec, si) => (
            <div key={sec.id} className="rounded-md border border-gray-200 bg-white p-2.5">
              <div className="mb-1.5 flex items-center gap-2">
                <input
                  value={sec.title}
                  onChange={(e) => patchSection(guideLabel, si, (s) => ({ ...s, title: e.target.value }))}
                  placeholder="섹션 제목 (예: 진행 방법)"
                  className="w-48 rounded border border-gray-300 px-2 py-1 text-xs font-medium"
                />
                <button
                  onClick={() =>
                    patchGuide(guideLabel, (g) => ({
                      ...g,
                      sections: (g.sections ?? []).filter((_, i) => i !== si),
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
                        onChange={(e) => patchItem(guideLabel, si, ii, { text: e.target.value })}
                        onKeyDown={(e) => {
                          // 엔터로 다음 줄 — 목록을 빠르게 적어 내려가도록
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          addItem(guideLabel, si, 'text');
                        }}
                        placeholder="한 줄에 하나씩"
                        className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-sm"
                      />
                    ) : item.type === 'link' ? (
                      <>
                        <input
                          value={item.text ?? ''}
                          onChange={(e) => patchItem(guideLabel, si, ii, { text: e.target.value })}
                          placeholder="링크 이름"
                          className="w-28 shrink-0 rounded border border-gray-200 px-2 py-1 text-sm"
                        />
                        <input
                          value={item.url ?? ''}
                          onChange={(e) => patchItem(guideLabel, si, ii, { url: e.target.value })}
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
                              onChange={(e) => patchItem(guideLabel, si, ii, { text: e.target.value })}
                              placeholder="설명 (선택)"
                              className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-sm"
                            />
                          </>
                        ) : (
                          <label className="min-w-0 flex-1 cursor-pointer rounded border border-dashed border-gray-300 px-2 py-1 text-center text-xs text-gray-500 hover:bg-gray-50">
                            {uploading === `${si}:${ii}` ? '올리는 중…' : '사진·동영상 고르기'}
                            <input
                              type="file"
                              accept="image/*,video/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void uploadMedia(guideLabel, si, ii, f);
                              }}
                            />
                          </label>
                        )}
                      </>
                    )}

                    <button
                      onClick={() => removeItem(guideLabel, si, ii)}
                      className="text-xs text-gray-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex gap-2">
                <button
                  onClick={() => addItem(guideLabel, si, 'text')}
                  className="text-xs text-gray-500 hover:text-gray-800"
                >
                  + 줄
                </button>
                <button
                  onClick={() => addItem(guideLabel, si, 'link')}
                  className="text-xs text-gray-500 hover:text-gray-800"
                >
                  + 링크
                </button>
                <button
                  onClick={() => addItem(guideLabel, si, 'image')}
                  className="text-xs text-gray-500 hover:text-gray-800"
                >
                  + 사진·동영상
                </button>
              </div>
            </div>
          ))}

          <div className="flex gap-2">
            <button
              onClick={() => addGuideSection(guideLabel)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              + 섹션 추가
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
