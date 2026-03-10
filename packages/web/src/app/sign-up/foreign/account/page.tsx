'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { getUserByEmail } from '@/lib/firebaseService';
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
        <div className="max-w-md mx-auto text-center">
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
    // 필수 파일 확인
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

    setIsLoading(true);
    try {
      const existingUser = await getUserByEmail(data.email);
      if (existingUser) {
        toast.error('This email is already in use.');
        setIsLoading(false);
        return;
      }

      // TODO: 실제 파일 업로드 및 회원가입 로직 구현
      toast.success('Foreign Teacher registration completed! You can log in after admin approval.', { duration: 5000 });
      router.push('/sign-in');
    } catch (error) {
      console.error('Sign up error:', error);
      toast.error('An error occurred during sign up.');
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
