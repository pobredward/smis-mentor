'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { generationResourcesService, ResourceLink, ResourceLinkRole } from '@/lib/generationResourcesService';
import { NotionPage } from '@/components/notion/NotionPage';

// Notion URL에서 페이지 ID 추출
const extractNotionPageId = (url: string): string | null => {
  try {
    // 이미 32자 ID인 경우
    if (/^[a-f0-9]{32}$/.test(url)) {
      return url;
    }
    
    // UUID 형식 (8-4-4-4-12)
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(url)) {
      return url.replace(/-/g, '');
    }
    
    // Notion URL에서 ID 추출
    const urlMatch = url.match(/([a-f0-9]{32})|([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
    if (urlMatch) {
      return urlMatch[0].replace(/-/g, '');
    }
    
    return null;
  } catch (e) {
    console.error('Failed to extract Notion page ID:', e);
    return null;
  }
};

// 권한별 배경색 반환 함수
const getRoleBgColor = (targetRole?: ResourceLinkRole): string => {
  switch (targetRole) {
    case 'mentor':
      return 'bg-blue-100/50'; // 멘토 - 연한 파랑
    case 'foreign':
      return 'bg-purple-100/50'; // 원어민 - 연한 보라
    default:
      return 'bg-gray-100/50'; // 공통 - 연한 회색
  }
};

// 선택된 상태의 배경색 (관리자가 권한별 토글을 선택했을 때)
const getRoleActiveBgColor = (targetRole?: ResourceLinkRole): string => {
  switch (targetRole) {
    case 'mentor':
      return 'bg-blue-500'; // 멘토 - 파랑
    case 'foreign':
      return 'bg-purple-500'; // 원어민 - 보라
    default:
      return 'bg-blue-600'; // 공통 - 파랑 (기본 선택 색상)
  }
};

// 권한 라벨 반환 함수
const getRoleLabel = (targetRole?: ResourceLinkRole): string => {
  switch (targetRole) {
    case 'mentor':
      return '멘토';
    case 'foreign':
      return '원어민';
    default:
      return '공통';
  }
};

export default function EducationContent() {
  const { userData } = useAuth();
  const [educationLinks, setEducationLinks] = useState<ResourceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkTargetRole, setNewLinkTargetRole] = useState<ResourceLinkRole>('common');
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLink, setEditingLink] = useState<ResourceLink | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editTargetRole, setEditTargetRole] = useState<ResourceLinkRole>('common');

  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  // 사용자 role에 따라 교육 링크 필터링
  const filteredEducationLinks = educationLinks.filter(link => {
    // 관리자는 모든 링크를 볼 수 있음
    if (isAdmin) return true;
    
    // targetRole이 없거나 'common'이면 모든 사용자가 볼 수 있음
    if (!link.targetRole || link.targetRole === 'common') return true;
    
    // 멘토는 'mentor' 권한 링크를 볼 수 있음
    if (userData?.role === 'mentor' && link.targetRole === 'mentor') return true;
    
    // 원어민은 'foreign' 권한 링크를 볼 수 있음
    if (userData?.role === 'foreign' && link.targetRole === 'foreign') return true;
    
    return false;
  });

  const loadEducationLinks = useCallback(async () => {
    if (!activeJobCodeId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      setEducationLinks([]);
      setSelectedLinkId(null);
      
      const resources = await generationResourcesService.getResourcesByJobCodeId(activeJobCodeId);
      
      if (resources?.educationLinks) {
        setEducationLinks(resources.educationLinks);
        
        // 필터링된 링크 중 첫 번째를 선택
        const filtered = resources.educationLinks.filter(link => {
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
      console.error('EducationContent: 교육 링크 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [activeJobCodeId]);

  useEffect(() => {
    if (activeJobCodeId) {
      loadEducationLinks();
    } else {
      setLoading(false);
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
        userData?.userId || '',
        newLinkTargetRole
      );
      await loadEducationLinks();
      setShowAddModal(false);
      setNewLinkTitle('');
      setNewLinkUrl('');
      setNewLinkTargetRole('common');
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
    setEditTargetRole(link.targetRole || 'common');
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
          ? { ...link, title: editTitle.trim(), url: editUrl.trim(), targetRole: editTargetRole }
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

  if (!userData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
          <svg
            className="w-6 h-6 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <p className="text-center">로그인 후 이용 가능합니다.</p>
      </div>
    );
  }

  if (!activeJobCodeId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
        <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">활성 캠프를 선택해주세요</h3>
        <p className="text-sm text-gray-600">마이페이지에서 참여 중인 캠프를 활성화하면</p>
        <p className="text-sm text-gray-600">해당 캠프의 교육 자료를 확인할 수 있습니다.</p>
      </div>
    );
  }

  if (filteredEducationLinks.length === 0) {
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
                  대상 권한
                </label>
                <select
                  value={newLinkTargetRole}
                  onChange={(e) => setNewLinkTargetRole(e.target.value as ResourceLinkRole)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="common">공통 (모든 사용자)</option>
                  <option value="mentor">멘토 전용</option>
                  <option value="foreign">원어민 전용</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  💡 권한별로 다른 배경색이 적용됩니다 (공통: 회색, 멘토: 파랑, 원어민: 보라)
                </p>
              </div>
                
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  노션 URL
                  <span className="text-xs text-gray-500 ml-2">
                    (공유 링크나 임베드 링크 모두 가능)
                  </span>
                </label>
                <input
                  type="url"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  placeholder="https://smis.notion.site/..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-800 mb-1">
                    <strong>💡 사용 가능한 URL 형식:</strong>
                  </p>
                  <ul className="text-xs text-blue-700 space-y-1 ml-4 list-disc">
                    <li>일반 공유 링크: https://smis.notion.site/페이지명-ID</li>
                    <li>임베드 링크: https://smis.notion.site/ebd//ID</li>
                    <li>Google Sheets: docs.google.com/spreadsheets/...</li>
                  </ul>
                </div>
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
        
        {filteredEducationLinks.map((link, index) => {
          const actualIndex = educationLinks.findIndex(l => l.id === link.id);
          return (
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
              className={`px-2 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all relative ${
                editMode
                  ? `${getRoleBgColor(link.targetRole)} border-2 border-amber-500 border-dashed text-gray-700`
                  : selectedLinkId === link.id
                    ? `${isAdmin ? getRoleActiveBgColor(link.targetRole) : 'bg-blue-600'} text-white`
                    : `${isAdmin ? getRoleBgColor(link.targetRole) : 'bg-gray-100'} text-gray-700 hover:bg-gray-200`
              } ${editMode ? 'cursor-default' : ''}`}
            >
              {link.title}
            </button>
            
            {editMode && (
              <div className="absolute -bottom-5 left-0 right-0 flex items-center justify-center gap-1 z-10">
                {actualIndex > 0 && (
                  <button
                    onClick={() => handleMoveLink(actualIndex, 'left')}
                    className="px-1.5 py-0.5 rounded bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold shadow-md shadow-blue-500/30"
                    title="왼쪽으로 이동"
                  >
                    ←
                  </button>
                )}
                {actualIndex < educationLinks.length - 1 && (
                  <button
                    onClick={() => handleMoveLink(actualIndex, 'right')}
                    className="px-1.5 py-0.5 rounded bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold shadow-md shadow-blue-500/30"
                    title="오른쪽으로 이동"
                  >
                    →
                  </button>
                )}
              </div>
            )}
          </div>
        );
        })}
      </div>

      {/* 선택된 링크 표시 */}
      <div className="h-full bg-white relative overflow-auto">
        {filteredEducationLinks.map((link) => {
          const isVisible = selectedLinkId === link.id;
          
          if (!isVisible) return null;

          const pageId = extractNotionPageId(link.url);

          // Notion 페이지가 아닌 경우 (예: 외부 링크)
          if (!pageId) {
            return (
              <div key={link.id} className="flex flex-col items-center justify-center h-full p-8 text-center">
                <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <p className="text-gray-600 mb-4">이 링크는 Notion 페이지가 아닙니다</p>
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

          return (
            <div key={link.id} className="w-full h-full">
              <NotionPage pageId={pageId} />
            </div>
          );
        })}
      </div>

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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  대상 권한
                </label>
                <select
                  value={newLinkTargetRole}
                  onChange={(e) => setNewLinkTargetRole(e.target.value as ResourceLinkRole)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="common">공통 (모든 사용자)</option>
                  <option value="mentor">멘토 전용</option>
                  <option value="foreign">원어민 전용</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  💡 권한별로 다른 배경색이 적용됩니다
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input
                  type="url"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  placeholder="https://smis.notion.site/..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  💡 일반 공유 링크와 임베드 링크 모두 사용 가능합니다
                </p>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  대상 권한
                </label>
                <select
                  value={editTargetRole}
                  onChange={(e) => setEditTargetRole(e.target.value as ResourceLinkRole)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="common">공통 (모든 사용자)</option>
                  <option value="mentor">멘토 전용</option>
                  <option value="foreign">원어민 전용</option>
                </select>
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
