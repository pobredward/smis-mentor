'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { generationResourcesService, ResourceLink } from '@/lib/generationResourcesService';

// Notion 및 Google Sheets 임베드 가능 여부 확인
const isEmbeddableUrl = (url: string): boolean => {
  return url.includes('/ebd//') || 
         url.includes('embed.notion.site') || 
         url.includes('docs.google.com/spreadsheets');
};

export default function EducationContent() {
  const { userData } = useAuth();
  const [educationLinks, setEducationLinks] = useState<ResourceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLink, setEditingLink] = useState<ResourceLink | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');

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

  const handleMoveLink = async (index: number, direction: 'left' | 'right') => {
    if (!activeJobCodeId) return;
    
    const newIndex = direction === 'left' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= educationLinks.length) return;

    try {
      const newLinks = [...educationLinks];
      const [removed] = newLinks.splice(index, 1);
      newLinks.splice(newIndex, 0, removed);

      await generationResourcesService.reorderLinks(activeJobCodeId, 'educationLinks', newLinks);
      setEducationLinks(newLinks);
    } catch (error) {
      console.error('순서 변경 실패:', error);
      alert('순서 변경에 실패했습니다.');
    }
  };

  const openEditModalDirectly = (link: ResourceLink) => {
    setEditingLink(link);
    setEditTitle(link.title);
    setEditUrl(link.url);
    setShowEditModal(true);
  };

  const handleEditLink = async () => {
    if (!activeJobCodeId || !editingLink || !editTitle.trim() || !editUrl.trim()) {
      alert('제목과 URL을 모두 입력해주세요.');
      return;
    }

    try {
      const updatedLinks = educationLinks.map(link =>
        link.id === editingLink.id
          ? { ...link, title: editTitle.trim(), url: editUrl.trim() }
          : link
      );

      await generationResourcesService.reorderLinks(activeJobCodeId, 'educationLinks', updatedLinks);
      setEducationLinks(updatedLinks);
      setShowEditModal(false);
      alert('링크가 수정되었습니다.');
    } catch (error) {
      console.error('링크 수정 실패:', error);
      alert('링크 수정에 실패했습니다.');
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
      <>
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

        {/* 링크 추가 모달 */}
        {isAdmin && showAddModal && (
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
                    placeholder="예: 교육일정"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    임베드 URL
                    <span className="text-xs text-gray-500 ml-2">
                      (Notion 공유 → 이 페이지 임베드 → iframe src)
                    </span>
                  </label>
                  <input
                    type="url"
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    placeholder="https://smis.notion.site/ebd//..."
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
      </>
    );
  }

  const selectedLink = educationLinks.find(link => link.id === selectedLinkId);
  const canEmbed = selectedLink ? isEmbeddableUrl(selectedLink.url) : false;

  return (
    <div className="h-[calc(100vh-12rem)] w-full">
      {/* 링크 선택 토글 */}
      <div className={`bg-white border-b border-gray-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto ${editMode ? 'bg-amber-50 border-amber-500 border-b-2' : ''}`}
        style={editMode ? { paddingTop: '32px', paddingBottom: '26px' } : {}}
      >
        {isAdmin && (
          <>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all bg-blue-600 text-white hover:bg-blue-700"
              title="링크 추가"
            >
              <span className="text-lg font-bold leading-none">+</span>
            </button>
            
            <button
              onClick={() => setEditMode(!editMode)}
              className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                editMode ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-gray-200 hover:bg-gray-300'
              }`}
              title="편집 모드"
            >
              <span className="text-sm">✏️</span>
            </button>
          </>
        )}
        
        {educationLinks.map((link, index) => (
          <div key={link.id} className="relative" style={{ marginLeft: '3px', marginRight: '3px' }}>
            {editMode && (
              <div className="absolute -top-6 left-0 right-0 flex items-center justify-center gap-1 z-10">
                <button
                  onClick={() => openEditModalDirectly(link)}
                  className="w-5 h-5 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-md shadow-green-500/30"
                  title="수정"
                >
                  <span className="text-xs">✏️</span>
                </button>
                
                <button
                  onClick={() => handleDeleteLink(link.id)}
                  className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-md shadow-red-500/30"
                  title="삭제"
                >
                  <span className="text-sm font-bold leading-none">✕</span>
                </button>
              </div>
            )}
            
            <button
              onClick={() => !editMode && setSelectedLinkId(link.id)}
              disabled={editMode}
              className={`px-2 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                editMode
                  ? 'bg-white border-2 border-amber-500 border-dashed text-gray-700'
                  : selectedLinkId === link.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              } ${editMode ? 'cursor-default' : ''}`}
            >
              {link.title}
            </button>
            
            {editMode && (
              <div className="absolute -bottom-5 left-0 right-0 flex items-center justify-center gap-1 z-10">
                {index > 0 && (
                  <button
                    onClick={() => handleMoveLink(index, 'left')}
                    className="px-1.5 py-0.5 rounded bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold shadow-md shadow-blue-500/30"
                    title="왼쪽으로 이동"
                  >
                    ←
                  </button>
                )}
                {index < educationLinks.length - 1 && (
                  <button
                    onClick={() => handleMoveLink(index, 'right')}
                    className="px-1.5 py-0.5 rounded bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold shadow-md shadow-blue-500/30"
                    title="오른쪽으로 이동"
                  >
                    →
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 선택된 링크 표시 */}
      {selectedLink && (
        canEmbed ? (
          // 임베드 가능한 URL - iframe으로 표시
          <div className="h-full bg-white w-full">
            <iframe
              key={selectedLink.id}
              src={selectedLink.url}
              className="w-full h-full border-0"
              title={selectedLink.title}
              allowFullScreen
            />
          </div>
        ) : (
          // 임베드 불가능한 URL - 새 탭으로 열기 안내
          <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-blue-50 to-indigo-50 p-8 w-full">
            <div className="max-w-md w-full bg-white rounded-xl shadow-xl p-8 text-center border border-gray-200">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">{selectedLink.title}</h3>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-yellow-800 mb-2">
                  <strong>⚠️ 임베드 URL이 필요합니다</strong>
                </p>
                <p className="text-xs text-yellow-700 text-left">
                  1. Notion 페이지에서 "공유" 클릭<br />
                  2. "웹에 게시" 활성화<br />
                  3. "이 페이지 임베드" 복사<br />
                  4. iframe의 src URL만 사용
                </p>
              </div>
              <a
                href={selectedLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all font-semibold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                <span>새 탭에서 열기</span>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        )
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

      {/* 링크 수정 모달 */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">링크 수정</h3>
              <button
                onClick={() => setShowEditModal(false)}
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
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="예: 교육일정"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleEditLink}
                  disabled={!editTitle.trim() || !editUrl.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
