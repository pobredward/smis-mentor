import JobBoardListClient from './JobBoardListClient';

export const metadata = {
  title: 'SMIS 대학생 멘토 채용 공고',
  description: '현재 모집 중인 영어캠프 대학생 멘토 지원하러 가기',
  openGraph: {
    title: 'SMIS 대학생 멘토 채용 공고',
    description: '현재 모집 중인 영어캠프 대학생 멘토 지원하러 가기',
    url: 'https://www.smis-mentor.com/job-board',
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
    title: 'SMIS 대학생 멘토 채용 공고',
    description: '현재 모집 중인 영어캠프 대학생 멘토 지원하러 가기',
    images: ['/logo-wide.png'],
  },
};

export default function JobBoardList() {
  return <JobBoardListClient />;
} 