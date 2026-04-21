'use client';
import { logger } from '@smis-mentor/shared';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { getUserByPhone, getUserByPhoneIncludeDeleted, reactivateUser } from '@/lib/firebaseService';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import Modal from '@/components/common/Modal';
import ProgressSteps from '@/components/common/ProgressSteps';
import { getPhonePlaceholder } from '@smis-mentor/shared';

const countryCodes = [
  { code: '+82', country: 'South Korea', flag: '🇰🇷' },
  { code: '+1', country: 'USA/Canada', flag: '🇺🇸' },
  { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
  { code: '+353', country: 'Ireland', flag: '🇮🇪' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
  { code: '+64', country: 'New Zealand', flag: '🇳🇿' },
  { code: '+27', country: 'South Africa', flag: '🇿🇦' },
];

const step1Schema = z.object({
  firstName: z.string().min(1, 'Please enter your First Name.'),
  lastName: z.string().min(1, 'Please enter your Last Name.'),
  middleName: z.string().optional(),
  countryCode: z.string(),
  phoneNumber: z.string().min(8, 'Please enter a valid phone number.'),
});

type Step1FormValues = z.infer<typeof step1Schema>;

export default function ForeignSignUpStep1() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showDeletedAccountModal, setShowDeletedAccountModal] = useState(false);
  const [deletedUserId, setDeletedUserId] = useState<string>('');
  const [deletedUserName, setDeletedUserName] = useState<string>('');
  
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Step1FormValues>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      countryCode: '+82',
    },
  });
  
  const countryCode = watch('countryCode');
  
  // 삭제된 계정 복구 핸들러
  const handleRestoreDeletedAccount = async () => {
    setShowDeletedAccountModal(false);
    const loadingToast = toast.loading('Restoring your account...');
    
    try {
      await reactivateUser(deletedUserId);
      toast.dismiss(loadingToast);
      toast.success(
        `Your account has been restored! Please check your email for password reset instructions.\nRedirecting to login page...`,
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
      logger.error('Account restoration failed:', error);
      
      if (error.message?.includes('이미 활성화된')) {
        toast.error('Account is already active. Redirecting to login page...');
        
        // startTransition을 사용하여 안전하게 페이지 전환
        setTimeout(() => {
          import('react').then(({ startTransition }) => {
            startTransition(() => {
              router.push('/sign-in');
            });
          });
        }, 2000);
      } else {
        toast.error(
          `Failed to restore account.\nPlease contact the administrator.\nAdmin: 010-7656-7933 (Shin Sunwoong)`,
          { duration: 8000 }
        );
      }
    }
  };

  const handleCancelRestoreAccount = () => {
    setShowDeletedAccountModal(false);
    toast.error('Account restoration cancelled.');
  };
  
  const onSubmit = async (data: Step1FormValues) => {
    setIsLoading(true);
    try {
      // 전화번호에 국가코드 추가
      let phoneWithoutLeadingZero = data.phoneNumber;
      
      // 한국 번호의 경우 맨 앞 0 제거 (010 -> 10)
      if (data.countryCode === '+82' && phoneWithoutLeadingZero.startsWith('0')) {
        phoneWithoutLeadingZero = phoneWithoutLeadingZero.substring(1);
      }
      
      const fullPhone = `${data.countryCode}${phoneWithoutLeadingZero}`;
      
      // 입력된 이름 조합
      const inputFullName = data.middleName 
        ? `${data.firstName} ${data.middleName} ${data.lastName}`
        : `${data.firstName} ${data.lastName}`;
      
      // 먼저 deleted 포함해서 조회
      const userByPhoneWithDeleted = await getUserByPhoneIncludeDeleted(fullPhone);
      
      // 삭제된 계정이 있는지 체크
      if (userByPhoneWithDeleted && (userByPhoneWithDeleted.status as any) === 'deleted') {
        const originalName = (userByPhoneWithDeleted as any).originalName || 
                            userByPhoneWithDeleted.name.replace(/^\(삭제됨\)\s*/g, '');
        
        // foreignTeacher 정보로도 확인
        let namesMatch = false;
        
        if (originalName === inputFullName) {
          namesMatch = true;
        }
        
        if ((userByPhoneWithDeleted as any).foreignTeacher) {
          const ft = (userByPhoneWithDeleted as any).foreignTeacher;
          const dbFullName = ft.middleName
            ? `${ft.firstName} ${ft.middleName} ${ft.lastName}`
            : `${ft.firstName} ${ft.lastName}`;
          
          if (dbFullName === inputFullName) {
            namesMatch = true;
          }
        }
        
        if (namesMatch) {
          logger.info('🔄 Deleted account found - starting auto-restore process:', {
            userId: userByPhoneWithDeleted.id || userByPhoneWithDeleted.userId,
            name: originalName,
            phone: fullPhone,
          });
          
          setDeletedUserId(userByPhoneWithDeleted.id || userByPhoneWithDeleted.userId || '');
          setDeletedUserName(inputFullName);
          setShowDeletedAccountModal(true);
          setIsLoading(false);
          return;
        } else {
          logger.warn('⚠️ Deleted account but name mismatch:', {
            inputName: inputFullName,
            originalName,
          });
          toast.error(
            `The phone number is registered to a different person (${originalName}).\nPlease contact the administrator if this is your account.\nAdmin: 010-7656-7933 (Shin Sunwoong)`,
            { duration: 8000 }
          );
          setIsLoading(false);
          return;
        }
      }
      
      // 일반 사용자 조회 (deleted 제외)
      const userByPhone = await getUserByPhone(fullPhone);

      if (userByPhone) {
        const { status, role, name: existingName, foreignTeacher } = userByPhone;
        
        // 입력된 이름 조합
        const inputFullName = data.middleName 
          ? `${data.firstName} ${data.middleName} ${data.lastName}`
          : `${data.firstName} ${data.lastName}`;
        
        // 기존 사용자가 임시 원어민(foreign_temp)인 경우
        if (role === 'foreign_temp' && status === 'temp') {
          // 이름 비교 (DB에 저장된 name 또는 foreignTeacher 정보와 비교)
          let namesMatch = false;
          
          // 1. 기본 name 필드와 비교
          if (existingName === inputFullName) {
            namesMatch = true;
          }
          
          // 2. foreignTeacher 정보가 있으면 그것으로도 비교
          if (foreignTeacher) {
            const dbFullName = foreignTeacher.middleName
              ? `${foreignTeacher.firstName} ${foreignTeacher.middleName} ${foreignTeacher.lastName}`
              : `${foreignTeacher.firstName} ${foreignTeacher.lastName}`;
            
            if (dbFullName === inputFullName) {
              namesMatch = true;
            }
          }
          
          if (namesMatch) {
            // 이름이 일치하는 임시 원어민 → 기존 계정 활성화 안내
            toast.success(
              `Welcome back, ${inputFullName}!\nPlease continue your registration to activate your account.`,
              { duration: 5000 }
            );
            
            // startTransition을 사용하여 안전하게 페이지 전환
            const { startTransition } = await import('react');
            startTransition(() => {
              router.push(`/sign-up/foreign/account?firstName=${encodeURIComponent(data.firstName)}&lastName=${encodeURIComponent(data.lastName)}&middleName=${encodeURIComponent(data.middleName || '')}&countryCode=${encodeURIComponent(data.countryCode)}&phone=${encodeURIComponent(data.phoneNumber)}`);
            });
            return;
          } else {
            // 이름이 불일치 → 관리자가 다른 사람을 등록해둔 것
            toast.error(
              `The phone number is registered to a different person (${existingName || 'Unknown'}).\nPlease contact the administrator or use a different phone number.`,
              { duration: 6000 }
            );
            setIsLoading(false);
            return;
          }
        }
        
        // 이미 활성화된 원어민(foreign)인 경우
        if (role === 'foreign' && status === 'active') {
          toast.error('This account already exists. Please return to the login page.');
          setIsLoading(false);
          return;
        }
        
        // 임시 멘토인 경우
        if (role === 'mentor_temp' && status === 'temp') {
          toast.error(
            'This phone number is registered as a mentor. Please use the mentor sign-up page.',
            { duration: 5000 }
          );
          setIsLoading(false);
          return;
        }
        
        // 활성 멘토인 경우
        if (role === 'mentor' && status === 'active') {
          toast.error('This account already exists. Please return to the login page.');
          setIsLoading(false);
          return;
        }
        
        // 기타 상태 (일반 user 등) → 신규 가입 진행
        toast.success(
          `Welcome ${data.firstName}! We're honored to have you with SMIS. Please complete the remaining information.`,
          { duration: 3000 }
        );
        
        // startTransition을 사용하여 안전하게 페이지 전환
        const { startTransition } = await import('react');
        startTransition(() => {
          router.push(`/sign-up/foreign/account?firstName=${encodeURIComponent(data.firstName)}&lastName=${encodeURIComponent(data.lastName)}&middleName=${encodeURIComponent(data.middleName || '')}&countryCode=${encodeURIComponent(data.countryCode)}&phone=${encodeURIComponent(data.phoneNumber)}`);
        });
      } else {
        // 전화번호로 사용자를 찾을 수 없는 경우 → 신규 가입
        toast.success(
          `Welcome ${data.firstName}! We're honored to have you with SMIS. Please complete the remaining information.`,
          { duration: 3000 }
        );
        
        // startTransition을 사용하여 안전하게 페이지 전환
        const { startTransition } = await import('react');
        startTransition(() => {
          router.push(`/sign-up/foreign/account?firstName=${encodeURIComponent(data.firstName)}&lastName=${encodeURIComponent(data.lastName)}&middleName=${encodeURIComponent(data.middleName || '')}&countryCode=${encodeURIComponent(data.countryCode)}&phone=${encodeURIComponent(data.phoneNumber)}`);
        });
      }
    } catch (error) {
      logger.error('User information verification error:', error);
      toast.error('An error occurred while verifying user information.');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Layout noPadding>
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-4">
        <div className="max-w-lg w-full">
          {/* 헤더 */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-green-600 to-emerald-800 bg-clip-text text-transparent">
              Foreign Teacher Sign Up
            </h1>
            <p className="text-gray-600">Please enter your personal information</p>
          </div>

          <div className="bg-white shadow-xl rounded-2xl lg:px-10 px-6 pt-8 pb-10">
            {/* 진행 표시기 */}
            <ProgressSteps
              currentStep={1}
              totalSteps={2}
              steps={['Personal Info', 'Account']}
            />

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* First Name */}
              <FormInput
                label="First Name"
                type="text"
                placeholder="Enter your first name"
                error={errors.firstName?.message}
                {...register('firstName')}
              />
              
              {/* Last Name */}
              <FormInput
                label="Last Name"
                type="text"
                placeholder="Enter your last name"
                error={errors.lastName?.message}
                {...register('lastName')}
              />
              
              {/* Middle Name */}
              <FormInput
                label="Middle Name (Optional)"
                type="text"
                placeholder="Enter your middle name (optional)"
                error={errors.middleName?.message}
                {...register('middleName')}
              />

              {/* Phone Number */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  Phone Number
                </label>
                <div className="flex gap-3">
                  <select
                    className="px-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    {...register('countryCode')}
                  >
                    {countryCodes.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.flag} {item.code}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    className={`flex-1 px-4 py-3 border ${
                      errors.phoneNumber ? 'border-red-500' : 'border-gray-300'
                    } rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent`}
                    placeholder={getPhonePlaceholder(countryCode || '+82')}
                    {...register('phoneNumber')}
                  />
                </div>
                {errors.phoneNumber && (
                  <p className="mt-2 text-sm text-red-600">{errors.phoneNumber.message}</p>
                )}
              </div>
              
              {/* 버튼 그룹 */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    // startTransition을 사용하여 안전하게 페이지 전환
                    import('react').then(({ startTransition }) => {
                      startTransition(() => {
                        router.push('/sign-up');
                      });
                    });
                  }}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isLoading}
                  className="flex-1 bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800"
                >
                  Next
                </Button>
              </div>
            </form>
          </div>

          {/* 하단 링크 */}
          <div className="text-center mt-6">
            <p className="text-gray-600 text-sm">
              Already have an account?{' '}
              <button
                onClick={() => {
                  // startTransition을 사용하여 안전하게 페이지 전환
                  import('react').then(({ startTransition }) => {
                    startTransition(() => {
                      router.push('/sign-in');
                    });
                  });
                }}
                className="text-green-600 hover:text-green-700 font-semibold hover:underline"
              >
                Sign In
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Deleted Account Restore Modal */}
      {showDeletedAccountModal && (
        <Modal
          isOpen={showDeletedAccountModal}
          onClose={() => {}}
          title="Account Recovery"
        >
          <div className="p-4">
            <div className="mb-6">
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
              <p className="text-gray-700 text-center mb-4">
                We found your previous account for <strong className="text-lg">{deletedUserName}</strong>.
              </p>
              <p className="text-gray-600 text-sm text-center mb-4">
                This account was previously deleted. Would you like to restore it?
              </p>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
                <p className="text-green-800 font-semibold mb-2">✅ When you restore your account:</p>
                <ul className="text-green-700 space-y-1 ml-4">
                  <li>• Your previous evaluation scores and history will be restored</li>
                  <li>• Your application and work records will be restored</li>
                  <li>• A password reset email will be sent to you</li>
                  <li>• You can log in and use your account after restoration</li>
                </ul>
              </div>
            </div>
            <div className="flex gap-3">
              <Button 
                variant="secondary" 
                onClick={handleCancelRestoreAccount}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                variant="primary" 
                onClick={handleRestoreDeletedAccount}
                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-700"
              >
                Restore Account
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
