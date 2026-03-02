'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { getUserByPhone, getUserJobCodesInfo } from '@/lib/firebaseService';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import Modal from '@/components/common/Modal';

const step1Schema = z.object({
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다.'),
  phoneNumber: z.string().min(10, '유효한 휴대폰 번호를 입력해주세요.').max(11, '유효한 휴대폰 번호를 입력해주세요.'),
});

type Step1FormValues = z.infer<typeof step1Schema>;

export default function SignUp() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<Step1FormValues | null>(null);
  
  // 모달 상태
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showAlreadyRegisteredModal, setShowAlreadyRegisteredModal] = useState(false);
  const [showWrongInfoModal, setShowWrongInfoModal] = useState(false);
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
      // 임시 사용자로 등록되어 있는지 확인
      const userByPhone = await getUserByPhone(data.phoneNumber);
      setFormData(data);
      
      if (userByPhone) {
        const { name, status, jobExperiences } = userByPhone;
        setUserName(name);
        
        if (data.name === name) {
          // 이름과 전화번호가 일치하는 경우
          if (status === 'temp' && jobExperiences && jobExperiences.length > 0) {
            // Case 1: temp 상태이고 jobExperiences가 있는 경우
            console.log('임시 사용자 jobExperiences:', jobExperiences);
            const jobCodes = await getUserJobCodesInfo(jobExperiences);
            console.log('조회된 jobCodes:', jobCodes);
            
            if (jobCodes.length === 0) {
              console.error('jobExperiences에 해당하는 직무 정보를 찾을 수 없습니다.');
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
            router.push(`/sign-up/account?name=${data.name}&phone=${data.phoneNumber}`);
          }
        } else {
          // Case 3: 이름이 일치하지 않는 경우
          toast.success(`환영합니다 ${data.name}님, SMIS와 함께 하게 되어 영광입니다. 나머지 정보를 채워주세요.`, { duration: 3000 });
          router.push(`/sign-up/account?name=${data.name}&phone=${data.phoneNumber}`);
        }
      } else {
        // Case 3: 전화번호로 사용자를 찾을 수 없는 경우
        toast.success(`환영합니다 ${data.name}님, SMIS와 함께 하게 되어 영광입니다. 나머지 정보를 채워주세요.`, { duration: 3000 });
        router.push(`/sign-up/account?name=${data.name}&phone=${data.phoneNumber}`);
      }
    } catch (error) {
      console.error('사용자 정보 확인 오류:', error);
      toast.error('사용자 정보 확인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmYes = () => {
    toast.success('다시 돌아온 것을 환영합니다. 회원가입을 이어서 진행 바랍니다', { duration: 3000 });
    if (formData) {
      router.push(`/sign-up/account?name=${formData.name}&phone=${formData.phoneNumber}`);
    }
    setShowConfirmModal(false);
  };

  const handleConfirmNo = () => {
    setShowConfirmModal(false);
    setShowWrongInfoModal(true);
  };

  const handleWrongInfoOk = () => {
    setShowWrongInfoModal(false);
    if (formData) {
      router.push(`/sign-up/account?name=${formData.name}&phone=${formData.phoneNumber}`);
    }
  };

  const handleAlreadyRegisteredOk = () => {
    setShowAlreadyRegisteredModal(false);
    router.push('/sign-in');
  };
  
  return (
    <Layout>
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-center mb-2">회원가입</h1>
        <p className="text-gray-600 text-center mb-6">개인 정보를 입력해주세요</p>
        
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow-md rounded lg:px-8 px-4 pt-6 pb-8 mb-4">
          <div className="mb-2 text-sm font-medium text-gray-700">
            1/4 단계: 개인 정보
          </div>
          
          <FormInput
            label="이름"
            type="text"
            placeholder="실명을 입력하세요"
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
          
          <div className="flex items-center justify-between mt-6">
            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isLoading}
            >
              다음
            </Button>
          </div>
        </form>

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
      </div>
    </Layout>
  );
}