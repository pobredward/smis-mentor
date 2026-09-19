import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import {
  DEFAULT_SUBJECTS,
  classNameLabel,
  columnLabelLines,
  dateLabelFor,
  dutyByBlock,
  findSubject,
  isJoinedPair,
  isMergedColumn,
  lineCountOf,
  makeNameResolvers,
  mergedColumnName,
  renderCell,
  sortBlocks,
  timeToMinutes,
  toRows,
  type CampTimetable,
  type RenderedLine,
} from '@smis-mentor/shared';

interface Props {
  timetable: CampTimetable;
  /** 반번호 → 담임 이름 */
  teacherByClassCode: Record<string, string>;
  /** 역할(소문자) → 이 그룹 담당자 이름 */
  foreignBySubject: Record<string, string>;
  myClassCode?: string;
  isForeign?: boolean;
  /** 캠프 기간 중일 때 현재 시각(분) */
  nowMinutes?: number | null;
  /** 이 말이 들어간 공통 줄에는 "아래 표" 표시를 붙인다 (인문학처럼 아래에 상세 표가 따라올 때) */
  linkedLabels?: string[];
  /** 캠프 시작일(ms) — 날짜 표는 여기서 실제 날짜를 계산한다 */
  campStartMs?: number | null;
}

/** 시간 열 너비 — 09:20 / ~10:00 두 줄이 들어갈 만큼 */
const TIME_W = 46;
const DATE_W = TIME_W;
/** 전담 열 — 이름 하나 + "(사진)조" 같은 두 번째 줄이 들어갈 만큼 */
const DUTY_W = 54;
/** 반 열이 이보다 좁아지면 그때만 가로 스크롤 */
const MIN_CLASS_W = 46;
/**
 * 한 교시 칸의 높이(고정).
 * web 은 <table> 이 알아서 행 높이를 맞춰 주지만 RN 은 열마다 독립된 세로 스택이라,
 * 한 칸이라도 늘어나면 그 열만 아래로 밀려 줄이 어긋난다. 그래서 높이를 못 박는다.
 * 하루치가 한 화면에 들어오도록 최대한 낮게 잡았다.
 */
const CELL_H = 40;
/** 날짜 표(인문학)는 한 칸에 글자 한 줄뿐이라 훨씬 낮게 */
const DATE_CELL_H = 24;
/** 공통 줄(식사·P.E·인문학)은 한 줄짜리라 더 낮게 */
const SHARED_H = 26;
/** 화면 좌우 여백 + 카드 테두리 */
const OUTER = 26;

function Lines({ line, size }: { line?: RenderedLine; size: number }) {
  if (!line?.text) return <Text style={s.dash}>—</Text>;
  return (
    <>
      {/* 강의실 호수가 맨 위 — 이동 수업에서 제일 먼저 봐야 하는 값 */}
      {!!line.room && (
        <Text style={[s.room, { fontSize: size - 1.5 }]} numberOfLines={1}>
          {line.room}
        </Text>
      )}
      <Text
        style={[
          s.cellText,
          { fontSize: size },
          line.isName ? (line.muted ? s.nameMuted : s.name) : line.muted ? s.muted : null,
          line.manual && s.manual,
        ]}
        numberOfLines={line.room || line.sub ? 1 : 2}
      >
        {line.text}
      </Text>
      {/* 담당자는 아랫줄에 — 좁은 화면에서 괄호형은 잘려서 안 보인다 */}
      {!!line.sub && (
        <Text
          style={[s.sub, { fontSize: size - 1.5 }, line.subManual && s.manual]}
          numberOfLines={1}
        >
          {line.sub}
        </Text>
      )}
    </>
  );
}

/** 시간 칸 — 시작은 진하게, 종료는 ~ 를 붙여 작고 흐리게 (줄바꿈만으로는 헷갈려서) */
function TimeCell({ start, end, isNow }: { start?: string; end?: string; isNow?: boolean }) {
  return (
    <>
      <Text style={[s.timeStart, isNow && s.nowTimeText]}>{start ?? ''}</Text>
      {!!end && <Text style={[s.timeEnd, isNow && s.nowTimeTextSub]}>~{end}</Text>}
    </>
  );
}

