'use client';
import { logger } from '@smis-mentor/shared';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { getUserByPhone, getUserByPhoneIncludeDeleted, getUserJobCodesInfo, reactivateUser } from '@/lib/firebaseService';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import Modal from '@/components/common/Modal';
import ProgressSteps from '@/components/common/ProgressSteps';

const step1Schema = z.object({
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다.'),
  phoneNumber: z.string().min(10, '유효한 휴대폰 번호를 입력해주세요.').max(11, '유효한 휴대폰 번호를 입력해주세요.'),
});

type Step1FormValues = z.infer<typeof step1Schema>;

export default function MentorSignUpStep1() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<Step1FormValues | null>(null);
  
  // 모달 상태
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showAlreadyRegisteredModal, setShowAlreadyRegisteredModal] = useState(false);
  const [showWrongInfoModal, setShowWrongInfoModal] = useState(false);
  const [showDeletedAccountModal, setShowDeletedAccountModal] = useState(false);
  const [deletedUserId, setDeletedUserId] = useState<string>('');
  const [jobCodesInfo, setJobCodesInfo] = useState<{generation: string, code: string, name: string}[]>([]);
  const [userName, setUserName] = useState('');
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step1FormValues>({
    resolver: zodResolver(step1Schema),
  });
  
  const onSubmit = async (data: Step1FormValues) => {
    setIsLoading(true);
    try {
      // SessionStorage에 저장
      const { signupStorage } = await import('@/utils/signupStorage');
      signupStorage.save({
        name: data.name,
        phoneNumber: data.phoneNumber,
      });
      
      // 먼저 deleted 포함해서 조회
      const userByPhoneWithDeleted = await getUserByPhoneIncludeDeleted(data.phoneNumber);
      
      // 삭제된 계정이 있는지 체크
      if (userByPhoneWithDeleted && (userByPhoneWithDeleted.status as any) === 'deleted') {
        const originalName = (userByPhoneWithDeleted as any).originalName || userByPhoneWithDeleted.name.replace(/^\(삭제됨\)\s*/g, '');
        
        // 본인 확인 (이름 매칭)
        if (data.name === originalName) {
          logger.info('🔄 삭제된 계정 발견 - 자동 복구 프로세스 시작:', {
            userId: userByPhoneWithDeleted.id || userByPhoneWithDeleted.userId,
            name: originalName,
            phone: data.phoneNumber,
          });
          
          // 삭제된 계정 복구 모달 표시
          setDeletedUserId(userByPhoneWithDeleted.id || userByPhoneWithDeleted.userId || '');
          setUserName(originalName);
          setFormData(data);
          setShowDeletedAccountModal(true);
          setIsLoading(false);
          return;
        } else {
          // 이름이 다른 경우 - 다른 사람의 삭제된 계정
          logger.warn('⚠️ 삭제된 계정이지만 이름 불일치:', {
            inputName: data.name,
            originalName,
          });
          toast.error(
            `이 전화번호는 "${originalName}"님 이름으로 등록된 적이 있습니다. 본인이 아니라면 관리자에게 문의해주세요.\n관리자: 010-7656-7933 (신선웅)`,
            { duration: 8000 }
          );
          setIsLoading(false);
          return;
        }
      }
      
      // 일반 사용자 조회 (deleted 제외)
      const userByPhone = await getUserByPhone(data.phoneNumber);
      setFormData(data);
      
      if (userByPhone) {
        const { name, status, jobExperiences } = userByPhone;
        setUserName(name);
        
        if (data.name === name) {
          // 이름과 전화번호가 일치하는 경우
          if (status === 'temp' && jobExperiences && jobExperiences.length > 0) {
            // Case 1: temp 상태이고 jobExperiences가 있는 경우
            logger.info('임시 사용자 jobExperiences:', jobExperiences);
            const jobCodes = await getUserJobCodesInfo(jobExperiences);
            logger.info('조회된 jobCodes:', jobCodes);
            
            if (jobCodes.length === 0) {
              logger.error('jobExperiences에 해당하는 직무 정보를 찾을 수 없습니다.');
              toast.error('직무 정보를 불러오는데 실패했습니다. 관리자에게 문의하세요.');
              setIsLoading(false);
              return;
            }
            
            const formattedJobCodes = jobCodes.map(code => ({
              generation: code.generation,
              code: code.code,
              name: code.name
            }));
            setJobCodesInfo(formattedJobCodes);
            setShowConfirmModal(true);
          } else if (status === 'active') {
            // Case 2: active 상태인 경우
            setShowAlreadyRegisteredModal(true);
          } else {
            // temp 상태이지만 jobExperiences가 없는 경우 또는 기타 상태
            toast.success(`환영합니다 ${data.name}님, SMIS와 함께 하게 되어 영광입니다. 나머지 정보를 채워주세요.`, { duration: 3000 });
            
            // startTransition을 사용하여 안전하게 페이지 전환
            const { startTransition } = await import('react');
            startTransition(() => {
              router.push('/sign-up/account');
            });
          }
        } else {
          // 이름이 일치하지 않는 경우
          if (status === 'active') {
            // Active 계정이면서 이름 불일치 → 차단
            logger.error('⚠️ Active 계정 이름 불일치 - 다른 사람 계정 가능성:', {
              registered: name,
              input: data.name,
            });
            toast.error(
              `이 전화번호는 "${name}"님 이름으로 이미 가입되어 있습니다. 본인이 아니라면 관리자에게 문의해주세요.\n관리자: 010-7656-7933 (신선웅)`,
              { duration: 8000 }
            );
            setIsLoading(false);
            return;
          } else {
            // Temp 계정이면서 이름 불일치 → 차단
            logger.error('⚠️ Temp 계정 이름 불일치 - 다른 사람이 잘못 등록한 가능성:', {
              registered: name,
              input: data.name,
            });
            toast.error(
              `이 전화번호는 "${name}"님 이름으로 등록되어 있습니다. 본인이 아니라면 관리자에게 문의해주세요.\n관리자: 010-7656-7933 (신선웅)`,
              { duration: 8000 }
            );
            setIsLoading(false);
            return;
          }
        }
      } else {
        // Case 4: 전화번호로 사용자를 찾을 수 없는 경우
        toast.success(`환영합니다 ${data.name}님, SMIS와 함께 하게 되어 영광입니다. 나머지 정보를 채워주세요.`, { duration: 3000 });
        
        // startTransition을 사용하여 안전하게 페이지 전환
        const { startTransition } = await import('react');
        startTransition(() => {
          router.push('/sign-up/account');
        });
      }
    } catch (error) {
      logger.error('사용자 정보 확인 오류:', error);
      toast.error('사용자 정보 확인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmYes = () => {
    toast.success('다시 돌아온 것을 환영합니다. 회원가입을 이어서 진행 바랍니다', { duration: 3000 });
    setShowConfirmModal(false);
    
    // startTransition을 사용하여 안전하게 페이지 전환
    import('react').then(({ startTransition }) => {
      startTransition(() => {
        router.push('/sign-up/account');
      });
    });
  };

  const handleConfirmNo = () => {
    setShowConfirmModal(false);
    setShowWrongInfoModal(true);
  };

  const handleWrongInfoOk = () => {
    setShowWrongInfoModal(false);
    
    // startTransition을 사용하여 안전하게 페이지 전환
    import('react').then(({ startTransition }) => {
      startTransition(() => {
        router.push('/sign-up/account');
      });
    });
  };

  const handleAlreadyRegisteredOk = () => {
    setShowAlreadyRegisteredModal(false);
    
    // startTransition을 사용하여 안전하게 페이지 전환
    import('react').then(({ startTransition }) => {
      startTransition(() => {
        router.push('/sign-in');
      });
    });
  };

  // 삭제된 계정 복구 핸들러
  const handleRestoreDeletedAccount = async () => {
    setShowDeletedAccountModal(false);
    const loadingToast = toast.loading('계정을 복구하는 중입니다...');
    
    try {
      await reactivateUser(deletedUserId);
      toast.dismiss(loadingToast);
      toast.success(
        `계정이 복구되었습니다! 비밀번호 재설정 이메일을 확인해주세요.\n로그인 페이지로 이동합니다.`,
        { duration: 5000 }
      );
      
      // startTransition을 사용하여 안전하게 페이지 전환
      const { startTransition } = await import('react');
      setTimeout(() => {
        startTransition(() => {
          router.push('/sign-in');
        });
      }, 3000);
    } catch (error: any) {
      toast.dismiss(loadingToast);
      logger.error('계정 복구 실패:', error);
      
      if (error.message?.includes('이미 활성화된')) {
        toast.error('이미 활성화된 계정입니다. 로그인 페이지로 이동합니다.');
        setTimeout(() => router.push('/sign-in'), 2000);
      } else {
        toast.error(
          `계정 복구 중 오류가 발생했습니다.\n관리자에게 문의해주세요.\n관리자: 010-7656-7933 (신선웅)`,
          { duration: 8000 }
        );
      }
    }
  };

  const handleCancelRestoreAccount = () => {
    setShowDeletedAccountModal(false);
    toast.error('계정 복구가 취소되었습니다.');
  };
  
  return (
    <Layout noPadding>
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-4">
        <div className="max-w-lg w-full">
          {/* 헤더 */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
              멘토 회원가입
            </h1>
            <p className="text-gray-600">개인 정보를 입력해주세요</p>
          </div>
          
          <div className="bg-white shadow-xl rounded-2xl lg:px-10 px-6 pt-8 pb-10">
            {/* 진행 표시기 */}
            <ProgressSteps
              currentStep={1}
              totalSteps={4}
              steps={['개인정보', '이메일', '교육정보', '상세정보']}
            />

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* 이름 입력 */}
              <FormInput
                label="이름"
                type="text"
                placeholder="실명을 입력하세요"
                error={errors.name?.message}
                {...register('name')}
              />
              
              {/* 휴대폰 번호 입력 */}
              <FormInput
                label="휴대폰 번호"
                type="tel"
                placeholder="'-' 없이 숫자만 입력하세요"
                error={errors.phoneNumber?.message}
                {...register('phoneNumber')}
              />
              
              {/* 버튼 그룹 */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/sign-up')}
                  className="flex-1"
                >
                  이전
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isLoading}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                >
                  다음
                </Button>
              </div>
            </form>
          </div>

          {/* 하단 링크 */}
          <div className="text-center mt-6">
            <p className="text-gray-600 text-sm">
              이미 계정이 있으신가요?{' '}
              <button
                onClick={() => router.push('/sign-in')}
                className="text-blue-600 hover:text-blue-700 font-semibold hover:underline"
              >
                로그인하기
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Case 1: 사용자 확인 모달 */}
      {showConfirmModal && (
        <Modal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          title="멘토 정보 확인"
        >
          <div className="p-4">
            <div className="text-gray-700 mb-6">
              {jobCodesInfo.map((job, index) => (
                <p key={index} className="mb-2">{job.generation} {job.code} - {job.name}</p>
              ))}
              <p className="mt-4">위 업무에 참여하신 {userName} 멘토가 맞습니까?</p>
            </div>
            <div className="flex justify-end space-x-3">
              <Button variant="secondary" onClick={handleConfirmNo}>
                아니오
              </Button>
              <Button variant="primary" onClick={handleConfirmYes}>
                예
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Case 1-2: 잘못된 정보 모달 */}
      {showWrongInfoModal && (
        <Modal
          isOpen={showWrongInfoModal}
          onClose={() => {}}
          title="정보 확인"
        >
          <div className="p-4">
            <p className="text-gray-700 mb-4">
              관리자가 정보를 잘못 입력했네요. 일단 회원가입을 이어서 진행하시고, 잘못된 정보는 관리자에게 카톡이나 문자 주시면 바로 수정하겠습니다. 관리자 번호: 010-7656-7933 신선웅
            </p>
            <div className="flex justify-end">
              <Button variant="primary" onClick={handleWrongInfoOk}>
                예
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Case 2: 이미 가입된 사용자 모달 */}
      {showAlreadyRegisteredModal && (
        <Modal
          isOpen={showAlreadyRegisteredModal}
          onClose={() => {}}
          title="가입 정보 확인"
        >
          <div className="p-4">
            <p className="text-gray-700 mb-4">
              이미 가입된 유저입니다. 회원 정보를 잊으셨으면 관리자에게 카톡이나 문자 바랍니다. 관리자 번호: 010-7656-7933 신선웅
            </p>
            <div className="flex justify-end">
              <Button variant="primary" onClick={handleAlreadyRegisteredOk}>
                예
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Case 3: 삭제된 계정 복구 모달 */}
      {showDeletedAccountModal && (
        <Modal
          isOpen={showDeletedAccountModal}
          onClose={() => {}}
          title="계정 복구"
        >
          <div className="p-4">
            <div className="mb-6">
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
              <p className="text-gray-700 text-center mb-4">
                <strong className="text-lg">{userName}</strong>님의 이전 계정을 발견했습니다.
              </p>
              <p className="text-gray-600 text-sm text-center mb-4">
                이전에 삭제된 계정입니다. 계정을 복구하시겠습니까?
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                <p className="text-blue-800 font-semibold mb-2">✅ 계정 복구 시:</p>
                <ul className="text-blue-700 space-y-1 ml-4">
                  <li>• 이전 평가 점수 및 이력이 복원됩니다</li>
                  <li>• 지원서 및 업무 기록이 복원됩니다</li>
                  <li>• 비밀번호 재설정 이메일이 전송됩니다</li>
                  <li>• 복구 후 로그인하여 사용 가능합니다</li>
                </ul>
              </div>
            </div>
            <div className="flex gap-3">
              <Button 
                variant="secondary" 
                onClick={handleCancelRestoreAccount}
                className="flex-1"
              >
                취소
              </Button>
              <Button 
                variant="primary" 
                onClick={handleRestoreDeletedAccount}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700"
              >
                계정 복구하기
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
