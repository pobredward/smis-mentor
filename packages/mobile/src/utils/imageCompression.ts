import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { logger } from '@smis-mentor/shared';

/**
 * React Native용 이미지 압축 유틸리티
 */
export async function compressImage(
  uri: string,
  quality: number = 0.8,
  maxWidth: number = 1200,
  maxHeight: number = 1200
): Promise<{ uri: string; width: number; height: number }> {
  try {
    const result = await manipulateAsync(
      uri,
      [
        {
          resize: {
            width: maxWidth,
            height: maxHeight,
          },
        },
      ],
      {
        compress: quality,
        format: SaveFormat.JPEG,
      }
    );
    
    return result;
  } catch (error) {
    logger.error('이미지 압축 오류:', error);
    throw error;
  }
}


const EXT_CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * Storage 업로드에 넣을 contentType.
 * iOS(Expo SDK 57)에서 fetch(file://).blob() 의 type 이 비어 오는 경우가 있어, 그대로 올리면
 * application/octet-stream 으로 저장돼 Storage 규칙(이미지·PDF만 허용)에 거부된다.
 * blob.type → 파일 이름(확장자) → fallback 순으로 정한다. 업로드할 때는 항상 이 값을 명시한다.
 */
export function contentTypeFor(blob: Blob, nameOrUri: string, fallback = 'application/octet-stream'): string {
  const t = (blob.type || '').toLowerCase();
  if (t && t !== 'application/octet-stream') return t;
  const ext = nameOrUri.split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? '';
  return EXT_CONTENT_TYPES[ext] ?? fallback;
}

/**
 * URI에서 Blob 생성 (Firebase 업로드용)
 */
export async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return blob;
}
