'use client';

import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import FormInput from './FormInput';

interface PasswordInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
  onForgotPassword?: () => void;
  email?: string;
  title?: string;
  description?: string;
  isLoading?: boolean;
}

export default function PasswordInputModal({
  isOpen,
  onClose,
  onSubmit,
  onForgotPassword,
  email,
  title = '비밀번호 확인',
  description = '계정 연동을 위해 기존 비밀번호를 입력해주세요.',
  isLoading = false,
}: PasswordInputModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // 비밀번호 검증
    if (!password) {
      setError('비밀번호를 입력해주세요.');
      return;
    }
    
    if (password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }
    
    setError('');
    onSubmit(password);
  };

  const handleClose = () => {
    setPassword('');
    setError('');
    onClose();
  };

  const handleForgotPassword = () => {
    handleClose();
    onForgotPassword?.();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div className="space-y-2 mb-4">
          <p className="text-gray-600 text-sm">{description}</p>
          {email && (
            <p className="text-gray-700 font-medium text-sm">
              이메일: <span className="text-blue-600">{email}</span>
            </p>
          )}
        </div>
        
        <FormInput
          label="비밀번호"
          type="password"
          placeholder="비밀번호를 입력하세요"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
          autoFocus
          showPasswordToggle
        />
        
        {onForgotPassword && (
          <button
            type="button"
            onClick={handleForgotPassword}
            className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
          >
            비밀번호를 잊으셨나요?
          </button>
        )}
        
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
