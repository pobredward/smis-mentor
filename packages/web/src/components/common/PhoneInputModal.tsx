'use client';

import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import FormInput from './FormInput';

interface PhoneInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; phoneNumber: string }) => void;
  title?: string;
  description?: string;
  isLoading?: boolean;
  defaultName?: string; // Google에서 받아온 이름
}

export default function PhoneInputModal({
  isOpen,
  onClose,
  onSubmit,
  title = '본인 확인',
  description = '계정 확인을 위해 이름과 전화번호를 입력해주세요.',
  isLoading = false,
  defaultName = '',
}: PhoneInputModalProps) {
  const [name, setName] = useState(defaultName);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [errors, setErrors] = useState({ name: '', phone: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors = { name: '', phone: '' };
    
    // 이름 검증
    const trimmedName = name.trim();
    if (!trimmedName) {
      newErrors.name = '이름을 입력해주세요.';
    } else if (trimmedName.length < 2) {
      newErrors.name = '이름은 최소 2자 이상이어야 합니다.';
    } else if (trimmedName.length > 20) {
      newErrors.name = '이름은 20자 이하로 입력해주세요.';
    } else {
      // 한글, 영문만 허용 (공백 포함)
      const nameRegex = /^[가-힣a-zA-Z\s]+$/;
      if (!nameRegex.test(trimmedName)) {
        newErrors.name = '이름은 한글 또는 영문으로만 입력해주세요.';
      }
    }
    
    // 전화번호 검증 및 정규화
    let cleanPhone = phoneNumber.replace(/[^0-9]/g, ''); // 숫자만 추출
    
    if (!cleanPhone) {
      newErrors.phone = '전화번호를 입력해주세요.';
    } else {
      // 010 없이 10자리인 경우 (예: 1012345678 → 01012345678)
      if (cleanPhone.length === 10 && cleanPhone.startsWith('10')) {
        cleanPhone = '0' + cleanPhone;
      }
      
      // 국제번호 형식 처리 (예: +8201012345678 → 01012345678)
      if (cleanPhone.startsWith('82') && cleanPhone.length === 12) {
        cleanPhone = '0' + cleanPhone.substring(2);
      }
      
      // 최종 길이 검증
      if (cleanPhone.length !== 11) {
        newErrors.phone = '유효한 전화번호를 입력해주세요 (예: 01012345678)';
      }
      
      // 010, 011, 016, 017, 018, 019로 시작하는지 확인
      if (!cleanPhone.match(/^01[0-9]/)) {
        newErrors.phone = '올바른 휴대폰 번호 형식이 아닙니다.';
      }
    }
    
    if (newErrors.name || newErrors.phone) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({ name: '', phone: '' });
    onSubmit({ name: trimmedName, phoneNumber: cleanPhone });
  };

  const handleClose = () => {
    setName(defaultName);
    setPhoneNumber('');
    setErrors({ name: '', phone: '' });
    onClose();
  };

  // defaultName이 변경되면 name 업데이트
  useState(() => {
    setName(defaultName);
  });

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <p className="text-gray-600 text-sm mb-4">{description}</p>
        
        <FormInput
          label="이름"
          type="text"
          placeholder="이름을 입력하세요"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          autoFocus
        />
        
        <FormInput
          label="전화번호"
          type="tel"
          placeholder="'-' 없이 숫자만 입력하세요"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          error={errors.phone}
        />
        
        <div className="flex justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            취소
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
          >
            확인
          </Button>
        </div>
      </form>
    </Modal>
  );
}
