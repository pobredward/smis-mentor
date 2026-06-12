import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { CommunityComment } from '@smis-mentor/shared';
import {
  getComments,
  createComment,
  updateComment,
  deleteComment,
} from '../../services/communityService';

interface CommentSectionProps {
  postId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserProfileImage: string | null;
}

interface CommentWithReplies extends CommunityComment {
  replies: CommunityComment[];
  showReplies: boolean;
}

export function CommentSection({
  postId,
  currentUserId,
  currentUserName,
  currentUserProfileImage,
}: CommentSectionProps) {
  const [comments, setComments] = useState<CommentWithReplies[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  /** 대댓글 작성 대상: { parentId, replyTo(이름) } */
  const [replyTarget, setReplyTarget] = useState<{
    parentId: string;
    replyTo: string;
  } | null>(null);
  /** 수정 대상: { commentId, parentId|null, originalContent } */
  const [editTarget, setEditTarget] = useState<{
    commentId: string;
    parentId: string | null;
    originalContent: string;
  } | null>(null);

  const inputRef = useRef<TextInput>(null);

  const loadComments = useCallback(async () => {
    try {
      const all = await getComments(postId);
      const tree = buildCommentTree(all);
      setComments(tree);
    } catch {
      Alert.alert('오류', '댓글을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  /** flat 댓글 목록 → 트리(1댓글+대댓글) 구조 변환 */
  function buildCommentTree(all: CommunityComment[]): CommentWithReplies[] {
    const topLevel = all.filter((c) => c.parentId === null);
    return topLevel.map((c) => ({
      ...c,
      replies: all.filter((r) => r.parentId === c.id),
      showReplies: false,
    }));
  }

  const handleSubmit = useCallback(async () => {
    const text = inputText.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    try {
      if (editTarget) {
        // 수정 모드
        await updateComment(postId, editTarget.commentId, text);
        setComments((prev) =>
          prev.map((c) => {
            if (c.id === editTarget.commentId) {
              return { ...c, content: text };
            }
            return {
              ...c,
              replies: c.replies.map((r) =>
                r.id === editTarget.commentId ? { ...r, content: text } : r
              ),
            };
          })
        );
        setEditTarget(null);
      } else {
        // 신규 댓글 or 대댓글
        const parentId = replyTarget?.parentId ?? null;
        await createComment(postId, {
          parentId,
          authorId: currentUserId,
          authorName: currentUserName,
          authorProfileImage: currentUserProfileImage,
          content: text,
        });
        await loadComments();
        setReplyTarget(null);
      }
      setInputText('');
    } catch {
      Alert.alert('오류', '댓글 등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }, [
    inputText,
    submitting,
    editTarget,
    replyTarget,
    postId,
    currentUserId,
    currentUserName,
    currentUserProfileImage,
    loadComments,
  ]);

  const handleEdit = useCallback(
    (comment: CommunityComment, parentId: string | null) => {
      setEditTarget({ commentId: comment.id, parentId, originalContent: comment.content });
      setInputText(comment.content);
      setReplyTarget(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    []
  );

  const handleDelete = useCallback(
    (comment: CommunityComment) => {
      Alert.alert('댓글 삭제', '이 댓글을 삭제하시겠습니까?', [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteComment(postId, comment.id);
              await loadComments();
            } catch {
              Alert.alert('오류', '댓글 삭제에 실패했습니다.');
            }
          },
        },
      ]);
    },
    [postId, loadComments]
  );

  const handleReply = useCallback((comment: CommentWithReplies) => {
    setReplyTarget({ parentId: comment.id, replyTo: comment.authorName });
    setEditTarget(null);
    setInputText('');
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const toggleReplies = useCallback((commentId: string) => {
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId ? { ...c, showReplies: !c.showReplies } : c
      )
    );
  }, []);

  const cancelInput = useCallback(() => {
    setReplyTarget(null);
    setEditTarget(null);
    setInputText('');
    inputRef.current?.blur();
  }, []);

  const renderComment = useCallback(
    (comment: CommentWithReplies) => {
      const isDeleted = !!comment.deletedAt;
      const isOwn = comment.authorId === currentUserId;
      const initials = comment.authorName.slice(0, 2);

      return (
        <View key={comment.id} style={styles.commentBlock}>
          {/* 1댓글 */}
          <View style={styles.commentRow}>
            {comment.authorProfileImage && !isDeleted ? (
              <Image
                source={{ uri: comment.authorProfileImage }}
                style={styles.commentAvatar}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.commentAvatar, styles.commentAvatarPlaceholder]}>
                {!isDeleted && (
                  <Text style={styles.commentAvatarText}>{initials}</Text>
                )}
              </View>
            )}
            <View style={styles.commentBody}>
              {isDeleted ? (
                <Text style={styles.deletedText}>삭제된 댓글입니다.</Text>
              ) : (
                <>
                  <Text style={styles.commentAuthor}>{comment.authorName}</Text>
                  <Text style={styles.commentContent}>{comment.content}</Text>
                  <View style={styles.commentMeta}>
                    <Text style={styles.commentDate}>
                      {formatRelativeTime(comment.createdAt?.toDate?.() ?? new Date())}
                    </Text>
                    <TouchableOpacity onPress={() => handleReply(comment)}>
                      <Text style={styles.metaAction}>답글</Text>
                    </TouchableOpacity>
                    {isOwn && (
                      <>
                        <TouchableOpacity onPress={() => handleEdit(comment, null)}>
                          <Text style={styles.metaAction}>수정</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDelete(comment)}>
                          <Text style={[styles.metaAction, styles.metaDelete]}>삭제</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </>
              )}
            </View>
          </View>

          {/* 대댓글 펼치기 토글 */}
          {comment.replies.length > 0 && (
            <TouchableOpacity
              style={styles.toggleReplies}
              onPress={() => toggleReplies(comment.id)}
            >
              <View style={styles.replyLine} />
              <Text style={styles.toggleRepliesText}>
                {comment.showReplies
                  ? '답글 숨기기'
                  : `답글 ${comment.replies.length}개 보기`}
              </Text>
            </TouchableOpacity>
          )}

          {/* 대댓글 목록 */}
          {comment.showReplies &&
            comment.replies.map((reply) => {
              const replyDeleted = !!reply.deletedAt;
              const replyOwn = reply.authorId === currentUserId;
              const replyInitials = reply.authorName.slice(0, 2);
              return (
                <View
                  key={reply.id}
                  style={[styles.commentRow, styles.replyRow]}
                >
                  <View style={styles.replyIndentLine} />
                  {reply.authorProfileImage && !replyDeleted ? (
                    <Image
                      source={{ uri: reply.authorProfileImage }}
                      style={styles.commentAvatar}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.commentAvatar, styles.commentAvatarPlaceholder]}>
                      {!replyDeleted && (
                        <Text style={styles.commentAvatarText}>{replyInitials}</Text>
                      )}
                    </View>
                  )}
                  <View style={styles.commentBody}>
                    {replyDeleted ? (
                      <Text style={styles.deletedText}>삭제된 댓글입니다.</Text>
                    ) : (
                      <>
                        <Text style={styles.commentAuthor}>{reply.authorName}</Text>
                        <Text style={styles.commentContent}>{reply.content}</Text>
                        <View style={styles.commentMeta}>
                          <Text style={styles.commentDate}>
                            {formatRelativeTime(reply.createdAt?.toDate?.() ?? new Date())}
                          </Text>
                          {replyOwn && (
                            <>
                              <TouchableOpacity onPress={() => handleEdit(reply, comment.id)}>
                                <Text style={styles.metaAction}>수정</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => handleDelete(reply)}>
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
    },
    [currentUserId, handleEdit, handleDelete, handleReply, toggleReplies]
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 댓글 목록 */}
      <FlatList
        data={comments}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => renderComment(item)}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>첫 번째 댓글을 남겨보세요.</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />

      {/* 입력창 */}
      <View style={styles.inputWrapper}>
        {(replyTarget || editTarget) && (
          <View style={styles.inputContext}>
            <Text style={styles.inputContextText}>
              {editTarget
                ? '댓글 수정 중'
                : `@${replyTarget!.replyTo}에게 답글`}
            </Text>
            <TouchableOpacity onPress={cancelInput} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={16} color="#64748b" />
            </TouchableOpacity>
          </View>
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
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={16} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
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
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  listContent: {
    paddingVertical: 8,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  // 댓글 블록
  commentBlock: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  commentRow: {
    flexDirection: 'row',
    paddingVertical: 8,
  },
  replyRow: {
    paddingLeft: 8,
    alignItems: 'flex-start',
  },
  replyIndentLine: {
    width: 2,
    backgroundColor: '#e2e8f0',
    borderRadius: 1,
    marginRight: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
    marginTop: 2,
  },
  commentAvatarPlaceholder: {
    backgroundColor: '#94a3b8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentAvatarText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  commentBody: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  commentContent: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  commentDate: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 3,
  },
  metaAction: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '500',
  },
  metaDelete: {
    color: '#ef4444',
  },
  deletedText: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  // 대댓글 토글
  toggleReplies: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 42,
    paddingVertical: 4,
    gap: 8,
  },
  replyLine: {
    width: 20,
    height: 1,
    backgroundColor: '#cbd5e1',
  },
  toggleRepliesText: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '500',
  },
  // 입력창
  inputWrapper: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputContext: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  inputContextText: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1e293b',
    maxHeight: 100,
    backgroundColor: '#f8fafc',
  },
  submitButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitDisabled: {
    backgroundColor: '#cbd5e1',
  },
});
