import React from 'react';
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

interface Props {
  /** 어느 칸을 눌렀는지 — 제목 */
  label: string;
  guide: TimetableGuide | undefined;
  /** 보는 사람 — 멘토·부매니저는 멘토용, 원어민은 원어민용(foreign)만 본다 */
  audience?: GuideAudience;
  /** 관리자면 멘토용 아래에 원어민용도 따로 보여 준다 */
  isAdmin?: boolean;
  onBack: () => void;
}

/**
 * 칸을 눌렀을 때 뜨는 세부 화면 (web GuideDetail 과 같은 구성).
 * 관리자가 쓴 것만 보여 준다 — 담당·강의실·교재는 시간표에 이미 있으므로 되풀이하지 않는다.
 */
export function GuideDetail({ label, guide, audience = 'mentor', isAdmin = false, onBack }: Props) {
  const body = guideBodyFor(guide, audience);
  const hasMain = hasBodyContent(body);
  // 관리자에게만 — 원어민에게는 이렇게 보인다
  const foreign = isAdmin && audience === 'mentor' && hasBodyContent(guide?.foreign) ? guide?.foreign : undefined;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <TouchableOpacity onPress={onBack} style={s.back}>
        <Ionicons name="chevron-back" size={16} color="#6b7280" />
        <Text style={s.backText}>{L('schedule.backToTimetable')}</Text>
      </TouchableOpacity>

      <Text style={s.title}>{label}</Text>
      <GuideBodyView body={body} />

      {!hasMain &&
        (foreign ? (
          <Text style={s.mainEmpty}>멘토·부매니저에게 보이는 설명은 없습니다.</Text>
        ) : (
          <Text style={s.empty}>{L('schedule.guideEmpty')}</Text>
        ))}

      {!!foreign && (
        <View style={s.foreignBox}>
          <View style={s.foreignHead}>
            <Text style={s.enBadge}>EN</Text>
            <Text style={s.foreignTitle}>원어민에게 보이는 설명</Text>
          </View>
          <GuideBodyView body={foreign} inset={26} />
        </View>
      )}
    </ScrollView>
  );
}

/** 설명 한 벌 — 요약 + 섹션 (inset: 상자 안에 넣을 때 그만큼 사진 폭을 줄인다) */
function GuideBodyView({ body, inset = 0 }: { body: GuideBody | undefined; inset?: number }) {
  const { width } = useWindowDimensions();
  const mediaW = Math.max(200, width - 28 - inset);
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
  mainEmpty: { marginTop: 10, fontSize: 11, color: '#9ca3af' },

  // 관리자에게만 보이는 원어민용 설명
  foreignBox: {
    marginTop: 28,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 10,
    backgroundColor: '#f0fdf4',
    padding: 12,
  },
  foreignHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  foreignTitle: { fontSize: 12, fontWeight: '700', color: '#065f46' },
  enBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: '#047857',
    backgroundColor: '#d1fae5',
    borderRadius: 3,
    overflow: 'hidden',
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
});

export default GuideDetail;
