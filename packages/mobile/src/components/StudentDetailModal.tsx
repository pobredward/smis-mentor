import React, { useCallback, useEffect, useRef, useState } from 'react';
import { logger, toDriveImageUrl } from '@smis-mentor/shared';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  PanResponder,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { STSheetStudent, CampType } from '@smis-mentor/shared';
import { useAuth } from '../context/AuthContext';
import { requestContactsPermission, getContactsPermissionStatus, saveSingleParentContact, deleteSingleParentContact } from '../services';
import { ContactsPermissionDisclosureModal } from './ContactsPermissionDisclosureModal';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_HEIGHT = SCREEN_HEIGHT * 0.78; // 화면의 78%
const CARD_WIDTH = SCREEN_WIDTH * 0.9; // 화면의 90%
const HORIZONTAL_MARGIN = (SCREEN_WIDTH - CARD_WIDTH) / 2; // 좌우 여백

// 주민등록번호 마스킹 함수
const maskSSN = (ssn: string | null | undefined, isAdmin: boolean, groupRole?: string): string => {
  if (!ssn) return '-';
  // 관리자만 전체 공개
  if (isAdmin) return ssn;
  // 형식: 980619-1****** (앞 6자리 + - + 첫번째 숫자 + 나머지 *)
  const parts = ssn.split('-');
  if (parts.length !== 2) return ssn; // 형식이 다르면 원본 반환
  const front = parts[0];
  const back = parts[1];
  if (back.length === 0) return ssn;
  return `${front}-${back[0]}${'*'.repeat(back.length - 1)}`;
};


const InfoRow = React.memo(({ label, value }: { label: string; value?: string | null }) => {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
});

