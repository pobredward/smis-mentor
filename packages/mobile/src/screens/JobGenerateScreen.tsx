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
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  adminGetAllJobCodes,
  adminCreateJobCode,
  adminDeleteJobCode,
  adminUpdateJobCode,
} from '@smis-mentor/shared';
import { AdminStackScreenProps } from '../navigation/types';

// Zod 스키마 정의
const jobCodeSchema = z.object({
  generation: z.string().min(1, '기수를 입력해주세요.'),
  code: z.string().min(1, '코드를 입력해주세요.'),
  name: z.string().min(1, '업무 이름을 입력해주세요.'),
  startDate: z.string().min(1, '시작 날짜를 입력해주세요.'),
  endDate: z.string().min(1, '종료 날짜를 입력해주세요.'),
  location: z.string().min(1, '위치를 입력해주세요.'),
});

type JobCodeFormValues = z.infer<typeof jobCodeSchema>;

interface JobCodeWithId {
  id: string;
  generation: string;
  code: string;
  name: string;
  eduDates: any[];
  startDate: any;
  endDate: any;
  location: string;
  korea: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export function JobGenerateScreen({
  navigation,
}: AdminStackScreenProps<'JobGenerate'>) {
  const [isLoading, setIsLoading] = useState(false);
  const [jobCodes, setJobCodes] = useState<JobCodeWithId[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingJobCode, setEditingJobCode] = useState<JobCodeWithId | null>(null);
  const [generations, setGenerations] = useState<string[]>([]);
  const [selectedGeneration, setSelectedGeneration] = useState<string | null>(null);
  const [koreaSwitch, setKoreaSwitch] = useState(true);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<JobCodeFormValues>({
    resolver: zodResolver(jobCodeSchema),
    defaultValues: {
      generation: '',
      code: '',
      name: '',
      startDate: '',
      endDate: '',
      location: '',
    },
  });

  // 날짜 포맷 헬퍼 함수
  const formatDate = (timestamp: any): string => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toISOString().split('T')[0];
  };

  // 업무 코드 목록 로드
  const loadJobCodes = async () => {
    try {
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

      if (uniqueGenerations.length > 0 && !selectedGeneration) {
        setSelectedGeneration(uniqueGenerations[0]);
      }
    } catch (error) {
      logger.error('업무 코드 로드 오류:', error);
      Alert.alert('오류', '업무 코드 로드 중 오류가 발생했습니다.');
    }
  };

  useEffect(() => {
    loadJobCodes();
  }, []);

  // 업무 코드 생성/수정 핸들러
  const onSubmit = async (data: JobCodeFormValues) => {
    setIsLoading(true);
    try {
      const jobCodeData = {
        generation: data.generation,
        code: data.code,
        name: data.name,
        eduDates: [],
        startDate: Timestamp.fromDate(new Date(data.startDate)),
        endDate: Timestamp.fromDate(new Date(data.endDate)),
        location: data.location,
        korea: koreaSwitch,
        ...(isEditing
          ? { updatedAt: Timestamp.now() }
          : { createdAt: Timestamp.now(), updatedAt: Timestamp.now() }),
      };

      if (isEditing && editingJobCode) {
        await adminUpdateJobCode(db, editingJobCode.id, jobCodeData);
        Alert.alert('성공', '업무가 수정되었습니다.');
      } else {
        await adminCreateJobCode(db, jobCodeData);
        Alert.alert('성공', '업무가 생성되었습니다.');
      }

      // 폼 초기화
      reset();
      setKoreaSwitch(true);
      setIsEditing(false);
      setEditingJobCode(null);
      
      await loadJobCodes();
    } catch (error) {
      logger.error('업무 생성/수정 오류:', error);
      Alert.alert('오류', `업무 ${isEditing ? '수정' : '생성'} 중 오류가 발생했습니다.`);
    } finally {
      setIsLoading(false);
    }
  };

