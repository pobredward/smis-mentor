import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FamilyUnit } from '@smis-mentor/shared';
import { stSheetService } from '../services';
import { useAuth } from '../context/AuthContext';
import { CampCode } from '@smis-mentor/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logger } from '@smis-mentor/shared';

interface FamilyListProps {
  campCode: CampCode;
  isForeign?: boolean;
}

export const FamilyList: React.FC<FamilyListProps> = ({ campCode, isForeign }) => {
  const { userData } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = userData?.role === 'admin';
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());

  const { data: families = [], isLoading, refetch } = useQuery<FamilyUnit[]>({
    queryKey: ['families', campCode],
    queryFn: () => stSheetService.getCachedFamilies(campCode),
    enabled: !!campCode,
    staleTime: 5 * 60 * 1000,
  });

  const handleSync = async () => {
    if (!isAdmin) {
      Alert.alert('권한 없음', '동기화는 관리자만 수행할 수 있습니다.');
      return;
    }
    try {
      setSyncing(true);
      await stSheetService.syncSTSheet(campCode);
      await queryClient.invalidateQueries({ queryKey: ['families', campCode] });
      await refetch();
      Alert.alert('성공', '가족 데이터 동기화가 완료되었습니다.');
    } catch (error) {
      logger.error('동기화 실패:', error);
      const message = error instanceof Error ? error.message : '동기화에 실패했습니다.';
      Alert.alert('동기화 실패', message);
    } finally {
      setSyncing(false);
    }
  };

  const toggleFamily = useCallback((familyId: string) => {
    setExpandedFamilies(prev => {
      const next = new Set(prev);
      if (next.has(familyId)) {
        next.delete(familyId);
      } else {
        next.add(familyId);
      }
      return next;
    });
  }, []);

  // 검색 필터 (이름 + 휴대폰번호)
  const filteredFamilies = searchQuery.trim()
    ? families.filter(f =>
        f.parents.some(p => p.name.includes(searchQuery) || p.phone?.includes(searchQuery)) ||
        f.students.some(s =>
          s.name.includes(searchQuery) ||
          s.englishName?.includes(searchQuery) ||
          s.parentPhone?.includes(searchQuery)
        )
      )
    : families;

  const FAMILY_TYPE_ORDER = ['2인 가족', '3인 가족', '4인 가족', '5인 가족'];

  const familyTypeColor: Record<string, string> = {
    '2인 가족': '#3b82f6',
    '3인 가족': '#10b981',
    '4인 가족': '#f59e0b',
    '5인 가족': '#ef4444',
  };

  // 유형별 그룹 (정해진 순서)
  const groupedFamilies = (() => {
    const map = new Map<string, FamilyUnit[]>();
    FAMILY_TYPE_ORDER.forEach(t => map.set(t, []));
    filteredFamilies.forEach(f => {
      const key = FAMILY_TYPE_ORDER.includes(f.familyType) ? f.familyType : '기타';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    });
    return Array.from(map.entries()).filter(([, list]) => list.length > 0);
  })();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>가족 데이터 로딩 중...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {isForeign ? 'Family Roster' : '가족'}
        </Text>
        <View style={styles.headerActions}>
          {isSearchExpanded ? (
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="이름 검색..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity
                onPress={() => { setSearchQuery(''); setIsSearchExpanded(false); }}
                style={styles.searchClose}
              >
                <Text style={styles.searchCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setIsSearchExpanded(true)}
            >
              <Text style={{ fontSize: 18 }}>🔍</Text>
            </TouchableOpacity>
          )}
          {isAdmin && (
            <TouchableOpacity
              style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
              onPress={handleSync}
              disabled={syncing}
            >
              <Text style={styles.syncButtonText}>
                {syncing ? '동기화 중...' : '동기화'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 요약 */}
      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          총 {filteredFamilies.length}가족 / 학생{' '}
          {filteredFamilies.reduce((s, f) => s + f.students.length, 0)}명
        </Text>
      </View>

      {/* 가족 목록 */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} colors={['#3b82f6']} />
        }
      >
        {filteredFamilies.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>
              {searchQuery.trim() ? '검색 결과가 없습니다.' : '가족 데이터가 없습니다.'}
            </Text>
          </View>
        ) : (
          groupedFamilies.map(([type, list]) => {
            const color = familyTypeColor[type] ?? '#64748b';
            return (
              <View key={type}>
                {/* 섹션 제목 */}
                <View style={[styles.sectionHeader, { backgroundColor: color }]}>
                  <Text style={styles.sectionTitle}>{type}</Text>
                  <Text style={styles.sectionCount}>
                    {list.length}가족 · 학생 {list.reduce((s, f) => s + f.students.length, 0)}명
                  </Text>
                </View>
                {list.map(family => (
                  <FamilyCard
                    key={family.familyId}
                    family={family}
                    isExpanded={expandedFamilies.has(family.familyId)}
                    onToggle={() => toggleFamily(family.familyId)}
                    typeColor={color}
                  />
                ))}
              </View>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
};

interface FamilyCardProps {
  family: FamilyUnit;
  isExpanded: boolean;
  onToggle: () => void;
  typeColor: string;
}

const FamilyCard = React.memo(({ family, isExpanded, onToggle, typeColor }: FamilyCardProps) => {
  // 부모 이름 전원
  const parentNames = family.parents.map(p => p.name).join(' · ');
  // 학생 이름 전원 (학년 포함)
  const studentNames = family.students
    .map(s => `${s.name}${s.grade ? `(${s.grade})` : ''}`)
    .join(' · ');
  // 방호수
  const roomDisplay = family.roomNumber || '-';

  return (
    <View style={cardStyles.container}>
      {/* 카드 헤더 — 탭하면 확장/축소 */}
      <TouchableOpacity
        style={cardStyles.header}
        onPress={onToggle}
        accessibilityLabel={`${family.familyId}번 가족 상세보기`}
        accessibilityRole="button"
      >
        {/* 고유번호 배지 */}
        <View style={[cardStyles.idBadge, { backgroundColor: typeColor }]}>
          <Text style={cardStyles.idBadgeText}>#{family.familyId}</Text>
        </View>

        {/* 이름 요약 */}
        <View style={cardStyles.headerRight}>
          <Text style={cardStyles.parentSummary} numberOfLines={1}>
            {parentNames || '–'}
          </Text>
          {studentNames ? (
            <Text style={cardStyles.studentSummary} numberOfLines={1}>
              {studentNames}
            </Text>
          ) : null}
        </View>

        {/* 방호수 */}
        <View style={cardStyles.roomBadge}>
          <Text style={cardStyles.roomBadgeText}>{roomDisplay}호</Text>
        </View>

        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#94a3b8"
        />
      </TouchableOpacity>

      {/* 확장 상세 */}
      {isExpanded && (
        <View style={cardStyles.detail}>
          {/* 부모 섹션 */}
          {family.parents.map((parent, idx) => (
            <View key={parent.id} style={cardStyles.personSection}>
              <View style={cardStyles.personHeader}>
                <View style={[cardStyles.personBadge, cardStyles.parentBadge]}>
                  <Text style={cardStyles.personBadgeText}>부모{family.parents.length > 1 ? idx + 1 : ''}</Text>
                </View>
                <Text style={cardStyles.personName}>{parent.name}</Text>
              </View>
              <View style={cardStyles.infoGrid}>
                {parent.phone ? <InfoRow label="연락처" value={parent.phone} /> : null}
                {parent.region ? <InfoRow label="지역" value={parent.region} /> : null}
                {parent.email ? <InfoRow label="이메일" value={parent.email} /> : null}
                {parent.nativeEnglish && parent.nativeEnglish !== '신청 X' && parent.nativeEnglish !== '-' ? (
                  <InfoRow label="원어민 수업" value={parent.nativeEnglish} highlight />
                ) : null}
                {parent.ssn ? <InfoRow label="주민번호" value={parent.ssn} sensitive /> : null}
                {parent.passportNumber ? <InfoRow label="여권번호" value={parent.passportNumber} /> : null}
                {parent.passportName ? <InfoRow label="여권이름" value={parent.passportName} /> : null}
                {parent.passportExpiry && parent.passportExpiry !== '0000.00.00' ? (
                  <InfoRow label="여권만료" value={parent.passportExpiry} />
                ) : null}
                {parent.address ? <InfoRow label="주소" value={parent.address} wide /> : null}
                {parent.notes ? <InfoRow label="기타" value={parent.notes} wide /> : null}
              </View>
            </View>
          ))}

          {/* 학생 섹션 */}
          {family.students.map((student, idx) => (
            <View key={student.id} style={cardStyles.personSection}>
              <View style={cardStyles.personHeader}>
                <View style={[
                  cardStyles.personBadge,
                  student.gender === 'M' ? cardStyles.studentBadgeMale : cardStyles.studentBadgeFemale
                ]}>
                  <Text style={cardStyles.personBadgeText}>
                    학생{family.students.length > 1 ? idx + 1 : ''}
                  </Text>
                </View>
                <Text style={[
                  cardStyles.personName,
                  student.gender === 'M' ? cardStyles.nameBlue : cardStyles.nameAmber
                ]}>
                  {student.name}
                </Text>
                {student.englishName ? (
                  <Text style={cardStyles.englishName}> ({student.englishName})</Text>
                ) : null}
              </View>
              <View style={cardStyles.infoGrid}>
                <InfoRow label="학년/성별" value={`${student.grade} · ${student.gender === 'M' ? '남' : '여'}`} />
                {student.id ? <InfoRow label="학생ID" value={student.id} /> : null}
                {student.parentPhone ? <InfoRow label="부모연락처" value={student.parentPhone} /> : null}
                {student.ssn ? <InfoRow label="주민번호" value={student.ssn} sensitive /> : null}
                {student.passportNumber ? <InfoRow label="여권번호" value={student.passportNumber} /> : null}
                {student.passportName ? <InfoRow label="여권이름" value={student.passportName} /> : null}
                {student.passportExpiry && student.passportExpiry !== '0000.00.00' ? (
                  <InfoRow label="여권만료" value={student.passportExpiry} />
                ) : null}
                {student.medication ? <InfoRow label="건강정보" value={student.medication} wide /> : null}
                {student.registrationSource ? <InfoRow label="등록처" value={student.registrationSource} /> : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
});

interface InfoRowProps {
  label: string;
  value: string;
  wide?: boolean;
  sensitive?: boolean;
  highlight?: boolean;
}

const InfoRow = ({ label, value, wide, sensitive, highlight }: InfoRowProps) => (
  <View style={[infoStyles.row, wide && infoStyles.rowWide]}>
    <Text style={infoStyles.label}>{label}</Text>
    <Text
      style={[
        infoStyles.value,
        sensitive && infoStyles.valueSensitive,
        highlight && infoStyles.valueHighlight,
      ]}
      numberOfLines={wide ? 3 : 1}
    >
      {value}
    </Text>
  </View>
);

const infoStyles = StyleSheet.create({
  row: {
    width: '50%',
    paddingVertical: 3,
    paddingRight: 8,
  },
  rowWide: {
    width: '100%',
  },
  label: {
    fontSize: 10,
    color: '#94a3b8',
    marginBottom: 1,
  },
  value: {
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '500',
  },
  valueSensitive: {
    color: '#94a3b8',
    fontSize: 11,
  },
  valueHighlight: {
    color: '#7c3aed',
    fontWeight: '700',
  },
});

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  headerRight: {
    flex: 1,
    gap: 2,
  },
  idBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    minWidth: 36,
    alignItems: 'center',
    flexShrink: 0,
  },
  idBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  roomBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexShrink: 0,
  },
  roomBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  parentSummary: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '600',
  },
  studentSummary: {
    fontSize: 12,
    color: '#64748b',
  },
  detail: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 12,
  },
  personSection: {
    marginTop: 12,
  },
  personHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  personBadge: {
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  parentBadge: {
    backgroundColor: '#dbeafe',
  },
  studentBadgeMale: {
    backgroundColor: '#eff6ff',
  },
  studentBadgeFemale: {
    backgroundColor: '#fef9c3',
  },
  personBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  personName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  englishName: {
    fontSize: 12,
    color: '#64748b',
  },
  nameBlue: {
    color: '#2563eb',
  },
  nameAmber: {
    color: '#d97706',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
    paddingTop: 6,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 36,
    minWidth: 180,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    padding: 0,
  },
  searchClose: {
    padding: 4,
    marginLeft: 4,
  },
  searchCloseText: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '600',
  },
  syncButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  syncButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  summary: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  summaryText: {
    fontSize: 13,
    color: '#64748b',
  },
  scrollView: {
    flex: 1,
    paddingTop: 8,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  sectionCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
});
