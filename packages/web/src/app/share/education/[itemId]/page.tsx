import { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { CampPageService } from '@smis-mentor/shared';
import { db } from '@/lib/firebase';

const CampPageViewer = dynamic(() => import('@/components/camp/CampPageViewer'), {
  ssr: false,
});

interface PageProps {
  params: Promise<{
    itemId: string;
  }>;
}

// 메타데이터 생성 (SEO 및 OG 태그)
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { itemId } = await params;
  
  try {
    const campPageService = new CampPageService(db);
    const page = await campPageService.getPage(itemId);

    if (!page) {
      return {
        title: 'SMIS 교육 자료 페이지',
        description: '페이지를 찾을 수 없습니다.',
      };
    }

    return {
      title: `SMIS 교육 자료 페이지`,
      description: page.title,
      openGraph: {
        title: 'SMIS 교육 자료 페이지',
        description: page.title,
        images: [
          {
            url: '/logo-wide.png',
            width: 1200,
            height: 630,
            alt: 'SMIS Mentor Logo',
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'SMIS 교육 자료 페이지',
        description: page.title,
        images: ['/logo-wide.png'],
      },
    };
  } catch (error) {
    console.error('메타데이터 생성 실패:', error);
    return {
      title: 'SMIS 교육 자료 페이지',
      description: '교육 자료를 확인하세요',
    };
  }
}

export default async function ShareEducationPage({ params }: PageProps) {
  const { itemId } = await params;
  
  try {
    const campPageService = new CampPageService(db);
    const page = await campPageService.getPage(itemId);

    // 페이지가 없거나 교육 카테고리가 아닌 경우
    if (!page || page.category !== 'education') {
      notFound();
    }

    return (
      <div className="min-h-screen bg-gray-50">
        {/* 헤더 */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <div className="flex items-center gap-4">
              <span className="text-2xl">
                {page.emoji || '📄'}
              </span>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{page.title}</h1>
                <p className="text-sm text-gray-500 mt-1">SMIS Mentor 교육 자료</p>
              </div>
            </div>
          </div>
        </div>

        {/* 본문 */}
        <div className="max-w-5xl mx-auto md:px-4 md:py-6">
          <div className="bg-white md:rounded-lg md:shadow-sm">
            <CampPageViewer content={page.content || '<p>내용이 없습니다.</p>'} />
          </div>
        </div>

        {/* 푸터 */}
        <div className="max-w-5xl mx-auto px-4 py-8 text-center text-sm text-gray-500">
          <p>이 자료는 SMIS Mentor에서 제공됩니다.</p>
        </div>
      </div>
    );
  } catch (error) {
    console.error('페이지 로드 실패:', error);
    notFound();
  }
}