/**
 * 모바일 시간표 — web 의 TimetableView 와 같은 규칙으로 그린다.
 * 담임·원어민 이름은 저장값이 아니라 배정에서 조인된 값이다.
 */
export function TimetableView({
  timetable,
  teacherByClassCode,
  foreignBySubject,
  myClassCode,
  isForeign = false,
  nowMinutes = null,
  linkedLabels,
  campStartMs = null,
}: Props) {
  const { width: screenW } = useWindowDimensions();

  const layout = timetable.layout ?? 'time';
  const blocks = useMemo(() => sortBlocks(timetable.blocks ?? [], layout), [timetable.blocks, layout]);
  // 이름이 같고 붙어 있는 공통 줄(P.E, 인문학 …)은 한 칸으로
  const rows = useMemo(() => toRows(timetable.blocks ?? [], layout), [timetable.blocks, layout]);
  const subjects = timetable.subjects?.length ? timetable.subjects : DEFAULT_SUBJECTS;
  const patternLabel = 'Pattern';

  const hasMyClass = !!myClassCode && timetable.classes.some((c) => c.classCode === myClassCode);
  const [onlyMine, setOnlyMine] = useState(false);

  const dutyMap = useMemo(() => {
    const m: Record<string, Record<string, string>> = {};
    (timetable.extraColumns ?? [])
      .filter((e) => e.dutyRotation?.length)
      .forEach((e) => {
        m[e.key] = dutyByBlock(timetable.blocks ?? [], layout, e.dutyRotation);
      });
    return m;
  }, [timetable.blocks, timetable.extraColumns, layout]);

  const { resolveForeign, resolveTeacher } = useMemo(
    () => makeNameResolvers(timetable, teacherByClassCode, foreignBySubject),
    [timetable, teacherByClassCode, foreignBySubject]
  );
  const ctxFor = (columnKey: string) => ({
    subjects,
    columnKey,
    resolveForeign,
    resolveTeacher,
    patternLabel,
  });

  const columns = useMemo(
    () => [
      // 반코드 → 반이름 → 담임 → 강의실 순
      ...timetable.classes.map((c) => {
        const t = resolveTeacher(c.classCode);
        return {
          key: c.classCode,
          label: c.classCode,
          name: classNameLabel(c.className),
          sub: t?.name || '',
          subManual: !!t?.manual,
          meta: [c.classroom, c.grade].filter(Boolean).join(' · '),
          isMine: c.classCode === myClassCode,
          isDuty: false,
          extra: undefined,
        };
      }),
      ...(timetable.extraColumns ?? []).map((e) => ({
        key: e.key,
        label: e.label,
        name: '',
        sub: e.teacherRole ? resolveForeign(e.teacherRole)?.name || '' : e.teacherName || '',
        subManual: false,
        meta: '',
        isMine: false,
        isDuty: isMergedColumn(e),
        extra: e,
      })),
    ],
    [timetable.classes, timetable.extraColumns, resolveTeacher, resolveForeign, myClassCode]
  );

  /**
   * 열 너비를 화면에 맞춘다 — 가로 스크롤 없이 한 눈에 들어오는 게 기본.
   * 반이 너무 많아 글자가 뭉개질 때만 스크롤로 넘긴다.
   */
  const headW = layout === 'date' ? DATE_W : TIME_W;
  const cellH = layout === 'date' ? DATE_CELL_H : CELL_H;
  const dutyCount = columns.filter((c) => c.isDuty).length;
  const classCount = Math.max(1, columns.length - dutyCount);
  const roomFor = Math.max(280, screenW - OUTER) - headW - DUTY_W * dutyCount;
  const wanted = Math.floor(roomFor / classCount);
  const fitsScreen = wanted >= MIN_CLASS_W;
  const classW = fitsScreen ? wanted : MIN_CLASS_W;
  const widthOf = (isDuty: boolean) => (isDuty ? DUTY_W : classW);
  // 열이 좁아지면 글자도 같이 줄인다
  const fontOf = classW >= 68 ? 11 : classW >= 56 ? 10 : 9;

  const nowBlockId =
    nowMinutes == null || layout !== 'time'
      ? null
      : blocks.find((b) => {
          const f = b.times?.[0];
          const l = b.times?.[(b.times?.length ?? 1) - 1];
          if (!f || !l) return false;
          return timeToMinutes(f.start) <= nowMinutes && nowMinutes < timeToMinutes(l.end);
        })?.id ?? null;

  const bg = (subjectKey?: string, fallback?: string) =>
    findSubject(subjects, subjectKey)?.color ?? fallback;

  // ── 내 반만 보기 ──────────────────────────────────────────────────
  if (onlyMine && hasMyClass && myClassCode) {
    const mine = timetable.classes.find((c) => c.classCode === myClassCode);
    return (
      <View>
        <View style={s.mineHeader}>
          <Text style={s.mineTitle}>
            {myClassCode}
            {!!mine?.className && <Text style={s.mineSub}>  {classNameLabel(mine.className)}</Text>}
            {!!resolveTeacher(myClassCode) && <Text style={s.mineSub}>  {resolveTeacher(myClassCode)!.name}</Text>}
          </Text>
          <TouchableOpacity style={s.smallBtn} onPress={() => setOnlyMine(false)}>
            <Text style={s.smallBtnText}>{isForeign ? 'Show all' : '전체 보기'}</Text>
          </TouchableOpacity>
        </View>
        <View style={s.card}>
          {blocks.map((b) => {
            const n = lineCountOf(b, layout);
            const head =
              layout === 'date'
                ? dateLabelFor(b, campStartMs)
                : `${b.times?.[0]?.start}~${b.times?.[n - 1]?.end}`;
            if (b.kind === 'shared') {
              return (
                <View key={b.id} style={[s.mineRow, s.sharedRow]}>
                  <Text style={s.mineTime}>{head}</Text>
                  <Text style={s.mineShared}>{b.label}</Text>
                </View>
              );
            }
            const cell = b.cells?.[myClassCode];
            const parts = renderCell(cell, n, ctxFor(myClassCode));
            return (
              <View key={b.id} style={[s.mineRow, { backgroundColor: bg(cell?.subject) ?? '#fff' }]}>
                <Text style={s.mineTime}>{head}</Text>
                <View style={s.mineBody}>
                  {parts.map((p, i) =>
                    p.text ? (
                      <Text key={i} style={i === 0 ? s.cellText : s.sub}>
                        {p.text}
                        {!!p.sub && <Text style={s.sub}>  {p.sub}</Text>}
                        {!!p.room && <Text style={s.room}>  {p.room}</Text>}
                      </Text>
                    ) : null
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  // ── 전체 격자 ─────────────────────────────────────────────────────
  const grid = (
    <View>
      {/* 헤더 */}
      <View style={s.headRow}>
        <View style={[s.headCell, { width: headW }]}>
          <Text style={s.headTime}>{layout === 'date' ? '날짜' : isForeign ? 'Time' : '시간'}</Text>
        </View>
        {columns.map((col) => (
          <View key={col.key} style={[s.headCell, { width: widthOf(col.isDuty) }, col.isMine && s.mineHead]}>
            <Text style={[s.headLabel, { fontSize: fontOf + 1 }]} numberOfLines={1}>
              {col.label}
            </Text>
            {!!col.sub && (
              <Text style={[s.headSub, { fontSize: fontOf - 1 }]} numberOfLines={1}>
                {col.sub}
              </Text>
            )}
            {!!col.meta && (
              <Text style={[s.headMeta, { fontSize: fontOf - 2 }]} numberOfLines={1}>
                {col.meta}
              </Text>
            )}
          </View>
        ))}
      </View>

      {/* 본문 */}
      {rows.length === 0 && (
        <View style={s.emptyRow}>
          <Text style={s.emptyRowText}>
            {isForeign ? 'No periods yet.' : '아직 교시가 없습니다.'}
          </Text>
        </View>
      )}
      {rows.map((row) => {
        if (row.kind === 'shared') {
          const first = row.blocks[0];
          const isNow = row.blocks.some((x) => x.id === nowBlockId);
          return (
            <View key={first.id} style={s.row}>
              <View style={[s.timeCell, { width: headW, height: SHARED_H }, s.bottomHard, isNow && s.nowTime]}>
                {layout === 'date' ? (
                  <Text style={s.timeStart}>
                    {row.blocks.map((b) => dateLabelFor(b, campStartMs)).filter(Boolean).join(', ')}
                  </Text>
                ) : (
                  <TimeCell start={row.start} end={row.end} isNow={isNow} />
                )}
              </View>
              <View style={[s.sharedCell, { width: classW * classCount, height: SHARED_H }]}>
                <Text style={[s.sharedText, { fontSize: fontOf }]} numberOfLines={2}>
                  {row.label}
                  {linkedLabels?.some((k) => row.label.includes(k)) && (
                    <Text style={[s.linkedHint, { fontSize: fontOf - 2 }]}>  아래 표 ↓</Text>
                  )}
                  {!!row.subLabel && (
                    <Text style={[s.subLabel, { fontSize: fontOf - 2 }]}>  {row.subLabel}</Text>
                  )}
                </Text>
              </View>
              {(timetable.extraColumns ?? []).map((e) => (
                <View
                  key={e.key}
                  style={[s.cell, { width: widthOf(isMergedColumn(e)), height: SHARED_H }, s.bottomHard]}
                >
                  <Text style={[s.cellText, { fontSize: fontOf }]} numberOfLines={1}>
                    {first.cells?.[e.key]?.texts?.[0] || ''}
                  </Text>
                </View>
              ))}
            </View>
          );
        }

        const b = row.block;
        const n = lineCountOf(b, layout);
        const isNow = nowBlockId === b.id;

        return (
          <View key={b.id} style={s.blockRow}>
            {/* 시간(날짜) 열 — 날짜 표는 줄을 합쳐 한 칸으로 */}
            {layout === 'date' ? (
              <View style={[s.timeCell, { width: headW, height: cellH * n }, s.bottomHard]}>
                <Text style={s.timeStart}>{dateLabelFor(b, campStartMs)}</Text>
              </View>
            ) : (
              <View style={{ width: headW }}>
                {Array.from({ length: n }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      s.timeCell,
                      { width: headW, height: cellH },
                      i === n - 1 ? s.bottomHard : s.bottomSoft,
                      isNow && s.nowTime,
                    ]}
                  >
                    <TimeCell start={b.times?.[i]?.start} end={b.times?.[i]?.end} isNow={isNow} />
                  </View>
                ))}
              </View>
            )}

            {/* 반 · 전담 열 */}
            {columns.map((col) => {
              const w = widthOf(col.isDuty);
              // 전담 열(교무실조 등)은 줄을 합쳐 한 이름만
              const merged =
                col.extra && mergedColumnName(col.extra, b, dutyMap, resolveTeacher, resolveForeign);
              if (merged) {
                return (
                  <View key={col.key} style={[s.cell, { width: w, height: cellH * n }, s.bottomHard]}>
                    <Text
                      style={[
                        s.cellText,
                        { fontSize: fontOf },
                        merged.muted && s.muted,
                        merged.manual && s.manual,
                      ]}
                      numberOfLines={2}
                    >
                      {merged.text}
                    </Text>
                  </View>
                );
              }
              const cell = b.cells?.[col.key];
              const parts = renderCell(cell, n, ctxFor(col.key));
              const joined = isJoinedPair(subjects, cell?.subject);
              return (
                <View key={col.key} style={{ width: w }}>
                  {Array.from({ length: n }, (_, i) => {
                    const isLast = i === n - 1;
                    return (
                      <View
                        key={i}
                        style={[
                          s.cell,
                          { width: w, height: cellH },
                          layout === 'date' && s.cellTight,
                          { backgroundColor: bg(cell?.subject, b.color) ?? '#fff' },
                          // 이어지는 세트는 위 칸은 아래쪽, 아래 칸은 위쪽에 붙여 한 덩어리로 보이게
                          joined && n > 1 ? (i === 0 ? s.pairTop : s.pairBottom) : null,
                          isLast ? s.bottomHard : joined ? null : s.bottomSoftDark,
                          col.isMine && s.mineCell,
                        ]}
                      >
                        <Lines line={parts[i]} size={fontOf} />
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );

  return (
    <View>
      {hasMyClass && (
        <View style={s.toolbar}>
          <TouchableOpacity style={s.smallBtn} onPress={() => setOnlyMine(true)}>
            <Text style={s.smallBtnText}>{isForeign ? 'My class only' : '내 반만 보기'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {fitsScreen ? (
        <View style={s.card}>{grid}</View>
      ) : (
        // 반이 많아 다 넣으면 글자가 뭉개질 때만 가로 스크롤
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.card}>
          {grid}
        </ScrollView>
      )}

      {!!timetable.note && <Text style={s.note}>{timetable.note}</Text>}
    </View>
  );
}

const BORDER = '#e5e7eb';
const BORDER_HARD = '#d1d5db';

const s = StyleSheet.create({
  card: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden' },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  smallBtn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  smallBtnText: { fontSize: 11, color: '#374151' },

  headRow: { flexDirection: 'row', backgroundColor: '#f9fafb' },
  headCell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    borderBottomColor: BORDER_HARD,
    paddingVertical: 4,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTime: { fontSize: 10, color: '#6b7280', fontWeight: '500' },
  headLabel: { fontWeight: '600', color: '#111827' },
  headName: { color: '#374151' },
  headSub: { color: '#4b5563', marginTop: 1 },
  /** 직접 입력한 이름 — 앱과 연동된 값이 아님을 점선 밑줄로 */
  manual: { textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: '#9ca3af' },
  headMeta: { color: '#9ca3af', marginTop: 1 },
  mineHead: { backgroundColor: '#eff6ff' },

  blockRow: { flexDirection: 'row' },
  row: { flexDirection: 'row' },
  timeCell: {
    borderRightWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  timeStart: { fontSize: 10, color: '#374151', fontWeight: '600', textAlign: 'center', lineHeight: 12 },
  timeEnd: { fontSize: 8.5, color: '#9ca3af', textAlign: 'center', lineHeight: 10 },
  nowTime: { backgroundColor: '#eff6ff' },
  nowTimeText: { color: '#1d4ed8', fontWeight: '700' },
  nowTimeTextSub: { color: '#60a5fa' },

  cell: {
    borderRightWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  cellTight: { paddingVertical: 0 },
  pairTop: { justifyContent: 'flex-end', paddingBottom: 0 },
  pairBottom: { justifyContent: 'flex-start', paddingTop: 0 },
  mineCell: { borderWidth: 1, borderColor: '#bfdbfe' },
  bottomHard: { borderBottomWidth: 1, borderBottomColor: BORDER_HARD },
  bottomSoft: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  bottomSoftDark: { borderBottomWidth: 1, borderBottomColor: BORDER_HARD },

  sharedCell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    borderBottomColor: BORDER_HARD,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  sharedText: { fontWeight: '500', color: '#374151', textAlign: 'center' },
  linkedHint: { color: '#2563eb', fontWeight: '400' },
  subLabel: { color: '#6b7280', fontWeight: '400' },

  cellText: { fontSize: 11, color: '#111827', textAlign: 'center', lineHeight: 12 },
  name: { color: '#64748b' },
  nameMuted: { color: '#94a3b8' },
  muted: { color: '#9ca3af' },
  sub: { fontSize: 9.5, color: '#64748b', textAlign: 'center', lineHeight: 10 },
  room: { fontSize: 9.5, color: '#9ca3af', textAlign: 'center', lineHeight: 10 },
  dash: { fontSize: 11, color: '#d1d5db' },

  emptyRow: { paddingVertical: 32, alignItems: 'center' },
  emptyRowText: { fontSize: 11, color: '#9ca3af' },

  mineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  mineTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  mineSub: { fontSize: 13, color: '#6b7280', fontWeight: '400' },
  mineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  sharedRow: { backgroundColor: '#f9fafb' },
  mineTime: { width: 90, fontSize: 10, color: '#6b7280' },
  mineShared: { flex: 1, fontSize: 12, fontWeight: '500', color: '#374151' },
  mineBody: { flex: 1 },
  note: { marginTop: 10, fontSize: 11, color: '#6b7280' },
});

export default TimetableView;
