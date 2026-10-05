import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SMIS CAMP - 채용 공고',
  description: '캠프별 채용 공고 페이지',
  openGraph: {
    title: 'SMIS CAMP - 채용 공고',
    description: '캠프별 채용 공고 페이지',
    url: 'https://smiscamp.com/recruitment',
    siteName: 'SMIS CAMP',
    images: [
      {
        url: '/logo-wide-metadata.png',
        width: 1200,
        height: 630,
        alt: 'SMIS CAMP',
      },
    ],
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SMIS CAMP - 채용 공고',
    description: '캠프별 채용 공고 페이지',
    images: ['/logo-wide-metadata.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
