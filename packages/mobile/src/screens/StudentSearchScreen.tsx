import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Image,
  Pressable,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AdminStackScreenProps } from '../navigation/types';
import {
  loadAllStudentRecords,
  filterStudents,
  groupStudentResults,
  StudentGroup,
  StudentHistoryResult,
} from '../services/stSheet';
import { STSheetStudent, FamilyUnit, toDriveImageUrl } from '@smis-mentor/shared';

const DEBOUNCE_MS = 200;
const MIN_QUERY_LEN = 2;

// ─── 유틸 ────────────────────────────────────────────────────

function campTypeBadgeColor(campCode: string): { bg: string; text: string } {
  const type = campCode.replace(/\d.*/, '').toUpperCase();
  switch (type) {
    case 'S':  return { bg: '#dbeafe', text: '#1d4ed8' };
    case 'E':
    case 'J':  return { bg: '#dcfce7', text: '#15803d' };
    case 'D':
    case 'G':
    case 'K':  return { bg: '#ffedd5', text: '#c2410c' };
    case 'F':  return { bg: '#fce7f3', text: '#be185d' };
    default:   return { bg: '#f3f4f6', text: '#374151' };
  }
}

// ─── InfoRow ────────────────────────────────────────────────

// ── 공통 정보 행 (반명단/방명단 모달과 동일한 스타일) ──────────
function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={infoStyles.row}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={infoStyles.value} numberOfLines={4}>{value}</Text>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={infoStyles.sectionTitle}>{title}</Text>;
}

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  label: {
    width: 96,
    fontSize: 12,
    color: '#64748b',
    flexShrink: 0,
  },
  value: {
    flex: 1,
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
    marginTop: 2,
  },
});

// ─── 일반 캠프 상세 패널 ─────────────────────────────────────

