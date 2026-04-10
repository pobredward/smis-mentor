'use client';

import { logger } from '@smis-mentor/shared';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';
import { campPageService, getDisplayItems } from '@/lib/campPageService';
import { NotionPage } from '@/components/notion/NotionPage';
import type { DisplayItem, CampPageCategory } from '@smis-mentor/shared';
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

interface CampDetailViewProps {
  category: CampPageCategory;
  itemId: string;
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

export default function CampDetailView({ category, itemId }: CampDetailViewProps) {
  const router = useRouter();
  const { userData } = useAuth();
  const [item, setItem] = useState<DisplayItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingContent, setEditingContent] = useState('');

  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  useEffect(() => {
    const loadItem = async () => {
      if (!activeJobCodeId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // 모든 항목 조회 후 해당 ID 찾기
        const displayItems = await getDisplayItems(activeJobCodeId, category);
        const foundItem = displayItems.find(i => i.id === itemId);
        
        if (!foundItem) {
          toast.error('항목을 찾을 수 없습니다.');
          router.back();
          return;
        }

        // 권한 체크
        const hasAccess = 
          isAdmin ||
          !foundItem.targetRole ||
          foundItem.targetRole === 'common' ||
          (userData?.role === 'mentor' && foundItem.targetRole === 'mentor') ||
          (userData?.role === 'foreign' && foundItem.targetRole === 'foreign');

        if (!hasAccess) {
          toast.error('접근 권한이 없습니다.');
          router.back();
          return;
        }

        setItem(foundItem);
      } catch (error) {
        logger.error('항목 로드 실패:', error);
        toast.error('항목을 불러오는데 실패했습니다.');
        router.back();
      } finally {
        setLoading(false);
      }
    };

    loadItem();
  }, [activeJobCodeId, category, itemId, isAdmin, userData?.role, router]);

  const handleStartEdit = () => {
    if (item?.type === 'page') {
      setEditingContent(item.content || '');
      setIsEditing(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!item || item.type !== 'page' || !userData?.userId) return;

    try {
      await campPageService.updatePage(item.id, {
        content: editingContent,
        userId: userData.userId,
      });
      
      setIsEditing(false);
      
      // 항목 다시 로드
      if (activeJobCodeId) {
        const displayItems = await getDisplayItems(activeJobCodeId, category);
        const updatedItem = displayItems.find(i => i.id === itemId);
        if (updatedItem) {
          setItem(updatedItem);
        }
      }
      
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
        <p className="mt-4 text-gray-600">로딩 중...</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-gray-600">항목을 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">
                    {item.type === 'page' ? '📄' : '🔗'}
                  </span>
                  <h1 className="text-xl font-bold text-gray-900">{item.title}</h1>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {item.type === 'page' ? '페이지' : '외부 링크'}
                </p>
              </div>
            </div>

            {isAdmin && item.type === 'page' && !isEditing && (
              <button
                onClick={handleStartEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                편집
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {item.type === 'page' ? (
          <>
            {isEditing ? (
              <div className="bg-white rounded-lg shadow-sm overflow-hidden" style={{ height: 'calc(100vh - 200px)', minHeight: '500px', maxHeight: '800px' }}>
                <CampPageEditor
                  content={editingContent}
                  onChange={setEditingContent}
                  onSave={handleSaveEdit}
                  onCancel={handleCancelEdit}
                />
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm">
                <CampPageViewer content={item.content || '<p>내용이 없습니다.</p>'} />
              </div>
            )}
          </>
        ) : (
          // 링크 타입 (기존 노션/구글시트)
          <div className="bg-white rounded-lg shadow-sm overflow-hidden" style={{ height: 'calc(100vh - 200px)', minHeight: '600px' }}>
            {extractNotionPageId(item.url || '') ? (
              <NotionPage pageId={extractNotionPageId(item.url || '')!} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <p className="text-gray-600 mb-4">이 링크는 외부 페이지입니다</p>
                <a
                  href={item.url}
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
      </div>
    </div>
  );
}
