'use client';

import React, { useState } from 'react';
import Button from '@/components/common/Button';
import { TemplateSelector } from './TemplateSelector';
import { TemplateType } from '@/lib/smsTemplateService';

interface SMSMessageBoxProps {
  title: string;
  type: TemplateType;
  message: string;
  onMessageChange: (message: string) => void;
  fromNumber: '01076567933' | '01067117933';
  onFromNumberChange: (number: '01076567933' | '01067117933') => void;
  currentJobBoardId: string;
  onSave: () => void;
  onSend: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isSending: boolean;
  backgroundColor?: string;
  buttonColor?: string;
}

export const SMSMessageBox: React.FC<SMSMessageBoxProps> = ({
  title,
  type,
  message,
  onMessageChange,
  fromNumber,
  onFromNumberChange,
  currentJobBoardId,
  onSave,
  onSend,
  onCancel,
  isSaving,
  isSending,
  backgroundColor = '#fef3c7',
  buttonColor = '#f59e0b',
}) => {
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  const handleTemplateSelect = (content: string) => {
    onMessageChange(content);
  };

  return (
    <>
      <div
        className="mt-4 p-4 rounded-lg border"
        style={{ backgroundColor, borderColor: buttonColor }}
      >
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
          <button
            onClick={() => setShowTemplateSelector(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            이전 템플릿 불러오기
          </button>
        </div>

        <textarea
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm min-h-[120px] focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          placeholder="메시지 내용을 입력하세요..."
        />

        {/* 발신번호 선택 */}
        <div className="mt-4">
          <label className="block text-xs font-semibold text-gray-700 mb-2">
            발신번호 선택
          </label>
          <div className="flex gap-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                value="01076567933"
                checked={fromNumber === '01076567933'}
                onChange={(e) => onFromNumberChange(e.target.value as '01076567933')}
                className="mr-2 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-sm text-gray-700">010-7656-7933 (대표)</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                value="01067117933"
                checked={fromNumber === '01067117933'}
                onChange={(e) => onFromNumberChange(e.target.value as '01067117933')}
                className="mr-2 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-sm text-gray-700">010-6711-7933</span>
            </label>
          </div>
        </div>

        {/* 버튼 */}
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={isSaving || isSending}>
            취소
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onSave}
            isLoading={isSaving}
            disabled={isSending}
          >
            템플릿 저장
          </Button>
          <Button
            size="sm"
            onClick={onSend}
            isLoading={isSending}
            disabled={isSaving}
            style={{ backgroundColor: buttonColor }}
            className="text-white hover:opacity-90"
          >
            SMS 전송
          </Button>
        </div>
      </div>

      {/* 템플릿 선택 모달 */}
      {showTemplateSelector && (
        <TemplateSelector
          type={type}
          currentJobBoardId={currentJobBoardId}
          onSelect={handleTemplateSelect}
          onClose={() => setShowTemplateSelector(false)}
        />
      )}
    </>
  );
};
