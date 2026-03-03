import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RecruitmentStackScreenProps } from '../navigation/types';
import {
  getAllJobBoards,
  getJobCodeById,
  JobBoardWithId,
  JobCodeWithId,
} from '../services/jobBoardService';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RecruitmentStackParamList, MainTabsParamList } from '../navigation/types';

type Props = CompositeScreenProps<
  NativeStackScreenProps<RecruitmentStackParamList, 'RecruitmentList'>,
  BottomTabScreenProps<MainTabsParamList>
>;

export function RecruitmentListScreen({ navigation }: Props) {
  const { userData } = useAuth();
  const [jobBoards, setJobBoards] = useState<JobBoardWithId[]>([]);
  const [jobCodesMap, setJobCodesMap] = useState<{
    [key: string]: JobCodeWithId;
  }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<'active' | 'closed'>('active');

  const isAdmin = userData?.role === 'admin';

  useEffect(() => {
    loadJobBoards();
  }, []);

  const loadJobBoards = async () => {
    try {
      setIsLoading(true);
      const boards = await getAllJobBoards();
      const sortedBoards = boards.sort(
        (a, b) => b.createdAt.seconds - a.createdAt.seconds
      );

      const jobCodeIds = sortedBoards.map((board) => board.refJobCodeId);
      const uniqueJobCodeIds = [...new Set(jobCodeIds)];
      const jobCodesData: { [key: string]: JobCodeWithId } = {};

      for (const id of uniqueJobCodeIds) {
        const jobCode = await getJobCodeById(id);
        if (jobCode) {
          jobCodesData[id] = jobCode;
        }
      }

      setJobCodesMap(jobCodesData);
      setJobBoards(sortedBoards);
    } catch (error) {
      console.error('공고 정보 로드 오류:', error);
      Alert.alert('오류', '공고 정보를 불러오는 중 오류가 발생했습니다.');
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
    return `${year}.${month}.${day}(${dayOfWeek})`;
  };

  // 필터링된 공고 목록 (일반 유저는 active만, 관리자는 선택한 상태)
  const filteredJobBoards = jobBoards.filter((board) => {
    if (!isAdmin) {
      return board.status === 'active';
    }
    return board.status === selectedStatus;
  });

  const renderJobBoard = ({ item }: { item: JobBoardWithId }) => {
    const jobCode = jobCodesMap[item.refJobCodeId];
    const startDate = jobCode
      ? formatDate(jobCode.startDate)
      : formatDate(item.educationStartDate);
    const endDate = jobCode
      ? formatDate(jobCode.endDate)
      : formatDate(item.educationEndDate);
    const location = jobCode ? jobCode.location : item.jobCode;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('JobBoardDetail', { jobBoardId: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.badgeContainer}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.generation}</Text>
            </View>
            <View
              style={[
                styles.badge,
                item.korea ? styles.badgeGreen : styles.badgePurple,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  item.korea
                    ? styles.badgeTextGreen
                    : styles.badgeTextPurple,
                ]}
              >
                {item.korea ? '국내' : '해외'}
              </Text>
            </View>
            <View
              style={[
                styles.badge,
                item.status === 'active'
                  ? styles.badgeEmerald
                  : styles.badgeGray,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  item.status === 'active'
                    ? styles.badgeTextEmerald
                    : styles.badgeTextGray,
                ]}
              >
                {item.status === 'active' ? '모집중' : '마감'}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.cardTitle}>{item.title}</Text>

        <View style={styles.infoContainer}>
          <View style={styles.infoRow}>
            <Text style={styles.icon}>📅</Text>
            <Text style={styles.infoText}>
              {startDate} ~ {endDate}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.icon}>📍</Text>
            <Text style={styles.infoText}>{location}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.footerText}>자세히 보기</Text>
          <Text style={styles.arrow}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* 관리자 컨트롤 영역 */}
      {isAdmin && (
        <View style={styles.adminControls}>
          <View style={styles.filterButtons}>
            <TouchableOpacity
              style={[
                styles.filterButton,
                selectedStatus === 'active' && styles.filterButtonActive,
              ]}
              onPress={() => setSelectedStatus('active')}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  selectedStatus === 'active' && styles.filterButtonTextActive,
                ]}
              >
                모집중
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterButton,
                selectedStatus === 'closed' && styles.filterButtonActive,
              ]}
              onPress={() => setSelectedStatus('closed')}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  selectedStatus === 'closed' && styles.filterButtonTextActive,
                ]}
              >
                마감
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => navigation.navigate('JobBoardWrite')}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.createButtonText}>공고 작성</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : filteredJobBoards.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {!isAdmin
              ? '현재 모집 중인 공고가 없습니다.'
              : selectedStatus === 'active'
              ? '현재 모집 중인 공고가 없습니다.'
              : '마감된 공고가 없습니다.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredJobBoards}
          renderItem={renderJobBoard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  adminControls: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 12,
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
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: 'hidden',
  },
  cardHeader: {
    padding: 16,
    paddingBottom: 12,
  },
  badgeContainer: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
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
    fontSize: 12,
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
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  infoContainer: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 16,
    marginRight: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#6b7280',
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  footerText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  arrow: {
    fontSize: 20,
    color: '#9ca3af',
  },
});
