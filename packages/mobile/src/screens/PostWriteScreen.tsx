import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { createPost, updatePost, getPostById } from '../services/communityService';
import { getUsersByJobCodeId } from '../services/userService';
import type { CommunityPost, User } from '@smis-mentor/shared';
import { RootStackScreenProps } from '../navigation/types';

const AVATAR_SIZE = 26;
const MAX_VISIBLE_AVATARS = 5;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_IMAGES = 10;

const SCOPE_LABELS: Record<string, string> = {
  all: '전체 게시판',
  camp: '캠프 게시판',
  group: '그룹 게시판',
  dev: '개발자 건의',
};

export function PostWriteScreen({ navigation, route }: RootStackScreenProps<'PostWrite'>) {
  const {
    scope,
    jobCodeId,
    groupId,
    groupLabel,
    authorId,
    authorName,
    authorProfileImage,
    authorJobCodeLabel,
    authorIsAdmin,
    editPostId,
  } = route.params;

  const isEdit = !!editPostId;

  // 수정 시 기존 게시글 데이터 로드
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [initialLoading, setInitialLoading] = useState(isEdit);

  // 열람 가능 멤버 목록 (camp / group 게시판만)
  const [members, setMembers] = useState<User[]>([]);

  // 콘텐츠
  const [content, setContent] = useState('');
  // 기존 이미지 URL (수정 시)
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  // 삭제할 기존 이미지
  const [removedImageUrls, setRemovedImageUrls] = useState<string[]>([]);
  // 새로 추가할 로컬 URI
  const [newImageUris, setNewImageUris] = useState<string[]>([]);

  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 수정 모드: 기존 데이터 불러오기
  useEffect(() => {
    if (!editPostId) return;
    getPostById(editPostId)
      .then((p) => {
        if (!p) {
          Alert.alert('오류', '게시글을 찾을 수 없습니다.');
          navigation.goBack();
          return;
        }
        setEditingPost(p);
        setContent(p.content);
        setExistingImageUrls(p.imageUrls ?? []);
        setIsAnonymous(p.isAnonymous ?? false);
      })
      .catch(() => {
        Alert.alert('오류', '게시글을 불러오지 못했습니다.');
        navigation.goBack();
      })
      .finally(() => setInitialLoading(false));
  }, [editPostId, navigation]);

  // camp/group 게시판: 열람 가능 멤버 로드
  useEffect(() => {
    if ((scope !== 'camp' && scope !== 'group') || !jobCodeId) return;
    getUsersByJobCodeId(jobCodeId)
      .then((all) => {
        if (scope === 'group' && groupId) {
          // groupId = group 값 (예: "서머") — 같은 캠프 + 같은 그룹인 유저 전체
          setMembers(
            all.filter((u) =>
              u.jobExperiences?.some(
                (je) => je.id === jobCodeId && je.group === groupId
              )
            )
          );
        } else {
          setMembers(all);
        }
      })
      .catch(() => {/* 실패 시 조용히 무시 */});
  }, [scope, jobCodeId, groupId]);

  const totalImageCount =
    existingImageUrls.length - removedImageUrls.length + newImageUris.length;

  const pickImages = useCallback(async () => {
    const remaining = MAX_IMAGES - totalImageCount;
    if (remaining <= 0) {
      Alert.alert('이미지 제한', `최대 ${MAX_IMAGES}장까지만 첨부할 수 있습니다.`);
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '사진 접근 권한이 필요합니다.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: remaining,
    });

    if (!result.canceled) {
      setNewImageUris((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
    }
  }, [totalImageCount]);

  const removeExistingImage = useCallback((url: string) => {
    setRemovedImageUrls((prev) => [...prev, url]);
  }, []);

  const removeNewImage = useCallback((uri: string) => {
    setNewImageUris((prev) => prev.filter((u) => u !== uri));
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      Alert.alert('내용 없음', '게시글 내용을 입력해주세요.');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && editPostId) {
        await updatePost(
          editPostId,
          { content: trimmed },
          newImageUris,
          removedImageUrls
        );
        navigation.goBack();
      } else {
          await createPost(
          {
            scope,
            jobCodeId,
            groupId,
            authorId,
            authorName,
            authorProfileImage,
            authorJobCodeLabel,
            authorIsAdmin,
            isAnonymous,
            content: trimmed,
          },
          newImageUris
        );
        navigation.goBack();
      }
    } catch {
      Alert.alert('오류', '게시글 저장에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }, [
    content,
    isEdit,
    isAnonymous,
    editPostId,
    scope,
    jobCodeId,
    groupId,
    authorJobCodeLabel,
    authorIsAdmin,
    newImageUris,
    removedImageUrls,
    navigation,
  ]);

  // 제목 라벨
  const scopeLabel = (() => {
    const base = SCOPE_LABELS[scope] ?? '게시판';
    if (scope === 'group' && groupLabel) return `${base} · ${groupLabel}`;
    if ((scope === 'camp' || scope === 'group') && authorJobCodeLabel)
      return `${authorJobCodeLabel} ${scope === 'group' && groupLabel ? groupLabel : base}`;
    return base;
  })();

  const displayedExisting = existingImageUrls.filter((u) => !removedImageUrls.includes(u));

  if (initialLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="취소"
          accessibilityRole="button"
        >
          <Text style={styles.cancelText}>취소</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{isEdit ? '게시글 수정' : '새 게시글'}</Text>
          <Text style={styles.headerScope}>{scopeLabel}</Text>
        </View>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting || content.trim().length === 0}
          accessibilityLabel="등록"
          accessibilityRole="button"
          style={[
            styles.submitButton,
            (submitting || content.trim().length === 0) && styles.submitButtonDisabled,
          ]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.submitText}>{isEdit ? '수정' : '등록'}</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 열람 범위 배너 */}
          {scope === 'dev' && (
            <View style={styles.audienceBanner}>
              <Ionicons name="lock-closed-outline" size={14} color="#64748b" />
              <Text style={styles.audienceBannerText}>나와 개발자만 볼 수 있습니다.</Text>
            </View>
          )}
          {(scope === 'camp' || scope === 'group') && members.length > 0 && (
            <AudienceBanner members={members} />
          )}

          {/* 텍스트 입력 */}
          <TextInput
            style={styles.textInput}
            placeholder="내용을 입력하세요..."
            placeholderTextColor="#94a3b8"
            multiline
            value={content}
            onChangeText={setContent}
            autoFocus={!isEdit}
            textAlignVertical="top"
            maxLength={5000}
          />

          {/* 이미지 미리보기 */}
          {(displayedExisting.length > 0 || newImageUris.length > 0) && (
            <View style={styles.imageGrid}>
              {displayedExisting.map((uri) => (
                <View key={uri} style={styles.imageThumbWrapper}>
                  <Image
                    source={{ uri }}
                    style={styles.imageThumb}
                    contentFit="cover"
                    transition={100}
                  />
                  <TouchableOpacity
                    style={styles.removeImageBtn}
                    onPress={() => removeExistingImage(uri)}
                    accessibilityLabel="이미지 삭제"
                    accessibilityRole="button"
                  >
                    <Ionicons name="close-circle" size={22} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
              {newImageUris.map((uri) => (
                <View key={uri} style={styles.imageThumbWrapper}>
                  <Image
                    source={{ uri }}
                    style={styles.imageThumb}
                    contentFit="cover"
                    transition={100}
                  />
                  <TouchableOpacity
                    style={styles.removeImageBtn}
                    onPress={() => removeNewImage(uri)}
                    accessibilityLabel="이미지 삭제"
                    accessibilityRole="button"
                  >
                    <Ionicons name="close-circle" size={22} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* 하단 툴바 */}
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={styles.toolbarBtn}
            onPress={pickImages}
            disabled={totalImageCount >= MAX_IMAGES}
            accessibilityLabel="이미지 첨부"
            accessibilityRole="button"
          >
            <Ionicons
              name="image-outline"
              size={24}
              color={totalImageCount >= MAX_IMAGES ? '#cbd5e1' : '#3b82f6'}
            />
          </TouchableOpacity>
          <Text style={styles.imageCount}>
            {totalImageCount}/{MAX_IMAGES}
          </Text>

          <View style={styles.toolbarSpacer} />

          {/* 익명 토글 */}
          <TouchableOpacity
            style={styles.anonymousRow}
            onPress={() => setIsAnonymous((v) => !v)}
            activeOpacity={0.7}
            accessibilityLabel={isAnonymous ? '익명 해제' : '익명으로 작성'}
            accessibilityRole="switch"
          >
            <Ionicons
              name={isAnonymous ? 'glasses' : 'glasses-outline'}
              size={18}
              color={isAnonymous ? '#3b82f6' : '#94a3b8'}
            />
            <Text style={[styles.anonymousLabel, isAnonymous && styles.anonymousLabelActive]}>
              익명
            </Text>
            <Switch
              value={isAnonymous}
              onValueChange={setIsAnonymous}
              trackColor={{ false: '#e2e8f0', true: '#93c5fd' }}
              thumbColor={isAnonymous ? '#3b82f6' : '#f1f5f9'}
              ios_backgroundColor="#e2e8f0"
              style={styles.anonymousSwitch}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── 열람 멤버 배너 컴포넌트 ──────────────────────────────────────────────────

function AvatarStack({ members }: { members: User[] }) {
  const visible = members.slice(0, MAX_VISIBLE_AVATARS);
  const extra = members.length - MAX_VISIBLE_AVATARS;
  return (
    <View style={audienceStyles.avatarStack}>
      {visible.map((m, i) => (
        <View
          key={m.userId ?? i}
          style={[audienceStyles.avatarWrap, { zIndex: MAX_VISIBLE_AVATARS - i, marginLeft: i === 0 ? 0 : -8 }]}
        >
          {m.profileImage ? (
            <Image source={{ uri: m.profileImage }} style={audienceStyles.avatar} contentFit="cover" />
          ) : (
            <View style={[audienceStyles.avatar, audienceStyles.avatarFallback]}>
              <Text style={audienceStyles.avatarText}>{(m.name ?? '?').slice(0, 1)}</Text>
            </View>
          )}
        </View>
      ))}
      {extra > 0 && (
        <View style={[audienceStyles.avatarWrap, audienceStyles.extraBadge, { zIndex: 0, marginLeft: -8 }]}>
          <Text style={audienceStyles.extraText}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

function AudienceBanner({ members }: { members: User[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={audienceStyles.wrapper}>
      {/* 헤더 행: 항상 표시 */}
      <TouchableOpacity
        style={audienceStyles.banner}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="열람 멤버 펼치기"
      >
        <Ionicons name="eye-outline" size={14} color="#64748b" />
        <AvatarStack members={members} />
        <Text style={audienceStyles.nameText}>
          {members.length}명이 볼 수 있습니다.
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color="#94a3b8"
        />
      </TouchableOpacity>

      {/* 펼쳐진 이름 목록 */}
      {expanded && (
        <View style={audienceStyles.memberList}>
          {members.map((m, i) => (
            <View key={m.userId ?? i} style={audienceStyles.memberRow}>
              {m.profileImage ? (
                <Image source={{ uri: m.profileImage }} style={audienceStyles.memberAvatar} contentFit="cover" />
              ) : (
                <View style={[audienceStyles.memberAvatar, audienceStyles.avatarFallback]}>
                  <Text style={audienceStyles.avatarText}>{(m.name ?? '?').slice(0, 1)}</Text>
                </View>
              )}
              <Text style={audienceStyles.memberName}>{m.name}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const audienceStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    marginBottom: 14,
    overflow: 'hidden',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    borderWidth: 1.5,
    borderColor: '#f1f5f9',
    borderRadius: AVATAR_SIZE / 2,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    backgroundColor: '#94a3b8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  extraBadge: {
    backgroundColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  extraText: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '700',
  },
  nameText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
  },
  // 펼쳐진 멤버 목록
  memberList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  memberAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  memberName: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '500',
  },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  cancelText: {
    fontSize: 15,
    color: '#64748b',
    minWidth: 40,
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  headerScope: {
    fontSize: 12,
    color: '#3b82f6',
    marginTop: 1,
  },
  submitButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 54,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  submitText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  // 본문
  scrollContent: {
    flexGrow: 1,
    padding: 16,
  },
  textInput: {
    fontSize: 15,
    color: '#1e293b',
    lineHeight: 24,
    minHeight: 200,
  },
  // 이미지 그리드
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  imageThumbWrapper: {
    position: 'relative',
  },
  imageThumb: {
    width: (SCREEN_WIDTH - 48) / 3,
    height: (SCREEN_WIDTH - 48) / 3,
    borderRadius: 8,
  },
  removeImageBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
  },
  // 하단 툴바
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    gap: 8,
  },
  toolbarBtn: {
    padding: 4,
  },
  imageCount: {
    fontSize: 13,
    color: '#94a3b8',
  },
  toolbarSpacer: {
    flex: 1,
  },
  anonymousRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  anonymousLabel: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },
  anonymousLabelActive: {
    color: '#3b82f6',
  },
  anonymousSwitch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
  // 개발자 건의 배너
  audienceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  audienceBannerText: {
    fontSize: 12,
    color: '#64748b',
  },
});
