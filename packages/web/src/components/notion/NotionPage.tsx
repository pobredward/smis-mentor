'use client';
import { logger } from '@smis-mentor/shared';

import { useState, useEffect } from 'react';
import { NotionRenderer } from 'react-notion-x';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';

// react-notion-x CSS imports
import 'react-notion-x/src/styles.css';
import 'prismjs/themes/prism-tomorrow.css';
import 'katex/dist/katex.min.css';

// 무거운 컴포넌트들은 lazy loading
const Code = dynamic(() =>
  import('react-notion-x/build/third-party/code').then((m) => m.Code)
);
const Collection = dynamic(() =>
  import('react-notion-x/build/third-party/collection').then((m) => m.Collection)
);
const Equation = dynamic(() =>
  import('react-notion-x/build/third-party/equation').then((m) => m.Equation)
);
const Pdf = dynamic(
  () => import('react-notion-x/build/third-party/pdf').then((m) => m.Pdf),
  { ssr: false }
);
const Modal = dynamic(
  () => import('react-notion-x/build/third-party/modal').then((m) => m.Modal),
  { ssr: false }
);

interface NotionPageProps {
  pageId: string;
}

// 커스텀 페이지 링크 컴포넌트 - 새 탭에서 열기
const PageLink = ({ href, children, ...props }: any) => {
  // Notion 페이지 링크인 경우 새 탭에서 열기
  if (href?.startsWith('/') && href.length > 30) {
    const pageId = href.slice(1);
    return (
      <a
        href={`https://notion.so/${pageId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="notion-link"
        {...props}
      >
        {children}
      </a>
    );
  }
  
  // 외부 링크는 그대로
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
};

export function NotionPage({ pageId }: NotionPageProps) {
  const [recordMap, setRecordMap] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPage() {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/api/notion/${pageId}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch page');
        }
        
        const data = await response.json();
        setRecordMap(data);
      } catch (err) {
        logger.error('Error fetching Notion page:', err);
        setError('페이지를 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    }

    if (pageId) {
      fetchPage();
    }
  }, [pageId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (error || !recordMap) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-red-600 font-medium">{error || '페이지를 찾을 수 없습니다.'}</p>
          <p className="text-sm text-gray-500 mt-2">페이지가 공개되어 있는지 확인해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="notion-page-wrapper w-full h-full overflow-auto bg-white">
      <NotionRenderer
        recordMap={recordMap}
        fullPage={false}
        darkMode={false}
        components={{
          nextImage: Image,
          nextLink: PageLink,
          Code,
          Collection,
          Equation,
          Pdf,
          Modal,
        }}
        mapPageUrl={(pageId) => {
          // 페이지 링크를 Notion URL로 매핑
          return `https://notion.so/${pageId}`;
        }}
        previewImages={false}
        showTableOfContents={false}
        minTableOfContentsItems={3}
      />
    </div>
  );
}
