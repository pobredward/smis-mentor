import React, { useState, useEffect } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import DropDownPicker from 'react-native-dropdown-picker';
import {
  createJobBoard,
  getAllJobBoards,
  updateJobBoard,
  deleteJobBoard,
  adminGetAllJobCodes,
} from '@smis-mentor/shared';
import { AdminStackScreenProps } from '../navigation/types';

const jobBoardSchema = z.object({
  refJobCodeId: z.string().min(1, '업무 코드를 선택해주세요.'),
  title: z.string().min(1, '제목을 입력해주세요.'),
  description: z.string().min(1, '설명을 입력해주세요.'),
  interviewBaseLink: z.string().optional(),
  interviewBaseDuration: z.string().optional(),
});

type JobBoardFormValues = z.infer<typeof jobBoardSchema>;

interface JobCodeWithId {
  id: string;
  generation: string;
  code: string;
  name: string;
}

interface JobBoardWithId {
  id: string;
  refJobCodeId: string;
  title: string;
  description: string;
  status: string;
  generation?: string;
  code?: string;
  interviewDates?: any[];
  interviewBaseLink?: string;
  interviewBaseDuration?: number;
  createdAt?: any;
}

export function JobBoardWriteScreen({ navigation }: AdminStackScreenProps<'JobBoardWrite'>) {
  const [isLoading, setIsLoading] = useState(false);
  const [jobBoards, setJobBoards] = useState<JobBoardWithId[]>([]);
  const [jobCodes, setJobCodes] = useState<JobCodeWithId[]>([]);
  const [selectedGeneration, setSelectedGeneration] = useState<string>('');
  const [filteredJobCodes, setFilteredJobCodes] = useState<JobCodeWithId[]>([]);
  const [selectedJobBoard, setSelectedJobBoard] = useState<JobBoardWithId | null>(null);
  const [isCreating, setIsCreating] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [interviewDatesInput, setInterviewDatesInput] = useState<string>('');
  
  // Dropdown states
  const [generationDropdownOpen, setGenerationDropdownOpen] = useState(false);
  const [jobCodeDropdownOpen, setJobCodeDropdownOpen] = useState(false);
  const [generationItems, setGenerationItems] = useState<Array<{ label: string; value: string }>>([]);
  const [jobCodeItems, setJobCodeItems] = useState<Array<{ label: string; value: string }>>([]);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<JobBoardFormValues>({
    resolver: zodResolver(jobBoardSchema),
    defaultValues: {
      refJobCodeId: '',
      title: '',
      description: '',
      interviewBaseLink: '',
      interviewBaseDuration: '30',
    },
  });

  const selectedJobCodeId = watch('refJobCodeId');

  // 데이터 로드
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);

      // 업무 코드 로드
      const codes = await adminGetAllJobCodes(db);
      setJobCodes(codes);

      // 기수 목록 생성
      const generations = Array.from(new Set(codes.map((code) => code.generation))).sort(
        (a, b) => {
          const numA = parseInt(a.replace(/\D/g, ''));
          const numB = parseInt(b.replace(/\D/g, ''));
          return numB - numA;
        }
      );

      // Dropdown 아이템 생성
      const genItems = generations.map(gen => ({ label: gen, value: gen }));
      setGenerationItems(genItems);

      if (generations.length > 0) {
        setSelectedGeneration(generations[0]);
        const filtered = codes.filter((code) => code.generation === generations[0]);
        setFilteredJobCodes(filtered);
        updateJobCodeItems(filtered);
      }

      // 공고 목록 로드
      const boards = await getAllJobBoards(db);
      const sortedBoards = boards.sort(
        (a, b) => b.createdAt?.seconds - a.createdAt?.seconds
      );
      setJobBoards(sortedBoards);
    } catch (error) {
      logger.error('데이터 로드 오류:', error);
      Alert.alert('오류', '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // Job Code 아이템 업데이트 함수
  const updateJobCodeItems = (codes: JobCodeWithId[]) => {
    const items = codes.map(code => ({
      label: `${code.code} - ${code.name}`,
      value: code.id,
    }));
    setJobCodeItems(items);
  };

  // 기수 선택 핸들러
  const handleGenerationChange = (generation: string) => {
    setSelectedGeneration(generation);
    const filtered = jobCodes.filter((code) => code.generation === generation);
    setFilteredJobCodes(filtered);
    updateJobCodeItems(filtered);
    setValue('refJobCodeId', '');
  };

  // 새 공고 생성 버튼
  const handleCreateJobBoard = () => {
    setSelectedJobBoard(null);
    setIsCreating(true);
    setShowForm(true);
    setInterviewDatesInput('');
    reset({
      refJobCodeId: '',
      title: '',
      description: '',
      interviewBaseLink: '',
      interviewBaseDuration: '30',
    });
  };

  // 공고 수정
  const handleEditJobBoard = (jobBoard: JobBoardWithId) => {
    setSelectedJobBoard(jobBoard);
    setIsCreating(false);
    setShowForm(true);

    reset({
      refJobCodeId: jobBoard.refJobCodeId,
      title: jobBoard.title,
      description: jobBoard.description,
      interviewBaseLink: jobBoard.interviewBaseLink || '',
      interviewBaseDuration: jobBoard.interviewBaseDuration?.toString() || '30',
    });

    // 업무 코드 선택
    const jobCode = jobCodes.find((code) => code.id === jobBoard.refJobCodeId);
    if (jobCode) {
      setSelectedGeneration(jobCode.generation);
      const filtered = jobCodes.filter((code) => code.generation === jobCode.generation);
      setFilteredJobCodes(filtered);
      updateJobCodeItems(filtered);
    }

    // 면접 날짜 문자열로 변환
    if (jobBoard.interviewDates && jobBoard.interviewDates.length > 0) {
      const datesStr = jobBoard.interviewDates
        .map(
          (d) =>
            `${formatDatetime(d.start)} ~ ${formatDatetime(d.end)}`
        )
        .join('\n');
      setInterviewDatesInput(datesStr);
    }
  };

  // 날짜 포맷 헬퍼
  const formatDatetime = (timestamp: any): string => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toISOString().slice(0, 16);
  };

  // 폼 제출
  const onSubmit = async (data: JobBoardFormValues) => {
    setIsLoading(true);
    try {
      // 선택한 업무 코드 찾기
      const selectedCode = jobCodes.find((code) => code.id === data.refJobCodeId);
      if (!selectedCode) {
        Alert.alert('오류', '업무 코드를 찾을 수 없습니다.');
        return;
      }

      // 면접 날짜 파싱 (간단한 형식)
      let interviewDates = [];
      if (interviewDatesInput.trim()) {
        const lines = interviewDatesInput.split('\n').filter((l) => l.trim());
        interviewDates = lines.map((line) => {
          const [start, end] = line.split('~').map((s) => s.trim());
          return {
            start: Timestamp.fromDate(new Date(start)),
            end: Timestamp.fromDate(new Date(end || start)),
          };
        });
      }

      const jobBoardData: any = {
        refJobCodeId: data.refJobCodeId,
        title: data.title,
        description: data.description,
        generation: selectedCode.generation,
        code: selectedCode.code,
        interviewDates: interviewDates.length > 0 ? interviewDates : [],
        interviewBaseLink: data.interviewBaseLink || '',
        interviewBaseDuration: parseInt(data.interviewBaseDuration || '30'),
        interviewBaseNotes: '',
        status: 'active',
      };

      if (isCreating) {
        await createJobBoard(db, jobBoardData);
        Alert.alert('성공', '공고가 생성되었습니다.');
      } else if (selectedJobBoard) {
        await updateJobBoard(db, selectedJobBoard.id, jobBoardData);
        Alert.alert('성공', '공고가 수정되었습니다.');
      }

      setShowForm(false);
      await loadData();
    } catch (error) {
      logger.error('공고 저장 오류:', error);
      Alert.alert('오류', `공고 ${isCreating ? '생성' : '수정'} 중 오류가 발생했습니다.`);
    } finally {
      setIsLoading(false);
    }
  };

  // 공고 삭제
  const handleDeleteJobBoard = async (id: string) => {
    Alert.alert('삭제 확인', '정말로 이 공고를 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteJobBoard(db, id);
            Alert.alert('성공', '공고가 삭제되었습니다.');
            await loadData();
          } catch (error) {
            logger.error('공고 삭제 오류:', error);
            Alert.alert('오류', '공고 삭제 중 오류가 발생했습니다.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView style={styles.scrollView}>
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>업무 공고 작성</Text>
            <Text style={styles.headerSubtitle}>채용 공고를 작성하고 관리합니다</Text>
          </View>
        </View>

        {/* 버튼 섹션 */}
        <View style={styles.buttonSection}>
          <TouchableOpacity style={styles.createButton} onPress={handleCreateJobBoard}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.createButtonText}>새 공고 작성</Text>
          </TouchableOpacity>
          {showForm && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowForm(false)}
            >
              <Text style={styles.cancelButtonText}>취소</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 폼 영역 */}
        {showForm && (
          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>
              {isCreating ? '새 공고 작성' : '공고 수정'}
            </Text>

            {/* 기수 선택 */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>기수 선택</Text>
              <DropDownPicker
                open={generationDropdownOpen}
                value={selectedGeneration}
                items={generationItems}
                setOpen={(open) => {
                  if (open) {
                    setJobCodeDropdownOpen(false);
                  }
                  setGenerationDropdownOpen(open);
                }}
                setValue={setSelectedGeneration}
                setItems={setGenerationItems}
                onChangeValue={(value) => {
                  if (value) handleGenerationChange(value);
                }}
                placeholder="기수를 선택하세요"
                style={styles.dropdown}
                dropDownContainerStyle={styles.dropdownContainer}
                textStyle={styles.dropdownText}
                listMode="SCROLLVIEW"
                scrollViewProps={{
                  nestedScrollEnabled: true,
                }}
                zIndex={9000}
                zIndexInverse={1000}
              />
            </View>

            {/* 업무 코드 선택 */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                업무 코드 <Text style={styles.required}>*</Text>
              </Text>
              <Controller
                control={control}
                name="refJobCodeId"
                render={({ field: { onChange, value } }) => (
                  <DropDownPicker
                    open={jobCodeDropdownOpen}
                    value={value}
                    items={jobCodeItems}
                    setOpen={(open) => {
                      if (open) {
                        setGenerationDropdownOpen(false);
                      }
                      setJobCodeDropdownOpen(open);
                    }}
                    setValue={(callback) => {
                      const newValue = typeof callback === 'function' ? callback(value) : callback;
                      onChange(newValue);
                    }}
                    setItems={setJobCodeItems}
                    placeholder="업무 코드를 선택하세요"
                    style={[styles.dropdown, errors.refJobCodeId && styles.inputError]}
                    dropDownContainerStyle={styles.dropdownContainer}
                    textStyle={styles.dropdownText}
                    listMode="SCROLLVIEW"
                    scrollViewProps={{
                      nestedScrollEnabled: true,
                    }}
                    disabled={!selectedGeneration}
                    zIndex={8000}
                    zIndexInverse={2000}
                  />
                )}
              />
              {errors.refJobCodeId && (
                <Text style={styles.errorText}>{errors.refJobCodeId.message}</Text>
              )}
            </View>

            {/* 제목 */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                제목 <Text style={styles.required}>*</Text>
              </Text>
              <Controller
                control={control}
                name="title"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={[styles.input, errors.title && styles.inputError]}
                    value={value}
                    onChangeText={onChange}
                    placeholder="공고 제목"
                  />
                )}
              />
              {errors.title && <Text style={styles.errorText}>{errors.title.message}</Text>}
            </View>

            {/* 설명 */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                설명 <Text style={styles.required}>*</Text>
              </Text>
              <Controller
                control={control}
                name="description"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={[styles.textArea, errors.description && styles.inputError]}
                    value={value}
                    onChangeText={onChange}
                    placeholder="공고 설명"
                    multiline
                    numberOfLines={5}
                  />
                )}
              />
              {errors.description && (
                <Text style={styles.errorText}>{errors.description.message}</Text>
              )}
            </View>

            {/* 면접 날짜 */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>면접 날짜 (한 줄에 하나씩)</Text>
              <TextInput
                style={styles.textArea}
                value={interviewDatesInput}
                onChangeText={setInterviewDatesInput}
                placeholder="예: 2024-01-01T10:00 ~ 2024-01-01T12:00"
                multiline
                numberOfLines={3}
              />
            </View>

            {/* 면접 링크 */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>면접 기본 링크</Text>
              <Controller
                control={control}
                name="interviewBaseLink"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={styles.input}
                    value={value}
                    onChangeText={onChange}
                    placeholder="https://..."
                  />
                )}
              />
            </View>

            {/* 면접 시간 */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>면접 기본 시간 (분)</Text>
              <Controller
                control={control}
                name="interviewBaseDuration"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={styles.input}
                    value={value}
                    onChangeText={onChange}
                    placeholder="30"
                    keyboardType="numeric"
                  />
                )}
              />
            </View>

            {/* 제출 버튼 */}
            <TouchableOpacity
              style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
              onPress={handleSubmit(onSubmit)}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isCreating ? '공고 작성' : '공고 수정'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* 공고 목록 */}
        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>공고 목록</Text>
          {jobBoards.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color="#9ca3af" />
              <Text style={styles.emptyStateText}>등록된 공고가 없습니다.</Text>
            </View>
          ) : (
            jobBoards.map((board) => (
              <View key={board.id} style={styles.boardCard}>
                <View style={styles.boardCardHeader}>
                  <View style={styles.boardInfo}>
                    <Text style={styles.boardTitle}>{board.title}</Text>
                    <Text style={styles.boardSubtitle}>
                      {board.generation} - {board.code}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      board.status === 'active'
                        ? styles.statusBadgeActive
                        : styles.statusBadgeInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        board.status === 'active'
                          ? styles.statusBadgeTextActive
                          : styles.statusBadgeTextInactive,
                      ]}
                    >
                      {board.status === 'active' ? '진행중' : '마감'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.boardDescription} numberOfLines={2}>
                  {board.description}
                </Text>
                <View style={styles.boardActions}>
                  <TouchableOpacity
                    onPress={() => handleEditJobBoard(board)}
                    style={styles.actionButton}
                  >
                    <Ionicons name="pencil" size={20} color="#3b82f6" />
                    <Text style={styles.actionButtonText}>수정</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteJobBoard(board.id)}
                    style={styles.actionButton}
                  >
                    <Ionicons name="trash" size={20} color="#ef4444" />
                    <Text style={[styles.actionButtonText, { color: '#ef4444' }]}>삭제</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
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
  buttonSection: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  createButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#e5e7eb',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  formSection: {
    backgroundColor: '#fff',
    padding: 20,
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  required: {
    color: '#ef4444',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  dropdown: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#fff',
    minHeight: 50,
  },
  dropdownContainer: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  dropdownText: {
    fontSize: 16,
    color: '#111827',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#8b5cf6',
  },
  filterChipText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  submitButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listSection: {
    padding: 12,
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
  },
  boardCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  boardCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  boardInfo: {
    flex: 1,
  },
  boardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  boardSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  boardDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeActive: {
    backgroundColor: '#d1fae5',
  },
  statusBadgeInactive: {
    backgroundColor: '#fee2e2',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusBadgeTextActive: {
    color: '#065f46',
  },
  statusBadgeTextInactive: {
    color: '#991b1b',
  },
  boardActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionButtonText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '500',
  },
});
