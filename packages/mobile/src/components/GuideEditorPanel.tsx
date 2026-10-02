/**
 * 칸 설명(세부페이지) 편집기 — 시간표 편집기와 일정표(익사이팅) 편집기가 같이 쓴다 (web 의 GuideEditorPanel 과 같은 구성).
 * 저장은 부모가 한다 (campSettings.timetableGuides 를 통째로).
 *
 * 한 칸 안에서 위는 멘토·부매니저에게 보이는 설명, 아래는 원어민에게 보이는 설명(foreign).
 * 원어민용은 몇 칸에만 붙이는 게 보통이라 '+ 원어민에게도 보여주기' 를 눌러야 생긴다.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import {
  copyGuideBody,
  DEFAULT_FOREIGN_GUIDE_SECTIONS,
  DEFAULT_GUIDE_SECTIONS,
  guideKeyOf,
  guideUploadError,
  hasGuideContent,
  timetableDraft as D,
  uploadGuideMedia,
  type GuideAudience,
  type GuideBody,
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
  /**
   * 설명 한 벌 — 멘토·부매니저용은 칸의 바깥 summary·sections, 원어민용은 foreign.
   * 아래 편집 함수들은 audience 만 바꿔서 위·아래 두 칸이 같이 쓴다.
   */
  const bodyOf = (label: string, aud: GuideAudience): GuideBody =>
    aud === 'foreign' ? guideOf(label).foreign ?? {} : guideOf(label);
  const patchBody = (label: string, aud: GuideAudience, fn: (b: GuideBody) => GuideBody) =>
    patchGuide(label, (g) => (aud === 'foreign' ? { ...g, foreign: fn(g.foreign ?? {}) } : { ...g, ...fn(g) }));
  const newId = () => D.newBlockId().slice(-6);
  const addGuideSection = (label: string, aud: GuideAudience) =>
    patchBody(label, aud, (b) => ({
      ...b,
      sections: [...(b.sections ?? []), { id: newId(), title: '', items: [] }],
    }));
  const startGuide = (label: string) => {
    setGuideLabel(label);
    if (!guides[guideKeyOf(label)]?.sections?.length) {
      patchGuide(label, (g) => ({
        ...g,
        sections: DEFAULT_GUIDE_SECTIONS.map((title) => ({ id: newId(), title, items: [] })),
      }));
    }
  };
  /** 원어민에게도 보여 주기 — 영어 기본 섹션을 깔아 준다 */
  const startForeign = (label: string) =>
    patchGuide(label, (g) => ({
      ...g,
      foreign: { sections: DEFAULT_FOREIGN_GUIDE_SECTIONS.map((title) => ({ id: newId(), title, items: [] })) },
    }));
  /**
   * 위(멘토·부매니저용) 내용을 원어민용으로 복사.
   * 올린 사진·동영상은 주소만 같이 쓰고 storagePath 는 넘기지 않는다 — 한쪽을 지워도 다른 쪽 파일은 남게.
   */
  const copyMentorToForeign = (label: string) => {
    const run = () => patchGuide(label, (g) => ({ ...g, foreign: copyGuideBody(g, newId) }));
    if (!hasGuideContent(guideOf(label), 'foreign')) {
      run();
      return;
    }
    Alert.alert('위 내용 복사', '원어민 설명을 위 내용으로 바꿀까요? 지금 쓴 원어민 설명은 사라집니다.', [
      { text: '취소', style: 'cancel' },
      { text: '바꾸기', onPress: run },
    ]);
  };
  const removeForeign = (label: string) =>
    Alert.alert('원어민 설명 삭제', `"${label}" 의 원어민 설명을 지울까요? 저장을 눌러야 반영됩니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => patchGuide(label, (g) => ({ ...g, foreign: undefined })),
      },
    ]);

  const patchSection = (label: string, aud: GuideAudience, si: number, fn: (s: GuideSection) => GuideSection) =>
    patchBody(label, aud, (b) => ({
      ...b,
      sections: (b.sections ?? []).map((s, i) => (i === si ? fn(s) : s)),
    }));

  const addItem = (label: string, aud: GuideAudience, si: number, type: GuideItemType) =>
    patchSection(label, aud, si, (s) => ({ ...s, items: [...s.items, { id: newId(), type }] }));
  const patchItem = (label: string, aud: GuideAudience, si: number, ii: number, patch: Partial<GuideItem>) =>
    patchSection(label, aud, si, (s) => ({
      ...s,
      items: s.items.map((x, i) => (i === ii ? { ...x, ...patch } : x)),
    }));
  const removeItem = (label: string, aud: GuideAudience, si: number, ii: number) =>
    patchSection(label, aud, si, (s) => ({ ...s, items: s.items.filter((_, i) => i !== ii) }));

  /** 사진·동영상은 Storage 에 올리고 주소만 설명에 남긴다 (원어민용은 칸 폴더 아래 foreign/) */
  const [uploading, setUploading] = useState<string | null>(null);
  const pickMedia = async (label: string, aud: GuideAudience, si: number, ii: number) => {
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
    const key = `${aud}:${si}:${ii}`;
    setUploading(key);
    try {
      const res = await fetch(asset.uri);
      const blob = await res.blob();
      const name = asset.fileName ?? asset.uri.split('/').pop() ?? 'file';
      const { url, storagePath } = await uploadGuideMedia(
        storage,
        campCode,
        aud === 'foreign' ? `${guideKeyOf(label)}/foreign` : guideKeyOf(label),
        blob,
        name,
        asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg')
      );
      patchItem(label, aud, si, ii, {
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

  /** 설명 한 벌 편집 — 요약 + 섹션(줄: 글·링크·사진·동영상). 위(멘토·부매니저용)·아래(원어민용)가 같이 쓴다 */
  const renderBodyEditor = (label: string, aud: GuideAudience) => {
    const body = bodyOf(label, aud);
    return (
      <>
        <TextInput
          value={body.summary ?? ''}
          onChangeText={(v) => patchBody(label, aud, (x) => ({ ...x, summary: v }))}
          style={[s.input, { marginTop: 8 }]}
          placeholder={aud === 'foreign' ? '한 줄 요약 (원어민용)' : '한 줄 요약'}
          placeholderTextColor="#9ca3af"
        />

        {(body.sections ?? []).map((sec, si) => (
          <View key={sec.id} style={s.guideSection}>
            <View style={s.classRow}>
              <TextInput
                value={sec.title}
                onChangeText={(v) => patchSection(label, aud, si, (x) => ({ ...x, title: v }))}
                style={[s.input, s.flex1]}
                placeholder={aud === 'foreign' ? '섹션 제목 (예: How it works)' : '섹션 제목 (예: 진행 방법)'}
                placeholderTextColor="#9ca3af"
              />
              <TouchableOpacity
                onPress={() =>
                  patchBody(label, aud, (x) => ({
                    ...x,
                    sections: (x.sections ?? []).filter((_, i) => i !== si),
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
                    onChangeText={(v) => patchItem(label, aud, si, ii, { text: v })}
                    style={[s.input, s.flex1]}
                    placeholder="한 줄에 하나씩"
                    placeholderTextColor="#9ca3af"
                  />
                ) : item.type === 'link' ? (
                  <View style={s.flex1}>
                    <TextInput
                      value={item.text ?? ''}
                      onChangeText={(v) => patchItem(label, aud, si, ii, { text: v })}
                      style={s.input}
                      placeholder="링크 이름"
                      placeholderTextColor="#9ca3af"
                    />
                    <TextInput
                      value={item.url ?? ''}
                      onChangeText={(v) => patchItem(label, aud, si, ii, { url: v })}
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
                      onChangeText={(v) => patchItem(label, aud, si, ii, { text: v })}
                      style={[s.input, s.flex1, { marginLeft: 6 }]}
                      placeholder="설명 (선택)"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[s.pickBtn, s.flex1]}
                    onPress={() => pickMedia(label, aud, si, ii)}
                    disabled={uploading === `${aud}:${si}:${ii}`}
                  >
                    <Text style={s.pickBtnText}>
                      {uploading === `${aud}:${si}:${ii}` ? '올리는 중…' : '사진·동영상 고르기'}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => removeItem(label, aud, si, ii)}
                  style={s.iconBtn}
                >
                  <Ionicons name="close" size={14} color="#d1d5db" />
                </TouchableOpacity>
              </View>
            ))}
            <View style={[s.wrapRow, { marginTop: 2 }]}>
              <TouchableOpacity
                onPress={() => addItem(label, aud, si, 'text')}
                style={s.miniBtn}
              >
                <Text style={s.miniBtnText}>+ 줄</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => addItem(label, aud, si, 'link')}
                style={s.miniBtn}
              >
                <Text style={s.miniBtnText}>+ 링크</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => addItem(label, aud, si, 'image')}
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
            onPress={() => addGuideSection(label, aud)}
          >
            <Text style={s.miniBtnText}>+ 섹션 추가</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  };

  return (
      <Section
        title={`칸 설명 (${guideTargets.filter((l) => hasGuideContent(guideOf(l))).length}/${guideTargets.length})`}
        tag={<Text style={s.legend}>• 멘토·부매니저  EN 원어민</Text>}
      >
        <View style={s.wrapRow}>
          {guideTargets.map((label) => {
            const on = label === guideLabel;
            // 멘토·부매니저용 설명이 있으면 점, 원어민용이 있으면 EN
            const filled = hasGuideContent(guideOf(label), 'mentor');
            const forForeign = hasGuideContent(guideOf(label), 'foreign');
            return (
              <TouchableOpacity
                key={label}
                onPress={() => (on ? setGuideLabel(null) : startGuide(label))}
                style={[s.smallChip, on && s.smallChipOn, s.chipRow]}
              >
                <Text style={[s.smallChipText, on && s.smallChipTextOn]}>
                  {filled ? '• ' : ''}
                  {label}
                </Text>
                {forForeign && <Text style={[s.enBadge, on && s.enBadgeOn]}>EN</Text>}
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

            {/* 위 — 멘토·부매니저에게 보이는 설명 */}
            <Text style={[s.blockTitle, { marginTop: 10 }]}>멘토·부매니저에게 보이는 설명</Text>
            {renderBodyEditor(guideLabel, 'mentor')}

            {/* 아래 — 원어민에게 보이는 설명. 없으면 원어민에게는 이 칸 설명이 안 보인다 */}
            <View style={s.foreignBlock}>
              <View style={s.tagRow}>
                <Text style={s.enBadge}>EN</Text>
                <Text style={s.blockTitle}>원어민에게 보이는 설명</Text>
              </View>
              {guideOf(guideLabel).foreign ? (
                <>
                  <View style={[s.wrapRow, { marginTop: 6 }]}>
                    <TouchableOpacity style={s.miniBtn} onPress={() => copyMentorToForeign(guideLabel)}>
                      <Text style={s.miniBtnText}>위 내용 복사</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.miniBtn} onPress={() => removeForeign(guideLabel)}>
                      <Text style={[s.miniBtnText, s.dangerText]}>원어민 설명 삭제</Text>
                    </TouchableOpacity>
                  </View>
                  {renderBodyEditor(guideLabel, 'foreign')}
                </>
              ) : (
                <>
                  <TouchableOpacity style={[s.pickBtn, { marginTop: 8 }]} onPress={() => startForeign(guideLabel)}>
                    <Text style={s.pickBtnText}>+ 원어민에게도 보여주기</Text>
                  </TouchableOpacity>
                  <Text style={[s.hint, { marginTop: 4, marginBottom: 0 }]}>
                    만들지 않으면 원어민에게는 이 칸 설명이 보이지 않습니다.
                  </Text>
                </>
              )}
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
  // 위·아래(멘토·부매니저용 / 원어민용) 구분
  blockTitle: { fontSize: 12, fontWeight: '700', color: '#374151' },
  foreignBlock: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#d1d5db' },
  dangerText: { color: '#dc2626' },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  enBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: '#047857',
    backgroundColor: '#d1fae5',
    borderRadius: 3,
    overflow: 'hidden',
    paddingHorizontal: 3,
  },
  enBadgeOn: { color: '#2563eb', backgroundColor: '#fff' },
  legend: { fontSize: 10, color: '#9ca3af' },
});
