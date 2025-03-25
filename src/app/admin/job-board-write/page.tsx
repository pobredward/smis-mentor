'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import { 
  createJobBoard, 
  getAllJobCodes, 
  getAllJobBoards, 
  updateJobBoard 
} from '@/lib/firebaseService';
import { JobCode, JobBoard } from '@/types';
import RichTextEditor from '@/components/common/RichTextEditor';

const jobBoardSchema = z.object({
  refJobCodeId: z.string().min(1, '업무 코드를 선택해주세요.'),
  title: z.string().min(1, '제목을 입력해주세요.'),
  description: z.string().min(1, '설명을 입력해주세요.'),
  interviewDates: z.array(
    z.object({
      date: z.string().min(1, '면접 날짜를 입력해주세요.'),
      time: z.string().min(1, '면접 시간을 입력해주세요.')
    })
  ).min(1, '최소 하나 이상의 면접 날짜가 필요합니다.'),
  customInterviewDateAllowed: z.boolean(),
  interviewBaseLink: z.string().optional(),
  interviewBaseDuration: z.string().optional(),
  interviewBaseNote: z.string().optional(),
  status: z.enum(['active', 'closed']).optional(),
});

type JobBoardFormValues = z.infer<typeof jobBoardSchema>;
type JobBoardWithId = JobBoard & { id: string };

