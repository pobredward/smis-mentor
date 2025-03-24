'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { createTempUser, getAllJobCodes } from '@/lib/firebaseService';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import { JobCode } from '@/types';

const tempUserSchema = z.object({
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다.'),
  phoneNumber: z.string().min(10, '유효한 휴대폰 번호를 입력해주세요.').max(11, '유효한 휴대폰 번호를 입력해주세요.'),
  jobExperiences: z.array(
    z.object({
      value: z.string().min(1, '참가 이력을 선택해주세요.')
    })
  ).min(1, '최소 하나 이상의 업무 참가 이력이 필요합니다.'),
});

type TempUserFormValues = z.infer<typeof tempUserSchema>;

export default function UserGenerate() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [jobCodes, setJobCodes] = useState<JobCode[]>([]);
  const [isLoadingJobCodes, setIsLoadingJobCodes] = useState(true);

  useEffect(() => {
    const fetchJobCodes = async () => {
      try {
        const codes = await getAllJobCodes();
        setJobCodes(codes);
      } catch (error) {
        console.error('직무 코드 조회 오류:', error);
        toast.error('직무 코드 정보를 불러오는데 실패했습니다.');
      } finally {
        setIsLoadingJobCodes(false);
      }
    };

    fetchJobCodes();
  }, []);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<TempUserFormValues>({
    resolver: zodResolver(tempUserSchema),
    defaultValues: {
      jobExperiences: [{ value: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'jobExperiences',
  });

  const onSubmit = async (data: TempUserFormValues) => {
    setIsLoading(true);
    try {
      // 업무 코드 배열로 변환
      const jobExperiences = data.jobExperiences.map(exp => exp.value);
      
      // 임시 사용자 생성
      await createTempUser(data.name, data.phoneNumber, jobExperiences);
      
      toast.success('임시 사용자가 성공적으로 생성되었습니다.');
      setIsSuccess(true);
      
      // 폼 초기화
      reset({
        name: '',
        phoneNumber: '',
        jobExperiences: [{ value: '' }],
      });
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

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">임시 사용자 생성</h1>
          <p className="mt-1 text-sm text-gray-600">이름, 휴대폰 번호, 업무 참가 이력을 입력하여 임시 사용자를 생성합니다.</p>
        </div>

        {isSuccess && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-700">임시 사용자가 성공적으로 생성되었습니다.</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow-md rounded-lg p-6">
          <FormInput
            label="이름"
            type="text"
            placeholder="사용자 이름을 입력하세요"
            error={errors.name?.message}
            {...register('name')}
          />

          <FormInput
            label="휴대폰 번호"
            type="tel"
            placeholder="'-' 없이 입력하세요"
            error={errors.phoneNumber?.message}
            {...register('phoneNumber')}
          />

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-1">
              업무 참가 이력
            </label>
            {isLoadingJobCodes ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : (
              <>
                {fields.map((field, index) => (
                  <div key={field.id} className="flex mb-2">
                    <select
                      className={`w-full px-3 py-2 border ${
                        errors.jobExperiences?.[index]?.value ? 'border-red-500' : 'border-gray-300'
                      } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
                      {...register(`jobExperiences.${index}.value`)}
                      defaultValue=""
                    >
                      <option value="" disabled>직무 코드를 선택하세요</option>
                      {jobCodes.map((jobCode) => (
                        <option key={jobCode.id} value={jobCode.id}>
                          {jobCode.generation} {jobCode.code} - {jobCode.name}
                        </option>
                      ))}
                    </select>
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
                {errors.jobExperiences && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.jobExperiences.message}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => append({ value: '' })}
                  className="mt-2 px-3 py-1 text-sm text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50"
                >
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
    </Layout>
  );
} 