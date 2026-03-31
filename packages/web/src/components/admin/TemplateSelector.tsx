'use client';
import { logger } from '@smis-mentor/shared';

import React, { useState, useEffect } from 'react';
import { getTemplatesWithJobBoardInfo, TemplateType, SMSTemplate } from '@/lib/smsTemplateService';
import Button from '@/components/common/Button';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface TemplateSelectorProps {
  type: TemplateType;
  currentJobBoardId: string;
  onSelect: (content: string) => void;
  onClose: () => void;
}

interface TemplateWithJobBoard extends SMSTemplate {
  jobBoardTitle: string;
  jobBoardGeneration: string | null;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  type,
  currentJobBoardId,
  onSelect,
  onClose,
}) => {
  const [templates, setTemplates] = useState<TemplateWithJobBoard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, [type]);

  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      const data = await getTemplatesWithJobBoardInfo(type);
      
      // 현재 공고는 제외하고 표시
      const filtered = data.filter(t => t.refJobBoardId !== currentJobBoardId);
      setTemplates(filtered);
    } catch (error) {
      logger.error('템플릿 목록 로드 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (template: TemplateWithJobBoard) => {
    setSelectedTemplate(template.id || null);
  };

  const handleConfirm = () => {
    const template = templates.find(t => t.id === selectedTemplate);
    if (template) {
      onSelect(template.content);
      onClose();
    }
  };

  const getTypeLabel = (type: TemplateType): string => {
    const labels: Record<TemplateType, string> = {
      document_pass: '서류 합격',
      document_fail: '서류 불합격',
      interview_scheduled: '면접 예정',
      interview_pass: '면접 합격',
      interview_fail: '면접 불합격',
      final_pass: '최종 합격',
      final_fail: '최종 불합격',
    };
    return labels[type];
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 pb-20">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">
            이전 템플릿 불러오기 - {getTypeLabel(type)}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 템플릿 목록 */}
        <div className="flex-1 overflow-y-auto mb-4">
          {templates.length === 0 ? (
            <div className="text-center py-12">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="mt-2 text-sm text-gray-500">
                이전 공고의 템플릿이 없습니다.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    selectedTemplate === template.id
                      ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-500'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-gray-900">
                          {template.jobBoardTitle}
                        </h4>
                        {template.jobBoardGeneration && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                            {template.jobBoardGeneration}
                          </span>
                        )}
                        {!template.refJobBoardId && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                            공통
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        마지막 수정: {format(template.updatedAt.toDate(), 'yyyy년 MM월 dd일 HH:mm', { locale: ko })}
                      </p>
                    </div>
                    {selectedTemplate === template.id && (
                      <svg
                        className="w-6 h-6 text-amber-500 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                  
                  {/* 템플릿 미리보기 */}
                  <div className="mt-3 p-3 bg-white rounded border border-gray-200">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">
                      {template.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 버튼 */}
        <div className="flex gap-2 border-t pt-4">
          <Button
            variant="secondary"
            onClick={onClose}
            className="flex-1"
          >
            취소
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!selectedTemplate}
            className="flex-1"
          >
            선택한 템플릿 사용
          </Button>
        </div>
      </div>
    </div>
  );
};
