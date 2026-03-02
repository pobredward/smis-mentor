import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

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
    console.error('이미지 압축 오류:', error);
    throw error;
  }
}

/**
 * 파일 크기를 MB로 변환
 */
export function bytesToMB(bytes: number): number {
  return bytes / (1024 * 1024);
}

/**
 * URI에서 Blob 생성 (Firebase 업로드용)
 */
export async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return blob;
}
