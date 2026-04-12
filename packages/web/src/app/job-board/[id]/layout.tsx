import { Metadata } from 'next';
import { getJobBoardById, getJobCodeById } from '@/lib/firebaseService';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  
  try {
    const jobBoard = await getJobBoardById(id);
    
    if (!jobBoard) {
      return {
        title: 'SMIS 멘토 플랫폼 - 채용 공고',
        description: '채용 공고를 찾을 수 없습니다.',
      };
    }

    // jobCode 정보 로드
    let campName = '';
    if (jobBoard.refJobCodeId) {
      const jobCode = await getJobCodeById(jobBoard.refJobCodeId);
      campName = jobCode?.jobCodeName || '';
    }

    return {
      title: `SMIS 멘토 플랫폼 - 채용 공고`,
      description: campName || jobBoard.title,
      openGraph: {
        title: 'SMIS 멘토 플랫폼 - 채용 공고',
        description: campName || jobBoard.title,
        url: `https://www.smis-mentor.com/job-board/${id}`,
        siteName: 'SMIS 멘토 플랫폼',
        images: [
          {
            url: '/logo-wide-metadata.png',
            width: 1200,
            height: 630,
            alt: 'SMIS 멘토 플랫폼',
          },
        ],
        locale: 'ko_KR',
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: 'SMIS 멘토 플랫폼 - 채용 공고',
        description: campName || jobBoard.title,
        images: ['/logo-wide-metadata.png'],
      },
    };
  } catch (error) {
    console.error('메타데이터 생성 실패:', error);
    return {
      title: 'SMIS 멘토 플랫폼 - 채용 공고',
      description: '채용 공고 페이지',
    };
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
