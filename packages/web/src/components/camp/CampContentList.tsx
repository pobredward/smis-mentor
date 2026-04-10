'use client';

import { logger } from '@smis-mentor/shared';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getDisplayItems, campPageService } from '@/lib/campPageService';
import { generationResourcesService, type ResourceLinkRole, type LinkType } from '@/lib/generationResourcesService';
import type { DisplayItem, CampPageRole, CampPageCategory } from '@smis-mentor/shared';
import { DEFAULT_EMOJIS } from '@smis-mentor/shared';
import toast from 'react-hot-toast';

interface CampContentListProps {
  category: CampPageCategory;
  linkType: LinkType;
  categoryTitle: string;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyDescription: string[];
  allowLinks?: boolean; // 링크 추가 허용 여부 (기본값: false)
}

const getRoleBadgeColor = (targetRole?: CampPageRole): string => {
  switch (targetRole) {
    case 'mentor': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'foreign': return 'bg-purple-100 text-purple-700 border-purple-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};

const getRoleLabel = (targetRole?: CampPageRole): string => {
  switch (targetRole) {
    case 'mentor': return '멘토';
    case 'foreign': return '원어민';
    default: return '공통';
  }
};

export default function CampContentList({
  category,
  linkType,
  categoryTitle,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  allowLinks = false,
}: CampContentListProps) {
  const { userData } = useAuth();
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState<'page' | 'link'>('page');
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newTargetRole, setNewTargetRole] = useState<CampPageRole>('common');
  const [newEmoji, setNewEmoji] = useState('📄');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const [editingItem, setEditingItem] = useState<DisplayItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editEmoji, setEditEmoji] = useState('📄');
  const [editTargetRole, setEditTargetRole] = useState<CampPageRole>('common');
  const [showEditEmojiPicker, setShowEditEmojiPicker] = useState(false);

  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  const filteredItems = items.filter(item => {
    // allowLinks가 false면 페이지만 표시
    if (!allowLinks && item.type === 'link') return false;
    
    if (isAdmin) return true;
    if (!item.targetRole || item.targetRole === 'common') return true;
    if (userData?.role === 'mentor' && item.targetRole === 'mentor') return true;
    if (userData?.role === 'foreign' && item.targetRole === 'foreign') return true;
    return false;
  });

  // 관리자용 섹션별 그룹화
  const groupedItems = isAdmin ? {
    common: filteredItems.filter(item => !item.targetRole || item.targetRole === 'common'),
    mentor: filteredItems.filter(item => item.targetRole === 'mentor'),
    foreign: filteredItems.filter(item => item.targetRole === 'foreign'),
  } : null;

  const loadItems = useCallback(async () => {
    if (!activeJobCodeId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setItems([]);
      
      const displayItems = await getDisplayItems(activeJobCodeId, category);
      setItems(displayItems);
    } catch (error) {
      logger.error(`${category} 로드 실패:`, error);
      toast.error('자료를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [activeJobCodeId, category]);

  useEffect(() => {
    if (activeJobCodeId) {
      loadItems();
    } else {
      setLoading(false);
    }
  }, [activeJobCodeId, loadItems]);

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
          emoji: newEmoji,
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
      setNewEmoji('📄');
      setShowEmojiPicker(false);
      await loadItems();
      toast.success('추가되었습니다.');
    } catch (error) {
      logger.error('항목 추가 실패:', error);
      toast.error('추가에 실패했습니다.');
    }
  };

  const handleStartEditItem = (item: DisplayItem) => {
    if (item.type !== 'page') return;
    setEditingItem(item);
    setEditTitle(item.title);
    setEditEmoji(item.emoji || '📄');
    setEditTargetRole(item.targetRole);
    setShowEditEmojiPicker(false);
  };

  const handleSaveEditItem = async () => {
    if (!editingItem || !activeJobCodeId || !editTitle.trim() || !userData?.userId) {
      toast.error('제목을 입력해주세요.');
      return;
    }

    if (editingItem.type !== 'page') return;

    try {
      await campPageService.updatePage(editingItem.id, {
        title: editTitle.trim(),
        emoji: editEmoji,
        targetRole: editTargetRole,
        userId: userData.userId,
      });

      setEditingItem(null);
      await loadItems();
      toast.success('수정되었습니다.');
    } catch (error) {
      logger.error('항목 수정 실패:', error);
      toast.error('수정에 실패했습니다.');
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

  const handleNavigateToDetail = (item: DisplayItem) => {
    // 세부 페이지로 이동
    window.location.href = `/camp/${category}/${item.id}`;
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
            newEmoji={newEmoji}
            setNewEmoji={setNewEmoji}
            showEmojiPicker={showEmojiPicker}
            setShowEmojiPicker={setShowEmojiPicker}
            handleAddItem={handleAddItem}
            allowLinks={allowLinks}
          />
        )}
      </>
    );
  }

  // 관리자 뷰: 섹션별로 분리
  if (isAdmin && groupedItems) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{categoryTitle}</h1>
            <p className="text-sm text-gray-600 mt-1">
              총 {filteredItems.length}개의 자료
            </p>
          </div>
          
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            자료 추가
          </button>
        </div>

        {/* 공통 자료 섹션 */}
        {groupedItems.common.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
              공통 자료
              <span className="text-sm font-normal text-gray-500">({groupedItems.common.length})</span>
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {groupedItems.common.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  isAdmin={true}
                  onNavigate={handleNavigateToDetail}
                  onDelete={handleDeleteItem}
                  onEdit={handleStartEditItem}
                />
              ))}
            </div>
          </div>
        )}

        {/* 멘토 전용 자료 섹션 */}
        {groupedItems.mentor.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              멘토 전용 자료
              <span className="text-sm font-normal text-gray-500">({groupedItems.mentor.length})</span>
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {groupedItems.mentor.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  isAdmin={true}
                  onNavigate={handleNavigateToDetail}
                  onDelete={handleDeleteItem}
                  onEdit={handleStartEditItem}
                />
              ))}
            </div>
          </div>
        )}

        {/* 원어민 전용 자료 섹션 */}
        {groupedItems.foreign.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
              원어민 전용 자료
              <span className="text-sm font-normal text-gray-500">({groupedItems.foreign.length})</span>
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {groupedItems.foreign.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  isAdmin={true}
                  onNavigate={handleNavigateToDetail}
                  onDelete={handleDeleteItem}
                  onEdit={handleStartEditItem}
                />
              ))}
            </div>
          </div>
        )}

        {/* 추가 모달 */}
        {showAddModal && (
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
            newEmoji={newEmoji}
            setNewEmoji={setNewEmoji}
            showEmojiPicker={showEmojiPicker}
            setShowEmojiPicker={setShowEmojiPicker}
            handleAddItem={handleAddItem}
            allowLinks={allowLinks}
          />
        )}

        {/* 수정 모달 */}
        {editingItem && (
          <EditModal
            editingItem={editingItem}
            setEditingItem={setEditingItem}
            editTitle={editTitle}
            setEditTitle={setEditTitle}
            editEmoji={editEmoji}
            setEditEmoji={setEditEmoji}
            editTargetRole={editTargetRole}
            setEditTargetRole={setEditTargetRole}
            showEditEmojiPicker={showEditEmojiPicker}
            setShowEditEmojiPicker={setShowEditEmojiPicker}
            handleSaveEditItem={handleSaveEditItem}
          />
        )}
      </div>
    );
  }

  // 일반 사용자 뷰: 뱃지 없이 단순 그리드
  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{categoryTitle}</h1>
          <p className="text-sm text-gray-600 mt-1">
            총 {filteredItems.length}개의 자료
          </p>
        </div>
      </div>

      {/* 카드 그리드 */}
      <div className="grid grid-cols-2 gap-4">
        {filteredItems.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            isAdmin={false}
            onNavigate={handleNavigateToDetail}
            onDelete={handleDeleteItem}
            onEdit={handleStartEditItem}
          />
        ))}
      </div>
    </div>
  );
}

