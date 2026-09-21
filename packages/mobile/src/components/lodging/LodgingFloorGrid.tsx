import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type LayoutChangeEvent } from 'react-native';
import {
  annexCorridorRow,
  isLodgingRoomDimmed,
  lodgingRoomCaption,
  lodgingRoomColor,
  type LodgingBuilding,
  type LodgingRoomView,
} from '@smis-mentor/shared';

interface Props {
  building: LodgingBuilding;
  floor: number;
  rooms: Map<string, LodgingRoomView>;
  /** 전체 탭용 — 칸을 작게, 이름 4명까지 */
  compact?: boolean;
  names?: boolean;
  selected?: string | null;
  highlight?: Set<string>;
  onRoom: (num: string) => void;
  /** 격자가 놓인 자리 (부모 기준) — 검색한 방으로 화면을 옮길 때 쓴다 */
  onLayout?: (e: LayoutChangeEvent) => void;
}

/** 칸 치수 — 격자가 없어서 좌표를 직접 계산한다 */
const SIZES = {
  normal: { annexW: 112, hallW: 22, linkW: 28, mainW: 92, roomH: 108, corridorH: 24, gap: 4 },
  compact: { annexW: 62, hallW: 10, linkW: 16, mainW: 60, roomH: 70, corridorH: 16, gap: 2 },
};

type Sizes = (typeof SIZES)['normal'];

/** 격자 줄·칸 좌표 — 그리기와 방 위치 찾기가 같이 쓴다 */
function gridLayout(building: LodgingBuilding, floor: number, S: Sizes) {
  const annex = building.layout.annex[floor] ?? [];
  const main = building.layout.main[floor] ?? { upper: [], lower: [] };
  const COLS = building.mainCols;
  const jrow = annexCorridorRow(building, floor);
  const rows = annex.length + 1; // 통로 줄 포함
  const corridorRow = jrow + 1; // 0-based
  const rowOf = (i: number) => (i <= jrow ? i : i + 1);
  const rowY: number[] = [];
  let y = 0;
  for (let r = 0; r < rows; r++) {
    rowY.push(y);
    y += (r === corridorRow ? S.corridorH : S.roomH) + S.gap;
  }
  const height = y - S.gap;
  const colX = [0, S.annexW + S.gap, S.annexW + S.gap + S.hallW + S.gap];
  const mainX0 = colX[2] + S.annexW + S.gap + S.linkW + S.gap;
  const mainColX = (i: number) => mainX0 + i * (S.mainW + S.gap);
  const width = mainColX(COLS) - S.gap;
  const offU = COLS - main.upper.length;
  const offL = COLS - main.lower.length;
  return { annex, main, corridorRow, rowOf, rowY, height, colX, mainX0, mainColX, width, offU, offL };
}

/** 방 한 칸이 격자 안 어디에 있는지 (격자 왼쪽 위 기준) — 검색한 방으로 화면을 옮길 때 */
export function lodgingGridRoomRect(building: LodgingBuilding, floor: number, num: string, compact = false) {
  const S = compact ? SIZES.compact : SIZES.normal;
  const g = gridLayout(building, floor, S);
  let hit: { x: number; y: number; w: number; h: number } | null = null;
  g.annex.forEach(([L, R], i) => {
    const y = g.rowY[g.rowOf(i)];
    if (L === num) hit = { x: g.colX[0], y, w: S.annexW, h: S.roomH };
    if (R === num) hit = { x: g.colX[2], y, w: S.annexW, h: S.roomH };
  });
  const ui = g.main.upper.indexOf(num);
  if (ui >= 0) hit = { x: g.mainColX(g.offU + ui), y: g.rowY[g.corridorRow - 1], w: S.mainW, h: S.roomH };
  const li = g.main.lower.indexOf(num);
  if (li >= 0) hit = { x: g.mainColX(g.offL + li), y: g.rowY[g.corridorRow + 1], w: S.mainW, h: S.roomH };
  return hit as { x: number; y: number; w: number; h: number } | null;
}

