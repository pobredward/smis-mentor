'use client';

/** 패널 [칸 설명] — 캠프 전체 공용. GuideEditorPanel 을 그대로 쓰고 저장은 작업 공간으로 */
import { timetableWorkspace as W } from '@smis-mentor/shared';
import { GuideEditorPanel } from '../GuideEditorPanel';
import { SectionTitle, type WsUpdate } from './ui';

export function GuidePanel({ campCode, labels, ws, update, emptyText = '이 표에는 아직 이름이 있는 칸이 없습니다.' }: {
  campCode: string;
  labels: string[];
  ws: W.Workspace;
  update: WsUpdate;
  emptyText?: string;
}) {
  return (
    <div className="space-y-2">
      <SectionTitle scope="camp">칸 설명</SectionTitle>
      <p className="text-[11px] text-gray-500">같은 이름 칸은 모든 그룹·Day 가 같은 설명을 씁니다. 사진·동영상은 고르는 즉시 올라가고, 설명 글은 저장을 눌러야 반영됩니다.</p>
      {labels.length ? (
        <GuideEditorPanel campCode={campCode} labels={labels} guides={ws.cur.guides} setGuides={(fn) => update((w) => W.editGuides(w, fn))} />
      ) : (
        <p className="rounded-md border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">{emptyText}</p>
      )}
    </div>
  );
}
