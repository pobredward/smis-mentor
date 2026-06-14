'use client';
import { logger } from '@smis-mentor/shared';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import DaumPostcode, { Address } from 'react-daum-postcode';
import { useAuth } from '@/contexts/AuthContext';
import { updateUser, getUserByEmail, getUserByPhone, uploadProfileImage } from '@/lib/firebaseService';
import { updateGeocodeIfAddressChanged } from '@/lib/geocoding';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import ImageCropper from '@/components/common/ImageCropper';
import toast from 'react-hot-toast';
import { PartTimeJob, User } from '@/types';
import { getPhonePlaceholder, calculateAgeFromDateOfBirth } from '@smis-mentor/shared';
import { authenticatedPost } from '@/lib/apiClient';
import {
  FaUser, FaMapMarkerAlt, FaIdCard, FaGraduationCap, FaBriefcase,
  FaCamera, FaShareAlt, FaLock, FaEye, FaEyeSlash,
} from 'react-icons/fa';

const countryCodes = [
  { code: '+82', country: 'South Korea', flag: '🇰🇷' },
  { code: '+1', country: 'USA/Canada', flag: '🇺🇸' },
  { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
  { code: '+353', country: 'Ireland', flag: '🇮🇪' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
  { code: '+64', country: 'New Zealand', flag: '🇳🇿' },
  { code: '+27', country: 'South Africa', flag: '🇿🇦' },
];

const partTimeJobSchema = z.object({
  period: z.string().min(1, '기간을 입력해주세요.'),
  companyName: z.string().min(1, '회사명을 입력해주세요.'),
  position: z.string().min(1, '담당을 입력해주세요.'),
  description: z.string().optional(),
});

const profileSchemaBase = z.object({
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다.'),
  phoneNumber: z.string().min(8, '유효한 휴대폰 번호를 입력해주세요.'),
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  address: z.string().optional(),
  addressDetail: z.string().optional(),
  gender: z.enum(['M', 'F'], { errorMap: () => ({ message: '성별을 선택해주세요.' }) }),
  selfIntroduction: z.string().max(500).optional(),
  jobMotivation: z.string().max(500).optional(),
  university: z.string().optional(),
  grade: z.number().min(1).max(6).optional(),
  isOnLeave: z.boolean().nullable().optional(),
  major1: z.string().optional(),
  major2: z.string().optional(),
  partTimeJobs: z.array(partTimeJobSchema).optional(),
  referralPath: z.string().optional(),
  referrerName: z.string().optional(),
  otherReferralDetail: z.string().optional(),
  rrnFront: z.string().optional(),
  rrnLast: z.string().optional(),
});

const profileSchemaMentor = profileSchemaBase.extend({
  address: z.string().min(1, '주소를 입력해주세요.'),
  addressDetail: z.string().min(1, '상세 주소를 입력해주세요.'),
  university: z.string().min(1, '학교명을 입력해주세요.'),
  grade: z.number({ required_error: '학년을 선택해주세요.', invalid_type_error: '학년을 선택해주세요.' }).min(1).max(6),
  major1: z.string().min(1, '전공을 입력해주세요.'),
});

const profileSchemaForeign = profileSchemaBase.extend({
  name: z.string().optional(),
  firstName: z.string().min(1, 'Please enter your First Name.'),
  lastName: z.string().min(1, 'Please enter your Last Name.'),
  middleName: z.string().optional(),
  dateOfBirth: z.string().optional().refine(
    (v) => {
      if (!v) return true;
      const d = new Date(v);
      return !isNaN(d.getTime()) && d <= new Date() && d >= new Date('1900-01-01');
    },
    { message: 'Please enter a valid date of birth.' }
  ),
});

type MentorFormValues = z.infer<typeof profileSchemaMentor>;
type ForeignFormValues = z.infer<typeof profileSchemaForeign>;
type ProfileFormValues = MentorFormValues & Partial<ForeignFormValues>;

/* 섹션 카드 래퍼 컴포넌트 */
function SectionCard({
  icon,
  title,
  children,
  accent = 'blue',
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  accent?: 'blue' | 'green' | 'purple' | 'orange' | 'red';
}) {
  const accentMap = {
    blue: 'border-blue-400 text-blue-600',
    green: 'border-green-400 text-green-600',
    purple: 'border-purple-400 text-purple-600',
    orange: 'border-orange-400 text-orange-600',
    red: 'border-red-400 text-red-600',
  };
  const accent$ = accentMap[accent];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-3">
      <div className={`flex items-center gap-2 px-4 py-2.5 border-l-4 bg-gray-50 ${accent$}`}>
        <span className="text-sm">{icon}</span>
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      </div>
      <div className="px-4 py-3 space-y-0">{children}</div>
    </div>
  );
}

export default function EditProfilePage() {
  const { userData, refreshUserData } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const section = searchParams.get('section') || 'all';
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';

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
  const [countryCode, setCountryCode] = useState('+82');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showRrnLast, setShowRrnLast] = useState(false);
  const [hasExistingRRN, setHasExistingRRN] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeSchema: any = isForeign ? profileSchemaForeign : profileSchemaMentor;
  const {
    register, handleSubmit, setValue, watch, reset, control,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(activeSchema),
    defaultValues: {
      name: '', firstName: '', lastName: '', middleName: '',
      phoneNumber: '', email: '',
      address: '', addressDetail: '',
      gender: undefined,
      selfIntroduction: '', jobMotivation: '',
      university: '', grade: undefined, isOnLeave: false,
      major1: '', major2: '',
      partTimeJobs: [],
      referralPath: '', referrerName: '', otherReferralDetail: '',
      rrnFront: '', rrnLast: '',
      dateOfBirth: '',
    },
  });

  const currentEmail = watch('email');
  const currentPhone = watch('phoneNumber');
  const currentSelfIntro = watch('selfIntroduction') || '';
  const currentJobMotivation = watch('jobMotivation') || '';
  const watchedRrnFront = watch('rrnFront') || '';
  const watchedRrnLast = watch('rrnLast') || '';

  const addPartTimeJob = () => {
    const updated = [...partTimeJobs, { period: '', companyName: '', position: '', description: '' }];
    setPartTimeJobs(updated);
    setValue('partTimeJobs', updated, { shouldValidate: false });
  };
  const removePartTimeJob = (index: number) => {
    const updated = partTimeJobs.filter((_, i) => i !== index);
    setPartTimeJobs(updated);
    setValue('partTimeJobs', updated, { shouldValidate: true });
  };
  const updatePartTimeJob = (index: number, field: keyof PartTimeJob, value: string) => {
    const updated = partTimeJobs.map((j, i) => i === index ? { ...j, [field]: value } : j);
    setPartTimeJobs(updated);
    setValue('partTimeJobs', updated, { shouldValidate: false });
  };

  useEffect(() => {
    if (!userData) return;
    const isForeignUser = userData.role === 'foreign' || userData.role === 'foreign_temp';

    let extractedCountryCode = '+82';
    let phoneWithoutCode = userData.phoneNumber || '';
    if (isForeignUser && userData.phoneNumber) {
      const foundCode = countryCodes.find(cc => userData.phoneNumber?.startsWith(cc.code));
      if (foundCode) {
        extractedCountryCode = foundCode.code;
        phoneWithoutCode = userData.phoneNumber.substring(foundCode.code.length);
        if (extractedCountryCode === '+82' && phoneWithoutCode.length === 10 && !phoneWithoutCode.startsWith('0')) {
          phoneWithoutCode = '0' + phoneWithoutCode;
        }
      }
    }
    setCountryCode(extractedCountryCode);

    let referralPathValue = userData.referralPath || '';
    let otherReferralDetail = '';
    if (referralPathValue.startsWith('기타: ')) {
      otherReferralDetail = referralPathValue.substring(4).trim();
      referralPathValue = '기타';
    }

    const hasRRN = !!(userData.rrnFront && (userData.rrnLastEncrypted || userData.rrnLast));
    setHasExistingRRN(hasRRN);

    reset({
      name: userData.name,
      firstName: userData.foreignTeacher?.firstName || '',
      lastName: userData.foreignTeacher?.lastName || '',
      middleName: userData.foreignTeacher?.middleName || '',
      phoneNumber: phoneWithoutCode,
      email: userData.email,
      address: userData.address,
      addressDetail: userData.addressDetail,
      gender: userData.gender as 'M' | 'F',
      selfIntroduction: userData.selfIntroduction,
      jobMotivation: userData.jobMotivation,
      university: userData.university || '',
      grade: userData.grade ? Number(userData.grade) : undefined,
      isOnLeave: userData.isOnLeave || false,
      major1: userData.major1 || '',
      major2: userData.major2 || '',
      partTimeJobs: userData.partTimeJobs || [],
      referralPath: referralPathValue,
      referrerName: userData.referrerName || '',
      otherReferralDetail,
      rrnFront: userData.rrnFront || '',
      rrnLast: '',
      dateOfBirth: userData.dateOfBirth ? String(userData.dateOfBirth).substring(0, 10) : '',
    });

    if (userData.profileImage) setProfileImageUrl(userData.profileImage);
    setPartTimeJobs(userData.partTimeJobs || []);
    setEmailExists(false);
    setPhoneExists(false);
  }, [userData, reset]);

  useEffect(() => {
    const sub = watch((_, { name }) => {
      if (name === 'email') setEmailExists(false);
      if (name === 'phoneNumber') setPhoneExists(false);
    });
    return () => sub.unsubscribe();
  }, [watch]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const valid = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];
    if (!valid.includes(file.type)) { toast.error('유효한 이미지 파일을 선택해주세요.'); return; }
    setSelectedFile(file);
    setShowCropper(true);
  };

  const compressImage = (file: File, quality: number): Promise<File> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width; canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas 컨텍스트 오류')); return; }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (!blob) { reject(new Error('압축 실패')); return; }
            resolve(new File([blob], file.name, { type: file.type, lastModified: Date.now() }));
          }, file.type, quality);
        };
        img.onerror = () => reject(new Error('이미지 로드 실패'));
      };
      reader.onerror = () => reject(new Error('파일 읽기 실패'));
    });

  const handleCropComplete = async (croppedFile: File) => {
    setShowCropper(false);
    setIsUploading(true);
    setUploadProgress(0);
    try {
      if (!userData) return;
      let fileToUpload = croppedFile;
      const sizeMB = croppedFile.size / (1024 * 1024);
      if (sizeMB > 1) {
        let ratio = 1;
        while (sizeMB / ratio > 1) ratio *= 2;
        fileToUpload = await compressImage(croppedFile, 1 / ratio);
      }
      const url = await uploadProfileImage(userData.userId, fileToUpload, (p) => setUploadProgress(p));
      setProfileImageUrl(url);
      await refreshUserData();
      toast.success('프로필 이미지가 업로드되었습니다.');
    } catch { toast.error('이미지 업로드 중 오류가 발생했습니다.'); }
    finally { setIsUploading(false); setUploadProgress(0); }
  };

  const handleEmailBlur = async () => {
    if (!currentEmail || currentEmail === userData?.email || errors.email) { setEmailExists(false); return; }
    try {
      const existing = await getUserByEmail(currentEmail);
      setEmailExists(!!(existing && existing.userId !== userData?.userId));
    } catch { setEmailExists(false); }
  };

  const handlePhoneBlur = async () => {
    if (!currentPhone || currentPhone === userData?.phoneNumber || errors.phoneNumber) { setPhoneExists(false); return; }
    try {
      const existing = await getUserByPhone(currentPhone);
      setPhoneExists(!!(existing && existing.userId !== userData?.userId));
    } catch { setPhoneExists(false); }
  };

  const handleComplete = (data: Address) => {
    setValue('address', data.address, { shouldValidate: true });
    setShowPostcode(false);
  };

  const onSubmit = async (data: ProfileFormValues) => {
    if (!userData) return;
    setIsLoading(true);
    try {
      let finalPhoneNumber: string;
      if (isForeign) {
        let p = data.phoneNumber;
        if (countryCode === '+82' && p.startsWith('0')) p = p.substring(1);
        finalPhoneNumber = `${countryCode}${p}`;
      } else {
        finalPhoneNumber = data.phoneNumber;
      }

      if (data.email !== userData.email) {
        const existing = await getUserByEmail(data.email);
        if (existing && existing.userId !== userData.userId) { setEmailExists(true); setIsLoading(false); return; }
      }
      if (finalPhoneNumber !== userData.phoneNumber) {
        const existing = await getUserByPhone(finalPhoneNumber);
        if (existing && existing.userId !== userData.userId) { setPhoneExists(true); setIsLoading(false); return; }
      }

      const updateData: Partial<User> = {};

      if (section === 'all' || section === 'personal') {
        if (isForeign) {
          const firstName = data.firstName?.trim() || '';
          const lastName = data.lastName?.trim() || '';
          const middleName = data.middleName?.trim() || '';
          updateData.name = middleName ? `${firstName} ${middleName} ${lastName}` : `${firstName} ${lastName}`;
          updateData.foreignTeacher = { ...(userData.foreignTeacher || {}), firstName, lastName, middleName, countryCode };
          if (data.dateOfBirth) {
            updateData.dateOfBirth = data.dateOfBirth;
            updateData.age = calculateAgeFromDateOfBirth(data.dateOfBirth);
          }
        } else {
          updateData.name = data.name;
        }
        updateData.phoneNumber = finalPhoneNumber;        updateData.email = data.email;
        updateData.address = data.address || '';
        updateData.addressDetail = data.addressDetail || '';
        updateData.gender = data.gender;
        updateData.selfIntroduction = data.selfIntroduction || '';
        updateData.jobMotivation = data.jobMotivation || '';

        if (data.address && data.address !== userData.address) {
          const geo = await updateGeocodeIfAddressChanged(userData.address, data.address);
          Object.assign(updateData, geo);
        }

        if (!isForeign) {
          let referralPath = data.referralPath || '';
          if (data.referralPath === '기타' && data.otherReferralDetail) {
            referralPath = `기타: ${data.otherReferralDetail}`;
          }
          updateData.referralPath = referralPath;
          updateData.referrerName = data.referrerName || '';
        }
      }

      if (section === 'all' || section === 'experience') {
        updateData.partTimeJobs = partTimeJobs;
      }

      if (!isForeign && (section === 'all' || section === 'education')) {
        updateData.university = data.university;
        if (data.grade !== undefined) updateData.grade = data.grade;
        updateData.isOnLeave = data.isOnLeave ?? false;
        updateData.major1 = data.major1;
        updateData.major2 = data.major2 || '';
      }

      await updateUser(userData.userId, updateData);

      // 주민번호 변경이 있을 경우 암호화 API 호출
      if (!isForeign && data.rrnFront && data.rrnLast &&
          /^\d{6}$/.test(data.rrnFront) && /^\d{7}$/.test(data.rrnLast)) {
        try {
          await authenticatedPost('/api/user/save-sensitive', {
            userId: userData.userId,
            rrnFront: data.rrnFront,
            rrnLast: data.rrnLast,
          });
          toast.success('주민등록번호가 안전하게 저장되었습니다.');
        } catch (rrnErr) {
          logger.error('주민번호 저장 실패:', rrnErr);
          toast.error('주민번호 저장에 실패했습니다. 다시 시도해주세요.');
          setIsLoading(false);
          return;
        }
      }

      await refreshUserData();
      toast.success('프로필이 성공적으로 업데이트되었습니다.');
      router.back();
    } catch (error) {
      logger.error('프로필 업데이트 오류:', error);
      toast.error('프로필 업데이트 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!userData) {
    return (
      <Layout requireAuth>
        <div className="max-w-2xl mx-auto text-center py-8">
          <p className="text-gray-500">로딩 중...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout requireAuth>
      <div className="max-w-2xl mx-auto pb-8">
        {/* 상단 헤더 */}
        <div className="flex items-center gap-2 mb-4 pt-1">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-1.5 rounded-full hover:bg-gray-100 transition text-blue-600"
            aria-label="뒤로가기"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-900">
            {isForeign ? 'Edit Profile' : '프로필 수정'}
          </h1>
        </div>

        {showCropper && selectedFile ? (
          <ImageCropper file={selectedFile} onCropComplete={handleCropComplete} onCancel={() => { setShowCropper(false); setSelectedFile(null); }} aspectRatio={1} />
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit, (fe) => {
              if (fe.partTimeJobs) toast.error('경력 정보를 올바르게 입력해주세요.');
              else toast.error('입력 정보를 다시 확인해주세요.');
            })}
          >
            {/* ━━━ 1. 개인 정보 (이미지·이름·생년월일·이메일·전화·성별·주민번호·가입경로) ━━━ */}
            {(section === 'all' || section === 'personal') && (
              <SectionCard icon={<FaUser />} title={isForeign ? 'Personal Information' : '개인 정보'} accent="blue">

                {/* 프로필 이미지 */}
                <div className="flex items-center gap-3 pb-2 mb-1 border-b border-gray-100">
                  <div className="relative shrink-0">
                    {profileImageUrl ? (
                      <img src={profileImageUrl} alt="프로필" className="w-12 h-12 object-cover rounded-xl border border-gray-200" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                        <span className="text-white text-lg font-bold">{userData.name.charAt(0)}</span>
                      </div>
                    )}
                    {isUploading && (
                      <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      </div>
                    )}
                  </div>
                  <label htmlFor="profile-image" className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium hover:bg-blue-100 transition">
                    <FaCamera size={10} />
                    {isForeign ? 'Change Image' : '이미지 변경'}
                  </label>
                  <input id="profile-image" type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </div>

                {/* 이름 */}
                {isForeign ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <FormInput label="First Name *" type="text" placeholder="First Name" error={(errors as Record<string, { message?: string }>).firstName?.message} {...register('firstName')} />
                      <FormInput label="Last Name *" type="text" placeholder="Last Name" error={(errors as Record<string, { message?: string }>).lastName?.message} {...register('lastName')} />
                    </div>
                    <FormInput label="Middle Name (optional)" type="text" placeholder="Middle Name" {...register('middleName')} />
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <FormInput label="이름 *" type="text" placeholder="이름" error={errors.name?.message} {...register('name')} />
                    <div className="mb-4">
                      <label className="block text-gray-700 text-sm font-medium mb-1">성별</label>
                      <div className="flex gap-2 mt-0.5">
                        {(['M', 'F'] as const).map(g => (
                          <label key={g} className="cursor-pointer">
                            <input type="radio" value={g} className="hidden peer" {...register('gender')} />
                            <div className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium peer-checked:border-blue-500 peer-checked:bg-blue-50 peer-checked:text-blue-700 transition hover:border-blue-300 cursor-pointer">
                              {g === 'M' ? '남성' : '여성'}
                            </div>
                          </label>
                        ))}
                      </div>
                      {errors.gender && <p className="mt-1 text-xs text-red-600">{errors.gender.message}</p>}
                    </div>
                  </div>
                )}

                {/* 이메일 + 전화번호 */}
                <FormInput
                  label={isForeign ? 'Email *' : '이메일 *'}
                  type="email"
                  placeholder="email@example.com"
                  error={emailExists ? '이미 사용 중' : errors.email?.message}
                  {...register('email', { onBlur: handleEmailBlur })}
                />
                <div className="mb-4">
                  <label className="block text-gray-700 text-sm font-medium mb-1">{isForeign ? 'Phone *' : '휴대폰 번호 *'}</label>
                  {isForeign ? (
                    <div className="flex gap-1.5 relative">
                      <button type="button" onClick={() => setShowCountryPicker(!showCountryPicker)}
                        className="flex items-center gap-1 px-2 py-2 border border-gray-300 rounded-md bg-gray-50 text-xs shrink-0">
                        <span>{countryCodes.find(c => c.code === countryCode)?.flag}</span>
                        <span>{countryCode}</span>
                        <span className="text-gray-400 text-[10px]">▼</span>
                        {showCountryPicker && (
                          <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto z-20">
                            {countryCodes.map(c => (
                              <button key={c.code} type="button"
                                onClick={() => { setCountryCode(c.code); setShowCountryPicker(false); }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50 ${countryCode === c.code ? 'bg-blue-50 font-medium' : ''}`}>
                                <span>{c.flag}</span><span className="flex-1">{c.country}</span><span className="text-gray-500">{c.code}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </button>
                      <input type="tel" placeholder={getPhonePlaceholder(countryCode)}
                        className={`flex-1 min-w-0 px-2 py-2 border ${phoneExists || errors.phoneNumber ? 'border-red-500' : 'border-gray-300'} rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500`}
                        {...register('phoneNumber', { onBlur: handlePhoneBlur })} />
                    </div>
                  ) : (
                    <input type="tel" placeholder="01012345678"
                      className={`w-full px-3 py-2 border ${phoneExists || errors.phoneNumber ? 'border-red-500' : 'border-gray-300'} rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500`}
                      {...register('phoneNumber', { onBlur: handlePhoneBlur })} />
                  )}
                  {(phoneExists || errors.phoneNumber) && (
                    <p className="mt-1 text-xs text-red-600">{phoneExists ? '이미 사용 중' : errors.phoneNumber?.message}</p>
                  )}
                </div>

                {/* Gender + Date of Birth (원어민 전용 — 2열) */}
                {isForeign && (
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {/* Gender */}
                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-1">Gender</label>
                      <div className="flex gap-2">
                        {(['M', 'F'] as const).map(g => (
                          <label key={g} className="cursor-pointer">
                            <input type="radio" value={g} className="hidden peer" {...register('gender')} />
                            <div className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium peer-checked:border-blue-500 peer-checked:bg-blue-50 peer-checked:text-blue-700 transition hover:border-blue-300 cursor-pointer">
                              {g === 'M' ? 'Male' : 'Female'}
                            </div>
                          </label>
                        ))}
                      </div>
                      {errors.gender && <p className="mt-1 text-xs text-red-600">{errors.gender.message}</p>}
                    </div>
                    {/* Date of Birth */}
                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-1">Date of Birth</label>
                      <input
                        type="date"
                        className={`w-full px-3 py-2 border ${(errors as Record<string, { message?: string }>).dateOfBirth ? 'border-red-500' : 'border-gray-300'} rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500`}
                        {...register('dateOfBirth')}
                      />
                      {(errors as Record<string, { message?: string }>).dateOfBirth && (
                        <p className="mt-1 text-xs text-red-600">{(errors as Record<string, { message?: string }>).dateOfBirth?.message}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* 주민등록번호 (멘토 전용) */}
                {!isForeign && (
                  <div className="mb-3 pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-gray-700 text-sm font-medium flex items-center gap-1.5">
                        <FaIdCard size={12} className="text-gray-400" /> 주민등록번호
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-red-500">
                        <FaLock size={9} /> AES-256-GCM 암호화{hasExistingRRN ? ' · 변경 시에만 입력' : ''}
                      </span>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="block text-gray-500 text-xs mb-1">앞자리 (6자리)</label>
                        <input type="text" maxLength={6} placeholder="000000"
                          className={`w-full px-3 py-2 border ${errors.rrnFront ? 'border-red-500' : 'border-gray-300'} rounded-md text-sm tracking-widest font-mono focus:outline-none focus:ring-1 focus:ring-red-400`}
                          {...register('rrnFront', { validate: v => !v || /^\d{6}$/.test(v) || '숫자 6자리' })} />
                        {errors.rrnFront && <p className="mt-0.5 text-xs text-red-600">{errors.rrnFront.message}</p>}
                      </div>
                      <span className="mb-2.5 text-gray-300 text-base select-none">-</span>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-gray-500 text-xs">뒷자리 (7자리)</label>
                          <button type="button" onClick={() => setShowRrnLast(!showRrnLast)} className="text-gray-400 hover:text-gray-600">
                            {showRrnLast ? <FaEyeSlash size={11} /> : <FaEye size={11} />}
                          </button>
                        </div>
                        <input type={showRrnLast ? 'text' : 'password'} maxLength={7} placeholder="0000000"
                          className={`w-full px-3 py-2 border ${errors.rrnLast ? 'border-red-500' : 'border-gray-300'} rounded-md text-sm tracking-widest font-mono focus:outline-none focus:ring-1 focus:ring-red-400`}
                          {...register('rrnLast', {
                            validate: v => {
                              const front = watchedRrnFront;
                              if (!front && !v) return true;
                              if (front && !v) return '뒷자리도 입력해주세요.';
                              if (!front && v) return '앞자리도 입력해주세요.';
                              return /^\d{7}$/.test(v!) || '숫자 7자리';
                            },
                          })} />
                        {errors.rrnLast && <p className="mt-0.5 text-xs text-red-600">{errors.rrnLast.message}</p>}
                      </div>
                    </div>
                    {hasExistingRRN && !watchedRrnFront && (
                      <p className="text-[11px] text-gray-400 mt-1">비워두면 기존 저장 정보가 유지됩니다.</p>
                    )}
                  </div>
                )}

                {/* 가입 경로 (멘토 전용) */}
                {!isForeign && (
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2 mb-1.5">
                      <FaShareAlt size={11} className="text-gray-400" />
                      <span className="text-gray-700 text-sm font-medium">가입 경로</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className={watch('referralPath') === '지인 소개' || watch('referralPath') === '기타' ? '' : 'col-span-2'}>
                        <select className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-purple-400 bg-white" {...register('referralPath')}>
                          <option value="">선택해주세요</option>
                          {['에브리타임','학교 커뮤니티','링커리어','캠퍼스픽','인스타그램','페이스북','구글/네이버 등 검색','지인 소개','기타'].map(v => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </div>
                      {watch('referralPath') === '지인 소개' && (
                        <FormInput label="소개인 이름" type="text" placeholder="지인의 이름" error={errors.referrerName?.message} {...register('referrerName')} />
                      )}
                      {watch('referralPath') === '기타' && (
                        <FormInput label="기타 상세" type="text" placeholder="어떤 경로인지" {...register('otherReferralDetail')} />
                      )}
                    </div>
                  </div>
                )}

              </SectionCard>
            )}

            {/* ━━━ 2. 학교 정보 ━━━ */}
            {!isForeign && (section === 'all' || section === 'education') && (
              <SectionCard icon={<FaGraduationCap />} title="학교 정보" accent="purple">
                <div className="grid grid-cols-2 gap-3">
                  <FormInput label="학교 *" type="text" placeholder="학교명" error={errors.university?.message} {...register('university')} />
                  <div className="mb-4">
                    <label className="block text-gray-700 text-sm font-medium mb-1.5">학년 *</label>
                    <Controller
                      control={control}
                      name="grade"
                      render={({ field: { value, onChange } }) => (
                        <div className="flex gap-1 flex-wrap">
                          {[1, 2, 3, 4, 5, 6].map(g => (
                            <button
                              key={g}
                              type="button"
                              onClick={() => onChange(g)}
                              className={`px-2.5 py-1 border rounded-md text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                                value === g
                                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                                  : 'border-gray-200 text-gray-600 hover:border-purple-300'
                              }`}
                            >
                              {g === 6 ? '졸업' : `${g}학년`}
                            </button>
                          ))}
                        </div>
                      )}
                    />
                    {errors.grade && <p className="mt-1 text-xs text-red-600">{errors.grade.message}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormInput label="1전공 *" type="text" placeholder="1전공" error={errors.major1?.message} {...register('major1')} />
                  <FormInput label="2전공/부전공" type="text" placeholder="2전공 (선택)" {...register('major2')} />
                </div>
                <div className="flex items-center gap-2 -mt-2 mb-1">
                  <input type="checkbox" id="isOnLeave" className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-400" {...register('isOnLeave')} />
                  <label htmlFor="isOnLeave" className="text-sm text-gray-700 cursor-pointer">현재 휴학 중</label>
                </div>
              </SectionCard>
            )}

            {/* ━━━ 3. 주소 ━━━ */}
            {(section === 'all' || section === 'personal') && (
              <SectionCard icon={<FaMapMarkerAlt />} title={isForeign ? 'Address' : '주소'} accent="green">
                <div className="mb-3">
                  <label className="block text-gray-700 text-sm font-medium mb-1">
                    {isForeign ? <span>Address <span className="text-gray-400 font-normal">(optional)</span></span> : '주소 *'}
                  </label>
                  <div className="flex gap-2">
                    <input disabled className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm"
                      placeholder={isForeign ? 'Click search address' : '주소 검색을 클릭하세요'} {...register('address')} />
                    <Button type="button" variant="secondary" size="sm" onClick={() => setShowPostcode(!showPostcode)}>
                      {isForeign ? 'Search' : '검색'}
                    </Button>
                  </div>
                  {showPostcode && (
                    <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
                      <DaumPostcode onComplete={handleComplete} />
                    </div>
                  )}
                  {errors.address && <p className="mt-1 text-xs text-red-600">{errors.address.message}</p>}
                </div>
                <FormInput
                  label={isForeign ? 'Detailed Address (optional)' : '상세 주소 *'}
                  type="text"
                  placeholder={isForeign ? 'Detailed address' : '상세 주소'}
                  error={errors.addressDetail?.message}
                  {...register('addressDetail')}
                />
              </SectionCard>
            )}

            {/* ━━━ 4. 알바 & 멘토링 경력 ━━━ */}
            {!isForeign && (section === 'all' || section === 'experience') && (
              <SectionCard icon={<FaBriefcase />} title="알바 & 멘토링 경력" accent="orange">
                <div className="flex justify-end -mt-1 mb-1">
                  <button type="button" onClick={addPartTimeJob}
                    className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 font-medium px-2.5 py-1 rounded-md bg-orange-50 hover:bg-orange-100 transition">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    경력 추가
                  </button>
                </div>
                {partTimeJobs.length === 0 ? (
                  <div className="py-3 border border-dashed border-orange-200 rounded-md text-center text-gray-400 text-xs">
                    경력을 추가해보세요
                  </div>
                ) : (
                  <div className="space-y-2">
                    {partTimeJobs.map((job, index) => (
                      <div key={index} className="border border-orange-100 rounded-md p-2.5 bg-orange-50/30 relative">
                        <button type="button" onClick={() => removePartTimeJob(index)}
                          className="absolute top-2 right-2 text-gray-300 hover:text-red-500 transition">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <div className="grid grid-cols-2 gap-1.5 pr-4">
                          {(['period', 'companyName', 'position', 'description'] as const).map(field => (
                            <div key={field}>
                              <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
                                {field === 'period' ? '기간' : field === 'companyName' ? '회사명' : field === 'position' ? '담당' : '업무내용'}
                                {field !== 'description' && <span className="text-red-400">*</span>}
                              </label>
                              <input type="text" value={job[field]}
                                onChange={(e) => updatePartTimeJob(index, field, e.target.value)}
                                className={`w-full px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-orange-400 ${errors.partTimeJobs?.[index]?.[field] ? 'border-red-400' : 'border-gray-200'}`}
                                placeholder={field === 'period' ? '2022.03~09' : field === 'companyName' ? '회사명' : field === 'position' ? '담당' : '내용(선택)'} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {/* ━━━ 5. 자기소개 & 지원 동기 ━━━ */}
            {!isForeign && (section === 'all' || section === 'personal') && (
              <SectionCard icon={<FaUser />} title="자기소개 & 지원 동기" accent="blue">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-gray-700 text-sm font-medium">자기소개</label>
                    <span className="text-xs text-gray-400">{currentSelfIntro.length}/500</span>
                  </div>
                  <textarea className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[7rem] resize-y"
                    placeholder="간단한 자기소개를 입력하세요" maxLength={500} {...register('selfIntroduction')} />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-gray-700 text-sm font-medium">지원 동기</label>
                    <span className="text-xs text-gray-400">{currentJobMotivation.length}/500</span>
                  </div>
                  <textarea className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[7rem] resize-y"
                    placeholder="업무 지원 동기를 입력하세요" maxLength={500} {...register('jobMotivation')} />
                </div>
              </SectionCard>
            )}

            {/* 저장 버튼 */}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => router.back()}>취소</Button>
              <Button type="submit" variant="primary" size="sm" isLoading={isLoading} disabled={emailExists || phoneExists}>
                {isForeign ? 'Save' : '저장하기'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Layout>
  );
}