function ItemCard({
  item,
  isAdmin,
  onNavigate,
  onDelete,
  onEdit,
}: {
  item: DisplayItem;
  isAdmin: boolean;
  onNavigate: (item: DisplayItem) => void;
  onDelete: (item: DisplayItem) => void;
  onEdit: (item: DisplayItem) => void;
}) {
  return (
    <div
      className="bg-white rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group relative"
      onClick={() => onNavigate(item)}
    >
      <div className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className={`w-8 h-8 sm:w-9 sm:h-9 flex-shrink-0 rounded-lg flex items-center justify-center text-base sm:text-lg ${
              item.type === 'page' 
                ? 'bg-blue-100 text-blue-600' 
                : 'bg-purple-100 text-purple-600'
            }`}>
              {item.emoji || (item.type === 'page' ? '📄' : '🔗')}
            </div>
            <h3 className="font-semibold text-sm sm:text-base text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1 flex-1">
              {item.title}
            </h3>
          </div>

          {isAdmin && (
            <div className="flex flex-col gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0">
              {item.type === 'page' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(item);
                  }}
                  className="w-5 h-5 flex items-center justify-center hover:bg-blue-50 rounded border border-gray-200 bg-white/80 backdrop-blur-sm"
                  title="수정"
                >
                  <svg className="w-2.5 h-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item);
                }}
                className="w-5 h-5 flex items-center justify-center hover:bg-red-50 rounded border border-gray-200 bg-white/80 backdrop-blur-sm"
                title="삭제"
              >
                <svg className="w-2.5 h-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
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
  newEmoji,
  setNewEmoji,
  showEmojiPicker,
  setShowEmojiPicker,
  handleAddItem,
  allowLinks,
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
  newEmoji: string;
  setNewEmoji: (emoji: string) => void;
  showEmojiPicker: boolean;
  setShowEmojiPicker: (show: boolean) => void;
  handleAddItem: () => void;
  allowLinks: boolean;
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
              setNewEmoji('📄');
              setShowEmojiPicker(false);
            }}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-4">
          {/* 유형 선택 (allowLinks가 true일 때만 표시) */}
          {allowLinks && (
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
          )}

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

          {/* 이모지 선택 (페이지 타입일 때만) */}
          {addType === 'page' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">아이콘</label>
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2 hover:bg-gray-50"
              >
                <span className="text-2xl">{newEmoji}</span>
                <span className="text-sm text-gray-600">클릭하여 변경</span>
              </button>
              
              {showEmojiPicker && (
                <div className="mt-2 p-3 border border-gray-300 rounded-lg bg-white max-h-48 overflow-y-auto">
                  <div className="grid grid-cols-8 gap-2">
                    {DEFAULT_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          setNewEmoji(emoji);
                          setShowEmojiPicker(false);
                        }}
                        className="text-2xl hover:bg-gray-100 rounded p-1 transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {addType === 'link' && allowLinks && (
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
                setNewEmoji('📄');
                setShowEmojiPicker(false);
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

function EditModal({
  editingItem,
  setEditingItem,
  editTitle,
  setEditTitle,
  editEmoji,
  setEditEmoji,
  editTargetRole,
  setEditTargetRole,
  showEditEmojiPicker,
  setShowEditEmojiPicker,
  handleSaveEditItem,
}: {
  editingItem: DisplayItem;
  setEditingItem: (item: DisplayItem | null) => void;
  editTitle: string;
  setEditTitle: (title: string) => void;
  editEmoji: string;
  setEditEmoji: (emoji: string) => void;
  editTargetRole: CampPageRole;
  setEditTargetRole: (role: CampPageRole) => void;
  showEditEmojiPicker: boolean;
  setShowEditEmojiPicker: (show: boolean) => void;
  handleSaveEditItem: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">페이지 수정</h3>
          <button
            onClick={() => {
              setEditingItem(null);
              setShowEditEmojiPicker(false);
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
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="예: 1주차 자료"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">아이콘</label>
            <button
              type="button"
              onClick={() => setShowEditEmojiPicker(!showEditEmojiPicker)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2 hover:bg-gray-50"
            >
              <span className="text-2xl">{editEmoji}</span>
              <span className="text-sm text-gray-600">클릭하여 변경</span>
            </button>
            
            {showEditEmojiPicker && (
              <div className="mt-2 p-3 border border-gray-300 rounded-lg bg-white max-h-48 overflow-y-auto">
                <div className="grid grid-cols-8 gap-2">
                  {DEFAULT_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setEditEmoji(emoji);
                        setShowEditEmojiPicker(false);
                      }}
                      className="text-2xl hover:bg-gray-100 rounded p-1 transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">대상 권한</label>
            <select
              value={editTargetRole}
              onChange={(e) => setEditTargetRole(e.target.value as CampPageRole)}
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
                setEditingItem(null);
                setShowEditEmojiPicker(false);
              }}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSaveEditItem}
              disabled={!editTitle.trim()}
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
