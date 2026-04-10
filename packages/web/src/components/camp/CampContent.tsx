'use client';

import { logger } from '@smis-mentor/shared';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';
import { getDisplayItems, campPageService } from '@/lib/campPageService';
import { generationResourcesService, type ResourceLinkRole, type LinkType } from '@/lib/generationResourcesService';
import { NotionPage } from '@/components/notion/NotionPage';
import type { DisplayItem, CampPageRole, CampPageCategory } from '@smis-mentor/shared';
import toast from 'react-hot-toast';

const CampPageEditor = dynamic(() => import('./CampPageEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
    </div>
  ),
});

const CampPageViewer = dynamic(() => import('./CampPageViewer'), {
  ssr: false,
});

interface CampContentProps {
  category: CampPageCategory;
  linkType: LinkType;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyDescription: string[];
}

const extractNotionPageId = (url: string): string | null => {
  try {
    if (/^[a-f0-9]{32}$/.test(url)) return url;
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(url)) {
      return url.replace(/-/g, '');
    }
    const urlMatch = url.match(/([a-f0-9]{32})|([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
    if (urlMatch) return urlMatch[0].replace(/-/g, '');
    return null;
  } catch (e) {
    logger.error('Failed to extract Notion page ID:', e);
    return null;
  }
};

const getRoleBgColor = (targetRole?: CampPageRole): string => {
  switch (targetRole) {
    case 'mentor': return 'bg-blue-100/50';
    case 'foreign': return 'bg-purple-100/50';
    default: return 'bg-gray-100/50';
  }
};

const getRoleActiveBgColor = (targetRole?: CampPageRole): string => {
  switch (targetRole) {
    case 'mentor': return 'bg-blue-500';
    case 'foreign': return 'bg-purple-500';
    default: return 'bg-blue-600';
  }
};

export default function CampContent({
  category,
  linkType,
  emptyIcon,
  emptyTitle,
  emptyDescription,
}: CampContentProps) {
  const { userData } = useAuth();
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingContent, setEditingContent] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState<'page' | 'link'>('page');
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newTargetRole, setNewTargetRole] = useState<CampPageRole>('common');

  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  const filteredItems = items.filter(item => {
    if (isAdmin) return true;
    if (!item.targetRole || item.targetRole === 'common') return true;
    if (userData?.role === 'mentor' && item.targetRole === 'mentor') return true;
    if (userData?.role === 'foreign' && item.targetRole === 'foreign') return true;
    return false;
  });

  const loadItems = useCallback(async () => {
    if (!activeJobCodeId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setItems([]);
      setSelectedItemId(null);
      
      const displayItems = await getDisplayItems(activeJobCodeId, category);
      setItems(displayItems);
      
      const filtered = displayItems.filter(item => {
        if (isAdmin) return true;
        if (!item.targetRole || item.targetRole === 'common') return true;
        if (userData?.role === 'mentor' && item.targetRole === 'mentor') return true;
        if (userData?.role === 'foreign' && item.targetRole === 'foreign') return true;
        return false;
      });
      
      if (filtered.length > 0) {
        setSelectedItemId(filtered[0].id);
      }
    } catch (error) {
      logger.error(`${category} 로드 실패:`, error);
      toast.error('자료를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [activeJobCodeId, category, isAdmin, userData?.role]);

  useEffect(() => {
    if (activeJobCodeId) {
      loadItems();
    } else {
      setLoading(false);
    }
  }, [activeJobCodeId, loadItems]);

  const selectedItem = items.find(item => item.id === selectedItemId);

  const handleStartEdit = () => {
    if (selectedItem?.type === 'page' && selectedItem.content) {
      setEditingContent(selectedItem.content);
      setIsEditing(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedItem || selectedItem.type !== 'page' || !userData?.userId) return;

    try {
      await campPageService.updatePage(selectedItem.id, {
        content: editingContent,
        userId: userData.userId,
      });
      
      setIsEditing(false);
      await loadItems();
      toast.success('저장되었습니다.');
    } catch (error) {
      logger.error('페이지 저장 실패:', error);
      toast.error('저장에 실패했습니다.');
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingContent('');
  };

  const handleAddItem = async () => {
    if (!activeJobCodeId || !newTitle.trim() || !userData?.userId) {
      toast.error('제목을 입력해주세요.');
      return;
    }

    try {
      if (addType === 'page') {
        await campPageService.createPage({
          jobCodeId: activeJobCodeId,
          category,
          title: newTitle.trim(),
          targetRole: newTargetRole,
          content: '',
          userId: userData.userId,
        });
      } else {
        if (!newUrl.trim()) {
          toast.error('URL을 입력해주세요.');
          return;
        }
        await generationResourcesService.addLink(
          activeJobCodeId,
          linkType,
          newTitle.trim(),
          newUrl.trim(),
          userData.userId,
          newTargetRole as ResourceLinkRole
        );
      }
      
      setShowAddModal(false);
      setNewTitle('');
      setNewUrl('');
      setNewTargetRole('common');
      await loadItems();
      toast.success('추가되었습니다.');
    } catch (error) {
      logger.error('항목 추가 실패:', error);
      toast.error('추가에 실패했습니다.');
    }
  };

  const handleDeleteItem = async (item: DisplayItem) => {
    if (!activeJobCodeId || !confirm(`"${item.title}"을(를) 삭제하시겠습니까?`)) return;

    try {
      if (item.type === 'page') {
        await campPageService.deletePage(item.id);
      } else {
        await generationResourcesService.deleteLink(activeJobCodeId, linkType, item.id);
      }
      
      await loadItems();
      toast.success('삭제되었습니다.');
    } catch (error) {
      logger.error('항목 삭제 실패:', error);
      toast.error('삭제에 실패했습니다.');
    }
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

  if (filteredItems.length === 0) {
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
            addType={addType}
            setAddType={setAddType}
            newTitle={newTitle}
            setNewTitle={setNewTitle}
            newUrl={newUrl}
            setNewUrl={setNewUrl}
            newTargetRole={newTargetRole}
            setNewTargetRole={setNewTargetRole}
            handleAddItem={handleAddItem}
          />
        )}
      </>
    );
  }

  return (
    <div className="h-[calc(100vh-12rem)] w-full flex flex-col">
      <div className={`bg-white border-b border-gray-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto ${editMode ? 'bg-amber-50 border-amber-500 border-b-2' : ''}`}>
        {isAdmin && (
          <>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all bg-blue-600 text-white hover:bg-blue-700"
              title="자료 추가"
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
        
        {filteredItems.map((item) => (
          <div key={item.id} className="relative" style={{ marginLeft: '3px', marginRight: '3px' }}>
            {editMode && isAdmin && (
              <div className="absolute -top-6 left-0 right-0 flex items-center justify-center gap-1 z-10">
                <button
                  onClick={() => handleDeleteItem(item)}
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
                  setSelectedItemId(item.id);
                  setIsEditing(false);
                }
              }}
              disabled={editMode}
              className={`px-2 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all relative ${
                editMode
                  ? `${getRoleBgColor(item.targetRole)} border-2 border-amber-500 border-dashed text-gray-700`
                  : selectedItemId === item.id
                    ? `${isAdmin ? getRoleActiveBgColor(item.targetRole) : 'bg-blue-600'} text-white`
                    : `${isAdmin ? getRoleBgColor(item.targetRole) : 'bg-gray-100'} text-gray-700 hover:bg-gray-200`
              } ${editMode ? 'cursor-default' : ''}`}
            >
              {item.type === 'page' ? '📄' : '🔗'} {item.title}
            </button>
          </div>
        ))}
      </div>

      <div className="flex-1 bg-white relative overflow-auto">
        {selectedItem && (
          <>
            {selectedItem.type === 'page' ? (
              <>
                {isEditing ? (
                  <CampPageEditor
                    content={editingContent}
                    onChange={setEditingContent}
                    onSave={handleSaveEdit}
                    onCancel={handleCancelEdit}
                  />
                ) : (
                  <div>
                    {isAdmin && (
                      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-4 flex justify-end">
                        <button
                          onClick={handleStartEdit}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                        >
                          ✏️ 편집
                        </button>
                      </div>
                    )}
                    <CampPageViewer content={selectedItem.content || '<p>내용이 없습니다.</p>'} />
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full">
                {extractNotionPageId(selectedItem.url || '') ? (
                  <NotionPage pageId={extractNotionPageId(selectedItem.url || '')!} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                    <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <p className="text-gray-600 mb-4">이 링크는 외부 페이지입니다</p>
                    <a
                      href={selectedItem.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      새 탭에서 열기
                    </a>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {isAdmin && showAddModal && filteredItems.length > 0 && (
        <AddModal
          showAddModal={showAddModal}
          setShowAddModal={setShowAddModal}
          addType={addType}
          setAddType={setAddType}
          newTitle={newTitle}
          setNewTitle={setNewTitle}
          newUrl={newUrl}
          setNewUrl={setNewUrl}
          newTargetRole={newTargetRole}
          setNewTargetRole={setNewTargetRole}
          handleAddItem={handleAddItem}
        />
      )}
    </div>
  );
}

function AddModal({
  showAddModal,
  setShowAddModal,
  addType,
  setAddType,
  newTitle,
  setNewTitle,
  newUrl,
  setNewUrl,
  newTargetRole,
  setNewTargetRole,
  handleAddItem,
}: {
  showAddModal: boolean;
  setShowAddModal: (show: boolean) => void;
  addType: 'page' | 'link';
  setAddType: (type: 'page' | 'link') => void;
  newTitle: string;
  setNewTitle: (title: string) => void;
  newUrl: string;
  setNewUrl: (url: string) => void;
  newTargetRole: CampPageRole;
  setNewTargetRole: (role: CampPageRole) => void;
  handleAddItem: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">자료 추가</h3>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">유형</label>
            <div className="flex gap-2">
              <button
                onClick={() => setAddType('page')}
                className={`flex-1 px-4 py-2 rounded-lg font-medium ${
                  addType === 'page'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                📄 페이지
              </button>
              <button
                onClick={() => setAddType('link')}
                className={`flex-1 px-4 py-2 rounded-lg font-medium ${
                  addType === 'link'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                🔗 링크
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="예: 1주차 자료"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {addType === 'link' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">대상 권한</label>
            <select
              value={newTargetRole}
              onChange={(e) => setNewTargetRole(e.target.value as CampPageRole)}
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
              onClick={handleAddItem}
              disabled={!newTitle.trim() || (addType === 'link' && !newUrl.trim())}
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
