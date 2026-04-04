'use client';
import { logger } from '@smis-mentor/shared';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { getUserByEmail } from '@/lib/firebaseService';
import { signupStorage } from '@/utils/signupStorage';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import ProgressSteps from '@/components/common/ProgressSteps';
import { FaEnvelope, FaLock, FaCheckCircle, FaInfoCircle } from 'react-icons/fa';

// 비밀번호 검증 정규식
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

const accountSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  password: z.string()
    .min(8, '비밀번호는 최소 8자 이상이어야 합니다.')
    .regex(passwordRegex, '비밀번호는 문자, 숫자, 특수문자를 포함해야 합니다.'),
  confirmPassword: z.string()
    .min(8, '비밀번호 확인은 최소 8자 이상이어야 합니다.'),
}).refine((data) => data.password === data.confirmPassword, {
  message: '비밀번호가 일치하지 않습니다.',
  path: ['confirmPassword'],
});

type AccountFormValues = z.infer<typeof accountSchema>;

export default function SignUpAccount() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [emailExists, setEmailExists] = useState(false);
  const [signupData, setSignupData] = useState(signupStorage.get());

  // 소셜 로그인인 경우 education 페이지로 자동 이동
  useEffect(() => {
    const data = signupStorage.get();
    setSignupData(data);
    
    if (data?.socialSignUp) {
      // 소셜 로그인은 이메일/비밀번호 불필요 - 건너뛰기
      logger.info('소셜 로그인 감지 - education 페이지로 이동');
      router.push('/sign-up/education');
    } else if (!data?.name || !data?.phoneNumber) {
      // 필수 정보 없으면 처음부터 시작
      toast.error('필수 정보가 누락되었습니다.');
      router.push('/sign-up');
    }
  }, [router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
  });

  // 현재 입력된 이메일을 실시간으로 감시
  const currentEmail = watch('email');
  const currentPassword = watch('password');

  // 이메일 입력 필드에서 focus가 벗어났을 때 중복 확인
  const handleEmailBlur = async () => {
    if (currentEmail && !errors.email) {
      try {
        const existingUser = await getUserByEmail(currentEmail);
        setEmailExists(!!existingUser);
      } catch (error) {
        logger.error('이메일 중복 확인 오류:', error);
      }
    }
  };

  // 비밀번호 강도 계산
  const getPasswordStrength = (password: string) => {
    if (!password) return { strength: 0, text: '', color: '' };
    
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^A-Za-z\d]/.test(password)) strength++;
    
    if (strength <= 2) return { strength: 33, text: '약함', color: 'bg-red-500' };
    if (strength <= 3) return { strength: 66, text: '보통', color: 'bg-yellow-500' };
    return { strength: 100, text: '강함', color: 'bg-green-500' };
  };

  const passwordStrength = getPasswordStrength(currentPassword);

  const onSubmit = async (data: AccountFormValues) => {
    setIsLoading(true);
    try {
      // 마지막으로 이메일 중복 확인
      const existingUser = await getUserByEmail(data.email);
      if (existingUser) {
        setEmailExists(true);
        setIsLoading(false);
        return;
      }

      // SessionStorage에 저장
      signupStorage.save({
        email: data.email,
        password: data.password,
      });
      
      // startTransition을 사용하여 안전하게 페이지 전환
      const { startTransition } = await import('react');
      startTransition(() => {
        router.push('/sign-up/education');
      });
    } catch (error) {
      logger.error('계정 정보 확인 오류:', error);
      toast.error('계정 정보 확인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!signupData || signupData.socialSignUp) {
    return null; // useEffect에서 리다이렉트 처리
  }

  return (
    <Layout noPadding>
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-4">
        <div className="max-w-lg w-full">
          {/* 헤더 */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
              계정 정보 입력
            </h1>
            <p className="text-gray-600">로그인에 사용할 이메일과 비밀번호를 설정하세요</p>
          </div>

          <div className="bg-white shadow-xl rounded-2xl lg:px-10 px-6 pt-8 pb-10">
            {/* 진행 표시기 */}
            <ProgressSteps
              currentStep={2}
              totalSteps={4}
              steps={['개인정보', '이메일', '교육정보', '상세정보']}
            />

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* 이메일 입력 */}
              <div className="relative">
                <div className="absolute left-3 top-[38px] text-gray-400">
                  <FaEnvelope className="w-5 h-5" />
                </div>
                <FormInput
                  label="이메일"
                  type="email"
                  placeholder="example@email.com"
                  error={emailExists ? '이미 사용 중인 이메일입니다.' : errors.email?.message}
                  className="pl-12"
                  {...register('email', {
                    onBlur: handleEmailBlur
                  })}
                />
                {!errors.email && !emailExists && currentEmail && (
                  <div className="mt-2 flex items-center text-sm text-green-600">
                    <FaCheckCircle className="w-4 h-4 mr-1" />
                    사용 가능한 이메일입니다
                  </div>
                )}
              </div>

              {/* 이메일 안내 */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-start">
                  <FaInfoCircle className="w-4 h-4 text-amber-600 mt-0.5 mr-2 flex-shrink-0" />
                  <p className="text-xs text-amber-800">
                    이메일 주소는 로그인 아이디로 사용되며, 이후 변경할 수 없습니다. 
                    정확한 이메일 주소를 입력해주세요.
                  </p>
                </div>
              </div>

              {/* 비밀번호 입력 */}
              <div className="relative">
                <div className="absolute left-3 top-[38px] text-gray-400">
                  <FaLock className="w-5 h-5" />
                </div>
                <FormInput
                  label="비밀번호"
                  type="password"
                  placeholder="8자 이상, 문자/숫자/특수문자 포함"
                  error={errors.password?.message}
                  showPasswordToggle={true}
                  className="pl-12"
                  {...register('password')}
                />
              </div>

              {/* 비밀번호 강도 표시 */}
              {currentPassword && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">비밀번호 강도</span>
                    <span className={`font-semibold ${
                      passwordStrength.strength === 100 ? 'text-green-600' :
                      passwordStrength.strength === 66 ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {passwordStrength.text}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${passwordStrength.color} transition-all duration-300`}
                      style={{ width: `${passwordStrength.strength}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* 비밀번호 확인 */}
              <div className="relative">
                <div className="absolute left-3 top-[38px] text-gray-400">
                  <FaLock className="w-5 h-5" />
                </div>
                <FormInput
                  label="비밀번호 확인"
                  type="password"
                  placeholder="비밀번호를 다시 입력하세요"
                  error={errors.confirmPassword?.message}
                  showPasswordToggle={true}
                  className="pl-12"
                  {...register('confirmPassword')}
                />
              </div>

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
                  disabled={emailExists}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                >
                  다음
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
} 