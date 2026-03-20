'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { getUserByEmail, getUserByPhone } from '@/lib/firebaseService';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import ProgressSteps from '@/components/common/ProgressSteps';
import { FaUpload, FaEnvelope, FaLock } from 'react-icons/fa';

const step2Schema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .regex(
      /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/,
      'Password must contain letters, numbers, and special characters.'
    ),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});

type Step2FormValues = z.infer<typeof step2Schema>;

export default function ForeignSignUpStep2() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // 파일 상태
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [passportPhoto, setPassportPhoto] = useState<File | null>(null);
  const [passportPhotoPreview, setPassportPhotoPreview] = useState<string | null>(null);
  const [foreignIdCard, setForeignIdCard] = useState<File | null>(null);
  const [foreignIdCardPreview, setForeignIdCardPreview] = useState<string | null>(null);

  // URL 파라미터 디코딩
  const firstName = searchParams.get('firstName') ? decodeURIComponent(searchParams.get('firstName') as string) : null;
  const lastName = searchParams.get('lastName') ? decodeURIComponent(searchParams.get('lastName') as string) : null;
  const middleName = searchParams.get('middleName') ? decodeURIComponent(searchParams.get('middleName') as string) : null;
  const countryCode = searchParams.get('countryCode') ? decodeURIComponent(searchParams.get('countryCode') as string) : null;
  const phone = searchParams.get('phone') ? decodeURIComponent(searchParams.get('phone') as string) : null;
  const socialSignUp = searchParams.get('socialSignUp') === 'true';
  const tempUserId = searchParams.get('tempUserId');
  const socialProvider = searchParams.get('socialProvider');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step2FormValues>({
    resolver: zodResolver(step2Schema),
  });

  if (!firstName || !lastName || !countryCode || !phone) {
    return (
      <Layout>
        <div className="max-w-md mx-auto text-center py-12">
          <h1 className="text-2xl font-bold mb-4">Error</h1>
          <p className="text-gray-600 mb-4">Required information is missing.</p>
          <Button variant="primary" onClick={() => router.push('/sign-up/foreign')}>
            Return to Foreign Teacher Sign Up
          </Button>
        </div>
      </Layout>
    );
  }

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: (file: File | null) => void,
    setPreview?: (preview: string | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      setFile(file);
      if (setPreview && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const onSubmit = async (data: Step2FormValues) => {
    // 소셜 로그인인 경우 필수 파일만 확인
    if (socialSignUp && socialProvider) {
      // 소셜 로그인은 비밀번호 불필요
      if (!profileImage) {
        toast.error('Please upload a profile photo.');
        return;
      }
      if (!cvFile) {
        toast.error('Please upload your CV (PDF).');
        return;
      }
      if (!passportPhoto) {
        toast.error('Please upload your Passport Photo.');
        return;
      }
    } else {
      // 일반 가입은 모든 필드 필요
      if (!profileImage) {
        toast.error('Please upload a profile photo.');
        return;
      }
      if (!cvFile) {
        toast.error('Please upload your CV (PDF).');
        return;
      }
      if (!passportPhoto) {
        toast.error('Please upload your Passport Photo.');
        return;
      }
    }

    setIsLoading(true);
    try {
      // 전화번호에 국가코드 추가
      let phoneWithoutLeadingZero = phone;
      
      // 한국 번호의 경우 맨 앞 0 제거 (010 -> 10)
      if (countryCode === '+82' && phoneWithoutLeadingZero.startsWith('0')) {
        phoneWithoutLeadingZero = phoneWithoutLeadingZero.substring(1);
      }
      
      const fullPhone = `${countryCode}${phoneWithoutLeadingZero}`;
      const fullName = middleName 
        ? `${firstName} ${middleName} ${lastName}`
        : `${firstName} ${lastName}`;

      // 전화번호로 기존 사용자 확인
      const existingUserByPhone = await getUserByPhone(fullPhone);
      
      // 이메일로 기존 사용자 확인
      const existingUserByEmail = await getUserByEmail(data.email);
      
      let userId: string;
      let isUpdatingExistingUser = false;

      // 소셜 로그인 케이스
      if (socialSignUp && socialProvider) {
        console.log('🔗 Social sign-up flow for foreign teacher');
        
        // Case 1: 전화번호로 임시 원어민(foreign_temp) 계정이 존재하는 경우
        if (existingUserByPhone && existingUserByPhone.role === 'foreign_temp' && existingUserByPhone.status === 'temp') {
          console.log('📋 Found existing foreign_temp user, updating account...');
          userId = existingUserByPhone.userId;
          isUpdatingExistingUser = true;
          
          // 이메일이 다른 계정에서 사용 중인지 확인
          if (existingUserByEmail && existingUserByEmail.userId !== userId) {
            toast.error('This email is already in use by another account.');
            setIsLoading(false);
            return;
          }
          
          // Firebase Auth: 소셜 로그인으로는 이미 생성되어 있음
          console.log('✅ Using existing social auth credential');
        }
        // Case 2: 이메일로 계정이 존재하는 경우 (중복)
        else if (existingUserByEmail) {
          toast.error('This email is already in use.');
          setIsLoading(false);
          return;
        }
        // Case 3: 완전히 새로운 사용자 (소셜 로그인)
        else {
          console.log('🆕 New foreign teacher with social login');
          // Firebase Auth는 이미 Google 로그인으로 생성됨
          const { auth } = await import('@/lib/firebase');
          const currentUser = auth.currentUser;
          
          if (!currentUser) {
            toast.error('Authentication error. Please try again.');
            setIsLoading(false);
            return;
          }
          
          userId = currentUser.uid;
          console.log('✅ Using social auth UID:', userId);
        }
      } else {
        // 일반 가입 케이스 (기존 로직 유지)
        // Case 1: 전화번호로 임시 원어민(foreign_temp) 계정이 존재하는 경우
        if (existingUserByPhone && existingUserByPhone.role === 'foreign_temp' && existingUserByPhone.status === 'temp') {
          console.log('📋 Found existing foreign_temp user, updating account...');
          
          // 기존 계정의 userId 사용
          userId = existingUserByPhone.userId;
          isUpdatingExistingUser = true;
          
          // 이메일이 다른 계정에서 사용 중인지 확인
          if (existingUserByEmail && existingUserByEmail.userId !== userId) {
            toast.error('This email is already in use by another account.');
            setIsLoading(false);
            return;
          }
          
          // Firebase Authentication에 이메일/비밀번호 설정
          console.log('🔐 Linking email/password to existing Firebase user:', userId);
          const { createUserWithEmailAndPassword } = await import('firebase/auth');
          const { auth } = await import('@/lib/firebase');
          
          try {
            await createUserWithEmailAndPassword(auth, data.email, data.password);
            console.log('✅ Created new Firebase Auth account for existing user');
          } catch (authError: any) {
            if (authError.code === 'auth/email-already-in-use') {
              console.log('⚠️ Firebase Auth already exists, will update Firestore only');
            } else {
              throw authError;
            }
          }
        }
        // Case 2: 이메일로 계정이 존재하는 경우 (중복)
        else if (existingUserByEmail) {
          toast.error('This email is already in use.');
          setIsLoading(false);
          return;
        }
        // Case 3: 완전히 새로운 사용자
        else {
          console.log('🔐 Creating new Firebase Authentication account:', data.email);
          const { createUserWithEmailAndPassword } = await import('firebase/auth');
          const { auth } = await import('@/lib/firebase');
          const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
          userId = userCredential.user.uid;
          console.log('✅ Firebase Authentication account created, UID:', userId);
        }
      }

      // 2. 파일 업로드
      console.log('📤 Uploading files...');
      const { getStorage } = await import('firebase/storage');
      const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
      const storage = getStorage();

      // 프로필 이미지 업로드
      console.log('  - Uploading profile image...');
      const profileImageRef = ref(storage, `foreign-teachers/${userId}/profile.jpg`);
      await uploadBytes(profileImageRef, profileImage);
      const profileImageUrl = await getDownloadURL(profileImageRef);
      console.log('  ✅ Profile image uploaded');

      // CV 업로드
      console.log('  - Uploading CV...');
      const cvRef = ref(storage, `foreign-teachers/${userId}/cv_${cvFile.name}`);
      await uploadBytes(cvRef, cvFile);
      const cvUrl = await getDownloadURL(cvRef);
      console.log('  ✅ CV uploaded');

      // 여권 사진 업로드
      console.log('  - Uploading passport photo...');
      const passportRef = ref(storage, `foreign-teachers/${userId}/passport.jpg`);
      await uploadBytes(passportRef, passportPhoto);
      const passportPhotoUrl = await getDownloadURL(passportRef);
      console.log('  ✅ Passport photo uploaded');

      // 외국인 등록증 업로드 (선택사항)
      let foreignIdCardUrl = '';
      if (foreignIdCard) {
        console.log('  - Uploading foreign ID card...');
        const foreignIdRef = ref(storage, `foreign-teachers/${userId}/foreign_id.jpg`);
        await uploadBytes(foreignIdRef, foreignIdCard);
        foreignIdCardUrl = await getDownloadURL(foreignIdRef);
        console.log('  ✅ Foreign ID card uploaded');
      }

      console.log('✅ All files uploaded successfully');

      // 3. Firestore에 사용자 문서 생성 또는 업데이트
      const { doc, setDoc, updateDoc, Timestamp } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      const userData = {
        userId: userId,
        name: fullName,
        email: data.email,
        phone: fullPhone,
        phoneNumber: fullPhone,
        password: '', // 보안상 저장하지 않음
        address: existingUserByPhone?.address || '',
        addressDetail: existingUserByPhone?.addressDetail || '',
        role: 'foreign', // 원어민은 바로 활성화
        jobExperiences: existingUserByPhone?.jobExperiences || [],
        partTimeJobs: existingUserByPhone?.partTimeJobs || [],
        createdAt: existingUserByPhone?.createdAt || Timestamp.now(),
        updatedAt: Timestamp.now(),
        agreedTerms: true,
        agreedPersonal: true,
        profileImage: profileImageUrl,
        status: 'active', // 원어민은 바로 활성 상태
        isEmailVerified: false,
        isPhoneVerified: false,
        isProfileCompleted: true,
        isTermsAgreed: true,
        isPersonalAgreed: true,
        isAddressVerified: false,
        isProfileImageUploaded: true,
        jobMotivation: 'Foreign Teacher Application',
        feedback: existingUserByPhone?.feedback || '',
        // 원어민 특화 정보
        foreignTeacher: {
          firstName: firstName || '',
          lastName: lastName || '',
          middleName: middleName || '',
          countryCode: countryCode || '',
          cvUrl: cvUrl,
          passportPhotoUrl: passportPhotoUrl,
          foreignIdCardUrl: foreignIdCardUrl,
          applicationDate: Timestamp.now(),
        },
        // 소셜 로그인 정보 추가
        ...(socialSignUp && socialProvider && {
          authProviders: [{
            providerId: `${socialProvider}.com`,
            uid: userId,
            email: data.email,
            linkedAt: Timestamp.now(),
          }],
          primaryAuthMethod: 'social',
        }),
      };

      if (isUpdatingExistingUser) {
        console.log('📝 Updating existing Firestore user document');
        await setDoc(doc(db, 'users', userId), userData, { merge: true });
        console.log('✅ Firestore user document updated (foreign_temp → foreign)');
        
        toast.success(
          `Welcome back, ${fullName}!\n\nYour account has been activated.\nYou can now log in and start using the platform.`, 
          { duration: 8000 }
        );
      } else {
        console.log('📝 Creating new Firestore user document');
        await setDoc(doc(db, 'users', userId), userData);
        console.log('✅ Firestore user document created');
        
        toast.success(
          `Welcome, ${fullName}!\n\nYour account has been successfully created.\nYou can now log in and start using the platform.`, 
          { duration: 8000 }
        );
      }
      
      // 3초 후 로그인 페이지로 이동
      setTimeout(() => {
        router.push('/sign-in');
      }, 3000);
    } catch (error: any) {
      console.error('Sign up error:', error);
      
      let errorMessage = 'An error occurred during sign up.';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already in use.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use at least 8 characters.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email format.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout noPadding>
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-4">
        <div className="max-w-2xl w-full">
          {/* 헤더 */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-green-600 to-emerald-800 bg-clip-text text-transparent">
              Account & Documents
            </h1>
            <p className="text-gray-600">Upload your account information and required documents</p>
          </div>

          <div className="bg-white shadow-xl rounded-2xl lg:px-10 px-6 pt-8 pb-10">
            {/* 진행 표시기 */}
            <ProgressSteps
              currentStep={2}
              totalSteps={2}
              steps={['Personal Info', 'Account']}
            />

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Email */}
              {!socialSignUp && (
                <>
                  <div className="relative">
                    <div className="absolute left-3 top-[38px] text-gray-400">
                      <FaEnvelope className="w-5 h-5" />
                    </div>
                    <FormInput
                      label="Email"
                      type="email"
                      placeholder="example@email.com"
                      error={errors.email?.message}
                      className="pl-12"
                      {...register('email')}
                    />
                  </div>

                  {/* Password */}
                  <div className="relative">
                    <div className="absolute left-3 top-[38px] text-gray-400">
                      <FaLock className="w-5 h-5" />
                    </div>
                    <FormInput
                      label="Password"
                      type="password"
                      placeholder="8+ characters with letters, numbers & symbols"
                      error={errors.password?.message}
                      showPasswordToggle={true}
                      className="pl-12"
                      {...register('password')}
                    />
                  </div>

                  {/* Confirm Password */}
                  <div className="relative">
                    <div className="absolute left-3 top-[38px] text-gray-400">
                      <FaLock className="w-5 h-5" />
                    </div>
                    <FormInput
                      label="Confirm Password"
                      type="password"
                      placeholder="Re-enter your password"
                      error={errors.confirmPassword?.message}
                      showPasswordToggle={true}
                      className="pl-12"
                      {...register('confirmPassword')}
                    />
                  </div>
                </>
              )}

              {socialSignUp && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800 flex items-center">
                    <span className="mr-2">✓</span>
                    <span>You are signing up with Google. No password required.</span>
                  </p>
                </div>
              )}

              <div className="border-t border-gray-200 my-8"></div>

              <h3 className="text-lg font-semibold text-gray-900 mb-4">Required Documents</h3>

              {/* Profile Photo */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  Profile Photo <span className="text-red-500">*</span>
                </label>
                <label className="flex items-center justify-center w-full px-4 py-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-green-500 hover:bg-green-50 transition-all">
                  <FaUpload className="w-5 h-5 mr-2 text-green-600" />
                  <span className="text-sm text-gray-700 font-medium">
                    {profileImage ? profileImage.name : 'Click to upload profile photo'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, setProfileImage, setProfileImagePreview)}
                  />
                </label>
                {profileImagePreview && (
                  <div className="mt-3">
                    <img src={profileImagePreview} alt="Profile Preview" className="w-32 h-32 object-cover rounded-lg shadow-md" />
                  </div>
                )}
              </div>

              {/* CV */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  CV (PDF Format) <span className="text-red-500">*</span>
                </label>
                <label className="flex items-center justify-center w-full px-4 py-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-green-500 hover:bg-green-50 transition-all">
                  <FaUpload className="w-5 h-5 mr-2 text-green-600" />
                  <span className="text-sm text-gray-700 font-medium">
                    {cvFile ? cvFile.name : 'Click to upload your CV (PDF)'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, setCvFile)}
                  />
                </label>
              </div>

              {/* Passport Photo */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  Passport Photo <span className="text-red-500">*</span>
                </label>
                <label className="flex items-center justify-center w-full px-4 py-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-green-500 hover:bg-green-50 transition-all">
                  <FaUpload className="w-5 h-5 mr-2 text-green-600" />
                  <span className="text-sm text-gray-700 font-medium">
                    {passportPhoto ? passportPhoto.name : 'Click to upload passport photo'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, setPassportPhoto, setPassportPhotoPreview)}
                  />
                </label>
                {passportPhotoPreview && (
                  <div className="mt-3">
                    <img src={passportPhotoPreview} alt="Passport Preview" className="w-full max-w-md h-48 object-cover rounded-lg shadow-md" />
                  </div>
                )}
              </div>

              {/* Alien Registration Card */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  Alien Registration Card (Optional)
                </label>
                <label className="flex items-center justify-center w-full px-4 py-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all">
                  <FaUpload className="w-5 h-5 mr-2 text-gray-500" />
                  <span className="text-sm text-gray-600 font-medium">
                    {foreignIdCard ? foreignIdCard.name : 'Click to upload (if applicable)'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, setForeignIdCard, setForeignIdCardPreview)}
                  />
                </label>
                {foreignIdCardPreview && (
                  <div className="mt-3">
                    <img src={foreignIdCardPreview} alt="ID Card Preview" className="w-full max-w-md h-48 object-cover rounded-lg shadow-md" />
                  </div>
                )}
              </div>

              {/* 버튼 그룹 */}
              <div className="flex gap-3 pt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
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
                  Complete Registration
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
