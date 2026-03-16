import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../config/firebase';
import {
  getJobBoardById,
  getApplicationsByJobBoardId,
  updateJobBoard,
  getUserById,
  getScoreColor,
} from '@smis-mentor/shared';
import { AdminStackScreenProps } from '../navigation/types';

interface User {
  id: string;
  userId: string;
  name: string;
  email: string;
  phoneNumber: string;
  age?: number;
  profileImage?: string;
  university?: string;
  grade?: number;
  isOnLeave?: boolean | null;
  referralPath?: string;
  referrerName?: string;
  jobExperiences?: Array<{ jobCode: string; [key: string]: any }>;
  evaluationSummary?: {
    documentReview?: { averageScore: number; evaluationCount: number };
    interview?: { averageScore: number; evaluationCount: number };
    faceToFaceEducation?: { averageScore: number; evaluationCount: number };
    campLife?: { averageScore: number; evaluationCount: number };
  };
}

interface ApplicationWithUser {
  id: string;
  applicationStatus: string;
  interviewStatus?: string;
  finalStatus?: string;
  refUserId: string;
  applicationDate: any;
  user?: User;
}

interface JobBoardData {
  id: string;
  title: string;
  description: string;
  generation: string;
  jobCode: string;
  status: string;
  korea: boolean;
}

type FilterStatus = 'all' | 'pending' | 'interview' | 'complete' | 'passed' | 'final';

