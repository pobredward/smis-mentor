'use client';

import { useState } from 'react';

interface PasteResult {
  itemTypes: string[];
  hasImageBlob: boolean;
  html: string;
  text: string;
  imagePreview: string;
  notionImgUrls: string[];
  isFromNotion: boolean;
  notionBlocksV3: string;
  notionPageSource: string;
  s3ExpiresIn: string;
}

export default function PasteDebugPage() {
  const [result, setResult] = useState<PasteResult | null>(null);

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">클립보드 HTML 분석 (개발용)</h1>
      <p className="text-gray-500 text-sm mb-6">
        노션에서 내용을 복사한 뒤 아래 박스에 붙여넣으세요.
      </p>

      <div
        className="border-2 border-dashed border-blue-400 rounded-lg p-8 mb-6 min-h-[100px] bg-blue-50 text-gray-400 flex items-center justify-center focus:outline-none"
        contentEditable
        suppressContentEditableWarning
        onPaste={(e) => {
          e.preventDefault();
          const cd = e.clipboardData;

          const itemTypes = Array.from(cd.items).map((i) => i.type);
          const html = cd.getData('text/html');
          const text = cd.getData('text/plain');
          const notionBlocksV3 = cd.getData('text/_notion-blocks-v3-production') || cd.getData('text/_notion-blocks-v3-staging') || '(없음)';
          const notionPageSource = cd.getData('text/_notion-page-source-production') || cd.getData('text/_notion-page-source-staging') || '(없음)';

          // image blob 확인
          const imageItem = Array.from(cd.items).find((i) => i.type.startsWith('image/'));
          let imagePreview = '';
          if (imageItem) {
            const blob = imageItem.getAsFile();
            if (blob) {
              imagePreview = URL.createObjectURL(blob);
            }
          }

          // 노션 이미지 URL 감지 + 만료 시간 파싱
          const isFromNotion = html.includes('notionvc:') || html.includes('notion-block');
          let notionImgUrls: string[] = [];
          let s3ExpiresIn = '';
          if (isFromNotion && html) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            notionImgUrls = Array.from(doc.querySelectorAll('img'))
              .map((el) => el.getAttribute('src') || '')
              .filter(
                (src) =>
                  src.includes('prod-files-secure.s3') ||
                  src.includes('notion.so') ||
                  src.includes('notionusercontent.com')
              );
            // X-Amz-Expires 파싱 (pre-signed URL 만료 시간 확인)
            if (notionImgUrls[0]) {
              try {
                const urlObj = new URL(notionImgUrls[0]);
                const expires = urlObj.searchParams.get('X-Amz-Expires');
                const date = urlObj.searchParams.get('X-Amz-Date');
                if (expires && date) {
                  // X-Amz-Date: 20260101T120000Z 형식
                  const year = parseInt(date.slice(0, 4));
                  const month = parseInt(date.slice(4, 6)) - 1;
                  const day = parseInt(date.slice(6, 8));
                  const hour = parseInt(date.slice(9, 11));
                  const min = parseInt(date.slice(11, 13));
                  const sec = parseInt(date.slice(13, 15));
                  const signedAt = new Date(Date.UTC(year, month, day, hour, min, sec));
                  const expiresAt = new Date(signedAt.getTime() + parseInt(expires) * 1000);
                  const now = new Date();
                  const remainMs = expiresAt.getTime() - now.getTime();
                  s3ExpiresIn = remainMs > 0
                    ? `${Math.floor(remainMs / 1000)}초 후 만료 (${expiresAt.toLocaleTimeString()})`
                    : `이미 만료됨 (${Math.abs(Math.floor(remainMs / 1000))}초 전)`;
                }
              } catch { /* ignore */ }
            }
          }

          setResult({ itemTypes, hasImageBlob: !!imageItem, html: html || '(없음)', text: text || '(없음)', imagePreview, notionImgUrls: notionImgUrls ?? [], isFromNotion: !!isFromNotion, notionBlocksV3, notionPageSource, s3ExpiresIn });
        }}
      >
        여기에 붙여넣기 (Ctrl+V / Cmd+V)
      </div>

      {result && (
        <div className="space-y-5">
          {/* items 타입 목록 */}
          <div>
            <h2 className="font-semibold text-gray-700 mb-1">clipboardData.items 타입:</h2>
            <div className="flex flex-wrap gap-2">
              {result.itemTypes.map((t, i) => (
                <span key={i} className={`px-2 py-0.5 rounded text-xs font-mono ${t.startsWith('image') ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                  {t}
                </span>
              ))}
            </div>
            <div className="text-sm mt-1 space-y-1">
              <p>image blob 존재: <strong className={result.hasImageBlob ? 'text-green-600' : 'text-red-500'}>{result.hasImageBlob ? 'YES' : 'NO'}</strong></p>
              <p>노션 출처: <strong className={result.isFromNotion ? 'text-blue-600' : 'text-gray-500'}>{result.isFromNotion ? 'YES' : 'NO'}</strong></p>
              {result.notionImgUrls.length > 0 && (
                <div className="space-y-1">
                  <p className="text-blue-700 font-semibold">노션 이미지 URL {result.notionImgUrls.length}개 감지됨</p>
                  {result.s3ExpiresIn && (
                    <p className={`text-sm font-semibold ${result.s3ExpiresIn.includes('만료됨') ? 'text-red-600' : 'text-green-600'}`}>
                      ⏱ S3 URL 상태: {result.s3ExpiresIn}
                    </p>
                  )}
                  {result.notionImgUrls.map((u, i) => (
                    <p key={i} className="text-xs font-mono text-gray-600 break-all">{u.slice(0, 120)}…</p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* image blob 미리보기 */}
          {result.imagePreview && (
            <div>
              <h2 className="font-semibold text-gray-700 mb-1">image blob 미리보기:</h2>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.imagePreview} alt="paste preview" className="max-h-48 rounded border" />
            </div>
          )}

          {/* 텍스트 */}
          <div>
            <h2 className="font-semibold text-gray-700 mb-1">text/plain:</h2>
            <div className="bg-gray-100 rounded p-3 text-sm whitespace-pre-wrap">{result.text}</div>
          </div>

          {/* HTML */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-gray-700">text/html:</h2>
              <button
                onClick={() => navigator.clipboard.writeText(result.html)}
                className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                HTML 복사
              </button>
            </div>
            <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-x-auto overflow-y-auto max-h-[400px] whitespace-pre-wrap break-all">
              {result.html}
            </pre>
          </div>

          {/* 노션 내부 포맷 */}
          {result.notionBlocksV3 !== '(없음)' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-gray-700">
                  text/_notion-blocks-v3-production:
                  <span className="ml-2 text-xs text-orange-600 font-normal">노션 내부 포맷 (이미지 URL 포함 가능)</span>
                </h2>
                <button
                  onClick={() => navigator.clipboard.writeText(result.notionBlocksV3)}
                  className="text-xs px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700"
                >
                  복사
                </button>
              </div>
              <pre className="bg-gray-900 text-yellow-300 rounded-lg p-4 text-xs overflow-x-auto overflow-y-auto max-h-[400px] whitespace-pre-wrap break-all">
                {result.notionBlocksV3.length > 3000
                  ? result.notionBlocksV3.slice(0, 3000) + '\n...(이하 생략)'
                  : result.notionBlocksV3}
              </pre>
            </div>
          )}

          {result.notionPageSource !== '(없음)' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-gray-700">text/_notion-page-source-production:</h2>
                <button
                  onClick={() => navigator.clipboard.writeText(result.notionPageSource)}
                  className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                  복사
                </button>
              </div>
              <pre className="bg-gray-900 text-purple-300 rounded-lg p-4 text-xs overflow-x-auto overflow-y-auto max-h-[200px] whitespace-pre-wrap break-all">
                {result.notionPageSource.length > 1000
                  ? result.notionPageSource.slice(0, 1000) + '\n...(이하 생략)'
                  : result.notionPageSource}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
