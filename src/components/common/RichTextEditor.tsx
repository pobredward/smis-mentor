'use client';

import { useEditor, EditorContent } from '@tiptap/react';
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

const RichTextEditor = ({ content, onChange, placeholder }: RichTextEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
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
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl focus:outline-none min-h-[200px] max-w-none [&>h1]:text-4xl [&>h1]:font-bold [&>h1]:mb-4 [&>h2]:text-3xl [&>h2]:font-bold [&>h2]:mb-3 [&>h3]:text-2xl [&>h3]:font-bold [&>h3]:mb-2',
      },
    },
  });

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
      console.error('이미지 업로드 오류:', err);
      toast.error('이미지 업로드에 실패했습니다.');
    }
  };

  return (
    <div className="border border-gray-300 rounded-md">
      <div className="border-b border-gray-300 p-2 flex flex-wrap gap-2">
        <select
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'paragraph') {
              editor.chain().focus().setParagraph().run();
            } else if (value.startsWith('heading')) {
              const level = parseInt(value.split('-')[1]) as 1 | 2 | 3;
              editor.chain().focus().toggleHeading({ level }).run();
            }
          }}
          className="px-2 py-1 border border-gray-300 rounded"
          value={editor.isActive('paragraph') ? 'paragraph' : editor.isActive('heading', { level: 1 }) ? 'heading-1' : editor.isActive('heading', { level: 2 }) ? 'heading-2' : editor.isActive('heading', { level: 3 }) ? 'heading-3' : 'paragraph'}
        >
          <option value="paragraph">본문</option>
          <option value="heading-1">제목 1</option>
          <option value="heading-2">제목 2</option>
          <option value="heading-3">제목 3</option>
        </select>

        <div className="flex border border-gray-300 rounded">
          <button
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={`p-1 ${editor.isActive({ textAlign: 'left' }) ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
            title="왼쪽 정렬"
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M2 5a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 5a1 1 0 011-1h8a1 1 0 110 2H3a1 1 0 01-1-1zm0 5a1 1 0 011-1h11a1 1 0 110 2H3a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={`p-1 ${editor.isActive({ textAlign: 'center' }) ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
            title="가운데 정렬"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M2 5a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm2 5a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zm0 5a1 1 0 011-1h8a1 1 0 110 2H5a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={`p-1 ${editor.isActive({ textAlign: 'right' }) ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
            title="오른쪽 정렬"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M2 5a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm4 5a1 1 0 011-1h10a1 1 0 110 2H7a1 1 0 01-1-1zm2 5a1 1 0 011-1h8a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="flex border border-gray-300 rounded">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1 ${editor.isActive('bold') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
            title="굵게"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.5 10a3.5 3.5 0 01-3.5 3.5H7v-7h3a3.5 3.5 0 013.5 3.5zM7 15h3.5a3.5 3.5 0 003.5-3.5V10a3.5 3.5 0 00-3.5-3.5H7v7z" />
            </svg>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1 ${editor.isActive('italic') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
            title="기울임"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 4.5l1.5-.5-3 12-1.5.5 3-12z" />
            </svg>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1 ${editor.isActive('underline') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
            title="밑줄"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M7 3a1 1 0 011 1v8a3 3 0 006 0V4a1 1 0 112 0v8a5 5 0 01-10 0V4a1 1 0 011-1z" />
              <path fillRule="evenodd" d="M3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="flex border border-gray-300 rounded">
          <button
            onClick={() => {
              const url = window.prompt('링크를 입력하세요:');
              if (url) {
                editor.chain().focus().setLink({ href: url }).run();
              }
            }}
            className={`p-1 ${editor.isActive('link') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
            title="링크"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
            </svg>
          </button>
          <label className="p-1 cursor-pointer hover:bg-gray-100" title="이미지 업로드">
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
        </div>

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