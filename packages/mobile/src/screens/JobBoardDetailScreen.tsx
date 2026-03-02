import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { RecruitmentStackScreenProps } from '../navigation/types';
import {
  getJobBoardById,
  getJobCodeById,
  JobBoardWithId,
  JobCodeWithId,
} from '../services/jobBoardService';
import { createApplication } from '../services/recruitmentService';
import { HTMLRenderer } from '../components/HTMLRenderer';
import { JobBoardEditScreen } from './JobBoardEditScreen';
import { Timestamp } from 'firebase/firestore';

export function JobBoardDetailScreen({
  route,
  navigation,
}: RecruitmentStackScreenProps<'JobBoardDetail'>) {
  const { jobBoardId } = route.params;
  const { userData } = useAuth();
  const [jobBoard, setJobBoard] = useState<JobBoardWithId | null>(null);
  const [jobCode, setJobCode] = useState<JobCodeWithId | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedInterviewDate, setSelectedInterviewDate] = useState<
    string | null
  >(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const isAdmin = userData?.role === 'admin';

  useEffect(() => {
    loadData();
  }, [jobBoardId]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const board = await getJobBoardById(jobBoardId);

      if (!board) {
        Alert.alert('오류', '존재하지 않는 공고입니다.');
        navigation.goBack();
        return;
      }

      if (board.status !== 'active' && !isAdmin) {
        Alert.alert('오류', '마감된 공고입니다.');
        navigation.goBack();
        return;
      }

      setJobBoard(board);

      if (board.refJobCodeId) {
        const jobCodeData = await getJobCodeById(board.refJobCodeId);
        setJobCode(jobCodeData);
      }
    } catch (error) {
      console.error('공고 정보 로드 오류:', error);
      Alert.alert('오류', '공고 정보를 불러오는 중 오류가 발생했습니다.');
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const dayOfWeek = days[date.getDay()];
    return `${year}년 ${month}월 ${day}일 (${dayOfWeek})`;
  };

  const formatDateTime = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${formatDate(timestamp)} ${hours}:${minutes}`;
  };

  const handleApply = () => {
    if (!userData || !jobBoard) {
      Alert.alert('로그인 필요', '로그인이 필요합니다.');
      return;
    }

    // 프로필 이미지 확인
    if (!userData.profileImage) {
      Alert.alert(
        '프로필 미완성',
        '지원하기 전에 프로필 이미지를 업로드해주세요.\n\n프로필 탭에서 프로필을 완성해주세요.',
        [{ text: '확인' }]
      );
      return;
    }

    // 자기소개서 확인
    if (!userData.selfIntroduction) {
      Alert.alert(
        '프로필 미완성',
        '지원하기 전에 자기소개서를 작성해주세요.\n\n프로필 탭에서 자기소개서를 작성해주세요.',
        [{ text: '확인' }]
      );
      return;
    }

    // 지원동기 확인
    if (!userData.jobMotivation) {
      Alert.alert(
        '프로필 미완성',
        '지원하기 전에 지원 동기를 작성해주세요.\n\n프로필 탭에서 지원 동기를 작성해주세요.',
        [{ text: '확인' }]
      );
      return;
    }

    // 확인 모달 열기
    setIsConfirmModalOpen(true);
  };

  const confirmApply = async () => {
    if (!userData || !jobBoard) return;

    try {
      setIsSubmitting(true);

      const now = Timestamp.now();
      
      // applicationData 기본 데이터 설정
      const applicationData: any = {
        refJobBoardId: jobBoard.id,
        refUserId: userData.userId,
        applicationStatus: 'pending',
        createdAt: now,
        updatedAt: now
      };

      // 면접 일정이 선택된 경우에만 interviewDate 필드 추가
      if (selectedInterviewDate) {
        const [startMillis] = selectedInterviewDate.split('-').map(Number);
        applicationData.interviewDate = new Timestamp(Math.floor(startMillis / 1000), 0);
      }
      
      await createApplication(applicationData);

      setIsConfirmModalOpen(false);
      Alert.alert(
        '지원 완료',
        '지원이 완료되었습니다.\n지원 현황 탭에서 진행 상태를 확인할 수 있습니다.',
        [
          {
            text: '확인',
            onPress: () => {
              // RecruitmentList로 돌아가면서 지원 현황 탭 열기
              navigation.navigate('RecruitmentList', { openApplicationTab: true });
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('지원 오류:', error);
      
      // 중복 지원 확인
      if (error.message && error.message.includes('이미 지원')) {
        Alert.alert('지원 실패', '이미 지원하신 공고입니다.');
      } else {
        Alert.alert('지원 실패', '지원 중 오류가 발생했습니다.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    setIsEditing(false);
    // 데이터 다시 로드
    await loadData();
  };

  const handleDelete = () => {
    Alert.alert(
      '공고 삭제',
      '정말로 이 공고를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.',
      [
        {
          text: '취소',
          style: 'cancel',
        },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            Alert.alert('안내', '공고 삭제는 웹에서 진행해주세요.');
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>로딩 중...</Text>
      </View>
    );
  }

  if (!jobBoard) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>공고를 찾을 수 없습니다.</Text>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 수정 모드
  if (isEditing && jobBoard) {
    return (
      <JobBoardEditScreen
        jobBoard={jobBoard}
        jobCode={jobCode}
        onBack={() => setIsEditing(false)}
        onSave={handleSaveEdit}
      />
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* 상태 배지 */}
        <View style={styles.statusBar}>
          <View style={styles.badgeContainer}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{jobBoard.generation}</Text>
            </View>
            <View
              style={[
                styles.badge,
                jobBoard.korea ? styles.badgeGreen : styles.badgePurple,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  jobBoard.korea
                    ? styles.badgeTextGreen
                    : styles.badgeTextPurple,
                ]}
              >
                {jobBoard.korea ? '국내' : '해외'}
              </Text>
            </View>
            <View
              style={[
                styles.badge,
                jobBoard.status === 'active'
                  ? styles.badgeEmerald
                  : styles.badgeGray,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  jobBoard.status === 'active'
                    ? styles.badgeTextEmerald
                    : styles.badgeTextGray,
                ]}
              >
                {jobBoard.status === 'active' ? '모집중' : '마감'}
              </Text>
            </View>
          </View>
        </View>

        {/* 제목 */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{jobBoard.title}</Text>
        </View>

        {/* 업무 정보 카드 */}
        {jobCode && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconText}>💼</Text>
              </View>
              <Text style={styles.cardTitle}>업무 정보</Text>
            </View>
            <View style={styles.cardContent}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>업무 코드</Text>
                <Text style={styles.infoValue}>{jobCode.code}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>업무명</Text>
                <Text style={styles.infoValue}>{jobCode.name}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>캠프 기간</Text>
                <View style={styles.infoValueContainer}>
                  <Text style={styles.infoValue}>
                    {formatDate(jobCode.startDate)}
                  </Text>
                  <Text style={styles.infoValueSub}>~</Text>
                  <Text style={styles.infoValue}>
                    {formatDate(jobCode.endDate)}
                  </Text>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>위치</Text>
                <Text style={styles.infoValue}>{jobCode.location}</Text>
              </View>
            </View>
          </View>
        )}

        {/* 공고 내용 카드 */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>📄</Text>
            </View>
            <Text style={styles.cardTitle}>공고 내용</Text>
          </View>
          <View style={styles.cardContent}>
            <HTMLRenderer html={jobBoard.description} />
          </View>
        </View>

        {/* 면접 일정 카드 */}
        {jobBoard.interviewDates && jobBoard.interviewDates.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconText}>📅</Text>
              </View>
              <Text style={styles.cardTitle}>면접 일정</Text>
            </View>
            <Text style={styles.cardSubtitle}>면접 일정을 선택해주세요</Text>
            <View style={styles.cardContent}>
              {jobBoard.interviewDates.map((date: any, index: number) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.interviewDateButton,
                    selectedInterviewDate ===
                      `${date.start.seconds}-${date.end.seconds}` &&
                      styles.interviewDateButtonSelected,
                  ]}
                  onPress={() =>
                    setSelectedInterviewDate(
                      `${date.start.seconds}-${date.end.seconds}`
                    )
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.interviewDateContent}>
                    <Text style={styles.interviewDateIcon}>🕐</Text>
                    <View style={styles.interviewDateTextContainer}>
                      <Text
                        style={[
                          styles.interviewDateText,
                          selectedInterviewDate ===
                            `${date.start.seconds}-${date.end.seconds}` &&
                            styles.interviewDateTextSelected,
                        ]}
                      >
                        {formatDateTime(date.start)}
                      </Text>
                      <Text style={styles.interviewDateSeparator}>~</Text>
                      <Text
                        style={[
                          styles.interviewDateText,
                          selectedInterviewDate ===
                            `${date.start.seconds}-${date.end.seconds}` &&
                            styles.interviewDateTextSelected,
                        ]}
                      >
                        {formatDateTime(date.end)}
                      </Text>
                    </View>
                    {selectedInterviewDate ===
                      `${date.start.seconds}-${date.end.seconds}` && (
                      <View style={styles.checkCircle}>
                        <Text style={styles.checkIcon}>✓</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* 관리자 전용 버튼 */}
        {isAdmin && (
          <View style={styles.adminButtonsContainer}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={handleEdit}
              activeOpacity={0.7}
            >
              <Text style={styles.editButtonText}>✏️ 수정</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteButtonText}>🗑️ 삭제</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* 하단 지원 버튼 (모집중일 때만 - 관리자 포함) */}
      {jobBoard.status === 'active' && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.applyButton}
            onPress={handleApply}
            activeOpacity={0.8}
            disabled={isSubmitting}
          >
            <Text style={styles.applyButtonText}>
              {isSubmitting ? '지원 중...' : '🚀 지원하기'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 지원 확인 모달 */}
      <Modal
        visible={isConfirmModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsConfirmModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>지원 확인</Text>
            
            {!selectedInterviewDate ? (
              <Text style={styles.modalText}>
                면접 일정을 선택하지 않았습니다. 담당자에게 별도로 연락하여 면접 일정을 조율해 주세요.
              </Text>
            ) : null}
            
            <Text style={styles.modalText}>
              정말 지원하시겠습니까? 서류전형 합/불 여부가 결정되면 지원을 취소할 수 없습니다.
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setIsConfirmModalOpen(false)}
                disabled={isSubmitting}
              >
                <Text style={styles.modalCancelButtonText}>취소</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalConfirmButton, isSubmitting && styles.modalConfirmButtonDisabled]}
                onPress={confirmApply}
                disabled={isSubmitting}
              >
                <Text style={styles.modalConfirmButtonText}>
                  {isSubmitting ? '지원 중...' : '예, 지원합니다'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
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
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8fafc',
  },
  errorText: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#3b82f6',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingTop: 8,
  },
  statusBar: {
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  badgeContainer: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#dbeafe',
  },
  badgeGreen: {
    backgroundColor: '#d1fae5',
  },
  badgePurple: {
    backgroundColor: '#e9d5ff',
  },
  badgeEmerald: {
    backgroundColor: '#d1fae5',
  },
  badgeGray: {
    backgroundColor: '#f3f4f6',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e40af',
  },
  badgeTextGreen: {
    color: '#047857',
  },
  badgeTextPurple: {
    color: '#7e22ce',
  },
  badgeTextEmerald: {
    color: '#047857',
  },
  badgeTextGray: {
    color: '#6b7280',
  },
  titleContainer: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    lineHeight: 32,
  },
  card: {
    backgroundColor: '#ffffff',
    marginBottom: 8,
    paddingVertical: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  cardContent: {
    paddingHorizontal: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
  },
  infoLabel: {
    fontSize: 15,
    color: '#6b7280',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
    textAlign: 'right',
  },
  infoValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-end',
  },
  infoValueSub: {
    fontSize: 14,
    color: '#9ca3af',
  },
  interviewDateButton: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  interviewDateButtonSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  interviewDateContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  interviewDateIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  interviewDateTextContainer: {
    flex: 1,
  },
  interviewDateText: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 4,
  },
  interviewDateTextSelected: {
    color: '#1e40af',
    fontWeight: '600',
  },
  interviewDateSeparator: {
    fontSize: 13,
    color: '#9ca3af',
    marginVertical: 2,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkIcon: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  adminButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 20,
  },
  editButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  editButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#ef4444',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  deleteButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomBar: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  applyButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  applyButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  bottomPadding: {
    height: 120,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalConfirmButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  modalConfirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