function CampDetail({ student }: { student: STSheetStudent }) {
  const syncDate = student.lastSyncedAt
    ? new Date(student.lastSyncedAt as unknown as string).toLocaleDateString('ko-KR')
    : null;

  return (
    <View style={detailStyles.container}>
      {/* 캠프 정보 */}
      <View style={detailStyles.section}>
        <SectionTitle title="캠프 정보" />
        <InfoRow label="고유번호" value={student.studentId} />
        <InfoRow label="반 정보"
          value={student.classNumber || student.className || student.classMentor
            ? `${student.classNumber || '-'} | ${student.className || '-'}반 | ${student.classMentor || '-'} 멘토`
            : undefined}
        />
        <InfoRow label="유닛 정보"
          value={student.unit || student.roomNumber
            ? `${student.unit || '-'} 유닛 | ${student.roomNumber || '-'}호`
            : undefined}
        />
      </View>

      {/* 기본 정보 */}
      <View style={detailStyles.section}>
        <SectionTitle title="기본 정보" />
        <InfoRow label="신상"
          value={`${student.name}${student.englishName ? ` | ${student.englishName}` : ''} | ${student.grade} | ${student.gender === 'M' ? '남' : '여'}`}
        />
        <InfoRow label="주민등록번호"
          value={student.ssn
            ? (student.ssn.length >= 7 ? `${student.ssn.slice(0, 6)}-${student.ssn.slice(6)}` : student.ssn)
            : undefined}
        />
        <InfoRow label="도로명 주소" value={student.address} />
        <InfoRow label="세부 주소"   value={student.addressDetail} />
        {(student.departureRoute || student.arrivalRoute) && (
          <InfoRow label="입퇴소공항"
            value={`${student.departureRoute || '-'} 입소 | ${student.arrivalRoute || '-'} 퇴소`}
          />
        )}
        {(student.passportName || student.passportNumber || student.passportExpiry) && (
          <InfoRow label="여권정보"
            value={`${student.passportName || '-'} | ${student.passportNumber || '-'} | ${student.passportExpiry || '-'}`}
          />
        )}
        <InfoRow label="단체티 사이즈" value={student.shirtSize} />
      </View>

      {/* 보호자 정보 */}
      {(student.parentPhone || student.parentName || student.otherPhone || student.otherName || student.email) && (
        <View style={detailStyles.section}>
          <SectionTitle title="보호자 정보" />
          <InfoRow label="대표 보호자"
            value={student.parentPhone || student.parentName
              ? `${student.parentPhone || '-'} | ${student.parentName || '-'}`
              : undefined}
          />
          <InfoRow label="대표 이메일" value={student.email} />
          <InfoRow label="기타 보호자"
            value={student.otherPhone || student.otherName
              ? `${student.otherPhone || '-'} | ${student.otherName || '-'}`
              : undefined}
          />
        </View>
      )}

      {/* 상세 정보 */}
      {(student.registrationSource || student.medication || student.notes || student.etc) && (
        <View style={detailStyles.section}>
          <SectionTitle title="상세 정보" />
          <InfoRow label="등록처"          value={student.registrationSource} />
          <InfoRow label="복용약 & 알레르기" value={student.medication} />
          <InfoRow label="특이사항"        value={student.notes} />
          <InfoRow label="기타"            value={student.etc} />
        </View>
      )}

      {/* 사전 설문조사 */}
      {!!student.surveyMbti && (
        <View style={detailStyles.section}>
          <SectionTitle title="사전 설문조사" />
          {([
            ['MBTI', student.surveyMbti],
            ['캠프 참여 결정', student.surveyCampDecision],
            ['캠프에 기대하는 1순위', student.surveyCampExpectation],
            ['이전 영어캠프/어학캠프 경험 (회)', student.surveyCampExperience],
            ['모바일/PC게임 (시간/일)', student.surveyGameTime],
            ['SNS (시간/일)', student.surveySnsTime],
            ['재학 학교 유형', student.surveySchoolType],
            ['영어학원 기간 (년)', student.surveyAcademyPeriod],
            ['원어민 수업 (시간/주)', student.surveyNativeClassHours],
            ['원어민 수업 발화 비율 (%)', student.surveySpeakingRatio],
            ['영어를 좋아하는 편', student.surveyLikesEnglish],
            ['영어를 잘 하는 편', student.surveyGoodAtEnglish],
            ['처음 보는 친구에게 먼저 말 걸기', student.surveyTalkFirst],
            ['학교 친구가 많은 편', student.surveyManyFriends],
            ['조별 활동 주도적', student.surveyGroupLeader],
            ['단체 활동 규칙 준수', student.surveyFollowRules],
            ['선생님 말 잘 듣기', student.surveyListenTeacher],
            ['집이 화목한 편', student.surveyHappyHome],
            ['부모님 말 잘 듣기', student.surveyListenParents],
            ['평균 수면 시간 (시간)', student.surveySleepHours],
            ['학교에서 공부 잘 하는 편', student.surveyGoodAtStudy],
            ['학교 발표 자주 하는 편', student.surveyPresentation],
            ['노력하면 실력 늘어난다 믿음', student.surveyGrowthMindset],
            ['모르면 바로 질문', student.surveyAsksQuestions],
            ['숙제 미루지 않기', student.surveyNoHomeworkDelay],
            ['계획 지키는 편', student.surveyFollowPlan],
            ['수업 집중 잘 하는 편', student.surveyFocusInClass],
            ['다니는 학원 개수 (개)', student.surveyAcademyCount],
            ['다니는 학원 종류', student.surveyAcademyTypes],
          ] as [string, string | undefined][])
            .filter(([, v]) => !!v)
            .map(([label, value]) => (
              <InfoRow key={label} label={label} value={value} />
            ))}
        </View>
      )}

      {syncDate && (
        <Text style={detailStyles.syncDate}>마지막 동기화: {syncDate}</Text>
      )}
    </View>
  );
}

// ─── F캠프 상세 패널 (이전 스타일 유지) ──────────────────────

function FamilyInfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={familyStyles.row}>
      <Text style={familyStyles.label}>{label}</Text>
      <Text style={familyStyles.value} numberOfLines={4}>{value}</Text>
    </View>
  );
}

function FamilyInfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={familyStyles.section}>
      <Text style={familyStyles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const familyStyles = StyleSheet.create({
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 3,
    gap: 6,
  },
  label: {
    fontSize: 12,
    color: '#9ca3af',
    minWidth: 64,
    flexShrink: 0,
  },
  value: {
    fontSize: 12,
    color: '#374151',
    flex: 1,
    fontWeight: '500',
  },
});

