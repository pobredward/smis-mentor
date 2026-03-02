export const metadata = {
  title: 'SMIS 멘토 채용 플랫폼 로그인',
  description: 'SMIS 멘토 채용 플랫폼에 로그인하고 지원하기',
  openGraph: {
    title: 'SMIS 멘토 채용 플랫폼 로그인',
    description: 'SMIS 멘토 채용 플랫폼에 로그인하고 지원하기',
    url: 'https://www.smis-mentor.com/sign-in',
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
    title: 'SMIS 멘토 채용 플랫폼 로그인',
    description: 'SMIS 멘토 채용 플랫폼에 로그인하고 지원하기',
    images: ['/logo-wide.png'],
  },
};

import { SignInClient } from './SignInClient';

export default function SignInPage() {
  return <SignInClient />;
} 