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
import { FaUpload } from 'react-icons/fa';

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
    <Layout>
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-center mb-2">Foreign Teacher Sign Up</h1>
        <p className="text-gray-600 text-center mb-6">Please upload your account information and documents</p>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow-md rounded lg:px-8 px-4 pt-6 pb-8 mb-4">
          <div className="mb-4 text-sm font-medium text-gray-700">
            Step 2/2: Account Information & Documents
          </div>

          <FormInput
            label="Email"
            type="email"
            placeholder="Enter your email address"
            error={errors.email?.message}
            {...register('email')}
          />

          <div className="w-full mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className={`w-full px-3 py-2 border ${
                  errors.password ? 'border-red-500' : 'border-gray-300'
                } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
                placeholder="Enter your password"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-blue-600 text-sm font-medium"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
          </div>

          <div className="w-full mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-1">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                className={`w-full px-3 py-2 border ${
                  errors.confirmPassword ? 'border-red-500' : 'border-gray-300'
                } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
                placeholder="Re-enter your password"
                {...register('confirmPassword')}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-2.5 text-blue-600 text-sm font-medium"
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.confirmPassword && <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>}
          </div>

          <div className="border-t border-gray-200 my-6"></div>

          {/* 프로필 사진 */}
          <div className="w-full mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-1">
              Profile Photo *
            </label>
            <label className="flex items-center justify-center w-full px-4 py-3 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
              <FaUpload className="w-5 h-5 mr-2 text-blue-600" />
              <span className="text-sm text-blue-600 font-medium">
                {profileImage ? profileImage.name : 'Upload Profile Photo'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChange(e, setProfileImage, setProfileImagePreview)}
              />
            </label>
            {profileImagePreview && (
              <img src={profileImagePreview} alt="Profile Preview" className="mt-2 w-32 h-32 object-cover rounded-lg" />
            )}
          </div>

          {/* CV */}
          <div className="w-full mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-1">
              CV (PDF) *
            </label>
            <label className="flex items-center justify-center w-full px-4 py-3 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
              <FaUpload className="w-5 h-5 mr-2 text-blue-600" />
              <span className="text-sm text-blue-600 font-medium">
                {cvFile ? cvFile.name : 'Upload CV (PDF Format)'}
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
          <div className="w-full mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-1">
              Passport Photo *
            </label>
            <label className="flex items-center justify-center w-full px-4 py-3 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
              <FaUpload className="w-5 h-5 mr-2 text-blue-600" />
              <span className="text-sm text-blue-600 font-medium">
                {passportPhoto ? passportPhoto.name : 'Upload Passport Photo'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChange(e, setPassportPhoto, setPassportPhotoPreview)}
              />
            </label>
            {passportPhotoPreview && (
              <img src={passportPhotoPreview} alt="Passport Preview" className="mt-2 w-full h-48 object-cover rounded-lg" />
            )}
          </div>

          {/* 외국인등록증 */}
          <div className="w-full mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-1">
              Alien Registration Card (Optional)
            </label>
            <label className="flex items-center justify-center w-full px-4 py-3 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
              <FaUpload className="w-5 h-5 mr-2 text-gray-600" />
              <span className="text-sm text-gray-600 font-medium">
                {foreignIdCard ? foreignIdCard.name : 'Upload Alien Registration Card'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChange(e, setForeignIdCard, setForeignIdCardPreview)}
              />
            </label>
            {foreignIdCardPreview && (
              <img src={foreignIdCardPreview} alt="ID Card Preview" className="mt-2 w-full h-48 object-cover rounded-lg" />
            )}
          </div>

          <div className="flex items-center justify-between mt-6 space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Back
            </Button>
            <Button type="submit" variant="primary" fullWidth isLoading={isLoading}>
              Complete
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
