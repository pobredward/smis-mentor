'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { getUserByPhone } from '@/lib/firebaseService';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';

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
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step1FormValues>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      countryCode: '+82',
    },
  });
  
  const onSubmit = async (data: Step1FormValues) => {
    setIsLoading(true);
    try {
      const fullPhone = `${data.countryCode}${data.phoneNumber}`;
      const userByPhone = await getUserByPhone(fullPhone);

      if (userByPhone) {
        const { status } = userByPhone;
        
        if (status === 'temp') {
          toast.success('Welcome back! Please continue with your registration.', { duration: 3000 });
        } else if (status === 'active') {
          toast.error('This account already exists. Please return to the login page.');
          setIsLoading(false);
          return;
        }
      } else {
        toast.success(`Welcome ${data.firstName}! We're honored to have you with SMIS. Please complete the remaining information.`, { duration: 3000 });
      }

      router.push(`/sign-up/foreign/account?firstName=${encodeURIComponent(data.firstName)}&lastName=${encodeURIComponent(data.lastName)}&middleName=${encodeURIComponent(data.middleName || '')}&countryCode=${encodeURIComponent(data.countryCode)}&phone=${encodeURIComponent(data.phoneNumber)}`);
    } catch (error) {
      console.error('User information verification error:', error);
      toast.error('An error occurred while verifying user information.');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Layout>
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-center mb-2">Foreign Teacher Sign Up</h1>
        <p className="text-gray-600 text-center mb-6">Please enter your personal information</p>
        
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow-md rounded lg:px-8 px-6 pt-6 pb-8 mb-4">
          <div className="mb-2 text-sm font-medium text-gray-700">
            Step 1/2: Personal Information
          </div>
          
          <FormInput
            label="First Name"
            type="text"
            placeholder="First Name"
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          
          <FormInput
            label="Last Name"
            type="text"
            placeholder="Last Name"
            error={errors.lastName?.message}
            {...register('lastName')}
          />
          
          <FormInput
            label="Middle Name (Optional)"
            type="text"
            placeholder="Middle Name (Optional)"
            error={errors.middleName?.message}
            {...register('middleName')}
          />

          <div className="w-full mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-1">
              Phone Number
            </label>
            <div className="flex gap-2">
              <select
                className="w-24 px-2 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
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
                className={`flex-1 min-w-0 px-3 py-2 border ${
                  errors.phoneNumber ? 'border-red-500' : 'border-gray-300'
                } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
                placeholder="Phone Number"
                {...register('phoneNumber')}
              />
            </div>
            {errors.phoneNumber && (
              <p className="mt-1 text-sm text-red-600">{errors.phoneNumber.message}</p>
            )}
          </div>
          
          <div className="flex items-center justify-between mt-6 space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/sign-up')}
            >
              Back
            </Button>
            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isLoading}
            >
              Next
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
