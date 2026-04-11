import React, { useState, useEffect } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { MainTabScreenProps } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { useCampTab } from '../context/CampTabContext';
import { jobCodesService, JobCode } from '../services';
import { getTasksByCampCode } from '../services/taskService';
import { getApplicationsByUserId } from '../services/recruitmentService';
import type { Task } from '../../../shared/src/types/camp';
import type { ApplicationHistory } from '../../../shared/src/types';

export function HomeScreen({ navigation }: MainTabScreenProps<'Home'>) {
  const { userData, loading: authLoading } = useAuth();
  const { setActiveTab } = useCampTab();
  const [activeJobCode, setActiveJobCode] = useState<JobCode | null>(null);
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [recentApplications, setRecentApplications] = useState<ApplicationHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 화면 포커스 시 데이터 새로고침
  useFocusEffect(
    React.useCallback(() => {
      loadHomeData();
    }, [userData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHomeData();
    setRefreshing(false);
  };

  const loadHomeData = async () => {
    if (!userData) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // 활성 캠프 코드 정보 로드
      if (userData.activeJobExperienceId) {
        const jobCode = await jobCodesService.getJobCodeById(userData.activeJobExperienceId);
        setActiveJobCode(jobCode);

        // 오늘과 다가오는 업무 로드
        if (jobCode?.code) {
          const allTasks = await getTasksByCampCode(jobCode.code);
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          const today = now.getTime();

          // 사용자 역할 가져오기
          const userExp = userData.jobExperiences?.find(
            exp => exp.id === userData.activeJobExperienceId
          );
          const userRole = userExp?.groupRole;

          // 역할에 맞는 업무만 필터링
          const userTasks = allTasks.filter(task => {
            if (userData.role === 'admin') return true;
            if (!userRole) return false;
            return task.targetRoles.includes(userRole as any);
          });

          // 오늘의 업무
          const todayTasksList = userTasks.filter(task => {
            const taskDate = new Date(task.date.toDate());
            taskDate.setHours(0, 0, 0, 0);
            return taskDate.getTime() === today;
          }).sort((a, b) => {
            // 시간 순으로 정렬
            if (a.time && b.time) {
              return a.time.localeCompare(b.time);
            }
            // 시간이 있는 것이 우선
            if (a.time && !b.time) return -1;
            if (!a.time && b.time) return 1;
            return 0;
          });

          setTodayTasks(todayTasksList);
        }
      }

      // 최근 지원 내역 로드
      if (userData.userId) {
        const applications = await getApplicationsByUserId(userData.userId);
        setRecentApplications(applications.slice(0, 3));
      }
    } catch (error) {
      logger.error('홈 데이터 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };


  const getApplicationStatus = (status: string): { label: string; color: string } => {
    switch (status) {
      case 'pending':
        return { label: '대기중', color: '#f59e0b' };
      case 'accepted':
        return { label: '합격', color: '#10b981' };
      case 'rejected':
        return { label: '불합격', color: '#ef4444' };
      default:
        return { label: status, color: '#64748b' };
    }
  };

  const getCurrentTimeGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return '좋은 아침이에요';
    if (hour < 18) return '좋은 오후에요';
    return '좋은 저녁이에요';
  };

  const formatTaskDateTime = (task: Task): string => {
    const date = task.date.toDate();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekday = weekdays[date.getDay()];
    
    if (task.time) {
      return `${month}/${day}(${weekday}) ${task.time}`;
    }
    return `${month}/${day}(${weekday})`;
  };

  if (authLoading || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>로딩 중...</Text>
      </View>
    );
  }

  if (!userData) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Ionicons name="log-in-outline" size={64} color="#94a3b8" />
          <Text style={styles.emptyTitle}>로그인이 필요합니다</Text>
          <Text style={styles.emptySubtitle}>
            마이페이지에서 로그인해주세요
          </Text>
        </View>
      </View>
    );
  }

  const completedTodayCount = todayTasks.filter(task => 
    task.completions.some(c => c.userId === userData.userId)
  ).length;

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.content}>
        {/* 환영 헤더 */}
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeContent}>
            <View style={styles.welcomeTextContainer}>
              <Text style={styles.welcomeGreeting}>{getCurrentTimeGreeting()},</Text>
              <Text style={styles.welcomeName}>{userData.name}님!</Text>
            </View>
            {userData.profileImage ? (
              <Image
                source={{ uri: userData.profileImage }}
                style={styles.profileImage}
              />
            ) : (
              <View style={styles.profilePlaceholder}>
                <Text style={styles.profilePlaceholderText}>
                  {userData.name.charAt(0)}
                </Text>
              </View>
            )}
          </View>
          
          {activeJobCode && (
            <View style={styles.campInfoRow}>
              <View style={styles.activeJobCodeBadge}>
                <Ionicons name="school" size={14} color="#3b82f6" />
                <Text style={styles.activeJobCodeText}>
                  {activeJobCode.generation} {activeJobCode.name}
                </Text>
              </View>
              
              {todayTasks.length > 0 && (
                <View style={styles.todayProgressBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#10b981" />
                  <Text style={styles.todayProgressText}>
                    {completedTodayCount}/{todayTasks.length} 완료
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* 빠른 액션 버튼 */}
        <View style={styles.quickActionsCard}>
          <View style={styles.quickActionsRow}>
            <TouchableOpacity
              style={[styles.quickActionButton, { backgroundColor: '#eff6ff' }]}
              onPress={async () => {
                await setActiveTab('schedule');
                navigation.navigate('Camp');
              }}
            >
              <Ionicons name="calendar-outline" size={24} color="#3b82f6" />
              <Text style={[styles.quickActionText, { color: '#1e40af' }]}>시간표</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickActionButton, { backgroundColor: '#f0fdf4' }]}
              onPress={async () => {
                await setActiveTab('tasks');
                navigation.navigate('Camp');
              }}
            >
              <Ionicons name="checkmark-done-outline" size={24} color="#10b981" />
              <Text style={[styles.quickActionText, { color: '#065f46' }]}>업무</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickActionButton, { backgroundColor: '#fef3c7' }]}
              onPress={() => navigation.navigate('Recruitment')}
            >
              <Ionicons name="briefcase-outline" size={24} color="#f59e0b" />
              <Text style={[styles.quickActionText, { color: '#92400e' }]}>채용</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickActionButton, { backgroundColor: '#fae8ff' }]}
              onPress={async () => {
                await setActiveTab('guide');
                navigation.navigate('Camp');
              }}
            >
              <Ionicons name="map-outline" size={24} color="#a855f7" />
              <Text style={[styles.quickActionText, { color: '#6b21a8' }]}>인솔표</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 오늘의 업무 */}
        {todayTasks.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="today" size={20} color="#3b82f6" />
                <Text style={styles.sectionTitle}>오늘의 업무</Text>
              </View>
              <TouchableOpacity onPress={async () => {
                await setActiveTab('tasks');
                navigation.navigate('Camp');
              }}>
                <Text style={styles.sectionLink}>더보기 →</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.tasksList}>
              {todayTasks.map((task) => {
                const isCompleted = task.completions.some(c => c.userId === userData.userId);
                return (
                  <View key={task.id} style={styles.simpleTaskItem}>
                    <View style={styles.taskLeftSection}>
                      <View style={[
                        styles.taskBullet,
                        isCompleted && styles.taskBulletCompleted
                      ]} />
                      <Text 
                        style={[
                          styles.simpleTaskTitle,
                          isCompleted && styles.simpleTaskTitleCompleted
                        ]} 
                        numberOfLines={2}
                      >
                        {task.title}
                      </Text>
                    </View>
                    <Text 
                      style={[
                        styles.simpleTaskDateTime,
                        isCompleted && styles.simpleTaskDateTimeCompleted
                      ]}
                    >
                      {formatTaskDateTime(task)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* 최근 지원 현황 */}
        {recentApplications.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="document-text" size={20} color="#f59e0b" />
                <Text style={styles.sectionTitle}>지원 현황</Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('Recruitment')}>
                <Text style={styles.sectionLink}>더보기 →</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.applicationsList}>
              {recentApplications.map((application) => {
                const statusInfo = getApplicationStatus(application.applicationStatus);
                return (
                  <View key={application.applicationHistoryId} style={styles.applicationItem}>
                    <View style={styles.applicationContent}>
                      <Text style={styles.applicationCompany} numberOfLines={1}>
                        {application.refJobBoardId}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
                        <Text style={styles.statusText}>{statusInfo.label}</Text>
                      </View>
                    </View>
                    {application.applicationDate && (
                      <Text style={styles.applicationDate}>
                        {new Date(application.applicationDate.seconds * 1000).toLocaleDateString('ko-KR', {
                          month: 'long',
                          day: 'numeric'
                        })}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* 빈 상태 */}
        {!activeJobCode && todayTasks.length === 0 && recentApplications.length === 0 && (
          <View style={styles.emptyDataCard}>
            <Ionicons name="rocket-outline" size={48} color="#94a3b8" />
            <Text style={styles.emptyDataTitle}>시작하기</Text>
            <Text style={styles.emptyDataText}>
              마이페이지에서 캠프를 선택하고{'\n'}
              업무와 일정을 확인해보세요!
            </Text>
            <TouchableOpacity 
              style={styles.emptyDataButton}
              onPress={() => navigation.navigate('Profile')}
            >
              <Text style={styles.emptyDataButtonText}>캠프 선택하기</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
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
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },

  // 환영 카드
  welcomeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  welcomeContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  welcomeTextContainer: {
    flex: 1,
  },
  welcomeGreeting: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 2,
  },
  welcomeName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1e293b',
  },
  profileImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#e2e8f0',
  },
  profilePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#93c5fd',
  },
  profilePlaceholderText: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  campInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  activeJobCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
    flex: 1,
  },
  activeJobCodeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e40af',
  },
  todayProgressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  todayProgressText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065f46',
  },

  // 빠른 액션
  quickActionsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // 섹션 카드
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e293b',
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3b82f6',
  },

  // 오늘의 업무 목록 (간단한 리스트)
  tasksList: {
    gap: 8,
  },
  simpleTaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    gap: 12,
  },
  taskLeftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  taskBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3b82f6',
    flexShrink: 0,
  },
  taskBulletCompleted: {
    backgroundColor: '#94a3b8',
  },
  simpleTaskTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
    flex: 1,
  },
  simpleTaskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  simpleTaskDateTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
    marginLeft: 8,
    flexShrink: 0,
  },
  simpleTaskDateTimeCompleted: {
    color: '#94a3b8',
  },

  // 지원 내역
  applicationsList: {
    gap: 10,
  },
  applicationItem: {
    padding: 14,
    backgroundColor: '#fafafa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  applicationContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  applicationCompany: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
    marginRight: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  applicationDate: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },

  // 빈 상태
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
  },
  emptyDataCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyDataTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDataText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  emptyDataButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyDataButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
});
