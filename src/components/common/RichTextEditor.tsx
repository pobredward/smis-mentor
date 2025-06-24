'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import { useEffect, useState } from 'react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { uploadImage } from '@/lib/firebaseService';
import toast from 'react-hot-toast';
import dynamic from 'next/dynamic';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

const RichTextEditor = ({ content, onChange, placeholder }: RichTextEditorProps) => {
  const [isMounted, setIsMounted] = useState(false);

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
      }),
      Image,
      Link.configure({
        openOnClick: false,
      }),
      TextStyle,
      Color,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      if (isMounted) {
        const html = editor.getHTML();
        const processedHtml = html.replace(/<p><br><\/p>\s*<p><br><\/p>/g, '<p><br></p><p><br></p>');
        onChange(processedHtml);
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-slate max-w-none focus:outline-none min-h-[200px] [&>p]:whitespace-pre-wrap [&>p]:break-words [&>p:empty]:h-[1em] [&>p:empty]:block [&>p]:min-h-[1.5em] [&>ul]:list-disc [&>ul]:pl-[1.625em] [&>ol]:list-decimal [&>ol]:pl-[1.625em] [&>h1]:text-4xl [&>h1]:font-bold [&>h1]:mb-4 [&>h2]:text-3xl [&>h2]:font-bold [&>h2]:mb-3 [&>h3]:text-2xl [&>h3]:font-bold [&>h3]:mb-2',
      },
    },
  });

  useEffect(() => {
    setIsMounted(true);
    return () => {
      setIsMounted(false);
    };
  }, []);

  useEffect(() => {
    if (editor && isMounted && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor, isMounted]);

  useEffect(() => {
    return () => {
      if (editor && !editor.isDestroyed) {
        try {
          editor.destroy();
        } catch (error) {
          console.warn('Editor destruction error:', error);
        }
      }
    };
  }, [editor]);

  if (!isMounted || !editor) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="border-b bg-gray-50 p-2 h-12 animate-pulse">
          <div className="h-8 bg-gray-200 rounded"></div>
        </div>
        <div className="p-4 animate-pulse">
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
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
      if (editor && !editor.isDestroyed && isMounted) {
        editor.chain().focus().setImage({ src: imageUrl }).run();
        toast.success('이미지가 업로드되었습니다.');
      }
    } catch (err) {
      console.error('이미지 업로드 오류:', err);
      toast.error('이미지 업로드에 실패했습니다.');
    }
  };

  const handleButtonClick = (callback: () => void) => {
    if (editor && !editor.isDestroyed && isMounted) {
      try {
        callback();
      } catch (error) {
        console.warn('Editor command error:', error);
      }
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="border-b bg-gray-50 p-2 flex flex-wrap gap-1">
        <button
          onClick={() => handleButtonClick(() => editor.chain().focus().toggleHeading({ level: 1 }).run())}
          className={`p-2 rounded ${editor.isActive('heading', { level: 1 }) ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="제목 1"
          type="button"
        >
          <span className="font-bold">H1</span>
        </button>
        <button
          onClick={() => handleButtonClick(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}
          className={`p-2 rounded ${editor.isActive('heading', { level: 2 }) ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="제목 2"
          type="button"
        >
          <span className="font-bold">H2</span>
        </button>
        <button
          onClick={() => handleButtonClick(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}
          className={`p-2 rounded ${editor.isActive('heading', { level: 3 }) ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="제목 3"
          type="button"
        >
          <span className="font-bold">H3</span>
        </button>

        <button
          onClick={() => handleButtonClick(() => editor.chain().focus().toggleBold().run())}
          className={`p-2 rounded ${editor.isActive('bold') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="굵게"
          type="button"
        >
          <span className="font-bold">B</span>
        </button>
        <button
          onClick={() => handleButtonClick(() => editor.chain().focus().toggleItalic().run())}
          className={`p-2 rounded ${editor.isActive('italic') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="기울임"
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 4.5l1.5-.5-3 12-1.5.5 3-12z" />
          </svg>
        </button>
        <button
          onClick={() => handleButtonClick(() => editor.chain().focus().toggleUnderline().run())}
          className={`p-2 rounded ${editor.isActive('underline') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="밑줄"
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7 3a1 1 0 011 1v8a3 3 0 006 0V4a1 1 0 112 0v8a5 5 0 01-10 0V4a1 1 0 011-1z" />
            <path fillRule="evenodd" d="M3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          onClick={() => handleButtonClick(() => editor.chain().focus().toggleBulletList().run())}
          className={`p-2 rounded ${editor.isActive('bulletList') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="글머리 기호"
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M8 4h13v2H8V4zM4.5 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 6.9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM8 11h13v2H8v-2zm0 7h13v2H8v-2z"/>
          </svg>
        </button>
        <button
          onClick={() => handleButtonClick(() => editor.chain().focus().toggleOrderedList().run())}
          className={`p-2 rounded ${editor.isActive('orderedList') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="번호 매기기"
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M3 4h2v2H3V4zm0 7h2v2H3v-2zm0 7h2v2H3v-2zm4-14h14v2H7V4zm0 7h14v2H7v-2zm0 7h14v2H7v-2z"/>
          </svg>
        </button>
        <button
          onClick={() => {
            const url = window.prompt('링크를 입력하세요:');
            if (url && editor && !editor.isDestroyed) {
              editor.chain().focus().setLink({ href: url }).run();
            }
          }}
          className={`p-2 rounded ${editor.isActive('link') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
          title="링크"
          type="button"
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
            if (editor && !editor.isDestroyed && isMounted) {
              editor.chain().focus().setColor((event.target as HTMLInputElement).value).run();
            }
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

// 내부 에디터 컴포넌트
const InternalRichTextEditor = RichTextEditor;

// 동적 import를 위한 래퍼 컴포넌트
const DynamicRichTextEditor = dynamic(
  () => Promise.resolve(InternalRichTextEditor),
  { 
    ssr: false,
    loading: () => (
      <div className="border rounded-lg overflow-hidden">
        <div className="border-b bg-gray-50 p-2 h-12 animate-pulse">
          <div className="h-8 bg-gray-200 rounded"></div>
        </div>
        <div className="p-4 animate-pulse">
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }
);

export default DynamicRichTextEditor; 