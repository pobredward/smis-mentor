import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { hasItemContent, type TimetableGuide } from '@smis-mentor/shared';

interface Props {
  /** 어느 칸을 눌렀는지 — 제목 */
  label: string;
  guide: TimetableGuide | undefined;
  onBack: () => void;
}

/**
 * 칸을 눌렀을 때 뜨는 세부 화면 (web GuideDetail 과 같은 구성).
 * 관리자가 쓴 것만 보여 준다 — 담당·강의실·교재는 시간표에 이미 있으므로 되풀이하지 않는다.
 */
export function GuideDetail({ label, guide, onBack }: Props) {
  const { width } = useWindowDimensions();
  const mediaW = Math.max(200, width - 28);
  const sections = (guide?.sections ?? []).filter((s) => s.items.some(hasItemContent));

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <TouchableOpacity onPress={onBack} style={s.back}>
        <Ionicons name="chevron-back" size={16} color="#6b7280" />
        <Text style={s.backText}>시간표로</Text>
      </TouchableOpacity>

      <Text style={s.title}>{label}</Text>
      {!!guide?.summary && <Text style={s.summary}>{guide.summary}</Text>}

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
                  {item.text || '동영상 보기'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {!guide?.summary && !sections.length && (
        <Text style={s.empty}>아직 설명이 없습니다. 관리자가 시간표 편집 &gt; 칸 설명에서 쓸 수 있습니다.</Text>
      )}
    </ScrollView>
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
});

export default GuideDetail;
