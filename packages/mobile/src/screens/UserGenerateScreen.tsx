import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { db } from '../config/firebase';
import { createTempUser, adminGetAllJobCodes } from '@smis-mentor/shared';

type JobExperienceInput = {
  generation: string;
  jobCodeId: string;
  group: string;
  groupRole: string;
  classCode?: string;
};

type FormData = {
  name: string;
  phoneNumber: string;
  jobExperiences: JobExperienceInput[];
};

const jobGroups = [
  { value: 'junior', label: '주니어' },
  { value: 'middle', label: '미들' },
  { value: 'senior', label: '시니어' },
  { value: 'spring', label: '스프링' },
  { value: 'summer', label: '서머' },
  { value: 'autumn', label: '어텀' },
  { value: 'winter', label: '윈터' },
  { value: 'common', label: '공통' },
  { value: 'manager', label: '매니저' },
];

const groupRoleOptions = [
  { value: '담임', label: '담임' },
  { value: '수업', label: '수업' },
  { value: '서포트', label: '서포트' },
  { value: '리더', label: '리더' },
  { value: '매니저', label: '매니저' },
  { value: '부매니저', label: '부매니저' },
];

export function UserGenerateScreen({ navigation }: any) {
  const [isLoading, setIsLoading] = useState(false);
  const [jobCodes, setJobCodes] = useState<any[]>([]);
  const [generations, setGenerations] = useState<string[]>([]);
  const [isLoadingJobCodes, setIsLoadingJobCodes] = useState(true);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      name: '',
      phoneNumber: '',
      jobExperiences: [
        {
          generation: '',
          jobCodeId: '',
          group: 'junior',
          groupRole: '담임',
          classCode: '',
        },
      ],
    },
  });

  const jobExperiences = watch('jobExperiences');

  useEffect(() => {
    loadJobCodes();
  }, []);

  const loadJobCodes = async () => {
    try {
      console.log('🔍 Loading job codes, db:', db);
      const codes = await adminGetAllJobCodes(db);
      console.log('✅ Job codes loaded:', codes.length);
      setJobCodes(codes);

      // 기수 추출 및 정렬
      const uniqueGenerations = Array.from(new Set(codes.map((code: any) => code.generation)));
      uniqueGenerations.sort((a: any, b: any) => {
        const numA = parseInt(a.replace(/\D/g, ''));
        const numB = parseInt(b.replace(/\D/g, ''));
        return numB - numA;
      });

      setGenerations(uniqueGenerations);
    } catch (error) {
      console.error('직무 코드 조회 오류:', error);
      Alert.alert('오류', '직무 코드 정보를 불러오는데 실패했습니다.');
    } finally {
      setIsLoadingJobCodes(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const jobExperienceIds = data.jobExperiences.map((exp) => exp.jobCodeId);
      const jobExperienceGroups = data.jobExperiences.map((exp) => exp.group);
      const jobExperienceGroupRoles = data.jobExperiences.map((exp) => exp.groupRole);
      const jobExperienceClassCodes = data.jobExperiences.map((exp) => exp.classCode);

      await createTempUser(
        db,
        data.name,
        data.phoneNumber,
        jobExperienceIds,
        jobExperienceGroups,
        jobExperienceGroupRoles,
        jobExperienceClassCodes
      );

      Alert.alert('성공', '임시 사용자가 생성되었습니다.', [
        {
          text: '확인',
          onPress: () => {
            reset();
            navigation.goBack();
          },
        },
      ]);
    } catch (error: any) {
      console.error('임시 사용자 생성 오류:', error);
      Alert.alert('오류', error.message || '사용자 생성 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const getFilteredJobCodes = (generation: string) => {
    return jobCodes.filter((code) => code.generation === generation);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>임시 사용자 생성</Text>
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>이름 *</Text>
            <Controller
              control={control}
              name="name"
              rules={{ required: '이름을 입력해주세요' }}
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={[styles.input, errors.name && styles.inputError]}
                  placeholder="사용자 이름"
                  value={value}
                  onChangeText={onChange}
                />
              )}
            />
            {errors.name && <Text style={styles.errorText}>{errors.name.message}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>휴대폰 번호 *</Text>
            <Controller
              control={control}
              name="phoneNumber"
              rules={{
                required: '휴대폰 번호를 입력해주세요',
                pattern: {
                  value: /^[0-9]{10,11}$/,
                  message: '올바른 휴대폰 번호를 입력해주세요',
                },
              }}
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={[styles.input, errors.phoneNumber && styles.inputError]}
                  placeholder="01012345678"
                  keyboardType="phone-pad"
                  value={value}
                  onChangeText={onChange}
                  maxLength={11}
                />
              )}
            />
            {errors.phoneNumber && (
              <Text style={styles.errorText}>{errors.phoneNumber.message}</Text>
            )}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>업무 참가 이력</Text>
          </View>

          {isLoadingJobCodes ? (
            <ActivityIndicator size="large" color="#4f46e5" style={{ marginTop: 20 }} />
          ) : (
            <>
              {jobExperiences.map((_, index) => (
                <View key={index} style={styles.jobExperienceCard}>
                  <View style={styles.jobExperienceHeader}>
                    <Text style={styles.jobExperienceTitle}>이력 {index + 1}</Text>
                    {index > 0 && (
                      <TouchableOpacity
                        onPress={() => {
                          const newExperiences = [...jobExperiences];
                          newExperiences.splice(index, 1);
                          reset({ ...watch(), jobExperiences: newExperiences });
                        }}
                      >
                        <Ionicons name="close-circle" size={24} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* 기수 선택 */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>기수 *</Text>
                    <Controller
                      control={control}
                      name={`jobExperiences.${index}.generation`}
                      rules={{ required: '기수를 선택해주세요' }}
                      render={({ field: { onChange, value } }) => (
                        <View style={styles.pickerContainer}>
                          <TouchableOpacity
                            style={styles.picker}
                            onPress={() => {
                              Alert.alert(
                                '기수 선택',
                                '',
                                generations.map((gen) => ({
                                  text: gen,
                                  onPress: () => {
                                    onChange(gen);
                                    // 기수 변경 시 직무 코드 초기화
                                    const newExperiences = [...jobExperiences];
                                    newExperiences[index].jobCodeId = '';
                                    reset({ ...watch(), jobExperiences: newExperiences });
                                  },
                                }))
                              );
                            }}
                          >
                            <Text style={value ? styles.pickerText : styles.pickerPlaceholder}>
                              {value || '기수 선택...'}
                            </Text>
                            <Ionicons name="chevron-down" size={20} color="#6b7280" />
                          </TouchableOpacity>
                        </View>
                      )}
                    />
                  </View>

                  {/* 직무 코드 선택 */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>직무 코드 *</Text>
                    <Controller
                      control={control}
                      name={`jobExperiences.${index}.jobCodeId`}
                      rules={{ required: '직무 코드를 선택해주세요' }}
                      render={({ field: { onChange, value } }) => {
                        const generation = jobExperiences[index].generation;
                        const filteredCodes = generation ? getFilteredJobCodes(generation) : [];

                        return (
                          <TouchableOpacity
                            style={styles.picker}
                            disabled={!generation}
                            onPress={() => {
                              if (filteredCodes.length === 0) {
                                Alert.alert('알림', '선택한 기수에 해당하는 직무가 없습니다.');
                                return;
                              }
                              Alert.alert(
                                '직무 코드 선택',
                                '',
                                filteredCodes.map((code: any) => ({
                                  text: `${code.code} - ${code.name}`,
                                  onPress: () => onChange(code.id),
                                }))
                              );
                            }}
                          >
                            <Text
                              style={value ? styles.pickerText : styles.pickerPlaceholder}
                              numberOfLines={1}
                            >
                              {value
                                ? jobCodes.find((c) => c.id === value)?.name || '직무 코드'
                                : '직무 코드를 선택하세요'}
                            </Text>
                            <Ionicons name="chevron-down" size={20} color="#6b7280" />
                          </TouchableOpacity>
                        );
                      }}
                    />
                  </View>

                  {/* 그룹 선택 */}
                  <View style={styles.row}>
                    <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                      <Text style={styles.label}>그룹</Text>
                      <Controller
                        control={control}
                        name={`jobExperiences.${index}.group`}
                        render={({ field: { onChange, value } }) => (
                          <TouchableOpacity
                            style={styles.picker}
                            onPress={() => {
                              Alert.alert(
                                '그룹 선택',
                                '',
                                jobGroups.map((group) => ({
                                  text: group.label,
                                  onPress: () => onChange(group.value),
                                }))
                              );
                            }}
                          >
                            <Text style={styles.pickerText}>
                              {jobGroups.find((g) => g.value === value)?.label || '주니어'}
                            </Text>
                            <Ionicons name="chevron-down" size={20} color="#6b7280" />
                          </TouchableOpacity>
                        )}
                      />
                    </View>

                    <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                      <Text style={styles.label}>역할</Text>
                      <Controller
                        control={control}
                        name={`jobExperiences.${index}.groupRole`}
                        render={({ field: { onChange, value } }) => (
                          <TouchableOpacity
                            style={styles.picker}
                            onPress={() => {
                              Alert.alert(
                                '역할 선택',
                                '',
                                groupRoleOptions.map((role) => ({
                                  text: role.label,
                                  onPress: () => onChange(role.value),
                                }))
                              );
                            }}
                          >
                            <Text style={styles.pickerText}>{value || '담임'}</Text>
                            <Ionicons name="chevron-down" size={20} color="#6b7280" />
                          </TouchableOpacity>
                        )}
                      />
                    </View>
                  </View>

                  {/* 반 코드 */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>반 코드 (선택)</Text>
                    <Controller
                      control={control}
                      name={`jobExperiences.${index}.classCode`}
                      render={({ field: { onChange, value } }) => (
                        <TextInput
                          style={styles.input}
                          placeholder="반 코드 입력"
                          value={value}
                          onChangeText={onChange}
                          maxLength={32}
                        />
                      )}
                    />
                  </View>
                </View>
              ))}

              <TouchableOpacity
                style={styles.addButton}
                onPress={() => {
                  const newExperiences = [
                    ...jobExperiences,
                    {
                      generation: '',
                      jobCodeId: '',
                      group: 'junior',
                      groupRole: '담임',
                      classCode: '',
                    },
                  ];
                  reset({ ...watch(), jobExperiences: newExperiences });
                }}
              >
                <Ionicons name="add-circle" size={20} color="#4f46e5" />
                <Text style={styles.addButtonText}>업무 이력 추가</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>임시 사용자 생성</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
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
  form: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
  },
  sectionHeader: {
    marginTop: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  jobExperienceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  jobExperienceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  jobExperienceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
  },
  picker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  pickerText: {
    fontSize: 16,
    color: '#111827',
    flex: 1,
  },
  pickerPlaceholder: {
    fontSize: 16,
    color: '#9ca3af',
    flex: 1,
  },
  row: {
    flexDirection: 'row',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4f46e5',
    marginLeft: 8,
  },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  submitButton: {
    backgroundColor: '#4f46e5',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
});
