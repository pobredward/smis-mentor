'use client';

import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import FormInput from './FormInput';

interface PhoneInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (phoneNumber: string) => void;
  title?: string;
  description?: string;
  isLoading?: boolean;
}

export default function PhoneInputModal({
  isOpen,
  onClose,
  onSubmit,
  title = '전화번호 입력',
  description = 'Google 계정에 연결된 전화번호를 입력해주세요.',
  isLoading = false,
}: PhoneInputModalProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // 전화번호 검증
    if (!phoneNumber) {
      setError('전화번호를 입력해주세요.');
      return;
    }
    
    if (phoneNumber.length < 10 || phoneNumber.length > 11) {
      setError('유효한 전화번호를 입력해주세요.');
      return;
    }
    
    setError('');
    onSubmit(phoneNumber);
  };

  const handleClose = () => {
    setPhoneNumber('');
    setError('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <p className="text-gray-600 text-sm mb-4">{description}</p>
        
        <FormInput
          label="전화번호"
          type="tel"
          placeholder="'-' 없이 숫자만 입력하세요"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          error={error}
          autoFocus
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
