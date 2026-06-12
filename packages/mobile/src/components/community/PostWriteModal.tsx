import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { CommunityPost, CommunityPostScope } from '@smis-mentor/shared';
import {
  createPost,
  updatePost,
} from '../../services/communityService';

const MAX_IMAGES = 10;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const THUMB_SIZE = (SCREEN_WIDTH - 32 - 12 * 3) / 4;

export interface PostWriteModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  scope: CommunityPostScope;
  jobCodeId: string | null;
  /** 그룹 게시판일 때 그룹 식별자 */
  groupId: string | null;
  /** 그룹 게시판일 때 UI에 표시할 그룹명 (예: "junior · 담임") */
  groupLabel?: string;
  authorId: string;
  authorName: string;
  authorProfileImage: string | null;
  /** 작성자의 활성 캠프코드 이름 (게시글에 저장되어 다른 유저에게 표시됨) */
  authorJobCodeLabel: string | null;
  /** 작성자가 admin인지 여부 */
  authorIsAdmin: boolean;
  /** 수정 모드일 때 기존 게시글 */
  editingPost?: CommunityPost;
}

interface LocalImage {
  uri: string;
  isNew: boolean; // true: 로컬 파일(업로드 필요), false: 기존 Storage URL
}

const SCOPE_LABELS: Record<CommunityPostScope, string> = {
  all: '전체 게시판',
  camp: '캠프 게시판',
  group: '그룹 게시판',
  dev: '개발자 건의',
};

export function PostWriteModal({
  visible,
  onClose,
  onSuccess,
  scope,
  jobCodeId,
  groupId,
  groupLabel,
  authorId,
  authorName,
  authorProfileImage,
  authorJobCodeLabel,
  authorIsAdmin,
  editingPost,
}: PostWriteModalProps) {
  const [content, setContent] = useState('');
  const [images, setImages] = useState<LocalImage[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const isEditing = !!editingPost;
  const scopeLabel = groupLabel && scope === 'group'
    ? `${SCOPE_LABELS.group} · ${groupLabel}`
    : SCOPE_LABELS[scope] ?? '게시판';

  // 수정 모드 초기값 세팅
  useEffect(() => {
    if (visible) {
      if (editingPost) {
        setContent(editingPost.content);
        setImages(editingPost.imageUrls.map((uri) => ({ uri, isNew: false })));
      } else {
        setContent('');
        setImages([]);
      }
    }
  }, [visible, editingPost]);

  const handlePickImages = useCallback(async () => {
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      Alert.alert('최대 이미지 수', `이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`);
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '사진 접근 권한이 필요합니다. 설정에서 허용해주세요.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });

    if (!result.canceled) {
      const newImages: LocalImage[] = result.assets.map((asset) => ({
        uri: asset.uri,
        isNew: true,
      }));
      setImages((prev) => [...prev, ...newImages].slice(0, MAX_IMAGES));
    }
  }, [images.length]);

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed && images.length === 0) {
      Alert.alert('내용 없음', '텍스트 또는 이미지를 입력해주세요.');
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    try {
      if (isEditing && editingPost) {
        const removedUrls = editingPost.imageUrls.filter(
          (url) => !images.some((img) => img.uri === url)
        );
        const newLocalUris = images.filter((img) => img.isNew).map((img) => img.uri);
        await updatePost(
          editingPost.id,
          { content: trimmed },
          newLocalUris,
          removedUrls
        );
      } else {
        const localUris = images.filter((img) => img.isNew).map((img) => img.uri);
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
            content: trimmed,
          },
          localUris
        );
      }
      onSuccess();
      onClose();
    } catch (e) {
      Alert.alert('오류', `게시글 ${isEditing ? '수정' : '등록'}에 실패했습니다.`);
    } finally {
      setSubmitting(false);
    }
  }, [
    content,
    images,
    submitting,
    isEditing,
    editingPost,
    scope,
    jobCodeId,
    authorId,
    authorName,
    authorProfileImage,
    onSuccess,
    onClose,
  ]);

  const canSubmit = (content.trim().length > 0 || images.length > 0) && !submitting;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            disabled={submitting}
          >
            <Text style={styles.cancelText}>취소</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>
              {isEditing ? '게시글 수정' : '게시글 작성'}
            </Text>
            <View style={styles.scopeBadge}>
              <Text style={styles.scopeBadgeText}>{scopeLabel}</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitText}>{isEditing ? '수정' : '게시'}</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.body}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.bodyContent}
        >
          {/* 텍스트 입력 */}
          <TextInput
            style={styles.textInput}
            value={content}
            onChangeText={setContent}
            placeholder={`${scopeLabel}에 글을 남겨보세요.`}
            placeholderTextColor="#94a3b8"
            multiline
            autoFocus={!isEditing}
            maxLength={2000}
          />

          {/* 글자 수 */}
          <Text style={styles.charCount}>{content.length} / 2000</Text>

          {/* 이미지 미리보기 그리드 */}
          {images.length > 0 && (
            <View style={styles.imageGrid}>
              {images.map((img, idx) => (
                <View key={idx} style={styles.thumbWrapper}>
                  <Image
                    source={{ uri: img.uri }}
                    style={styles.thumb}
                    contentFit="cover"
                    transition={100}
                  />
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => handleRemoveImage(idx)}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    accessibilityLabel={`이미지 ${idx + 1} 삭제`}
                  >
                    <Ionicons name="close-circle" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
              {images.length < MAX_IMAGES && (
                <TouchableOpacity
                  style={styles.addImageBtn}
                  onPress={handlePickImages}
                  accessibilityLabel="이미지 추가"
                  accessibilityRole="button"
                >
                  <Ionicons name="add" size={28} color="#94a3b8" />
                  <Text style={styles.addImageCount}>
                    {images.length}/{MAX_IMAGES}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>

        {/* 하단 툴바 */}
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={styles.toolbarBtn}
            onPress={handlePickImages}
            disabled={images.length >= MAX_IMAGES}
            accessibilityLabel="사진 추가"
            accessibilityRole="button"
          >
            <Ionicons
              name="image-outline"
              size={24}
              color={images.length >= MAX_IMAGES ? '#cbd5e1' : '#3b82f6'}
            />
            <Text
              style={[
                styles.toolbarBtnText,
                images.length >= MAX_IMAGES && styles.toolbarBtnTextDisabled,
              ]}
            >
              사진 ({images.length}/{MAX_IMAGES})
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
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
    fontSize: 16,
    color: '#64748b',
  },
  headerCenter: {
    alignItems: 'center',
    gap: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  scopeBadge: {
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  scopeBadgeText: {
    fontSize: 11,
    color: '#3b82f6',
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
    minWidth: 52,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#cbd5e1',
  },
  submitText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
  },
  textInput: {
    fontSize: 16,
    color: '#1e293b',
    lineHeight: 24,
    minHeight: 160,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'right',
    marginTop: 8,
    marginBottom: 12,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  thumbWrapper: {
    position: 'relative',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
  },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  addImageBtn: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  addImageCount: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
  },
  toolbar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    backgroundColor: '#ffffff',
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toolbarBtnText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '500',
  },
  toolbarBtnTextDisabled: {
    color: '#cbd5e1',
  },
});
