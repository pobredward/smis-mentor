import React, { useState, useEffect } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../config/firebase';
import { adminGetAllJobCodes, adminGetUsersByJobCode, getGenerationCodes, filterMaterialsByGeneration, filterSectionsWithLinks } from '@smis-mentor/shared';
import { getGroupLabel } from '../../../shared/src/types/camp';
import { AdminStackScreenProps } from '../navigation/types';
import { getLessonMaterials, getSections, getLessonMaterialTemplates, LessonMaterialData, SectionData, LessonMaterialTemplate } from '../services/lessonMaterialService';

interface JobCodeWithId {
  id: string;
  generation: string;
  code: string;
  name: string;
  location: string;
  korea: boolean;
}

interface UserWithGroupInfo {
  userId: string;
  name: string;
  email: string;
  phoneNumber?: string;
  phone?: string;
  role: string;
  status: string;
  profileImage?: string;
  jobExperiences?: any[];
  groupName?: string;
  groupRole?: string;
  classCode?: string;
  gender?: string;
  age?: number;
  rrnFront?: string;
  rrnLast?: string;
  address?: string;
  addressDetail?: string;
  university?: string;
  grade?: number;
  isOnLeave?: boolean | null;
  major1?: string;
  major2?: string;
}

// 그룹 이름 매핑 - getGroupLabel 함수 사용으로 대체 가능하지만 기존 구조 유지
const groupLabels: Record<string, string> = {
  junior: '주니어',
  middle: '미들',
  senior: '시니어',
  spring: '스프링',
  summer: '서머',
  autumn: '어텀',
  winter: '윈터',
  common: '공통',
  manager: '매니저',
};

// 그룹 색상 매핑
const groupColors: Record<string, { bg: string; text: string }> = {
  junior: { bg: '#d1fae5', text: '#065f46' },
  middle: { bg: '#fef3c7', text: '#92400e' },
  senior: { bg: '#fee2e2', text: '#991b1b' },
  spring: { bg: '#dbeafe', text: '#1e40af' },
  summer: { bg: '#e9d5ff', text: '#6b21a8' },
  autumn: { bg: '#fed7aa', text: '#9a3412' },
  winter: { bg: '#fce7f3', text: '#9f1239' },
  common: { bg: '#f3f4f6', text: '#374151' },
  manager: { bg: '#e5e7eb', text: '#111827' },
};

const groupOrder = [
  'manager',
  'common',
  'junior',
  'middle',
  'senior',
  'spring',
  'summer',
  'autumn',
  'winter',
];

