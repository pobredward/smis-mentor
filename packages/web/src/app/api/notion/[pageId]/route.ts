import { NextRequest, NextResponse } from 'next/server';
import { NotionAPI } from 'notion-client';
import { logger } from '@smis-mentor/shared';

export const dynamic = 'force-dynamic';

const notion = new NotionAPI();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const { pageId } = await params;

  if (!pageId) {
    return NextResponse.json({ error: 'Page ID is required' }, { status: 400 });
  }

  try {
    // Notion 페이지 데이터 가져오기
    const recordMap = await notion.getPage(pageId);

    return NextResponse.json(recordMap, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    logger.error('Failed to fetch Notion page:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Notion page' },
      { status: 500 }
    );
  }
}
