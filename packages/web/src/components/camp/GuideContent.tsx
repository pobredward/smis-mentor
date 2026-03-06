'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { generationResourcesService, ResourceLink } from '@/lib/generationResourcesService';

const isEmbeddableUrl = (url: string): boolean => {
  return url.includes('/ebd//') || 
         url.includes('embed.notion.site') || 
         url.includes('docs.google.com/spreadsheets');
};

export default function GuideContent() {
  const { userData } = useAuth();
  const [guideLinks, setGuideLinks] = useState<ResourceLink[]>([]);
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
  const [iframeLoadedStates, setIframeLoadedStates] = useState<Record<string, boolean>>({});

  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  const loadGuideLinks = useCallback(async () => {
    if (!activeJobCodeId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      const resources = await generationResourcesService.getResourcesByJobCodeId(activeJobCodeId);
      
      if (resources?.guideLinks) {
        setGuideLinks(resources.guideLinks);
        if (resources.guideLinks.length > 0 && !selectedLinkId) {
          setSelectedLinkId(resources.guideLinks[0].id);
        }
      }
    } catch (error) {
      console.error('인솔표 링크 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [activeJobCodeId, selectedLinkId]);

  useEffect(() => {
    if (activeJobCodeId) {
      loadGuideLinks();
    }
  }, [activeJobCodeId, loadGuideLinks]);

  const handleAddLink = async () => {
    if (!activeJobCodeId || !newLinkTitle.trim() || !newLinkUrl.trim()) {
      alert('제목과 URL을 모두 입력해주세요.');
      return;
    }

    try {
      setIsAddingLink(true);
      await generationResourcesService.addLink(
        activeJobCodeId,
        'guideLinks',
        newLinkTitle.trim(),
        newLinkUrl.trim(),
        userData?.userId || ''
      );
      await loadGuideLinks();
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
    if (!confirm('이 인솔표를 삭제하시겠습니까?')) return;

    try {
      await generationResourcesService.deleteLink(activeJobCodeId, 'guideLinks', linkId);
      
      // 낙관적 UI 업데이트
      const newLinks = guideLinks.filter(link => link.id !== linkId);
      setGuideLinks(newLinks);
      
      if (selectedLinkId === linkId && newLinks.length > 0) {
        setSelectedLinkId(newLinks[0].id);
      }
    } catch (error) {
      console.error('인솔표 삭제 실패:', error);
      alert('인솔표 삭제에 실패했습니다.');
      await loadGuideLinks();
    }
  };

  const handleMoveLink = async (index: number, direction: 'left' | 'right') => {
    if (!activeJobCodeId) return;

    const newIndex = direction === 'left' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= guideLinks.length) return;

    try {
      const newLinks = [...guideLinks];
      const [removed] = newLinks.splice(index, 1);
      newLinks.splice(newIndex, 0, removed);

      // 낙관적 UI 업데이트
      setGuideLinks(newLinks);

      await generationResourcesService.reorderLinks(activeJobCodeId, 'guideLinks', newLinks);
    } catch (error) {
      console.error('순서 변경 실패:', error);
      alert('순서 변경에 실패했습니다.');
      await loadGuideLinks();
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
      const updatedLinks = guideLinks.map(link =>
        link.id === editingLink.id
          ? { ...link, title: editTitle.trim(), url: editUrl.trim() }
          : link
      );

      // 낙관적 UI 업데이트
      setGuideLinks(updatedLinks);
      setShowEditModal(false);

      await generationResourcesService.reorderLinks(activeJobCodeId, 'guideLinks', updatedLinks);
      alert('인솔표가 수정되었습니다.');
    } catch (error) {
      console.error('인솔표 수정 실패:', error);
      alert('인솔표 수정에 실패했습니다.');
      await loadGuideLinks();
    }
  };

  const selectedLink = guideLinks.find(link => link.id === selectedLinkId);

  const handleIframeLoad = (linkId: string) => {
    setIframeLoadedStates(prev => ({ ...prev, [linkId]: true }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">인솔표 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (guideLinks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
        <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">등록된 인솔표가 없습니다</h3>
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 첫 인솔표 추가하기
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className={`bg-white border-b border-gray-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto ${editMode ? 'bg-amber-50 border-amber-500 border-b-2' : ''}`}
        style={editMode ? { paddingTop: '32px', paddingBottom: '26px' } : {}}
      >
        {isAdmin && (
          <>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all bg-blue-600 text-white hover:bg-blue-700"
              title="인솔표 추가"
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
        
        {guideLinks.map((link, index) => (
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
              onClick={() => {
                if (!editMode) {
                  setSelectedLinkId(link.id);
                }
              }}
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
                    className="w-5 h-5 rounded bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white text-xs font-bold shadow-md shadow-blue-600/30"
                    title="왼쪽으로"
                  >
                    ←
                  </button>
                )}
                {index < guideLinks.length - 1 && (
                  <button
                    onClick={() => handleMoveLink(index, 'right')}
                    className="w-5 h-5 rounded bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white text-xs font-bold shadow-md shadow-blue-600/30"
                    title="오른쪽으로"
                  >
                    →
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-4 bg-gray-50">
        <div className="bg-white rounded-lg shadow-sm overflow-hidden relative" style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
          {/* 모든 iframe을 항상 렌더링하고 opacity와 z-index로만 전환 */}
          {guideLinks.map((link) => {
            const isSelected = selectedLinkId === link.id;
            const isLoaded = iframeLoadedStates[link.id];
            
            if (isEmbeddableUrl(link.url)) {
              return (
                <div 
                  key={link.id} 
                  className="absolute inset-0 transition-opacity duration-0"
                  style={{ 
                    opacity: isSelected ? 1 : 0,
                    zIndex: isSelected ? 1 : -1,
                    pointerEvents: isSelected ? 'auto' : 'none'
                  }}
                >
                  {!isLoaded && (
                    <div 
                      className="absolute inset-0 flex items-center justify-center bg-gray-50"
                      style={{ 
                        zIndex: 10,
                        opacity: isSelected ? 1 : 0
                      }}
                    >
                      <div className="text-center">
                        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-sm text-gray-600">인솔표 로딩 중...</p>
                      </div>
                    </div>
                  )}
                  <iframe
                    src={link.url}
                    className="w-full h-full border-0"
                    title={link.title}
                    onLoad={() => handleIframeLoad(link.id)}
                  />
                </div>
              );
            } else if (isSelected) {
              return (
                <div 
                  key={link.id} 
                  className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center"
                  style={{ 
                    opacity: 1,
                    zIndex: 1
                  }}
                >
                  <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <p className="text-gray-600 mb-4">이 링크는 새 탭에서 열어주세요</p>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    새 탭에서 열기
                  </a>
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">인솔표 추가</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  제목
                </label>
                <input
                  type="text"
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                  placeholder="예: 1주차 인솔표"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  URL
                </label>
                <input
                  type="url"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            
            <div className="flex gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                취소
              </button>
              <button
                onClick={handleAddLink}
                disabled={isAddingLink}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
              >
                {isAddingLink ? '추가 중...' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">인솔표 수정</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  제목
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="예: 1주차 인솔표"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  URL
                </label>
                <input
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            
            <div className="flex gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                취소
              </button>
              <button
                onClick={handleEditLink}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
