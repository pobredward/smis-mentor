'use client';

import { logger } from '@smis-mentor/shared';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getDisplayItems, campPageService } from '@/lib/campPageService';
import { generationResourcesService, type ResourceLinkRole, type LinkType } from '@/lib/generationResourcesService';
import type { DisplayItem, CampPageRole, CampPageCategory } from '@smis-mentor/shared';
import { DEFAULT_EMOJIS } from '@smis-mentor/shared';
import toast from 'react-hot-toast';
import { campQueryKeys } from '@/hooks/useCampDataPrefetch';

interface CampContentListProps {
  category: CampPageCategory;
  linkType: LinkType;
  categoryTitle: string;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyDescription: string[];
  allowLinks?: boolean; // 링크 추가 허용 여부 (기본값: false)
  isForeign?: boolean;
}

const getRoleBadgeColor = (targetRole?: CampPageRole): string => {
  switch (targetRole) {
    case 'mentor': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'foreign': return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'expired': return 'bg-amber-100 text-amber-700 border-amber-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};

const getRoleLabel = (targetRole?: CampPageRole): string => {
  switch (targetRole) {
    case 'mentor': return '멘토';
    case 'foreign': return '원어민';
    case 'expired': return '만료';
    default: return '공통';
  }
};

// category → campQueryKeys 매핑
function getCategoryQueryKey(category: CampPageCategory, jobCodeId: string) {
  switch (category) {
    case 'education': return campQueryKeys.education(jobCodeId);
    case 'schedule': return campQueryKeys.schedule(jobCodeId);
    case 'guide': return campQueryKeys.guide(jobCodeId);
    default: return ['displayItems', jobCodeId, category];
  }
}

export default function CampContentList({
  category,
  linkType,
  categoryTitle,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  allowLinks = false,
  isForeign = false,
}: CampContentListProps) {
  const router = useRouter();
  const { userData } = useAuth();
  const queryClient = useQueryClient();
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

  const [searchQuery, setSearchQuery] = useState('');

  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  // 프리페칭 캐시를 활용하는 useQuery 기반 데이터 로딩
  const queryKey = activeJobCodeId ? getCategoryQueryKey(category, activeJobCodeId) : ['displayItems', null, category];
  const { data: items = [], isLoading: loading } = useQuery({
    queryKey,
    queryFn: () => getDisplayItems(activeJobCodeId!, category),
    enabled: !!activeJobCodeId,
  });

  // 뮤테이션 후 캐시 무효화 헬퍼
  const invalidateCache = () => {
    if (activeJobCodeId) {
      queryClient.invalidateQueries({ queryKey: getCategoryQueryKey(category, activeJobCodeId) });
    }
  };

  // 1단계: 역할 기반 필터 (기존 로직 유지)
  const roleFilteredItems = items.filter((item: DisplayItem) => {
    if (!allowLinks && item.type === 'link') return false;
    if (isAdmin) return true;
    if (!item.targetRole || item.targetRole === 'common') return true;
    if (userData?.role === 'mentor' && item.targetRole === 'mentor') return true;
    if (userData?.role === 'foreign' && item.targetRole === 'foreign') return true;
    return false;
  });

  // 2단계: 검색어 필터 (제목 + 본문 텍스트 검색)
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredItems = trimmedQuery
    ? roleFilteredItems.filter((item: DisplayItem) => {
        if (item.title.toLowerCase().includes(trimmedQuery)) return true;
        if (item.content) {
          return extractText(item.content).toLowerCase().includes(trimmedQuery);
        }
        return false;
      })
    : roleFilteredItems;

  // 관리자용 섹션별 그룹화 (역할 필터 기준, 검색 미적용)
  const groupedItems = isAdmin ? {
    common: roleFilteredItems.filter((item: DisplayItem) => !item.targetRole || item.targetRole === 'common'),
    mentor: roleFilteredItems.filter((item: DisplayItem) => item.targetRole === 'mentor'),
    foreign: roleFilteredItems.filter((item: DisplayItem) => item.targetRole === 'foreign'),
    expired: roleFilteredItems.filter((item: DisplayItem) => item.targetRole === 'expired'),
  } : null;

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
      invalidateCache();
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
      invalidateCache();
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
      
      invalidateCache();
      toast.success('삭제되었습니다.');
    } catch (error) {
      logger.error('항목 삭제 실패:', error);
      toast.error('삭제에 실패했습니다.');
    }
  };

  const handleNavigateToDetail = (item: DisplayItem) => {
    router.push(`/camp/${category}/${item.id}`);
  };

  const getItemHref = (item: DisplayItem): string => {
    if (item.type === 'link' && item.url) return item.url;
    return `/camp/${category}/${item.id}`;
  };

  const handleMoveItemUp = async (item: DisplayItem, sectionItems: DisplayItem[]) => {
    if (!activeJobCodeId || item.type !== 'page') return;

    const index = sectionItems.findIndex(i => i.id === item.id);
    if (index <= 0) return;

    try {
      const newItems = [...sectionItems];
      [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
      
      const pageIds = newItems.map(i => i.id);
      
      await campPageService.reorderPages(activeJobCodeId, category, pageIds);
      invalidateCache();
      toast.success('순서가 변경되었습니다.');
    } catch (error) {
      logger.error('순서 변경 실패:', error);
      toast.error('순서 변경에 실패했습니다.');
    }
  };

  const handleMoveItemDown = async (item: DisplayItem, sectionItems: DisplayItem[]) => {
    if (!activeJobCodeId || item.type !== 'page') return;

    const index = sectionItems.findIndex(i => i.id === item.id);
    if (index < 0 || index >= sectionItems.length - 1) return;

    try {
      const newItems = [...sectionItems];
      [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
      
      const pageIds = newItems.map(i => i.id);
      
      await campPageService.reorderPages(activeJobCodeId, category, pageIds);
      invalidateCache();
      toast.success('순서가 변경되었습니다.');
    } catch (error) {
      logger.error('순서 변경 실패:', error);
      toast.error('순서 변경에 실패했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
        <p className="mt-4 text-gray-600">{isForeign ? 'Loading...' : '자료 로딩 중...'}</p>
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
        <p className="text-center">{isForeign ? 'Please sign in to continue.' : '로그인 후 이용 가능합니다.'}</p>
      </div>
    );
  }

  if (!activeJobCodeId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
        {emptyIcon}
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {isForeign ? 'No active camp selected' : '활성 캠프를 선택해주세요'}
        </h3>
        {emptyDescription.map((line, i) => (
          <p key={i} className="text-sm text-gray-600">{line}</p>
        ))}
      </div>
    );
  }

  // 실제 자료가 하나도 없는 경우 (검색 전)
  if (roleFilteredItems.length === 0) {
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
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{categoryTitle}</h1>
            <p className="text-sm text-gray-600 mt-1">
              {trimmedQuery
                ? `"${searchQuery}" 검색 결과 ${filteredItems.length}개`
                : `총 ${roleFilteredItems.length}개의 자료`}
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

        {/* 검색바 */}
        <div className="mb-6">
          <SearchBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            isForeign={isForeign}
          />
        </div>

        {/* 검색 중: 결과 리스트 / 미검색: 섹션 그리드 */}
        {trimmedQuery ? (
          <SearchResultList
            items={filteredItems}
            query={searchQuery}
            isForeign={isForeign}
            getItemHref={getItemHref}
          />
        ) : (
          <>
            {/* 공통 자료 섹션 */}
            {groupedItems.common.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                  공통 자료
                  <span className="text-sm font-normal text-gray-500">({groupedItems.common.length})</span>
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  {groupedItems.common.map((item, idx) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      isAdmin={true}
                      href={getItemHref(item)}
                      onNavigate={handleNavigateToDetail}
                      onDelete={handleDeleteItem}
                      onEdit={handleStartEditItem}
                      onMoveUp={idx > 0 ? () => handleMoveItemUp(item, groupedItems.common) : undefined}
                      onMoveDown={idx < groupedItems.common.length - 1 ? () => handleMoveItemDown(item, groupedItems.common) : undefined}
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
                  {groupedItems.mentor.map((item, idx) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      isAdmin={true}
                      href={getItemHref(item)}
                      onNavigate={handleNavigateToDetail}
                      onDelete={handleDeleteItem}
                      onEdit={handleStartEditItem}
                      onMoveUp={idx > 0 ? () => handleMoveItemUp(item, groupedItems.mentor) : undefined}
                      onMoveDown={idx < groupedItems.mentor.length - 1 ? () => handleMoveItemDown(item, groupedItems.mentor) : undefined}
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
                  {groupedItems.foreign.map((item, idx) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      isAdmin={true}
                      href={getItemHref(item)}
                      onNavigate={handleNavigateToDetail}
                      onDelete={handleDeleteItem}
                      onEdit={handleStartEditItem}
                      onMoveUp={idx > 0 ? () => handleMoveItemUp(item, groupedItems.foreign) : undefined}
                      onMoveDown={idx < groupedItems.foreign.length - 1 ? () => handleMoveItemDown(item, groupedItems.foreign) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 만료 자료 섹션 (admin 전용) */}
            {groupedItems.expired.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                  만료된 자료
                  <span className="text-sm font-normal text-gray-500">({groupedItems.expired.length})</span>
                  <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-normal">
                    관리자만 표시
                  </span>
                </h2>
                <div className="grid grid-cols-2 gap-4 opacity-75">
                  {groupedItems.expired.map((item, idx) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      isAdmin={true}
                      href={getItemHref(item)}
                      onNavigate={handleNavigateToDetail}
                      onDelete={handleDeleteItem}
                      onEdit={handleStartEditItem}
                      onMoveUp={idx > 0 ? () => handleMoveItemUp(item, groupedItems.expired) : undefined}
                      onMoveDown={idx < groupedItems.expired.length - 1 ? () => handleMoveItemDown(item, groupedItems.expired) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{categoryTitle}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {trimmedQuery
              ? isForeign
                ? `${filteredItems.length} results for "${searchQuery}"`
                : `"${searchQuery}" 검색 결과 ${filteredItems.length}개`
              : isForeign
                ? `${roleFilteredItems.length} items`
                : `총 ${roleFilteredItems.length}개의 자료`}
          </p>
        </div>
      </div>

      {/* 검색바 */}
      <div className="mb-6">
        <SearchBar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          isForeign={isForeign}
        />
      </div>

      {/* 검색 중: 결과 리스트 / 미검색: 카드 그리드 */}
      {trimmedQuery ? (
        <SearchResultList
          items={filteredItems}
          query={searchQuery}
          isForeign={isForeign}
          getItemHref={getItemHref}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {roleFilteredItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              isAdmin={false}
              href={getItemHref(item)}
              onNavigate={handleNavigateToDetail}
              onDelete={handleDeleteItem}
              onEdit={handleStartEditItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 검색 관련 헬퍼 함수
// ─────────────────────────────────────────────────────────

function extractText(html: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return (
      new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
    );
  } catch {
    return '';
  }
}

function extractSnippet(html: string, query: string): string {
  const text = extractText(html).replace(/\s+/g, ' ').trim();
  if (!text) return '';

  const lowerText = text.toLowerCase();
  const lowerQuery = query.trim().toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    return text.length > 120 ? text.slice(0, 120) + '...' : text;
  }

  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + lowerQuery.length + 90);
  const snippet = text.slice(start, end);
  return (start > 0 ? '...' : '') + snippet + (end < text.length ? '...' : '');
}

// ─────────────────────────────────────────────────────────
// 검색 관련 컴포넌트
// ─────────────────────────────────────────────────────────

function SearchBar({
  searchQuery,
  setSearchQuery,
  isForeign,
}: {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isForeign: boolean;
}) {
  return (
    <div className="relative w-full">
      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={isForeign ? 'Search by title or content...' : '제목 또는 내용으로 검색...'}
        className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
      />
      {searchQuery && (
        <button
          onClick={() => setSearchQuery('')}
          className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
          aria-label={isForeign ? 'Clear search' : '검색 초기화'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const lowerQuery = query.trim().toLowerCase();
  if (!lowerQuery) return <span>{text}</span>;

  const lowerText = text.toLowerCase();
  const parts: { text: string; highlight: boolean }[] = [];
  let lastIndex = 0;

  let index = lowerText.indexOf(lowerQuery, lastIndex);
  while (index !== -1) {
    if (index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, index), highlight: false });
    }
    parts.push({ text: text.slice(index, index + lowerQuery.length), highlight: true });
    lastIndex = index + lowerQuery.length;
    index = lowerText.indexOf(lowerQuery, lastIndex);
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false });
  }

  return (
    <>
      {parts.map((part, i) =>
        part.highlight ? (
          <mark key={i} className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5 not-italic">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

function SearchResultList({
  items,
  query,
  isForeign,
  getItemHref,
}: {
  items: DisplayItem[];
  query: string;
  isForeign: boolean;
  getItemHref: (item: DisplayItem) => string;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <p className="text-sm font-medium text-gray-500">
          {isForeign ? `No results for "${query}"` : `"${query}"에 해당하는 자료가 없습니다`}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {isForeign ? 'Try a different keyword' : '다른 키워드로 검색해보세요'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <SearchResultItem
          key={item.id}
          item={item}
          query={query}
          href={getItemHref(item)}
          isExternal={item.type === 'link'}
        />
      ))}
    </div>
  );
}

function SearchResultItem({
  item,
  query,
  href,
  isExternal,
}: {
  item: DisplayItem;
  query: string;
  href: string;
  isExternal: boolean;
}) {
  const snippet = item.content ? extractSnippet(item.content, query) : '';

  return (
    <Link
      href={href}
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:shadow-sm transition-all group"
    >
      <div className={`w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center text-base ${
        item.type === 'page' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
      }`}>
        {item.emoji || (item.type === 'page' ? '📄' : '🔗')}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-sm text-gray-900 group-hover:text-blue-600 transition-colors">
            <HighlightText text={item.title} query={query} />
          </h3>
          <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded border ${getRoleBadgeColor(item.targetRole)}`}>
            {getRoleLabel(item.targetRole)}
          </span>
        </div>

        {snippet && (
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
            <HighlightText text={snippet} query={query} />
          </p>
        )}
      </div>

      <div className="flex-shrink-0 self-center ml-1">
        <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────
// 카드 컴포넌트
// ─────────────────────────────────────────────────────────

function ItemCard({
  item,
  isAdmin,
  href,
  onNavigate,
  onDelete,
  onEdit,
  onMoveUp,
  onMoveDown,
}: {
  item: DisplayItem;
  isAdmin: boolean;
  href?: string;
  onNavigate: (item: DisplayItem) => void;
  onDelete: (item: DisplayItem) => void;
  onEdit: (item: DisplayItem) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const innerContent = (
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
          <h3 className="font-semibold text-sm sm:text-base text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 flex-1">
            {item.title}
          </h3>
        </div>

        {isAdmin && (
          <div className="flex flex-col gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0">
            {item.type === 'page' && (
              <div className="flex gap-0.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onEdit(item);
                  }}
                  className="w-5 h-5 flex items-center justify-center hover:bg-blue-50 rounded border border-gray-200 bg-white/80 backdrop-blur-sm"
                  title="수정"
                >
                  <svg className="w-2.5 h-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                {onMoveUp && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onMoveUp();
                    }}
                    className="w-5 h-5 flex items-center justify-center hover:bg-blue-50 rounded border border-gray-200 bg-white/80 backdrop-blur-sm"
                    title="위로 이동"
                  >
                    <svg className="w-2.5 h-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                )}
              </div>
            )}
            <div className="flex gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onDelete(item);
                }}
                className="w-5 h-5 flex items-center justify-center hover:bg-red-50 rounded border border-gray-200 bg-white/80 backdrop-blur-sm"
                title="삭제"
              >
                <svg className="w-2.5 h-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              {onMoveDown && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onMoveDown();
                  }}
                  className="w-5 h-5 flex items-center justify-center hover:bg-blue-50 rounded border border-gray-200 bg-white/80 backdrop-blur-sm"
                  title="아래로 이동"
                >
                  <svg className="w-2.5 h-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    const isExternal = item.type === 'link';
    return (
      <Link
        href={href}
        className="bg-white rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group relative block"
        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {innerContent}
      </Link>
    );
  }

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group relative"
      onClick={() => onNavigate(item)}
    >
      {innerContent}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 모달 컴포넌트
// ─────────────────────────────────────────────────────────

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
              <option value="expired">만료 (관리자만 표시)</option>
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
              <option value="expired">만료 (관리자만 표시)</option>
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
