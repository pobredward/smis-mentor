/**
 * 칸 설명 (캠프 전체 공용) — 지금 표의 칸 이름들에 설명을 붙인다. GuideEditorPanel 을 그대로 쓰고
 * 고친 내용은 작업 공간에만 (사진·동영상 올리기는 기존처럼 바로 올라간다).
 */
import React from 'react';
import { View, Text } from 'react-native';
import { timetableLabels, timetableWorkspace as W, type CampTimetable } from '@smis-mentor/shared';
import { GuideEditorPanel } from '../GuideEditorPanel';
import { Notice, SectionHead, u, type SetWs } from './common';

export function GuidePanel({ table, ws, setWs, campCode }: { table: CampTimetable; ws: W.Workspace; setWs: SetWs; campCode: string }) {
  const labels = timetableLabels(table);
  return (
    <View>
      <SectionHead title="칸 설명" scope="캠프 전체" />
      <Notice text="같은 이름 칸은 모든 그룹·Day 가 같은 설명을 씁니다. 시간표에서 그 칸을 누르면 이 설명이 뜹니다." />
      {labels.length ? (
        <GuideEditorPanel campCode={campCode} labels={labels} guides={ws.cur.guides} setGuides={(fn) => setWs((w) => W.editGuides(w, fn))} />
      ) : (
        <Text style={u.hint}>이 표에는 아직 이름이 찍힌 칸이 없습니다. 칸에 과목을 넣거나 공통 줄 이름을 쓰면 여기서 설명을 붙일 수 있습니다.</Text>
      )}
    </View>
  );
}
