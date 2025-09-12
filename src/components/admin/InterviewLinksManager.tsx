'use client';

import { useState, useEffect } from 'react';
import Button from '@/components/common/Button';
import { getInterviewLinks, setInterviewLinks, validateUrl, InterviewLinks } from '@/lib/interviewLinksService';
import { toast } from 'react-hot-toast';

interface InterviewLinksManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (links: InterviewLinks) => void;
}

export function InterviewLinksManager({ isOpen, onClose, onUpdate }: InterviewLinksManagerProps) {
  const [links, setLinks] = useState<InterviewLinks>({
    zoomUrl: '',
    canvaUrl: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    zoomUrl?: string;
    canvaUrl?: string;
  }>({});

  useEffect(() => {
    if (isOpen) {
      loadLinks();
    }
  }, [isOpen]);

  const loadLinks = async () => {
    try {
      setLoading(true);
      const currentLinks = await getInterviewLinks();
      setLinks(currentLinks);
      setErrors({});
    } catch (error) {
      console.error('링크 로드 오류:', error);
      toast.error('링크를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const validateLinks = (): boolean => {
    const newErrors: typeof errors = {};
    
    if (!links.zoomUrl.trim()) {
      newErrors.zoomUrl = 'Zoom 링크를 입력해주세요.';
    } else if (!validateUrl(links.zoomUrl)) {
      newErrors.zoomUrl = '유효한 URL을 입력해주세요.';
    }

    if (!links.canvaUrl.trim()) {
      newErrors.canvaUrl = '캔바 링크를 입력해주세요.';
    } else if (!validateUrl(links.canvaUrl)) {
      newErrors.canvaUrl = '유효한 URL을 입력해주세요.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateLinks()) {
      return;
    }

    try {
      setLoading(true);
      await setInterviewLinks({
        zoomUrl: links.zoomUrl.trim(),
        canvaUrl: links.canvaUrl.trim(),
      });
      
      const updatedLinks = await getInterviewLinks();
      onUpdate(updatedLinks);
      toast.success('링크가 성공적으로 저장되었습니다.');
      onClose();
    } catch (error) {
      console.error('링크 저장 오류:', error);
      toast.error('링크를 저장하는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onClose();
    setErrors({});
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b">
          <h3 className="text-xl font-semibold text-gray-900">면접 링크 관리</h3>
          <p className="text-sm text-gray-600 mt-1">
            Zoom 회의실과 캔바 링크를 관리할 수 있습니다.
          </p>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          <div className="space-y-6">
            {/* Zoom 링크 */}
            <div>
              <label htmlFor="zoomUrl" className="block text-sm font-medium text-gray-700 mb-2">
                Zoom 회의실 링크
              </label>
              <input
                id="zoomUrl"
                type="url"
                value={links.zoomUrl}
                onChange={(e) => setLinks(prev => ({ ...prev, zoomUrl: e.target.value }))}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.zoomUrl ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="https://us06web.zoom.us/j/..."
                disabled={loading}
              />
              {errors.zoomUrl && (
                <p className="text-red-500 text-sm mt-1">{errors.zoomUrl}</p>
              )}
              <p className="text-gray-500 text-xs mt-1">
                Zoom 회의실 초대 링크를 입력하세요.
              </p>
            </div>

            {/* 캔바 링크 */}
            <div>
              <label htmlFor="canvaUrl" className="block text-sm font-medium text-gray-700 mb-2">
                캔바 링크
              </label>
              <input
                id="canvaUrl"
                type="url"
                value={links.canvaUrl}
                onChange={(e) => setLinks(prev => ({ ...prev, canvaUrl: e.target.value }))}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.canvaUrl ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="https://www.canva.com/design/..."
                disabled={loading}
              />
              {errors.canvaUrl && (
                <p className="text-red-500 text-sm mt-1">{errors.canvaUrl}</p>
              )}
              <p className="text-gray-500 text-xs mt-1">
                면접에서 사용할 캔바 디자인 링크를 입력하세요.
              </p>
            </div>

            {/* 업데이트 정보 */}
            {links.updatedAt && (
              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-sm text-gray-600">
                  마지막 업데이트: {links.updatedAt.toLocaleString('ko-KR')}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t flex justify-end space-x-3">
          <Button
            variant="secondary"
            onClick={handleCancel}
            disabled={loading}
          >
            취소
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? '저장 중...' : '저장'}
          </Button>
        </div>
      </div>
    </div>
  );
}
