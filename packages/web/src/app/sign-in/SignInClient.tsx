"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { signIn, resetPassword, getUserByEmail, getUserByPhone, getUserByForeignName, updateUser, getUserById } from '@/lib/firebaseService';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import GoogleSignInButton from '@/components/common/GoogleSignInButton';
import PhoneInputModal from '@/components/common/PhoneInputModal';
import ForeignPhoneInputModal from '@/components/common/ForeignPhoneInputModal';
import RoleSelectionModal from '@/components/common/RoleSelectionModal';
import PasswordInputModal from '@/components/common/PasswordInputModal';
import { FirebaseError } from 'firebase/app';
import { 
  handleSocialLogin, 
  checkTempAccountByPhone, 
  linkSocialToExistingAccount,
  handleSocialAuthError,
  SocialUserData 
} from '@smis-mentor/shared';
import { handleGoogleAuthError } from '@/lib/googleAuthService';
import { auth } from '@/lib/firebase';

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
  
  // 소셜 로그인 관련 상태
  const [showRoleSelectionModal, setShowRoleSelectionModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'mentor' | 'foreign' | null>(null);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showForeignPhoneModal, setShowForeignPhoneModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [socialData, setSocialData] = useState<SocialUserData | null>(null);
  const [existingUserEmail, setExistingUserEmail] = useState<string | null>(null);
  
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
      setIsLoading(true);
      await resetPassword(email);
      toast.success('비밀번호 재설정 이메일이 발송되었습니다.');
      setShowResetForm(false);
    } catch (error) {
      console.error('비밀번호 재설정 오류:', error);
      const firebaseError = error as FirebaseError;
      if (firebaseError.code === 'auth/user-not-found') {
        toast.error('해당 이메일로 등록된 계정이 없습니다.');
      } else {
        toast.error('비밀번호 재설정 이메일 발송 중 오류가 발생했습니다.');
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  // Google 로그인 성공 핸들러
  const handleGoogleSignInSuccess = async (data: SocialUserData) => {
    try {
      const result = await handleSocialLogin(data, getUserByEmail);
      
      if (result.action === 'LOGIN') {
        // 기존 소셜 계정으로 바로 로그인
        toast.success('로그인에 성공했습니다!');
        setTimeout(() => {
          const params = new URLSearchParams(window.location.search);
          const redirectTo = params.get('redirect');
          router.push(redirectTo || '/');
        }, 1000);
      } else if (result.action === 'LINK_ACTIVE') {
        // 기존 이메일/비밀번호 계정이 있음 - 비밀번호 입력 필요
        const currentUser = auth.currentUser;
        if (currentUser) {
          try {
            await currentUser.delete();
          } catch (deleteError) {
            console.error('계정 삭제 실패:', deleteError);
            await auth.signOut();
          }
        }
        
        setSocialData(data);
        setExistingUserEmail(result.user?.email || data.email);
        setShowPasswordModal(true);
      } else if (result.action === 'NEED_PHONE') {
        // 이메일로 계정이 없음 - 역할 선택 필요
        const currentUser = auth.currentUser;
        if (currentUser) {
          try {
            await currentUser.delete();
          } catch (deleteError) {
            console.error('계정 삭제 실패:', deleteError);
            await auth.signOut();
          }
        }
        
        setSocialData(data);
        setShowRoleSelectionModal(true);
      } else if (result.action === 'LINK_TEMP') {
        // temp 계정 활성화 필요
        const currentUser = auth.currentUser;
        if (currentUser) {
          try {
            await currentUser.delete();
          } catch (deleteError) {
            console.error('계정 삭제 실패:', deleteError);
            await auth.signOut();
          }
        }
        
        toast('임시 계정이 발견되었습니다. 회원가입을 완료해주세요.');
        router.push(`/sign-up/account?tempUserId=${result.tempUserId}&socialSignUp=true&socialProvider=google`);
      }
    } catch (error) {
      console.error('Google 로그인 처리 오류:', error);
      const errorMessage = handleSocialAuthError(error);
      toast.error(errorMessage);
    }
  };
  
  // 역할 선택 핸들러
  const handleRoleSelection = (role: 'mentor' | 'foreign') => {
    setSelectedRole(role);
    setShowRoleSelectionModal(false);
    
    if (role === 'foreign') {
      setShowForeignPhoneModal(true);
    } else {
      setShowPhoneModal(true);
    }
  };
  
  // Google 로그인 에러 핸들러
  const handleGoogleSignInError = (error: any) => {
    const errorMessage = handleGoogleAuthError(error);
    toast.error(errorMessage);
  };
  
  // 원어민 전화번호 입력 핸들러
  const handleForeignPhoneSubmit = async (data: {
    firstName: string;
    lastName: string;
    middleName?: string;
    countryCode: string;
    phoneNumber: string;
  }) => {
    if (!socialData) return;
    
    setIsLoading(true);
    try {
      const fullName = data.middleName
        ? `${data.firstName} ${data.middleName} ${data.lastName}`
        : `${data.firstName} ${data.lastName}`;
      
      // 전화번호 정규화
      let cleanPhone = data.phoneNumber;
      if (data.countryCode === '+82' && cleanPhone.startsWith('0')) {
        cleanPhone = cleanPhone.substring(1);
      }
      const fullPhone = `${data.countryCode}${cleanPhone}`;
      
      // ✅ 원어민은 First Name + Last Name으로만 검색
      console.log('🔍 원어민 계정 검색:', { firstName: data.firstName, lastName: data.lastName });
      const existingUser = await getUserByForeignName(data.firstName, data.lastName);
      
      if (existingUser) {
        setShowForeignPhoneModal(false);
        
        const role = existingUser.role;
        
        console.log('👤 원어민 계정 발견:', {
          role,
          status: existingUser.status,
          name: existingUser.name,
        });
        
        // active 원어민 계정이면서 이메일이 다른 경우
        if (role === 'foreign' && existingUser.status === 'active') {
          if (existingUser.email !== socialData.email) {
            // 이메일이 다르면 비밀번호 입력으로 계정 연동
            toast(
              `Existing account found with name "${existingUser.name}". Please enter your password to link accounts.`,
              {
                duration: 5000,
                icon: '⚠️',
              }
            );
            setSocialData({ ...socialData, name: fullName });
            setExistingUserEmail(existingUser.email);
            setShowPasswordModal(true);
            setIsLoading(false);
            return;
          } else {
            // 이메일이 같으면 바로 로그인
            toast.success('Welcome back! Logging you in...');
            setTimeout(() => {
              const params = new URLSearchParams(window.location.search);
              const redirectTo = params.get('redirect');
              router.push(redirectTo || '/');
            }, 1000);
            return;
          }
        }
        
        // foreign_temp 계정 발견
        if (role === 'foreign_temp' && existingUser.status === 'temp') {
          console.log('✅ foreign_temp 계정 발견 - 활성화 진행');
          toast.success('Temporary account found. Please complete your registration.');
          router.push(
            `/sign-up/foreign/account?` +
            `firstName=${encodeURIComponent(data.firstName)}&` +
            `lastName=${encodeURIComponent(data.lastName)}&` +
            `middleName=${encodeURIComponent(data.middleName || '')}&` +
            `countryCode=${encodeURIComponent(data.countryCode)}&` +
            `phone=${encodeURIComponent(data.phoneNumber)}&` +
            `socialSignUp=true&` +
            `tempUserId=${existingUser.userId}&` +
            `socialProvider=google`
          );
          return;
        }
        
        // mentor_temp 또는 mentor인 경우
        if (role === 'mentor_temp' || role === 'mentor') {
          toast.error(
            'This name is registered as a mentor account. Please contact the administrator if this is incorrect.\nAdministrator: 010-7656-7933 (Shin Sunwoong)',
            { duration: 8000 }
          );
          setIsLoading(false);
          return;
        }
        
        // 기타 케이스
        toast.error(
          `This name is already registered with a different role. Please contact the administrator.\nAdministrator: 010-7656-7933 (Shin Sunwoong)`,
          { duration: 8000 }
        );
        setIsLoading(false);
        return;
      } else {
        // ✅ 신규 원어민 가입
        console.log('🆕 신규 원어민 가입 진행');
        toast.success(`Welcome ${data.firstName}! Please complete your registration.`);
        setShowForeignPhoneModal(false);
        router.push(
          `/sign-up/foreign/account?` +
          `firstName=${encodeURIComponent(data.firstName)}&` +
          `lastName=${encodeURIComponent(data.lastName)}&` +
          `middleName=${encodeURIComponent(data.middleName || '')}&` +
          `countryCode=${encodeURIComponent(data.countryCode)}&` +
          `phone=${encodeURIComponent(data.phoneNumber)}&` +
          `socialSignUp=true&` +
          `socialProvider=google`
        );
      }
    } catch (error: any) {
      console.error('Foreign name verification error:', error);
      toast.error('An error occurred while verifying your account.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // 이름과 전화번호 입력 핸들러 (멘토용)
  const handlePhoneSubmit = async (data: { name: string; phoneNumber: string }) => {
    if (!socialData) return;
    
    setIsLoading(true);
    try {
      const result = await checkTempAccountByPhone(
        data.phoneNumber, 
        { ...socialData, name: data.name }, // 사용자가 입력한 이름으로 업데이트
        getUserByPhone
      );
      
      if (result.found && result.user) {
        setShowPhoneModal(false);
        
        // active 계정이면서 연동이 필요한 경우
        if (result.isActive && result.needsLink) {
          // 이름이 일치하지 않는 경우 이메일+비밀번호로 검증
          if (result.nameMatches === false) {
            console.warn('⚠️ 이름 불일치 - 이메일+비밀번호 검증 필요:', {
              registered: result.user.name,
              input: data.name,
            });
            toast(`등록된 이름(${result.user.name})과 다릅니다. 본인 확인을 위해 기존 계정의 이메일과 비밀번호를 입력해주세요.`, {
              duration: 5000,
              icon: '⚠️',
            });
          } else {
            toast('기존 계정이 발견되었습니다. 계정 연동을 위해 비밀번호를 입력해주세요.');
          }
          
          setSocialData({ ...socialData, name: data.name });
          setExistingUserEmail(result.user.email);
          setShowPasswordModal(true);
          setIsLoading(false);
          return;
        }
        
        // temp 계정 발견
        if (result.nameMatches === false) {
          console.error('⚠️ temp 계정 이름 불일치 - 다른 사람이 잘못 등록한 가능성:', {
            registered: result.user.name,
            input: data.name,
          });
          
          // temp 계정인데 이름이 다른 경우: 관리자 문의 필요
          toast.error(
            `이 전화번호는 "${result.user.name}"님 이름으로 등록되어 있습니다. 본인이 아니라면 관리자에게 문의해주세요.\n관리자: 010-7656-7933 (신선웅)`,
            { duration: 8000 }
          );
          setIsLoading(false);
          return;
        }
        
        // 이름 일치 - 정상 진행
        toast.success('임시 계정이 발견되었습니다. 회원가입을 완료해주세요.');
        
        // 역할에 따라 적절한 회원가입 페이지로 이동
        const role = result.user.role;
        if (role === 'foreign_temp') {
          // 소셜 로그인이므로 education 페이지로 직접 이동 (account 건너뛰기)
          router.push(`/sign-up/foreign/account?socialSignUp=true&tempUserId=${result.user.userId}&socialProvider=google`);
        } else {
          // 소셜 로그인이므로 education 페이지로 직접 이동 (account 건너뛰기)
          // SessionStorage에 저장
          const { signupStorage } = await import('@/utils/signupStorage');
          signupStorage.save({
            name: data.name,
            phoneNumber: data.phoneNumber,
            email: socialData.email,
            socialSignUp: true,
            tempUserId: result.user.userId,
            socialProvider: 'google',
            socialEmail: socialData.email,
          });
          router.push('/sign-up/education');
        }
      } else {
        // temp 계정 없음 - 신규 가입
        // SessionStorage에 저장하고 education으로 이동
        const { signupStorage } = await import('@/utils/signupStorage');
        signupStorage.save({
          name: data.name,
          phoneNumber: data.phoneNumber,
          email: socialData.email,
          socialSignUp: true,
          socialProvider: 'google',
          socialEmail: socialData.email,
        });
        
        toast.success('신규 가입을 진행합니다.');
        setShowPhoneModal(false);
        router.push('/sign-up/education');
      }
    } catch (error: any) {
      console.error('이름/전화번호 확인 오류:', error);
      if (error.message === 'ALREADY_REGISTERED') {
        toast.error('이 전화번호로 이미 등록된 계정이 있습니다. 해당 이메일로 로그인해주세요.');
      } else {
        toast.error('계정 확인 중 오류가 발생했습니다.');
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  // 모달 닫기 핸들러 (Firebase Auth 정리)
  const handleRoleModalClose = async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        console.log('소셜 로그인 역할 선택 중단 - Firebase Auth 계정 삭제');
        await currentUser.delete();
      } catch (error) {
        console.error('계정 삭제 실패, 로그아웃 시도:', error);
        await auth.signOut();
      }
    }
    setShowRoleSelectionModal(false);
    setSocialData(null);
    setSelectedRole(null);
  };
  
  const handlePhoneModalClose = async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        console.log('소셜 로그인 중단 - Firebase Auth 계정 삭제');
        await currentUser.delete();
      } catch (error) {
        console.error('계정 삭제 실패, 로그아웃 시도:', error);
        await auth.signOut();
      }
    }
    setShowPhoneModal(false);
    setSocialData(null);
  };
  
  const handleForeignPhoneModalClose = async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        console.log('원어민 소셜 로그인 중단 - Firebase Auth 계정 삭제');
        await currentUser.delete();
      } catch (error) {
        console.error('계정 삭제 실패, 로그아웃 시도:', error);
        await auth.signOut();
      }
    }
    setShowForeignPhoneModal(false);
    setSocialData(null);
  };
  
  // 비밀번호 모달 닫기 핸들러
  const handlePasswordModalClose = async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        console.log('계정 연동 중단 - Firebase Auth 계정 삭제');
        await currentUser.delete();
      } catch (error) {
        console.error('계정 삭제 실패, 로그아웃 시도:', error);
        await auth.signOut();
      }
    }
    setShowPasswordModal(false);
    setSocialData(null);
    setExistingUserEmail(null);
  };
  
  // 비밀번호 입력 핸들러 (계정 연동)
  const handlePasswordSubmit = async (password: string) => {
    if (!socialData || !existingUserEmail) return;
    
    setIsLoading(true);
    try {
      await linkSocialToExistingAccount(
        auth,
        existingUserEmail,
        password,
        socialData,
        signIn,
        getUserByEmail,
        getUserById,
        updateUser
      );
      
      toast.success('Google 계정이 연동되었습니다!');
      setShowPasswordModal(false);
      
      setTimeout(() => {
        const params = new URLSearchParams(window.location.search);
        const redirectTo = params.get('redirect');
        router.push(redirectTo || '/');
      }, 1000);
    } catch (error) {
      console.error('계정 연동 오류:', error);
      const firebaseError = error as FirebaseError;
      if (firebaseError.code === 'auth/wrong-password') {
        toast.error(
          '비밀번호가 올바르지 않습니다. 본인의 계정이 아니라면 관리자에게 문의하세요.\n관리자: 010-7656-7933 (신선웅)',
          { duration: 8000 }
        );
      } else if (firebaseError.code === 'auth/too-many-requests') {
        toast.error('너무 많은 시도가 있었습니다. 나중에 다시 시도해주세요.');
      } else {
        toast.error('계정 연동 중 오류가 발생했습니다.');
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  // 비밀번호 찾기 (모달에서)
  const handleForgotPasswordFromModal = () => {
    setShowPasswordModal(false);
    setShowResetForm(true);
    if (existingUserEmail) {
      setResetEmail(existingUserEmail);
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
            
            {/* 구분선 */}
            <div className="relative flex items-center justify-center py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative bg-white px-4 text-sm text-gray-500">
                또는
              </div>
            </div>
            
            {/* Google 로그인 버튼 */}
            <GoogleSignInButton
              onSuccess={handleGoogleSignInSuccess}
              onError={handleGoogleSignInError}
            />
            
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
      
      {/* 역할 선택 모달 */}
      <RoleSelectionModal
        isOpen={showRoleSelectionModal}
        onClose={handleRoleModalClose}
        onSelectRole={handleRoleSelection}
      />
      
      {/* 멘토 이름 및 전화번호 입력 모달 */}
      <PhoneInputModal
        isOpen={showPhoneModal}
        onClose={handlePhoneModalClose}
        onSubmit={handlePhoneSubmit}
        title="본인 확인"
        description="계정 확인을 위해 이름과 전화번호를 입력해주세요."
        isLoading={isLoading}
        defaultName={socialData?.name || ''}
      />
      
      {/* 원어민 전화번호 입력 모달 */}
      <ForeignPhoneInputModal
        isOpen={showForeignPhoneModal}
        onClose={handleForeignPhoneModalClose}
        onSubmit={handleForeignPhoneSubmit}
        title="Identity Verification"
        description="Please enter your name and phone number to verify your account."
        isLoading={isLoading}
        defaultName={socialData?.name || ''}
      />
      
      {/* 비밀번호 입력 모달 */}
      <PasswordInputModal
        isOpen={showPasswordModal}
        onClose={handlePasswordModalClose}
        onSubmit={handlePasswordSubmit}
        onForgotPassword={handleForgotPasswordFromModal}
        email={existingUserEmail || undefined}
        title="계정 연동"
        description="이미 등록된 계정입니다. Google 계정과 연동하려면 기존 비밀번호를 입력해주세요."
        isLoading={isLoading}
      />
    </Layout>
  );
} 