function FamilyCampDetail({ family, studentId }: { family: FamilyUnit; studentId?: string }) {
  const syncDate = family.lastSyncedAt
    ? new Date(family.lastSyncedAt as unknown as string).toLocaleDateString('ko-KR')
    : null;

  const thisStudent = family.students.find((s) => s.id === studentId) ?? family.students[0];

  return (
    <View style={[detailStyles.container, detailStyles.familyContainer]}>
      {/* 가족 기본 */}
      <FamilyInfoSection title="가족 정보">
        <FamilyInfoRow label="가족번호" value={`#${family.familyId}`} />
        <FamilyInfoRow label="가족유형" value={family.familyType} />
        <FamilyInfoRow label="방호수"   value={family.roomNumber || '-'} />
      </FamilyInfoSection>

      {/* 보호자 */}
      {family.parents.map((p, idx) => (
        <FamilyInfoSection key={p.id} title={family.parents.length > 1 ? `보호자 ${idx + 1}` : '보호자'}>
          <FamilyInfoRow label="성함"   value={p.name} />
          <FamilyInfoRow label="연락처" value={p.phone} />
          <FamilyInfoRow label="지역"   value={p.region} />
          <FamilyInfoRow label="이메일" value={p.email} />
          <FamilyInfoRow label="여권이름" value={p.passportName} />
          <FamilyInfoRow label="여권번호" value={p.passportNumber} />
          <FamilyInfoRow label="주민번호"
            value={p.ssn ? (p.ssn.length >= 7 ? `${p.ssn.slice(0, 6)}-${p.ssn.slice(6)}` : p.ssn) : undefined}
          />
        </FamilyInfoSection>
      ))}

      {/* 해당 학생 */}
      {thisStudent && (
        <FamilyInfoSection title="학생 정보">
          <FamilyInfoRow label="이름"     value={thisStudent.name} />
          <FamilyInfoRow label="학년/성별" value={`${thisStudent.grade} · ${thisStudent.gender === 'M' ? '남' : '여'}`} />
          <FamilyInfoRow label="여권이름"  value={thisStudent.passportName} />
          <FamilyInfoRow label="여권번호"  value={thisStudent.passportNumber} />
          <FamilyInfoRow label="건강정보"  value={thisStudent.medication} />
          <FamilyInfoRow label="등록처"    value={thisStudent.registrationSource} />
          {!!thisStudent.ssn && (
            <FamilyInfoRow label="주민번호"
              value={thisStudent.ssn.length >= 7
                ? `${thisStudent.ssn.slice(0, 6)}-${thisStudent.ssn.slice(6)}`
                : thisStudent.ssn}
            />
          )}
        </FamilyInfoSection>
      )}

      {/* 형제자매 */}
      {family.students.length > 1 && (
        <FamilyInfoSection title="형제자매">
          {family.students
            .filter((s) => s.id !== thisStudent?.id)
            .map((s) => (
              <FamilyInfoRow
                key={s.id}
                label={s.grade}
                value={`${s.name}${s.englishName ? ` (${s.englishName})` : ''}`}
              />
            ))}
        </FamilyInfoSection>
      )}

      {syncDate && (
        <Text style={detailStyles.syncDate}>마지막 동기화: {syncDate}</Text>
      )}
    </View>
  );
}

const detailStyles = StyleSheet.create({
  container: {
    backgroundColor: '#f9fafb',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  familyContainer: {
    backgroundColor: '#fdf2f8',
    borderTopColor: '#fbcfe8',
  },
  section: {
    marginBottom: 16,
  },
  syncDate: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 8,
  },
});

// ─── 학생 카드 ───────────────────────────────────────────────

interface StudentCardProps {
  group: StudentGroup;
}

