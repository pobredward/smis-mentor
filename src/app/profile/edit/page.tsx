'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import DaumPostcode, { Address } from 'react-daum-postcode';
import { useAuth } from '@/contexts/AuthContext';
import { updateUser, getUserByEmail, getUserByPhone, uploadProfileImage } from '@/lib/firebaseService';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import ImageCropper from '@/components/common/ImageCropper';
import toast from 'react-hot-toast';

const profileSchema = z.object({
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다.'),
  phoneNumber: z.string().min(10, '유효한 휴대폰 번호를 입력해주세요.').max(11, '유효한 휴대폰 번호를 입력해주세요.'),
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  address: z.string().min(1, '주소를 입력해주세요.'),
  addressDetail: z.string().min(1, '상세 주소를 입력해주세요.'),
  gender: z.enum(['M', 'F'], {
    errorMap: () => ({ message: '성별을 선택해주세요.' }),
  }),
  selfIntroduction: z.string().max(500, '자기소개는 500자 이내로 작성해주세요.').optional(),
  jobMotivation: z.string().max(500, '지원 동기는 500자 이내로 작성해주세요.').optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function EditProfilePage() {
  const { userData, refreshUserData } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPostcode, setShowPostcode] = useState(false);
  const [emailExists, setEmailExists] = useState(false);
  const [phoneExists, setPhoneExists] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      phoneNumber: '',
      email: '',
      address: '',
      addressDetail: '',
      gender: undefined,
      selfIntroduction: '',
      jobMotivation: '',
    },
  });

  // 현재 입력된 이메일과 전화번호를 실시간으로 감시
  const currentEmail = watch('email');
  const currentPhone = watch('phoneNumber');
  const currentSelfIntro = watch('selfIntroduction') || '';
  const currentJobMotivation = watch('jobMotivation') || '';

  // 사용자 데이터로 폼 초기화
  useEffect(() => {
    if (userData) {
      reset({
        name: userData.name,
        phoneNumber: userData.phoneNumber,
        email: userData.email,
        address: userData.address,
        addressDetail: userData.addressDetail,
        gender: userData.gender as 'M' | 'F',
        selfIntroduction: userData.selfIntroduction,
        jobMotivation: userData.jobMotivation,
      });
      
      if (userData.profileImage) {
        setProfileImageUrl(userData.profileImage);
      }
    }
  }, [userData, reset]);

  // 이미지 업로드 핸들러
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];
    
    if (!validTypes.includes(file.type)) {
      toast.error('유효한 이미지 파일을 선택해주세요.');
      return;
    }
    
    setSelectedFile(file);
    setShowCropper(true);
  };
  
  // 크롭 완료 핸들러
  const handleCropComplete = async (croppedFile: File) => {
    setShowCropper(false);
    setIsUploading(true);
    
    try {
      if (!userData) return;
      
      const downloadURL = await uploadProfileImage(userData.userId, croppedFile);
      setProfileImageUrl(downloadURL);
      
      // 사용자 데이터 갱신
      await refreshUserData();
      
      toast.success('프로필 이미지가 업로드되었습니다.');
    } catch (error) {
      console.error('이미지 업로드 오류:', error);
      toast.error('이미지 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
    }
  };
  
  // 이미지 크롭 취소
  const handleCropCancel = () => {
    setShowCropper(false);
    setSelectedFile(null);
  };

  // 이메일 입력 필드에서 focus가 벗어났을 때 중복 확인
  const handleEmailBlur = async () => {
    if (currentEmail && currentEmail !== userData?.email && !errors.email) {
      try {
        const existingUser = await getUserByEmail(currentEmail);
        setEmailExists(!!existingUser);
      } catch (error) {
        console.error('이메일 중복 확인 오류:', error);
      }
    } else {
      setEmailExists(false);
    }
  };

  // 전화번호 입력 필드에서 focus가 벗어났을 때 중복 확인
  const handlePhoneBlur = async () => {
    if (currentPhone && currentPhone !== userData?.phoneNumber && !errors.phoneNumber) {
      try {
        const existingUser = await getUserByPhone(currentPhone);
        setPhoneExists(!!existingUser);
      } catch (error) {
        console.error('전화번호 중복 확인 오류:', error);
      }
    } else {
      setPhoneExists(false);
    }
  };

  const handleComplete = (data: Address) => {
    setValue('address', data.address, { shouldValidate: true });
    setShowPostcode(false);
  };

  const onSubmit = async (data: ProfileFormValues) => {
    if (!userData) return;
    
    setIsLoading(true);
    try {
      // 이메일 또는 전화번호 중복 마지막 확인
      if (data.email !== userData.email) {
        const existingEmail = await getUserByEmail(data.email);
        if (existingEmail) {
          setEmailExists(true);
          setIsLoading(false);
          return;
        }
      }

      if (data.phoneNumber !== userData.phoneNumber) {
        const existingPhone = await getUserByPhone(data.phoneNumber);
        if (existingPhone) {
          setPhoneExists(true);
          setIsLoading(false);
          return;
        }
      }

      // 사용자 정보 업데이트
      await updateUser(userData.userId, {
        name: data.name,
        phoneNumber: data.phoneNumber,
        email: data.email,
        address: data.address,
        addressDetail: data.addressDetail,
        gender: data.gender,
        selfIntroduction: data.selfIntroduction || '',
        jobMotivation: data.jobMotivation || '',
      });

      // 사용자 데이터 갱신
      await refreshUserData();

      toast.success('프로필이 성공적으로 업데이트되었습니다.');
      router.push('/profile');
    } catch (error) {
      console.error('프로필 업데이트 오류:', error);
      toast.error('프로필 업데이트 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!userData) {
    return (
      <Layout requireAuth>
        <div className="max-w-2xl mx-auto text-center py-8">
          <h1 className="text-2xl font-bold mb-4">로그인이 필요합니다</h1>
          <p className="text-gray-600 mb-6">프로필 정보를 수정하려면 로그인해 주세요.</p>
          <Button
            variant="primary"
            onClick={() => router.push('/sign-in')}
          >
            로그인
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout requireAuth>
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">프로필 수정</h1>
          <Button
            variant="outline"
            onClick={() => router.push('/profile')}
          >
            취소
          </Button>
        </div>

        {showCropper && selectedFile ? (
          <ImageCropper
            file={selectedFile}
            onCropComplete={handleCropComplete}
            onCancel={handleCropCancel}
            aspectRatio={1}
          />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow-md rounded-lg p-6">
            <div className="mb-6">
              {/* 프로필 이미지 업로드 섹션 */}
              <div className="w-full mb-6 flex flex-col items-center">
                <label className="block text-gray-700 text-sm font-medium mb-3">프로필 이미지</label>
                <div className="mb-3 relative">
                  {profileImageUrl ? (
                    <img 
                      src={profileImageUrl} 
                      alt="프로필" 
                      className="w-32 h-32 object-cover object-center rounded-md border border-gray-300"
                      style={{ aspectRatio: '1 / 1' }}
                    />
                  ) : (
                    <div className="w-32 h-32 bg-gray-200 rounded-md flex items-center justify-center">
                      <span className="text-gray-500 text-5xl">{userData.name.charAt(0)}</span>
                    </div>
                  )}
                  
                  {isUploading && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 rounded-md flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
                    </div>
                  )}
                </div>
                
                <div>
                  <input
                    type="file"
                    id="profile-image"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <label
                    htmlFor="profile-image"
                    className="cursor-pointer px-4 py-2 bg-gray-100 text-gray-700 rounded border border-gray-300 hover:bg-gray-200 transition"
                  >
                    이미지 변경
                  </label>
                </div>
              </div>

              <FormInput
                label="이름"
                type="text"
                placeholder="이름을 입력하세요"
                error={errors.name?.message}
                {...register('name')}
              />

              <FormInput
                label="이메일"
                type="email"
                placeholder="이메일 주소를 입력하세요"
                error={emailExists ? '이미 사용 중인 이메일입니다.' : errors.email?.message}
                {...register('email', {
                  onBlur: handleEmailBlur
                })}
              />

              <FormInput
                label="휴대폰 번호"
                type="tel"
                placeholder="'-' 없이 입력하세요"
                error={phoneExists ? '이미 사용 중인 휴대폰 번호입니다.' : errors.phoneNumber?.message}
                {...register('phoneNumber', {
                  onBlur: handlePhoneBlur
                })}
              />

              <div className="w-full mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-1">주소</label>
                <div className="flex mb-2">
                  <input
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="주소 검색을 클릭하세요"
                    {...register('address')}
                  />
                  <Button
                    type="button"
                    className="ml-2"
                    variant="secondary"
                    onClick={() => setShowPostcode(!showPostcode)}
                  >
                    주소 검색
                  </Button>
                </div>
                {showPostcode && (
                  <div className="mb-2 border border-gray-300 rounded-md">
                    <DaumPostcode onComplete={handleComplete} />
                  </div>
                )}
                {errors.address && <p className="mt-1 text-sm text-red-600">{errors.address.message}</p>}
              </div>

              <FormInput
                label="상세 주소"
                type="text"
                placeholder="상세 주소를 입력하세요"
                error={errors.addressDetail?.message}
                {...register('addressDetail')}
              />

              <div className="w-full mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-1">성별</label>
                <div className="flex space-x-4">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="gender-male"
                      value="M"
                      className="h-4 w-4 text-blue-600 border-gray-300"
                      {...register('gender')}
                    />
                    <label htmlFor="gender-male" className="ml-2 block text-sm text-gray-700">
                      남성
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="gender-female"
                      value="F"
                      className="h-4 w-4 text-blue-600 border-gray-300"
                      {...register('gender')}
                    />
                    <label htmlFor="gender-female" className="ml-2 block text-sm text-gray-700">
                      여성
                    </label>
                  </div>
                </div>
                {errors.gender && <p className="mt-1 text-sm text-red-600">{errors.gender.message}</p>}
              </div>

              <div className="w-full mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-1">자기소개</label>
                <div className="relative">
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 h-32"
                    placeholder="간단한 자기소개를 입력하세요"
                    maxLength={500}
                    {...register('selfIntroduction')}
                  />
                  <div className="absolute bottom-2 right-2 text-xs text-gray-500">
                    {currentSelfIntro.length}/500자
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">자기소개는 500자 이내로 작성해주세요.</p>
              </div>

              <div className="w-full mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-1">지원 동기</label>
                <div className="relative">
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 h-32"
                    placeholder="업무 지원 동기를 입력하세요"
                    maxLength={500}
                    {...register('jobMotivation')}
                  />
                  <div className="absolute bottom-2 right-2 text-xs text-gray-500">
                    {currentJobMotivation.length}/500자
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">지원 동기는 500자 이내로 작성해주세요.</p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                isLoading={isLoading}
                disabled={!isDirty && !profileImageUrl || emailExists || phoneExists}
              >
                저장하기
              </Button>
            </div>
          </form>
        )}
      </div>
    </Layout>
  );
} 