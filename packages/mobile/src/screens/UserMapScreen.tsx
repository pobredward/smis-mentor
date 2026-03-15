import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { AdminStackScreenProps } from '../navigation/types';
import { db } from '../config/firebase';
import { adminGetAllUsers, adminGetUserJobCodesInfo } from '@smis-mentor/shared';
import type { User, JobCodeWithGroup } from '@smis-mentor/shared';
import EvaluationStageCards from '../components/EvaluationStageCards';

interface UserWithCoords extends User {
  lat: number;
  lng: number;
}

type RoleFilter = 'all' | 'mentor' | 'foreign' | 'admin';

const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY || '';

// Kakao Geocoding API를 사용한 주소 → 좌표 변환
const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
  try {
    if (!KAKAO_REST_API_KEY || KAKAO_REST_API_KEY === 'YOUR_KAKAO_REST_API_KEY') {
      console.warn('Kakao API 키가 설정되지 않았습니다.');
      return null;
    }

    const response = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
      {
        headers: {
          Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      console.error('Kakao API 오류:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data.documents && data.documents.length > 0) {
      const result = data.documents[0];
      return {
        lat: parseFloat(result.y),
        lng: parseFloat(result.x),
      };
    }

    return null;
  } catch (error) {
    console.error('Geocoding 오류:', error);
    return null;
  }
};

// 마커 색상 결정
const getMarkerColor = (role: string): string => {
  switch (role) {
    case 'admin':
      return '#9333ea';
    case 'mentor':
      return '#3b82f6';
    case 'foreign':
      return '#10b981';
    default:
      return '#6b7280';
  }
};

// 역할 라벨
const getRoleLabel = (role: string): string => {
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

// 커스텀 마커 컴포넌트
const CustomMarker = React.memo(({ user, onPress }: { user: UserWithCoords; onPress: () => void }) => {
  const color = getMarkerColor(user.role);
  const [imageError, setImageError] = useState(false);
  
  return (
    <TouchableOpacity 
      onPress={onPress} 
      style={styles.markerContainer}
      activeOpacity={0.7}
    >
      <View style={[styles.markerCircle, { backgroundColor: color }]}>
        {user.profileImage && !imageError ? (
          <Image
            source={{ uri: user.profileImage }}
            style={styles.markerImage}
            contentFit="cover"
            transition={0}
            cachePolicy="memory-disk"
            onError={() => setImageError(true)}
          />
        ) : (
          <Text style={styles.markerInitial}>{user.name.charAt(0)}</Text>
        )}
      </View>
      <View style={[styles.markerNameBox, { borderColor: color }]}>
        <Text style={[styles.markerName, { color: color }]} numberOfLines={1}>
          {user.name}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

export function UserMapScreen({ navigation }: AdminStackScreenProps<'UserMap'>) {
  const [users, setUsers] = useState<User[]>([]);
  const [usersWithCoords, setUsersWithCoords] = useState<UserWithCoords[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleFilter>('all');
  const [selectedUser, setSelectedUser] = useState<UserWithCoords | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [jobCodes, setJobCodes] = useState<JobCodeWithGroup[]>([]);
  const [isLoadingJobCodes, setIsLoadingJobCodes] = useState(false);
  const mapRef = useRef<MapView>(null);

  const roleFilters: { value: RoleFilter; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'mentor', label: '멘토' },
    { value: 'foreign', label: '원어민' },
    { value: 'admin', label: '관리자' },
  ];

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    processUsers();
  }, [users, selectedRole]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const fetchedUsers = await adminGetAllUsers(db);
      setUsers(fetchedUsers);
    } catch (error) {
      console.error('사용자 목록 로딩 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const processUsers = async () => {
    setIsGeocoding(true);
    
    // 역할 필터링
    let filteredUsers = users;
    if (selectedRole !== 'all') {
      filteredUsers = users.filter(user => user.role === selectedRole);
    }

    // 주소가 있는 사용자만 필터링
    const usersWithAddress = filteredUsers.filter(
      user => user.address && user.address.trim() !== ''
    );

    const processed: UserWithCoords[] = [];
    const usersNeedingGeocode: typeof usersWithAddress = [];

    // 1단계: 캐시된 좌표가 있는 사용자는 바로 사용
    for (const user of usersWithAddress) {
      if (user.geocode && user.geocode.lat && user.geocode.lng) {
        processed.push({
          ...user,
          lat: user.geocode.lat,
          lng: user.geocode.lng,
        });
      } else {
        usersNeedingGeocode.push(user);
      }
    }

    console.log(`✅ 캐시된 좌표: ${processed.length}명`);
    console.log(`⏳ 변환 필요: ${usersNeedingGeocode.length}명`);

    // 2단계: 좌표가 없는 사용자만 변환 (순차적으로 처리)
    for (const user of usersNeedingGeocode) {
      const coords = await geocodeAddress(user.address);
      
      if (coords) {
        processed.push({
          ...user,
          lat: coords.lat,
          lng: coords.lng,
        });
      }
      
      // API Rate Limit 방지를 위한 짧은 대기
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✅ ${processed.length}명의 좌표 데이터 준비 완료`);
    setUsersWithCoords(processed);
    setIsGeocoding(false);

    // 지도 범위 조정
    if (processed.length > 0 && mapRef.current) {
      const coordinates = processed.map(user => ({
        latitude: user.lat,
        longitude: user.lng,
      }));

      setTimeout(() => {
        mapRef.current?.fitToCoordinates(coordinates, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      }, 500);
    }
  };

  const handleMarkerPress = async (user: UserWithCoords) => {
    setSelectedUser(user);
    setModalVisible(true);
    
    // 직무 경험 로드
    if (user.jobExperiences && user.jobExperiences.length > 0) {
      setIsLoadingJobCodes(true);
      try {
        const jobCodesInfo = await adminGetUserJobCodesInfo(db, user.jobExperiences);
        setJobCodes(jobCodesInfo);
      } catch (error) {
        console.error('직무 경험 정보 로드 오류:', error);
      } finally {
        setIsLoadingJobCodes(false);
      }
    } else {
      setJobCodes([]);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>사용자 정보를 불러오는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#374151" />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>사용자 지도</Text>
            <Text style={styles.headerSubtitle}>
              총 {usersWithCoords.length}명
            </Text>
          </View>
        </View>

        {/* 역할 필터 */}
        <View style={styles.filterContainer}>
          {roleFilters.map((filter) => (
            <TouchableOpacity
              key={filter.value}
              onPress={() => setSelectedRole(filter.value)}
              style={[
                styles.filterButton,
                selectedRole === filter.value && styles.filterButtonActive,
              ]}
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

      {/* 지도 영역 */}
      <View style={styles.mapContainer}>
        {isGeocoding ? (
          <View style={styles.geocodingOverlay}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.geocodingText}>주소를 좌표로 변환하는 중...</Text>
          </View>
        ) : usersWithCoords.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="location-outline" size={64} color="#9ca3af" />
            <Text style={styles.emptyTitle}>주소 정보 없음</Text>
            <Text style={styles.emptySubtitle}>
              선택한 역할의 사용자 중 주소를 등록한 사용자가 없습니다.
            </Text>
          </View>
        ) : (
          <>
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              initialRegion={{
                latitude: 37.5665,
                longitude: 126.9780,
                latitudeDelta: 5,
                longitudeDelta: 5,
              }}
            >
              {usersWithCoords.map((user) => (
                <Marker
                  key={user.userId || user.id}
                  coordinate={{
                    latitude: user.lat,
                    longitude: user.lng,
                  }}
                  onPress={() => handleMarkerPress(user)}
                  tracksViewChanges={false}
                >
                  <CustomMarker user={user} onPress={() => handleMarkerPress(user)} />
                </Marker>
              ))}
            </MapView>

            {/* 범례 */}
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
                <Text style={styles.legendText}>멘토</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
                <Text style={styles.legendText}>원어민</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#9333ea' }]} />
                <Text style={styles.legendText}>관리자</Text>
              </View>
              <View style={styles.legendDivider} />
              <Text style={styles.legendCount}>{usersWithCoords.length}명</Text>
            </View>
          </>
        )}
      </View>

      {/* 사용자 상세 모달 */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>사용자 정보</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {selectedUser && (
                <>
                  {/* 프로필 섹션 */}
                  <View style={styles.userProfile}>
                  {selectedUser.profileImage ? (
                    <Image
                      source={{ uri: selectedUser.profileImage }}
                      style={styles.profileImage}
                      contentFit="cover"
                      transition={0}
                      cachePolicy="memory-disk"
                    />
                  ) : (
                      <View style={styles.profilePlaceholder}>
                        <Text style={styles.profileInitial}>
                          {selectedUser.name.charAt(0)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.profileInfo}>
                      <Text style={styles.profileName}>{selectedUser.name}</Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <View style={[
                          styles.roleBadge,
                          { backgroundColor: `${getMarkerColor(selectedUser.role)}20` }
                        ]}>
                          <Text style={[
                            styles.roleBadgeText,
                            { color: getMarkerColor(selectedUser.role) }
                          ]}>
                            {getRoleLabel(selectedUser.role)}
                          </Text>
                        </View>
                        <View style={[
                          styles.roleBadge,
                          { 
                            backgroundColor: selectedUser.status === 'active' ? '#dcfce720' : 
                                           selectedUser.status === 'inactive' ? '#fee2e220' : '#fef9c320'
                          }
                        ]}>
                          <Text style={[
                            styles.roleBadgeText,
                            { 
                              color: selectedUser.status === 'active' ? '#16a34a' : 
                                     selectedUser.status === 'inactive' ? '#dc2626' : '#ca8a04'
                            }
                          ]}>
                            {selectedUser.status === 'active' ? '활성' : 
                             selectedUser.status === 'inactive' ? '비활성' : '임시'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* 기본 정보 */}
                  <View style={styles.section}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>이메일</Text>
                      <Text style={styles.detailValue}>{selectedUser.email || '-'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>전화번호</Text>
                      <Text style={styles.detailValue}>{selectedUser.phoneNumber || '-'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>주소</Text>
                      <Text style={styles.detailValue}>
                        {selectedUser.address} {selectedUser.addressDetail}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>성별</Text>
                      <Text style={styles.detailValue}>
                        {selectedUser.gender === 'M' ? '남성' : selectedUser.gender === 'F' ? '여성' : '-'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>나이</Text>
                      <Text style={styles.detailValue}>
                        {selectedUser.age ? `${selectedUser.age}세` : '-'}
                      </Text>
                    </View>
                    {selectedUser.referralPath && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>지원 경로</Text>
                        <Text style={styles.detailValue}>
                          {selectedUser.referralPath.startsWith('기타: ') ? selectedUser.referralPath :
                           selectedUser.referralPath === '지인 소개' && selectedUser.referrerName ? 
                           `${selectedUser.referralPath} (${selectedUser.referrerName})` : 
                           selectedUser.referralPath}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* 직무 경험 */}
                  {(jobCodes.length > 0 || isLoadingJobCodes) && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>직무 경험</Text>
                      {isLoadingJobCodes ? (
                        <ActivityIndicator size="small" color="#3b82f6" />
                      ) : (
                        <View style={styles.jobCodesContainer}>
                          {jobCodes
                            .slice()
                            .sort((a, b) => {
                              const genA = parseInt(a.generation.replace(/[^0-9]/g, '')) || 0;
                              const genB = parseInt(b.generation.replace(/[^0-9]/g, '')) || 0;
                              return genB - genA;
                            })
                            .map((jobCode, idx) => {
                              const exp = selectedUser.jobExperiences?.find(e => e.id === jobCode.id);
                              return (
                                <View key={idx} style={styles.jobCodeCard}>
                                  <Text style={styles.jobCodeName}>
                                    {jobCode.generation} {jobCode.name}
                                  </Text>
                                  <View style={styles.jobCodeBadges}>
                                    {exp?.group && (
                                      <View style={[styles.badge, styles.badgeGroup]}>
                                        <Text style={styles.badgeText}>
                                          {exp.group === 'junior' ? '주니어' :
                                           exp.group === 'middle' ? '미들' :
                                           exp.group === 'senior' ? '시니어' :
                                           exp.group === 'spring' ? '스프링' :
                                           exp.group === 'summer' ? '서머' :
                                           exp.group === 'autumn' ? '어텀' :
                                           exp.group === 'winter' ? '윈터' :
                                           exp.group === 'common' ? '공통' : '매니저'}
                                        </Text>
                                      </View>
                                    )}
                                    {exp?.groupRole && (
                                      <View style={[styles.badge, styles.badgeRole]}>
                                        <Text style={styles.badgeText}>{exp.groupRole}</Text>
                                      </View>
                                    )}
                                    {exp?.classCode && (
                                      <View style={[styles.badge, styles.badgeClass]}>
                                        <Text style={styles.badgeText}>{exp.classCode}</Text>
                                      </View>
                                    )}
                                  </View>
                                </View>
                              );
                            })}
                        </View>
                      )}
                    </View>
                  )}

                  {/* 평가 점수 */}
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>평가 점수</Text>
                    {(selectedUser.id || selectedUser.userId) ? (
                      <EvaluationStageCards userId={selectedUser.id || selectedUser.userId} />
                    ) : (
                      <Text style={styles.emptyText}>사용자 ID가 없어 평가를 불러올 수 없습니다.</Text>
                    )}
                  </View>

                  {/* 학교 정보 */}
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>학교 정보</Text>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>학교</Text>
                      <Text style={styles.detailValue}>{selectedUser.university || '-'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>학년</Text>
                      <Text style={styles.detailValue}>
                        {selectedUser.grade ? (selectedUser.grade === 6 ? '졸업생' : `${selectedUser.grade}학년`) : '-'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>휴학 상태</Text>
                      <Text style={styles.detailValue}>
                        {selectedUser.isOnLeave === null ? '졸업생' : 
                         selectedUser.isOnLeave ? '휴학 중' : '재학 중'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>전공 (1전공)</Text>
                      <Text style={styles.detailValue}>{selectedUser.major1 || '-'}</Text>
                    </View>
                    {selectedUser.major2 && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>전공 (2전공/부전공)</Text>
                        <Text style={styles.detailValue}>{selectedUser.major2}</Text>
                      </View>
                    )}
                  </View>

                  {/* 자기소개 및 지원동기 */}
                  {(selectedUser.selfIntroduction || selectedUser.jobMotivation) && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>자기소개 및 지원동기</Text>
                      {selectedUser.selfIntroduction && (
                        <View style={styles.textBlock}>
                          <Text style={styles.textBlockLabel}>자기소개</Text>
                          <View style={styles.textBlockContent}>
                            <Text style={styles.textBlockText}>
                              {selectedUser.selfIntroduction}
                            </Text>
                          </View>
                        </View>
                      )}
                      {selectedUser.jobMotivation && (
                        <View style={styles.textBlock}>
                          <Text style={styles.textBlockLabel}>지원 동기</Text>
                          <View style={styles.textBlockContent}>
                            <Text style={styles.textBlockText}>
                              {selectedUser.jobMotivation}
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                  {/* 알바 & 멘토링 경력 */}
                  {selectedUser.partTimeJobs && selectedUser.partTimeJobs.length > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>알바 & 멘토링 경력</Text>
                      {selectedUser.partTimeJobs.map((job, index) => (
                        <View key={index} style={styles.jobCard}>
                          <View style={styles.jobHeader}>
                            <Text style={styles.jobCompany}>{job.companyName}</Text>
                            <Text style={styles.jobPeriod}>{job.period}</Text>
                          </View>
                          <View style={styles.jobDetail}>
                            <Text style={styles.jobDetailLabel}>담당:</Text>
                            <Text style={styles.jobDetailValue}>{job.position}</Text>
                          </View>
                          <View style={styles.jobDetail}>
                            <Text style={styles.jobDetailLabel}>업무 내용:</Text>
                            <Text style={styles.jobDetailValue}>{job.description}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* 관리자 피드백 */}
                  {selectedUser.feedback && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>관리자 피드백</Text>
                      <View style={styles.textBlockContent}>
                        <Text style={styles.textBlockText}>{selectedUser.feedback}</Text>
                      </View>
                    </View>
                  )}

                  {/* 닫기 버튼 */}
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={styles.closeButtonText}>닫기</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
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
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  filterButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  filterButtonActive: {
    backgroundColor: '#3b82f6',
  },
  filterButtonText: {
    fontSize: 11,
    color: '#374151',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  geocodingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  geocodingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 18,
  },
  markerContainer: {
    alignItems: 'center',
  },
  markerCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  markerImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  markerInitial: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  markerNameBox: {
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  markerName: {
    fontSize: 10,
    fontWeight: '600',
  },
  legend: {
    position: 'absolute',
    left: 8,
    bottom: Platform.OS === 'ios' ? 90 : 80,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendText: {
    fontSize: 10,
    color: '#374151',
  },
  legendDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 4,
  },
  legendCount: {
    fontSize: 9,
    color: '#6b7280',
    textAlign: 'center',
  },
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
    maxHeight: '90%',
    maxWidth: 500,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
    paddingBottom: 40,
  },
  userProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  section: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  textBlock: {
    marginBottom: 16,
  },
  textBlockLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  textBlockContent: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    minHeight: 60,
  },
  textBlockText: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
  },
  jobCard: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  jobCompany: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  jobPeriod: {
    fontSize: 12,
    color: '#6b7280',
  },
  jobDetail: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  jobDetailLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginRight: 8,
  },
  jobDetailValue: {
    fontSize: 12,
    color: '#111827',
    flex: 1,
  },
  profileImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginRight: 16,
  },
  profilePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  profileInitial: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6b7280',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  detailRow: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: '#111827',
  },
  closeButton: {
    backgroundColor: '#f3f4f6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  closeButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  jobCodesContainer: {
    gap: 8,
  },
  jobCodeCard: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  jobCodeName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  jobCodeBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeGroup: {
    backgroundColor: '#dbeafe',
  },
  badgeRole: {
    backgroundColor: '#e5e7eb',
  },
  badgeClass: {
    backgroundColor: '#dbeafe',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  emptyText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 14,
    paddingVertical: 20,
  },
});
