export const metadata = {
  title: 'SMIS CAMP - 로그인',
  description: 'SMIS CAMP에 로그인하고 지원하기',
  openGraph: {
    title: 'SMIS CAMP - 로그인',
    description: 'SMIS CAMP에 로그인하고 지원하기',
    url: 'https://smiscamp.com/sign-in',
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
    title: 'SMIS CAMP - 로그인',
    description: 'SMIS CAMP에 로그인하고 지원하기',
    images: ['/logo-wide-metadata.png'],
  },
};

import { SignInClient } from './SignInClient';

export default function SignInPage() {
  return <SignInClient />;
} 