'use client';

import Modal from './Modal';
import { FaGraduationCap, FaGlobe } from 'react-icons/fa';

interface RoleSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRole: (role: 'mentor' | 'foreign') => void;
  provider?: 'google' | 'kakao' | 'naver';
}

export default function RoleSelectionModal({
  isOpen,
  onClose,
  onSelectRole,
  provider = 'google',
}: RoleSelectionModalProps) {
  // 제공자별 표시 이름
  const providerNames = {
    google: 'Google',
    kakao: '카카오',
    naver: '네이버',
  };

  const providerName = providerNames[provider];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Select Your Role">
      <div className="p-6">
        <p className="text-gray-600 text-center mb-6">
          Please select your role to continue with {providerName} Sign In
        </p>
        
        <div className="flex flex-col gap-4">
          {/* 멘토 버튼 */}
          <button
            onClick={() => onSelectRole('mentor')}
            className="flex items-center bg-white border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 rounded-xl p-4 transition-all group"
          >
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mr-4 group-hover:bg-blue-100">
              <FaGraduationCap className="w-6 h-6 text-blue-500" />
            </div>
            <div className="text-left flex-1">
              <h3 className="text-lg font-bold text-gray-800">대학생 멘토</h3>
              <p className="text-sm text-gray-600">Korean University Student Mentor</p>
            </div>
          </button>

          {/* 원어민 버튼 */}
          <button
            onClick={() => onSelectRole('foreign')}
            className="flex items-center bg-white border-2 border-gray-200 hover:border-green-500 hover:bg-green-50 rounded-xl p-4 transition-all group"
          >
            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mr-4 group-hover:bg-green-100">
              <FaGlobe className="w-6 h-6 text-green-600" />
            </div>
            <div className="text-left flex-1">
              <h3 className="text-lg font-bold text-gray-800">Foreign Teacher</h3>
              <p className="text-sm text-gray-600">Native English Speaker</p>
            </div>
          </button>
        </div>
      </div>
    </Modal>
  );
}
