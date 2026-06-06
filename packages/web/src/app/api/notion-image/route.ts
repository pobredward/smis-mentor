import { NextRequest, NextResponse } from 'next/server';
import { NotionAPI } from 'notion-client';
import { getAdminStorage } from '@/lib/firebase-admin';

const notion = new NotionAPI();

interface NotionImageRequest {
  blockId: string;
  spaceId: string;
  fileId: string;
  originalUrl: string; // properties.source[0][0] — getSignedFileUrls에 넘길 원본 S3 URL
}

/**
 * POST /api/notion-image
 *
 * 노션 이미지 블록의 현재 유효한 signed URL을 가져와 Firebase Storage에 업로드합니다.
 * notion-client의 getSignedFileUrls를 사용하므로 별도 API 토큰 불필요.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as NotionImageRequest;
    const { blockId, spaceId, fileId, originalUrl } = body;

    if (!blockId || !spaceId || !fileId || !originalUrl) {
      return NextResponse.json(
        { error: 'blockId, spaceId, fileId, originalUrl이 필요합니다.' },
        { status: 400 }
      );
    }

    // 노션 비공식 API로 현재 유효한 signed URL 획득
    // originalUrl: properties.source[0][0] (실제 S3 파일 URL)
    console.log('[notion-image] getSignedFileUrls 호출:', { blockId, fileId });
    const signedUrlsResponse = await notion.getSignedFileUrls([
      {
        url: originalUrl,
        permissionRecord: { table: 'block', id: blockId },
      },
    ]);
    console.log('[notion-image] signedUrls 응답:', signedUrlsResponse?.signedUrls?.[0]?.slice(0, 80));

    const signedUrl = signedUrlsResponse?.signedUrls?.[0];
    if (!signedUrl) {
      return NextResponse.json(
        { error: '노션에서 이미지 URL을 가져오지 못했습니다.' },
        { status: 502 }
      );
    }

    // 서버에서 signed URL → blob 다운로드
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    let imageResponse: Response;
    try {
      imageResponse = await fetch(signedUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
    } catch {
      return NextResponse.json(
        { error: '이미지 다운로드에 실패했습니다.' },
        { status: 502 }
      );
    }

    if (!imageResponse.ok) {
      console.error('[notion-image] signed URL fetch 실패:', imageResponse.status);
      return NextResponse.json(
        { error: `이미지 다운로드 실패 (${imageResponse.status})` },
        { status: 502 }
      );
    }

    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    console.log('[notion-image] 이미지 다운로드 성공:', contentType);
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    console.log('[notion-image] 버퍼 크기:', buffer.length);
    const ext = contentType.split('/')[1]?.split(';')[0]?.toLowerCase() || 'jpg';
    const fileName = `camp-page-images/${Date.now()}_${fileId.slice(0, 8)}.${ext}`;

    console.log('[notion-image] Firebase Storage 업로드 시작:', fileName);
    const bucket = getAdminStorage();
    const file = bucket.file(fileName);
    await file.save(buffer, { metadata: { contentType }, public: true });

    const downloadURL = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    console.log('[notion-image] 업로드 완료:', downloadURL.slice(0, 60));
    return NextResponse.json({ url: downloadURL });
  } catch (error) {
    console.error('[notion-image] 오류 상세:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `이미지 업로드에 실패했습니다: ${msg}` }, { status: 500 });
  }
}