export default function JobBoardWrite() {
  const [isLoading, setIsLoading] = useState(false);
  const [jobBoards, setJobBoards] = useState<JobBoardWithId[]>([]);
  const [jobCodes, setJobCodes] = useState<JobCode[]>([]);
  const [selectedGeneration, setSelectedGeneration] = useState<string>('');
  const [filteredJobCodes, setFilteredJobCodes] = useState<JobCode[]>([]);
  const [selectedJobCode, setSelectedJobCode] = useState<JobCode | null>(null);
  const [selectedJobBoard, setSelectedJobBoard] = useState<JobBoardWithId | null>(null);
  const [isCreating, setIsCreating] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const { currentUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { 
    register, 
    handleSubmit, 
    control, 
    watch, 
    reset,
    setValue,
    formState: { errors } 
  } = useForm<JobBoardFormValues>({
    resolver: zodResolver(jobBoardSchema),
    defaultValues: {
      interviewDates: [{ date: '', time: '' }],
      customInterviewDateAllowed: false,
      status: 'active'
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'interviewDates',
  });

  const selectedJobCodeId = watch('refJobCodeId');

  // 기수 선택 핸들러
  const handleGenerationChange = (generation: string) => {
    setSelectedGeneration(generation);
    const filtered = jobCodes.filter(code => code.generation === generation);
    setFilteredJobCodes(filtered);
    setValue('refJobCodeId', ''); // 업무 선택 초기화
    setSelectedJobCode(null);
  };

  // 업무 코드 및 공고 목록 불러오기
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        // 업무 코드 로드
        const codes = await getAllJobCodes();
        setJobCodes(codes);
        
        // 기수 목록 생성 (내림차순 정렬)
        const generations = Array.from(new Set(codes.map(code => code.generation)))
          .sort((a, b) => {
            // G25, G24와 같은 형식일 경우 숫자만 추출하여 비교
            const numA = parseInt(a.replace(/\D/g, ''));
            const numB = parseInt(b.replace(/\D/g, ''));
            return numB - numA;
          });

        if (generations.length > 0) {
          setSelectedGeneration(generations[0]);
          setFilteredJobCodes(codes.filter(code => code.generation === generations[0]));
        }
        
        // 공고 목록 로드
        const boards = await getAllJobBoards();
        
        // 최신순 정렬
        const sortedBoards = boards.sort((a, b) => 
          b.createdAt.seconds - a.createdAt.seconds
        );
        
        setJobBoards(sortedBoards);
        
        // URL 파라미터 처리
        const editId = searchParams.get('edit');
        if (editId) {
          const boardToEdit = sortedBoards.find(board => board.id === editId);
          if (boardToEdit) {
            handleEditJobBoard(boardToEdit);
          }
        }
      } catch (error) {
        console.error('데이터 로드 오류:', error);
        toast.error('데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [searchParams]);

  // 선택한 업무 코드가 변경될 때
  useEffect(() => {
    if (selectedJobCodeId) {
      const jobCode = jobCodes.find(code => code.id === selectedJobCodeId);
      setSelectedJobCode(jobCode || null);
    }
  }, [selectedJobCodeId, jobCodes]);

  // 새 공고 생성 버튼 핸들러
  const handleCreateJobBoard = () => {
    setSelectedJobBoard(null);
    setIsCreating(true);
    setShowForm(true);
    reset({
      refJobCodeId: '',
      title: '',
      description: '',
      interviewDates: [{ date: '', time: '' }],
      customInterviewDateAllowed: false,
      interviewBaseLink: '',
      interviewBaseDuration: '',
      interviewBaseNote: '',
      status: 'active'
    });
  };

  // 공고 수정 핸들러
  const handleEditJobBoard = (jobBoard: JobBoardWithId) => {
    setSelectedJobBoard(jobBoard);
    setIsCreating(false);
    setShowForm(true);
    
    // 면접 날짜를 날짜와 시간으로 분리
    const interviewDatesFormatted = jobBoard.interviewDates.map(timestamp => {
      const date = timestamp.toDate();
      return {
        date: format(date, 'yyyy-MM-dd'),
        time: format(date, 'HH:mm')
      };
    });
    
    // 폼 값 설정
    reset({
      refJobCodeId: jobBoard.refJobCodeId,
      title: jobBoard.title,
      description: jobBoard.description,
      interviewDates: interviewDatesFormatted,
      customInterviewDateAllowed: jobBoard.customInterviewDateAllowed,
      interviewBaseLink: jobBoard.interviewBaseLink || '',
      interviewBaseDuration: jobBoard.interviewBaseDuration !== undefined ? String(jobBoard.interviewBaseDuration) : '',
      interviewBaseNote: jobBoard.interviewBaseNote || '',
      status: jobBoard.status as 'active' | 'closed'
    });
    
    // 업무 코드 선택
    const jobCode = jobCodes.find(code => code.id === jobBoard.refJobCodeId);
    setSelectedJobCode(jobCode || null);
  };

  const onSubmit = async (data: JobBoardFormValues) => {
    if (!currentUser) {
      toast.error('로그인이 필요합니다.');
      return;
    }

    if (!selectedJobCode) {
      toast.error('유효한 업무 코드를 선택해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      // 면접 날짜와 시간을 Timestamp로 변환
      const interviewDatesTimestamps = data.interviewDates
        .filter(d => d.date && d.time) // 빈 날짜/시간 제거
        .map(d => {
          const [date] = d.date.split('T');
          const combinedDateTime = `${date}T${d.time}:00`;
          return Timestamp.fromDate(new Date(combinedDateTime));
        });

      if (isCreating) {
        // 공고 생성
        await createJobBoard({
          title: data.title,
          description: data.description,
          refJobCodeId: data.refJobCodeId,
          refGeneration: selectedJobCode.generation,
          refCode: selectedJobCode.code,
          status: 'active',
          interviewDates: interviewDatesTimestamps,
          customInterviewDateAllowed: data.customInterviewDateAllowed,
          refEduDates: [],
          interviewBaseLink: data.interviewBaseLink && data.interviewBaseLink.trim() !== '' ? data.interviewBaseLink : '',
          interviewBaseDuration: data.interviewBaseDuration && data.interviewBaseDuration.trim() !== '' ? parseInt(data.interviewBaseDuration) : 0,
          interviewBaseNote: data.interviewBaseNote && data.interviewBaseNote.trim() !== '' ? data.interviewBaseNote : ''
        }, currentUser.uid);

        toast.success('공고가 성공적으로 등록되었습니다.');
      } else {
        // 공고 수정
        if (!selectedJobBoard) {
          toast.error('수정할 공고를 찾을 수 없습니다.');
          return;
        }

        await updateJobBoard(selectedJobBoard.id, {
          title: data.title,
          description: data.description,
          refJobCodeId: data.refJobCodeId,
          refGeneration: selectedJobCode.generation,
          refCode: selectedJobCode.code,
          status: data.status,
          interviewDates: interviewDatesTimestamps,
          customInterviewDateAllowed: data.customInterviewDateAllowed,
          interviewBaseLink: data.interviewBaseLink && data.interviewBaseLink.trim() !== '' ? data.interviewBaseLink : '',
          interviewBaseDuration: data.interviewBaseDuration && data.interviewBaseDuration.trim() !== '' ? parseInt(data.interviewBaseDuration) : 0,
          interviewBaseNote: data.interviewBaseNote && data.interviewBaseNote.trim() !== '' ? data.interviewBaseNote : ''
        });

        toast.success('공고가 성공적으로 수정되었습니다.');
      }
      router.push('/admin/job-board-manage');
    } catch (error) {
      console.error('공고 저장 오류:', error);
      toast.error('공고 저장 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 취소 핸들러
  const handleCancel = () => {
    setShowForm(false);
    setSelectedJobBoard(null);
    router.replace('/admin/job-board-write');
  };

  // 날짜 입력 필드 추가
  const addInterviewDate = () => {
    append({ date: '', time: '' });
  };

  // 날짜 포맷팅 함수 (시간 포함)
  const formatDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return format(date, "yyyy-MM-dd'T'HH:mm", { locale: ko });
  };

  // 날짜만 포맷팅하는 함수
  const formatDateOnly = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return format(date, 'yyyy년 MM월 dd일 (EEE)', { locale: ko });
  };

  // 사용자 친화적인 날짜 포맷팅
  const formatReadableDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return format(date, 'yyyy년 MM월 dd일 (EEE) HH:mm', { locale: ko });
  };

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center">
          <div className="mb-4 sm:mb-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">공고 생성 & 수정</h1>
            <p className="mt-1 text-sm text-gray-600">업무 공고를 생성하거나 기존 공고를 수정할 수 있습니다.</p>
          </div>
          {!showForm && (
            <Button
              variant="primary"
              onClick={handleCreateJobBoard}
              className="w-full sm:w-auto"
            >
              새 공고 생성
            </Button>
          )}
        </div>

        {showForm ? (
          <div className="bg-white shadow-md rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">{isCreating ? '새 공고 생성' : '공고 수정'}</h2>
            
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="mb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">기수 선택</label>
                    <select
                      value={selectedGeneration}
                      onChange={(e) => handleGenerationChange(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {Array.from(new Set(jobCodes.map(code => code.generation)))
                        .sort((a, b) => {
                          const numA = parseInt(a.replace(/\D/g, ''));
                          const numB = parseInt(b.replace(/\D/g, ''));
                          return numB - numA;
                        })
                        .map((generation) => (
                          <option key={generation} value={generation}>
                            {generation}
                          </option>
                        ))
                      }
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">업무 선택</label>
                    <select
                      {...register('refJobCodeId')}
                      className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">업무를 선택해주세요</option>
                      {filteredJobCodes.map((jobCode) => (
                        <option key={jobCode.id} value={jobCode.id}>
                          {jobCode.code} - {jobCode.name}
                        </option>
                      ))}
                    </select>
                    {errors.refJobCodeId && (
                      <p className="mt-1 text-sm text-red-600">{errors.refJobCodeId.message}</p>
                    )}
                  </div>
                </div>
              </div>

              {selectedJobCode && (
                <div className="mb-4 p-3 bg-gray-50 rounded-md">
                  <h3 className="font-medium text-gray-700 mb-2">선택된 업무 정보</h3>
                  <p><span className="font-medium">기수:</span> {selectedJobCode.generation}</p>
                  <p><span className="font-medium">코드:</span> {selectedJobCode.code}</p>
                  <p><span className="font-medium">이름:</span> {selectedJobCode.name}</p>
                  <p><span className="font-medium">기간:</span> {formatDateOnly(selectedJobCode.startDate)} ~ {formatDateOnly(selectedJobCode.endDate)}</p>
                  <p><span className="font-medium">위치:</span> {selectedJobCode.location}</p>
                  <div>
                    <p className="font-medium">교육 날짜:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedJobCode.eduDates.map((date, index) => (
                        <span key={index} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded">
                          {formatDateOnly(date)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <FormInput
                  label="공고 제목"
                  type="text"
                  placeholder="공고 제목을 입력하세요"
                  error={errors.title?.message}
                  {...register('title')}
                />

                {!isCreating && (
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">공고 상태</label>
                    <select
                      {...register('status')}
                      className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="active">모집중</option>
                      <option value="closed">마감</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-2">공고 설명</label>
                <RichTextEditor
                  content={watch('description')}
                  onChange={(content) => setValue('description', content)}
                  placeholder="공고에 대한 상세 설명을 입력하세요"
                />
                {errors.description && (
                  <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
                )}
              </div>

              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-gray-700 text-sm font-medium">면접 날짜 및 시간</label>
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={addInterviewDate}
                  >
                    + 날짜 추가
                  </Button>
                </div>
                
                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2 mb-2">
                    <div className="flex-1">
                      <input
                        type="date"
                        {...register(`interviewDates.${index}.date`)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="time"
                        {...register(`interviewDates.${index}.time`)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="p-2 text-red-500 hover:text-red-700"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                ))}
                {errors.interviewDates && (
                  <p className="mt-1 text-sm text-red-600">최소 하나 이상의 면접 날짜와 시간이 필요합니다.</p>
                )}
              </div>

              <div className="mb-6">
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    {...register('customInterviewDateAllowed')}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  />
                  <span className="ml-2 text-gray-700">지원자 커스텀 면접 날짜 허용</span>
                </label>
              </div>

              {/* 면접 기본 정보 섹션 */}
              <div className="border-t pt-4 mb-6">
                <h3 className="text-lg font-medium text-gray-700 mb-4">면접 기본 정보</h3>
                <p className="text-sm text-gray-500 mb-4">
                  아래 정보는 면접 상태가 &apos;면접예정&apos;으로 변경될 때 기본값으로 사용됩니다. 각 지원자별로 나중에 수정할 수 있습니다.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">기본 줌 미팅 링크</label>
                    <input
                      type="text"
                      {...register('interviewBaseLink')}
                      placeholder="https://zoom.us/j/..."
                      className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-700 text-sm font-medium mb-2">기본 예상 소요시간(분)</label>
                    <input
                      type="number"
                      {...register('interviewBaseDuration')}
                      className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">기본 면접 안내사항</label>
                  <textarea
                    {...register('interviewBaseNote')}
                    rows={3}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="면접 준비사항이나 추가 안내사항을 입력하세요..."
                  ></textarea>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancel}
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isLoading}
                >
                  {isCreating ? '공고 등록' : '공고 수정'}
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <>
            {isLoading ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
              </div>
            ) : jobBoards.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-lg shadow">
                <p className="text-gray-500">등록된 공고가 없습니다.</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">공고</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">기간</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">관리</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {jobBoards.map((board) => (
                        <tr key={board.jobBoardId} className="hover:bg-gray-50">
                          <td className="px-4 sm:px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-medium text-gray-900">{board.title}</span>
                              <span className="text-sm text-gray-500">{board.refGeneration} ({board.refCode})</span>
                            </div>
                          </td>
                          <td className="px-4 sm:px-6 py-4 text-sm text-gray-500 hidden sm:table-cell">
                            {formatReadableDate(board.createdAt)}
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              board.status === 'active' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {board.status === 'active' ? '모집중' : '마감'}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 text-sm font-medium">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => router.push(`/job-board/${board.jobBoardId}?edit=true`)}
                            >
                              수정
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
} 