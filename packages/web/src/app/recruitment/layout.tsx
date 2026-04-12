import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SMIS 멘토 플랫폼 - 채용 공고',
  description: '캠프별 채용 공고 페이지',
  openGraph: {
    title: 'SMIS 멘토 플랫폼 - 채용 공고',
    description: '캠프별 채용 공고 페이지',
    url: 'https://www.smis-mentor.com/recruitment',
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
    description: '캠프별 채용 공고 페이지',
    images: ['/logo-wide-metadata.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
