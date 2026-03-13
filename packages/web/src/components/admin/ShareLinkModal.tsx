'use client';

import { useState, useEffect } from 'react';
import Button from '@/components/common/Button';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface ShareLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobBoardId: string;
  jobBoardTitle: string;
  selectedApplicationIds: string[];
  currentUserId: string;
}

export function ShareLinkModal({
  isOpen,
  onClose,
  jobBoardId,
  jobBoardTitle,
  selectedApplicationIds,
  currentUserId,
}: ShareLinkModalProps) {
  const [expirationHours, setExpirationHours] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // 시간을 분으로 변환하는 헬퍼 함수
  const hoursToMinutes = (hours: number) => hours * 60;
  const minutesToHours = (minutes: number) => minutes / 60;

  useEffect(() => {
    if (!isOpen) {
      setGeneratedLink(null);
      setExpiresAt(null);
      setIsCopied(false);
      setExpirationHours(1);
    }
  }, [isOpen]);

  const handleGenerate = async () => {
    if (selectedApplicationIds.length === 0) {
      toast.error('선택된 지원자가 없습니다.');
      return;
    }

    try {
      setIsGenerating(true);
      
      const response = await fetch('/api/share-applicants/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobBoardId,
          applicationIds: selectedApplicationIds,
          expirationHours,
          createdBy: currentUserId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '링크 생성에 실패했습니다.');
      }

      const data = await response.json();
      setGeneratedLink(data.shareUrl);
      setExpiresAt(data.expiresAt);
      toast.success('공유 링크가 생성되었습니다!');
    } catch (error) {
      console.error('링크 생성 오류:', error);
      toast.error(error instanceof Error ? error.message : '링크 생성에 실패했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    if (!generatedLink) return;

    try {
      await navigator.clipboard.writeText(generatedLink);
      setIsCopied(true);
      toast.success('링크가 클립보드에 복사되었습니다!');
      
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch (error) {
      toast.error('링크 복사에 실패했습니다.');
    }
  };

  const handleOpenLink = () => {
    if (generatedLink) {
      window.open(generatedLink, '_blank');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-xl font-bold text-gray-900">
              지원자 정보 공유 링크 생성
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 내용 */}
        <div className="px-4 sm:px-6 py-3 sm:py-4">
          {!generatedLink ? (
            <>
              {/* 정보 안내 */}
              <div className="mb-4 sm:mb-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <span className="text-blue-600 text-lg sm:text-xl flex-shrink-0">ℹ️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-blue-900 mb-1 sm:mb-2">임시 공유 링크란?</p>
                      <ul className="text-xs sm:text-sm text-blue-700 space-y-0.5 sm:space-y-1 list-disc list-inside">
                        <li>관리자가 아니어도 링크만 있으면 누구나 볼 수 있습니다</li>
                        <li>설정한 시간이 지나면 자동으로 만료됩니다</li>
                        <li>민감한 정보가 포함되어 있으니 신중하게 공유하세요</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* 캠프 정보 */}
              <div className="mb-4 sm:mb-6">
                <h3 className="text-xs sm:text-sm font-medium text-gray-700 mb-2">공유 정보</h3>
                <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                  <p className="text-sm sm:text-base font-semibold text-gray-900 mb-2 break-words">{jobBoardTitle}</p>
                  <p className="text-xs sm:text-sm text-gray-600">
                    공유할 지원자: <span className="font-semibold text-primary">{selectedApplicationIds.length}명</span>
                  </p>
                  {selectedApplicationIds.length === 1 && (
                    <p className="text-xs text-gray-500 mt-2">
                      이 지원자의 모든 정보 (기본정보, 학력, 경력, 자기소개, 평가점수)가 공유됩니다
                    </p>
                  )}
                </div>
              </div>

              {/* 만료 시간 설정 */}
              <div className="mb-4 sm:mb-6">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  링크 유효 시간
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {/* 10분 */}
                  <button
                    onClick={() => setExpirationHours(10 / 60)}
                    className={`px-2 sm:px-4 py-2 sm:py-3 rounded-lg border-2 transition-all text-xs sm:text-sm ${
                      expirationHours === 10 / 60
                        ? 'border-primary bg-primary/5 text-primary font-semibold'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    10분
                  </button>
                  {/* 30분 */}
                  <button
                    onClick={() => setExpirationHours(0.5)}
                    className={`px-2 sm:px-4 py-2 sm:py-3 rounded-lg border-2 transition-all text-xs sm:text-sm ${
                      expirationHours === 0.5
                        ? 'border-primary bg-primary/5 text-primary font-semibold'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    30분
                  </button>
                  {/* 1시간 */}
                  <button
                    onClick={() => setExpirationHours(1)}
                    className={`px-2 sm:px-4 py-2 sm:py-3 rounded-lg border-2 transition-all text-xs sm:text-sm ${
                      expirationHours === 1
                        ? 'border-primary bg-primary/5 text-primary font-semibold'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    1시간
                  </button>
                  {/* 3시간 */}
                  <button
                    onClick={() => setExpirationHours(3)}
                    className={`px-2 sm:px-4 py-2 sm:py-3 rounded-lg border-2 transition-all text-xs sm:text-sm ${
                      expirationHours === 3
                        ? 'border-primary bg-primary/5 text-primary font-semibold'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    3시간
                  </button>
                  {/* 24시간 */}
                  <button
                    onClick={() => setExpirationHours(24)}
                    className={`px-2 sm:px-4 py-2 sm:py-3 rounded-lg border-2 transition-all text-xs sm:text-sm ${
                      expirationHours === 24
                        ? 'border-primary bg-primary/5 text-primary font-semibold'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    1일
                  </button>
                  {/* 7일 */}
                  <button
                    onClick={() => setExpirationHours(168)}
                    className={`px-2 sm:px-4 py-2 sm:py-3 rounded-lg border-2 transition-all text-xs sm:text-sm ${
                      expirationHours === 168
                        ? 'border-primary bg-primary/5 text-primary font-semibold'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    7일
                  </button>
                </div>
              </div>

              {/* 생성 버튼 */}
              <div className="flex justify-end gap-2 sm:gap-3 pt-2">
                <Button
                  variant="secondary"
                  onClick={onClose}
                  disabled={isGenerating}
                  size="sm"
                >
                  취소
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || selectedApplicationIds.length === 0}
                  size="sm"
                >
                  {isGenerating ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-3 w-3 sm:h-4 sm:w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="text-xs sm:text-sm">생성 중...</span>
                    </>
                  ) : (
                    <span className="text-xs sm:text-sm">링크 생성</span>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* 생성 완료 */}
              <div className="mb-4 sm:mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <span className="text-green-600 text-lg sm:text-xl flex-shrink-0">✅</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-green-900 mb-1">링크가 생성되었습니다!</p>
                      <p className="text-xs sm:text-sm text-green-700">
                        이 링크를 통해 선택한 지원자 정보를 공유할 수 있습니다.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 만료 정보 */}
                {expiresAt && (
                  <div className="mb-3 sm:mb-4">
                    <p className="text-xs sm:text-sm text-gray-600 mb-1">만료 시간</p>
                    <p className="text-sm sm:text-base font-semibold text-gray-900">
                      {format(new Date(expiresAt), 'yyyy년 M월 d일 HH:mm', { locale: ko })}
                    </p>
                  </div>
                )}

                {/* 링크 */}
                <div className="mb-4 sm:mb-6">
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                    공유 링크
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={generatedLink}
                      readOnly
                      className="flex-1 px-2 sm:px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900 text-xs sm:text-sm min-w-0"
                    />
                    <Button
                      onClick={handleCopyLink}
                      className={`whitespace-nowrap text-xs sm:text-sm ${isCopied ? 'bg-green-600 hover:bg-green-700' : ''}`}
                      size="sm"
                    >
                      {isCopied ? (
                        <>
                          <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          복사됨
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          복사
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* 주의사항 */}
                <div className="mb-4 sm:mb-6">
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 sm:p-4">
                    <div className="flex items-start gap-2 sm:gap-3">
                      <span className="text-orange-600 text-lg sm:text-xl flex-shrink-0">⚠️</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-orange-900 mb-1">주의사항</p>
                        <ul className="text-xs sm:text-sm text-orange-700 space-y-0.5 sm:space-y-1 list-disc list-inside">
                          <li>이 링크는 만료 시간까지 누구나 접근할 수 있습니다</li>
                          <li>개인정보가 포함되어 있으니 신중하게 공유하세요</li>
                          <li>링크를 분실하거나 유출된 경우 관리자에게 문의하세요</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 액션 버튼 */}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2">
                <Button
                  variant="secondary"
                  onClick={handleOpenLink}
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  새 탭에서 열기
                </Button>
                <Button
                  onClick={onClose}
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  확인
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