interface StudentDetailModalProps {
  visible: boolean;
  students: STSheetStudent[];
  initialIndex: number;
  onClose: () => void;
  campType: CampType;
  campCode?: string;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  visible,
  students,
  initialIndex,
  onClose,
  campType,
  campCode,
}) => {
  const { userData } = useAuth();
  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;
  const activeJobExp = userData?.jobExperiences?.find(exp => exp.id === activeJobCodeId);
  const groupRole = activeJobExp?.groupRole;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0)).current;
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  // Google Play 정책: 연락처 권한 요청 직전 명시적 공개(Prominent Disclosure) 모달
  const [showContactsDisclosure, setShowContactsDisclosure] = useState(false);
  const pendingStudentRef = useRef<STSheetStudent | null>(null);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      // 카드 등장 애니메이션 (scale + fade)
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 160,
          friction: 14,
        }),
        Animated.spring(translateY, {
          toValue: 1,
          useNativeDriver: true,
          tension: 160,
          friction: 14,
        }),
      ]).start();
      
      // 초기 위치로 스크롤 (레이아웃 직후 즉시 이동)
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          x: initialIndex * CARD_WIDTH,
          animated: false,
        });
      }, 0);
    } else {
      // 카드 사라지는 애니메이션
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, initialIndex]);

  // 스크롤 이벤트 핸들러
  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / CARD_WIDTH);
    if (index !== currentIndex && index >= 0 && index < students.length) {
      setCurrentIndex(index);
    }
  };

  const handleSaveParentContact = useCallback(async (s: STSheetStudent) => {
    if (!s.parentPhone) return;

    // 이미 권한이 있으면 disclosure 없이 바로 저장
    const currentStatus = await getContactsPermissionStatus();
    if (currentStatus === 'granted') {
      await saveSingleParentContact(s, campCode);
      return;
    }

    // 권한이 없으면 Google Play 정책에 따라 disclosure 모달을 먼저 표시
    pendingStudentRef.current = s;
    setShowContactsDisclosure(true);
  }, [campCode]);

  const handleContactsDisclosureAccept = useCallback(async () => {
    setShowContactsDisclosure(false);
    const s = pendingStudentRef.current;
    pendingStudentRef.current = null;
    if (!s) return;

    const granted = await requestContactsPermission();
    if (!granted) return;
    await saveSingleParentContact(s, campCode);
  }, [campCode]);

  const handleContactsDisclosureDeny = useCallback(() => {
    setShowContactsDisclosure(false);
    pendingStudentRef.current = null;
  }, []);

  if (students.length === 0) return null;

  const student = students[currentIndex] ?? students[0];

  return (
    <>
    {/* Google Play 정책(Prominent Disclosure) 준수: OS 연락처 권한 요청 직전 명시적 공개 모달 */}
    <ContactsPermissionDisclosureModal
      visible={showContactsDisclosure}
      onAccept={handleContactsDisclosureAccept}
      onDeny={handleContactsDisclosureDeny}
    />
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* 반투명 배경 */}
        <TouchableOpacity 
          style={StyleSheet.absoluteFill}
          activeOpacity={1} 
          onPress={onClose}
        />
        
        {/* 카드 컨테이너 */}
        <Animated.View 
          style={[
            styles.cardContainer,
            {
              transform: [{ scale }],
              opacity: translateY,
            },
          ]}
        >
          {/* 헤더 */}
          <View style={styles.header}>
            {/* 학생 이름 */}
            <View style={styles.headerCenter}>
              <Text style={styles.studentName}>{student.name}</Text>
              <Text style={styles.pageIndicator}>
                {currentIndex + 1} / {students.length}
              </Text>
            </View>

            {/* X 버튼 */}
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Swipeable Content */}
          <ScrollView
            ref={scrollViewRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            bounces={false}
            snapToInterval={CARD_WIDTH}
            decelerationRate="fast"
          >
            {students.map((s) => (
              <View key={s.studentId} style={styles.page}>
                <StudentCard
                  student={s}
                  campType={campType}
                  isAdmin={isAdmin}
                  groupRole={groupRole}
                  onSaveContact={handleSaveParentContact}
                />
              </View>
            ))}
          </ScrollView>

          {/* 페이지 인디케이터 (도트) */}
          {students.length > 1 && (
            <View style={styles.dotsContainer}>
              {students.map((s, idx) => (
                <View
                  key={s.studentId}
                  style={[
                    styles.dot,
                    idx === currentIndex && styles.dotActive,
                  ]}
                />
              ))}
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
    </>
  );
};

interface StudentCardProps {
  student: STSheetStudent;
  campType: CampType;
  isAdmin: boolean;
  groupRole?: string;
  onSaveContact: (s: STSheetStudent) => void;
}

const StudentCard = React.memo(({ student: s, campType, isAdmin, groupRole, onSaveContact }: StudentCardProps) => {
  const profilePhotoUrl = toDriveImageUrl(s.profilePhoto);
  return (
  <ScrollView
    style={styles.cardScrollView}
    showsVerticalScrollIndicator={true}
    bounces={false}
    indicatorStyle="black"
  >
    {/* 프로필 사진 - 스와이프 콘텐츠와 함께 이동하여 딜레이 없음 */}
    <View style={styles.profilePhotoContainer}>
      {profilePhotoUrl ? (
        <Image
          source={profilePhotoUrl}
          style={styles.profilePhoto}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.profilePhoto, styles.profilePhotoPlaceholder]}>
          <Ionicons
            name="person"
            size={64}
            color={s.gender === 'M' ? '#93c5fd' : '#fcd34d'}
          />
        </View>
      )}
    </View>

    <View style={styles.cardContent}>
      {/* 캠프 정보 */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: 6 }]}>캠프 정보</Text>
        <InfoRow label="고유번호" value={s.studentId} />
        <InfoRow
          label="반 정보"
          value={
            s.classNumber || s.className || s.classMentor
              ? `${s.classNumber || '-'} | ${s.className || '-'}반 | ${s.classMentor || '-'} 멘토`
              : undefined
          }
        />
        <InfoRow
          label="유닛 정보"
          value={
            s.unit || s.unitMentor || s.roomNumber
              ? `${s.unit || s.unitMentor || '-'} 유닛 | ${s.roomNumber || '-'}호`
              : s.unitMentor || s.roomNumber
              ? `${s.unitMentor || '-'} | ${s.roomNumber || '-'}호`
              : undefined
          }
        />
      </View>

      {/* 기본 정보 */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: 6 }]}>기본 정보</Text>
        <InfoRow
          label="신상"
          value={`${s.name} | ${s.englishName || '-'} | ${s.grade} | ${s.gender === 'M' ? '남' : '여'}`}
        />
        <InfoRow label="주민등록번호" value={maskSSN(s.ssn, isAdmin, groupRole)} />
        <InfoRow label="도로명 주소" value={s.address} />
        <InfoRow label="세부 주소" value={s.addressDetail} />

        {campType === 'EJ' && (
          <InfoRow
            label="입퇴소공항"
            value={
              s.departureRoute || s.arrivalRoute
                ? `${s.departureRoute || '-'} 입소 | ${s.arrivalRoute || '-'} 퇴소`
                : undefined
            }
          />
        )}

        {campType === 'S' && (
          <>
            <InfoRow label="단체티 사이즈" value={s.shirtSize} />
            <InfoRow
              label="여권정보"
              value={
                s.passportName || s.passportNumber || s.passportExpiry
                  ? `${s.passportName || '-'} | ${s.passportNumber || '-'} | ${s.passportExpiry || '-'}`
                  : undefined
              }
            />
          </>
        )}
      </View>

      {/* 보호자 정보 */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>보호자 정보</Text>
          {s.parentPhone && (
            <TouchableOpacity
              onPress={() => onSaveContact(s)}
              style={styles.saveContactBtn}
              accessibilityLabel="보호자 연락처 저장"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="person-add-outline" size={15} color="#10b981" />
            </TouchableOpacity>
          )}
        </View>
        <InfoRow
          label="대표 보호자"
          value={
            s.parentPhone || s.parentName
              ? `${s.parentPhone || '-'} | ${s.parentName || '-'}`
              : undefined
          }
        />
        <InfoRow label="대표 이메일" value={s.email} />
        <InfoRow
          label="기타 보호자"
          value={
            s.otherPhone || s.otherName
              ? `${s.otherPhone || '-'} | ${s.otherName || '-'}`
              : undefined
          }
        />
      </View>

      {/* 상세 정보 */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: 6 }]}>상세 정보</Text>
        <InfoRow label="복용약 & 알레르기" value={s.medication} />
        <InfoRow label="특이사항" value={s.notes} />
        <InfoRow label="기타" value={s.etc} />
      </View>

      {/* 사전 설문조사 */}
      {!!s.surveyMbti && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { marginBottom: 6 }]}>사전 설문조사</Text>
          {([
            ['MBTI', s.surveyMbti],
            ['캠프 참여 결정', s.surveyCampDecision],
            ['캠프에 기대하는 1순위', s.surveyCampExpectation],
            ['이전 영어캠프/어학캠프 경험 (회)', s.surveyCampExperience],
            ['모바일/PC게임 (시간/일)', s.surveyGameTime],
            ['SNS (시간/일)', s.surveySnsTime],
            ['재학 학교 유형', s.surveySchoolType],
            ['영어학원 기간 (년)', s.surveyAcademyPeriod],
            ['원어민 수업 (시간/주)', s.surveyNativeClassHours],
            ['원어민 수업 발화 비율 (%)', s.surveySpeakingRatio],
            ['영어를 좋아하는 편', s.surveyLikesEnglish],
            ['영어를 잘 하는 편', s.surveyGoodAtEnglish],
            ['처음 보는 친구에게 먼저 말 걸기', s.surveyTalkFirst],
            ['학교 친구가 많은 편', s.surveyManyFriends],
            ['조별 활동 주도적', s.surveyGroupLeader],
            ['단체 활동 규칙 준수', s.surveyFollowRules],
            ['선생님 말 잘 듣기', s.surveyListenTeacher],
            ['집이 화목한 편', s.surveyHappyHome],
            ['부모님 말 잘 듣기', s.surveyListenParents],
            ['평균 수면 시간 (시간)', s.surveySleepHours],
            ['학교에서 공부 잘 하는 편', s.surveyGoodAtStudy],
            ['학교 발표 자주 하는 편', s.surveyPresentation],
            ['노력하면 실력 늘어난다 믿음', s.surveyGrowthMindset],
            ['모르면 바로 질문', s.surveyAsksQuestions],
            ['숙제 미루지 않기', s.surveyNoHomeworkDelay],
            ['계획 지키는 편', s.surveyFollowPlan],
            ['수업 집중 잘 하는 편', s.surveyFocusInClass],
            ['다니는 학원 개수 (개)', s.surveyAcademyCount],
            ['다니는 학원 종류', s.surveyAcademyTypes],
          ] as [string, string | undefined][])
            .filter(([, v]) => !!v)
            .map(([label, value]) => (
              <InfoRow key={label} label={label} value={value} />
            ))}
        </View>
      )}
    </View>
  </ScrollView>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    position: 'relative',
    minHeight: 48,
  },
  profilePhotoContainer: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
  },
  profilePhoto: {
    width: 140,
    height: 140,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  profilePhotoPlaceholder: {
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentName: {
    fontSize: 16,
    fontWeight: '700' as '700',
    color: '#1e293b',
  },
  pageIndicator: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeButtonText: {
    fontSize: 22,
    color: '#64748b',
    fontWeight: '400' as '400',
  },
  page: {
    width: CARD_WIDTH,
  },
  cardScrollView: {
    flex: 1,
  },
  cardContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600' as '600',
    color: '#1e293b',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  label: {
    width: 85,
    fontSize: 12,
    color: '#64748b',
  },
  value: {
    flex: 1,
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '500' as '500',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    flexWrap: 'wrap',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#cbd5e1',
    marginHorizontal: 2,
    marginVertical: 2,
  },
  dotActive: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#3b82f6',
  },
  saveContactBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    borderRadius: 6,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
});
