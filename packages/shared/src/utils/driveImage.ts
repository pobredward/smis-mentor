/**
 * Google Drive 공유 링크를 이미지 태그에서 직접 로드 가능한 URL로 변환.
 *
 * 지원하는 입력 형식:
 *  - https://drive.google.com/file/d/{ID}/view?usp=drivesdk
 *  - https://drive.google.com/file/d/{ID}/view
 *  - https://drive.google.com/file/d/{ID}
 *  - https://drive.google.com/open?id={ID}
 *  - https://drive.google.com/uc?id={ID}
 *  - https://drive.google.com/thumbnail?id={ID}  (이미 변환된 URL — 그대로 반환)
 *  - https://lh3.googleusercontent.com/d/{ID}    (이미 변환된 URL — 그대로 반환)
 *
 * lh3.googleusercontent.com/d/{ID} 방식은 Google 로그인 없이도 공개 파일을
 * 이미지로 임베드할 수 있어 CORS 문제가 가장 적습니다.
 */
export function toDriveImageUrl(url?: string | null): string | undefined {
  if (!url) return undefined;

  // 이미 변환된 URL이면 그대로 반환
  if (
    url.includes('lh3.googleusercontent.com') ||
    url.includes('drive.google.com/thumbnail?')
  ) {
    return url;
  }

  // /file/d/{ID} 형식
  const fileMatch = url.match(/\/file\/d\/([^/?#]+)/);
  if (fileMatch?.[1]) {
    return `https://lh3.googleusercontent.com/d/${fileMatch[1]}`;
  }

  // open?id={ID} 또는 uc?id={ID} 형식
  const idMatch = url.match(/[?&]id=([^&]+)/);
  if (idMatch?.[1]) {
    return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
  }

  // Drive URL이 아닌 경우 원본 반환
  return url;
}
