'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';
import { createJobCode, getAllJobCodes, deleteJobCode, updateJobCode } from '@/lib/firebaseService';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import { JobCode } from '@/types';

// Zod 스키마 정의
const jobCodeSchema = z.object({
  generation: z.string().min(1, '기수를 입력해주세요.'),
  code: z.string().min(1, '코드를 입력해주세요.'),
  name: z.string().min(1, '업무 이름을 입력해주세요.'),
  eduDates: z.array(
    z.object({
      date: z.string().min(1, '교육 날짜를 입력해주세요.')
    })
  ).min(1, '최소 하나 이상의 교육 날짜가 필요합니다.'),
  startDate: z.string().min(1, '시작 날짜를 입력해주세요.'),
  endDate: z.string().min(1, '종료 날짜를 입력해주세요.'),
  location: z.string().min(1, '위치를 입력해주세요.'),
});

type JobCodeFormValues = z.infer<typeof jobCodeSchema>;

export default function JobGenerate() {
  const [isLoading, setIsLoading] = useState(false);
  const [jobCodes, setJobCodes] = useState<(JobCode & { id: string })[]>([]);
  const [isDeleting, setIsDeleting] = useState<{[key: string]: boolean}>({});
  const [isEditing, setIsEditing] = useState(false);
  const [editingJobCode, setEditingJobCode] = useState<(JobCode & { id: string }) | null>(null);
  const [generations, setGenerations] = useState<string[]>([]);
  const [selectedGeneration, setSelectedGeneration] = useState<string | null>(null);

  // 폼 설정
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<JobCodeFormValues>({
    resolver: zodResolver(jobCodeSchema),
    defaultValues: {
      eduDates: [{ date: '' }],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'eduDates',
  });

  // 업무 코드 목록 로드
  const loadJobCodes = async () => {
    try {
      const codes = await getAllJobCodes();
      setJobCodes(codes);
      
      // 기수 목록 추출 (중복 제거)
      const uniqueGenerations = Array.from(
        new Set(codes.map(code => code.generation))
      ).sort((a, b) => {
        // 숫자만 추출하여 내림차순 정렬 (예: "25기" -> 25)
        const numA = parseInt(a.replace(/[^0-9]/g, ''));
        const numB = parseInt(b.replace(/[^0-9]/g, ''));
        return numB - numA; // 내림차순 (최신순)
      });
      
      setGenerations(uniqueGenerations);
      
      // 기본 선택: 가장 최근 기수 (있다면)
      if (uniqueGenerations.length > 0 && !selectedGeneration) {
        setSelectedGeneration(uniqueGenerations[0]);
      }
    } catch (error) {
      console.error('업무 코드 로드 오류:', error);
      toast.error('업무 코드 로드 중 오류가 발생했습니다.');
    }
  };

  useEffect(() => {
    loadJobCodes();
  }, []);

  // 업무 코드 삭제 핸들러
  const handleDeleteJobCode = async (id: string) => {
    if (window.confirm('정말로 이 업무를 삭제하시겠습니까?')) {
      setIsDeleting(prev => ({ ...prev, [id]: true }));
      try {
        await deleteJobCode(id);
        toast.success('업무가 삭제되었습니다.');
        loadJobCodes();
      } catch (error) {
        console.error('업무 삭제 오류:', error);
        toast.error('업무 삭제 중 오류가 발생했습니다.');
      } finally {
        setIsDeleting(prev => ({ ...prev, [id]: false }));
      }
    }
  };

  // 업무 코드 수정 폼 초기화
  const handleEditJobCode = (jobCode: JobCode & { id: string }) => {
    setIsEditing(true);
    setEditingJobCode(jobCode);
    
    // 교육 날짜 배열 설정
    const eduDatesArray = jobCode.eduDates.map(date => ({
      date: formatDate(date)
    }));
    
    // 폼 값 설정
    setValue('generation', jobCode.generation);
    setValue('code', jobCode.code);
    setValue('name', jobCode.name);
    setValue('startDate', formatDate(jobCode.startDate));
    setValue('endDate', formatDate(jobCode.endDate));
    setValue('location', jobCode.location);
    
    // 교육 날짜 배열 설정 (useFieldArray)
    replace(eduDatesArray);
  };

  // 수정 취소 핸들러
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingJobCode(null);
    
    // 폼 초기화
    reset({
      generation: '',
      code: '',
      name: '',
      eduDates: [{ date: '' }],
      startDate: '',
      endDate: '',
      location: '',
    });
  };

  // 폼 제출 핸들러
  const onSubmit = async (data: JobCodeFormValues) => {
    setIsLoading(true);
    try {
      // 날짜 변환
      const eduDates = data.eduDates.map(d => Timestamp.fromDate(new Date(d.date)));
      const startDate = Timestamp.fromDate(new Date(data.startDate));
      const endDate = Timestamp.fromDate(new Date(data.endDate));

      if (isEditing && editingJobCode) {
        // 업무 코드 수정
        await updateJobCode(editingJobCode.id, {
          generation: data.generation,
          code: data.code,
          name: data.name,
          eduDates,
          startDate,
          endDate,
          location: data.location,
        });
        
        toast.success('업무가 성공적으로 수정되었습니다.');
        setIsEditing(false);
        setEditingJobCode(null);
      } else {
        // 신규 업무 코드 생성
        await createJobCode({
          generation: data.generation,
          code: data.code,
          name: data.name,
          eduDates,
          startDate,
          endDate,
          location: data.location,
        });

        toast.success('업무가 성공적으로 생성되었습니다.');
      }
      
      // 폼 초기화
      reset({
        generation: '',
        code: '',
        name: '',
        eduDates: [{ date: '' }],
        startDate: '',
        endDate: '',
        location: '',
      });

      // 목록 새로고침
      loadJobCodes();
    } catch (error) {
      console.error('업무 저장 오류:', error);
      toast.error('업무 저장 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 날짜 포맷팅 함수
  const formatDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return date.toISOString().split('T')[0];
  };

  // 기수로 필터링된 업무 목록
  const filteredJobCodes = selectedGeneration
    ? jobCodes.filter(code => code.generation === selectedGeneration)
    : jobCodes;

  return (
    <Layout requireAuth requireAdmin>
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">업무 관리</h1>
          <p className="mt-1 text-sm text-gray-600">업무 정보를 생성, 수정, 삭제할 수 있습니다.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 업무 생성/수정 폼 */}
          <div>
            <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow-md rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">
                {isEditing ? '업무 수정' : '업무 생성'}
              </h2>
              
              <div className="grid grid-cols-2 gap-4">
                <FormInput
                  label="기수"
                  type="text"
                  placeholder="예: 25기"
                  error={errors.generation?.message}
                  {...register('generation')}
                />

                <FormInput
                  label="코드"
                  type="text"
                  placeholder="예: J25"
                  error={errors.code?.message}
                  {...register('code')}
                />
              </div>

              <FormInput
                label="업무 이름"
                type="text"
                placeholder="업무 이름을 입력하세요"
                error={errors.name?.message}
                {...register('name')}
              />

              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-1">
                  교육 날짜
                </label>
                {fields.map((field, index) => (
                  <div key={field.id} className="flex mb-2">
                    <input
                      type="date"
                      className={`w-full px-3 py-2 border ${
                        errors.eduDates?.[index]?.date ? 'border-red-500' : 'border-gray-300'
                      } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
                      {...register(`eduDates.${index}.date`)}
                    />
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="ml-2 p-2 bg-red-100 text-red-600 rounded-md hover:bg-red-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                {errors.eduDates && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.eduDates.message}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => append({ date: '' })}
                  className="mt-2 px-3 py-1 text-sm text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50"
                >
                  교육 날짜 추가
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-medium mb-1">시작 날짜</label>
                  <input
                    type="date"
                    className={`w-full px-3 py-2 border ${
                      errors.startDate ? 'border-red-500' : 'border-gray-300'
                    } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
                    {...register('startDate')}
                  />
                  {errors.startDate && <p className="mt-1 text-sm text-red-600">{errors.startDate.message}</p>}
                </div>

                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-medium mb-1">종료 날짜</label>
                  <input
                    type="date"
                    className={`w-full px-3 py-2 border ${
                      errors.endDate ? 'border-red-500' : 'border-gray-300'
                    } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
                    {...register('endDate')}
                  />
                  {errors.endDate && <p className="mt-1 text-sm text-red-600">{errors.endDate.message}</p>}
                </div>
              </div>

              <FormInput
                label="위치"
                type="text"
                placeholder="위치를 입력하세요"
                error={errors.location?.message}
                {...register('location')}
              />

              <div className="mt-6 flex justify-end space-x-3">
                {isEditing && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleCancelEdit}
                  >
                    취소
                  </Button>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isLoading}
                >
                  {isEditing ? '수정하기' : '생성하기'}
                </Button>
              </div>
            </form>
          </div>

          {/* 업무 목록 */}
          <div>
            <div className="bg-white shadow-md rounded-lg p-6">
              <div className="flex flex-wrap justify-between items-center mb-6">
                <h2 className="text-lg font-semibold">업무 목록</h2>
                
                {/* 기수 필터 */}
                <div className="flex flex-wrap gap-2 mt-2 sm:mt-0">
                  <button
                    className={`px-3 py-1 text-sm rounded-full border ${
                      selectedGeneration === null
                        ? 'bg-blue-100 border-blue-300 text-blue-800'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedGeneration(null)}
                  >
                    전체
                  </button>
                  
                  {generations.map((gen) => (
                    <button
                      key={gen}
                      className={`px-3 py-1 text-sm rounded-full border ${
                        selectedGeneration === gen
                          ? 'bg-blue-100 border-blue-300 text-blue-800'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedGeneration(gen)}
                    >
                      {gen}
                    </button>
                  ))}
                </div>
              </div>

              {filteredJobCodes.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {selectedGeneration ? 
                    `'${selectedGeneration}' 기수에 해당하는 업무가 없습니다.` : 
                    '등록된 업무가 없습니다.'}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredJobCodes.map((jobCode) => (
                    <div key={jobCode.id} className="py-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium text-gray-900">{jobCode.name}</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            {/* {jobCode.generation} */}
                            {jobCode.code}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatDate(jobCode.startDate)} ~ {formatDate(jobCode.endDate)}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            위치: {jobCode.location}
                          </p>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEditJobCode(jobCode)}
                            className="px-2 py-1 text-xs text-blue-600 border border-blue-300 rounded hover:bg-blue-50"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDeleteJobCode(jobCode.id)}
                            className="px-2 py-1 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50"
                            disabled={isDeleting[jobCode.id]}
                          >
                            {isDeleting[jobCode.id] ? '삭제 중...' : '삭제'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
} 