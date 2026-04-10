'use client';

import { useEffect, useRef } from 'react';

interface CampPageViewerProps {
  content: string;
}

export default function CampPageViewer({ content }: CampPageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 테이블 컨트롤 제거 함수
  const removeTableControls = (html: string): string => {
    if (!html) return html;
    // <div class="table-controls">...</div> 제거
    return html.replace(/<div class="table-controls"[^>]*>[\s\S]*?<\/div>\s*/gi, '');
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // 링크를 새 탭에서 열기
    const links = containerRef.current.querySelectorAll('a');
    links.forEach((link) => {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });

    // YouTube iframe에 대한 반응형 래퍼 추가
    const iframes = containerRef.current.querySelectorAll('iframe[src*="youtube"]');
    iframes.forEach((iframe) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'relative w-full pb-[56.25%] my-4'; // 16:9 비율
      
      const parent = iframe.parentElement;
      if (parent) {
        parent.insertBefore(wrapper, iframe);
        iframe.classList.add('absolute', 'top-0', 'left-0', 'w-full', 'h-full');
        wrapper.appendChild(iframe);
      }
    });

    // 테이블을 가로 스크롤 가능한 wrapper로 감싸기
    const tables = containerRef.current.querySelectorAll('table');
    tables.forEach((table) => {
      // 이미 wrapper로 감싸져 있는지 확인
      if (table.parentElement?.classList.contains('table-wrapper')) return;
      
      const wrapper = document.createElement('div');
      wrapper.className = 'table-wrapper overflow-x-auto my-1.5';
      
      const parent = table.parentElement;
      if (parent) {
        parent.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      }
    });
  }, [content]);

  return (
    <div className="p-6 bg-white rounded-lg">
      <style>{`
        /* 테이블 wrapper 가로 스크롤 */
        .table-wrapper {
          overflow-x: auto;
          margin: 0.375rem 0;
        }
        
        /* 테이블 기본 스타일 - 콘텐츠 크기에 맞춤 */
        .prose table {
          border-collapse: collapse;
          table-layout: auto !important;
          width: auto !important;
          margin: 0;
        }
        
        /* colgroup 너비 적용 */
        .prose colgroup col[style*="width"] {
          min-width: initial !important;
        }
        
        .prose table td,
        .prose table th {
          border: 1px solid #d1d5db;
          padding: 0.75rem;
          vertical-align: top;
          box-sizing: border-box;
          white-space: nowrap;
        }
        
        .prose table th {
          background-color: #f3f4f6;
          font-weight: 600;
        }
        
        /* 빈 단락 처리 - 높이 확보 */
        .prose p:empty,
        .prose p:has(br:only-child) {
          min-height: 1.75rem;
          display: block;
        }
        
        /* <br> 태그 줄바꿈 처리 */
        .prose br {
          display: block;
          content: '';
          margin: 0;
        }
      `}</style>
      <div
        ref={containerRef}
        className="prose prose-slate max-w-none
          [&>h1]:text-4xl [&>h1]:font-bold [&>h1]:mb-1.5 [&>h1]:mt-3 [&>h1:first-child]:mt-0
          [&>h2]:text-3xl [&>h2]:font-bold [&>h2]:mb-1 [&>h2]:mt-2.5
          [&>h3]:text-2xl [&>h3]:font-bold [&>h3]:mb-1 [&>h3]:mt-2
          [&>p]:text-base [&>p]:leading-7 [&>p]:mb-1 [&>p]:whitespace-pre-wrap [&>p]:break-words
          [&>p:empty]:h-[1.75rem] [&>p:empty]:block
          [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-1 [&>ul]:space-y-0.5
          [&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:mb-1 [&>ol]:space-y-0.5
          [&>li]:text-base
          [&>img]:rounded-lg [&>img]:shadow-md [&>img]:my-1.5 [&>img]:max-w-full [&>img]:h-auto
          [&>blockquote]:border-l-4 [&>blockquote]:border-blue-500 [&>blockquote]:pl-4 [&>blockquote]:py-2 [&>blockquote]:my-1 [&>blockquote]:bg-blue-50
          [&>pre]:bg-gray-900 [&>pre]:text-gray-100 [&>pre]:p-4 [&>pre]:rounded-lg [&>pre]:overflow-x-auto [&>pre]:my-1
          [&>code]:bg-gray-100 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded [&>code]:text-sm [&>code]:text-red-600
          [&_a]:text-blue-600 [&_a]:underline [&_a]:hover:text-blue-800
          [&_br]:block [&_br]:content-[''] [&_br]:my-0"
        dangerouslySetInnerHTML={{ __html: removeTableControls(content) }}
      />
    </div>
  );
}
