import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
} from 'react-native';
import { STSheetStudent } from '@smis-mentor/shared';
import { stSheetService } from '../services';
import { useAuth } from '../context/AuthContext';
import { jobCodesService } from '../services';

interface StudentListProps {
  filterType: 'class' | 'room';
  onStudentPress: (student: STSheetStudent) => void;
}

export const StudentList: React.FC<StudentListProps> = ({
  filterType,
  onStudentPress,
}) => {
  const { userData } = useAuth();
  const [allStudents, setAllStudents] = useState<STSheetStudent[]>([]);
  const [selectedMentor, setSelectedMentor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [campCode, setCampCode] = useState<string>('E27');

  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  // 활성 기수의 code 가져오기
  useEffect(() => {
    const loadCampCode = async () => {
      // activeJobCodeId가 없거나 유효하지 않으면 기본값 사용
      if (!activeJobCodeId || typeof activeJobCodeId !== 'string') {
        console.log('유효한 activeJobCodeId가 없습니다. 기본값 E27 사용');
        setCampCode('E27');
        return;
      }
      
      try {
        const jobCodes = await jobCodesService.getJobCodesByIds([activeJobCodeId]);
        if (jobCodes.length > 0 && jobCodes[0].code) {
          console.log('캠프 코드 로드 성공:', jobCodes[0].code);
          setCampCode(jobCodes[0].code);
        } else {
          console.log('캠프 코드를 찾을 수 없습니다. 기본값 E27 사용');
          setCampCode('E27');
        }
      } catch (error) {
        console.error('캠프 코드 로드 실패:', error);
        setCampCode('E27'); // 에러 시 기본값 사용
      }
    };
    
    loadCampCode();
  }, [activeJobCodeId]);

  // 전체 학생 데이터 로드
  const loadAllStudents = async () => {
    try {
      setLoading(true);
      const data = await stSheetService.getCachedData(campCode);
      setAllStudents(data);
      
      // 첫 로드 시 데이터가 없으면 자동 동기화
      if (data.length === 0) {
        await handleSync();
      }
    } catch (error) {
      console.error('학생 목록 로드 실패:', error);
      Alert.alert('오류', '학생 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (campCode) {
      loadAllStudents();
    }
  }, [campCode]);

  // 데이터 로드 후 첫 번째 항목을 자동 선택
  useEffect(() => {
    if (allStudents.length > 0 && !selectedMentor) {
      const firstKey = Object.keys(groupedByMentor).sort()[0];
      if (firstKey) {
        setSelectedMentor(firstKey);
      }
    }
  }, [allStudents]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAllStudents();
    setRefreshing(false);
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      await stSheetService.syncSTSheet(campCode);
      await loadAllStudents();
      Alert.alert('성공', '데이터 동기화가 완료되었습니다.');
    } catch (error) {
      console.error('동기화 실패:', error);
      Alert.alert('오류', '동기화에 실패했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  // 멘토별/반별로 학생 그룹화
  const groupedByMentor = allStudents.reduce((acc, student) => {
    let mentorKey: string;
    
    if (filterType === 'class') {
      // classNumber의 앞 3자리 추출 (예: "E03.10" -> "E03")
      const classPrefix = student.classNumber?.substring(0, 3) || '';
      mentorKey = classPrefix;
    } else {
      // room 필터의 경우 unitMentor 사용
      mentorKey = student.unitMentor || '';
    }
    
    if (!mentorKey) return acc;
    
    if (!acc[mentorKey]) {
      acc[mentorKey] = [];
    }
    acc[mentorKey].push(student);
    return acc;
  }, {} as Record<string, STSheetStudent[]>);

  // 검색 필터링
  const filteredStudents = searchQuery.trim()
    ? allStudents.filter(student => 
        student.name?.includes(searchQuery.trim())
      )
    : [];

  // 선택된 멘토의 학생들 (정렬 적용)
  const displayStudents = searchQuery.trim()
    ? filteredStudents.sort((a, b) => {
        if (filterType === 'class') {
          return (a.classNumber || '').localeCompare(b.classNumber || '');
        } else {
          return (a.roomNumber || '').localeCompare(b.roomNumber || '');
        }
      })
    : selectedMentor
    ? (groupedByMentor[selectedMentor] || []).sort((a, b) => {
        if (filterType === 'class') {
          // 반 탭: classNumber 오름차순 (예: E03.01, E03.02, ...)
          return (a.classNumber || '').localeCompare(b.classNumber || '');
        } else {
          // 방 탭: roomNumber 오름차순
          return (a.roomNumber || '').localeCompare(b.roomNumber || '');
        }
      })
    : [];

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>학생 목록 로딩 중...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {filterType === 'class' ? '반 명단' : '방 명단'}
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
                style={styles.searchCloseButton}
                onPress={() => {
                  setSearchQuery('');
                  setIsSearchExpanded(false);
                }}
              >
                <Text style={styles.searchCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.searchIconButton}
              onPress={() => setIsSearchExpanded(true)}
            >
              <Text style={styles.searchIcon}>🔍</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
            onPress={handleSync}
            disabled={syncing}
          >
            <Text style={styles.syncButtonText}>
              {syncing ? '동기화 중...' : '동기화'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 멘토/반 선택 - 검색 중일 때는 숨김 */}
      {!searchQuery.trim() && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterContainer}
          contentContainerStyle={styles.filterContent}
        >
          {Object.keys(groupedByMentor).sort().map((mentor) => (
            <TouchableOpacity
              key={mentor}
              style={[
                styles.filterChip,
                selectedMentor === mentor && styles.filterChipActive
              ]}
              onPress={() => setSelectedMentor(mentor)}
            >
              <Text style={[
                styles.filterChipText,
                selectedMentor === mentor && styles.filterChipTextActive
              ]}>
                {mentor}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* 검색 결과 안내 */}
      {searchQuery.trim() && (
        <View style={styles.searchResultHeader}>
          <Text style={styles.searchResultText}>
            "{searchQuery}" 검색 결과: {filteredStudents.length}명
          </Text>
        </View>
      )}

      {/* 학생 목록 */}
      {filterType === 'room' ? (
        // 방 탭: 호수별로 그룹화하여 표시
        <ScrollView
          style={styles.scrollContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#3b82f6']} />
          }
        >
          {displayStudents.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>유닛을 선택해주세요.</Text>
            </View>
          ) : (() => {
            // 호수별로 그룹화
            const roomGroups = Object.entries(
              displayStudents
                .sort((a, b) => (a.roomNumber || '').localeCompare(b.roomNumber || ''))
                .reduce((acc, student) => {
                  const room = student.roomNumber || '미배정';
                  if (!acc[room]) acc[room] = [];
                  acc[room].push(student);
                  return acc;
                }, {} as Record<string, STSheetStudent[]>)
            ).sort(([roomA], [roomB]) => roomA.localeCompare(roomB));

            // 2인실 그룹과 일반 호수 분리
            const result: JSX.Element[] = [];
            let i = 0;

            while (i < roomGroups.length) {
              const [roomNumber, students] = roomGroups[i];
              
              // 현재 호수가 2인실이고, 다음 호수도 2인실인 경우
              if (students.length === 2 && i + 1 < roomGroups.length && roomGroups[i + 1][1].length === 2) {
                // 2x2 그룹으로 묶기
                const doubleRooms: [string, STSheetStudent[]][] = [roomGroups[i]];
                let j = i + 1;
                
                // 연속된 2인실 찾기 (최대 4개 = 2x2)
                while (j < roomGroups.length && roomGroups[j][1].length === 2 && doubleRooms.length < 4) {
                  doubleRooms.push(roomGroups[j]);
                  j++;
                }
                
                // 짝수개로 맞추기 (2개 또는 4개)
                const pairCount = Math.floor(doubleRooms.length / 2) * 2;
                const finalRooms = doubleRooms.slice(0, pairCount);
                
                result.push(
                  <View key={`double-${i}`} style={styles.doubleRoomSection}>
                    <View style={styles.doubleRoomGrid}>
                      {finalRooms.map(([roomNum, roomStudents]) => (
                        <View key={roomNum} style={styles.singleRoomGroup}>
                          <Text style={styles.roomHeaderSmall}>{roomNum}호</Text>
                          <View style={styles.smallRoomCards}>
                            {roomStudents.map((item) => (
                              <TouchableOpacity
                                key={item.studentId}
                                style={styles.studentCardDouble}
                                onPress={() => onStudentPress(item)}
                              >
                                <View style={styles.cardTop}>
                                  <Text 
                                    style={[
                                      styles.studentName,
                                      item.gender === 'M' ? styles.nameBlue : styles.nameYellow
                                    ]} 
                                    numberOfLines={1}
                                  >
                                    {item.name}
                                  </Text>
                                  <Text style={styles.classNumberBlack} numberOfLines={1}>
                                    {item.classNumber || '-'}
                                  </Text>
                                </View>
                                
                                <View style={styles.cardDivider} />
                                
                                <View style={styles.cardInfo}>
                                  <Text style={styles.infoTextSmall} numberOfLines={1}>
                                    {item.englishName || '-'}
                                  </Text>
                                  <View style={styles.infoRow}>
                                    <Text style={styles.infoTextSmall}>{item.gender === 'M' ? '남' : '여'}</Text>
                                    <Text style={styles.infoDot}>•</Text>
                                    <Text style={styles.infoTextSmall}>{item.grade}</Text>
                                  </View>
                                  <Text style={styles.infoTextTiny} numberOfLines={1}>
                                    반: {item.classMentor || '-'}
                                  </Text>
                                  <Text style={styles.infoTextTiny} numberOfLines={1}>
                                    유닛: {item.unitMentor || '-'}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                );
                
                i += pairCount;
              } else {
                // 일반 호수 (2인실이 아니거나, 혼자인 2인실)
                result.push(
                  <View key={roomNumber} style={styles.roomSection}>
                    <Text style={styles.roomHeader}>{roomNumber}호</Text>
                    <View style={styles.roomGrid}>
                      {students.map((item) => (
                        <TouchableOpacity
                          key={item.studentId}
                          style={styles.studentCard}
                          onPress={() => onStudentPress(item)}
                        >
                          <View style={styles.cardTop}>
                            <Text 
                              style={[
                                styles.studentName,
                                item.gender === 'M' ? styles.nameBlue : styles.nameYellow
                              ]} 
                              numberOfLines={1}
                            >
                              {item.name}
                            </Text>
                            <Text style={styles.classNumberBlack} numberOfLines={1}>
                              {item.classNumber || '-'}
                            </Text>
                          </View>
                          
                          <View style={styles.cardDivider} />
                          
                          <View style={styles.cardInfo}>
                            <Text style={styles.infoTextSmall} numberOfLines={1}>
                              {item.englishName || '-'}
                            </Text>
                            <View style={styles.infoRow}>
                              <Text style={styles.infoTextSmall}>{item.gender === 'M' ? '남' : '여'}</Text>
                              <Text style={styles.infoDot}>•</Text>
                              <Text style={styles.infoTextSmall}>{item.grade}</Text>
                            </View>
                            <Text style={styles.infoTextTiny} numberOfLines={1}>
                              반: {item.classMentor || '-'}
                            </Text>
                            <Text style={styles.infoTextTiny} numberOfLines={1}>
                              유닛: {item.unitMentor || '-'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
                i++;
              }
            }

            return <>{result}</>;
          })()}
        </ScrollView>
      ) : (
        // 반 탭: 기존 그리드 방식
        <FlatList
          data={displayStudents}
          keyExtractor={(item) => item.studentId}
          numColumns={4}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.studentCardClass}
              onPress={() => onStudentPress(item)}
            >
              <View style={styles.cardTop}>
                <Text 
                  style={[
                    styles.studentName,
                    item.gender === 'M' ? styles.nameBlue : styles.nameYellow
                  ]} 
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text style={styles.classNumberBlack} numberOfLines={1}>
                  {item.classNumber || '-'}
                </Text>
              </View>
              
              <View style={styles.cardDivider} />
              
              <View style={styles.cardInfo}>
                <Text style={styles.infoTextSmall} numberOfLines={1}>
                  {item.englishName || '-'}
                </Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoTextSmall}>{item.gender === 'M' ? '남' : '여'}</Text>
                  <Text style={styles.infoDot}>•</Text>
                  <Text style={styles.infoTextSmall}>{item.grade}</Text>
                </View>
                <Text style={styles.infoTextTiny} numberOfLines={1}>
                  반: {item.classMentor || '-'}
                </Text>
                <Text style={styles.infoTextTiny} numberOfLines={1}>
                  유닛: {item.unitMentor || '-'}
                </Text>
                <Text style={styles.infoTextTiny} numberOfLines={1}>
                  {item.roomNumber || '-'}호
                </Text>
              </View>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#3b82f6']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {searchQuery.trim() ? '검색 결과가 없습니다.' : '반을 선택해주세요.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc', // 라이트 배경
  },
  centerContainer: {
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
    fontWeight: '600' as '600',
    color: '#1e293b',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchIconButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchIcon: {
    fontSize: 18,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 36,
    minWidth: 200,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    padding: 0,
  },
  searchCloseButton: {
    padding: 4,
    marginLeft: 4,
  },
  searchCloseText: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '600' as '600',
  },
  searchResultHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  searchResultText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500' as '500',
  },
  syncButton: {
    backgroundColor: '#3b82f6', // 블루
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  syncButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as '600',
  },
  filterContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    maxHeight: 60,
  },
  filterContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#2563eb',
    height: 40,
  },
  filterChipText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500' as '500',
  },
  filterChipTextActive: {
    color: '#fff',
    fontWeight: '600' as '600',
  },
  listContainer: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  scrollContainer: {
    flex: 1,
    paddingTop: 12,
  },
  roomSection: {
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  doubleRoomSection: {
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  doubleRoomGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 12,
  },
  singleRoomGroup: {
    width: '48%',
    marginBottom: 8,
  },
  roomHeader: {
    fontSize: 15,
    fontWeight: '700' as '700',
    color: '#1e293b',
    marginBottom: 8,
    marginLeft: 2,
  },
  roomHeaderSmall: {
    fontSize: 14,
    fontWeight: '700' as '700',
    color: '#1e293b',
    marginBottom: 6,
    marginLeft: 2,
  },
  smallRoomCards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 6,
  },
  roomGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 6,
  },
  studentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    width: '23.5%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  studentCardDouble: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    width: '48%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  studentCardClass: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    width: '23.5%',
    marginHorizontal: '0.5%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardTop: {
    marginBottom: 6,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginBottom: 6,
  },
  cardInfo: {
    gap: 3,
  },
  studentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  studentName: {
    fontSize: 14,
    fontWeight: '700' as '700',
    color: '#1e293b',
    marginBottom: 2,
  },
  nameBlue: {
    color: '#3b82f6',
  },
  nameYellow: {
    color: '#f59e0b',
  },
  classNumber: {
    fontSize: 10,
    color: '#3b82f6',
    fontWeight: '600' as '600',
  },
  classNumberBlack: {
    fontSize: 10,
    color: '#1e293b',
    fontWeight: '600' as '600',
  },
  studentNumber: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600' as '600',
  },
  studentInfo: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  studentInfoContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoDot: {
    fontSize: 10,
    color: '#cbd5e1',
  },
  infoText: {
    fontSize: 13,
    color: '#475569',
  },
  infoTextSmall: {
    fontSize: 11,
    color: '#475569',
  },
  infoTextTiny: {
    fontSize: 10,
    color: '#64748b',
  },
  phoneText: {
    fontSize: 14,
    color: '#3b82f6',
    marginTop: 4,
    fontWeight: '500' as '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },
});
