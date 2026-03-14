import React, { useState, useEffect } from 'react';
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
import DropDownPicker from 'react-native-dropdown-picker';
import { db } from '../config/firebase';
import { createTempUser, adminGetAllJobCodes } from '@smis-mentor/shared';
import { 
  JOB_EXPERIENCE_GROUP_ROLES,
  MENTOR_GROUP_ROLES,
  FOREIGN_GROUP_ROLES,
  LEGACY_GROUP_REVERSE_MAP 
} from '../../../shared/src/types/camp';

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
  role: 'mentor_temp' | 'foreign_temp' | 'admin';
  jobExperiences: JobExperienceInput[];
};

const jobGroups = Object.entries(LEGACY_GROUP_REVERSE_MAP).map(([label, value]) => ({
  value,
  label
})).concat([{ value: 'manager', label: '매니저' }]);

const getGroupRoleOptions = (role: 'mentor_temp' | 'foreign_temp' | 'admin') => {
  if (role === 'mentor_temp') {
    return MENTOR_GROUP_ROLES.map(r => ({
      value: r,
      label: r
    }));
  } else if (role === 'foreign_temp') {
    return FOREIGN_GROUP_ROLES.map(r => ({
      value: r,
      label: r
    }));
  }
  // admin은 모두 표시
  return JOB_EXPERIENCE_GROUP_ROLES.map(r => ({
    value: r,
    label: r
  }));
};

const roleOptions = [
  { value: 'mentor_temp', label: '멘토 (회원가입 전)' },
  { value: 'foreign_temp', label: '원어민 (회원가입 전)' },
  { value: 'admin', label: '관리자' },
];

