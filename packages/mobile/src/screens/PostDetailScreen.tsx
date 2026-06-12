import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CommunityPost, CommunityComment } from '@smis-mentor/shared';
import {
  getPostById,
  toggleLike,
  deletePost,
  getComments,
  createComment,
  updateComment,
  deleteComment,
} from '../services/communityService';
import { useAuth } from '../context/AuthContext';
import { RootStackScreenProps } from '../navigation/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface CommentWithReplies extends CommunityComment {
  replies: CommunityComment[];
  showReplies: boolean;
}

type ListItem =
  | { type: 'comment'; data: CommentWithReplies }
  | { type: 'commentEmpty' }
  | { type: 'commentLoading' };

// ─── 화면 ────────────────────────────────────────────────────────────────────

export function PostDetailScreen({ navigation, route }: RootStackScreenProps<'PostDetail'>) {
  const { postId } = route.params;
  const { userData } = useAuth();

  // 게시글
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [postLoading, setPostLoading] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeLoading, setLikeLoading] = useState(false);
  const [showPostMenu, setShowPostMenu] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 댓글
  const [comments, setComments] = useState<CommentWithReplies[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);

  // 입력창
  const [inputText, setInputText] = useState('');
  const [commentAnonymous, setCommentAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{ parentId: string; replyTo: string } | null>(null);
  const [editTarget, setEditTarget] = useState<{
    commentId: string;
    parentId: string | null;
    originalContent: string;
  } | null>(null);

  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList>(null);

  const currentUserId = userData?.userId ?? '';
  const isAdmin = userData?.role === 'admin';

  // ─── 데이터 로드 ────────────────────────────────────────────────────────────

  const loadPost = useCallback(async () => {
    try {
      const fetched = await getPostById(postId);
      if (!fetched) { Alert.alert('오류', '게시글을 찾을 수 없습니다.'); navigation.goBack(); return; }
      setPost(fetched);
      setIsLiked(fetched.likedBy.includes(currentUserId));
      setLikeCount(fetched.likeCount);
    } catch {
      Alert.alert('오류', '게시글을 불러오지 못했습니다.'); navigation.goBack();
    } finally {
      setPostLoading(false);
    }
  }, [postId, currentUserId, navigation]);

  const loadComments = useCallback(async () => {
    try {
      const all = await getComments(postId);
      const topLevel = all.filter((c) => c.parentId === null);
      setComments(topLevel.map((c) => ({
        ...c,
        replies: all.filter((r) => r.parentId === c.id),
        showReplies: false,
      })));
    } catch {
      // 댓글 로드 실패는 조용히 처리
    } finally {
      setCommentsLoading(false);
    }
  }, [postId]);

  useEffect(() => { loadPost(); }, [loadPost]);
  useEffect(() => { loadComments(); }, [loadComments]);

  // ─── 게시글 액션 ────────────────────────────────────────────────────────────

  const handleLike = useCallback(async () => {
    if (!post || likeLoading) return;
    setLikeLoading(true);
    const next = !isLiked;
    setIsLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    try { await toggleLike(post.id, currentUserId); }
    catch { setIsLiked(!next); setLikeCount((c) => c + (next ? -1 : 1)); }
    finally { setLikeLoading(false); }
  }, [post, isLiked, likeLoading, currentUserId]);

  const handlePostEdit = useCallback(() => {
    if (!post) return;
    setShowPostMenu(false);
    navigation.navigate('PostWrite', {
      scope: post.scope,
      jobCodeId: post.jobCodeId,
      groupId: post.groupId,
      groupLabel: null,
      authorId: post.authorId,
      authorName: post.authorName,
      authorProfileImage: post.authorProfileImage,
      authorJobCodeLabel: post.authorJobCodeLabel,
      authorIsAdmin: post.authorIsAdmin,
      editPostId: post.id,
    });
  }, [post, navigation]);

  const handlePostDelete = useCallback(() => {
    setShowPostMenu(false);
    Alert.alert('게시글 삭제', '이 게시글을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        try { await deletePost(postId); navigation.goBack(); }
        catch { Alert.alert('오류', '게시글 삭제에 실패했습니다.'); }
      }},
    ]);
  }, [postId, navigation]);

  // ─── 댓글 액션 ────────────────────────────────────────────────────────────

  const handleReply = useCallback((comment: CommentWithReplies) => {
    setReplyTarget({ parentId: comment.id, replyTo: comment.authorName });
    setEditTarget(null);
    setInputText('');
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleCommentEdit = useCallback((comment: CommunityComment, parentId: string | null) => {
    setEditTarget({ commentId: comment.id, parentId, originalContent: comment.content });
    setInputText(comment.content);
    setReplyTarget(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleCommentDelete = useCallback((comment: CommunityComment) => {
    Alert.alert('댓글 삭제', '이 댓글을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        try { await deleteComment(postId, comment.id); await loadComments(); }
        catch { Alert.alert('오류', '댓글 삭제에 실패했습니다.'); }
      }},
    ]);
  }, [postId, loadComments]);

  const toggleReplies = useCallback((commentId: string) => {
    setComments((prev) => prev.map((c) =>
      c.id === commentId ? { ...c, showReplies: !c.showReplies } : c
    ));
  }, []);

  const cancelInput = useCallback(() => {
    setReplyTarget(null); setEditTarget(null); setInputText(''); inputRef.current?.blur();
  }, []);

  const handleSubmit = useCallback(async () => {
    const text = inputText.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      if (editTarget) {
        await updateComment(postId, editTarget.commentId, text);
        setComments((prev) => prev.map((c) => {
          if (c.id === editTarget.commentId) return { ...c, content: text };
          return { ...c, replies: c.replies.map((r) => r.id === editTarget.commentId ? { ...r, content: text } : r) };
        }));
        setEditTarget(null);
      } else {
        await createComment(postId, {
          parentId: replyTarget?.parentId ?? null,
          authorId: currentUserId,
          authorName: userData?.name ?? '',
          authorProfileImage: userData?.profileImage ?? null,
          isAnonymous: commentAnonymous,
          content: text,
        });
        await loadComments();
        setReplyTarget(null);
        // 새 댓글 작성 후 목록 끝으로 스크롤
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 200);
      }
      setInputText('');
    } catch {
      Alert.alert('오류', '댓글 등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }, [inputText, submitting, commentAnonymous, editTarget, replyTarget, postId, currentUserId, userData, loadComments]);

  // ─── 렌더 ────────────────────────────────────────────────────────────────────

  const isAuthor = post?.authorId === currentUserId;
  const canManage = isAuthor || isAdmin;
  const isAdminAuthor = post?.authorIsAdmin ?? false;
  const postIsAnonymous = post?.isAnonymous ?? false;
  // 익명 게시글에서 본인 여부 확인용 (표시 이름에 "(나)" 붙이기)
  const isSelfAnonymousPost = postIsAnonymous && isAuthor;
  const formattedDate = useMemo(
    () => post ? formatRelativeTime(post.createdAt?.toDate?.() ?? new Date()) : '',
    [post]
  );
  // 익명이면 "익명", 본인 익명글이면 "익명 (나)"
  const displayAuthorName = postIsAnonymous
    ? (isSelfAnonymousPost ? '익명 (나)' : '익명')
    : (post?.authorName ?? '');
  const initials = postIsAnonymous ? '익' : (post?.authorName ?? '').slice(0, 2);

  // FlatList data: 댓글 목록 또는 빈 상태/로딩 플레이스홀더
  const listData = useMemo((): ListItem[] => {
    if (commentsLoading) return [{ type: 'commentLoading' }];
    if (comments.length === 0) return [{ type: 'commentEmpty' }];
    return comments.map((c) => ({ type: 'comment', data: c }));
  }, [comments, commentsLoading]);

  // 게시글 본문 (ListHeaderComponent)
  const PostHeader = useMemo(() => {
    if (!post) return null;
    return (
      <View style={styles.postSection}>
        {/* 작성자 */}
        <View style={styles.authorRow}>
          {/* 익명이면 기본 아바타, 본인 익명글이면 표시 */}
          {!postIsAnonymous && post.authorProfileImage ? (
            <Image source={{ uri: post.authorProfileImage }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatarPlaceholder, postIsAnonymous && styles.anonymousAvatar]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
          <View style={styles.authorInfo}>
            <View style={styles.authorNameRow}>
              <Text style={styles.authorName}>{displayAuthorName}</Text>
              {postIsAnonymous ? (
                <View style={styles.anonymousBadge}><Text style={styles.anonymousBadgeText}>익명</Text></View>
              ) : isAdminAuthor ? (
                <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>운영진</Text></View>
              ) : post.authorJobCodeLabel ? (
                <View style={styles.jobCodeBadge}><Text style={styles.jobCodeBadgeText}>{post.authorJobCodeLabel}</Text></View>
              ) : null}
            </View>
            <Text style={styles.dateText}>{formattedDate}</Text>
          </View>
        </View>

        {/* 본문 */}
        <Text style={styles.content}>{post.content}</Text>

        {/* 이미지 */}
        {post.imageUrls.length > 0 && (
          <View style={styles.imageGrid}>
            {post.imageUrls.map((uri, idx) => (
              <TouchableOpacity key={idx} onPress={() => setPreviewImage(uri)} accessibilityLabel={`이미지 ${idx + 1}`}>
                <Image
                  source={{ uri }}
                  style={[styles.gridImage, post.imageUrls.length === 1 && styles.gridImageSingle]}
                  contentFit="cover"
                  transition={150}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 좋아요 / 댓글 수 */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={20} color={isLiked ? '#ef4444' : '#64748b'} />
            <Text style={[styles.actionCount, isLiked && styles.likedCount]}>{likeCount}</Text>
          </TouchableOpacity>
          <View style={styles.actionButton}>
            <Ionicons name="chatbubble-outline" size={19} color="#64748b" />
            <Text style={styles.actionCount}>{post.commentCount}</Text>
          </View>
        </View>

        {/* 댓글 섹션 구분선 + 헤더 */}
        <View style={styles.commentHeader}>
          <Text style={styles.commentHeaderText}>댓글 {post.commentCount > 0 ? post.commentCount : ''}</Text>
        </View>
      </View>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post, isLiked, likeCount, isAdminAuthor, postIsAnonymous, isSelfAnonymousPost, displayAuthorName, formattedDate, initials]);

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'commentLoading') {
      return <View style={styles.commentLoadingWrap}><ActivityIndicator color="#3b82f6" /></View>;
    }
    if (item.type === 'commentEmpty') {
      return <View style={styles.emptyWrap}><Text style={styles.emptyText}>첫 번째 댓글을 남겨보세요.</Text></View>;
    }

    const comment = item.data;
    const isDeleted = !!comment.deletedAt;
    const isOwn = comment.authorId === currentUserId;
    const cAnon = comment.isAnonymous ?? false;
    const ci = cAnon ? '익' : comment.authorName.slice(0, 2);
    const cDisplayName = cAnon
      ? (isOwn ? '익명 (나)' : '익명')
      : comment.authorName;

    return (
      <View style={styles.commentBlock}>
        {/* 댓글 */}
        <View style={styles.commentRow}>
          {!cAnon && comment.authorProfileImage && !isDeleted ? (
            <Image source={{ uri: comment.authorProfileImage }} style={styles.commentAvatar} contentFit="cover" />
          ) : (
            <View style={[styles.commentAvatar, styles.commentAvatarPlaceholder, cAnon && !isDeleted && styles.anonymousCommentAvatar]}>
              {!isDeleted && <Text style={styles.commentAvatarText}>{ci}</Text>}
            </View>
          )}
          <View style={styles.commentBody}>
            {isDeleted ? (
              <Text style={styles.deletedText}>삭제된 댓글입니다.</Text>
            ) : (
              <>
                <Text style={styles.commentAuthor}>{cDisplayName}</Text>
                <Text style={styles.commentContent}>{comment.content}</Text>
                <View style={styles.commentMeta}>
                  <Text style={styles.commentDate}>{formatRelativeTime(comment.createdAt?.toDate?.() ?? new Date())}</Text>
                  <TouchableOpacity onPress={() => handleReply(comment)}>
                    <Text style={styles.metaAction}>답글</Text>
                  </TouchableOpacity>
                  {isOwn && (
                    <>
                      <TouchableOpacity onPress={() => handleCommentEdit(comment, null)}>
                        <Text style={styles.metaAction}>수정</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleCommentDelete(comment)}>
                        <Text style={[styles.metaAction, styles.metaDelete]}>삭제</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </>
            )}
          </View>
        </View>

        {/* 대댓글 토글 */}
        {comment.replies.length > 0 && (
          <TouchableOpacity style={styles.toggleReplies} onPress={() => toggleReplies(comment.id)}>
            <View style={styles.replyLine} />
            <Text style={styles.toggleRepliesText}>
              {comment.showReplies ? '답글 숨기기' : `답글 ${comment.replies.length}개 보기`}
            </Text>
          </TouchableOpacity>
        )}

        {/* 대댓글 */}
        {comment.showReplies && comment.replies.map((reply) => {
          const rd = !!reply.deletedAt;
          const ro = reply.authorId === currentUserId;
          const rAnon = reply.isAnonymous ?? false;
          const ri = rAnon ? '익' : reply.authorName.slice(0, 2);
          const rDisplayName = rAnon
            ? (ro ? '익명 (나)' : '익명')
            : reply.authorName;
          return (
            <View key={reply.id} style={[styles.commentRow, styles.replyRow]}>
              <View style={styles.replyIndentLine} />
              {!rAnon && reply.authorProfileImage && !rd ? (
                <Image source={{ uri: reply.authorProfileImage }} style={styles.commentAvatar} contentFit="cover" />
              ) : (
                <View style={[styles.commentAvatar, styles.commentAvatarPlaceholder, rAnon && !rd && styles.anonymousCommentAvatar]}>
                  {!rd && <Text style={styles.commentAvatarText}>{ri}</Text>}
                </View>
              )}
              <View style={styles.commentBody}>
                {rd ? (
                  <Text style={styles.deletedText}>삭제된 댓글입니다.</Text>
                ) : (
                  <>
                    <Text style={styles.commentAuthor}>{rDisplayName}</Text>
                    <Text style={styles.commentContent}>{reply.content}</Text>
                    <View style={styles.commentMeta}>
                      <Text style={styles.commentDate}>{formatRelativeTime(reply.createdAt?.toDate?.() ?? new Date())}</Text>
                      {ro && (
                        <>
                          <TouchableOpacity onPress={() => handleCommentEdit(reply, comment.id)}>
                            <Text style={styles.metaAction}>수정</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleCommentDelete(reply)}>
                            <Text style={[styles.metaAction, styles.metaDelete]}>삭제</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </>
                )}
              </View>
            </View>
          );
        })}
      </View>
    );
  }, [currentUserId, handleReply, handleCommentEdit, handleCommentDelete, toggleReplies]);

  // ─── 로딩 / 에러 ────────────────────────────────────────────────────────────

  if (postLoading || !post) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="뒤로가기" accessibilityRole="button">
            <Ionicons name="chevron-back" size={24} color="#1e293b" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>게시글</Text>
          {canManage ? (
            <TouchableOpacity onPress={() => setShowPostMenu(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="게시글 메뉴" accessibilityRole="button">
              <Ionicons name="ellipsis-horizontal" size={22} color="#64748b" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>

        {/* 통합 스크롤: 게시글 본문(header) + 댓글(data) */}
        <FlatList
          ref={listRef}
          data={listData}
          keyExtractor={(item, idx) => item.type === 'comment' ? item.data.id : `${item.type}-${idx}`}
          renderItem={renderItem}
          ListHeaderComponent={PostHeader}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />

        {/* 하단 고정 입력창 */}
        <View style={styles.inputWrapper}>
          {(replyTarget || editTarget) && (
            <View style={styles.inputContext}>
              <Text style={styles.inputContextText}>
                {editTarget ? '댓글 수정 중' : `@${replyTarget!.replyTo}에게 답글`}
              </Text>
              <TouchableOpacity onPress={cancelInput} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={16} color="#64748b" />
              </TouchableOpacity>
            </View>
          )}
          {/* 익명 토글 (수정 중에는 숨김) */}
          {!editTarget && (
            <TouchableOpacity
              style={styles.commentAnonymousRow}
              onPress={() => setCommentAnonymous((v) => !v)}
              activeOpacity={0.7}
              accessibilityLabel={commentAnonymous ? '익명 해제' : '익명으로 댓글 작성'}
              accessibilityRole="switch"
            >
              <Ionicons
                name={commentAnonymous ? 'glasses' : 'glasses-outline'}
                size={16}
                color={commentAnonymous ? '#3b82f6' : '#94a3b8'}
              />
              <Text style={[styles.commentAnonymousLabel, commentAnonymous && styles.commentAnonymousLabelActive]}>
                익명
              </Text>
              <Switch
                value={commentAnonymous}
                onValueChange={setCommentAnonymous}
                trackColor={{ false: '#e2e8f0', true: '#93c5fd' }}
                thumbColor={commentAnonymous ? '#3b82f6' : '#f1f5f9'}
                ios_backgroundColor="#e2e8f0"
                style={styles.commentAnonymousSwitch}
              />
            </TouchableOpacity>
          )}
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="댓글을 입력하세요..."
              placeholderTextColor="#94a3b8"
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.submitButton, (!inputText.trim() || submitting) && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={!inputText.trim() || submitting}
              accessibilityLabel={editTarget ? '수정 완료' : '댓글 등록'}
              accessibilityRole="button"
            >
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* 게시글 더보기 메뉴 */}
      <Modal visible={showPostMenu} transparent animationType="fade" onRequestClose={() => setShowPostMenu(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowPostMenu(false)}>
          <View style={styles.menuSheet}>
            {isAuthor && (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={handlePostEdit}>
                  <Ionicons name="pencil-outline" size={18} color="#1e293b" />
                  <Text style={styles.menuItemText}>수정</Text>
                </TouchableOpacity>
                <View style={styles.menuDivider} />
              </>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={handlePostDelete}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
              <Text style={[styles.menuItemText, { color: '#ef4444' }]}>삭제</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 이미지 전체화면 */}
      {previewImage && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
          <TouchableOpacity style={styles.previewOverlay} activeOpacity={1} onPress={() => setPreviewImage(null)}>
            <Image source={{ uri: previewImage }} style={styles.previewImage} contentFit="contain" />
          </TouchableOpacity>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  // 헤더
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1e293b' },
  // 리스트
  listContent: { paddingBottom: 12 },
  // 게시글 영역
  postSection: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0',
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarPlaceholder: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  authorInfo: { marginLeft: 11, flex: 1 },
  authorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  authorName: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  adminBadge: { backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  adminBadgeText: { fontSize: 11, color: '#d97706', fontWeight: '700' },
  jobCodeBadge: { backgroundColor: '#eff6ff', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  jobCodeBadgeText: { fontSize: 11, color: '#3b82f6', fontWeight: '500' },
  anonymousBadge: { backgroundColor: '#f1f5f9', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  anonymousBadgeText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  anonymousAvatar: { backgroundColor: '#94a3b8' },
  anonymousCommentAvatar: { backgroundColor: '#94a3b8' },
  dateText: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  content: { fontSize: 15, color: '#334155', lineHeight: 24, marginBottom: 12 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  gridImage: { width: (SCREEN_WIDTH - 32 - 6) / 2, height: (SCREEN_WIDTH - 32 - 6) / 2, borderRadius: 10 },
  gridImageSingle: { width: SCREEN_WIDTH - 32, height: 220 },
  actions: { flexDirection: 'row', gap: 16, paddingVertical: 8 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionCount: { fontSize: 14, color: '#64748b' },
  likedCount: { color: '#ef4444' },
  commentHeader: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0',
    paddingTop: 12, marginTop: 4,
  },
  commentHeaderText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  // 댓글 아이템
  commentBlock: { backgroundColor: '#ffffff', paddingHorizontal: 16, paddingVertical: 4 },
  commentRow: { flexDirection: 'row', paddingVertical: 8 },
  replyRow: { paddingLeft: 8, alignItems: 'flex-start' },
  replyIndentLine: { width: 2, backgroundColor: '#e2e8f0', borderRadius: 1, marginRight: 8, marginTop: 4, marginBottom: 4 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 10, marginTop: 2 },
  commentAvatarPlaceholder: { backgroundColor: '#94a3b8', justifyContent: 'center', alignItems: 'center' },
  commentAvatarText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  commentBody: { flex: 1 },
  commentAuthor: { fontSize: 13, fontWeight: '600', color: '#1e293b', marginBottom: 2 },
  commentContent: { fontSize: 14, color: '#334155', lineHeight: 20 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  commentDate: { fontSize: 11, color: '#94a3b8' },
  metaAction: { fontSize: 12, color: '#3b82f6', fontWeight: '500' },
  metaDelete: { color: '#ef4444' },
  deletedText: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic' },
  toggleReplies: { flexDirection: 'row', alignItems: 'center', paddingLeft: 42, paddingVertical: 4, gap: 8 },
  replyLine: { width: 20, height: 1, backgroundColor: '#cbd5e1' },
  toggleRepliesText: { fontSize: 12, color: '#3b82f6', fontWeight: '500' },
  // 빈 상태 / 로딩
  commentLoadingWrap: { paddingVertical: 24, alignItems: 'center', backgroundColor: '#ffffff' },
  emptyWrap: { paddingVertical: 24, alignItems: 'center', backgroundColor: '#ffffff' },
  emptyText: { fontSize: 14, color: '#94a3b8' },
  // 입력창
  inputWrapper: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8,
  },
  inputContext: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 6 },
  inputContextText: { fontSize: 12, color: '#3b82f6', fontWeight: '500' },
  commentAnonymousRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 4, paddingBottom: 4,
  },
  commentAnonymousLabel: { fontSize: 12, color: '#94a3b8', fontWeight: '500' },
  commentAnonymousLabelActive: { color: '#3b82f6' },
  commentAnonymousSwitch: { transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  textInput: {
    flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: '#1e293b',
    maxHeight: 100, backgroundColor: '#f8fafc',
  },
  submitButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  submitDisabled: { backgroundColor: '#cbd5e1' },
  // 메뉴
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  menuSheet: { backgroundColor: '#ffffff', borderRadius: 14, width: SCREEN_WIDTH * 0.7, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  menuItemText: { fontSize: 15, color: '#1e293b' },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e2e8f0' },
  // 이미지 프리뷰
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  previewImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH },
});
