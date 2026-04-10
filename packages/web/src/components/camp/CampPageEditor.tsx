'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { uploadImage } from '@/lib/firebaseService';
import { logger } from '@smis-mentor/shared';
import toast from 'react-hot-toast';
import { useState } from 'react';

interface CampPageEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  placeholder?: string;
}

export default function CampPageEditor({
  content,
  onChange,
  onSave,
  onCancel,
  placeholder = '내용을 입력하세요...',
}: CampPageEditorProps) {
  const [isUploading, setIsUploading] = useState(false);

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
        history: {
          depth: 100,
          newGroupDelay: 0, // 모든 변경사항을 즉시 기록
        },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline hover:text-blue-800',
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse border border-gray-300',
        },
        cellMinWidth: 50,
      }),
      TableRow.configure({
        HTMLAttributes: {
          class: 'border border-gray-300',
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: 'border border-gray-300 p-2 min-w-[50px] relative',
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: 'border border-gray-300 p-2 bg-gray-100 font-semibold min-w-[50px] relative',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Underline,
      TextStyle,
      Color,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-slate max-w-none focus:outline-none min-h-[200px] p-4',
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
      setIsUploading(true);
      const imageUrl = await uploadImage(file);
      editor.chain().focus().setImage({ src: imageUrl }).run();
      toast.success('이미지가 업로드되었습니다.');
    } catch (err) {
      logger.error('이미지 업로드 오류:', err);
      toast.error('이미지 업로드에 실패했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('링크를 입력하세요:', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const handleSave = () => {
    if (!onSave) return;

    const html = editor.getHTML();
    
    // iframe, oembed, youtube embed 등 체크
    if (
      html.includes('<iframe') || 
      html.includes('<oembed') || 
      html.includes('youtube.com/embed') ||
      html.includes('youtu.be')
    ) {
      toast.error('동영상 임베드는 사용할 수 없습니다. 유튜브 링크는 일반 텍스트로 입력해주세요.');
      return;
    }

    onSave();
  };

  return (
    <div className="flex flex-col h-full">
      {/* 툴바 */}
      <div className="border-b bg-gray-50 p-2 flex flex-wrap gap-1 sticky top-0 z-10">
        {/* 실행 취소/재실행 */}
        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className={`px-3 py-1.5 rounded text-sm ${
            editor.can().undo()
              ? 'bg-white hover:bg-gray-100'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
          title="실행 취소 (Ctrl+Z)"
        >
          ↶
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className={`px-3 py-1.5 rounded text-sm ${
            editor.can().redo()
              ? 'bg-white hover:bg-gray-100'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
          title="재실행 (Ctrl+Shift+Z)"
        >
          ↷
        </button>

        <div className="w-px h-6 bg-gray-300 mx-1"></div>

        {/* 제목 스타일 */}
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`px-3 py-1.5 rounded text-sm font-semibold ${
            editor.isActive('heading', { level: 1 })
              ? 'bg-blue-600 text-white'
              : 'bg-white hover:bg-gray-100'
          }`}
          title="제목 1"
        >
          H1
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`px-3 py-1.5 rounded text-sm font-semibold ${
            editor.isActive('heading', { level: 2 })
              ? 'bg-blue-600 text-white'
              : 'bg-white hover:bg-gray-100'
          }`}
          title="제목 2"
        >
          H2
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`px-3 py-1.5 rounded text-sm font-semibold ${
            editor.isActive('heading', { level: 3 })
              ? 'bg-blue-600 text-white'
              : 'bg-white hover:bg-gray-100'
          }`}
          title="제목 3"
        >
          H3
        </button>

        <div className="w-px h-6 bg-gray-300 mx-1"></div>

        {/* 텍스트 스타일 */}
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`px-3 py-1.5 rounded text-sm ${
            editor.isActive('bold')
              ? 'bg-blue-600 text-white font-bold'
              : 'bg-white hover:bg-gray-100 font-bold'
          }`}
          title="굵게"
        >
          B
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`px-3 py-1.5 rounded text-sm ${
            editor.isActive('italic')
              ? 'bg-blue-600 text-white italic'
              : 'bg-white hover:bg-gray-100 italic'
          }`}
          title="기울임"
        >
          I
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`px-3 py-1.5 rounded text-sm ${
            editor.isActive('underline')
              ? 'bg-blue-600 text-white underline'
              : 'bg-white hover:bg-gray-100 underline'
          }`}
          title="밑줄"
        >
          U
        </button>

        <div className="w-px h-6 bg-gray-300 mx-1"></div>

        {/* 정렬 */}
        <button
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          className={`px-3 py-1.5 rounded text-sm ${
            editor.isActive({ textAlign: 'left' })
              ? 'bg-blue-600 text-white'
              : 'bg-white hover:bg-gray-100'
          }`}
          title="왼쪽 정렬"
        >
          ←
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          className={`px-3 py-1.5 rounded text-sm ${
            editor.isActive({ textAlign: 'center' })
              ? 'bg-blue-600 text-white'
              : 'bg-white hover:bg-gray-100'
          }`}
          title="가운데 정렬"
        >
          ↔
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          className={`px-3 py-1.5 rounded text-sm ${
            editor.isActive({ textAlign: 'right' })
              ? 'bg-blue-600 text-white'
              : 'bg-white hover:bg-gray-100'
          }`}
          title="오른쪽 정렬"
        >
          →
        </button>

        <div className="w-px h-6 bg-gray-300 mx-1"></div>

        {/* 리스트 */}
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`px-3 py-1.5 rounded text-sm ${
            editor.isActive('bulletList')
              ? 'bg-blue-600 text-white'
              : 'bg-white hover:bg-gray-100'
          }`}
          title="글머리 기호"
        >
          •
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`px-3 py-1.5 rounded text-sm ${
            editor.isActive('orderedList')
              ? 'bg-blue-600 text-white'
              : 'bg-white hover:bg-gray-100'
          }`}
          title="번호 매기기"
        >
          1.
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`px-3 py-1.5 rounded text-sm ${
            editor.isActive('blockquote')
              ? 'bg-blue-600 text-white'
              : 'bg-white hover:bg-gray-100'
          }`}
          title="인용구"
        >
          "
        </button>

        <div className="w-px h-6 bg-gray-300 mx-1"></div>

        {/* 토글 */}
        <button
          onClick={() => {
            const title = window.prompt('토글 제목을 입력하세요:', '토글 제목');
            if (!title) return;
            
            const toggleHTML = `
              <div class="toggle-block" data-collapsed="true">
                <div class="toggle-header">
                  <span class="toggle-icon">▶</span>
                  <strong>${title}</strong>
                </div>
                <div class="toggle-content" style="display: none;">
                  <p>내용을 입력하세요...</p>
                </div>
              </div>
            `;
            editor.chain().focus().insertContent(toggleHTML).run();
          }}
          className="px-3 py-1.5 rounded text-sm bg-white hover:bg-gray-100"
          title="토글 (접기/펼치기)"
        >
          ▼
        </button>

        <div className="w-px h-6 bg-gray-300 mx-1"></div>

        {/* 테이블 */}
        <button
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
          className="px-3 py-1.5 rounded text-sm bg-white hover:bg-gray-100"
          title="표 삽입"
        >
          표
        </button>
        {editor.isActive('table') && (
          <>
            <button
              onClick={() => editor.chain().focus().addColumnBefore().run()}
              className="px-2 py-1.5 rounded text-xs bg-white hover:bg-gray-100"
              title="열 추가(왼쪽)"
            >
              +열←
            </button>
            <button
              onClick={() => editor.chain().focus().addRowBefore().run()}
              className="px-2 py-1.5 rounded text-xs bg-white hover:bg-gray-100"
              title="행 추가(위)"
            >
              +행↑
            </button>
            <button
              onClick={() => editor.chain().focus().deleteColumn().run()}
              className="px-2 py-1.5 rounded text-xs bg-red-50 hover:bg-red-100 text-red-600"
              title="열 삭제"
            >
              -열
            </button>
            <button
              onClick={() => editor.chain().focus().deleteRow().run()}
              className="px-2 py-1.5 rounded text-xs bg-red-50 hover:bg-red-100 text-red-600"
              title="행 삭제"
            >
              -행
            </button>
            <button
              onClick={() => editor.chain().focus().deleteTable().run()}
              className="px-2 py-1.5 rounded text-xs bg-red-100 hover:bg-red-200 text-red-700"
              title="표 삭제"
            >
              표삭제
            </button>
          </>
        )}

        <div className="w-px h-6 bg-gray-300 mx-1"></div>

        {/* 링크 */}
        <button
          onClick={handleAddLink}
          className={`px-3 py-1.5 rounded text-sm ${
            editor.isActive('link')
              ? 'bg-blue-600 text-white'
              : 'bg-white hover:bg-gray-100'
          }`}
          title="링크"
        >
          🔗
        </button>

        {/* 이미지 */}
        <label
          className={`px-3 py-1.5 rounded text-sm bg-white hover:bg-gray-100 cursor-pointer ${
            isUploading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          title="이미지 업로드"
        >
          {isUploading ? '⏳' : '🖼️'}
          <input
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleImageUpload}
            disabled={isUploading}
          />
        </label>

        {/* 텍스트 색상 */}
        <input
          type="color"
          onInput={(event) => {
            editor.chain().focus().setColor((event.target as HTMLInputElement).value).run();
          }}
          className="w-8 h-8 rounded cursor-pointer border border-gray-300"
          title="텍스트 색상"
        />
      </div>

      {/* 에디터 영역 */}
      <div className="flex-1 overflow-auto bg-white relative">
        <style>{`
          /* Tiptap 테이블 리사이즈 핸들 스타일 개선 */
          .ProseMirror .tableWrapper {
            overflow-x: auto;
            margin: 1rem 0;
          }
          
          .ProseMirror table {
            border-collapse: collapse;
            table-layout: fixed;
            width: 100%;
            margin: 0;
            overflow: hidden;
          }
          
          .ProseMirror table td,
          .ProseMirror table th {
            min-width: 50px;
            border: 1px solid #d1d5db;
            padding: 8px;
            vertical-align: top;
            box-sizing: border-box;
            position: relative;
          }
          
          .ProseMirror table th {
            background-color: #f3f4f6;
            font-weight: 600;
          }
          
          /* 리사이즈 핸들 */
          .ProseMirror .column-resize-handle {
            position: absolute;
            right: -2px;
            top: 0;
            bottom: 0;
            width: 4px;
            background-color: #3b82f6;
            cursor: col-resize;
            z-index: 10;
            opacity: 0;
          }
          
          .ProseMirror table:hover .column-resize-handle {
            opacity: 0.5;
          }
          
          .ProseMirror .column-resize-handle:hover {
            opacity: 1 !important;
          }
          
          /* 선택된 셀 하이라이트 */
          .ProseMirror .selectedCell:after {
            z-index: 2;
            position: absolute;
            content: "";
            left: 0;
            right: 0;
            top: 0;
            bottom: 0;
            background: rgba(59, 130, 246, 0.1);
            pointer-events: none;
          }
          
          /* 토글 블록 스타일 */
          .ProseMirror .toggle-block {
            border: 1px solid #e5e7eb;
            border-radius: 0.5rem;
            padding: 0.75rem;
            margin: 0.5rem 0;
            background-color: #f9fafb;
          }
          
          .ProseMirror .toggle-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            cursor: pointer;
            user-select: none;
          }
          
          .ProseMirror .toggle-icon {
            transition: transform 0.2s ease;
            font-size: 0.875rem;
          }
          
          .ProseMirror .toggle-block[data-collapsed="false"] .toggle-icon {
            transform: rotate(90deg);
          }
          
          .ProseMirror .toggle-content {
            margin-top: 0.5rem;
            padding-left: 1.5rem;
          }
        `}</style>
        <EditorContent editor={editor} />
        {!editor.getText() && (
          <div className="absolute top-4 left-4 text-gray-400 pointer-events-none">
            {placeholder}
          </div>
        )}
      </div>

      {/* 저장/취소 버튼 */}
      {(onSave || onCancel) && (
        <div className="border-t bg-gray-50 p-4 flex justify-end gap-2">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              취소
            </button>
          )}
          {onSave && (
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              저장
            </button>
          )}
        </div>
      )}
    </div>
  );
}
