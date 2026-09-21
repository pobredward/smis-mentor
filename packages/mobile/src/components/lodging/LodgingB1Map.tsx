import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LODGING_PLACE_COLORS, type LodgingBuilding, type LodgingPlaceView } from '@smis-mentor/shared';

interface Props {
  building: LodgingBuilding;
  places: LodgingPlaceView[];
  /** 그릴 폭 (px) — 배치도 좌표를 이 폭에 맞춰 줄인다 */
  width: number;
  selected?: string | null;
  onPlace: (id: string) => void;
}

/** 지하 1층 — 배치도 픽셀 상자를 화면 폭에 맞춰 절대 좌표로 놓는다 */
export function LodgingB1Map({ building, places, width, selected, onPlace }: Props) {
  const [vx, vy, vw, vh] = building.b1.viewBox;
  const k = width / vw;
  const height = vh * k;
  const box = (b: [number, number, number, number]) => ({
    left: (b[0] - vx) * k,
    top: (b[1] - vy) * k,
    width: (b[2] - b[0]) * k,
    height: (b[3] - b[1]) * k,
  });
  return (
    <View style={[styles.wrap, { width, height }]}>
      <Text style={styles.title}>지하 1층</Text>
      {building.b1.gray.map((g, i) => (
        <View key={i} style={[styles.gray, box(g as [number, number, number, number])]} />
      ))}
      {places.map((p) => {
        const c = LODGING_PLACE_COLORS[p.kind] ?? LODGING_PLACE_COLORS.etc;
        const b = box(p.box);
        const narrow = b.width < 44;
        const on = selected === p.id;
        return (
          <TouchableOpacity
            key={p.id}
            activeOpacity={0.7}
            onPress={() => onPlace(p.id)}
            style={[styles.place, b, { backgroundColor: c.bg }, on && styles.placeOn]}
          >
            <Text
              style={[styles.name, { color: c.ink, fontSize: b.width < 70 ? 8 : 11 }, narrow && styles.nameNarrow]}
              numberOfLines={narrow ? 1 : 2}
            >
              {p.name}
              {p.purpose ? ` · ${p.purpose}` : ''}
            </Text>
            {!!p.cap && b.width >= 70 && (
              <Text style={[styles.cap, { color: c.ink }]}>
                {p.area}㎡ / {p.cap}명
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' },
  title: { position: 'absolute', right: 10, top: 8, fontSize: 14, fontWeight: '700', color: '#9ca3af' },
  gray: { position: 'absolute', backgroundColor: '#E4E4E1', borderWidth: 1, borderColor: '#C8CDD3' },
  place: {
    position: 'absolute',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  placeOn: { borderColor: '#2563eb', borderWidth: 2 },
  name: { fontWeight: '600', textAlign: 'center' },
  nameNarrow: { transform: [{ rotate: '-90deg' }], width: 80 },
  cap: { fontSize: 8, opacity: 0.7, marginTop: 1 },
});
