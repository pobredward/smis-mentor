/**
 * 칸 설명의 두 벌 — 멘토·부매니저용 / 원어민용 — 을 오가는 탭과 칩 표시 (web GuideAudienceTabs 와 같은 구성).
 * 두 쪽이 동등하다는 게 보이도록 색을 따로 주지 않고 같은 모양으로 둔다
 * (보기 화면 — 누구나 Mentor / Foreign, 편집기 — 관리자 공용).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { GuideAudience } from '@smis-mentor/shared';

export const GUIDE_AUDIENCES: GuideAudience[] = ['mentor', 'foreign'];
export const GUIDE_AUDIENCE_LABEL: Record<GuideAudience, string> = { mentor: '멘토·부매니저용', foreign: '원어민용' };
/** 칩에 붙는 짧은 표시 — 멘토·부매니저용은 한국어, 원어민용은 영어로 쓴다 */
const GUIDE_AUDIENCE_BADGE: Record<GuideAudience, string> = { mentor: 'KO', foreign: 'EN' };

export function GuideAudienceTabs({
  value,
  onChange,
  filled,
  labels = GUIDE_AUDIENCE_LABEL,
  emptyHint = true,
  style,
}: {
  value: GuideAudience;
  onChange: (a: GuideAudience) => void;
  /** 내용이 있는 쪽 — 없는 쪽은 흐리게 (emptyHint 면 '없음' 도 붙인다) */
  filled: Record<GuideAudience, boolean>;
  labels?: Record<GuideAudience, string>;
  emptyHint?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.wrap, style]} accessibilityRole="tablist">
      {GUIDE_AUDIENCES.map((a) => {
        const on = value === a;
        return (
          <TouchableOpacity
            key={a}
            onPress={() => onChange(a)}
            style={[s.tab, on && s.tabOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[s.text, !filled[a] && s.textDim, on && s.textOn]}>{labels[a]}</Text>
            {emptyHint && !filled[a] && <Text style={s.empty}>없음</Text>}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** 칸 칩에 붙는 표시 — 그 쪽 설명이 있으면 붙인다 (KO = 멘토·부매니저용, EN = 원어민용) */
export function GuideBadge({ audience, on = false }: { audience: GuideAudience; on?: boolean }) {
  return <Text style={[s.badge, on && s.badgeOn]}>{GUIDE_AUDIENCE_BADGE[audience]}</Text>;
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: '#f3f4f6', borderRadius: 8, padding: 2 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  tabOn: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  text: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  textDim: { color: '#d1d5db' },
  textOn: { color: '#111827' },
  empty: { fontSize: 10, color: '#9ca3af' },
  badge: {
    fontSize: 9,
    fontWeight: '700',
    color: '#4b5563',
    backgroundColor: '#f3f4f6',
    borderRadius: 3,
    overflow: 'hidden',
    paddingHorizontal: 3,
  },
  badgeOn: { color: '#fff', backgroundColor: 'rgba(255,255,255,0.25)' },
});