export function UserCheckScreen({ navigation }: AdminStackScreenProps<'UserCheck'>) {
  const [jobCodes, setJobCodes] = useState<JobCodeWithId[]>([]);
  const [generations, setGenerations] = useState<string[]>([]);
  const [selectedGeneration, setSelectedGeneration] = useState<string>('');
  const [codesForGeneration, setCodesForGeneration] = useState<JobCodeWithId[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [users, setUsers] = useState<UserWithGroupInfo[]>([]);
  const [groupedUsers, setGroupedUsers] = useState<Record<string, UserWithGroupInfo[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserWithGroupInfo | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('mentor');
  
  const roleFilters = [
    { value: 'mentor', label: '멘토' },
    { value: 'foreign', label: '원어민' }
  ];

  // 모든 JobCode 및 Generation 로드
  useEffect(() => {
    const loadJobCodes = async () => {
      try {
        setIsLoading(true);
        const codes = await adminGetAllJobCodes(db);
        setJobCodes(codes);

        // 기수 목록 추출 (중복 제거)
        const uniqueGenerations = Array.from(
          new Set(codes.map((code) => code.generation))
        ).sort((a, b) => {
          const numA = parseInt(a.replace(/[^0-9]/g, ''));
          const numB = parseInt(b.replace(/[^0-9]/g, ''));
          return numB - numA; // 내림차순
        });

        setGenerations(uniqueGenerations);

        // 기본 선택: 가장 최근 기수
        if (uniqueGenerations.length > 0) {
          setSelectedGeneration(uniqueGenerations[0]);
        }
      } catch (error) {
        logger.error('업무 코드 로드 오류:', error);
        Alert.alert('오류', '업무 코드를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    loadJobCodes();
  }, []);

  // 선택된 기수에 따라 코드 필터링
  useEffect(() => {
    if (!selectedGeneration) {
      setCodesForGeneration([]);
      return;
    }

    // 커스텀 정렬: J, E, S, F, G, K 순서 우선, 나머지는 알파벳 순서
    const priorityOrder = ['J', 'E', 'S', 'F', 'G', 'K'];
    
    const filteredCodes = jobCodes
      .filter((code) => code.generation === selectedGeneration)
      .sort((a, b) => {
        const aFirstChar = a.code.charAt(0).toUpperCase();
        const bFirstChar = b.code.charAt(0).toUpperCase();
        
        const aPriority = priorityOrder.indexOf(aFirstChar);
        const bPriority = priorityOrder.indexOf(bFirstChar);
        
        // 둘 다 우선순위에 있는 경우
        if (aPriority !== -1 && bPriority !== -1) {
          if (aPriority !== bPriority) return aPriority - bPriority;
          return a.code.localeCompare(b.code);
        }
        
        // a만 우선순위에 있는 경우
        if (aPriority !== -1) return -1;
        
        // b만 우선순위에 있는 경우
        if (bPriority !== -1) return 1;
        
        // 둘 다 우선순위에 없는 경우 알파벳 순서
        return a.code.localeCompare(b.code);
      });
    setCodesForGeneration(filteredCodes);

    // 기본 선택: 첫번째 코드
    if (filteredCodes.length > 0) {
      setSelectedCode(filteredCodes[0].code);
    } else {
      setSelectedCode('');
    }
  }, [selectedGeneration, jobCodes]);

  // 선택된 기수와 코드에 따라 사용자 로드 및 그룹화
  useEffect(() => {
    const loadUsers = async () => {
      if (!selectedGeneration || !selectedCode) {
        setUsers([]);
        setGroupedUsers({});
        return;
      }

      try {
        setIsLoading(true);
        const usersData = await adminGetUsersByJobCode(db, selectedGeneration, selectedCode);

        // 각 사용자의 그룹 정보 가져오기
        const enrichedUsers = usersData.map((user: any) => {
          if (user.jobExperiences && user.jobExperiences.length > 0) {
            let jobGroup = 'junior'; // 기본값
            let groupRole = '';
            let classCode = '';

            // 새 형식 (객체 배열)인 경우
            if (typeof user.jobExperiences[0] === 'object') {
              // 선택된 코드와 일치하는 경험 찾기
              const jobCode = jobCodes.find(
                (code) => code.generation === selectedGeneration && code.code === selectedCode
              );

              const relevantExperience = user.jobExperiences.find(
                (exp: any) => jobCode && exp.id === jobCode.id
              );

              if (relevantExperience) {
                // groupRole이 '매니저', '부매니저' 또는 'Manager', 'Sub Manager'인 경우 manager 그룹으로 분류
                if (
                  relevantExperience.groupRole === '매니저' || 
                  relevantExperience.groupRole === '부매니저' ||
                  relevantExperience.groupRole === 'Manager' || 
                  relevantExperience.groupRole === 'Sub Manager'
                ) {
                  jobGroup = 'manager';
                } else if ('group' in relevantExperience) {
                  jobGroup = relevantExperience.group;
                }
                if ('groupRole' in relevantExperience) {
                  groupRole = relevantExperience.groupRole;
                }
                if ('classCode' in relevantExperience) {
                  classCode = relevantExperience.classCode;
                }
              }
            }

            return {
              ...user,
              groupName: jobGroup,
              groupRole,
              classCode,
            };
          }

          return {
            ...user,
            groupName: 'junior',
            groupRole: '',
            classCode: '',
          };
        });

        // role 필터링 적용
        // mentor 선택 시 mentor_temp, admin도 포함
        // foreign 선택 시 foreign_temp도 포함
        const filteredUsers = enrichedUsers.filter((user: UserWithGroupInfo) => {
          if (selectedRole === 'mentor') {
            return user.role === 'mentor' || user.role === 'mentor_temp' || user.role === 'admin';
          } else if (selectedRole === 'foreign') {
            return user.role === 'foreign' || user.role === 'foreign_temp';
          }
          return user.role === selectedRole;
        });

        setUsers(filteredUsers);

        // 그룹별로 사용자 분류
        const grouped: Record<string, UserWithGroupInfo[]> = {};
        filteredUsers.forEach((user: UserWithGroupInfo) => {
          const group = user.groupName || 'junior';
          if (!grouped[group]) {
            grouped[group] = [];
          }
          grouped[group].push(user);
        });

        setGroupedUsers(grouped);
      } catch (error) {
        logger.error('사용자 로드 오류:', error);
        Alert.alert('오류', '사용자를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    loadUsers();
  }, [selectedGeneration, selectedCode, jobCodes, selectedRole]);

  // 전화번호 포맷팅
  const formatPhoneNumber = (phone?: string): string => {
    if (!phone) return '-';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  // 수업자료 리스트 컴포넌트
  const UserLessonMaterials = ({ userId }: { userId: string }) => {
    const [materials, setMaterials] = useState<LessonMaterialData[]>([]);
    const [sectionsMap, setSectionsMap] = useState<Record<string, SectionData[]>>({});
    const [templates, setTemplates] = useState<LessonMaterialTemplate[]>([]);
    const [selectedGeneration, setSelectedGeneration] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      if (!userId) return;
      setIsLoading(true);
      setError(null);
      
      Promise.all([
        getLessonMaterials(userId),
        getLessonMaterialTemplates()
      ])
        .then(async ([fetchedMaterials, fetchedTemplates]) => {
          setMaterials(fetchedMaterials);
          setTemplates(fetchedTemplates);
          
          // 각 대제목별 소제목(섹션) 동시 조회하고 링크가 있는 것만 필터링
          const sectionsEntries = await Promise.all(
            fetchedMaterials.map(async (mat) => {
              const allSections = await getSections(mat.id);
              const filteredSections = filterSectionsWithLinks(allSections);
              return [mat.id, filteredSections];
            })
          );
          
          const filteredSectionsMap = Object.fromEntries(sectionsEntries);
          setSectionsMap(filteredSectionsMap);
          
          // 링크가 있는 섹션이 있는 자료만 표시하도록 필터링
          const materialsWithLinks = fetchedMaterials.filter(mat => 
            filteredSectionsMap[mat.id]?.length > 0
          );
          setMaterials(materialsWithLinks);
          
          // 기수 코드 추출 및 자동 선택
          if (materialsWithLinks.length > 0) {
            const codes = getGenerationCodes(materialsWithLinks, fetchedTemplates);
            if (codes.length > 0) {
              setSelectedGeneration(codes[0]); // 가장 최근 기수 선택
            }
          }
        })
        .catch(() => {
          setError('수업 자료를 불러오는 중 오류가 발생했습니다.');
        })
        .finally(() => setIsLoading(false));
    }, [userId]);

    // 기수 코드 목록 (내림차순)
    const generationCodes = getGenerationCodes(materials, templates);
    
    // 선택된 기수의 자료만 필터링
    const filteredMaterials = selectedGeneration 
      ? filterMaterialsByGeneration(materials, templates, selectedGeneration)
      : [];

    if (isLoading) {
      return (
        <View style={styles.lessonMaterialsContainer}>
          <ActivityIndicator size="small" color="#3b82f6" />
          <Text style={styles.lessonMaterialsLoading}>수업 자료 불러오는 중...</Text>
        </View>
      );
    }
    
    if (error) {
      return (
        <View style={styles.lessonMaterialsContainer}>
          <Text style={styles.lessonMaterialsError}>{error}</Text>
        </View>
      );
    }
    
    if (!materials.length) {
      return (
        <View style={styles.lessonMaterialsContainer}>
          <Text style={styles.lessonMaterialsEmpty}>등록된 수업 자료가 없습니다.</Text>
        </View>
      );
    }
    
    return (
      <View style={styles.lessonMaterialsContainer}>
        {/* 기수별 토글 (전체 제거, 내림차순) - 녹색 계열로 차별화 */}
        <View style={styles.lessonGenerationToggles}>
          {generationCodes.map(code => (
            <TouchableOpacity
              key={code}
              style={[
                styles.lessonGenerationToggle,
                selectedGeneration === code && styles.lessonGenerationToggleActive
              ]}
              onPress={() => setSelectedGeneration(code)}
            >
              <Text
                style={[
                  styles.lessonGenerationToggleText,
                  selectedGeneration === code && styles.lessonGenerationToggleTextActive
                ]}
              >
                {code}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        {/* 수업 자료 목록 */}
        <View style={styles.lessonMaterialsList}>
          {filteredMaterials.map((mat) => {
            const sections = sectionsMap[mat.id] || [];
            if (sections.length === 0) return null;
            
            return (
              <View key={mat.id} style={styles.lessonMaterialItem}>
                <Text style={styles.lessonMaterialTitle}>{mat.title}</Text>
                <View style={styles.lessonSectionsList}>
                  {sections.map((section) => (
                    <View key={section.id} style={styles.lessonSectionItem}>
                      <Text style={styles.lessonSectionTitle}>{section.title}</Text>
                      <View style={styles.lessonSectionButtons}>
                        {section.viewUrl && (
                          <TouchableOpacity
                            style={styles.lessonSectionButton}
                            onPress={() => Linking.openURL(section.viewUrl!)}
                          >
                            <Text style={styles.lessonSectionButtonText}>공개보기</Text>
                          </TouchableOpacity>
                        )}
                        {section.originalUrl && (
                          <TouchableOpacity
                            style={styles.lessonSectionButton}
                            onPress={() => Linking.openURL(section.originalUrl!)}
                          >
                            <Text style={styles.lessonSectionButtonText}>원본</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // 그룹별 사용자 렌더링 함수
  const renderGroupSection = ({ item: group }: { item: string }) => {
    let usersInGroup = groupedUsers[group] || [];
    
    // 정렬 로직
    usersInGroup = [...usersInGroup].sort((a, b) => {
      // manager 그룹인 경우: groupRole 순서 우선 (매니저 -> 부매니저 -> Manager -> Sub Manager)
      if (group === 'manager') {
        const roleOrder: Record<string, number> = {
          '매니저': 1,
          '부매니저': 2,
          'Manager': 3,
          'Sub Manager': 4,
        };
        const roleA = a.groupRole || '';
        const roleB = b.groupRole || '';
        const orderA = roleOrder[roleA] || 999;
        const orderB = roleOrder[roleB] || 999;
        
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        // 같은 역할이면 이름순
        return (a.name || '').localeCompare(b.name || '');
      }
      
      // 다른 그룹: classCode 오름차순, 없으면 맨 뒤, 이름순 2차
      const classCodeA = a.classCode;
      const classCodeB = b.classCode;
      if (classCodeA && classCodeB) {
        if (classCodeA < classCodeB) return -1;
        if (classCodeA > classCodeB) return 1;
        return (a.name || '').localeCompare(b.name || '');
      }
      if (classCodeA && !classCodeB) return -1;
      if (!classCodeA && classCodeB) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    
    if (!usersInGroup || usersInGroup.length === 0) return null;

    return (
      <View style={styles.groupSection}>
        <View
          style={[
            styles.groupHeader,
            { backgroundColor: groupColors[group]?.bg || '#f3f4f6' },
          ]}
        >
          <Text
            style={[
              styles.groupHeaderText,
              { color: groupColors[group]?.text || '#374151' },
            ]}
          >
            {groupLabels[group] || group}
          </Text>
          <Text
            style={[
              styles.groupCountBadge,
              { color: groupColors[group]?.text || '#374151' },
            ]}
          >
            {usersInGroup.length}명
          </Text>
        </View>

        {/* 그리드 레이아웃: 한 행에 3명씩 */}
        <View style={styles.userGrid}>
          {usersInGroup.map((user, index) => (
            <TouchableOpacity
              key={user.userId || index}
              style={styles.userGridItem}
              onPress={() => setSelectedUser(user)}
            >
              {/* 프로필 이미지 */}
              <View style={styles.profileImageContainer}>
                {user.profileImage ? (
                  <Image
                    source={{ uri: user.profileImage }}
                    style={styles.profileImage}
                    contentFit="cover"
                    transition={200}
                    cachePolicy="memory-disk"
                    placeholder={require('../../assets/icon.png')}
                    placeholderContentFit="contain"
                  />
                ) : (
                  <View style={styles.profilePlaceholder}>
                    <Text style={styles.profilePlaceholderText}>
                      {user.name.charAt(0)}
                    </Text>
                  </View>
                )}
                
                {/* 배지 (groupRole, classCode) */}
                <View style={styles.badgeContainer}>
                  {user.groupRole && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{user.groupRole}</Text>
                    </View>
                  )}
                  {user.classCode && (
                    <View style={[styles.badge, styles.badgeBlue]}>
                      <Text style={[styles.badgeText, styles.badgeTextBlue]}>
                        {user.classCode}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              
              {/* 이름 */}
              <Text style={styles.userGridName}>{user.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  // 필터링된 그룹 목록
  const visibleGroups = groupOrder.filter(group => 
    groupedUsers[group] && groupedUsers[group].length > 0
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>사용자 조회</Text>
          <Text style={styles.headerSubtitle}>
            캠프에 참여했던 유저를 기수별로 조회합니다
          </Text>
        </View>
      </View>

      {/* 필터 섹션 (고정) */}
      <View style={styles.stickyFilters}>
        {/* Role 필터 */}
        <View style={styles.filterSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {roleFilters.map((filter) => (
              <TouchableOpacity
                key={filter.value}
                style={[
                  styles.filterChip,
                  selectedRole === filter.value && styles.filterChipActiveRole,
                ]}
                onPress={() => setSelectedRole(filter.value)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedRole === filter.value && styles.filterChipTextActiveRole,
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* 기수 선택 */}
        <View style={styles.filterSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {generations.map((gen) => (
              <TouchableOpacity
                key={gen}
                style={[
                  styles.filterChip,
                  selectedGeneration === gen && styles.filterChipActive,
                ]}
                onPress={() => setSelectedGeneration(gen)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedGeneration === gen && styles.filterChipTextActive,
                  ]}
                >
                  {gen}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* 코드 선택 */}
        {codesForGeneration.length > 0 && (
          <View style={styles.filterSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {codesForGeneration.map((code) => (
                <TouchableOpacity
                  key={code.id}
                  style={[
                    styles.filterChip,
                    selectedCode === code.code && styles.filterChipActive,
                  ]}
                  onPress={() => setSelectedCode(code.code)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedCode === code.code && styles.filterChipTextActive,
                    ]}
                  >
                    {code.code}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* 로딩 상태 */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>사용자 정보를 불러오는 중...</Text>
        </View>
      ) : (
        <>
          {/* 사용자 목록 (그룹별) */}
          {users.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color="#9ca3af" />
              <Text style={styles.emptyStateText}>
                해당 기수 및 코드에 등록된 사용자가 없습니다.
              </Text>
            </View>
          ) : (
            <FlatList
              data={visibleGroups}
              renderItem={renderGroupSection}
              keyExtractor={(item) => item}
              contentContainerStyle={styles.userListSection}
            />
          )}
        </>
      )}
      
      {/* 사용자 상세 정보 모달 */}
      {selectedUser && (
        <Modal
          visible={true}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setSelectedUser(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* 헤더 */}
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderLeft}>
                    {selectedUser.profileImage ? (
                      <Image
                        source={{ uri: selectedUser.profileImage }}
                        style={styles.modalProfileImage}
                        contentFit="cover"
                        transition={200}
                        cachePolicy="memory-disk"
                        placeholder={require('../../assets/icon.png')}
                        placeholderContentFit="contain"
                      />
                    ) : (
                      <View style={styles.modalProfilePlaceholder}>
                        <Text style={styles.modalProfilePlaceholderText}>
                          {selectedUser.name.charAt(0)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.modalUserInfo}>
                      <Text style={styles.modalUserName}>{selectedUser.name}</Text>
                      <Text style={styles.modalUserPhone}>
                        {formatPhoneNumber(selectedUser.phoneNumber || selectedUser.phone)}
                      </Text>
                      {selectedUser.groupName && (
                        <View
                          style={[
                            styles.modalGroupBadge,
                            { backgroundColor: groupColors[selectedUser.groupName]?.bg || '#f3f4f6' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.modalGroupBadgeText,
                              { color: groupColors[selectedUser.groupName]?.text || '#374151' },
                            ]}
                          >
                            {groupLabels[selectedUser.groupName] || selectedUser.groupName}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedUser(null)}
                    style={styles.modalCloseButton}
                  >
                    <Ionicons name="close" size={28} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                {/* 기본 정보 */}
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>기본 정보</Text>
                  <View style={styles.modalInfoCompact}>
                    <View style={styles.modalInfoRow}>
                      <Text style={styles.modalInfoText}>
                        <Text style={styles.modalInfoLabel}>성별: </Text>
                        <Text style={styles.modalInfoValue}>
                          {selectedUser.gender === 'M' ? '남성' : selectedUser.gender === 'F' ? '여성' : '-'}
                        </Text>
                      </Text>
                      <Text style={styles.modalInfoText}>
                        <Text style={styles.modalInfoLabel}>나이: </Text>
                        <Text style={styles.modalInfoValue}>
                          {selectedUser.age ? `${selectedUser.age}세` : '-'}
                        </Text>
                      </Text>
                    </View>
                    <View style={styles.modalInfoRow}>
                      <Text style={[styles.modalInfoText, { flex: 1 }]}>
                        <Text style={styles.modalInfoLabel}>주민등록번호: </Text>
                        <Text style={styles.modalInfoValue}>
                          {selectedUser.rrnFront && selectedUser.rrnLast
                            ? `${selectedUser.rrnFront}-${selectedUser.rrnLast.charAt(0)}******`
                            : '-'}
                        </Text>
                      </Text>
                    </View>
                    <View style={styles.modalInfoRow}>
                      <Text style={[styles.modalInfoText, { flex: 1 }]}>
                        <Text style={styles.modalInfoLabel}>주소: </Text>
                        <Text style={styles.modalInfoValue}>
                          {selectedUser.address
                            ? `${selectedUser.address} ${selectedUser.addressDetail || ''}`
                            : '-'}
                        </Text>
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 학교 정보 */}
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>학교 정보</Text>
                  <View style={styles.modalInfoCompact}>
                    <View style={styles.modalInfoRow}>
                      <Text style={styles.modalInfoText}>
                        <Text style={styles.modalInfoLabel}>학교: </Text>
                        <Text style={styles.modalInfoValue}>{selectedUser.university || '-'}</Text>
                      </Text>
                      <Text style={styles.modalInfoText}>
                        <Text style={styles.modalInfoLabel}>학년: </Text>
                        <Text style={styles.modalInfoValue}>
                          {selectedUser.grade
                            ? selectedUser.grade === 6
                              ? '졸업생'
                              : `${selectedUser.grade}학년`
                            : '-'}
                        </Text>
                      </Text>
                    </View>
                    <View style={styles.modalInfoRow}>
                      <Text style={styles.modalInfoText}>
                        <Text style={styles.modalInfoLabel}>휴학: </Text>
                        <Text style={styles.modalInfoValue}>
                          {selectedUser.grade === 6 || selectedUser.isOnLeave === null
                            ? '졸업생'
                            : selectedUser.isOnLeave
                            ? '휴학 중'
                            : '재학 중'}
                        </Text>
                      </Text>
                    </View>
                    <View style={styles.modalInfoRow}>
                      <Text style={styles.modalInfoText}>
                        <Text style={styles.modalInfoLabel}>1전공: </Text>
                        <Text style={styles.modalInfoValue}>{selectedUser.major1 || '-'}</Text>
                      </Text>
                    </View>
                    <View style={styles.modalInfoRow}>
                      <Text style={[styles.modalInfoText, { flex: 1 }]}>
                        <Text style={styles.modalInfoLabel}>2전공/부전공: </Text>
                        <Text style={styles.modalInfoValue}>{selectedUser.major2 || '없음'}</Text>
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 업무 경력 */}
                {selectedUser.jobExperiences && selectedUser.jobExperiences.length > 0 && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>업무 경력</Text>
                    <View style={styles.modalJobExperienceBadges}>
                      {selectedUser.jobExperiences
                        .slice()
                        .sort((a: any, b: any) => {
                          const jobCodeA = jobCodes.find((code) => code.id === a.id);
                          const jobCodeB = jobCodes.find((code) => code.id === b.id);
                          const genA = jobCodeA ? parseInt(jobCodeA.generation.replace(/[^0-9]/g, '')) : -1;
                          const genB = jobCodeB ? parseInt(jobCodeB.generation.replace(/[^0-9]/g, '')) : -1;
                          return genB - genA;
                        })
                        .map((exp: any, idx: number) => {
                          const jobCode = jobCodes.find((code) => code.id === exp.id);
                          return (
                            <View key={idx} style={styles.modalJobCodeBadge}>
                              <Text style={styles.modalJobCodeBadgeText}>
                                {jobCode ? jobCode.code : exp.id}
                              </Text>
                            </View>
                          );
                        })}
                    </View>
                  </View>
                )}

                {/* 수업 자료 */}
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>수업 자료</Text>
                  <UserLessonMaterials userId={selectedUser.userId} />
                </View>
              </ScrollView>

              {/* 닫기 버튼 */}
              <TouchableOpacity
                style={styles.modalCloseButtonBottom}
                onPress={() => setSelectedUser(null)}
              >
                <Text style={styles.modalCloseButtonText}>닫기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    marginRight: 16,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  stickyFilters: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  filterSectionFirst: {
    marginTop: 4,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#3b82f6',
  },
  filterChipActiveRole: {
    backgroundColor: '#14b8a6', // teal 색상
  },
  filterChipText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  filterChipTextActiveRole: {
    color: '#fff',
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    paddingLeft: 4,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#9ca3af',
    marginTop: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  userListSection: {
    padding: 12,
  },
  summaryCard: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  summaryCount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  groupSection: {
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 10,
  },
  groupHeaderText: {
    fontSize: 15,
    fontWeight: '600',
  },
  groupCountBadge: {
    fontSize: 13,
    fontWeight: '600',
  },
  userGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  userGridItem: {
    width: '31.5%',
    marginBottom: 8,
  },
  profileImageContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  profilePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profilePlaceholderText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#93c5fd',
  },
  badgeContainer: {
    position: 'absolute',
    top: 4,
    right: 4,
    gap: 4,
  },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  badgeBlue: {
    backgroundColor: '#DBEAFE',
    borderColor: '#BFDBFE',
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#374151',
  },
  badgeTextBlue: {
    color: '#1E40AF',
  },
  userGridName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginTop: 8,
    textAlign: 'center',
  },
  // 모달 스타일
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxHeight: '80%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    flex: 1,
  },
  modalProfileImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginRight: 16,
  },
  modalProfilePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  modalProfilePlaceholderText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#93c5fd',
  },
  modalUserInfo: {
    flex: 1,
  },
  modalUserName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  modalUserPhone: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  modalGroupBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  modalGroupBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalSection: {
    paddingVertical: 10,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  modalInfoCompact: {
    gap: 6,
  },
  modalInfoRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  modalInfoText: {
    fontSize: 12,
    flex: 0.48,
  },
  modalInfoLabel: {
    color: '#6B7280',
  },
  modalInfoValue: {
    color: '#111827',
    fontWeight: '500',
  },
  modalJobExperienceBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  modalJobCodeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: '#E5E7EB',
  },
  modalJobCodeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
  },
  modalCloseButtonBottom: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  modalCloseButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  // 수업 자료 스타일
  lessonMaterialsContainer: {
    marginTop: 4,
  },
  lessonMaterialsLoading: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
  },
  lessonMaterialsError: {
    fontSize: 13,
    color: '#EF4444',
    textAlign: 'center',
  },
  lessonMaterialsEmpty: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  lessonGenerationToggles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  lessonGenerationToggle: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  lessonGenerationToggleActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
  },
  lessonGenerationToggleText: {
    fontSize: 10,
    color: '#374151',
  },
  lessonGenerationToggleTextActive: {
    color: '#1E40AF',
    fontWeight: '600',
  },
  lessonMaterialsList: {
    gap: 12,
  },
  lessonMaterialItem: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#F9FAFB',
    marginBottom: 12,
  },
  lessonMaterialTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  lessonSectionsList: {
    gap: 6,
  },
  lessonSectionItem: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    padding: 8,
  },
  lessonSectionTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  lessonSectionButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  lessonSectionButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#DBEAFE',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  lessonSectionButtonText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#1E40AF',
  },
});
