'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { generationResourcesService, ResourceLink } from '@/lib/generationResourcesService';

export default function EducationContent() {
  const { userData } = useAuth();
  const [educationLinks, setEducationLinks] = useState<ResourceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [isAddingLink, setIsAddingLink] = useState(false);

  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  const loadEducationLinks = useCallback(async () => {
    if (!activeJobCodeId) {
      console.log('⚠️ EducationContent: activeJobCodeId 없음');
      setLoading(false);
      return;
    }

    try {
      console.log('📥 EducationContent: 교육 링크 로드 시작 -', activeJobCodeId);
      setLoading(true);
      
      setEducationLinks([]);
      setSelectedLinkId(null);
      
      const resources = await generationResourcesService.getResourcesByJobCodeId(activeJobCodeId);
      
      if (resources?.educationLinks) {
        console.log('✅ EducationContent: 교육 링크 로드 성공 -', resources.educationLinks.length, '개');
        setEducationLinks(resources.educationLinks);
        if (resources.educationLinks.length > 0) {
          setSelectedLinkId(resources.educationLinks[0].id);
        }
      } else {
        console.log('⚠️ EducationContent: 해당 기수의 교육 링크 없음');
      }
    } catch (error) {
      console.error('❌ EducationContent: 교육 링크 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [activeJobCodeId]);

  useEffect(() => {
    console.log('🔄 EducationContent: activeJobCodeId 변경됨:', activeJobCodeId);
    if (activeJobCodeId) {
      loadEducationLinks();
    }
  }, [activeJobCodeId, loadEducationLinks]);

  const handleAddLink = async () => {
    if (!activeJobCodeId || !newLinkTitle.trim() || !newLinkUrl.trim()) {
      alert('제목과 URL을 모두 입력해주세요.');
      return;
    }

    try {
      setIsAddingLink(true);
      await generationResourcesService.addLink(
        activeJobCodeId,
        'educationLinks',
        newLinkTitle.trim(),
        newLinkUrl.trim(),
        userData?.userId || ''
      );
      await loadEducationLinks();
      setShowAddModal(false);
      setNewLinkTitle('');
      setNewLinkUrl('');
    } catch (error) {
      console.error('링크 추가 실패:', error);
      alert('링크 추가에 실패했습니다.');
    } finally {
      setIsAddingLink(false);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!activeJobCodeId) return;
    if (!confirm('이 링크를 삭제하시겠습니까?')) return;

    try {
      await generationResourcesService.deleteLink(activeJobCodeId, 'educationLinks', linkId);
      await loadEducationLinks();
    } catch (error) {
      console.error('링크 삭제 실패:', error);
      alert('링크 삭제에 실패했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
        <p className="mt-4 text-gray-600">교육 자료 로딩 중...</p>
      </div>
    );
  }

  if (educationLinks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
        <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <p className="text-gray-600 mb-4">등록된 교육 링크가 없습니다.</p>
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            + 첫 링크 추가하기
          </button>
        )}
      </div>
    );
  }

  const selectedLink = educationLinks.find(link => link.id === selectedLinkId);

  return (
    <div className="h-[calc(100vh-12rem)]">
      {/* 링크 선택 토글 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2 overflow-x-auto">
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors"
            title="링크 추가"
          >
            <span className="text-xl font-bold leading-none">+</span>
          </button>
        )}
        
        {educationLinks.map((link) => (
          <div key={link.id} className="flex items-center gap-1">
            <button
              onClick={() => setSelectedLinkId(link.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                selectedLinkId === link.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {link.title}
            </button>
            {isAdmin && (
              <button
                onClick={() => handleDeleteLink(link.id)}
                className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center hover:bg-red-200 transition-colors text-xs"
                title="삭제"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 선택된 링크 표시 - iframe으로 임베드 */}
      {selectedLink && (
        <div className="h-full bg-white">
          <iframe
            key={selectedLink.id}
            src={selectedLink.url}
            className="w-full h-full border-0"
            title={selectedLink.title}
            allowFullScreen
          />
        </div>
      )}

      {/* 링크 추가 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">교육 링크 추가</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewLinkTitle('');
                  setNewLinkUrl('');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
                <input
                  type="text"
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                  placeholder="예: 1주차 자료"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input
                  type="url"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewLinkTitle('');
                    setNewLinkUrl('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleAddLink}
                  disabled={isAddingLink || !newLinkTitle.trim() || !newLinkUrl.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAddingLink ? '추가 중...' : '추가'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
