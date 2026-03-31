import React, { useState, useEffect } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../config/firebase';
import {
  getAllJobBoards,
  getApplicationsByJobBoardId,
  adminGetAllJobCodes,
} from '@smis-mentor/shared';
import { AdminStackScreenProps } from '../navigation/types';

interface JobBoardWithApplications {
  id: string;
  title: string;
  description: string;
  generation: string;
  jobCode: string;
  code?: string;
  status: string;
  korea: boolean;
  applications: any[];
  applicationsCount: number;
  createdAt?: any;
}

interface JobCodeWithId {
  id: string;
  generation: string;
  code: string;
  name: string;
}

export function JobBoardManageScreen({
  navigation,
}: AdminStackScreenProps<'JobBoardManage'>) {
  const [jobBoards, setJobBoards] = useState<JobBoardWithApplications[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'active' | 'closed'>('active');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);

      // 모든 공고 로드
      const boards = await getAllJobBoards(db);

      // 각 공고의 지원 수 가져오기
      logger.info('📋 총 공고 수:', boards.length);
      const jobBoardsWithApplications = await Promise.all(
        boards.map(async (board: any) => {
          try {
            logger.info(`🔍 공고 ID ${board.id} (${board.title})의 지원자 조회 중...`);
            const applications = await getApplicationsByJobBoardId(db, board.id);
            logger.info(`✅ 공고 ID ${board.id}: ${applications.length}명의 지원자 발견`);
            return {
              ...board,
              applications,
              applicationsCount: applications.length,
            };
          } catch (error) {
            logger.error(`❌ 지원 정보 로드 오류 (${board.id}):`, error);
            return {
              ...board,
              applications: [],
              applicationsCount: 0,
            };
          }
        })
      );

      // 최신순 정렬
      const sortedBoards = jobBoardsWithApplications.sort(
        (a, b) => b.createdAt?.seconds - a.createdAt?.seconds
      );

      setJobBoards(sortedBoards);
    } catch (error) {
      logger.error('데이터 로드 오류:', error);
      Alert.alert('오류', '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 필터링된 공고 목록
  const filteredJobBoards = jobBoards.filter((board) => board.status === filterStatus);

  // 상태별 지원자 수 계산
  const getApplicationStatusCounts = (applications: any[]) => {
    return {
      pending: applications.filter((app) => app.applicationStatus === 'pending').length,
      interview: applications.filter((app) => app.interviewStatus === 'pending').length,
      complete: applications.filter((app) => app.interviewStatus === 'complete').length,
      passed: applications.filter((app) => app.interviewStatus === 'passed').length,
      finalAccepted: applications.filter((app) => app.finalStatus === 'finalAccepted')
        .length,
    };
  };

  // 공고 클릭 시 상세 페이지로 이동
  const handleBoardPress = (board: JobBoardWithApplications) => {
    navigation.navigate('JobBoardApplicants', { jobBoardId: board.id });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>지원 유저 관리</Text>
            <Text style={styles.headerSubtitle}>공고별 지원자를 확인하고 관리합니다</Text>
          </View>
        </View>

        {/* 필터 섹션 */}
        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>공고 상태</Text>
          <View style={styles.filterButtons}>
            <TouchableOpacity
              style={[
                styles.filterButton,
                filterStatus === 'active' && styles.filterButtonActive,
              ]}
              onPress={() => setFilterStatus('active')}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  filterStatus === 'active' && styles.filterButtonTextActive,
                ]}
              >
                모집중 ({jobBoards.filter((b) => b.status === 'active').length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterButton,
                filterStatus === 'closed' && styles.filterButtonActive,
              ]}
              onPress={() => setFilterStatus('closed')}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  filterStatus === 'closed' && styles.filterButtonTextActive,
                ]}
              >
                마감공고 ({jobBoards.filter((b) => b.status === 'closed').length})
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 로딩 상태 */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#f59e0b" />
            <Text style={styles.loadingText}>지원 정보를 불러오는 중...</Text>
          </View>
        ) : filteredJobBoards.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color="#9ca3af" />
            <Text style={styles.emptyStateText}>
              {filterStatus === 'active' ? '모집중인 공고가 없습니다.' : '마감된 공고가 없습니다.'}
            </Text>
          </View>
        ) : (
          <View style={styles.listSection}>
            {filteredJobBoards.map((board) => {
              const statusCounts = getApplicationStatusCounts(board.applications);

              return (
                <TouchableOpacity
                  key={board.id}
                  style={styles.boardCard}
                  onPress={() => handleBoardPress(board)}
                  activeOpacity={0.7}
                >
                  {/* 공고 헤더 */}
                  <View style={styles.boardCardHeader}>
                    <View style={styles.boardInfo}>
                      <Text style={styles.boardTitle}>{board.title}</Text>
                      <Text style={styles.boardSubtitle}>
                        {board.generation} ({board.jobCode || board.code})
                      </Text>
                      <View style={styles.badgeContainer}>
                        <View
                          style={[
                            styles.badge,
                            board.status === 'active'
                              ? styles.badgeActive
                              : styles.badgeClosed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              board.status === 'active'
                                ? styles.badgeTextActive
                                : styles.badgeTextClosed,
                            ]}
                          >
                            {board.status === 'active' ? '모집중' : '마감'}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.badge,
                            board.korea ? styles.badgeDomestic : styles.badgeOverseas,
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              board.korea
                                ? styles.badgeTextDomestic
                                : styles.badgeTextOverseas,
                            ]}
                          >
                            {board.korea ? '국내' : '해외'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color="#9ca3af" />
                  </View>

                  {/* 지원자 통계 */}
                  <View style={styles.statsSection}>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>총 지원자</Text>
                      <Text style={styles.statValue}>{board.applicationsCount}명</Text>
                    </View>
                    <View style={styles.statDetailRow}>
                      <View style={styles.statDetail}>
                        <View style={[styles.statDot, { backgroundColor: '#06b6d4' }]} />
                        <Text style={styles.statDetailText}>서류: {statusCounts.pending}</Text>
                      </View>
                      <View style={styles.statDetail}>
                        <View style={[styles.statDot, { backgroundColor: '#eab308' }]} />
                        <Text style={styles.statDetailText}>면접: {statusCounts.interview}</Text>
                      </View>
                      <View style={styles.statDetail}>
                        <View style={[styles.statDot, { backgroundColor: '#a855f7' }]} />
                        <Text style={styles.statDetailText}>완료: {statusCounts.complete}</Text>
                      </View>
                      <View style={styles.statDetail}>
                        <View style={[styles.statDot, { backgroundColor: '#22c55e' }]} />
                        <Text style={styles.statDetailText}>합격: {statusCounts.passed}</Text>
                      </View>
                      <View style={styles.statDetail}>
                        <View style={[styles.statDot, { backgroundColor: '#6366f1' }]} />
                        <Text style={styles.statDetailText}>최종: {statusCounts.finalAccepted}</Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  scrollView: {
    flex: 1,
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
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  filterSection: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
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
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  boardCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  boardCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  boardInfo: {
    flex: 1,
  },
  boardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  boardSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  badgeContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeActive: {
    backgroundColor: '#d1fae5',
  },
  badgeClosed: {
    backgroundColor: '#fee2e2',
  },
  badgeDomestic: {
    backgroundColor: '#dbeafe',
  },
  badgeOverseas: {
    backgroundColor: '#f3e8ff',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeTextActive: {
    color: '#047857',
  },
  badgeTextClosed: {
    color: '#dc2626',
  },
  badgeTextDomestic: {
    color: '#1e40af',
  },
  badgeTextOverseas: {
    color: '#7e22ce',
  },
  statsSection: {
    padding: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  statDetailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statDetailText: {
    fontSize: 12,
    color: '#6b7280',
  },
});
