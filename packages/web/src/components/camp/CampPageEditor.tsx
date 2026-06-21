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
import Details from '@tiptap/extension-details';
import DetailsSummary from '@tiptap/extension-details-summary';
import DetailsContent from '@tiptap/extension-details-content';
import { uploadImage } from '@/lib/firebaseService';
import { logger } from '@smis-mentor/shared';
import toast from 'react-hot-toast';
import { useState, useRef } from 'react';

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
  // paste 핸들러에서 최신 editor 인스턴스에 접근하기 위한 ref
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  const editor = useEditor({
    immediatelyRender: false,
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
      Details.configure({
        persist: true,
        openClassName: 'is-open',
        HTMLAttributes: {
          class: 'details-block',
        },
      }),
      DetailsSummary,
      DetailsContent,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-slate max-w-none focus:outline-none min-h-[200px] p-4',
      },
      handlePaste: (_view, event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const currentEditor = editorRef.current;
        if (!currentEditor) return false;

        // 이미지 blob 우선 처리 (이미지 우클릭 → 복사 후 붙여넣기)
        const imageItem = Array.from(clipboardData.items).find((item) =>
          item.type.startsWith('image/')
        );
        if (imageItem) {
          const blob = imageItem.getAsFile();
          if (blob) {
            event.preventDefault();
            const ext = blob.type.split('/')[1] || 'png';
            const file = new File([blob], `paste_${Date.now()}.${ext}`, { type: blob.type });
            toast.loading('이미지 업로드 중...', { id: 'paste-image' });
            uploadImage(file)
              .then((url) => {
                currentEditor.chain().focus().setImage({ src: url }).run();
                toast.success('이미지가 삽입되었습니다.', { id: 'paste-image' });
              })
              .catch(() => {
                toast.error('이미지 업로드에 실패했습니다.', { id: 'paste-image' });
              });
            return true;
          }
        }

        const html = clipboardData.getData('text/html');
        if (!html) return false;

        // 노션 출처 식별: <!-- notionvc: ... --> 주석 포함 여부 확인
        const isFromNotion = html.includes('notionvc:') || html.includes('notion-block');

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        if (!isFromNotion && doc.body.querySelectorAll('details').length === 0) return false;

        // 노션 S3 이미지 URL 목록 수집 (DOM 전체에서)
        const isNotionImgSrc = (src: string) =>
          src.includes('prod-files-secure.s3') ||
          src.includes('notion.so') ||
          src.includes('notionusercontent.com');

        const notionImgUrls = Array.from(doc.querySelectorAll('img'))
          .map((el) => el.getAttribute('src') || '')
          .filter(isNotionImgSrc);

        // 노션 토글 <li> 판별:
        // 첫 번째 직계 자식이 <p>이고 자식이 2개 이상이거나, 첫 <p> 안에 <img> 포함
        const isToggleLi = (li: Element): boolean => {
          const children = Array.from(li.children);
          if (children.length === 0) return false;
          const first = children[0];
          if (first.tagName !== 'P') return false;
          return children.length >= 2 || first.querySelector('img') !== null;
        };

        // 노션 HTML → Tiptap JSON 재귀 변환
        // HTML 문자열 대신 JSON을 쓰는 이유: 중첩 <details> 파싱 시 Tiptap HTML 파서 오류 방지
        type TiptapNode = {
          type: string;
          attrs?: Record<string, unknown>;
          content?: TiptapNode[];
          marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
          text?: string;
        };

        const textNodeToTiptap = (el: Element): TiptapNode[] => {
          // <p> → paragraph, 텍스트 노드/인라인 요소 처리
          const nodes: TiptapNode[] = [];
          el.childNodes.forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE) {
              const text = child.textContent ?? '';
              if (text) nodes.push({ type: 'text', text });
            } else if (child.nodeType === Node.ELEMENT_NODE) {
              const el2 = child as Element;
              if (el2.tagName === 'STRONG' || el2.tagName === 'B') {
                const text = el2.textContent ?? '';
                if (text) nodes.push({ type: 'text', text, marks: [{ type: 'bold' }] });
              } else if (el2.tagName === 'EM' || el2.tagName === 'I') {
                const text = el2.textContent ?? '';
                if (text) nodes.push({ type: 'text', text, marks: [{ type: 'italic' }] });
              } else if (el2.tagName === 'U') {
                const text = el2.textContent ?? '';
                if (text) nodes.push({ type: 'text', text, marks: [{ type: 'underline' }] });
              } else if (el2.tagName === 'CODE') {
                const text = el2.textContent ?? '';
                if (text) nodes.push({ type: 'text', text, marks: [{ type: 'code' }] });
              } else if (el2.tagName === 'A') {
                const text = el2.textContent ?? '';
                const href = el2.getAttribute('href') ?? '';
                if (text) nodes.push({ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] });
              } else if (el2.tagName === 'IMG') {
                const src = el2.getAttribute('src') ?? '';
                if (src) nodes.push({ type: 'image', attrs: { src, alt: el2.getAttribute('alt') ?? '' } });
              } else {
                const text = el2.textContent ?? '';
                if (text) nodes.push({ type: 'text', text });
              }
            }
          });
          return nodes;
        };

        const elToTiptap = (node: Element): TiptapNode[] => {
          const tag = node.tagName;

          if (tag === 'H1' || tag === 'H2' || tag === 'H3') {
            const level = parseInt(tag[1]);
            return [{ type: 'heading', attrs: { level }, content: textNodeToTiptap(node) }];
          }

          if (tag === 'P') {
            const content = textNodeToTiptap(node);
            // <p> 안에 이미지만 있는 경우: image 노드로 분리, 텍스트와 혼재 시 paragraph 그대로
            if (content.length === 1 && content[0].type === 'image') {
              return [content[0]];
            }
            return [{ type: 'paragraph', content: content.length ? content : undefined }];
          }

          if (tag === 'UL') {
            const result: TiptapNode[] = [];
            const lis = Array.from(node.children).filter((c) => c.tagName === 'LI');
            for (const li of lis) {
              if (isToggleLi(li)) {
                result.push(...liToToggle(li));
              } else {
                const innerContent = liToInlineContent(li);
                result.push({ type: 'bulletList', content: [{ type: 'listItem', content: innerContent }] });
              }
            }
            return result;
          }

          if (tag === 'OL') {
            const items = Array.from(node.children).filter((c) => c.tagName === 'LI').map((li) => ({
              type: 'listItem' as const,
              content: liToInlineContent(li),
            }));
            return [{ type: 'orderedList', content: items }];
          }

          if (tag === 'BLOCKQUOTE') {
            return [{ type: 'blockquote', content: Array.from(node.children).flatMap((c) => elToTiptap(c)) }];
          }

          if (tag === 'IMG') {
            const src = node.getAttribute('src') ?? '';
            return src ? [{ type: 'image', attrs: { src, alt: node.getAttribute('alt') ?? '' } }] : [];
          }

          if (tag === 'FIGURE') {
            // <figure> 안의 <img> 추출
            const imgEl = node.querySelector('img');
            const src = imgEl?.getAttribute('src') ?? '';
            return src ? [{ type: 'image', attrs: { src, alt: imgEl?.getAttribute('alt') ?? '' } }] : [];
          }

          if (tag === 'DETAILS') {
            const summaryEl = node.querySelector(':scope > summary');
            const summaryContent = summaryEl ? textNodeToTiptap(summaryEl) : [{ type: 'text', text: '' }];
            const contentNodes = Array.from(node.children)
              .filter((c) => c.tagName !== 'SUMMARY')
              .flatMap((c) => elToTiptap(c));
            return [{
              type: 'details',
              content: [
                { type: 'detailsSummary', content: summaryContent.length ? summaryContent : [{ type: 'text', text: '' }] },
                { type: 'detailsContent', content: contentNodes.length ? contentNodes : [{ type: 'paragraph' }] },
              ],
            }];
          }

          if (tag === 'DIV') {
            const dataType = node.getAttribute('data-type');
            // div[data-type="detailsContent"]: detailsContent 내부 자식들을 재귀 처리
            if (dataType === 'detailsContent') {
              const childNodes = Array.from(node.children).flatMap((c) => elToTiptap(c));
              return childNodes.length ? childNodes : [{ type: 'paragraph' }];
            }
            // 기타 div는 자식들을 재귀 처리
            const childNodes = Array.from(node.children).flatMap((c) => elToTiptap(c));
            return childNodes.length ? childNodes : [];
          }

          // 기타 → paragraph로 fallback
          const text = node.textContent ?? '';
          return text ? [{ type: 'paragraph', content: [{ type: 'text', text }] }] : [];
        };

        const liToInlineContent = (li: Element): TiptapNode[] => {
          // li 직계 자식들을 block 변환
          const blocks: TiptapNode[] = [];
          li.childNodes.forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE) {
              const text = child.textContent?.trim() ?? '';
              if (text) blocks.push({ type: 'paragraph', content: [{ type: 'text', text }] });
            } else if (child.nodeType === Node.ELEMENT_NODE) {
              blocks.push(...elToTiptap(child as Element));
            }
          });
          return blocks.length ? blocks : [{ type: 'paragraph' }];
        };

        const liToToggle = (li: Element): TiptapNode[] => {
          const titleEl = li.querySelector(':scope > p');
          const summaryContent = titleEl ? textNodeToTiptap(titleEl) : [];
          const contentNodes = Array.from(li.children)
            .filter((c) => c !== titleEl)
            .flatMap((c) => elToTiptap(c));

          return [{
            type: 'details',
            content: [
              { type: 'detailsSummary', content: summaryContent.length ? summaryContent : [{ type: 'text', text: '' }] },
              { type: 'detailsContent', content: contentNodes.length ? contentNodes : [{ type: 'paragraph' }] },
            ],
          }];
        };

        // 1) 표준 <details><summary> 구조 (같은 에디터 내 복사 또는 기존 저장 데이터)
        // elToTiptap()의 DETAILS 분기를 활용해 JSON으로 변환 → 중첩 토글 평탄화 방지
        const detailsEls = doc.body.querySelectorAll('details');
        if (detailsEls.length > 0 && !isFromNotion) {
          event.preventDefault();
          const tiptapNodes = Array.from(doc.body.children).flatMap((c) => elToTiptap(c));
          currentEditor.chain().focus().insertContent(tiptapNodes).run();
          return true;
        }

        // body의 직계 자식들을 변환
        const hasAnyToggle = doc.body.querySelectorAll('ul > li').length > 0;

        // 이미지 없으면 즉시 변환 삽입
        if (notionImgUrls.length === 0) {
          if (!hasAnyToggle) return false;
          event.preventDefault();
          const tiptapNodes = Array.from(doc.body.children).flatMap((c) => elToTiptap(c));
          currentEditor.chain().focus().insertContent(tiptapNodes).run();
          return true;
        }

        event.preventDefault();

        // 이미지 업로드: text/_notion-blocks-v3-production 파싱 → notion API 경로
        const notionBlocksRaw =
          clipboardData.getData('text/_notion-blocks-v3-production') ||
          clipboardData.getData('text/_notion-blocks-v3-staging') ||
          '';

        interface NotionImageBlock {
          blockId: string;
          spaceId: string;
          fileId: string;
          originalSrc: string;
        }

        const imageBlocks: NotionImageBlock[] = [];
        if (notionBlocksRaw) {
          try {
            const v3Data = JSON.parse(notionBlocksRaw) as {
              blocks: Array<{
                blockId: string;
                blockSubtree: {
                  block: Record<string, {
                    value: {
                      type: string;
                      properties?: { source?: string[][] };
                      file_ids?: string[];
                      space_id?: string;
                    };
                  }>;
                };
              }>;
            };
            for (const b of v3Data.blocks) {
              for (const [blockId, blockData] of Object.entries(b.blockSubtree.block)) {
                const val = blockData?.value;
                if (val?.type === 'image' && val?.file_ids?.length && val?.space_id) {
                  const originalSrc = val.properties?.source?.[0]?.[0] ?? '';
                  if (originalSrc) {
                    imageBlocks.push({ blockId, spaceId: val.space_id, fileId: val.file_ids[0], originalSrc });
                  }
                }
              }
            }
          } catch { /* JSON 파싱 실패 시 fallback */ }
        }

        const toastId = 'notion-img-upload';
        const imgCount = imageBlocks.length || notionImgUrls.length;
        toast.loading(`노션 이미지 ${imgCount}개 가져오는 중...`, { id: toastId });

        const uploadViaNotionApi = async (block: NotionImageBlock) => {
          const res = await fetch('/api/notion-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blockId: block.blockId, spaceId: block.spaceId, fileId: block.fileId, originalUrl: block.originalSrc }),
          });
          const data = await res.json() as { url?: string; error?: string };
          if (!res.ok) throw new Error(data.error ?? '업로드 실패');
          return { original: block.originalSrc, uploaded: data.url ?? null };
        };

        const uploadTasks = imageBlocks.length > 0
          ? imageBlocks.map((block) =>
              uploadViaNotionApi(block).catch((err: unknown) => ({
                original: block.originalSrc, uploaded: null,
                error: err instanceof Error ? err.message : '업로드 실패',
              }))
            )
          : notionImgUrls.map((srcUrl) =>
              fetch(srcUrl)
                .then(async (r) => {
                  if (!r.ok) throw new Error(`S3 fetch 실패 (${r.status})`);
                  const blob = await r.blob();
                  const formData = new FormData();
                  const ext = blob.type.split('/')[1]?.toLowerCase() || 'jpg';
                  formData.append('file', new File([blob], `notion_${Date.now()}.${ext}`, { type: blob.type }));
                  const res = await fetch('/api/upload-from-url', { method: 'POST', body: formData });
                  const data = await res.json() as { url?: string; error?: string };
                  if (!res.ok) throw new Error(data.error ?? '업로드 실패');
                  return { original: srcUrl, uploaded: data.url ?? null };
                })
                .catch((err: unknown) => ({ original: srcUrl, uploaded: null, error: err instanceof Error ? err.message : '업로드 실패' }))
            );

        Promise.all(uploadTasks).then((results) => {
          const urlMap = new Map<string, string>();
          let failedMsg = '';
          results.forEach((r) => {
            if (r.uploaded) urlMap.set(r.original, r.uploaded);
            else failedMsg = 'error' in r ? (r.error ?? '') : '';
          });

          if (urlMap.size === 0) {
            toast.error(failedMsg || '이미지를 가져오지 못했습니다.', { id: toastId });
            return;
          }

          // doc 내 모든 <img>의 src를 Firebase URL로 교체
          doc.querySelectorAll('img').forEach((imgEl) => {
            const src = imgEl.getAttribute('src') || '';
            if (urlMap.has(src)) imgEl.setAttribute('src', urlMap.get(src)!);
          });

          // Tiptap JSON으로 변환 후 삽입 (중첩 토글 파싱 오류 방지)
          const tiptapNodes = Array.from(doc.body.children).flatMap((c) => elToTiptap(c));
          currentEditor?.chain().focus().insertContent(tiptapNodes).run();

          const failCount = results.filter((r) => !r.uploaded).length;
          if (failCount > 0) {
            toast.success(`이미지 ${urlMap.size}개 삽입 완료 (${failCount}개 실패)`, { id: toastId });
          } else {
            toast.success(`이미지 ${urlMap.size}개 포함 내용이 삽입되었습니다.`, { id: toastId });
          }
        });

        return true;
      },
    },
  });

  if (!editor) {
    return null;
  }

  // paste 핸들러가 최신 editor 인스턴스를 참조할 수 있도록 ref 동기화
  editorRef.current = editor;

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
    
    // iframe, oembed 임베드 태그 차단 (일반 텍스트 URL은 허용)
    if (html.includes('<iframe') || html.includes('<oembed')) {
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
          onClick={() => editor.chain().focus().setDetails().run()}
          disabled={!editor.can().setDetails()}
          className={`px-3 py-1.5 rounded text-sm ${
            editor.isActive('details')
              ? 'bg-blue-600 text-white'
              : 'bg-white hover:bg-gray-100'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          title="토글 (접기/펼치기)"
        >
          ▶
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
          
          /* Details(토글) 블록 스타일 - Tiptap Details NodeView */
          /* NodeView DOM: div[data-type="details"] > button + div > summary + div[data-type="detailsContent"] */
          .ProseMirror div[data-type="details"] {
            display: flex;
            flex-direction: row;
            align-items: flex-start;
            gap: 0;
            border: none;
            border-radius: 0;
            padding: 0.125rem 0;
            margin: 0.25rem 0;
            background-color: transparent;
          }

          /* 토글 버튼 (▶) — summary 첫 줄 텍스트 중앙 정렬 */
          .ProseMirror div[data-type="details"] > button {
            background: none;
            border: none;
            cursor: pointer;
            padding: 0;
            margin-right: 0.3rem;
            font-size: 0.6rem;
            color: #6b7280;
            transition: transform 0.2s ease;
            flex-shrink: 0;
            /* summary의 line-height(1.5em = ~1.5rem) 기준 첫 줄 중앙 */
            height: 1.5em;
            display: flex;
            align-items: center;
          }

          .ProseMirror div[data-type="details"] > button::before {
            content: '▶';
          }

          .ProseMirror div[data-type="details"].is-open > button {
            transform: rotate(90deg);
          }

          /* contentDOM (summary + detailsContent를 감싸는 div) */
          .ProseMirror div[data-type="details"] > div {
            flex: 1;
            min-width: 0;
          }

          /* summary (토글 제목) */
          .ProseMirror div[data-type="details"] summary {
            font-weight: 600;
            cursor: default;
            list-style: none;
            line-height: 1.5;
            padding: 0;
          }

          .ProseMirror div[data-type="details"] summary::-webkit-details-marker {
            display: none;
          }

          /* detailsContent (접힌 내용) */
          .ProseMirror div[data-type="detailsContent"] {
            display: none;
            padding-top: 0.25rem;
            padding-left: 0.25rem;
          }

          .ProseMirror div[data-type="details"].is-open div[data-type="detailsContent"] {
            display: block;
          }

          /* 레거시 toggle-block 호환 (기존 저장 데이터) */
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
