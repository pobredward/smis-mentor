'use client';

import { logger } from '@smis-mentor/shared';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { generationResourcesService, type ResourceLinkRole, type LinkType, type ResourceLink } from '@/lib/generationResourcesService';
import type { CampPageRole } from '@smis-mentor/shared';
import toast from 'react-hot-toast';

interface CampLinkListProps {
  linkType: LinkType;
  categoryTitle: string;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyDescription: string[];
}

const getRoleBgColor = (targetRole?: ResourceLinkRole): string => {
  switch (targetRole) {
    case 'mentor': return 'bg-blue-100/50';
    case 'foreign': return 'bg-purple-100/50';
    default: return 'bg-gray-100/50';
  }
};

const getRoleActiveBgColor = (targetRole?: ResourceLinkRole): string => {
  switch (targetRole) {
    case 'mentor': return 'bg-blue-500';
    case 'foreign': return 'bg-purple-500';
    default: return 'bg-blue-600';
  }
};

export default function CampLinkList({
  linkType,
  categoryTitle,
  emptyIcon,
  emptyTitle,
  emptyDescription,
}: CampLinkListProps) {
  const { userData } = useAuth();
  const [links, setLinks] = useState<ResourceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newTargetRole, setNewTargetRole] = useState<ResourceLinkRole>('common');
  const [zoom, setZoom] = useState(100);
  const [editingLink, setEditingLink] = useState<ResourceLink | null>(null);
  const [editLinkTitle, setEditLinkTitle] = useState('');
  const [editLinkUrl, setEditLinkUrl] = useState('');
  const [editLinkTargetRole, setEditLinkTargetRole] = useState<ResourceLinkRole>('common');

  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  const filteredLinks = links.filter(link => {
    if (isAdmin) return true;
    if (!link.targetRole || link.targetRole === 'common') return true;
    if (userData?.role === 'mentor' && link.targetRole === 'mentor') return true;
    if (userData?.role === 'foreign' && link.targetRole === 'foreign') return true;
    return false;
  });

  const loadLinks = useCallback(async () => {
    if (!activeJobCodeId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setLinks([]);
      setSelectedLinkId(null);
      
      const resources = await generationResourcesService.getResourcesByJobCodeId(activeJobCodeId);
      if (resources && resources[linkType]) {
        const loadedLinks = resources[linkType];
        setLinks(loadedLinks);
        
        const filtered = loadedLinks.filter(link => {
          if (isAdmin) return true;
          if (!link.targetRole || link.targetRole === 'common') return true;
          if (userData?.role === 'mentor' && link.targetRole === 'mentor') return true;
          if (userData?.role === 'foreign' && link.targetRole === 'foreign') return true;
          return false;
        });
        
        if (filtered.length > 0) {
          setSelectedLinkId(filtered[0].id);
        }
      }
    } catch (error) {
      logger.error(`${linkType} 로드 실패:`, error);
      toast.error('자료를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [activeJobCodeId, linkType, isAdmin, userData?.role]);

  useEffect(() => {
    if (activeJobCodeId) {
      loadLinks();
    } else {
      setLoading(false);
    }
  }, [activeJobCodeId, loadLinks]);

  const selectedLink = links.find(link => link.id === selectedLinkId);

  const handleAddLink = async () => {
    if (!activeJobCodeId || !newTitle.trim() || !newUrl.trim() || !userData?.userId) {
      toast.error('제목과 URL을 입력해주세요.');
      return;
    }

    try {
      await generationResourcesService.addLink(
        activeJobCodeId,
        linkType,
        newTitle.trim(),
        newUrl.trim(),
        userData.userId,
        newTargetRole
      );
      
      setShowAddModal(false);
      setNewTitle('');
      setNewUrl('');
      setNewTargetRole('common');
      await loadLinks();
      toast.success('추가되었습니다.');
    } catch (error) {
      logger.error('링크 추가 실패:', error);
      toast.error('추가에 실패했습니다.');
    }
  };

  const handleDeleteLink = async (link: ResourceLink) => {
    if (!activeJobCodeId || !confirm(`"${link.title}"을(를) 삭제하시겠습니까?`)) return;

    try {
      await generationResourcesService.deleteLink(activeJobCodeId, linkType, link.id);
      await loadLinks();
      toast.success('삭제되었습니다.');
    } catch (error) {
      logger.error('링크 삭제 실패:', error);
      toast.error('삭제에 실패했습니다.');
    }
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 10, 200));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 10, 50));
  };

  const handleResetZoom = () => {
    setZoom(100);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
        <p className="mt-4 text-gray-600">자료 로딩 중...</p>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <p className="text-center">로그인 후 이용 가능합니다.</p>
      </div>
    );
  }

  if (!activeJobCodeId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
        {emptyIcon}
        <h3 className="text-lg font-semibold text-gray-900 mb-2">활성 캠프를 선택해주세요</h3>
        {emptyDescription.map((line, i) => (
          <p key={i} className="text-sm text-gray-600">{line}</p>
        ))}
      </div>
    );
  }

  if (filteredLinks.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
          {emptyIcon}
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{emptyTitle}</h3>
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              + 첫 자료 추가하기
            </button>
          )}
        </div>

        {isAdmin && showAddModal && (
          <AddModal
            showAddModal={showAddModal}
            setShowAddModal={setShowAddModal}
            newTitle={newTitle}
            setNewTitle={setNewTitle}
            newUrl={newUrl}
            setNewUrl={setNewUrl}
            newTargetRole={newTargetRole}
            setNewTargetRole={setNewTargetRole}
            handleAddLink={handleAddLink}
          />
        )}
      </>
    );
  }

  const handleMoveLeft = (linkId: string) => {
    const index = links.findIndex(l => l.id === linkId);
    if (index > 0 && activeJobCodeId) {
      const newLinks = [...links];
      [newLinks[index - 1], newLinks[index]] = [newLinks[index], newLinks[index - 1]];
      generationResourcesService.reorderLinks(activeJobCodeId, linkType, newLinks)
        .then(() => {
          setLinks(newLinks);
        })
        .catch((error) => {
          logger.error('순서 변경 실패:', error);
          toast.error('순서 변경에 실패했습니다.');
        });
    }
  };

  const handleMoveRight = (linkId: string) => {
    const index = links.findIndex(l => l.id === linkId);
    if (index < links.length - 1 && activeJobCodeId) {
      const newLinks = [...links];
      [newLinks[index], newLinks[index + 1]] = [newLinks[index + 1], newLinks[index]];
      generationResourcesService.reorderLinks(activeJobCodeId, linkType, newLinks)
        .then(() => {
          setLinks(newLinks);
        })
        .catch((error) => {
          logger.error('순서 변경 실패:', error);
          toast.error('순서 변경에 실패했습니다.');
        });
    }
  };

  const handleStartEditLink = (link: ResourceLink) => {
    setEditingLink(link);
    setEditLinkTitle(link.title);
    setEditLinkUrl(link.url);
    setEditLinkTargetRole(link.targetRole || 'common');
  };

  const handleSaveEditLink = async () => {
    if (!editingLink || !activeJobCodeId || !editLinkTitle.trim() || !editLinkUrl.trim()) {
      toast.error('제목과 URL을 입력해주세요.');
      return;
    }

    try {
      const updatedLink: ResourceLink = {
        ...editingLink,
        title: editLinkTitle.trim(),
        url: editLinkUrl.trim(),
        targetRole: editLinkTargetRole,
      };

      const updatedLinks = links.map(l => l.id === editingLink.id ? updatedLink : l);
      await generationResourcesService.reorderLinks(activeJobCodeId, linkType, updatedLinks);
      
      setLinks(updatedLinks);
      setEditingLink(null);
      toast.success('수정되었습니다.');
    } catch (error) {
      logger.error('링크 수정 실패:', error);
      toast.error('수정에 실패했습니다.');
    }
  };

  return (
    <div className="h-[calc(100vh-12rem)] w-full flex flex-col">
      <div className={`bg-white border-b border-gray-200 px-3 flex flex-col sm:flex-row sm:items-center relative ${editMode ? 'bg-amber-50 border-amber-500 border-b-2 py-2' : 'py-2'}`} style={editMode ? { overflow: 'visible' } : {}}>
        {/* 스크롤 가능한 탭 영역 */}
        <div className={`flex items-center gap-1 sm:gap-1.5 flex-1 sm:pr-20 ${editMode ? '' : 'overflow-x-auto'}`} style={editMode ? { overflowX: 'auto', overflowY: 'visible' } : {}}>
          {isAdmin && (
            <>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex-shrink-0 w-5 h-5 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition-all bg-blue-600 text-white hover:bg-blue-700"
                title="자료 추가"
              >
                <span className="text-sm sm:text-lg font-bold leading-none">+</span>
              </button>
              
              <button
                onClick={() => setEditMode(!editMode)}
                className={`flex-shrink-0 w-5 h-5 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition-all ${
                  editMode ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-gray-200 hover:bg-gray-300'
                }`}
                title="편집 모드"
              >
                <span className="text-xs sm:text-sm">✏️</span>
              </button>
            </>
          )}
          
          {filteredLinks.map((link, index) => (
            <div key={link.id} className="relative" style={{ marginLeft: '2px', marginRight: '2px', paddingTop: editMode ? '28px' : '0', paddingBottom: editMode ? '24px' : '0' }}>
              {editMode && isAdmin && (
                <>
                  {/* 위쪽: 수정, 삭제 버튼 */}
                  <div className="absolute top-1 left-0 right-0 flex items-center justify-center gap-1 z-50">
                    <button
                      onClick={() => handleStartEditLink(link)}
                      className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white shadow-md"
                      title="수정"
                    >
                      <span className="text-[10px] sm:text-xs leading-none">✎</span>
                    </button>
                    <button
                      onClick={() => handleDeleteLink(link)}
                      className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-md shadow-red-500/30"
                      title="삭제"
                    >
                      <span className="text-xs sm:text-sm font-bold leading-none">✕</span>
                    </button>
                  </div>

                  {/* 아래쪽: 화살표 버튼 */}
                  <div className="absolute bottom-1 left-0 right-0 flex items-center justify-center gap-1 z-50">
                    <button
                      onClick={() => handleMoveLeft(link.id)}
                      disabled={index === 0}
                      className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center text-white shadow-md disabled:opacity-30 disabled:cursor-not-allowed"
                      title="왼쪽으로 이동"
                    >
                      <span className="text-[10px] sm:text-xs font-bold leading-none">←</span>
                    </button>
                    <button
                      onClick={() => handleMoveRight(link.id)}
                      disabled={index === links.length - 1}
                      className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center text-white shadow-md disabled:opacity-30 disabled:cursor-not-allowed"
                      title="오른쪽으로 이동"
                    >
                      <span className="text-[10px] sm:text-xs font-bold leading-none">→</span>
                    </button>
                  </div>
                </>
              )}
              
              <button
                onClick={() => {
                  if (!editMode) {
                    setSelectedLinkId(link.id);
                  }
                }}
                disabled={editMode}
                className={`px-1.5 py-1 sm:px-2 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-semibold whitespace-nowrap transition-all relative ${
                  editMode
                    ? `${getRoleBgColor(link.targetRole)} border-2 border-amber-500 border-dashed text-gray-700`
                    : selectedLinkId === link.id
                      ? `${isAdmin ? getRoleActiveBgColor(link.targetRole) : 'bg-blue-600'} text-white`
                      : `${isAdmin ? getRoleBgColor(link.targetRole) : 'bg-gray-100'} text-gray-700 hover:bg-gray-200`
                } ${editMode ? 'cursor-default' : ''}`}
              >
                {link.title}
              </button>
            </div>
          ))}
        </div>

        {/* Zoom 컨트롤 - 모바일: 다음 줄 중앙, 데스크탑: 오른쪽 고정 */}
        {!editMode && (
          <div className="flex items-center justify-center sm:justify-end mt-2 sm:mt-0 sm:absolute sm:right-3">
            <div className="inline-flex items-center gap-1 bg-gray-100 rounded-md p-0.5">
              <button
                onClick={handleZoomOut}
                className="w-6 h-6 flex items-center justify-center bg-white hover:bg-gray-50 rounded transition-colors text-gray-700 shadow-sm"
                title="축소"
                disabled={zoom <= 50}
              >
                <span className="text-sm font-bold leading-none">−</span>
              </button>
              <div className="px-2 h-6 flex items-center justify-center text-xs font-semibold text-gray-700 min-w-[3rem]">
                {zoom}%
              </div>
              <button
                onClick={handleZoomIn}
                className="w-6 h-6 flex items-center justify-center bg-white hover:bg-gray-50 rounded transition-colors text-gray-700 shadow-sm"
                title="확대"
                disabled={zoom >= 200}
              >
                <span className="text-sm font-bold leading-none">+</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 bg-white relative overflow-hidden">
        {filteredLinks.map((link) => (
          <iframe
            key={link.id}
            src={link.url}
            className={`w-full h-full border-0 absolute top-0 left-0 ${
              selectedLinkId === link.id ? 'visible' : 'invisible'
            }`}
            style={{ 
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top left',
              width: `${10000 / zoom}%`,
              height: `${10000 / zoom}%`,
              pointerEvents: selectedLinkId === link.id ? 'auto' : 'none'
            }}
            title={link.title}
          />
        ))}
      </div>

      {isAdmin && showAddModal && filteredLinks.length > 0 && (
        <AddModal
          showAddModal={showAddModal}
          setShowAddModal={setShowAddModal}
          newTitle={newTitle}
          setNewTitle={setNewTitle}
          newUrl={newUrl}
          setNewUrl={setNewUrl}
          newTargetRole={newTargetRole}
          setNewTargetRole={setNewTargetRole}
          handleAddLink={handleAddLink}
        />
      )}

      {editingLink && (
        <EditLinkModal
          editingLink={editingLink}
          setEditingLink={setEditingLink}
          editLinkTitle={editLinkTitle}
          setEditLinkTitle={setEditLinkTitle}
          editLinkUrl={editLinkUrl}
          setEditLinkUrl={setEditLinkUrl}
          editLinkTargetRole={editLinkTargetRole}
          setEditLinkTargetRole={setEditLinkTargetRole}
          handleSaveEditLink={handleSaveEditLink}
        />
      )}
    </div>
  );
}

function AddModal({
  showAddModal,
  setShowAddModal,
  newTitle,
  setNewTitle,
  newUrl,
  setNewUrl,
  newTargetRole,
  setNewTargetRole,
  handleAddLink,
}: {
  showAddModal: boolean;
  setShowAddModal: (show: boolean) => void;
  newTitle: string;
  setNewTitle: (title: string) => void;
  newUrl: string;
  setNewUrl: (url: string) => void;
  newTargetRole: ResourceLinkRole;
  setNewTargetRole: (role: ResourceLinkRole) => void;
  handleAddLink: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">링크 추가</h3>
          <button
            onClick={() => {
              setShowAddModal(false);
              setNewTitle('');
              setNewUrl('');
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
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="예: 1주차 시간표"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">대상 권한</label>
            <select
              value={newTargetRole}
              onChange={(e) => setNewTargetRole(e.target.value as ResourceLinkRole)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="common">공통 (모든 사용자)</option>
              <option value="mentor">멘토 전용</option>
              <option value="foreign">원어민 전용</option>
            </select>
          </div>
          
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                setShowAddModal(false);
                setNewTitle('');
                setNewUrl('');
              }}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleAddLink}
              disabled={!newTitle.trim() || !newUrl.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              추가
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditLinkModal({
  editingLink,
  setEditingLink,
  editLinkTitle,
  setEditLinkTitle,
  editLinkUrl,
  setEditLinkUrl,
  editLinkTargetRole,
  setEditLinkTargetRole,
  handleSaveEditLink,
}: {
  editingLink: ResourceLink;
  setEditingLink: (link: ResourceLink | null) => void;
  editLinkTitle: string;
  setEditLinkTitle: (title: string) => void;
  editLinkUrl: string;
  setEditLinkUrl: (url: string) => void;
  editLinkTargetRole: ResourceLinkRole;
  setEditLinkTargetRole: (role: ResourceLinkRole) => void;
  handleSaveEditLink: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">링크 수정</h3>
          <button
            onClick={() => setEditingLink(null)}
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
              value={editLinkTitle}
              onChange={(e) => setEditLinkTitle(e.target.value)}
              placeholder="예: 1주차 시간표"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
            <input
              type="url"
              value={editLinkUrl}
              onChange={(e) => setEditLinkUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">대상 권한</label>
            <select
              value={editLinkTargetRole}
              onChange={(e) => setEditLinkTargetRole(e.target.value as ResourceLinkRole)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="common">공통 (모든 사용자)</option>
              <option value="mentor">멘토 전용</option>
              <option value="foreign">원어민 전용</option>
            </select>
          </div>
          
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setEditingLink(null)}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSaveEditLink}
              disabled={!editLinkTitle.trim() || !editLinkUrl.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
