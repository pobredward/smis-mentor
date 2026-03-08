import React, { useEffect, useRef, useState } from 'react';
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
import { STSheetStudent, CampType } from '@smis-mentor/shared';
import { useAuth } from '../context/AuthContext';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_HEIGHT = SCREEN_HEIGHT * 0.75; // 화면의 75%
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

interface StudentDetailModalProps {
  visible: boolean;
  students: STSheetStudent[]; // 전체 학생 목록
  initialIndex: number; // 초기 선택된 학생 인덱스
  onClose: () => void;
  campType: CampType;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  visible,
  students,
  initialIndex,
  onClose,
  campType,
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

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      // 카드 등장 애니메이션 (scale + fade)
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }),
        Animated.spring(translateY, {
          toValue: 1,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }),
      ]).start();
      
      // 초기 위치로 스크롤
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          x: initialIndex * CARD_WIDTH,
          animated: false,
        });
      }, 100);
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

  if (students.length === 0) return null;

  const student = students[currentIndex];

  const InfoRow = ({ label, value }: { label: string; value?: string | null }) => {
    if (!value) return null;
    return (
      <View style={styles.infoRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
    );
  };

  const StudentCard = ({ student: s }: { student: STSheetStudent }) => (
    <ScrollView
      style={styles.cardScrollView}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      <View style={styles.cardContent}>
        {/* 캠프 정보 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>캠프 정보</Text>
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
          <Text style={styles.sectionTitle}>기본 정보</Text>
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
          <Text style={styles.sectionTitle}>보호자 정보</Text>
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
          <Text style={styles.sectionTitle}>상세 정보</Text>
          <InfoRow label="복용약 & 알레르기" value={s.medication} />
          <InfoRow label="특이사항" value={s.notes} />
          <InfoRow label="기타" value={s.etc} />
        </View>
      </View>
    </ScrollView>
  );

  return (
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
            {/* 학생 이름 - 완벽한 가운데 정렬 */}
            <View style={styles.headerCenter}>
              <Text style={styles.studentName}>{student.name}</Text>
              <Text style={styles.pageIndicator}>
                {currentIndex + 1} / {students.length}
              </Text>
            </View>

            {/* X 버튼 - 절대 위치 최상단 */}
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
            {students.map((s, index) => (
              <View key={s.studentId} style={styles.page}>
                <StudentCard student={s} />
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
  );
};

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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    position: 'relative',
    height: 60,
  },
  headerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentName: {
    fontSize: 18,
    fontWeight: '700' as '700',
    color: '#1e293b',
  },
  pageIndicator: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600' as '600',
    color: '#1e293b',
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  label: {
    flex: 1,
    fontSize: 13,
    color: '#64748b',
  },
  value: {
    flex: 2,
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '500' as '500',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
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
});
