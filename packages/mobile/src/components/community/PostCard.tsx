import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Alert,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { CommunityPost } from '@smis-mentor/shared';
import { toggleLike, deletePost } from '../../services/communityService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// 썸네일: 3장까지 가로로 나열, 이후는 +N 표시
const THUMB = (SCREEN_WIDTH - 32 - 8) / 3;

interface PostCardProps {
  post: CommunityPost;
  currentUserId: string;
  isCurrentUserAdmin?: boolean;
  onPress: (post: CommunityPost) => void;
  onEdit: (post: CommunityPost) => void;
  onDeleted: (postId: string) => void;
}

const MAX_CONTENT_LINES = 3;

export function PostCard({
  post,
  currentUserId,
  isCurrentUserAdmin = false,
  onPress,
  onEdit,
  onDeleted,
}: PostCardProps) {
  const [isLiked, setIsLiked] = useState(post.likedBy.includes(currentUserId));
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [likeLoading, setLikeLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const isAuthor = post.authorId === currentUserId;
  const canManage = isAuthor || isCurrentUserAdmin;
  const isAdminAuthor = post.authorIsAdmin;
  const isAnonymous = post.isAnonymous ?? false;
  const displayAuthorName = isAnonymous
    ? (isAuthor ? '익명 (나)' : '익명')
    : post.authorName;
  const initials = isAnonymous ? '익' : post.authorName.slice(0, 2);

  const handleLike = useCallback(async () => {
    if (likeLoading) return;
    setLikeLoading(true);
    const next = !isLiked;
    setIsLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    try {
      await toggleLike(post.id, currentUserId);
    } catch {
      setIsLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
    } finally {
      setLikeLoading(false);
    }
  }, [isLiked, likeLoading, post.id, currentUserId]);

  const handleDelete = useCallback(() => {
    setShowMenu(false);
    Alert.alert('게시글 삭제', '이 게시글을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(post.id);
            onDeleted(post.id);
          } catch {
            Alert.alert('오류', '게시글 삭제에 실패했습니다.');
          }
        },
      },
    ]);
  }, [post.id, onDeleted]);

  const handleEdit = useCallback(() => {
    setShowMenu(false);
    onEdit(post);
  }, [post, onEdit]);

  const formattedDate = formatRelativeTime(post.createdAt?.toDate?.() ?? new Date());

  // 이미지: 최대 3장 표시, 나머지는 +N 뱃지
  const visibleImages = post.imageUrls.slice(0, 3);
  const extraCount = post.imageUrls.length - 3;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => onPress(post)}
      accessibilityLabel="게시글 보기"
      accessibilityRole="button"
    >
      {/* 작성자 행 */}
      <View style={styles.header}>
        <View style={styles.authorRow}>
          {!isAnonymous && post.authorProfileImage ? (
            <Image source={{ uri: post.authorProfileImage }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatarPlaceholder, isAnonymous && styles.avatarAnonymous]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
          <View style={styles.authorInfo}>
            <View style={styles.authorNameRow}>
              <Text style={styles.authorName} numberOfLines={1}>{displayAuthorName}</Text>
              {isAnonymous ? (
                <View style={styles.anonymousBadge}>
                  <Text style={styles.anonymousBadgeText}>익명</Text>
                </View>
              ) : isAdminAuthor ? (
                <View style={styles.adminBadge}>
                  <Text style={styles.adminBadgeText}>운영진</Text>
                </View>
              ) : post.authorJobCodeLabel ? (
                <View style={styles.jobCodeBadge}>
                  <Text style={styles.jobCodeBadgeText}>{post.authorJobCodeLabel}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.dateText}>{formattedDate}</Text>
          </View>
        </View>

        {canManage && (
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation?.(); setShowMenu(true); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="게시글 메뉴"
            accessibilityRole="button"
          >
            <Ionicons name="ellipsis-horizontal" size={18} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>

      {/* 본문 — 3줄로 자르고, 더 보려면 카드 터치로 세부 페이지 진입 */}
      <Text style={styles.content} numberOfLines={MAX_CONTENT_LINES}>
        {post.content}
      </Text>

      {/* 이미지 썸네일 (최대 3장) */}
      {visibleImages.length > 0 && (
        <View style={styles.imageRow}>
          {visibleImages.map((uri, idx) => (
            <View key={idx} style={styles.thumbWrapper}>
              <Image source={{ uri }} style={styles.thumb} contentFit="cover" transition={100} />
              {/* 마지막 썸네일에 +N 오버레이 */}
              {idx === 2 && extraCount > 0 && (
                <View style={styles.extraOverlay}>
                  <Text style={styles.extraText}>+{extraCount}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* 액션 바 */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={(e) => { e.stopPropagation?.(); handleLike(); }}
          accessibilityLabel={isLiked ? '좋아요 취소' : '좋아요'}
          accessibilityRole="button"
        >
          <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={16} color={isLiked ? '#ef4444' : '#94a3b8'} />
          <Text style={[styles.actionCount, isLiked && styles.likedCount]}>{likeCount}</Text>
        </TouchableOpacity>

        <View style={styles.actionBtn}>
          <Ionicons name="chatbubble-outline" size={15} color="#94a3b8" />
          <Text style={styles.actionCount}>{post.commentCount}</Text>
        </View>
      </View>

      {/* 더보기 메뉴 */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <View style={styles.menuSheet}>
            {isAuthor && (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={handleEdit}>
                  <Ionicons name="pencil-outline" size={17} color="#1e293b" />
                  <Text style={styles.menuItemText}>수정</Text>
                </TouchableOpacity>
                <View style={styles.menuDivider} />
              </>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={17} color="#ef4444" />
              <Text style={[styles.menuItemText, { color: '#ef4444' }]}>삭제</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </TouchableOpacity>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffSec < 60) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  authorInfo: {
    marginLeft: 9,
    flex: 1,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  authorName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  avatarAnonymous: {
    backgroundColor: '#94a3b8',
  },
  anonymousBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  anonymousBadgeText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
  },
  adminBadge: {
    backgroundColor: '#fef3c7',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  adminBadgeText: {
    fontSize: 10,
    color: '#d97706',
    fontWeight: '700',
  },
  jobCodeBadge: {
    backgroundColor: '#eff6ff',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  jobCodeBadgeText: {
    fontSize: 10,
    color: '#3b82f6',
    fontWeight: '500',
  },
  dateText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  // 본문
  content: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
    marginBottom: 8,
  },
  // 이미지
  imageRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
  },
  thumbWrapper: {
    position: 'relative',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 7,
  },
  extraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  extraText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // 액션
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionCount: {
    fontSize: 12,
    color: '#94a3b8',
  },
  likedCount: {
    color: '#ef4444',
  },
  // 메뉴
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuSheet: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    width: SCREEN_WIDTH * 0.65,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    gap: 11,
  },
  menuItemText: {
    fontSize: 15,
    color: '#1e293b',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e2e8f0',
  },
});
