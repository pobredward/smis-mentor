import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { HTMLRenderer } from '../components/HTMLRenderer';
import {
  getApplicationsByUserId,
  getJobBoardById,
  cancelApplication,
  getAllReviews,
  deleteReview,
  addReview,
  updateReview,
  ApplicationWithJobDetails,
  ReviewWithId,
} from '../services/recruitmentService';

export function ApplicationStatusScreen() {
  const { userData, loading: authLoading } = useAuth();
  const [applications, setApplications] = useState<ApplicationWithJobDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);

  const loadApplications = useCallback(async () => {
    if (!userData?.userId) {
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    try {
      const userApplications = await getApplicationsByUserId(userData.userId);

      const applicationsWithJobDetails = await Promise.all(
        userApplications.map(async (app) => {
          try {
            const jobBoard = await getJobBoardById(app.refJobBoardId);
            return {
              ...app,
              jobBoard,
            } as ApplicationWithJobDetails;
          } catch (error) {
            logger.error(`공고 정보 로드 오류 (${app.refJobBoardId}):`, error);
            return app as ApplicationWithJobDetails;
          }
        })
      );

      setApplications(applicationsWithJobDetails);
    } catch (error) {
      logger.error('지원 내역 로드 오류:', error);
      Alert.alert('오류', '지원 내역을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [userData?.userId]);

  useEffect(() => {
    if (!authLoading) {
      loadApplications();
    }
  }, [loadApplications, authLoading]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadApplications();
  };

  const formatDate = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const dayOfWeek = days[date.getDay()];
    return `${year}.${month}.${day}(${dayOfWeek}) ${hours}:${minutes}`;
  };

  const getStatusBadge = (
    status: string | undefined,
    type: 'application' | 'interview' | 'final'
  ) => {
    let badgeStyle: any = styles.badgeGray;
    let label = '';

    if (type === 'application') {
      switch (status) {
        case 'pending':
          badgeStyle = styles.badgeYellow;
          label = '검토중';
          break;
        case 'accepted':
          badgeStyle = styles.badgeGreen;
          label = '서류합격';
          break;
        case 'rejected':
          badgeStyle = styles.badgeRed;
          label = '서류불합격';
          break;
        default:
          badgeStyle = styles.badgeGray;
          label = '미정';
      }
    } else if (type === 'interview') {
      switch (status) {
        case 'pending':
          badgeStyle = styles.badgeYellow;
          label = '면접예정';
          break;
        case 'complete':
          badgeStyle = styles.badgePurple;
          label = '면접완료';
          break;
        case 'passed':
          badgeStyle = styles.badgeGreen;
          label = '면접합격';
          break;
        case 'failed':
          badgeStyle = styles.badgeRed;
          label = '면접불합격';
          break;
        case 'absent':
          badgeStyle = styles.badgeRed;
          label = '불참';
          break;
        default:
          badgeStyle = styles.badgeGray;
          label = '미정';
      }
    } else if (type === 'final') {
      switch (status) {
        case 'finalAccepted':
          badgeStyle = styles.badgeGreen;
          label = '최종합격';
          break;
        case 'finalRejected':
          badgeStyle = styles.badgeRed;
          label = '최종불합격';
          break;
        case 'finalAbsent':
          badgeStyle = styles.badgeRed;
          label = '불참';
          break;
        default:
          badgeStyle = styles.badgeGray;
          label = '미정';
      }
    }

    return (
      <View style={[styles.badge, badgeStyle]}>
        <Text style={styles.badgeText}>{label}</Text>
      </View>
    );
  };

  const handleCancelClick = (applicationId: string) => {
    Alert.alert(
      '지원 취소',
      '정말로 이 지원을 취소하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      [
        { text: '아니오', style: 'cancel' },
        {
          text: '예, 취소합니다',
          style: 'destructive',
          onPress: () => handleCancelConfirm(applicationId),
        },
      ]
    );
  };

  const handleCancelConfirm = async (applicationId: string) => {
    try {
      await cancelApplication(applicationId);
      setApplications((prev) =>
        prev.filter((app) => app.applicationHistoryId !== applicationId)
      );
      Alert.alert('완료', '지원이 취소되었습니다.');
    } catch (error) {
      logger.error('지원 취소 오류:', error);
      Alert.alert('오류', '지원 취소 중 오류가 발생했습니다.');
    }
  };

  const openInterviewLink = (link: string) => {
    Linking.openURL(link).catch(() => {
      Alert.alert('오류', '링크를 열 수 없습니다.');
    });
  };

  const renderApplication = ({ item }: { item: ApplicationWithJobDetails }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.jobBoard?.title || '삭제된 공고'}
        </Text>
        <Text style={styles.cardSubtitle}>{item.jobBoard?.generation}</Text>
      </View>

      {item.applicationStatus === 'accepted' &&
        item.interviewStatus === 'pending' &&
        item.jobBoard && (
          <View style={styles.interviewSection}>
            <Text style={styles.interviewTitle}>면접 정보</Text>

            {item.interviewDate && (
              <View style={styles.interviewRow}>
                <Text style={styles.interviewLabel}>면접 일시:</Text>
                <Text style={styles.interviewValue}>{formatDate(item.interviewDate)}</Text>
              </View>
            )}

            {item.jobBoard.interviewBaseDuration && (
              <View style={styles.interviewRow}>
                <Text style={styles.interviewLabel}>예상 소요 시간:</Text>
                <Text style={styles.interviewValue}>
                  {item.jobBoard.interviewBaseDuration}분
                </Text>
              </View>
            )}

            {item.jobBoard.interviewBaseLink && (
              <TouchableOpacity
                style={styles.interviewButton}
                onPress={() => openInterviewLink(item.jobBoard!.interviewBaseLink)}
              >
                <Text style={styles.interviewButtonText}>면접 참여하기</Text>
              </TouchableOpacity>
            )}

            {item.jobBoard.interviewBaseNotes && (
              <View style={styles.interviewNotes}>
                <Text style={styles.interviewNotesText}>
                  {item.jobBoard.interviewBaseNotes}
                </Text>
              </View>
            )}
          </View>
        )}

      <View style={styles.statusSection}>
        <View style={styles.statusColumn}>
          <Text style={styles.statusLabel}>서류</Text>
          {getStatusBadge(item.applicationStatus, 'application')}
        </View>
        <View style={styles.statusColumn}>
          <Text style={styles.statusLabel}>면접</Text>
          {getStatusBadge(item.interviewStatus, 'interview')}
        </View>
        <View style={styles.statusColumn}>
          <Text style={styles.statusLabel}>최종</Text>
          {getStatusBadge(item.finalStatus, 'final')}
        </View>
      </View>

      {item.applicationStatus === 'pending' && (
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => handleCancelClick(item.applicationHistoryId)}
        >
          <Text style={styles.cancelButtonText}>지원 취소</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (authLoading || isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (!userData) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>로그인이 필요합니다.</Text>
      </View>
    );
  }

  if (applications.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>지원 내역이 없습니다.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={applications}
        renderItem={renderApplication}
        keyExtractor={(item) => item.applicationHistoryId}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      />
    </View>
  );
}

// 후기 작성/수정 모달 컴포넌트
interface ReviewFormModalProps {
  review: ReviewWithId | null;
  onClose: () => void;
}

// HTML을 일반 텍스트로 변환하는 함수
const htmlToPlainText = (html: string): string => {
  return html
    .replace(/<p><br><\/p>/g, '\n')  // 빈 줄
    .replace(/<p>/g, '')              // 시작 태그 제거
    .replace(/<\/p>/g, '\n')          // 끝 태그를 줄바꿈으로
    .replace(/<br\s*\/?>/g, '\n')     // br 태그를 줄바꿈으로
    .replace(/&nbsp;/g, ' ')          // nbsp를 공백으로
    .replace(/<[^>]+>/g, '')          // 나머지 HTML 태그 제거
    .trim();
};

// 후기 콘텐츠 정규화 함수 (blockquote 제거 등)
const normalizeReviewContent = (html: string): string => {
  return html
    .replace(/<blockquote[^>]*>/gi, '')  // blockquote 시작 태그 제거
    .replace(/<\/blockquote>/gi, '')     // blockquote 끝 태그 제거
    .replace(/\s+/g, ' ')                // 연속된 공백을 하나로
    .replace(/>\s+</g, '><')             // 태그 사이의 공백 제거
    .trim();
};

function ReviewFormModal({ review, onClose }: ReviewFormModalProps) {
  const { userData } = useAuth();
  const [title, setTitle] = useState(review?.title || '');
  const [generation, setGeneration] = useState(review?.generation || '');
  // 수정 시 HTML을 일반 텍스트로 변환
  const [content, setContent] = useState(review?.content ? htmlToPlainText(review.content) : '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !generation.trim() || !content.trim()) {
      Alert.alert('입력 오류', '모든 필드를 입력해주세요.');
      return;
    }

    if (!userData) {
      Alert.alert('오류', '사용자 정보를 찾을 수 없습니다.');
      return;
    }

    try {
      setIsSubmitting(true);

      // 줄바꿈 처리: 각 줄을 p 태그로 감싸고, 빈 줄은 <p><br></p>로 처리
      const processedContent = content
        .split('\n')
        .map(line => {
          const trimmedLine = line.trim();
          if (trimmedLine === '') {
            return '<p><br></p>';
          }
          return `<p>${trimmedLine}</p>`;
        })
        .join('');

      if (review) {
        // 수정
        await updateReview(review.id, {
          title,
          generation,
          content: processedContent,
        });
        Alert.alert('완료', '후기가 수정되었습니다.');
      } else {
        // 추가
        await addReview({
          title,
          generation,
          content: processedContent,
          author: {
            id: userData.userId,
            name: userData.name,
            profileImage: userData.profileImage || '',
          },
          jobCode: '',
        });
        Alert.alert('완료', '후기가 등록되었습니다.');
      }

      onClose();
    } catch (error) {
      logger.error('후기 저장 오류:', error);
      Alert.alert('오류', '후기 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalSafeArea}>
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {/* 고정 헤더 */}
          <View style={styles.modalHeader}>
            <TouchableOpacity 
              onPress={onClose} 
              disabled={isSubmitting}
              style={styles.modalBackButton}
            >
              <Text style={styles.modalBackButtonText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {review ? '후기 수정' : '후기 작성'}
            </Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          {/* 스크롤 가능한 컨텐츠 */}
          <ScrollView 
            style={styles.modalContent}
            contentContainerStyle={styles.modalContentContainer}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>제목 *</Text>
              <TextInput
                style={styles.formInput}
                value={title}
                onChangeText={setTitle}
                placeholder="후기 제목을 입력하세요"
                placeholderTextColor="#9ca3af"
                editable={!isSubmitting}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>기수 *</Text>
              <TextInput
                style={styles.formInput}
                value={generation}
                onChangeText={setGeneration}
                placeholder="기수를 입력하세요 (예: 25기)"
                placeholderTextColor="#9ca3af"
                editable={!isSubmitting}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>내용 *</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={content}
                onChangeText={setContent}
                placeholder="후기 내용을 작성하세요&#10;&#10;• 줄바꿈은 자동으로 적용됩니다&#10;• HTML 태그는 입력하지 마세요"
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={15}
                textAlignVertical="top"
                editable={!isSubmitting}
              />
            </View>
          </ScrollView>

          {/* 고정 버튼 */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.formButton, styles.formCancelButton]}
              onPress={onClose}
              disabled={isSubmitting}
            >
              <Text style={styles.formCancelButtonText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.formButton,
                styles.formSubmitButton,
                isSubmitting && styles.formSubmitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              <Text style={styles.formSubmitButtonText}>
                {isSubmitting ? '저장 중...' : review ? '수정' : '등록'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export function MentorReviewScreen() {
  const { userData } = useAuth();
  const [reviews, setReviews] = useState<ReviewWithId[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingReview, setEditingReview] = useState<ReviewWithId | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);

  const isAdmin = userData?.role === 'admin';

  const loadReviews = useCallback(async () => {
    try {
      setIsLoading(true);
      const reviewsData = await getAllReviews();
      setReviews(reviewsData);
    } catch (error) {
      logger.error('후기 조회 오류:', error);
      Alert.alert('오류', '후기를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadReviews();
  };

  const toggleReview = (id: string) => {
    setReviews((prev) =>
      prev.map((review) =>
        review.id === id ? { ...review, isOpen: !review.isOpen } : review
      )
    );
  };

  const handleAdd = () => {
    setEditingReview(null);
    setIsFormModalOpen(true);
  };

  const handleEdit = (review: ReviewWithId) => {
    setEditingReview(review);
    setIsFormModalOpen(true);
  };

  const handleDelete = (reviewId: string) => {
    Alert.alert(
      '후기 삭제',
      '정말로 이 후기를 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReview(reviewId);
              await loadReviews();
              Alert.alert('완료', '후기가 삭제되었습니다.');
            } catch (error) {
              logger.error('후기 삭제 오류:', error);
              Alert.alert('오류', '후기 삭제 중 오류가 발생했습니다.');
            }
          },
        },
      ]
    );
  };

  const handleFormClose = () => {
    setIsFormModalOpen(false);
    setEditingReview(null);
    loadReviews();
  };

  const reviewsByGeneration: { [key: string]: ReviewWithId[] } = {};
  reviews.forEach((review) => {
    if (!reviewsByGeneration[review.generation]) {
      reviewsByGeneration[review.generation] = [];
    }
    reviewsByGeneration[review.generation].push(review);
  });

  const sortedGenerations = Object.keys(reviewsByGeneration).sort((a, b) => {
    const numA = a.replace(/[^0-9]/g, '');
    const numB = b.replace(/[^0-9]/g, '');
    if (numA && numB) {
      return parseInt(numB, 10) - parseInt(numA, 10);
    }
    if (numA && !numB) return 1;
    if (!numA && numB) return -1;
    return a.localeCompare(b);
  });

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <>
      <View style={styles.container}>
        {/* 관리자 작성 버튼 */}
        {isAdmin && (
          <View style={styles.adminHeader}>
            <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
              <Text style={styles.addButtonText}>+ 후기 작성</Text>
            </TouchableOpacity>
          </View>
        )}

        {reviews.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>아직 등록된 후기가 없습니다.</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.reviewListContent}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
            }
          >
            {sortedGenerations.map((generation) => (
              <View key={generation} style={styles.generationSection}>
                <Text style={styles.generationTitle}>{generation}</Text>
                {reviewsByGeneration[generation].map((review) => (
                  <View key={review.id} style={styles.reviewCard}>
                    <TouchableOpacity
                      style={styles.reviewHeader}
                      onPress={() => toggleReview(review.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.reviewTitle} numberOfLines={review.isOpen ? undefined : 2}>
                        {review.title}
                      </Text>
                      <View style={styles.reviewHeaderRight}>
                        {isAdmin && (
                          <View style={styles.adminButtons}>
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                handleEdit(review);
                              }}
                              style={styles.iconButton}
                            >
                              <Text style={styles.editIcon}>✏️</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                handleDelete(review.id);
                              }}
                              style={styles.iconButton}
                            >
                              <Text style={styles.deleteIcon}>🗑️</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                        <Text style={styles.reviewArrow}>{review.isOpen ? '▲' : '▼'}</Text>
                      </View>
                    </TouchableOpacity>

                    {review.isOpen && (
                      <View style={styles.reviewContent}>
                        <HTMLRenderer html={normalizeReviewContent(review.content)} />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* 후기 작성/수정 모달 */}
      {isFormModalOpen && (
        <ReviewFormModal
          review={editingReview}
          onClose={handleFormClose}
        />
      )}
    </>
  );
}

export function RecruitmentInquiryScreen() {
  return (
    <View style={styles.centerContainer}>
      <Text style={styles.emptyText}>채용 문의 화면 (추후 구현)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
  listContent: {
    padding: 16,
  },
  reviewListContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: 'hidden',
  },
  cardHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  interviewSection: {
    padding: 16,
    backgroundColor: '#eff6ff',
    borderBottomWidth: 1,
    borderBottomColor: '#dbeafe',
  },
  interviewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 12,
  },
  interviewRow: {
    marginBottom: 8,
  },
  interviewLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 2,
  },
  interviewValue: {
    fontSize: 13,
    color: '#1e3a8a',
  },
  interviewButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  interviewButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  interviewNotes: {
    backgroundColor: '#dbeafe',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  interviewNotesText: {
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 20,
  },
  statusSection: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  statusColumn: {
    flex: 1,
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  badgeYellow: {
    backgroundColor: '#fef3c7',
  },
  badgeGreen: {
    backgroundColor: '#d1fae5',
  },
  badgeRed: {
    backgroundColor: '#fee2e2',
  },
  badgePurple: {
    backgroundColor: '#e9d5ff',
  },
  badgeGray: {
    backgroundColor: '#f3f4f6',
  },
  cancelButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    margin: 16,
    marginTop: 0,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  generationSection: {
    marginBottom: 24,
  },
  generationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  reviewCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f9fafb',
  },
  reviewTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    marginRight: 12,
  },
  reviewArrow: {
    fontSize: 12,
    color: '#6b7280',
  },
  reviewContent: {
    padding: 16,
    backgroundColor: '#ffffff',
  },
  reviewText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
  },
  adminHeader: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  addButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  reviewHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adminButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 4,
  },
  editIcon: {
    fontSize: 18,
  },
  deleteIcon: {
    fontSize: 18,
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  modalBackButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackButtonText: {
    fontSize: 24,
    color: '#6b7280',
    fontWeight: '300',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
  },
  modalHeaderSpacer: {
    width: 44,
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  modalContentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  formGroup: {
    marginBottom: 24,
  },
  formLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  formTextArea: {
    minHeight: 300,
    maxHeight: 500,
    textAlignVertical: 'top',
    lineHeight: 22,
  },
  formButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  formCancelButton: {
    backgroundColor: '#f3f4f6',
  },
  formCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  formSubmitButton: {
    backgroundColor: '#3b82f6',
  },
  formSubmitButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  formSubmitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
