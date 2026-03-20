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
    if (!name.trim()) {
      newErrors.name = '이름을 입력해주세요.';
    } else if (name.trim().length < 2) {
      newErrors.name = '이름은 최소 2자 이상이어야 합니다.';
    }
    
    // 전화번호 검증
    if (!phoneNumber) {
      newErrors.phone = '전화번호를 입력해주세요.';
    } else if (phoneNumber.length < 10 || phoneNumber.length > 11) {
      newErrors.phone = '유효한 전화번호를 입력해주세요.';
    }
    
    if (newErrors.name || newErrors.phone) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({ name: '', phone: '' });
    onSubmit({ name: name.trim(), phoneNumber });
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
