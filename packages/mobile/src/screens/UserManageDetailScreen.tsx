import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import DropDownPicker from 'react-native-dropdown-picker';
import { db, auth } from '../config/firebase';
import {
  adminGetUserJobCodesInfo,
  getUserById,
  adminAddUserJobCode,
  adminRemoveUserJobCode,
  adminGetAllJobCodes,
  EvaluationStage,
} from '@smis-mentor/shared';
import { 
  JOB_EXPERIENCE_GROUP_ROLES,
  MENTOR_GROUP_ROLES,
  FOREIGN_GROUP_ROLES,
  LEGACY_GROUP_REVERSE_MAP,
  JobExperienceGroupRole,
} from '../../../shared/src/types/camp';
import EvaluationStageCards from '../components/EvaluationStageCards';
import EvaluationForm from '../components/EvaluationForm';

type JobGroup =
  | 'junior'
  | 'middle'
  | 'senior'
  | 'spring'
  | 'summer'
  | 'autumn'
  | 'winter'
  | 'common'
  | 'manager';

export function UserManageDetailScreen({ route, navigation }: any) {
  const { user: initialUser } = route.params;
  const [user, setUser] = useState(initialUser); // user를 state로 관리
  const [jobCodes, setJobCodes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false); // 추가/삭제 중 상태
  const [showEvaluationForm, setShowEvaluationForm] = useState(false);
  const [selectedEvaluationStage, setSelectedEvaluationStage] = useState<EvaluationStage | null>(null);
  const [currentUser, setCurrentUser] = useState<{ name: string; userId: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // 직무 경험 추가 관련 상태
  const [showJobCodeForm, setShowJobCodeForm] = useState(false);
  const [allJobCodes, setAllJobCodes] = useState<any[]>([]);
  const [generations, setGenerations] = useState<string[]>([]);
  const [selectedGeneration, setSelectedGeneration] = useState('');
  const [filteredJobCodes, setFilteredJobCodes] = useState<any[]>([]);
  const [selectedJobCodeId, setSelectedJobCodeId] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<JobGroup>('junior');
  const [selectedGroupRole, setSelectedGroupRole] = useState<JobExperienceGroupRole>('담임');
  const [classCodeInput, setClassCodeInput] = useState('');

  // 드롭다운 open 상태
  const [generationOpen, setGenerationOpen] = useState(false);
  const [jobCodeOpen, setJobCodeOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupRoleOpen, setGroupRoleOpen] = useState(false);

  // 드롭다운 items
  const [generationItems, setGenerationItems] = useState<Array<{ label: string; value: string }>>([]);
  const [jobCodeItems, setJobCodeItems] = useState<Array<{ label: string; value: string }>>([]);
  const [groupItems, setGroupItems] = useState(
    Object.entries(LEGACY_GROUP_REVERSE_MAP).map(([label, value]) => ({
      label,
      value
    })).concat([{ label: '매니저', value: 'manager' }])
  );
  
  // groupRoleItems를 user의 role에 따라 동적으로 설정
  const getGroupRoleItems = () => {
    const userRole = user?.role;
    
    if (userRole === 'mentor' || userRole === 'mentor_temp') {
      return MENTOR_GROUP_ROLES.map(role => ({
        label: role,
        value: role
      }));
    }
    
    if (userRole === 'foreign' || userRole === 'foreign_temp') {
      return FOREIGN_GROUP_ROLES.map(role => ({
        label: role,
        value: role
      }));
    }
    
    // admin이나 기타 role은 모두 표시
    return JOB_EXPERIENCE_GROUP_ROLES.map(role => ({
      label: role,
      value: role
    }));
  };
  
  const [groupRoleItems, setGroupRoleItems] = useState(getGroupRoleItems());

  useEffect(() => {
    loadJobCodes();
  }, [user]); // user가 변경될 때마다 직무 경험 로드

  useEffect(() => {
    loadCurrentUser();
    loadAllJobCodes();
  }, []); // 최초 1회만 실행

  // user의 role이 변경될 때 groupRoleItems 및 selectedGroupRole 업데이트
  useEffect(() => {
    const newItems = getGroupRoleItems();
    setGroupRoleItems(newItems);
    
    // selectedGroupRole을 user의 role에 맞게 초기화
    const userRole = user?.role;
    if (userRole === 'mentor' || userRole === 'mentor_temp') {
      setSelectedGroupRole('담임');
    } else if (userRole === 'foreign' || userRole === 'foreign_temp') {
      setSelectedGroupRole('Speaking');
    } else {
      setSelectedGroupRole('담임');
    }
  }, [user?.role]);

  const loadCurrentUser = async () => {
    try {
      if (auth.currentUser) {
        const userData = await getUserById(db, auth.currentUser.uid);
        if (userData) {
          setCurrentUser({ name: userData.name, userId: auth.currentUser.uid });
        }
      }
    } catch (error) {
      console.error('현재 사용자 정보 로드 오류:', error);
    }
  };

  const loadAllJobCodes = async () => {
    try {
      const codes = await adminGetAllJobCodes(db);
      setAllJobCodes(codes);

      // 기수 목록 추출 (중복 제거, 내림차순)
      const uniqueGenerations = Array.from(
        new Set(codes.map((code: any) => code.generation))
      ).sort((a: string, b: string) => {
        const numA = parseInt(a.replace(/[^0-9]/g, ''));
        const numB = parseInt(b.replace(/[^0-9]/g, ''));
        return numB - numA;
      });

      setGenerations(uniqueGenerations);
      setGenerationItems(uniqueGenerations.map((gen) => ({ label: gen, value: gen })));

      // 기본 선택: 가장 최근 기수
      if (uniqueGenerations.length > 0) {
        setSelectedGeneration(uniqueGenerations[0]);
      }
    } catch (error) {
      console.error('전체 직무 코드 로드 오류:', error);
    }
  };

  const loadJobCodes = async () => {
    if (!user.jobExperiences || user.jobExperiences.length === 0) {
      setJobCodes([]);
      return;
    }

    setIsLoading(true);
    try {
      const jobCodesInfo = await adminGetUserJobCodesInfo(db, user.jobExperiences);
      setJobCodes(jobCodesInfo);
    } catch (error) {
      console.error('직무 경험 정보 로드 오류:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const reloadUserData = async () => {
    try {
      const userId = user.id || user.userId;
      console.log('🔄 사용자 데이터 새로고침 시작:', userId);
      
      const updatedUser = await getUserById(db, userId);
      if (updatedUser) {
        console.log('✅ 업데이트된 사용자 데이터:', {
          jobExperiences: updatedUser.jobExperiences,
        });
        setUser(updatedUser);
        
        // user state가 업데이트된 후 jobCodes를 로드
        if (updatedUser.jobExperiences && updatedUser.jobExperiences.length > 0) {
          const jobCodesInfo = await adminGetUserJobCodesInfo(db, updatedUser.jobExperiences);
          console.log('✅ 직무 코드 정보 로드 완료:', jobCodesInfo.length);
          setJobCodes(jobCodesInfo);
        } else {
          console.log('ℹ️ 직무 경험 없음');
          setJobCodes([]);
        }
      }
    } catch (error) {
      console.error('❌ 사용자 데이터 새로고침 오류:', error);
    }
  };

  // 선택된 기수에 따라 직무 코드 필터링
  useEffect(() => {
    if (!selectedGeneration) {
      setFilteredJobCodes([]);
      setJobCodeItems([]);
      setSelectedJobCodeId('');
      return;
    }

    const filtered = allJobCodes.filter(
      (code) => code.generation === selectedGeneration
    );
    
    // 커스텀 정렬: J, E, S, F, G, K 순서 우선, 나머지는 알파벳 순서
    const priorityOrder = ['J', 'E', 'S', 'F', 'G', 'K'];
    
    filtered.sort((a, b) => {
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
    
    setFilteredJobCodes(filtered);
    setJobCodeItems(
      filtered.map((code) => ({
        label: `${code.code} - ${code.name}`,
        value: code.id,
      }))
    );

    // 기본 선택: 첫 번째 코드
    if (filtered.length > 0) {
      setSelectedJobCodeId(filtered[0].id);
    } else {
      setSelectedJobCodeId('');
    }
  }, [selectedGeneration, allJobCodes]);

  const handleAddJobCode = async () => {
    if (!selectedJobCodeId) {
      Alert.alert('오류', '직무 코드를 선택해주세요.');
      return;
    }

    try {
      setIsUpdating(true);
      
      const userId = user.id || user.userId;
      
      // 디버깅: 파라미터 확인
      console.log('직무 경험 추가 시도:', {
        userId,
        selectedJobCodeId,
        selectedGroup,
        selectedGroupRole,
        classCode: classCodeInput.trim() || undefined,
      });

      await adminAddUserJobCode(
        db,
        userId,
        selectedJobCodeId,
        selectedGroup,
        selectedGroupRole,
        classCodeInput.trim() || undefined
      );

      Alert.alert('성공', '직무 경험이 추가되었습니다.');
      
      // 폼 초기화
      setShowJobCodeForm(false);
      setClassCodeInput('');
      
      // 사용자 데이터 및 직무 경험 목록 새로고침
      await reloadUserData();
    } catch (error: any) {
      console.error('직무 경험 추가 오류:', error);
      Alert.alert('오류', error.message || '직무 경험 추가 중 오류가 발생했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveJobCode = async (jobCodeId: string) => {
    Alert.alert(
      '직무 경험 삭제',
      '이 직무 경험을 삭제하시겠습니까?',
      [
        {
          text: '취소',
          style: 'cancel',
        },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsUpdating(true);
              const userId = user.id || user.userId;

              console.log('🗑️ 직무 경험 삭제 시도:', { 
                userId, 
                jobCodeId,
                현재직무수: user.jobExperiences?.length || 0
              });

              const updatedJobExperiences = await adminRemoveUserJobCode(db, userId, jobCodeId);

              console.log('✅ 직무 경험 삭제 완료, 남은 직무 수:', updatedJobExperiences.length);

              Alert.alert('성공', '직무 경험이 삭제되었습니다.');

              // 사용자 데이터 및 직무 경험 목록 새로고침
              await reloadUserData();
            } catch (error: any) {
              console.error('❌ 직무 경험 삭제 오류:', error);
              Alert.alert('오류', error.message || '직무 경험 삭제 중 오류가 발생했습니다.');
            } finally {
              setIsUpdating(false);
            }
          },
        },
      ]
    );
  };

  const formatPhoneNumber = (phoneNumber?: string): string => {
    if (!phoneNumber) return '-';
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
    }
    return phoneNumber;
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
    return date.toLocaleDateString('ko-KR');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>사용자 상세</Text>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* 프로필 헤더 */}
        <View style={styles.profileHeader}>
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
                <Text style={styles.profilePlaceholderText}>{user.name.charAt(0)}</Text>
              </View>
            )}
          </View>
          <Text style={styles.profileName}>{user.name}</Text>
        </View>

        {/* 기본 정보 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>기본 정보</Text>
          <View style={styles.infoCompact}>
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>역할: </Text>
                <Text style={styles.infoValue}>
                  {user.role === 'admin' ? '관리자' : user.role === 'mentor' ? '멘토' : user.role === 'foreign' ? '원어민' : '사용자'}
                </Text>
              </Text>
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>상태: </Text>
                <Text style={styles.infoValue}>
                  {user.status === 'active' ? '활성' : user.status === 'inactive' ? '비활성' : '임시'}
                </Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>이메일: </Text>
                <Text style={styles.infoValue}>{user.email || '-'}</Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>전화번호: </Text>
                <Text style={styles.infoValue}>{formatPhoneNumber(user.phoneNumber)}</Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoText, { flex: 1 }]}>
                <Text style={styles.infoLabel}>주소: </Text>
                <Text style={styles.infoValue}>
                  {user.address ? `${user.address} ${user.addressDetail || ''}` : '-'}
                </Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>성별: </Text>
                <Text style={styles.infoValue}>
                  {user.gender === 'M' ? '남성' : user.gender === 'F' ? '여성' : '-'}
                </Text>
              </Text>
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>나이: </Text>
                <Text style={styles.infoValue}>{user.age ? `${user.age}세` : '-'}</Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoText, { flex: 1 }]}>
                <Text style={styles.infoLabel}>지원 경로: </Text>
                <Text style={styles.infoValue}>
                  {user.referralPath
                    ? user.referralPath.startsWith('기타: ')
                      ? user.referralPath
                      : user.referralPath === '지인 소개' && user.referrerName
                      ? `${user.referralPath} (${user.referrerName})`
                      : user.referralPath
                    : '-'}
                </Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoText, { flex: 1 }]}>
                <Text style={styles.infoLabel}>주민등록번호: </Text>
                <Text style={styles.infoValue}>
                  {user.rrnFront && user.rrnLast ? `${user.rrnFront}-${user.rrnLast}` : '-'}
                </Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>이메일 인증: </Text>
                <Text style={styles.infoValue}>{user.isEmailVerified ? '인증됨' : '미인증'}</Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>가입일: </Text>
                <Text style={styles.infoValue}>{formatDate(user.createdAt)}</Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>업데이트: </Text>
                <Text style={styles.infoValue}>{formatDate(user.updatedAt)}</Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoText, { flex: 1 }]}>
                <Text style={styles.infoLabel}>DB ID: </Text>
                <Text style={styles.infoValue}>{user.id || user.userId}</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* 학교 정보 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>학교 정보</Text>
          <View style={styles.infoCompact}>
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>학교: </Text>
                <Text style={styles.infoValue}>{user.university || '-'}</Text>
              </Text>
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>학년: </Text>
                <Text style={styles.infoValue}>
                  {user.grade ? (user.grade === 6 ? '졸업생' : `${user.grade}학년`) : '-'}
                </Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>
                <Text style={styles.infoLabel}>휴학: </Text>
                <Text style={styles.infoValue}>
                  {user.grade === 6 || user.isOnLeave === null
                    ? '졸업생'
                    : user.isOnLeave
                    ? '휴학 중'
                    : '재학 중'}
                </Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoText, { flex: 1 }]}>
                <Text style={styles.infoLabel}>1전공: </Text>
                <Text style={styles.infoValue}>{user.major1 || '-'}</Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoText, { flex: 1 }]}>
                <Text style={styles.infoLabel}>2전공/부전공: </Text>
                <Text style={styles.infoValue}>{user.major2 || '없음'}</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* 업무 경력 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>업무 경력</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowJobCodeForm(!showJobCodeForm)}
            >
              <Ionicons
                name={showJobCodeForm ? 'close' : 'add'}
                size={20}
                color="#4F46E5"
              />
              <Text style={styles.addButtonText}>
                {showJobCodeForm ? '취소' : '추가'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 직무 경험 추가 폼 */}
          {showJobCodeForm && (
            <View style={styles.jobCodeForm}>
              {/* 기수 선택 */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>기수</Text>
                <DropDownPicker
                  open={generationOpen}
                  value={selectedGeneration}
                  items={generationItems}
                  setOpen={setGenerationOpen}
                  setValue={setSelectedGeneration}
                  setItems={setGenerationItems}
                  placeholder="기수 선택..."
                  style={styles.dropdown}
                  dropDownContainerStyle={styles.dropdownContainer}
                  textStyle={styles.dropdownText}
                  listMode="SCROLLVIEW"
                  scrollViewProps={{
                    nestedScrollEnabled: true,
                  }}
                  zIndex={4000}
                  zIndexInverse={1000}
                />
              </View>

              {/* 직무 코드 선택 */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>직무 코드</Text>
                <DropDownPicker
                  open={jobCodeOpen}
                  value={selectedJobCodeId}
                  items={jobCodeItems}
                  setOpen={setJobCodeOpen}
                  setValue={setSelectedJobCodeId}
                  setItems={setJobCodeItems}
                  placeholder="직무 코드 선택..."
                  style={styles.dropdown}
                  dropDownContainerStyle={styles.dropdownContainer}
                  textStyle={styles.dropdownText}
                  disabled={!selectedGeneration || jobCodeItems.length === 0}
                  listMode="SCROLLVIEW"
                  scrollViewProps={{
                    nestedScrollEnabled: true,
                  }}
                  zIndex={3000}
                  zIndexInverse={2000}
                />
              </View>

              {/* 그룹 선택 */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>그룹</Text>
                <DropDownPicker
                  open={groupOpen}
                  value={selectedGroup}
                  items={groupItems}
                  setOpen={setGroupOpen}
                  setValue={setSelectedGroup}
                  setItems={setGroupItems}
                  placeholder="그룹 선택..."
                  style={styles.dropdown}
                  dropDownContainerStyle={styles.dropdownContainer}
                  textStyle={styles.dropdownText}
                  listMode="SCROLLVIEW"
                  scrollViewProps={{
                    nestedScrollEnabled: true,
                  }}
                  zIndex={2000}
                  zIndexInverse={3000}
                />
              </View>

              {/* 역할 선택 */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>역할</Text>
                <DropDownPicker
                  open={groupRoleOpen}
                  value={selectedGroupRole}
                  items={groupRoleItems}
                  setOpen={setGroupRoleOpen}
                  setValue={setSelectedGroupRole}
                  setItems={setGroupRoleItems}
                  placeholder="역할 선택..."
                  style={styles.dropdown}
                  dropDownContainerStyle={styles.dropdownContainer}
                  textStyle={styles.dropdownText}
                  listMode="SCROLLVIEW"
                  scrollViewProps={{
                    nestedScrollEnabled: true,
                  }}
                  zIndex={1000}
                  zIndexInverse={4000}
                />
              </View>

              {/* 반 코드 입력 */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>반 코드 (선택)</Text>
                <TextInput
                  value={classCodeInput}
                  onChangeText={setClassCodeInput}
                  placeholder="반 코드 입력"
                  style={styles.textInput}
                  maxLength={32}
                />
              </View>

              {/* 추가 버튼 */}
              <TouchableOpacity
                style={[styles.submitButton, !selectedJobCodeId && styles.submitButtonDisabled]}
                onPress={handleAddJobCode}
                disabled={!selectedJobCodeId || isUpdating}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>추가</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* 기존 직무 경험 목록 */}
          {isLoading && jobCodes.length === 0 ? (
            <ActivityIndicator size="small" color="#4F46E5" />
          ) : jobCodes.length === 0 ? (
            <Text style={styles.emptyText}>등록된 업무 경력이 없습니다.</Text>
          ) : (
            <View style={[styles.jobCodesContainer, isUpdating && styles.updating]}>
              {jobCodes
                .slice()
                .sort((a: any, b: any) => {
                  const genA = parseInt(a.generation.replace(/[^0-9]/g, '')) || 0;
                  const genB = parseInt(b.generation.replace(/[^0-9]/g, '')) || 0;
                  return genB - genA;
                })
                .map((jobCode: any, idx: number) => {
                  const exp = user.jobExperiences?.find((e: any) => e.id === jobCode.id);
                  return (
                    <View key={idx} style={styles.jobCodeCard}>
                      <View style={styles.jobCodeCardContent}>
                        <View style={styles.jobCodeInfoRow}>
                          <Text style={styles.jobCodeName}>{jobCode.code}</Text>
                          {exp?.group && (
                            <>
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
                              {exp.groupRole && (
                                <View style={[styles.badge, styles.badgeRole]}>
                                  <Text style={styles.badgeText}>{exp.groupRole}</Text>
                                </View>
                              )}
                              {exp.classCode && (
                                <View style={[styles.badge, styles.badgeClass]}>
                                  <Text style={styles.badgeText}>{exp.classCode}</Text>
                                </View>
                              )}
                            </>
                          )}
                        </View>
                        <TouchableOpacity
                          style={styles.deleteButton}
                          onPress={() => handleRemoveJobCode(jobCode.id)}
                          disabled={isUpdating}
                        >
                          <Ionicons name="trash-outline" size={20} color={isUpdating ? "#9CA3AF" : "#EF4444"} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
            </View>
          )}
        </View>

        {/* 평가 점수 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>평가 점수</Text>
          {(user.id || user.userId) ? (
            <EvaluationStageCards
              key={refreshKey}
              userId={user.id || user.userId}
              onAddEvaluation={(stage) => {
                setSelectedEvaluationStage(stage);
                setShowEvaluationForm(true);
              }}
            />
          ) : (
            <Text style={styles.emptyText}>사용자 ID가 없어 평가를 불러올 수 없습니다.</Text>
          )}
        </View>

        {/* 알바 & 멘토링 경력 */}
        {user.partTimeJobs && user.partTimeJobs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>알바 & 멘토링 경력</Text>
            {user.partTimeJobs.map((job: any, index: number) => (
              <View key={index} style={styles.partTimeJobCard}>
                <View style={styles.partTimeJobHeader}>
                  <Text style={styles.partTimeJobCompany}>{job.companyName}</Text>
                  <Text style={styles.partTimeJobPeriod}>{job.period}</Text>
                </View>
                <View style={styles.partTimeJobRow}>
                  <Text style={styles.partTimeJobLabel}>담당: </Text>
                  <Text style={styles.partTimeJobValue}>{job.position}</Text>
                </View>
                <View style={styles.partTimeJobRow}>
                  <Text style={styles.partTimeJobLabel}>업무 내용: </Text>
                  <Text style={styles.partTimeJobValue}>{job.description}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* 자기소개 & 지원동기 */}
        {(user.selfIntroduction || user.jobMotivation) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>자기소개 및 지원동기</Text>
            {user.selfIntroduction && (
              <View style={styles.textSection}>
                <Text style={styles.textLabel}>자기소개</Text>
                <Text style={styles.textValue}>{user.selfIntroduction}</Text>
              </View>
            )}
            {user.jobMotivation && (
              <View style={styles.textSection}>
                <Text style={styles.textLabel}>지원 동기</Text>
                <Text style={styles.textValue}>{user.jobMotivation}</Text>
              </View>
            )}
          </View>
        )}

        {/* 관리자 피드백 */}
        {user.feedback && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>관리자 피드백</Text>
            <Text style={styles.textValue}>{user.feedback}</Text>
          </View>
        )}
      </ScrollView>

      {/* 평가 작성 모달 */}
      <Modal
        visible={showEvaluationForm}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowEvaluationForm(false);
          setSelectedEvaluationStage(null);
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                setShowEvaluationForm(false);
                setSelectedEvaluationStage(null);
              }}
            >
              <Ionicons name="close" size={28} color="#111827" />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle}>평가 작성</Text>
            <View style={{ width: 28 }} />
          </View>
          {selectedEvaluationStage && currentUser && (
            <EvaluationForm
              targetUserId={user.id || user.userId}
              targetUserName={user.name}
              evaluatorId={currentUser.userId}
              evaluatorName={currentUser.name}
              evaluationStage={selectedEvaluationStage}
              onSuccess={() => {
                setShowEvaluationForm(false);
                setSelectedEvaluationStage(null);
                setRefreshKey(prev => prev + 1);
              }}
              onCancel={() => {
                setShowEvaluationForm(false);
                setSelectedEvaluationStage(null);
              }}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  scrollView: {
    flex: 1,
  },
  profileHeader: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  profileImageContainer: {
    marginBottom: 12,
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  profilePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profilePlaceholderText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#6B7280',
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  section: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
    gap: 4,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
  },
  jobCodeForm: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 12,
  },
  formField: {
    gap: 6,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  dropdown: {
    borderColor: '#D1D5DB',
    borderRadius: 6,
    minHeight: 44,
  },
  dropdownContainer: {
    borderColor: '#D1D5DB',
  },
  dropdownText: {
    fontSize: 14,
    color: '#111827',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  submitButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 4,
  },
  submitButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 12,
  },
  jobCodesContainer: {
    gap: 8,
  },
  updating: {
    opacity: 0.6,
  },
  jobCodeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  jobCodeCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  jobCodeInfoRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  jobCodeName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeGroup: {
    backgroundColor: '#DBEAFE',
  },
  badgeRole: {
    backgroundColor: '#FEF3C7',
  },
  badgeClass: {
    backgroundColor: '#E9D5FF',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  deleteButton: {
    padding: 4,
    marginLeft: 8,
  },
  infoCompact: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  infoText: {
    fontSize: 13,
    flex: 0.48,
  },
  infoLabel: {
    color: '#6B7280',
  },
  infoValue: {
    color: '#111827',
    fontWeight: '500',
  },
  textSection: {
    marginBottom: 12,
  },
  textLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 6,
  },
  textValue: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
  },
  partTimeJobCard: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  partTimeJobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  partTimeJobCompany: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  partTimeJobPeriod: {
    fontSize: 12,
    color: '#6B7280',
  },
  partTimeJobRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  partTimeJobLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  partTimeJobValue: {
    fontSize: 13,
    color: '#111827',
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
});
