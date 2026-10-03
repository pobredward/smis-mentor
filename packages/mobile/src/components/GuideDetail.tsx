import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  guideBodyFor,
  hasBodyContent,
  hasItemContent,
  L,
  type GuideAudience,
  type GuideBody,
  type TimetableGuide,
} from '@smis-mentor/shared';
import { GuideAudienceTabs } from './GuideAudienceTabs';

interface Props {
  /** 어느 칸을 눌렀는지 — 제목 */
  label: string;
  guide: TimetableGuide | undefined;
  /** 보는 사람 — 처음에 열 쪽 (원어민 → 원어민용, 그 밖 → 멘토·부매니저용) */
  audience?: GuideAudience;
  onBack: () => void;
}

/**
 * 칸을 눌렀을 때 뜨는 세부 화면 (web GuideDetail 과 같은 구성).
 * 관리자가 쓴 것만 보여 준다 — 담당·강의실·교재는 시간표에 이미 있으므로 되풀이하지 않는다.
 * 누구나 오른쪽 위 Mentor / Foreign 으로 두 벌을 오가며 본다 — 원어민도 멘토 멘트를, 멘토도 원어민용을.
 */
export function GuideDetail({ label, guide, audience = 'mentor', onBack }: Props) {
  const filled = {
    mentor: hasBodyContent(guideBodyFor(guide, 'mentor')),
    foreign: hasBodyContent(guide?.foreign),
  };
  // 처음엔 자기 쪽 — 비어 있고 다른 쪽에 내용이 있으면 그쪽
  const other: GuideAudience = audience === 'foreign' ? 'mentor' : 'foreign';
  const firstTab: GuideAudience = filled[audience] || !filled[other] ? audience : other;
  // 고른 쪽은 그 칸에서만 — 다른 칸을 열면 다시 처음 규칙대로
  const [pick, setPick] = useState<{ label: string; tab: GuideAudience } | null>(null);
  const tab = pick?.label === label ? pick.tab : firstTab;
  const body = guideBodyFor(guide, tab);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <TouchableOpacity onPress={onBack} style={s.back}>
        <Ionicons name="chevron-back" size={16} color="#6b7280" />
        <Text style={s.backText}>{L('schedule.backToTimetable')}</Text>
      </TouchableOpacity>

      <View style={s.titleRow}>
        <Text style={[s.title, s.titleText]}>{label}</Text>
        <GuideAudienceTabs
          style={{ marginTop: 2 }}
          value={tab}
          onChange={(t) => setPick({ label, tab: t })}
          filled={filled}
          labels={{ mentor: L('schedule.guideMentor'), foreign: L('schedule.guideForeign') }}
          emptyHint={false}
        />
      </View>
      <GuideBodyView body={body} />

      {!hasBodyContent(body) && (
        <Text style={s.empty}>
          {!filled.mentor && !filled.foreign
            ? L('schedule.guideEmpty')
            : L(tab === 'foreign' ? 'schedule.guideEmptyForeign' : 'schedule.guideEmptyMentor')}
        </Text>
      )}
    </ScrollView>
  );
}

/** 설명 한 벌 — 요약 + 섹션 */
function GuideBodyView({ body }: { body: GuideBody | undefined }) {
  const { width } = useWindowDimensions();
  const mediaW = Math.max(200, width - 28);
  const sections = (body?.sections ?? []).filter((s) => s.items.some(hasItemContent));

  return (
    <>
      {!!body?.summary && <Text style={s.summary}>{body.summary}</Text>}

      {sections.map((sec) => (
        <View key={sec.id} style={s.section}>
          {!!sec.title && <Text style={s.sectionTitle}>{sec.title}</Text>}
          {sec.items.filter(hasItemContent).map((item) => {
            if (item.type === 'text') {
              return (
                <View key={item.id} style={s.itemRow}>
                  <Text style={s.bullet}>•</Text>
                  <Text style={s.itemText}>{item.text}</Text>
                </View>
              );
            }
            if (item.type === 'link') {
              return (
                <TouchableOpacity
                  key={item.id}
                  style={s.linkBtn}
                  onPress={() => item.url && Linking.openURL(item.url)}
                >
                  <Ionicons name="link-outline" size={13} color="#1d4ed8" />
                  <Text style={s.linkText} numberOfLines={1}>
                    {item.text || item.url}
                  </Text>
                </TouchableOpacity>
              );
            }
            if (item.type === 'image') {
              return (
                <View key={item.id} style={s.media}>
                  <Image
                    source={{ uri: item.url }}
                    style={{ width: mediaW, height: mediaW * 0.6, borderRadius: 8 }}
                    contentFit="contain"
                  />
                  {!!item.text && <Text style={s.caption}>{item.text}</Text>}
                </View>
              );
            }
            // 동영상은 앱에 재생기가 없어 기본 플레이어로 넘긴다
            return (
              <TouchableOpacity
                key={item.id}
                style={s.videoBtn}
                onPress={() => item.url && Linking.openURL(item.url)}
              >
                <Ionicons name="play-circle-outline" size={18} color="#1d4ed8" />
                <Text style={s.linkText} numberOfLines={1}>
                  {item.text || L('schedule.watchVideo')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 14, paddingBottom: 48 },

  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  backText: { fontSize: 13, color: '#6b7280' },

  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titleText: { flex: 1 },
  summary: { marginTop: 4, fontSize: 13, color: '#4b5563', lineHeight: 19 },

  section: { marginTop: 18 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 6 },

  itemRow: { flexDirection: 'row', marginBottom: 3 },
  bullet: { width: 14, fontSize: 13, color: '#9ca3af', lineHeight: 19 },
  itemText: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 19 },

  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 5,
    maxWidth: '100%',
  },
  videoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 5,
  },
  linkText: { flexShrink: 1, fontSize: 12, color: '#1d4ed8' },

  media: { marginBottom: 8 },
  caption: { marginTop: 3, fontSize: 11, color: '#6b7280' },

  empty: { marginTop: 24, fontSize: 12, color: '#9ca3af' },
});

export default GuideDetail;
