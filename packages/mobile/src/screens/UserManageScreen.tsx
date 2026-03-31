import React, { useState, useEffect } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../config/firebase';
import { adminGetAllUsers, getScoreColor } from '@smis-mentor/shared';

export function UserManageScreen({ navigation }: any) {
  const [users, setUsers] = useState<any[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<string>('mentor');

  const roleFilters = [
    { value: 'mentor', label: '멘토' },
    { value: 'foreign', label: '원어민' },
    { value: 'admin', label: '관리자' },
    { value: 'mentor_temp', label: '멘토(임시)' },
    { value: 'foreign_temp', label: '원어민(임시)' },
    { value: 'deleted', label: '탈퇴' },
  ];

  useEffect(() => {
    loadUsers();
  }, [selectedRole]);

  useEffect(() => {
    filterUsers();
  }, [searchText, selectedRole, users]);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      logger.info('🔍 Loading users, db:', db, 'selectedRole:', selectedRole);
      
      // 탈퇴 토글 선택 시에만 삭제된 사용자 포함
      const includeDeleted = selectedRole === 'deleted';
      const allUsers = await adminGetAllUsers(db, includeDeleted);
      
      // 탈퇴 토글이 아닐 때는 삭제된 사용자를 완전히 제외
      const filteredByStatus = includeDeleted 
        ? allUsers 
        : allUsers.filter(user => user.status !== 'deleted' && user.status !== 'inactive');
      
      logger.info('✅ Users loaded:', filteredByStatus.length);
      // 최신순 정렬
      filteredByStatus.sort((a: any, b: any) => {
        const dateA = a.createdAt?.seconds || 0;
        const dateB = b.createdAt?.seconds || 0;
        return dateB - dateA;
      });
      setUsers(filteredByStatus);
    } catch (error) {
      logger.error('사용자 목록 로딩 실패:', error);
      Alert.alert('오류', '사용자 정보를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = [...users];

    logger.info('🔍 필터링 시작:', {
      totalUsers: users.length,
      selectedRole,
      users: users.map(u => ({ name: u.name, role: u.role, status: u.status }))
    });

    // 역할 필터링
    if (selectedRole === 'deleted') {
      // 탈퇴 버튼 선택 시: 삭제된 사용자만 표시 (status가 'deleted'이거나 'inactive'인 경우)
      filtered = filtered.filter((user) => {
        return user.status === 'deleted' || user.status === 'inactive';
      });
      logger.info('✅ 탈퇴 사용자 필터링 결과:', filtered.length, '명');
    } else {
      // 일반 역할 선택 시: 해당 역할이면서 삭제되지 않은 사용자만 표시
      filtered = filtered.filter((user) => {
        return user.role === selectedRole && 
               user.status !== 'deleted' && 
               user.status !== 'inactive';
      });
      logger.info(`✅ ${selectedRole} 역할 필터링 결과:`, filtered.length, '명');
    }

    // 검색어 필터링
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(
        (user) =>
          user.name?.toLowerCase().includes(searchLower) ||
          user.email?.toLowerCase().includes(searchLower) ||
          user.phoneNumber?.includes(searchText)
      );
    }

    setFilteredUsers(filtered);
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return '#9333ea';
      case 'mentor':
        return '#3b82f6';
      case 'foreign':
        return '#10b981';
      case 'mentor_temp':
        return '#94a3b8';
      case 'foreign_temp':
        return '#94a3b8';
      default:
        return '#6b7280';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return '관리자';
      case 'mentor':
        return '멘토';
      case 'foreign':
        return '원어민';
      case 'mentor_temp':
        return '멘토(임시)';
      case 'foreign_temp':
        return '원어민(임시)';
      default:
        return '사용자';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#10b981';
      case 'inactive':
        return '#ef4444';
      case 'deleted':
        return '#9ca3af';
      default:
        return '#eab308';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return '활성';
      case 'inactive':
        return '비활성';
      case 'deleted':
        return '삭제됨';
      default:
        return '임시';
    }
  };

  const formatPhoneNumber = (phoneNumber: string) => {
    if (!phoneNumber) return '-';
    if (phoneNumber.length === 11) {
      return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3, 7)}-${phoneNumber.slice(7)}`;
    }
    return phoneNumber;
  };

  const renderUserItem = ({ item }: { item: any }) => {
    const summary = item.evaluationSummary;
    const stages = [
      { key: 'documentReview', label: '서류' },
      { key: 'interview', label: '면접' },
      { key: 'faceToFaceEducation', label: '교육' },
      { key: 'campLife', label: '캠프' }
    ];

    return (
      <TouchableOpacity
        style={styles.userCard}
        onPress={() => {
          navigation.navigate('UserManageDetail', { user: item });
        }}
        activeOpacity={0.7}
      >
        <View style={styles.userHeader}>
          <View style={styles.avatar}>
            {item.profileImage ? (
              <Image
                source={{ uri: item.profileImage }}
                style={styles.avatarImage}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
                placeholder={require('../../assets/icon.png')}
                placeholderContentFit="contain"
              />
            ) : (
              <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
            )}
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{item.name}</Text>
            <Text style={styles.userPhone}>{formatPhoneNumber(item.phoneNumber)}</Text>
            
            {/* 평가 점수 */}
            <View style={styles.evaluationScores}>
              {stages.map((stage) => {
                const stageData = summary?.[stage.key];
                const avgScore = stageData?.averageScore;
                const color = avgScore !== undefined ? getScoreColor(avgScore) : '#9CA3AF';
                
                return (
                  <View key={stage.key} style={styles.scoreItem}>
                    <Text style={styles.scoreLabel}>{stage.label}: </Text>
                    <Text style={[styles.scoreValue, { color }]}>
                      {avgScore !== undefined ? avgScore.toFixed(1) : '-'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>사용자 관리</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="이름, 이메일 또는 전화번호로 검색"
            value={searchText}
            onChangeText={setSearchText}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Ionicons name="close-circle" size={20} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filterContainer}>
          {roleFilters.map((filter) => (
            <TouchableOpacity
              key={filter.value}
              style={[
                styles.filterButton,
                selectedRole === filter.value && styles.filterButtonActive,
              ]}
              onPress={() => setSelectedRole(filter.value)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  selectedRole === filter.value && styles.filterButtonTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      ) : (
        <>
          <View style={styles.countContainer}>
            <Text style={styles.countText}>{filteredUsers.length}명</Text>
          </View>
          <FlatList
            data={filteredUsers}
            renderItem={renderUserItem}
            keyExtractor={(item, index) => item.userId || `user-${index}`}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={64} color="#d1d5db" />
                <Text style={styles.emptyText}>검색 결과가 없습니다</Text>
              </View>
            }
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
  },
  filterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterButtonActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  countContainer: {
    padding: 16,
    backgroundColor: '#f9fafb',
  },
  countText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  listContainer: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#6b7280',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  userPhone: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  evaluationScores: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scoreItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 11,
    color: '#6b7280',
  },
  scoreValue: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#9ca3af',
    marginTop: 16,
  },
});
