"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { signIn, resetPassword, getUserByEmail } from '@/lib/firebaseService';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import { FirebaseError } from 'firebase/app';

const loginSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  password: z.string().min(6, '비밀번호는 최소 6자 이상이어야 합니다.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function SignInClient() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [showResetForm, setShowResetForm] = useState(false);
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });
  
  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      await signIn(data.email, data.password);
      
      // 사용자 정보 조회
      const userRecord = await getUserByEmail(data.email);
      
      // 멘토이고 프로필이 미완성인 경우 체크
      const isMentor = userRecord?.role === 'mentor';
      const hasProfileImage = !!userRecord?.profileImage;
      const hasSelfIntro = !!userRecord?.selfIntroduction;
      const hasJobMotivation = !!userRecord?.jobMotivation;
      const isProfileIncomplete = isMentor && (!hasProfileImage || !hasSelfIntro || !hasJobMotivation);
      
      if (isProfileIncomplete) {
        toast.success('로그인에 성공했습니다!', { duration: 2000 });
        setTimeout(() => {
          alert('프로필 이미지 업로드, 자기소개서 & 지원동기를 작성해주세요.');
          router.push('/profile/edit');
        }, 500);
      } else {
        toast.success('로그인에 성공했습니다. 로그인 정보가 브라우저에 안전하게 저장되어 다음에도 자동으로 로그인됩니다.', { 
          duration: 4000 
        });
        
        // URL에서 redirect 매개변수 확인
        const params = new URLSearchParams(window.location.search);
        const redirectTo = params.get('redirect');
        
        // 지연 후 리디렉션
        setTimeout(() => {
          // redirectTo가 있으면 해당 경로로, 없으면 메인 페이지로 이동
          router.push(redirectTo || '/');
        }, 1000);
      }
    } catch (error) {
      console.error('로그인 오류:', error);
      const firebaseError = error as FirebaseError;
      if (firebaseError.code === 'auth/user-not-found' || firebaseError.code === 'auth/wrong-password') {
        toast.error('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else if (firebaseError.code === 'auth/too-many-requests') {
        toast.error('너무 많은 로그인 시도가 있었습니다. 나중에 다시 시도해주세요.');
      } else {
        toast.error('로그인 중 오류가 발생했습니다.');
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleForgotPassword = async () => {
    try {
      const email = resetEmail || getValues('email');
      if (!email) {
        toast.error('이메일 주소를 입력해주세요.');
        return;
      }
      
      // 이메일 형식 검증
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        toast.error('올바른 이메일 형식을 입력해주세요.');
        return;
      }
      
      setIsLoading(true);
      await resetPassword(email);
      toast.success(
        '비밀번호 재설정 이메일이 발송되었습니다. 메일함(스팸함 포함)을 확인해주세요.',
        { duration: 5000 }
      );
      setShowResetForm(false);
    } catch (error) {
      console.error('비밀번호 재설정 오류:', error);
      const firebaseError = error as FirebaseError;
      
      if (firebaseError.code === 'auth/user-not-found') {
        toast.error('해당 이메일로 등록된 계정이 없습니다.');
      } else if (firebaseError.code === 'auth/invalid-email') {
        toast.error('유효하지 않은 이메일 주소입니다.');
      } else if (firebaseError.code === 'auth/too-many-requests') {
        toast.error('너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.');
      } else {
        toast.error('비밀번호 재설정 이메일 발송 중 오류가 발생했습니다. 나중에 다시 시도해주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Layout noPadding>
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-2 sm:px-6">
        <div className="max-w-md w-full">
          {/* 로고/타이틀 */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent mb-3">
              SMIS
            </h1>
            <p className="text-gray-600 text-sm sm:text-base">SMIS English Camp Recruiting Page</p>
          </div>
          
          {/* 로그인 폼 */}
          <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow-xl rounded-2xl px-4 sm:px-6 py-6 sm:py-8 space-y-4">
            <div className="w-full">
              <label className="block text-gray-700 text-sm font-medium mb-2">
                이메일 / Email
              </label>
              <input
                type="email"
                placeholder="이메일을 입력해주세요"
                className={`w-full px-3 py-2 border ${
                  errors.email ? 'border-red-500' : 'border-gray-300'
                } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
                {...register('email')}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>
            
            <div className="w-full">
              <label className="block text-gray-700 text-sm font-medium mb-2">
                비밀번호 / Password
              </label>
              <input
                type="password"
                placeholder="비밀번호를 입력해주세요"
                className={`w-full px-3 py-2 border ${
                  errors.password ? 'border-red-500' : 'border-gray-300'
                } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
                {...register('password')}
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>
            
            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isLoading}
              className="!mt-6 !bg-blue-600 hover:!bg-blue-700 !py-3 !text-base !font-semibold"
            >
              로그인
            </Button>
            
            {/* 비밀번호 찾기 / 회원가입 버튼 */}
            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
                onClick={() => setShowResetForm(!showResetForm)}
              >
                비밀번호 찾기
              </button>
              <Link
                href="/sign-up"
                className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                회원가입 / Sign Up
              </Link>
            </div>
            
            {/* 비밀번호 재설정 폼 */}
            {showResetForm && (
              <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <p className="text-sm text-gray-700 mb-3 font-medium">비밀번호 재설정 이메일 받기</p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="이메일 주소"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    isLoading={isLoading}
                    onClick={handleForgotPassword}
                  >
                    전송
                  </Button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </Layout>
  );
} 