export function UserGenerateScreen({ navigation }: any) {
  const [isLoading, setIsLoading] = useState(false);
  const [jobCodes, setJobCodes] = useState<any[]>([]);
  const [generations, setGenerations] = useState<string[]>([]);
  const [isLoadingJobCodes, setIsLoadingJobCodes] = useState(true);

  // Dropdown states
  const [roleOpen, setRoleOpen] = useState(false);
  const [generationOpens, setGenerationOpens] = useState<{ [key: number]: boolean }>({});
  const [jobCodeOpens, setJobCodeOpens] = useState<{ [key: number]: boolean }>({});
  const [groupOpens, setGroupOpens] = useState<{ [key: number]: boolean }>({});
  const [groupRoleOpens, setGroupRoleOpens] = useState<{ [key: number]: boolean }>({});

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
      role: 'mentor_temp',
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
  const currentRole = watch('role');

  // Close all dropdowns helper
  const closeAllDropdowns = () => {
    setRoleOpen(false);
    setGenerationOpens({});
    setJobCodeOpens({});
    setGroupOpens({});
    setGroupRoleOpens({});
  };

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
        jobExperienceClassCodes,
        data.role
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
    // 커스텀 정렬: J, E, S, F, G, K 순서 우선, 나머지는 알파벳 순서
    const priorityOrder = ['J', 'E', 'S', 'F', 'G', 'K'];
    
    return jobCodes
      .filter((code) => code.generation === generation)
      .sort((a, b) => {
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
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>임시 사용자 생성</Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        onScrollBeginDrag={closeAllDropdowns}
        keyboardShouldPersistTaps="handled"
      >
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

          <View style={styles.inputGroup}>
            <Text style={styles.label}>역할 *</Text>
            <Controller
              control={control}
              name="role"
              render={({ field: { onChange, value } }) => (
                <DropDownPicker
                  open={roleOpen}
                  value={value}
                  items={roleOptions}
                  setOpen={(callback) => {
                    const newValue = typeof callback === 'function' ? callback(roleOpen) : callback;
                    if (newValue) {
                      setGenerationOpens({});
                      setJobCodeOpens({});
                      setGroupOpens({});
                      setGroupRoleOpens({});
                    }
                    setRoleOpen(newValue);
                  }}
                  setValue={(callback) => {
                    const newValue = typeof callback === 'function' ? callback(value) : callback;
                    onChange(newValue);
                  }}
                  placeholder="역할을 선택하세요"
                  style={styles.dropdown}
                  dropDownContainerStyle={styles.dropdownContainer}
                  textStyle={styles.dropdownText}
                  labelStyle={styles.dropdownLabel}
                  placeholderStyle={styles.dropdownPlaceholder}
                  listMode="SCROLLVIEW"
                  zIndex={5000}
                  zIndexInverse={1000}
                />
              )}
            />
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
                          <DropDownPicker
                            open={generationOpens[index] || false}
                            value={value || null}
                            items={generations.map((gen) => ({ label: gen, value: gen }))}
                            setOpen={(callback) => {
                              const newValue = typeof callback === 'function' 
                                ? callback(generationOpens[index] || false) 
                                : callback;
                              if (newValue) {
                                setRoleOpen(false);
                                setJobCodeOpens({});
                                setGroupOpens({});
                                setGroupRoleOpens({});
                              }
                              setGenerationOpens({ ...generationOpens, [index]: newValue });
                            }}
                            setValue={(callback) => {
                              const newValue = typeof callback === 'function' ? callback(value) : callback;
                              onChange(newValue);
                              // 기수 변경 시 직무 코드 초기화
                              const newExperiences = [...jobExperiences];
                              newExperiences[index].jobCodeId = '';
                              reset({ ...watch(), jobExperiences: newExperiences });
                            }}
                            placeholder="기수 선택..."
                            style={styles.dropdown}
                            dropDownContainerStyle={styles.dropdownContainer}
                            textStyle={styles.dropdownText}
                            labelStyle={styles.dropdownLabel}
                            placeholderStyle={styles.dropdownPlaceholder}
                            listMode="SCROLLVIEW"
                            maxHeight={200}
                            zIndex={4000 - index}
                            zIndexInverse={1000 + index}
                          />
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
                            <DropDownPicker
                              open={jobCodeOpens[index] || false}
                              value={value || null}
                              items={filteredCodes.map((code: any) => ({
                                label: `${code.code} - ${code.name}`,
                                value: code.id,
                              }))}
                              setOpen={(callback) => {
                                const newValue = typeof callback === 'function' 
                                  ? callback(jobCodeOpens[index] || false) 
                                  : callback;
                                if (newValue) {
                                  setRoleOpen(false);
                                  setGenerationOpens({});
                                  setGroupOpens({});
                                  setGroupRoleOpens({});
                                }
                                setJobCodeOpens({ ...jobCodeOpens, [index]: newValue });
                              }}
                              setValue={(callback) => {
                                const newValue = typeof callback === 'function' ? callback(value) : callback;
                                onChange(newValue);
                              }}
                              disabled={!generation}
                              placeholder="직무 코드를 선택하세요"
                              style={[styles.dropdown, !generation && styles.dropdownDisabled]}
                              dropDownContainerStyle={styles.dropdownContainer}
                              textStyle={styles.dropdownText}
                              labelStyle={styles.dropdownLabel}
                              placeholderStyle={styles.dropdownPlaceholder}
                              listMode="SCROLLVIEW"
                              maxHeight={250}
                              searchable={true}
                              searchPlaceholder="검색..."
                              zIndex={3000 - index}
                              zIndexInverse={2000 + index}
                            />
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
                            <DropDownPicker
                              open={groupOpens[index] || false}
                              value={value}
                              items={jobGroups}
                              setOpen={(callback) => {
                                const newValue = typeof callback === 'function' 
                                  ? callback(groupOpens[index] || false) 
                                  : callback;
                                if (newValue) {
                                  setRoleOpen(false);
                                  setGenerationOpens({});
                                  setJobCodeOpens({});
                                  setGroupRoleOpens({});
                                }
                                setGroupOpens({ ...groupOpens, [index]: newValue });
                              }}
                              setValue={(callback) => {
                                const newValue = typeof callback === 'function' ? callback(value) : callback;
                                onChange(newValue);
                              }}
                              placeholder="그룹 선택"
                              style={styles.dropdown}
                              dropDownContainerStyle={styles.dropdownContainer}
                              textStyle={styles.dropdownText}
                              labelStyle={styles.dropdownLabel}
                              placeholderStyle={styles.dropdownPlaceholder}
                              listMode="SCROLLVIEW"
                              maxHeight={200}
                              zIndex={2000 - index}
                              zIndexInverse={3000 + index}
                            />
                        )}
                      />
                    </View>

                    <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                      <Text style={styles.label}>역할</Text>
                      <Controller
                        control={control}
                        name={`jobExperiences.${index}.groupRole`}
                        render={({ field: { onChange, value } }) => (
                            <DropDownPicker
                              open={groupRoleOpens[index] || false}
                              value={value}
                              items={getGroupRoleOptions(currentRole)}
                              setOpen={(callback) => {
                                const newValue = typeof callback === 'function' 
                                  ? callback(groupRoleOpens[index] || false) 
                                  : callback;
                                if (newValue) {
                                  setRoleOpen(false);
                                  setGenerationOpens({});
                                  setJobCodeOpens({});
                                  setGroupOpens({});
                                }
                                setGroupRoleOpens({ ...groupRoleOpens, [index]: newValue });
                              }}
                              setValue={(callback) => {
                                const newValue = typeof callback === 'function' ? callback(value) : callback;
                                onChange(newValue);
                              }}
                              placeholder="역할 선택"
                              style={styles.dropdown}
                              dropDownContainerStyle={styles.dropdownContainer}
                              textStyle={styles.dropdownText}
                              labelStyle={styles.dropdownLabel}
                              placeholderStyle={styles.dropdownPlaceholder}
                              listMode="SCROLLVIEW"
                              maxHeight={200}
                              zIndex={1000 - index}
                              zIndexInverse={4000 + index}
                            />
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
  row: {
    flexDirection: 'row',
  },
  dropdown: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    minHeight: 48,
  },
  dropdownDisabled: {
    backgroundColor: '#f3f4f6',
    opacity: 0.6,
  },
  dropdownContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
  },
  dropdownText: {
    fontSize: 16,
    color: '#111827',
  },
  dropdownLabel: {
    fontSize: 16,
    color: '#111827',
  },
  dropdownPlaceholder: {
    fontSize: 16,
    color: '#9ca3af',
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