  // 업무 코드 삭제 핸들러
  const handleDeleteJobCode = async (id: string) => {
    Alert.alert('삭제 확인', '정말로 이 업무를 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await adminDeleteJobCode(db, id);
            Alert.alert('성공', '업무가 삭제되었습니다.');
            await loadJobCodes();
          } catch (error) {
            logger.error('업무 삭제 오류:', error);
            Alert.alert('오류', '업무 삭제 중 오류가 발생했습니다.');
          }
        },
      },
    ]);
  };

  // 업무 코드 수정 폼 초기화
  const handleEditJobCode = (jobCode: JobCodeWithId) => {
    setIsEditing(true);
    setEditingJobCode(jobCode);

    setValue('generation', jobCode.generation);
    setValue('code', jobCode.code);
    setValue('name', jobCode.name);
    setValue('startDate', formatDate(jobCode.startDate));
    setValue('endDate', formatDate(jobCode.endDate));
    setValue('location', jobCode.location);
    setKoreaSwitch(jobCode.korea);
  };

  // 수정 취소
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingJobCode(null);
    reset();
    setKoreaSwitch(true);
  };

  // 선택된 기수의 업무 코드 필터링 및 정렬
  const filteredJobCodes = (() => {
    const filtered = selectedGeneration
      ? jobCodes.filter((code) => code.generation === selectedGeneration)
      : jobCodes;
    
    // 커스텀 정렬: J, E, S, F, G, K 순서 우선, 나머지는 알파벳 순서
    const priorityOrder = ['J', 'E', 'S', 'F', 'G', 'K'];
    
    return filtered.sort((a, b) => {
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
  })();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView style={styles.scrollView}>
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>업무 생성 & 관리</Text>
            <Text style={styles.headerSubtitle}>새로운 업무를 생성하고 관리합니다</Text>
          </View>
        </View>

        {/* 폼 영역 */}
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>
            {isEditing ? '업무 수정' : '새 업무 생성'}
          </Text>

          {/* Generation */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              기수 <Text style={styles.required}>*</Text>
            </Text>
            <Controller
              control={control}
              name="generation"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={[styles.input, errors.generation && styles.inputError]}
                  value={value}
                  onChangeText={onChange}
                  placeholder="예: 27기"
                />
              )}
            />
            {errors.generation && (
              <Text style={styles.errorText}>{errors.generation.message}</Text>
            )}
          </View>

          {/* Code */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              코드 <Text style={styles.required}>*</Text>
            </Text>
            <Controller
              control={control}
              name="code"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={[styles.input, errors.code && styles.inputError]}
                  value={value}
                  onChangeText={onChange}
                  placeholder="예: E27"
                />
              )}
            />
            {errors.code && <Text style={styles.errorText}>{errors.code.message}</Text>}
          </View>

          {/* Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              업무 이름 <Text style={styles.required}>*</Text>
            </Text>
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={[styles.input, errors.name && styles.inputError]}
                  value={value}
                  onChangeText={onChange}
                  placeholder="예: 교육캠프"
                />
              )}
            />
            {errors.name && <Text style={styles.errorText}>{errors.name.message}</Text>}
          </View>

          {/* Start Date */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              시작 날짜 <Text style={styles.required}>*</Text>
            </Text>
            <Controller
              control={control}
              name="startDate"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={[styles.input, errors.startDate && styles.inputError]}
                  value={value}
                  onChangeText={onChange}
                  placeholder="YYYY-MM-DD"
                />
              )}
            />
            {errors.startDate && (
              <Text style={styles.errorText}>{errors.startDate.message}</Text>
            )}
          </View>

          {/* End Date */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              종료 날짜 <Text style={styles.required}>*</Text>
            </Text>
            <Controller
              control={control}
              name="endDate"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={[styles.input, errors.endDate && styles.inputError]}
                  value={value}
                  onChangeText={onChange}
                  placeholder="YYYY-MM-DD"
                />
              )}
            />
            {errors.endDate && (
              <Text style={styles.errorText}>{errors.endDate.message}</Text>
            )}
          </View>

          {/* Location */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              위치 <Text style={styles.required}>*</Text>
            </Text>
            <Controller
              control={control}
              name="location"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={[styles.input, errors.location && styles.inputError]}
                  value={value}
                  onChangeText={onChange}
                  placeholder="예: 서울"
                />
              )}
            />
            {errors.location && (
              <Text style={styles.errorText}>{errors.location.message}</Text>
            )}
          </View>

          {/* Korea Switch */}
          <View style={styles.switchGroup}>
            <Text style={styles.label}>한국 (Korea)</Text>
            <Switch value={koreaSwitch} onValueChange={setKoreaSwitch} />
          </View>

          {/* Buttons */}
          <View style={styles.buttonGroup}>
            {isEditing && (
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancelEdit}>
                <Text style={styles.cancelButtonText}>취소</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
              onPress={handleSubmit(onSubmit)}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isEditing ? '업무 수정' : '업무 생성'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* 기수 필터 */}
        <View style={styles.filterSection}>
          <Text style={styles.sectionTitle}>기수별 업무 목록</Text>
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

        {/* 업무 목록 */}
        <View style={styles.listSection}>
          {filteredJobCodes.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="briefcase-outline" size={48} color="#9ca3af" />
              <Text style={styles.emptyStateText}>등록된 업무가 없습니다.</Text>
            </View>
          ) : (
            filteredJobCodes.map((jobCode) => (
              <View key={jobCode.id} style={styles.jobCard}>
                <View style={styles.jobCardHeader}>
                  <View>
                    <Text style={styles.jobCardTitle}>
                      [{jobCode.code}] {jobCode.name}
                    </Text>
                    <Text style={styles.jobCardSubtitle}>{jobCode.generation}</Text>
                  </View>
                  <View style={styles.jobCardActions}>
                    <TouchableOpacity
                      onPress={() => handleEditJobCode(jobCode)}
                      style={styles.actionButton}
                    >
                      <Ionicons name="pencil" size={20} color="#3b82f6" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteJobCode(jobCode.id)}
                      style={styles.actionButton}
                    >
                      <Ionicons name="trash" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.jobCardBody}>
                  <Text style={styles.jobCardInfo}>
                    📍 {jobCode.location} {jobCode.korea ? '🇰🇷' : '🌏'}
                  </Text>
                  <Text style={styles.jobCardInfo}>
                    📅 {formatDate(jobCode.startDate)} ~ {formatDate(jobCode.endDate)}
                  </Text>
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
  formSection: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 12,
    borderRadius: 8,
    marginHorizontal: 12,
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
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  switchGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#e5e7eb',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  filterSection: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    backgroundColor: '#fff',
    marginTop: 12,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#3b82f6',
  },
  filterChipText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
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
  jobCard: {
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
  jobCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  jobCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  jobCardSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  jobCardActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 4,
  },
  jobCardBody: {
    gap: 4,
  },
  jobCardInfo: {
    fontSize: 14,
    color: '#6b7280',
  },
});
