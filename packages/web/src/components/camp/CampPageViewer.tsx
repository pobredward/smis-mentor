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

    // 토글 블록 클릭 이벤트 추가
    const toggleHeaders = containerRef.current.querySelectorAll('.toggle-header');
    toggleHeaders.forEach((header) => {
      const toggleBlock = header.parentElement;
      if (!toggleBlock) return;

      header.addEventListener('click', () => {
        const content = toggleBlock.querySelector('.toggle-content');
        const isCollapsed = toggleBlock.getAttribute('data-collapsed') === 'true';

        if (isCollapsed) {
          // 펼치기
          toggleBlock.setAttribute('data-collapsed', 'false');
          if (content instanceof HTMLElement) {
            content.style.display = 'block';
          }
        } else {
          // 접기
          toggleBlock.setAttribute('data-collapsed', 'true');
          if (content instanceof HTMLElement) {
            content.style.display = 'none';
          }
        }
      });
    });
  }, [content]);

  return (
    <div className="p-4 md:p-6 bg-white md:rounded-lg">
      <style>{`
        /* 테이블 wrapper 가로 스크롤 */
        .table-wrapper {
          overflow-x: auto;
          margin: 6px 0;
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
          padding: 0.5rem;
          vertical-align: top;
          box-sizing: border-box;
          white-space: normal;
          word-break: break-word;
          min-width: 80px;
        }
        
        .prose table th {
          background-color: #f3f4f6;
          font-weight: 600;
        }
        
        /* 단락(p) 마진 줄이기 */
        .prose p {
          margin-top: 0.25rem !important;
          margin-bottom: 0.25rem !important;
        }
        
        /* 빈 단락 처리 - 높이 확보 */
        .prose p:empty,
        .prose p:has(br:only-child) {
          min-height: 1.75rem;
          display: block;
        }
        
        /* 리스트 마진 줄이기 */
        .prose ul,
        .prose ol {
          margin-top: 0.25rem !important;
          margin-bottom: 0.25rem !important;
        }
        
        /* 리스트 아이템 내부 단락 마진 제거 */
        .prose ul > li > p,
        .prose ol > li > p {
          margin-top: 0 !important;
          margin-bottom: 0 !important;
        }
        
        /* 리스트 아이템 간격 */
        .prose ul > li,
        .prose ol > li {
          margin-top: 0.125rem !important;
          margin-bottom: 0.125rem !important;
        }
        
        /* <br> 태그 줄바꿈 처리 */
        .prose br {
          display: block;
          content: '';
          margin: 0;
        }
        
        /* 볼드체 스타일 */
        .prose strong,
        .prose b {
          font-weight: 700;
        }
        
        /* 토글 블록 스타일 */
        .prose .toggle-block {
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 0.75rem;
          margin: 0.5rem 0;
          background-color: #f9fafb;
        }
        
        .prose .toggle-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          user-select: none;
        }
        
        .prose .toggle-header:hover {
          opacity: 0.8;
        }
        
        .prose .toggle-icon {
          transition: transform 0.2s ease;
          font-size: 0.875rem;
          display: inline-block;
        }
        
        .prose .toggle-block[data-collapsed="false"] .toggle-icon {
          transform: rotate(90deg);
        }
        
        .prose .toggle-content {
          margin-top: 0.5rem;
          padding-left: 1.5rem;
        }
      `}</style>
      <div
        ref={containerRef}
        className="prose prose-slate max-w-none
          [&>h1]:text-4xl [&>h1]:font-bold [&>h1]:mb-3 [&>h1]:mt-3 [&>h1:first-child]:mt-0
          [&>h2]:text-3xl [&>h2]:font-bold [&>h2]:mb-2.5 [&>h2]:mt-2.5
          [&>h3]:text-2xl [&>h3]:font-bold [&>h3]:mb-2 [&>h3]:mt-2
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
