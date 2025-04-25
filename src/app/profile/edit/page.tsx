'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { PartTimeJob, User } from '@/types';

const partTimeJobSchema = z.object({
  period: z.string().min(1, '기간을 입력해주세요.'),
  companyName: z.string().min(1, '회사명을 입력해주세요.'),
  position: z.string().min(1, '담당을 입력해주세요.'),
  description: z.string().min(1, '업무 내용을 입력해주세요.'),
});

const profileSchema = z.object({
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다.'),
  age: z.number({
    required_error: '나이를 입력해주세요.',
    invalid_type_error: '유효한 숫자를 입력해주세요.',
  }).min(15, '최소 15세 이상이어야 합니다.').max(100, '유효한 나이를 입력해주세요.'),
  phoneNumber: z.string().min(10, '유효한 휴대폰 번호를 입력해주세요.').max(11, '유효한 휴대폰 번호를 입력해주세요.'),
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  address: z.string().min(1, '주소를 입력해주세요.'),
  addressDetail: z.string().min(1, '상세 주소를 입력해주세요.'),
  gender: z.enum(['M', 'F'], {
    errorMap: () => ({ message: '성별을 선택해주세요.' }),
  }),
  selfIntroduction: z.string().max(500, '자기소개는 500자 이내로 작성해주세요.').optional(),
  jobMotivation: z.string().max(500, '지원 동기는 500자 이내로 작성해주세요.').optional(),
  university: z.string().min(1, '학교명을 입력해주세요.'),
  grade: z.number({
    required_error: '학년을 선택해주세요.',
    invalid_type_error: '학년을 선택해주세요.',
  }).min(1, '학년을 선택해주세요.').max(6, '유효한 학년을 선택해주세요.'),
  isOnLeave: z.boolean(),
  major1: z.string().min(1, '전공을 입력해주세요.'),
  major2: z.string().optional(),
  partTimeJobs: z.array(partTimeJobSchema).optional(),
  referralPath: z.string().optional(),
  referrerName: z.string().optional(),
  otherReferralDetail: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function EditProfilePage() {
  const { userData, refreshUserData } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const section = searchParams.get('section') || 'all';
  const [isLoading, setIsLoading] = useState(false);
  const [showPostcode, setShowPostcode] = useState(false);
  const [emailExists, setEmailExists] = useState(false);
  const [phoneExists, setPhoneExists] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [partTimeJobs, setPartTimeJobs] = useState<PartTimeJob[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      age: undefined,
      phoneNumber: '',
      email: '',
      address: '',
      addressDetail: '',
      gender: undefined,
      selfIntroduction: '',
      jobMotivation: '',
      university: '',
      grade: undefined,
      isOnLeave: false,
      major1: '',
      major2: '',
      partTimeJobs: [],
      referralPath: '',
      referrerName: '',
      otherReferralDetail: '',
    },
  });

  // 현재 입력된 이메일과 전화번호를 실시간으로 감시
  const currentEmail = watch('email');
  const currentPhone = watch('phoneNumber');
  const currentSelfIntro = watch('selfIntroduction') || '';
  const currentJobMotivation = watch('jobMotivation') || '';

  // 알바 & 멘토링 경력 추가
  const addPartTimeJob = () => {
    const newJob: PartTimeJob = {
      period: '',
      companyName: '',
      position: '',
      description: '',
    };
    setPartTimeJobs([...partTimeJobs, newJob]);
    if (section === 'experience') {
      setValue('partTimeJobs', [...partTimeJobs, newJob]);
    }
  };

  // 알바 & 멘토링 경력 삭제
  const removePartTimeJob = (index: number) => {
    const updatedJobs = [...partTimeJobs];
    updatedJobs.splice(index, 1);
    setPartTimeJobs(updatedJobs);
    if (section === 'experience') {
      setValue('partTimeJobs', updatedJobs);
    }
  };

  // 알바 & 멘토링 경력 업데이트
  const updatePartTimeJob = (index: number, field: keyof PartTimeJob, value: string) => {
    const updatedJobs = [...partTimeJobs];
    updatedJobs[index] = { ...updatedJobs[index], [field]: value };
    setPartTimeJobs(updatedJobs);
    if (section === 'experience') {
      setValue('partTimeJobs', updatedJobs);
    }
  };

  // 사용자 데이터로 폼 초기화
  useEffect(() => {
    if (userData) {
      // referralPath 값 처리
      let referralPathValue = userData.referralPath || '';
      let otherReferralDetail = '';
      
      // 기타 경로인 경우 분리
      if (referralPathValue && referralPathValue.startsWith('기타: ')) {
        otherReferralDetail = referralPathValue.substring(4).trim();
        referralPathValue = '기타';
      }
      
      reset({
        name: userData.name,
        age: userData.age || undefined,
        phoneNumber: userData.phoneNumber,
        email: userData.email,
        address: userData.address,
        addressDetail: userData.addressDetail,
        gender: userData.gender as 'M' | 'F',
        selfIntroduction: userData.selfIntroduction,
        jobMotivation: userData.jobMotivation,
        university: userData.university || '',
        grade: userData.grade || undefined,
        isOnLeave: userData.isOnLeave || false,
        major1: userData.major1 || '',
        major2: userData.major2 || '',
        partTimeJobs: userData.partTimeJobs || [],
        referralPath: referralPathValue,
        referrerName: userData.referrerName || '',
        otherReferralDetail: otherReferralDetail,
      });
      
      if (userData.profileImage) {
        setProfileImageUrl(userData.profileImage);
      }
      
      // 알바 & 멘토링 경력 설정
      setPartTimeJobs(userData.partTimeJobs || []);
      
      // 중복 상태 초기화
      setEmailExists(false);
      setPhoneExists(false);
    }
  }, [userData, reset]);

  // 폼 제출 실패 시 중복 상태 초기화
  useEffect(() => {
    const subscription = watch((_, { name }) => {
      // 이메일이나 전화번호 필드가 변경되면 중복 상태 초기화
      if (name === 'email') {
        setEmailExists(false);
      }
      if (name === 'phoneNumber') {
        setPhoneExists(false);
      }
    });
    
    return () => subscription.unsubscribe();
  }, [watch]);

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
    setUploadProgress(0);
    
    try {
      if (!userData) return;
      
      // 파일 크기 확인 및 압축 처리
      let fileToUpload = croppedFile;
      const fileSizeMB = croppedFile.size / (1024 * 1024);
      
      if (fileSizeMB > 1) {
        // 압축 비율 계산 (2의 배수로)
        let compressionRatio = 1;
        while (fileSizeMB / compressionRatio > 1) {
          compressionRatio *= 2;
        }
        
        // 이미지 압축 처리
        const compressedFile = await compressImage(croppedFile, 1 / compressionRatio);
        fileToUpload = compressedFile;
      }
      
      const downloadURL = await uploadProfileImage(
        userData.userId, 
        fileToUpload, 
        (progress) => {
          setUploadProgress(progress);
        }
      );
      
      setProfileImageUrl(downloadURL);
      
      // 사용자 데이터 갱신
      await refreshUserData();
      
      toast.success('프로필 이미지가 업로드되었습니다.');
    } catch {
      toast.error('이미지 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };
  
  // 이미지 압축 함수
  const compressImage = (file: File, quality: number): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 컨텍스트를 가져올 수 없습니다.'));
            return;
          }
          
          // 원본 크기 유지
          canvas.width = img.width;
          canvas.height = img.height;
          
          // 이미지 그리기
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          // 압축된 이미지 가져오기
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('이미지 압축에 실패했습니다.'));
              return;
            }
            
            // 새 파일 생성
            const compressedFile = new File(
              [blob], 
              file.name, 
              { type: file.type, lastModified: Date.now() }
            );
            
            resolve(compressedFile);
          }, file.type, quality);
        };
        
        img.onerror = () => {
          reject(new Error('이미지 로드에 실패했습니다.'));
        };
      };
      
      reader.onerror = () => {
        reject(new Error('파일 읽기에 실패했습니다.'));
      };
    });
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
        if (existingUser && existingUser.userId !== userData?.userId) {
          setEmailExists(true);
        } else {
          setEmailExists(false);
        }
      } catch (error) {
        console.error("이메일 검증 중 오류 발생:", error);
        setEmailExists(false); // 오류 발생 시 저장 버튼이 비활성화되지 않도록 함
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
        if (existingUser && existingUser.userId !== userData?.userId) {
          setPhoneExists(true);
        } else {
          setPhoneExists(false);
        }
      } catch (error) {
        console.error("전화번호 검증 중 오류 발생:", error);
        setPhoneExists(false); // 오류 발생 시 저장 버튼이 비활성화되지 않도록 함
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
        if (existingEmail && existingEmail.userId !== userData.userId) {
          setEmailExists(true);
          setIsLoading(false);
          return;
        }
      }

      if (data.phoneNumber !== userData.phoneNumber) {
        const existingPhone = await getUserByPhone(data.phoneNumber);
        if (existingPhone && existingPhone.userId !== userData.userId) {
          setPhoneExists(true);
          setIsLoading(false);
          return;
        }
      }

      // 업데이트할 데이터 준비
      const updateData: Partial<User> = {};
      
      // 섹션에 따라 업데이트할 데이터 선택
      if (section === 'all' || section === 'personal') {
        updateData.name = data.name;
        
        // 정확한 나이 값 설정
        if (data.age !== undefined) {
          // 나이 값이 변경된 경우에만 설정하고, 변환 과정 확인
          updateData.age = parseInt(String(data.age), 10);
        }
        
        updateData.phoneNumber = data.phoneNumber;
        updateData.email = data.email;
        updateData.address = data.address;
        updateData.addressDetail = data.addressDetail;
        updateData.gender = data.gender;
        updateData.selfIntroduction = data.selfIntroduction || '';
        updateData.jobMotivation = data.jobMotivation || '';
        updateData.referralPath = data.referralPath || '';
        updateData.referrerName = data.referrerName || '';
        
        // 기타 경로 상세 정보 처리
        if (data.referralPath === '기타' && data.otherReferralDetail) {
          updateData.referralPath = `기타: ${data.otherReferralDetail}`;
        }
      }
      
      if (section === 'all' || section === 'experience') {
        updateData.partTimeJobs = partTimeJobs;
      }
      
      if (section === 'all' || section === 'education') {
        updateData.university = data.university;
        updateData.grade = data.grade;
        updateData.isOnLeave = data.isOnLeave;
        updateData.major1 = data.major1;
        updateData.major2 = data.major2 || '';
      }

      // 사용자 정보 업데이트
      await updateUser(userData.userId, updateData);

      // 사용자 데이터 갱신
      await refreshUserData();

      toast.success('프로필이 성공적으로 업데이트되었습니다.');
    } catch {
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
          <div className="flex items-center">
            <Button
              variant="secondary"
              size="sm"
              className="mr-3 text-blue-600 hover:text-blue-800 border-none shadow-none"
              onClick={() => router.back()}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </Button>
            <h1 className="text-2xl font-bold">
              {section === 'personal' ? '상세 정보 수정' : 
               section === 'experience' ? '알바 & 멘토링 경력 수정' : 
               section === 'education' ? '학교 정보 수정' : 
               '프로필 수정'}
            </h1>
          </div>
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
              {(section === 'all' || section === 'personal') && (
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
                      <div className="absolute inset-0 bg-black bg-opacity-50 rounded-md flex flex-col items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white mb-2"></div>
                        <span className="text-white text-sm font-medium">{uploadProgress.toFixed(0)}%</span>
                        <div className="w-4/5 h-2 bg-gray-200 rounded-full mt-2">
                          <div 
                            className="h-full bg-blue-500 rounded-full" 
                            style={{ width: `${uploadProgress}%` }}
                          ></div>
                        </div>
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
              )}

              {/* 개인 정보 섹션 */}
              {(section === 'all' || section === 'personal') && (
                <>
                  <FormInput
                    label="이름"
                    type="text"
                    placeholder="이름을 입력하세요"
                    error={errors.name?.message}
                    {...register('name')}
                  />

                  <FormInput
                    label="나이"
                    type="number"
                    placeholder="나이를 입력하세요"
                    error={errors.age?.message}
                    {...register('age', { valueAsNumber: true })}
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
                    <label className="block text-gray-700 text-sm font-medium mb-1">가입 경로</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      {...register('referralPath')}
                    >
                      <option value="">선택해주세요</option>
                      <option value="에브리타임">에브리타임</option>
                      <option value="학교 커뮤니티">학교 커뮤니티</option>
                      <option value="링커리어">링커리어</option>
                      <option value="캠퍼스픽">캠퍼스픽</option>
                      <option value="인스타그램">인스타그램</option>
                      <option value="페이스북">페이스북</option>
                      <option value="구글/네이버 등 검색">구글/네이버 등 검색</option>
                      <option value="지인 소개">지인 소개</option>
                      <option value="기타">기타</option>
                    </select>
                  </div>

                  {watch('referralPath') === '지인 소개' && (
                    <div className="w-full mb-4">
                      <FormInput
                        label="소개해 주신 분의 이름"
                        type="text"
                        placeholder="지인의 이름을 입력해주세요"
                        error={errors.referrerName?.message}
                        {...register('referrerName')}
                      />
                    </div>
                  )}

                  {watch('referralPath') === '기타' && (
                    <div className="w-full mb-4">
                      <FormInput
                        label="기타 경로 상세"
                        type="text"
                        placeholder="어떤 경로로 알게 되셨는지 입력해주세요"
                        {...register('otherReferralDetail')}
                      />
                    </div>
                  )}

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
                </>
              )}

              {/* 알바 & 멘토링 경력 */}
              {(section === 'all' || section === 'experience') && (
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      알바 & 멘토링 경력
                    </label>
                    <button
                      type="button"
                      onClick={addPartTimeJob}
                      className="flex items-center text-sm text-blue-600 hover:text-blue-800"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      경력 추가
                    </button>
                  </div>
                  
                  {partTimeJobs.length === 0 ? (
                    <div className="py-4 px-3 border border-dashed border-gray-300 rounded-md text-center text-gray-500">
                      알바 & 멘토링 경력을 추가해보세요.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {partTimeJobs.map((job, index) => (
                        <div key={index} className="border border-gray-200 rounded-md p-4 bg-gray-50 relative">
                          <button
                            type="button"
                            onClick={() => removePartTimeJob(index)}
                            className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
                            aria-label="삭제"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                기간
                              </label>
                              <input
                                type="text"
                                value={job.period}
                                onChange={(e) => updatePartTimeJob(index, 'period', e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="2022.03 - 2022.09"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                회사명
                              </label>
                              <input
                                type="text"
                                value={job.companyName}
                                onChange={(e) => updatePartTimeJob(index, 'companyName', e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="회사명"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                담당
                              </label>
                              <input
                                type="text"
                                value={job.position}
                                onChange={(e) => updatePartTimeJob(index, 'position', e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="직무/담당"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                업무 내용
                              </label>
                              <input
                                type="text"
                                value={job.description}
                                onChange={(e) => updatePartTimeJob(index, 'description', e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="간략한 업무 내용"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 학교 정보 섹션 */}
              {(section === 'all' || section === 'education') && (
                <div className={`${section !== 'education' ? 'border-t border-gray-200 pt-4 mt-6' : ''} mb-4`}>
                  {section !== 'education' && <h3 className="text-lg font-medium text-gray-900 mb-4">학교 정보</h3>}
                  
                  <FormInput
                    label="학교"
                    type="text"
                    placeholder="학교명을 입력하세요"
                    error={errors.university?.message}
                    {...register('university')}
                  />
                  
                  <div className="w-full mb-4">
                    <label className="block text-gray-700 text-sm font-medium mb-1">학년</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      {...register('grade', { valueAsNumber: true })}
                    >
                      <option value="">학년 선택</option>
                      <option value="1">1학년</option>
                      <option value="2">2학년</option>
                      <option value="3">3학년</option>
                      <option value="4">4학년</option>
                      <option value="5">5학년</option>
                      <option value="6">졸업생</option>
                    </select>
                    {errors.grade && <p className="mt-1 text-sm text-red-600">{errors.grade.message}</p>}
                  </div>

                  <div className="w-full mb-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                        id="isOnLeave"
                        {...register('isOnLeave')}
                      />
                      <label htmlFor="isOnLeave" className="ml-2 block text-sm text-gray-700">
                        현재 휴학 중
                      </label>
                    </div>
                  </div>

                  <FormInput
                    label="전공 (1전공)"
                    type="text"
                    placeholder="1전공을 입력하세요"
                    error={errors.major1?.message}
                    {...register('major1')}
                  />

                  <FormInput
                    label="전공 (2전공/부전공)"
                    type="text"
                    placeholder="2전공이 있는 경우 입력하세요 (선택사항)"
                    error={errors.major2?.message}
                    {...register('major2')}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end">
              {/* 디버깅용 정보 - emailExists, phoneExists 상태 확인 */}
              {process.env.NODE_ENV === 'development' && (
                <div className="mr-4 text-xs text-gray-500">
                  <div>Email exists: {emailExists ? 'true' : 'false'}</div>
                  <div>Phone exists: {phoneExists ? 'true' : 'false'}</div>
                </div>
              )}
              <Button
                type="submit"
                variant="primary"
                isLoading={isLoading}
                disabled={emailExists || phoneExists}
                onClick={() => {
                  if (emailExists || phoneExists) {
                    console.log('저장 버튼 비활성화 상태:', { emailExists, phoneExists });
                    if (emailExists) {
                      toast.error('이미 사용 중인 이메일입니다. 다른 이메일을 입력해주세요.');
                    }
                    if (phoneExists) {
                      toast.error('이미 사용 중인 전화번호입니다. 다른 전화번호를 입력해주세요.');
                    }
                  }
                }}
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