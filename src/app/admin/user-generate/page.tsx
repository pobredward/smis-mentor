'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { createTempUser, getAllJobCodes } from '@/lib/firebaseService';
import FormInput from '@/components/common/FormInput';
import PhoneInput from '@/components/common/PhoneInput';
import Button from '@/components/common/Button';
import Loading from '@/components/common/Loading';
import { JobCodeWithId, JobGroup } from '@/types';

const tempUserSchema = z.object({
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다.'),
  phoneNumber: z.string().min(10, '유효한 휴대폰 번호를 입력해주세요.').max(11, '유효한 휴대폰 번호를 입력해주세요.'),
  jobExperiences: z.array(
    z.object({
      value: z.string().min(1, '참가 이력을 선택해주세요.'),
      group: z.string().min(1, '그룹을 선택해주세요.')
    })
  ).min(1, '최소 하나 이상의 업무 참가 이력이 필요합니다.'),
});

type TempUserFormValues = z.infer<typeof tempUserSchema>;

export default function UserGenerate() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [jobCodes, setJobCodes] = useState<JobCodeWithId[]>([]);
  const [isLoadingJobCodes, setIsLoadingJobCodes] = useState(true);
  const [allGenerations, setAllGenerations] = useState<string[]>([]);
  const [selectedGenerations, setSelectedGenerations] = useState<string[]>([]);
  const [filteredJobCodes, setFilteredJobCodes] = useState<Record<number, JobCodeWithId[]>>({});

  // 그룹 옵션 정의
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

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<TempUserFormValues>({
    resolver: zodResolver(tempUserSchema),
    defaultValues: {
      jobExperiences: [{ value: '', group: 'junior' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'jobExperiences',
  });

  useEffect(() => {
    const fetchJobCodes = async () => {
      try {
        const codes = await getAllJobCodes();
        setJobCodes(codes);
        
        // 모든 generation 추출 (중복 제거 및 정렬)
        const generations = Array.from(new Set(codes.map(code => code.generation)));
        // 정렬 (예: G25, G24, ... 내림차순)
        generations.sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, ''));
          const numB = parseInt(b.replace(/\D/g, ''));
          return numB - numA; // 내림차순 정렬
        });
        
        setAllGenerations(generations);
      } catch (error) {
        console.error('직무 코드 조회 오류:', error);
        toast.error('직무 코드 정보를 불러오는데 실패했습니다.');
      } finally {
        setIsLoadingJobCodes(false);
      }
    };

    fetchJobCodes();
  }, []);

  // 선택된 generation이 변경될 때 코드 필터링
  useEffect(() => {
    const newFilteredCodes: Record<number, JobCodeWithId[]> = {};
    
    fields.forEach((_, index) => {
      const selectedGen = selectedGenerations[index];
      
      if (!selectedGen) {
        newFilteredCodes[index] = [];
        return;
      }
      
      const filtered = jobCodes.filter(code => code.generation === selectedGen);
      
      // 코드 기준으로 정렬
      filtered.sort((a, b) => {
        if (a.code < b.code) return -1;
        if (a.code > b.code) return 1;
        return 0;
      });
      
      newFilteredCodes[index] = filtered;
    });
    
    setFilteredJobCodes(newFilteredCodes);
  }, [selectedGenerations, jobCodes, fields]);

  const handleGenerationChange = (index: number, generation: string) => {
    const newSelectedGenerations = [...selectedGenerations];
    newSelectedGenerations[index] = generation;
    setSelectedGenerations(newSelectedGenerations);
    
    // 기수가 변경되면 직무 코드 선택값 초기화
    setValue(`jobExperiences.${index}.value`, '');
  };

  const onSubmit = async (data: TempUserFormValues) => {
    setIsLoading(true);
    try {
      // 업무 코드 배열과 그룹 배열로 변환
      const jobExperienceIds = data.jobExperiences.map(exp => exp.value);
      const jobExperienceGroups = data.jobExperiences.map(exp => exp.group);
      
      // 임시 사용자 생성
      await createTempUser(data.name, data.phoneNumber, jobExperienceIds, jobExperienceGroups as JobGroup[]);
      
      toast.success('임시 사용자가 성공적으로 생성되었습니다.');
      setIsSuccess(true);
      
      // 폼 초기화
      reset({
        name: '',
        phoneNumber: '',
        jobExperiences: [{ value: '', group: 'junior' }],
      });
      setSelectedGenerations([]);
    } catch (error) {
      console.error('임시 사용자 생성 오류:', error);
      
      // 중복 사용자 에러 체크
      if (error instanceof Error && error.message === '이미 등록된 유저입니다') {
        toast.error('이미 등록된 유저입니다.');
      } else {
        toast.error('사용자 생성 중 오류가 발생했습니다.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddJobExperience = () => {
    append({ value: '', group: 'junior' });
    setSelectedGenerations([...selectedGenerations, '']);
  };

  const handleRemoveJobExperience = (index: number) => {
    remove(index);
    const newSelectedGenerations = [...selectedGenerations];
    newSelectedGenerations.splice(index, 1);
    setSelectedGenerations(newSelectedGenerations);
  };

  // 로딩 상태일 때 표시할 UI
  if (isLoadingJobCodes) {
    return <Loading message="직무 코드 정보를 불러오는 중..." />;
  }

  return (
    <div className="max-w-xl mx-auto lg:px-4 px-0">
      <div className="mb-8">
        <div className="flex items-center">
          <button
            onClick={() => window.location.href = '/admin'}
            className="mr-3 text-blue-600 hover:text-blue-800 focus:outline-none flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">임시 사용자 생성</h1>
        </div>
        <p className="mt-1 text-sm text-gray-600">이름, 휴대폰 번호, 업무 참가 이력을 입력하여 임시 사용자를 생성합니다.</p>
      </div>

      {isSuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-700">임시 사용자가 성공적으로 생성되었습니다.</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow-md rounded-lg p-4 md:p-6">
        <FormInput
          label="이름"
          type="text"
          placeholder="사용자 이름을 입력하세요"
          error={errors.name?.message}
          {...register('name')}
        />

        <Controller
          name="phoneNumber"
          control={control}
          render={({ field, fieldState }) => (
            <PhoneInput
              label="휴대폰 번호"
              value={field.value}
              onChange={field.onChange}
              error={fieldState.error?.message}
              returnRawValue={true}
              placeholder="휴대폰 번호를 입력하세요"
            />
          )}
        />

        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-medium mb-1">
            업무 참가 이력
          </label>
          {isLoadingJobCodes ? (
            <Loading size="small" />
          ) : (
            <>
              {fields.map((field, index) => (
                <div key={field.id} className="flex flex-col mb-3 p-3 border border-gray-200 rounded-md bg-gray-50">
                  {/* 기수 선택 */}
                  <div className="mb-2">
                    <label className="block text-xs text-gray-500 mb-1">기수 선택</label>
                    <select
                      className={`w-full px-3 py-2 border ${
                        !selectedGenerations[index] ? 'border-gray-300' : 'border-gray-300'
                      } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
                      value={selectedGenerations[index] || ''}
                      onChange={(e) => handleGenerationChange(index, e.target.value)}
                    >
                      <option value="" disabled>기수 선택...</option>
                      {allGenerations.map((gen) => (
                        <option key={gen} value={gen}>
                          {gen}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* 직무 코드 및 그룹 선택 */}
                  <div className="flex flex-col md:flex-row gap-2">
                    <div className="flex-1 min-w-0 md:w-3/5">
                      <label className="block text-xs text-gray-500 mb-1">직무 코드 선택</label>
                      <select
                        className={`w-full px-3 py-2 border ${
                          errors.jobExperiences?.[index]?.value ? 'border-red-500' : 'border-gray-300'
                        } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-ellipsis`}
                        {...register(`jobExperiences.${index}.value`)}
                        disabled={!selectedGenerations[index] || !filteredJobCodes[index]?.length}
                        style={{ textOverflow: 'ellipsis' }}
                      >
                        <option value="" disabled>직무 코드를 선택하세요</option>
                        {filteredJobCodes[index]?.map((jobCode) => (
                          <option 
                            key={jobCode.id} 
                            value={jobCode.id}
                            title={`${jobCode.code} - ${jobCode.name}`}
                          >
                            {jobCode.code} - {jobCode.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    {/* 그룹 선택 */}
                    <div className="md:w-2/5">
                      <label className="block text-xs text-gray-500 mb-1">그룹 선택</label>
                      <div className="flex items-center gap-2">
                        <select
                          className={`w-full px-3 py-2 border ${
                            errors.jobExperiences?.[index]?.group ? 'border-red-500' : 'border-gray-300'
                          } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
                          {...register(`jobExperiences.${index}.group`)}
                        >
                          {jobGroups.map(group => (
                            <option key={group.value} value={group.value}>
                              {group.label}
                            </option>
                          ))}
                        </select>
                        
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveJobExperience(index)}
                            className="ml-auto p-2 bg-red-100 text-red-600 rounded-md hover:bg-red-200 flex-shrink-0"
                            aria-label="직무 경험 삭제"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {filteredJobCodes[index]?.length === 0 && selectedGenerations[index] && (
                    <p className="mt-1 text-xs text-gray-500">선택한 기수에 해당하는 직무가 없습니다.</p>
                  )}
                  
                  {errors.jobExperiences?.[index]?.value && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.jobExperiences?.[index]?.value?.message}
                    </p>
                  )}
                  
                  {errors.jobExperiences?.[index]?.group && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.jobExperiences?.[index]?.group?.message}
                    </p>
                  )}
                </div>
              ))}
              
              {errors.jobExperiences && !Array.isArray(errors.jobExperiences) && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.jobExperiences.message}
                </p>
              )}
              
              <button
                type="button"
                onClick={handleAddJobExperience}
                className="mt-2 px-3 py-2 w-full text-sm text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50 flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                업무 이력 추가
              </button>
            </>
          )}
        </div>

        <div className="mt-6">
          <Button
            type="submit"
            variant="primary"
            fullWidth
            isLoading={isLoading}
          >
            임시 사용자 생성
          </Button>
        </div>
      </form>
    </div>
  );
} 