import React from 'react';

type LoadingProps = {
  fullScreen?: boolean;
  message?: string;
  size?: 'small' | 'medium' | 'large';
};

export default function Loading({ 
  fullScreen = false, 
  message = '로딩 중...', 
  size = 'medium'
}: LoadingProps) {
  const getSpinnerSize = () => {
    switch (size) {
      case 'small': return 'h-6 w-6';
      case 'large': return 'h-16 w-16';
      default: return 'h-12 w-12';
    }
  };

  const spinner = (
    <div className={`animate-spin rounded-full ${getSpinnerSize()} border-b-2 border-gray-900`}></div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white bg-opacity-75 z-50">
        <div className="text-center">
          {spinner}
          {message && <p className="mt-4 text-gray-600">{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-8">
      {spinner}
      {message && <p className="mt-4 text-gray-600">{message}</p>}
    </div>
  );
} 