export function JobBoardApplicantsScreen({
  route,
  navigation,
}: AdminStackScreenProps<'JobBoardApplicants'>) {
  const { jobBoardId } = route.params;
  const [jobBoard, setJobBoard] = useState<JobBoardData | null>(null);
  const [applications, setApplications] = useState<ApplicationWithUser[]>([]);
  const [filteredApplications, setFilteredApplications] = useState<ApplicationWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedCampsMap, setAppliedCampsMap] = useState<Record<string, string[]>>({});

  // 사용자가 지원한 모든 캠프 코드 불러오기
  const loadUserAppliedCamps = useCallback(async (userId: string) => {
    try {
      const { collection, query, where, getDocs, doc, getDoc } = await import('firebase/firestore');
      
      // 사용자의 모든 지원 이력 조회
      const applicationsRef = collection(db, 'applicationHistories');
      const q = query(applicationsRef, where('refUserId', '==', userId));
      const applicationsSnapshot = await getDocs(q);

      // 지원한 모든 jobBoard ID 수집
      const jobBoardIds = applicationsSnapshot.docs.map(docSnap => docSnap.data().refJobBoardId);

      // 중복 제거
      const uniqueJobBoardIds = [...new Set(jobBoardIds)];

      // 각 jobBoard의 jobCode만 가져오기
      const jobCodes = await Promise.all(
        uniqueJobBoardIds.map(async (id) => {
          const jobBoardRef = doc(db, 'jobBoards', id);
          const jobBoardDoc = await getDoc(jobBoardRef);

          if (jobBoardDoc.exists()) {
            const data = jobBoardDoc.data();
            return data.jobCode;
          }
          return null;
        })
      );

      // null 값 제거하고 중복 제거 후 설정
      const filteredCodes = jobCodes.filter(code => code !== null) as string[];
      const uniqueCodes = [...new Set(filteredCodes)];

      // 사용자 ID와 지원 장소 매핑 정보 업데이트
      setAppliedCampsMap(prev => ({
        ...prev,
        [userId]: uniqueCodes
      }));
    } catch (error) {
      console.error('지원 캠프 로드 오류:', error);
      setAppliedCampsMap(prev => ({
        ...prev,
        [userId]: []
      }));
    }
  }, [db]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);

      // 공고 정보 로드
      const boardData = await getJobBoardById(db, jobBoardId);
      if (!boardData) {
        Alert.alert('오류', '공고를 찾을 수 없습니다.');
        navigation.goBack();
        return;
      }
      setJobBoard(boardData);

      // 지원자 목록 로드
      const applicationsData = await getApplicationsByJobBoardId(db, jobBoardId);

      // 각 지원자의 상세 정보 로드
      const applicationsWithUser = await Promise.all(
        applicationsData.map(async (app: any) => {
          try {
            const userData = await getUserById(db, app.refUserId);
            return {
              ...app,
              user: userData,
            };
          } catch (error) {
            console.error(`사용자 정보 로드 오류 (${app.refUserId}):`, error);
            return app;
          }
        })
      );

      // 최신순 정렬
      const sortedApplications = applicationsWithUser.sort((a: any, b: any) => {
        const dateA = a.applicationDate?.seconds || 0;
        const dateB = b.applicationDate?.seconds || 0;
        return dateB - dateA;
      });

      setApplications(sortedApplications);
      setFilteredApplications(sortedApplications);

      // 모든 지원자의 지원 장소 정보를 로드
      await Promise.all(
        sortedApplications.map(async (app: any) => {
          await loadUserAppliedCamps(app.refUserId);
        })
      );
    } catch (error) {
      console.error('데이터 로드 오류:', error);
      Alert.alert('오류', '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [jobBoardId, navigation, loadUserAppliedCamps]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 필터링 및 검색
  useEffect(() => {
    let filtered = applications;

    // 상태별 필터링
    if (filterStatus !== 'all') {
      filtered = filtered.filter((app) => {
        if (filterStatus === 'pending') return app.applicationStatus === 'pending';
        if (filterStatus === 'interview') return app.interviewStatus === 'pending';
        if (filterStatus === 'complete') return app.interviewStatus === 'complete';
        if (filterStatus === 'passed') return app.interviewStatus === 'passed';
        if (filterStatus === 'final') return app.finalStatus === 'finalAccepted';
        return true;
      });
    }

    // 검색어 필터링
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (app) =>
          app.user?.name.toLowerCase().includes(query) ||
          app.user?.email.toLowerCase().includes(query) ||
          app.user?.phoneNumber.includes(query)
      );
    }

    setFilteredApplications(filtered);
  }, [applications, filterStatus, searchQuery]);

  // 공고 상태 토글
  const toggleJobBoardStatus = async () => {
    if (!jobBoard) return;

    const newStatus = jobBoard.status === 'active' ? 'closed' : 'active';
    const message =
      newStatus === 'closed' ? '이 공고를 마감하시겠습니까?' : '이 공고를 다시 활성화하시겠습니까?';

    Alert.alert('상태 변경', message, [
      { text: '취소', style: 'cancel' },
      {
        text: '확인',
        onPress: async () => {
          try {
            await updateJobBoard(db, jobBoardId, { status: newStatus });
            setJobBoard({ ...jobBoard, status: newStatus });
            Alert.alert(
              '성공',
              newStatus === 'closed' ? '공고가 마감되었습니다.' : '공고가 활성화되었습니다.'
            );
          } catch (error) {
            console.error('상태 변경 오류:', error);
            Alert.alert('오류', '상태 변경 중 오류가 발생했습니다.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>{jobBoard?.title || '지원자 관리'}</Text>
          <Text style={styles.headerSubtitle}>
            {jobBoard?.generation} · 총 {applications.length}명 지원
          </Text>
        </View>
        <TouchableOpacity onPress={toggleJobBoardStatus} style={styles.headerButton}>
          <Ionicons
            name={jobBoard?.status === 'active' ? 'close-circle' : 'checkmark-circle'}
            size={24}
            color={jobBoard?.status === 'active' ? '#ef4444' : '#22c55e'}
          />
        </TouchableOpacity>
      </View>

      {/* 검색 */}
      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            placeholder="이름, 이메일, 전화번호로 검색"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9ca3af"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 필터 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterSection}
        contentContainerStyle={{ alignItems: 'center' }}
      >
        <TouchableOpacity
          style={[styles.filterChip, filterStatus === 'all' && styles.filterChipActive]}
          onPress={() => setFilterStatus('all')}
        >
          <Text
            style={[
              styles.filterChipText,
              filterStatus === 'all' && styles.filterChipTextActive,
            ]}
          >
            전체 ({applications.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filterStatus === 'pending' && styles.filterChipActive]}
          onPress={() => setFilterStatus('pending')}
        >
          <Text
            style={[
              styles.filterChipText,
              filterStatus === 'pending' && styles.filterChipTextActive,
            ]}
          >
            서류 검토중 ({applications.filter((a) => a.applicationStatus === 'pending').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filterStatus === 'interview' && styles.filterChipActive]}
          onPress={() => setFilterStatus('interview')}
        >
          <Text
            style={[
              styles.filterChipText,
              filterStatus === 'interview' && styles.filterChipTextActive,
            ]}
          >
            면접 예정 ({applications.filter((a) => a.interviewStatus === 'pending').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filterStatus === 'complete' && styles.filterChipActive]}
          onPress={() => setFilterStatus('complete')}
        >
          <Text
            style={[
              styles.filterChipText,
              filterStatus === 'complete' && styles.filterChipTextActive,
            ]}
          >
            면접 완료 ({applications.filter((a) => a.interviewStatus === 'complete').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filterStatus === 'passed' && styles.filterChipActive]}
          onPress={() => setFilterStatus('passed')}
        >
          <Text
            style={[
              styles.filterChipText,
              filterStatus === 'passed' && styles.filterChipTextActive,
            ]}
          >
            면접 합격 ({applications.filter((a) => a.interviewStatus === 'passed').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filterStatus === 'final' && styles.filterChipActive]}
          onPress={() => setFilterStatus('final')}
        >
          <Text
            style={[
              styles.filterChipText,
              filterStatus === 'final' && styles.filterChipTextActive,
            ]}
          >
            최종 합격 ({applications.filter((a) => a.finalStatus === 'finalAccepted').length})
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 지원자 목록 */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f59e0b" />
          <Text style={styles.loadingText}>지원자 정보를 불러오는 중...</Text>
        </View>
      ) : filteredApplications.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={48} color="#9ca3af" />
          <Text style={styles.emptyStateText}>
            {searchQuery ? '검색 결과가 없습니다.' : '지원자가 없습니다.'}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.listSection}>
          {filteredApplications.map((app) => (
            <TouchableOpacity
              key={app.id}
              style={styles.applicantCard}
              onPress={() =>
                navigation.navigate('ApplicantDetail', {
                  applicationId: app.id,
                  jobBoardId: jobBoardId,
                })
              }
              activeOpacity={0.7}
            >
              <View style={styles.applicantCardContent}>
                {/* 프로필 이미지 */}
                <View style={styles.profileImageContainer}>
                  {app.user?.profileImage ? (
                    <Image source={{ uri: app.user.profileImage }} style={styles.profileImage} />
                  ) : (
                    <View style={styles.profilePlaceholder}>
                      <Text style={styles.profilePlaceholderText}>
                        {app.user?.name ? app.user.name.charAt(0) : '?'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* 지원자 정보 */}
                <View style={styles.applicantInfo}>
                  <View style={styles.applicantBasicInfo}>
                    <Text style={styles.applicantName} numberOfLines={1}>
                      {app.user?.name || '알 수 없음'}
                      {app.user?.age ? ` (${app.user.age})` : ''}
                    </Text>
                    <Text style={styles.applicantContact} numberOfLines={1}>
                      연락처: {formatPhoneNumber(app.user?.phoneNumber)}
                    </Text>
                    {app.user?.university && (
                      <Text style={styles.applicantDetail} numberOfLines={1}>
                        {app.user.university}{' '}
                        {app.user.grade === 6
                          ? '졸업생'
                          : `${app.user.grade}학년 ${
                              app.user.isOnLeave === null
                                ? '졸업생'
                                : app.user.isOnLeave
                                ? '휴학생'
                                : '재학생'
                            }`}
                      </Text>
                    )}
                    {app.user?.referralPath && (
                      <Text style={styles.applicantDetail} numberOfLines={1}>
                        경로: {app.user.referralPath}
                        {app.user.referrerName ? ` (${app.user.referrerName})` : ''}
                      </Text>
                    )}
                    {appliedCampsMap[app.refUserId] && appliedCampsMap[app.refUserId].length > 0 && (
                      <Text style={styles.applicantDetail} numberOfLines={1}>
                        장소: {appliedCampsMap[app.refUserId].join(' / ')}
                      </Text>
                    )}
                  </View>

                  {/* 상태 배지 */}
                  <View style={styles.statusBadgeContainer}>
                    <View style={styles.statusRow}>
                      <Text style={styles.statusLabel}>서류:</Text>
                      <View
                        style={[
                          styles.statusBadgeSmall,
                          {
                            backgroundColor:
                              app.applicationStatus === 'pending'
                                ? '#dbeafe'
                                : app.applicationStatus === 'accepted'
                                ? '#d1fae5'
                                : '#fee2e2',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeSmallText,
                            {
                              color:
                                app.applicationStatus === 'pending'
                                  ? '#1e40af'
                                  : app.applicationStatus === 'accepted'
                                  ? '#047857'
                                  : '#dc2626',
                            },
                          ]}
                        >
                          {app.applicationStatus === 'pending'
                            ? '검토중'
                            : app.applicationStatus === 'accepted'
                            ? '합격'
                            : '불합격'}
                        </Text>
                      </View>
                      {/* 서류 점수 */}
                      {(app.user as any)?.evaluationSummary?.documentReview && (
                        <Text style={[
                          styles.scoreText,
                          { color: getScoreColor((app.user as any).evaluationSummary.documentReview.averageScore) }
                        ]}>
                          ({((app.user as any).evaluationSummary.documentReview.averageScore).toFixed(1)})
                        </Text>
                      )}
                    </View>

                    <View style={styles.statusRow}>
                      <Text style={styles.statusLabel}>면접:</Text>
                      {app.interviewStatus ? (
                        <View
                          style={[
                            styles.statusBadgeSmall,
                            {
                              backgroundColor:
                                app.interviewStatus === 'pending'
                                  ? '#fef3c7'
                                  : app.interviewStatus === 'complete'
                                  ? '#f3e8ff'
                                  : app.interviewStatus === 'passed'
                                  ? '#d1fae5'
                                  : '#fee2e2',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeSmallText,
                              {
                                color:
                                  app.interviewStatus === 'pending'
                                    ? '#92400e'
                                    : app.interviewStatus === 'complete'
                                    ? '#7e22ce'
                                    : app.interviewStatus === 'passed'
                                    ? '#047857'
                                    : '#dc2626',
                              },
                            ]}
                          >
                            {app.interviewStatus === 'pending'
                              ? '예정'
                              : app.interviewStatus === 'complete'
                              ? '완료'
                              : app.interviewStatus === 'passed'
                              ? '합격'
                              : '불합격'}
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.statusBadgeSmall, { backgroundColor: '#f3f4f6' }]}>
                          <Text style={[styles.statusBadgeSmallText, { color: '#6b7280' }]}>
                            미정
                          </Text>
                        </View>
                      )}
                      {/* 면접 점수 */}
                      {(app.user as any)?.evaluationSummary?.interview && (
                        <Text style={[
                          styles.scoreText,
                          { color: getScoreColor((app.user as any).evaluationSummary.interview.averageScore) }
                        ]}>
                          ({((app.user as any).evaluationSummary.interview.averageScore).toFixed(1)})
                        </Text>
                      )}
                    </View>

                    <View style={styles.statusRow}>
                      <Text style={styles.statusLabel}>최종:</Text>
                      {app.finalStatus ? (
                        <View
                          style={[
                            styles.statusBadgeSmall,
                            {
                              backgroundColor:
                                app.finalStatus === 'finalAccepted' ? '#e0e7ff' : '#fee2e2',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeSmallText,
                              {
                                color: app.finalStatus === 'finalAccepted' ? '#4338ca' : '#dc2626',
                              },
                            ]}
                          >
                            {app.finalStatus === 'finalAccepted' ? '합격' : '불합격'}
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.statusBadgeSmall, { backgroundColor: '#f3f4f6' }]}>
                          <Text style={[styles.statusBadgeSmallText, { color: '#6b7280' }]}>
                            미정
                          </Text>
                        </View>
                      )}
                      {/* 대면교육 점수 */}
                      {(app.user as any)?.evaluationSummary?.faceToFaceEducation && (
                        <Text style={[
                          styles.scoreText,
                          { color: getScoreColor((app.user as any).evaluationSummary.faceToFaceEducation.averageScore) }
                        ]}>
                          ({((app.user as any).evaluationSummary.faceToFaceEducation.averageScore).toFixed(1)})
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  header: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  headerButton: {
    padding: 4,
  },
  searchSection: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  filterSection: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    maxHeight: 50,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: '#f59e0b',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    lineHeight: 16,
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  listSection: {
    flex: 1,
    padding: 16,
  },
  applicantCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  applicantCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  profileImageContainer: {
    marginRight: 12,
  },
  profileImage: {
    width: 70,
    height: 70,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  profilePlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profilePlaceholderText: {
    fontSize: 28,
    fontWeight: '600',
    color: '#9ca3af',
  },
  applicantInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  applicantBasicInfo: {
    flex: 1,
    maxWidth: '55%',
    marginRight: 8,
  },
  applicantName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  applicantContact: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
  },
  applicantDetail: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 1,
  },
  statusBadgeContainer: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    minWidth: '40%',
    gap: 3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
  },
  statusBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeSmallText: {
    fontSize: 11,
    fontWeight: '600',
  },
  scoreText: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 2,
  },
});
