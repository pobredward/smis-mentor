'use client';

import { useState, useEffect } from 'react';
import Modal from './Modal';
import Button from './Button';
import FormInput from './FormInput';

const countryCodes = [
  { code: '+82', country: 'South Korea', flag: '🇰🇷' },
  { code: '+1', country: 'USA/Canada', flag: '🇺🇸' },
  { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
  { code: '+353', country: 'Ireland', flag: '🇮🇪' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
  { code: '+64', country: 'New Zealand', flag: '🇳🇿' },
  { code: '+27', country: 'South Africa', flag: '🇿🇦' },
];

interface ForeignPhoneInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    firstName: string;
    lastName: string;
    middleName?: string;
    countryCode: string;
    phoneNumber: string;
  }) => void;
  title?: string;
  description?: string;
  isLoading?: boolean;
  defaultName?: string; // Google에서 받아온 전체 이름
}

export default function ForeignPhoneInputModal({
  isOpen,
  onClose,
  onSubmit,
  title = 'Identity Verification',
  description = 'Please enter your name and phone number to verify your account.',
  isLoading = false,
  defaultName = '',
}: ForeignPhoneInputModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [countryCode, setCountryCode] = useState('+82');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [errors, setErrors] = useState({
    firstName: '',
    lastName: '',
    phone: '',
  });

  // Google 이름 자동 분리
  useEffect(() => {
    if (defaultName) {
      const parts = defaultName.trim().split(/\s+/);
      if (parts.length >= 2) {
        setFirstName(parts[0]);
        setLastName(parts[parts.length - 1]);
        if (parts.length > 2) {
          setMiddleName(parts.slice(1, -1).join(' '));
        }
      } else if (parts.length === 1) {
        setFirstName(parts[0]);
      }
    }
  }, [defaultName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors = { firstName: '', lastName: '', phone: '' };
    
    // First Name 검증
    const trimmedFirstName = firstName.trim();
    if (!trimmedFirstName) {
      newErrors.firstName = 'Please enter your first name.';
    } else if (trimmedFirstName.length < 2) {
      newErrors.firstName = 'First name must be at least 2 characters.';
    } else if (!/^[a-zA-Z\s'-]+$/.test(trimmedFirstName)) {
      newErrors.firstName = 'Please use only English letters.';
    }
    
    // Last Name 검증
    const trimmedLastName = lastName.trim();
    if (!trimmedLastName) {
      newErrors.lastName = 'Please enter your last name.';
    } else if (trimmedLastName.length < 2) {
      newErrors.lastName = 'Last name must be at least 2 characters.';
    } else if (!/^[a-zA-Z\s'-]+$/.test(trimmedLastName)) {
      newErrors.lastName = 'Please use only English letters.';
    }
    
    // 전화번호 검증 및 정규화
    let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    
    if (!cleanPhone) {
      newErrors.phone = 'Please enter your phone number.';
    } else {
      // 한국 번호: 010으로 시작, 11자리
      if (countryCode === '+82') {
        if (cleanPhone.length === 10 && cleanPhone.startsWith('10')) {
          cleanPhone = '0' + cleanPhone;
        }
        if (cleanPhone.length !== 11 || !cleanPhone.match(/^01[0-9]/)) {
          newErrors.phone = 'Please enter a valid Korean phone number (e.g., 01012345678).';
        }
      } else {
        // 기타 국가: 최소 8자리
        if (cleanPhone.length < 8) {
          newErrors.phone = 'Please enter a valid phone number (minimum 8 digits).';
        }
      }
    }
    
    if (newErrors.firstName || newErrors.lastName || newErrors.phone) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({ firstName: '', lastName: '', phone: '' });
    onSubmit({
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      middleName: middleName.trim() || undefined,
      countryCode,
      phoneNumber: cleanPhone,
    });
  };

  const handleClose = () => {
    setFirstName('');
    setLastName('');
    setMiddleName('');
    setCountryCode('+82');
    setPhoneNumber('');
    setErrors({ firstName: '', lastName: '', phone: '' });
    onClose();
  };

  const getPhonePlaceholder = (code: string) => {
    switch (code) {
      case '+82':
        return '01012345678';
      case '+1':
        return '5551234567';
      case '+44':
        return '7911123456';
      default:
        return 'Enter phone number';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <p className="text-gray-600 text-sm mb-4">{description}</p>
        
        <FormInput
          label="First Name"
          type="text"
          placeholder="Enter your first name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          error={errors.firstName}
          autoFocus
        />
        
        <FormInput
          label="Middle Name (Optional)"
          type="text"
          placeholder="Enter your middle name (optional)"
          value={middleName}
          onChange={(e) => setMiddleName(e.target.value)}
        />
        
        <FormInput
          label="Last Name"
          type="text"
          placeholder="Enter your last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          error={errors.lastName}
        />
        
        <div>
          <label className="block text-gray-700 text-sm font-medium mb-2">
            Phone Number
          </label>
          <div className="flex gap-2">
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
            >
              {countryCodes.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.flag} {item.code}
                </option>
              ))}
            </select>
            <input
              type="tel"
              className={`flex-1 px-4 py-2 border ${
                errors.phone ? 'border-red-500' : 'border-gray-300'
              } rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500`}
              placeholder={getPhonePlaceholder(countryCode)}
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>
          {errors.phone && (
            <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
          )}
        </div>
        
        <div className="flex justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
            className="bg-green-600 hover:bg-green-700"
          >
            Confirm
          </Button>
        </div>
      </form>
    </Modal>
  );
}
