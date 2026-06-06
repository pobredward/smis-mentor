import { NextRequest, NextResponse } from 'next/server';
import { getAdminStorage } from '@/lib/firebase-admin';

const ALLOWED_HOSTS = [
  'prod-files-secure.s3.us-west-2.amazonaws.com',
  's3.us-west-2.amazonaws.com',
  'notion.so',
  'notionusercontent.com',
];

function isAllowedUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_HOSTS.some((host) => hostname.endsWith(host) || hostname === host);
  } catch {
    return false;
  }
}

/**
 * POST /api/upload-from-url
 *
 * 두 가지 모드:
 * 1. multipart/form-data: 클라이언트가 blob을 직접 전송 (노션 이미지 복붙 주 경로)
 *    - field "file": 이미지 파일
 * 2. application/json: 서버가 URL을 fetch (fallback, URL이 아직 유효한 경우)
 *    - body: { url: string }
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    // --- 모드 1: 클라이언트가 blob 직접 전송 ---
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
      }

      const mimeType = file.type || 'image/jpeg';
      if (!mimeType.startsWith('image/')) {
        return NextResponse.json({ error: '이미지 파일만 업로드할 수 있습니다.' }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = mimeType.split('/')[1]?.split(';')[0]?.toLowerCase() || 'jpg';
      const fileName = `camp-page-images/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const bucket = getAdminStorage();
      const storageFile = bucket.file(fileName);
      await storageFile.save(buffer, { metadata: { contentType: mimeType }, public: true });

      const downloadURL = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      return NextResponse.json({ url: downloadURL });
    }

    // --- 모드 2: 서버 사이드 URL fetch (fallback) ---
    const body = await req.json() as { url?: string };
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: '유효하지 않은 URL입니다.' }, { status: 400 });
    }

    if (!isAllowedUrl(url)) {
      return NextResponse.json({ error: '허용되지 않은 URL 호스트입니다.' }, { status: 403 });
    }

    let imageResponse: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      imageResponse = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SMIS-Mentor-Bot/1.0)' },
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';
      console.error('[upload-from-url] S3 fetch 실패:', fetchError);
      return NextResponse.json(
        {
          error: isTimeout
            ? '이미지 URL이 만료되었거나 접근할 수 없습니다. 노션에서 다시 복사해 주세요.'
            : '이미지를 가져오지 못했습니다. URL이 만료되었을 수 있습니다.',
        },
        { status: 502 }
      );
    }

    if (!imageResponse.ok) {
      const isExpired = imageResponse.status === 403 || imageResponse.status === 401;
      console.error('[upload-from-url] S3 응답 오류:', imageResponse.status);
      return NextResponse.json(
        {
          error: isExpired
            ? `노션 이미지 URL이 만료되었습니다. 노션에서 다시 복사해 주세요. (${imageResponse.status})`
            : `이미지를 가져오지 못했습니다. (${imageResponse.status})`,
        },
        { status: 502 }
      );
    }

    const imageMime = imageResponse.headers.get('content-type') || 'image/jpeg';
    if (!imageMime.startsWith('image/')) {
      return NextResponse.json({ error: '이미지 파일이 아닙니다.' }, { status: 400 });
    }

    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    const ext = imageMime.split('/')[1]?.split(';')[0]?.toLowerCase() || 'jpg';
    const fileName = `camp-page-images/${Date.now()}.${ext}`;

    const bucket = getAdminStorage();
    const storageFile = bucket.file(fileName);
    await storageFile.save(buffer, { metadata: { contentType: imageMime }, public: true });

    const downloadURL = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    return NextResponse.json({ url: downloadURL });
  } catch (error) {
    console.error('[upload-from-url] 오류:', error);
    return NextResponse.json({ error: '이미지 업로드에 실패했습니다.' }, { status: 500 });
  }
}
