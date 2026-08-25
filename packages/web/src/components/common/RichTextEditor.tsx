'use client';
import { logger } from '@smis-mentor/shared';

import { useEditor, EditorContent } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { uploadImage } from '@/lib/firebaseService';
import toast from 'react-hot-toast';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

/**
 * 노드를 unwrap합니다 (태그를 제거하고 자식 노드를 부모로 이동).
 */
function unwrapElement(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
}

/**
 * 브라우저 렌더링 DOM에서 복사된 HTML을 Tiptap이 올바르게 파싱할 수 있도록 정제합니다.
 *
 * 주요 처리:
 * 1. class, style, data-* 속성 제거 (href, src 유지)
 * 2. <div> unwrap — 자식을 부모로 올리고 div 제거 (중첩 지원을 위해 반복 처리)
 * 3. <li> 안의 직계 <p> unwrap — Tiptap이 li>p를 단락으로 분리하는 문제 방지
 * 4. 빈 블록 요소 제거
 */
function sanitizePastedHTML(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 1. 모든 노드에서 class, style, data-* 속성 제거 (href, src는 유지)
  doc.querySelectorAll('*').forEach((el) => {
    el.removeAttribute('class');
    el.removeAttribute('style');
    Array.from(el.attributes)
      .filter(attr => attr.name.startsWith('data-'))
      .forEach(attr => el.removeAttribute(attr.name));
  });

  // 2. <div> unwrap — querySelectorAll은 스냅샷이므로 div가 없어질 때까지 반복
  let divs = doc.querySelectorAll('div');
  while (divs.length > 0) {
    divs.forEach(unwrapElement);
    divs = doc.querySelectorAll('div');
  }

  // 3. <li> 안의 직계 <p> unwrap
  // Tiptap은 <li><p>텍스트</p></li>를 처리하지 못해 리스트 아이템을 단락으로 분리
  doc.querySelectorAll('li > p').forEach(unwrapElement);

  // 4. <a> 태그는 href만 남기고 다른 속성 제거 (이미 위에서 class/style 제거됨)
  // target, rel 등 불필요한 속성 제거하되 href는 반드시 유지
  doc.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href');
    // 속성 전체 제거 후 href만 복원
    Array.from(a.attributes).forEach(attr => a.removeAttribute(attr.name));
    if (href) a.setAttribute('href', href);
  });

  // 5. 빈 <p> 제거 (텍스트도 없고 의미 있는 자식도 없는 경우)
  doc.querySelectorAll('p').forEach((p) => {
    if (!p.textContent?.trim() && !p.querySelector('img, a')) {
      p.remove();
    }
  });

  return doc.body.innerHTML;
}

