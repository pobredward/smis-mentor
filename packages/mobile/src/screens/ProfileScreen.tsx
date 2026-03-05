import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { MainTabScreenProps } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { signOut } from '../services/authService';
import { jobCodesService, JobCode } from '../services';
import { SignInScreen } from './SignInScreen';
import { SignUpStep1Screen } from './SignUpStep1Screen';
import { SignUpStep2Screen } from './SignUpStep2Screen';
import { ProfileEditScreen } from './ProfileEditScreen';

type Screen = 'profile' | 'signin' | 'signup-step1' | 'signup-step2' | 'profile-edit';

export function ProfileScreen({ navigation }: MainTabScreenProps<'Profile'>) {
  const { currentUser, userData, loading, updateActiveJobCode } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<Screen>('signin');
  const [signUpData, setSignUpData] = useState<{
    name?: string;
    phone?: string;
    email?: string;
    password?: string;
  }>({});
  const [jobCodes, setJobCodes] = useState<JobCode[]>([]);
  const [loadingJobCodes, setLoadingJobCodes] = useState(false);
  const [changingJobCode, setChangingJobCode] = useState(false);
  const [jobCodesExpanded, setJobCodesExpanded] = useState(true);

  useEffect(() => {
    if (userData) {
      loadJobCodes();
    }
  }, [userData]);

  const loadJobCodes = async () => {
    if (!userData) {
      return;
    }

    try {
      setLoadingJobCodes(true);
      let codes: JobCode[] = [];
      
      // 관리자는 모든 캠프 코드 조회
      if (userData.role === 'admin') {
        codes = await jobCodesService.getAllJobCodes();
      } 
      // 일반 사용자는 자신의 캠프 코드만 조회
      else if (userData.jobExperiences && userData.jobExperiences.length > 0) {
        codes = await jobCodesService.getJobCodesByIds(userData.jobExperiences);
      }
      
      // 기수별 내림차순 정렬 (27기, 26기, ... 순서)
      const sortedCodes = codes.sort((a, b) => {
        const aGen = parseInt(a.generation.replace(/\D/g, '')) || 0;
        const bGen = parseInt(b.generation.replace(/\D/g, '')) || 0;
        return bGen - aGen;
      });
      
      setJobCodes(sortedCodes);
    } catch (error) {
      console.error('기수 정보 로드 실패:', error);
    } finally {
      setLoadingJobCodes(false);
    }
  };

  const handleJobCodeSelect = async (jobCodeId: string) => {
    if (userData?.activeJobExperienceId === jobCodeId) {
      return;
    }

    try {
      setChangingJobCode(true);
      console.log('🔄 ProfileScreen: 기수 변경 요청');
      console.log('  - 현재 activeJobExperienceId:', userData?.activeJobExperienceId);
      console.log('  - 새로운 jobCodeId:', jobCodeId);
      
      await updateActiveJobCode(jobCodeId);
      
      console.log('✅ ProfileScreen: 기수 변경 완료');
      Alert.alert('성공', '기수가 변경되었습니다.\n캠프 탭에서 해당 기수의 자료를 확인하세요.');
    } catch (error) {
      console.error('❌ ProfileScreen: 기수 변경 실패:', error);
      Alert.alert('오류', '기수 변경에 실패했습니다.');
    } finally {
      setChangingJobCode(false);
    }
  };

  const handleSignUpStep1Next = (data: { name: string; phone: string }) => {
    setSignUpData({ ...signUpData, ...data });
    setCurrentScreen('signup-step2');
  };

  const handleSignUpStep2Next = (data: { email: string; password: string }) => {
    setSignUpData({ ...signUpData, ...data });
    // TODO: Implement education and details screens
    Alert.alert(
      '회원가입 진행',
      '회원가입 3, 4단계는 웹에서 진행해주세요.\n현재는 로그인 기능만 모바일에서 지원됩니다.',
      [
        {
          text: '확인',
          onPress: () => setCurrentScreen('signin'),
        },
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      {
        text: '취소',
        style: 'cancel',
      },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            Alert.alert('로그아웃', '로그아웃되었습니다.');
          } catch (error) {
            console.error('로그아웃 오류:', error);
            Alert.alert('오류', '로그아웃 중 오류가 발생했습니다.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>로딩 중...</Text>
      </View>
    );
  }

  // 로그인된 상태
  if (currentUser && userData) {
    // 프로필 수정 화면
    if (currentScreen === 'profile-edit') {
      return <ProfileEditScreen onBack={() => setCurrentScreen('profile')} />;
    }

    return (
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          {/* 헤더 */}
          <View style={styles.header}>
            <Text style={styles.title}>내 프로필</Text>
            <TouchableOpacity
              onPress={() => setCurrentScreen('profile-edit')}
              style={styles.editButton}
            >
              <Text style={styles.editButtonText}>수정</Text>
            </TouchableOpacity>
          </View>

          {/* 프로필 카드 */}
          <View style={styles.profileCard}>
            <View style={styles.profileHeader}>
              {userData.profileImage ? (
                <Image
                  source={{ uri: userData.profileImage }}
                  style={styles.avatarImage}
                />
              ) : (
                <View style={styles.avatarContainer}>
                  <Text style={styles.avatarText}>
                    {userData.name.charAt(0)}
                  </Text>
                </View>
              )}
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{userData.name}</Text>
                <Text style={styles.profileEmail}>{userData.email}</Text>
                {userData.phone && (
                  <Text style={styles.profilePhone}>{userData.phone}</Text>
                )}
              </View>
            </View>
          </View>

          {/* SMIS 캠프 참여 이력 - 기수 선택 */}
          <View style={styles.sectionCard}>
            <TouchableOpacity 
              style={styles.sectionHeader}
              onPress={() => setJobCodesExpanded(!jobCodesExpanded)}
              activeOpacity={0.7}
            >
              <View style={styles.sectionHeaderContent}>
                <Text style={styles.sectionTitle}>
                  {userData.role === 'admin' ? '전체 캠프 코드' : 'SMIS 캠프 참여 이력'}
                </Text>
                {jobCodes.length > 0 && (
                  <Text style={styles.expandIcon}>
                    {jobCodesExpanded ? '▼' : '▶'}
                  </Text>
                )}
              </View>
              {!jobCodesExpanded && jobCodes.length > 0 && (
                <View style={styles.collapsedCodesContainer}>
                  {jobCodes.slice(0, 10).map((jobCode) => (
                    <View key={jobCode.id} style={styles.collapsedCodeBadge}>
                      <Text style={styles.collapsedCodeText}>{jobCode.code}</Text>
                    </View>
                  ))}
                  {jobCodes.length > 10 && (
                    <Text style={styles.moreCodesText}>+{jobCodes.length - 10}</Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
            
            {jobCodesExpanded && (
              <>
                {loadingJobCodes ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#3b82f6" />
                  </View>
                ) : jobCodes.length === 0 ? (
                  <Text style={styles.emptyText}>등록된 참여 이력이 없습니다.</Text>
                ) : (
                  <View style={styles.jobCodesContainer}>
                    {jobCodes.map((jobCode) => {
                      const exp = userData.jobExperiences?.find(e => e.id === jobCode.id);
                      const isActive = userData.activeJobExperienceId === jobCode.id;
                      
                      return (
                        <TouchableOpacity
                          key={jobCode.id}
                          style={[
                            styles.jobCodeItem,
                            isActive && styles.jobCodeItemActive,
                          ]}
                          onPress={() => handleJobCodeSelect(jobCode.id)}
                          disabled={changingJobCode || isActive}
                        >
                          <View style={styles.jobCodeMain}>
                            <Text style={styles.jobCodeText}>
                              {jobCode.generation} {jobCode.name}
                            </Text>
                            <View style={styles.jobCodeBadges}>
                              {isActive && (
                                <View style={styles.activeBadge}>
                                  <Text style={styles.activeBadgeText}>활성</Text>
                                </View>
                              )}
                              {jobCode.code && (
                                <View style={styles.codeBadge}>
                                  <Text style={styles.codeBadgeText}>{jobCode.code}</Text>
                                </View>
                              )}
                              {exp?.groupRole && (
                                <View style={styles.roleBadge}>
                                  <Text style={styles.roleBadgeText}>{exp.groupRole}</Text>
                                </View>
                              )}
                              {exp?.classCode && (
                                <View style={styles.classBadge}>
                                  <Text style={styles.classBadgeText}>{exp.classCode}</Text>
                                </View>
                              )}
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </View>

          {/* 개인 정보 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>개인 정보</Text>
            </View>
            <View style={styles.infoGrid}>
              {userData.age && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>나이</Text>
                  <Text style={styles.infoValue}>{userData.age}세</Text>
                </View>
              )}
              {userData.gender && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>성별</Text>
                  <Text style={styles.infoValue}>{userData.gender === 'M' ? '남성' : '여성'}</Text>
                </View>
              )}
              {userData.phoneNumber && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>연락처</Text>
                  <Text style={styles.infoValue}>{userData.phoneNumber}</Text>
                </View>
              )}
              {userData.address && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>주소</Text>
                  <Text style={styles.infoValue}>
                    {userData.address}
                    {userData.addressDetail ? ` ${userData.addressDetail}` : ''}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* 학교 정보 */}
          {(userData.school || userData.university) && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>학교 정보</Text>
              </View>
              <View style={styles.infoGrid}>
                {(userData.university || userData.school) && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>학교</Text>
                    <Text style={styles.infoValue}>{userData.university || userData.school}</Text>
                  </View>
                )}
                {userData.grade && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>학년</Text>
                    <Text style={styles.infoValue}>
                      {userData.grade === 6 ? '졸업생' : `${userData.grade}학년`}
                      {userData.isOnLeave ? ' (휴학 중)' : ''}
                    </Text>
                  </View>
                )}
                {(userData.major1 || userData.major) && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>전공</Text>
                    <Text style={styles.infoValue}>
                      {userData.major1 || userData.major}
                      {userData.major2 ? ` / ${userData.major2}` : ''}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* 알바 & 멘토링 경력 */}
          {userData.partTimeJobs && userData.partTimeJobs.length > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>알바 & 멘토링 경력</Text>
              </View>
              <View style={styles.experienceContainer}>
                {userData.partTimeJobs.map((job, index) => (
                  <View key={index} style={styles.experienceItem}>
                    <View style={styles.experienceHeader}>
                      <Text style={styles.experienceCompany}>{job.companyName}</Text>
                      <Text style={styles.experiencePeriod}>{job.period}</Text>
                    </View>
                    <Text style={styles.experiencePosition}>{job.position}</Text>
                    {job.description && (
                      <Text style={styles.experienceDescription}>{job.description}</Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 자기소개 & 지원동기 */}
          {(userData.selfIntroduction || userData.jobMotivation) && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>자기소개 & 지원동기</Text>
              </View>
              <View style={styles.infoGrid}>
                {userData.selfIntroduction && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>자기소개</Text>
                    <Text style={styles.infoValueMultiline}>{userData.selfIntroduction}</Text>
                  </View>
                )}
                {userData.jobMotivation && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>지원동기</Text>
                    <Text style={styles.infoValueMultiline}>{userData.jobMotivation}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* 로그아웃 버튼 */}
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Text style={styles.logoutButtonText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // 로그인되지 않은 상태 - 화면 전환
  switch (currentScreen) {
    case 'signup-step1':
      return (
        <SignUpStep1Screen
          onNext={handleSignUpStep1Next}
          onSignInPress={() => setCurrentScreen('signin')}
        />
      );
    case 'signup-step2':
      return (
        <SignUpStep2Screen
          name={signUpData.name || ''}
          phone={signUpData.phone || ''}
          onNext={handleSignUpStep2Next}
          onBack={() => setCurrentScreen('signup-step1')}
        />
      );
    case 'signin':
    default:
      return (
        <SignInScreen
          onSignUpPress={() => setCurrentScreen('signup-step1')}
          onSignInSuccess={() => setCurrentScreen('profile')}
        />
      );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 6,
  },
  editButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  
  // 프로필 카드
  profileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    marginBottom: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
    marginRight: 16,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },
  profilePhone: {
    fontSize: 14,
    color: '#64748b',
  },
  
  // 섹션 카드
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sectionHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  collapsedCodesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  collapsedCodeBadge: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  collapsedCodeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  moreCodesText: {
    fontSize: 11,
    color: '#64748b',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  expandIcon: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  
  // 기수 목록
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748b',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  jobCodesContainer: {
    padding: 16,
  },
  jobCodeItem: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  jobCodeItemActive: {
    borderColor: '#3b82f6',
    borderWidth: 2,
    backgroundColor: '#eff6ff',
  },
  jobCodeMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  jobCodeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
    flex: 1,
  },
  jobCodeBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  activeBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  codeBadge: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  codeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  roleBadge: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#64748b',
  },
  classBadge: {
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#93c5fd',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
  },
  classBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1e40af',
  },
  
  // 학교 정보
  infoGrid: {
    padding: 20,
  },
  infoItem: {
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '500',
  },
  infoValueMultiline: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 20,
  },
  
  // 경력
  experienceContainer: {
    padding: 20,
  },
  experienceItem: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  experienceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  experienceCompany: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  experiencePeriod: {
    fontSize: 13,
    color: '#64748b',
  },
  experiencePosition: {
    fontSize: 14,
    color: '#3b82f6',
    marginBottom: 6,
  },
  experienceDescription: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  
  // 로그아웃 버튼
  logoutButton: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  logoutButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
