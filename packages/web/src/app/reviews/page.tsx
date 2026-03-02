import ReviewsPageClient from './ReviewsPageClient';

export const metadata = {
  title: 'SMIS 멘토 후기',
  description: 'SMIS 대학생 멘토들이 직접 작성한 후기 확인하러 가기',
  openGraph: {
    title: 'SMIS 멘토 후기',
    description: 'SMIS 대학생 멘토들이 직접 작성한 후기 확인하러 가기',
    url: 'https://www.smis-mentor.com/reviews',
    siteName: 'SMIS 멘토 채용 플랫폼',
    images: [
      {
        url: '/logo-wide.png',
        width: 1200,
        height: 630,
        alt: 'SMIS 멘토 채용 플랫폼',
      },
    ],
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '멘토 후기',
    description: 'SMIS 대학생 멘토들이 직접 작성한 후기 확인하러 가기',
    images: ['/logo-wide.png'],
  },
};

export default function ReviewsPage() {
  return <ReviewsPageClient />;
} 