/**
 * 칸 설명(세부페이지) 편집기 — 시간표 편집기와 일정표(익사이팅) 편집기가 같이 쓴다 (web 의 GuideEditorPanel 과 같은 구성).
 * 저장은 부모가 한다 (campSettings.timetableGuides 를 통째로).
 */
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import {
  DEFAULT_GUIDE_SECTIONS,
  guideKeyOf,
  guideUploadError,
  hasGuideContent,
  timetableDraft as D,
  uploadGuideMedia,
  type GuideItem,
  type GuideItemType,
  type GuideSection,
  type TimetableGuide,
} from '@smis-mentor/shared';
import { storage } from '../config/firebase';

export function GuideEditorPanel({
  campCode,
  labels,
  guides,
  setGuides,
}: {
  campCode: string;
  /** 설명을 붙일 칸 이름들 */
  labels: string[];
  guides: Record<string, TimetableGuide>;
  setGuides: (fn: (prev: Record<string, TimetableGuide>) => Record<string, TimetableGuide>) => void;
}) {
  const [guideLabel, setGuideLabel] = useState<string | null>(null);
  const guideTargets = labels;
  // ── 칸 설명 ───────────────────────────────────────────────────────
  const guideOf = (label: string): TimetableGuide => guides[guideKeyOf(label)] ?? {};
  const patchGuide = (label: string, fn: (g: TimetableGuide) => TimetableGuide) =>
    setGuides((prev) => {
      const key = guideKeyOf(label);
      return { ...prev, [key]: fn(prev[key] ?? {}) };
    });
  const newId = () => D.newBlockId().slice(-6);
  const startGuide = (label: string) => {
    setGuideLabel(label);
    if (!guides[guideKeyOf(label)]?.sections?.length) {
      patchGuide(label, (g) => ({
        ...g,
        sections: DEFAULT_GUIDE_SECTIONS.map((title) => ({ id: newId(), title, items: [] })),
      }));
    }
  };
  const patchSection = (label: string, si: number, fn: (s: GuideSection) => GuideSection) =>
    patchGuide(label, (g) => ({
      ...g,
      sections: (g.sections ?? []).map((s, i) => (i === si ? fn(s) : s)),
    }));

  const addItem = (label: string, si: number, type: GuideItemType) =>
    patchSection(label, si, (s) => ({ ...s, items: [...s.items, { id: newId(), type }] }));
  const patchItem = (label: string, si: number, ii: number, patch: Partial<GuideItem>) =>
    patchSection(label, si, (s) => ({
      ...s,
      items: s.items.map((x, i) => (i === ii ? { ...x, ...patch } : x)),
    }));
  const removeItem = (label: string, si: number, ii: number) =>
    patchSection(label, si, (s) => ({ ...s, items: s.items.filter((_, i) => i !== ii) }));

  /** 사진·동영상은 Storage 에 올리고 주소만 설명에 남긴다 */
  const [uploading, setUploading] = useState<string | null>(null);
  const pickMedia = async (label: string, si: number, ii: number) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('권한 필요', '사진 접근을 허용해 주세요.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.7,
    });
    if (picked.canceled || !picked.assets?.length) return;

    const asset = picked.assets[0];
    const key = `${si}:${ii}`;
    setUploading(key);
    try {
      const res = await fetch(asset.uri);
      const blob = await res.blob();
      const name = asset.fileName ?? asset.uri.split('/').pop() ?? 'file';
      const { url, storagePath } = await uploadGuideMedia(
        storage,
        campCode,
        guideKeyOf(label),
        blob,
        name,
        asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg')
      );
      patchItem(label, si, ii, {
        url,
        storagePath,
        type: asset.type === 'video' ? 'video' : 'image',
        text: name,
      });
      Alert.alert('올렸습니다', '저장을 눌러야 반영됩니다.');
    } catch (e) {
      Alert.alert('올리지 못했습니다', guideUploadError(e));
      console.error(e);
    } finally {
      setUploading(null);
    }
  };

  return (
      <Section
        title={`칸 설명 (${guideTargets.filter((l) => hasGuideContent(guideOf(l))).length}/${guideTargets.length})`}
      >
        <View style={s.wrapRow}>
          {guideTargets.map((label) => {
            const on = label === guideLabel;
            const filled = hasGuideContent(guideOf(label));
            return (
              <TouchableOpacity
                key={label}
                onPress={() => (on ? setGuideLabel(null) : startGuide(label))}
                style={[s.smallChip, on && s.smallChipOn]}
              >
                <Text style={[s.smallChipText, on && s.smallChipTextOn]}>
                  {filled ? '• ' : ''}
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!!guideLabel && (
          <View style={s.guideBox}>
            <View style={s.tagRow}>
              <Text style={s.guideTitle}>{guideLabel}</Text>
              <TouchableOpacity onPress={() => setGuideLabel(null)} style={{ marginLeft: 'auto' }}>
                <Text style={s.tagLink}>접기</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              value={guideOf(guideLabel).summary ?? ''}
              onChangeText={(v) => patchGuide(guideLabel, (g) => ({ ...g, summary: v }))}
              style={[s.input, { marginTop: 8 }]}
              placeholder="한 줄 요약"
              placeholderTextColor="#9ca3af"
            />

            {(guideOf(guideLabel).sections ?? []).map((sec, si) => (
              <View key={sec.id} style={s.guideSection}>
                <View style={s.classRow}>
                  <TextInput
                    value={sec.title}
                    onChangeText={(v) => patchSection(guideLabel, si, (x) => ({ ...x, title: v }))}
                    style={[s.input, s.flex1]}
                    placeholder="섹션 제목 (예: 진행 방법)"
                    placeholderTextColor="#9ca3af"
                  />
                  <TouchableOpacity
                    onPress={() =>
                      patchGuide(guideLabel, (g) => ({
                        ...g,
                        sections: (g.sections ?? []).filter((_, i) => i !== si),
                      }))
                    }
                    style={s.iconBtn}
                  >
                    <Ionicons name="close" size={16} color="#9ca3af" />
                  </TouchableOpacity>
                </View>
                {sec.items.map((item, ii) => (
                  <View key={item.id} style={s.classRow}>
                    <Text style={s.bullet}>
                      {item.type === 'text' ? '•' : item.type === 'link' ? '🔗' : '🖼'}
                    </Text>

                    {item.type === 'text' ? (
                      <TextInput
                        value={item.text ?? ''}
                        onChangeText={(v) => patchItem(guideLabel, si, ii, { text: v })}
                        style={[s.input, s.flex1]}
                        placeholder="한 줄에 하나씩"
                        placeholderTextColor="#9ca3af"
                      />
                    ) : item.type === 'link' ? (
                      <View style={s.flex1}>
                        <TextInput
                          value={item.text ?? ''}
                          onChangeText={(v) => patchItem(guideLabel, si, ii, { text: v })}
                          style={s.input}
                          placeholder="링크 이름"
                          placeholderTextColor="#9ca3af"
                        />
                        <TextInput
                          value={item.url ?? ''}
                          onChangeText={(v) => patchItem(guideLabel, si, ii, { url: v })}
                          style={[s.input, { marginTop: 4 }]}
                          placeholder="https://"
                          placeholderTextColor="#9ca3af"
                          autoCapitalize="none"
                        />
                      </View>
                    ) : item.url ? (
                      <View style={[s.flex1, s.tagRow]}>
                        {item.type === 'image' ? (
                          <Image
                            source={{ uri: item.url }}
                            style={{ width: 36, height: 36, borderRadius: 4 }}
                            contentFit="cover"
                          />
                        ) : (
                          <Ionicons name="play-circle-outline" size={28} color="#9ca3af" />
                        )}
                        <TextInput
                          value={item.text ?? ''}
                          onChangeText={(v) => patchItem(guideLabel, si, ii, { text: v })}
                          style={[s.input, s.flex1, { marginLeft: 6 }]}
                          placeholder="설명 (선택)"
                          placeholderTextColor="#9ca3af"
                        />
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[s.pickBtn, s.flex1]}
                        onPress={() => pickMedia(guideLabel, si, ii)}
                        disabled={uploading === `${si}:${ii}`}
                      >
                        <Text style={s.pickBtnText}>
                          {uploading === `${si}:${ii}` ? '올리는 중…' : '사진·동영상 고르기'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      onPress={() => removeItem(guideLabel, si, ii)}
                      style={s.iconBtn}
                    >
                      <Ionicons name="close" size={14} color="#d1d5db" />
                    </TouchableOpacity>
                  </View>
                ))}
                <View style={[s.wrapRow, { marginTop: 2 }]}>
                  <TouchableOpacity
                    onPress={() => addItem(guideLabel, si, 'text')}
                    style={s.miniBtn}
                  >
                    <Text style={s.miniBtnText}>+ 줄</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => addItem(guideLabel, si, 'link')}
                    style={s.miniBtn}
                  >
                    <Text style={s.miniBtnText}>+ 링크</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => addItem(guideLabel, si, 'image')}
                    style={s.miniBtn}
                  >
                    <Text style={s.miniBtnText}>+ 사진·동영상</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <View style={[s.wrapRow, { marginTop: 6 }]}>
              <TouchableOpacity
                style={s.miniBtn}
                onPress={() =>
                  patchGuide(guideLabel, (g) => ({
                    ...g,
                    sections: [...(g.sections ?? []), { id: newId(), title: '', items: [] }],
                  }))
                }
              >
                <Text style={s.miniBtnText}>+ 섹션 추가</Text>
              </TouchableOpacity>
            </View>
            <Text style={[s.hint, { marginTop: 6 }]}>
              줄은 글·링크·사진·동영상을 섞어 넣을 수 있습니다.
            </Text>
          </View>
        )}
      </Section>
  );
}

function Section({
  title,
  action,
  tag,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  /** 공통/전용 표시 — 제목 바로 옆 */
  tag?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <View style={s.tagRow}>
          <Text style={s.sectionTitle}>{title}</Text>
          {tag}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  flex1: { flex: 1 },
  section: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bullet: { width: 16, fontSize: 12, color: '#9ca3af' },
  classRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  guideBox: { marginTop: 10, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, backgroundColor: '#f9fafb', padding: 10 },
  guideSection: { marginTop: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, backgroundColor: '#fff', padding: 8 },
  guideTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  iconBtn: { padding: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: '#111827',
    backgroundColor: '#fff',
  },
  miniBtn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  miniBtnText: { fontSize: 11, color: '#374151' },
  pickBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  pickBtnText: { fontSize: 11, color: '#6b7280' },
  smallChip: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  smallChipOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  smallChipText: { fontSize: 11, color: '#374151' },
  smallChipTextOn: { color: '#fff' },
  tagLink: { fontSize: 10, color: '#6b7280', textDecorationLine: 'underline' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hint: { fontSize: 11, lineHeight: 16, color: '#6b7280', marginBottom: 8 },
});