const RichTextEditor = ({ content, onChange, placeholder }: RichTextEditorProps) => {
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
        hardBreak: {
          keepMarks: false,
        },
      }),
      Image,
      Link.configure({
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
      }),
      TextStyle,
      Color,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      // iframe 태그를 제거하고 일반 텍스트로 변환
      let html = editor.getHTML();
      
      // iframe을 일반 텍스트로 변환
      html = html.replace(/<iframe[^>]*src="([^"]*)"[^>]*>[\s\S]*?<\/iframe>/gi, (match, src) => {
        return src; // iframe을 URL 텍스트로 변환
      });
      
      // oembed도 제거
      html = html.replace(/<oembed[^>]*url="([^"]*)"[^>]*>[\s\S]*?<\/oembed>/gi, (match, url) => {
        return url;
      });
      
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-slate max-w-none focus:outline-none min-h-[200px] [&>p]:whitespace-pre-wrap [&>p]:break-words [&>p:empty]:h-[1em] [&>p:empty]:block [&>p]:min-h-[1.5em] [&>ul]:list-disc [&>ul]:pl-[1.625em] [&>ol]:list-decimal [&>ol]:pl-[1.625em] [&>h1]:text-4xl [&>h1]:font-bold [&>h1]:mb-4 [&>h2]:text-3xl [&>h2]:font-bold [&>h2]:mb-3 [&>h3]:text-2xl [&>h3]:font-bold [&>h3]:mb-2',
      },
      handlePaste: (view, event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const html = clipboardData.getData('text/html');
        const text = clipboardData.getData('text/plain');

        // YouTube/iframe 콘텐츠는 plain text로만 삽입
        if ((html && (html.includes('<iframe') || html.includes('<oembed') || html.includes('youtube.com') || html.includes('youtu.be'))) || 
            (text && (text.includes('youtube.com') || text.includes('youtu.be')))) {
          event.preventDefault();
          const { state, dispatch } = view;
          dispatch(state.tr.insertText(text, state.selection.$from.pos));
          return true;
        }

        // 외부 HTML(다른 웹페이지, 공고 복붙 등)이 있을 경우
        // 브라우저 렌더링 DOM에는 <div>, class, style 등이 포함되어
        // Tiptap이 빈 단락을 대량으로 만들기 때문에 핵심 태그만 남겨 삽입
        //
        // 단, Tiptap 에디터 내부에서 복사한 경우는 Tiptap이 자체 직렬화 포맷을 사용하므로
        // 기본 처리에 맡겨야 함 (ProseMirror 내부 마커 감지)
        if (html) {
          const isTiptapInternal = html.includes('data-pm-slice') || html.includes('data-tiptap');
          if (isTiptapInternal) {
            return false; // Tiptap 기본 처리에 위임
          }

          event.preventDefault();
          const cleanedHTML = sanitizePastedHTML(html);
          // handlePaste는 ProseMirror 레벨이라 editor가 아직 null일 수 있으므로 ref 사용
          editorRef.current?.commands.insertContent(cleanedHTML);
          return true;
        }

        return false;
      },
    },
  });

  // editorRef를 최신 editor 인스턴스로 유지
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // content prop이 외부에서 변경될 때 에디터 내용을 동기화
  // (예: 다른 공고 내용 복붙 시 HTML이 에디터에 올바르게 반영되도록)
  useEffect(() => {
    if (!editor) return;
    const currentHTML = editor.getHTML();
    if (currentHTML !== content) {
      editor.commands.setContent(content, false);
    }
  }, [editor, content]);

  if (!editor) {
    return null;
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    try {
      const imageUrl = await uploadImage(file);
      editor.chain().focus().setImage({ src: imageUrl }).run();
      toast.success('이미지가 업로드되었습니다.');
    } catch (err) {
      logger.error('이미지 업로드 오류:', err);
      toast.error('이미지 업로드에 실패했습니다.');
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="border-b bg-gray-50 p-2 flex flex-wrap gap-1">
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`p-2 rounded ${editor.isActive('heading', { level: 1 }) ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="제목 1"
        >
          <span className="font-bold">H1</span>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-2 rounded ${editor.isActive('heading', { level: 2 }) ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="제목 2"
        >
          <span className="font-bold">H2</span>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`p-2 rounded ${editor.isActive('heading', { level: 3 }) ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="제목 3"
        >
          <span className="font-bold">H3</span>
        </button>

        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-2 rounded ${editor.isActive('bold') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="굵게"
        >
          <span className="font-bold">B</span>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-2 rounded ${editor.isActive('italic') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="기울임"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 4.5l1.5-.5-3 12-1.5.5 3-12z" />
          </svg>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`p-2 rounded ${editor.isActive('underline') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="밑줄"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M7 3a1 1 0 011 1v8a3 3 0 006 0V4a1 1 0 112 0v8a5 5 0 01-10 0V4a1 1 0 011-1z" />
            <path fillRule="evenodd" d="M3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-2 rounded ${editor.isActive('bulletList') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="글머리 기호"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M8 4h13v2H8V4zM4.5 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 6.9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM8 11h13v2H8v-2zm0 7h13v2H8v-2z"/>
          </svg>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-2 rounded ${editor.isActive('orderedList') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="번호 매기기"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M3 4h2v2H3V4zm0 7h2v2H3v-2zm0 7h2v2H3v-2zm4-14h14v2H7V4zm0 7h14v2H7v-2zm0 7h14v2H7v-2z"/>
          </svg>
        </button>
        <button
          onClick={() => {
            const url = window.prompt('링크를 입력하세요:');
            if (url) {
              editor.chain().focus().setLink({ href: url }).run();
            }
          }}
          className={`p-2 rounded ${editor.isActive('link') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="링크"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
          </svg>
        </button>
        <label className="p-2 cursor-pointer hover:bg-gray-100" title="이미지 업로드">
          <input
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleImageUpload}
          />
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
          </svg>
        </label>
        <input
          type="color"
          onInput={(event) => {
            editor.chain().focus().setColor((event.target as HTMLInputElement).value).run();
          }}
          className="w-8 h-8 p-0 rounded cursor-pointer"
          title="텍스트 색상"
        />
      </div>
      <div className="relative">
        <EditorContent editor={editor} className="p-4" />
        {!editor.getText() && (
          <div className="absolute top-0 left-0 p-4 text-gray-400 pointer-events-none">
            {placeholder || '내용을 입력하세요...'}
          </div>
        )}
      </div>
    </div>
  );
};

export default RichTextEditor; 