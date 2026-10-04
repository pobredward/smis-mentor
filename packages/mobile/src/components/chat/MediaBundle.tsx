/**
 * 사진·동영상 묶음 말풍선 (카톡 묶어 보내기)
 * 한 장이면 원래 비율, 여러 장이면 bundleRows(n) 줄로 — 줄마다 같은 높이 정사각 칸, 칸 사이 2px
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { bundleRows, type ChatMediaItem } from '@smis-mentor/shared';
import { formatDuration } from './chatTheme';

export interface BundleCell {
  kind: 'image' | 'video';
  /** 칸에 보일 그림 (작은 그림 → 없으면 사진 원본). 동영상은 작은 그림이 없으면 비운다 */
  uri?: string;
  w?: number;
  h?: number;
  durationMs?: number;
}

export const cellsOfMedia = (media: ChatMediaItem[]): BundleCell[] =>
  media.map((m) => ({
    kind: m.kind,
    uri: m.thumbUrl || (m.kind === 'image' ? m.url : undefined),
    w: m.w,
    h: m.h,
    durationMs: m.durationMs,
  }));

const GAP = 2;
export const BUNDLE_MAX_W = 240;
const SINGLE_MAX_H = 320;
const SINGLE_MIN = 96;

interface MediaBundleProps {
  cells: BundleCell[];
  width?: number;
  onPressCell?: (index: number) => void;
  onLongPress?: () => void;
  /** 칸 위에 덮을 것 (보내는 중 진행률 등) */
  overlay?: React.ReactNode;
  dimmed?: boolean;
}

function singleSize(cell: BundleCell, maxW: number): { width: number; height: number } {
  const w = cell.w ?? 0;
  const h = cell.h ?? 0;
  if (!(w > 0) || !(h > 0)) return { width: Math.min(maxW, 220), height: Math.min(maxW, 220) };
  const scale = Math.min(maxW / w, SINGLE_MAX_H / h);
  return {
    width: Math.round(Math.max(SINGLE_MIN, Math.min(maxW, w * scale))),
    height: Math.round(Math.max(SINGLE_MIN, Math.min(SINGLE_MAX_H, h * scale))),
  };
}

function Cell({
  cell,
  width,
  height,
  onPress,
  onLongPress,
}: {
  cell: BundleCell;
  width: number;
  height: number;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const duration = cell.kind === 'video' ? formatDuration(cell.durationMs) : '';
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={{ width, height }}>
      {cell.uri ? (
        <Image
          source={{ uri: cell.uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={120}
          recyclingKey={cell.uri}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.empty]} />
      )}
      {cell.kind === 'video' ? (
        <>
          <View style={styles.playWrap} pointerEvents="none">
            <View style={styles.play}>
              <Ionicons name="play" size={Math.min(22, Math.round(width / 4))} color="#ffffff" />
            </View>
          </View>
          {duration ? (
            <Text style={styles.duration} pointerEvents="none">{duration}</Text>
          ) : null}
        </>
      ) : null}
    </Pressable>
  );
}

export function MediaBundle({ cells, width = BUNDLE_MAX_W, onPressCell, onLongPress, overlay, dimmed }: MediaBundleProps) {
  if (!cells.length) return null;
  if (cells.length === 1) {
    const size = singleSize(cells[0], width);
    return (
      <View style={[styles.wrap, { width: size.width, height: size.height }, dimmed && styles.dimmed]}>
        <Cell cell={cells[0]} width={size.width} height={size.height} onPress={() => onPressCell?.(0)} onLongPress={onLongPress} />
        {overlay}
      </View>
    );
  }
  const rows = bundleRows(cells.length);
  let index = 0;
  return (
    <View style={[styles.wrap, { width }, dimmed && styles.dimmed]}>
      {rows.map((k, r) => {
        const size = (width - GAP * (k - 1)) / k;
        const start = index;
        index += k;
        return (
          <View key={r} style={[styles.row, r > 0 && { marginTop: GAP }]}>
            {cells.slice(start, start + k).map((cell, j) => (
              <View key={start + j} style={j > 0 ? { marginLeft: GAP } : undefined}>
                <Cell
                  cell={cell}
                  width={size}
                  height={size}
                  onPress={() => onPressCell?.(start + j)}
                  onLongPress={onLongPress}
                />
              </View>
            ))}
          </View>
        );
      })}
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#cbd5e1' },
  dimmed: { opacity: 0.75 },
  row: { flexDirection: 'row' },
  empty: { backgroundColor: '#334155' },
  playWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  play: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  duration: {
    position: 'absolute',
    right: 6,
    bottom: 5,
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
});