interface Placed {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  node: React.ReactNode;
}

/**
 * ㅜ자 격자 — 별관(세로 복도, 왼쪽)의 통로 줄에서 본관(가로 복도)이 동쪽으로 뻗는다.
 * web 의 CSS grid 와 같은 배치를 절대 좌표로 놓는다.
 */
export function LodgingFloorGrid({
  building,
  floor,
  rooms,
  compact = false,
  names = true,
  selected,
  highlight,
  onRoom,
  onLayout,
}: Props) {
  const S = compact ? SIZES.compact : SIZES.normal;
  const { items, width, height } = useMemo(() => {
    const { annex, main, corridorRow, rowOf, rowY, height, colX, mainX0, mainColX, width, offU, offL } = gridLayout(building, floor, S);

    const items: Placed[] = [];
    const roomAt = (num: string, x: number, y: number, w: number, h: number) => {
      const r = rooms.get(num);
      if (!r) return;
      items.push({
        key: num,
        x,
        y,
        w,
        h,
        node: (
          <RoomCell
            room={r}
            compact={compact}
            names={names}
            selected={selected === num}
            highlighted={!!highlight?.has(num)}
            onPress={() => onRoom(num)}
          />
        ),
      });
    };
    annex.forEach(([L, R], i) => {
      const ry = rowY[rowOf(i)];
      if (L) roomAt(L, colX[0], ry, S.annexW, S.roomH);
      if (R) roomAt(R, colX[2], ry, S.annexW, S.roomH);
    });
    items.push({
      key: 'hallv',
      x: colX[1],
      y: 0,
      w: S.hallW,
      h: height,
      node: <View style={[styles.hall, { width: S.hallW, height }]} />,
    });
    const cy = rowY[corridorRow];
    items.push({
      key: 'cross',
      x: 0,
      y: cy,
      w: colX[2] + S.annexW,
      h: S.corridorH,
      node: (
        <View style={[styles.link, { width: colX[2] + S.annexW, height: S.corridorH }]}>
          {!compact && <Text style={styles.linkText}>통로</Text>}
        </View>
      ),
    });
    items.push({
      key: 'linkv',
      x: colX[2] + S.annexW + S.gap,
      y: cy,
      w: S.linkW,
      h: S.corridorH,
      node: (
        <View style={[styles.link, { width: S.linkW, height: S.corridorH }]}>
          <Text style={styles.linkText}>→</Text>
        </View>
      ),
    });
    items.push({
      key: 'hallh',
      x: mainX0,
      y: cy,
      w: width - mainX0,
      h: S.corridorH,
      node: (
        <View style={[styles.hall, styles.hallh, { width: width - mainX0, height: S.corridorH }]}>
          <Text style={styles.hallText}>{compact ? `${floor}F` : `${floor}층 본관 복도`}</Text>
          {!compact && <Text style={styles.hallText}>동쪽</Text>}
        </View>
      ),
    });
    if (floor === 1 && offU > 0) {
      items.push({
        key: 'lobby',
        x: mainX0,
        y: rowY[corridorRow - 1],
        w: offU * (S.mainW + S.gap) - S.gap,
        h: S.roomH,
        node: (
          <View style={[styles.unknown, { width: offU * (S.mainW + S.gap) - S.gap, height: S.roomH }]}>
            {!compact && <Text style={styles.unknownText}>로비·프런트 (미확인)</Text>}
          </View>
        ),
      });
    }
    main.upper.forEach((n, i) => roomAt(n, mainColX(offU + i), rowY[corridorRow - 1], S.mainW, S.roomH));
    main.lower.forEach((n, i) => roomAt(n, mainColX(offL + i), rowY[corridorRow + 1], S.mainW, S.roomH));
    return { items, width, height };
  }, [building, floor, rooms, compact, names, selected, highlight, onRoom, S]);

  return (
    <View style={{ width, height }} onLayout={onLayout}>
      {items.map((it) => (
        <View key={it.key} style={{ position: 'absolute', left: it.x, top: it.y, width: it.w, height: it.h }}>
          {it.node}
        </View>
      ))}
    </View>
  );
}