function StudentCard({ group }: StudentCardProps) {
  const [expandedCamp, setExpandedCamp] = useState<string | null>(null);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);

  const profilePhotoUrl = toDriveImageUrl(
    group.history.find((h) => h.student.profilePhoto)?.student.profilePhoto
  );

  const toggleCamp = useCallback((code: string) => {
    setExpandedCamp((prev) => prev === code ? null : code);
  }, []);

  return (
    <View style={cardStyles.container}>
      {/* 학생 요약 */}
      <View style={cardStyles.header}>
        {/* 아바타 */}
        <TouchableOpacity
          style={cardStyles.avatar}
          onPress={() => profilePhotoUrl && setPhotoModalVisible(true)}
          activeOpacity={profilePhotoUrl ? 0.7 : 1}
          accessible
          accessibilityLabel={profilePhotoUrl ? `${group.name} 사진 크게 보기` : group.name}
        >
          {profilePhotoUrl ? (
            <Image
              source={{ uri: profilePhotoUrl }}
              style={cardStyles.avatarImage}
              resizeMode="cover"
            />
          ) : (
            <Ionicons name="person" size={28} color="#7c3aed" />
          )}
        </TouchableOpacity>

        {/* 이름 / 나이 / 연락처 */}
        <View style={cardStyles.info}>
          <View style={cardStyles.nameRow}>
            <Text style={cardStyles.name}>{group.name}</Text>
            <View style={[
              cardStyles.genderBadge,
              group.gender === 'M' ? cardStyles.genderMale : cardStyles.genderFemale,
            ]}>
              <Text style={[
                cardStyles.genderText,
                group.gender === 'M' ? cardStyles.genderTextMale : cardStyles.genderTextFemale,
              ]}>
                {group.gender === 'M' ? '남' : '여'}
              </Text>
            </View>
            {group.age !== null && (
              <View style={cardStyles.ageBadge}>
                <Text style={cardStyles.ageText}>{group.age}세</Text>
              </View>
            )}
          </View>
          <View style={cardStyles.phoneRow}>
            <Ionicons name="call-outline" size={12} color="#9ca3af" />
            <Text style={cardStyles.phone}>{group.parentPhone}</Text>
          </View>
        </View>

        {/* 캠프 수 뱃지 */}
        <View style={cardStyles.campCountBadge}>
          <Text style={cardStyles.campCountText}>{group.history.length}개 캠프</Text>
        </View>
      </View>

      {/* 캠프 코드 탭 — 항상 표시 */}
      <View style={cardStyles.campTabs}>
        {group.history.map(({ campCode, isFamily }) => {
          const colors = campTypeBadgeColor(campCode);
          const isActive = expandedCamp === campCode;
          return (
            <TouchableOpacity
              key={campCode}
              onPress={() => toggleCamp(campCode)}
              style={[
                cardStyles.campTab,
                { backgroundColor: isActive ? colors.bg : '#f9fafb', borderColor: isActive ? colors.text : '#e5e7eb' },
              ]}
              activeOpacity={0.7}
            >
              <Text style={[cardStyles.campTabText, { color: isActive ? colors.text : '#6b7280' }]}>
                {campCode}
              </Text>
              {isFamily && <Text style={cardStyles.familyTag}>가족</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 선택한 캠프 상세 */}
      {expandedCamp && (() => {
        const found = group.history.find((h) => h.campCode === expandedCamp);
        if (!found) return null;
        return found.isFamily && found.familyUnit ? (
          <FamilyCampDetail
            key={expandedCamp}
            family={found.familyUnit}
            studentId={found.student.studentId}
          />
        ) : (
          <CampDetail key={expandedCamp} student={found.student} />
        );
      })()}

      {/* 프로필 사진 모달 */}
      {profilePhotoUrl && (
        <Modal
          visible={photoModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setPhotoModalVisible(false)}
        >
          <Pressable
            style={photoStyles.overlay}
            onPress={() => setPhotoModalVisible(false)}
          >
            <View style={photoStyles.content}>
              <Image
                source={{ uri: profilePhotoUrl }}
                style={photoStyles.image}
                resizeMode="contain"
              />
              <Text style={photoStyles.name}>{group.name}</Text>
              <TouchableOpacity
                style={photoStyles.closeButton}
                onPress={() => setPhotoModalVisible(false)}
              >
                <Ionicons name="close" size={20} color="#374151" />
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  genderBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  genderMale: { backgroundColor: '#dbeafe' },
  genderFemale: { backgroundColor: '#fce7f3' },
  genderText: { fontSize: 11, fontWeight: '600' },
  genderTextMale: { color: '#1d4ed8' },
  genderTextFemale: { color: '#be185d' },
  ageBadge: {
    backgroundColor: '#ede9fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ageText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7c3aed',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phone: {
    fontSize: 12,
    color: '#6b7280',
  },
  campCountBadge: {
    backgroundColor: '#ede9fe',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    flexShrink: 0,
  },
  campCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7c3aed',
  },
  campTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  campTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  campTabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  familyTag: {
    fontSize: 9,
    color: '#ec4899',
    fontWeight: '600',
  },
});

const photoStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    width: 300,
    alignItems: 'center',
    position: 'relative',
  },
  image: {
    width: 300,
    height: 300,
    borderRadius: 16,
  },
  name: {
    marginTop: 12,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    position: 'absolute',
    top: -12,
    right: -12,
    backgroundColor: '#fff',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
});

// ─── 메인 스크린 ─────────────────────────────────────────────

export function StudentSearchScreen({ navigation }: AdminStackScreenProps<'StudentSearch'>) {
  const inputRef = useRef<TextInput>(null);

  const [allRecords, setAllRecords] = useState<StudentHistoryResult[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    loadAllStudentRecords()
      .then((records) => setAllRecords(records))
      .catch(() => setLoadError(true))
      .finally(() => setIsLoadingData(false));
  }, []);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const groups = useMemo<StudentGroup[]>(() => {
    if (debouncedQuery.trim().length < MIN_QUERY_LEN) return [];
    const filtered = filterStudents(allRecords, debouncedQuery);
    return groupStudentResults(filtered);
  }, [allRecords, debouncedQuery]);

  const hasQuery = debouncedQuery.trim().length >= MIN_QUERY_LEN;

  const renderItem = useCallback(({ item }: { item: StudentGroup }) => (
    <StudentCard key={item.key} group={item} />
  ), []);

  return (
    <SafeAreaView style={screenStyles.container}>
      {/* 헤더 */}
      <View style={screenStyles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={screenStyles.backButton}
          accessibilityLabel="뒤로가기"
        >
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View style={screenStyles.headerTitleRow}>
          <Text style={screenStyles.headerTitle}>학생 조회</Text>
          {isLoadingData && (
            <ActivityIndicator size="small" color="#7c3aed" style={{ marginLeft: 8 }} />
          )}
          {!isLoadingData && !loadError && (
            <Text style={screenStyles.recordCount}>{allRecords.length.toLocaleString()}건</Text>
          )}
          {loadError && (
            <Text style={screenStyles.errorText}>로드 실패</Text>
          )}
        </View>
      </View>

      {/* 검색 바 */}
      <View style={screenStyles.searchBar}>
        <Ionicons name="search" size={18} color="#9ca3af" style={screenStyles.searchIcon} />
        <TextInput
          ref={inputRef}
          style={screenStyles.searchInput}
          placeholder="학생 이름 또는 부모님 연락처 입력"
          placeholderTextColor="#9ca3af"
          value={query}
          onChangeText={setQuery}
          editable={!isLoadingData}
          autoFocus
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} style={screenStyles.clearButton}>
            <Ionicons name="close-circle" size={18} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {/* 로딩 */}
      {isLoadingData && (
        <View style={screenStyles.center}>
          <ActivityIndicator size="large" color="#7c3aed" />
          <Text style={screenStyles.loadingText}>전체 캠프 데이터 로딩 중...</Text>
          <Text style={screenStyles.loadingSubText}>로드 후 실시간 검색이 시작됩니다</Text>
        </View>
      )}

      {/* 안내 */}
      {!isLoadingData && !hasQuery && (
        <View style={screenStyles.center}>
          <Ionicons name="search" size={48} color="#e5e7eb" />
          <Text style={screenStyles.emptyTitle}>이름 또는 연락처 2자 이상 입력</Text>
          <Text style={screenStyles.emptySubText}>캠프 참여 이력이 바로 표시됩니다</Text>
        </View>
      )}

      {/* 검색 결과 */}
      {!isLoadingData && hasQuery && (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          contentContainerStyle={screenStyles.listContent}
          ListHeaderComponent={() => (
            <Text style={screenStyles.resultCount}>
              총 <Text style={screenStyles.resultCountBold}>{groups.length}명</Text> 찾음
            </Text>
          )}
          ListEmptyComponent={() => (
            <View style={screenStyles.center}>
              <Text style={screenStyles.emptyTitle}>검색 결과가 없습니다.</Text>
            </View>
          )}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </SafeAreaView>
  );
}

const screenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 10,
  },
  backButton: {
    padding: 4,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  recordCount: {
    fontSize: 12,
    color: '#9ca3af',
    marginLeft: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginLeft: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    paddingVertical: 0,
  },
  clearButton: { padding: 2 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 12,
  },
  loadingSubText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  emptyTitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 12,
  },
  emptySubText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  listContent: {
    padding: 12,
    paddingBottom: 32,
  },
  resultCount: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 10,
  },
  resultCountBold: {
    fontWeight: '700',
    color: '#111827',
  },
});