interface CellProps {
  room: LodgingRoomView;
  compact: boolean;
  names: boolean;
  selected: boolean;
  highlighted: boolean;
  onPress: () => void;
}

export function RoomCell({ room, compact, names, selected, highlighted, onPress }: CellProps) {
  const c = lodgingRoomColor(room);
  const dimmed = isLodgingRoomDimmed(room);
  // 학생방은 (필터를 거친) 학생, 학생이 없는 방은 선생님
  const people = room.students.length
    ? room.students.map((s) => ({ key: s.studentId + s.rowNumber, name: s.name, sub: s.grade }))
    : room.allStudents?.length
      ? []
      : room.teachers.map((t) => ({ key: t, name: t, sub: '' }));
  const max = compact ? 4 : room.label ? 4 : 5;
  const shown = names ? people.slice(0, max) : [];
  const more = names ? people.length - shown.length : 0;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        styles.cell,
        compact && styles.cellCompact,
        { backgroundColor: c.bg },
        dimmed && styles.cellDim,
        selected && styles.cellSelected,
        highlighted && !selected && styles.cellHighlighted,
      ]}
    >
      <View style={styles.cellHead}>
        <Text style={[styles.num, compact && styles.numCompact, { color: c.ink }]}>{room.num}</Text>
        <Text style={[styles.sub, compact && styles.subCompact, { color: c.ink }]} numberOfLines={1}>
          {lodgingRoomCaption(room)}
        </Text>
      </View>
      {room.label && !compact && (
        <Text style={[styles.label, { color: c.ink }]} numberOfLines={1}>
          {room.label}
        </Text>
      )}
      {shown.map((p) => (
        <View key={p.key} style={styles.personRow}>
          <Text style={[styles.person, compact && styles.personCompact, { color: c.ink }]} numberOfLines={1}>
            {p.name}
          </Text>
          {!!p.sub && (
            <Text style={[styles.grade, compact && styles.gradeCompact, { color: c.ink }]}>{p.sub}</Text>
          )}
        </View>
      ))}
      {more > 0 && <Text style={[styles.grade, compact && styles.gradeCompact, { color: c.ink }]}>+{more}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 5,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  cellCompact: { paddingHorizontal: 3, paddingVertical: 2, borderRadius: 4 },
  cellDim: { opacity: 0.32 },
  cellSelected: { borderColor: '#2563eb', borderWidth: 2 },
  cellHighlighted: { borderColor: '#f59e0b', borderWidth: 2 },
  cellHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 2 },
  num: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  numCompact: { fontSize: 10 },
  sub: { fontSize: 9, opacity: 0.7, flexShrink: 1 },
  subCompact: { fontSize: 7 },
  label: { fontSize: 9, fontWeight: '600' },
  personRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2 },
  person: { fontSize: 11, lineHeight: 15, flexShrink: 1 },
  personCompact: { fontSize: 8, lineHeight: 11 },
  grade: { fontSize: 9, lineHeight: 15, opacity: 0.6 },
  gradeCompact: { fontSize: 7, lineHeight: 11 },
  mentor: { fontSize: 9, opacity: 0.7, marginTop: 1 },
  hall: { backgroundColor: '#e5e7eb', borderRadius: 4 },
  hallh: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 6 },
  hallText: { fontSize: 9, color: '#6b7280', letterSpacing: 1 },
  link: { backgroundColor: '#dbeafe', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: 9, fontWeight: '600', color: '#1d4ed8' },
  unknown: { borderRadius: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  unknownText: { fontSize: 9, color: '#9ca3af' },
});
