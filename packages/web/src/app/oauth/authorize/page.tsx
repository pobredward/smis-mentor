import { Suspense } from 'react';
import type { Metadata } from 'next';
import AuthorizeClient from './AuthorizeClient';

export const metadata: Metadata = {
  title: 'AI 연결 허용 | SMIS Mentor',
  description: 'AI 에이전트(Claude, ChatGPT 등)가 SMIS Mentor 데이터를 읽도록 허용합니다.',
  robots: { index: false, follow: false },
};

export default function OAuthAuthorizePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">불러오는 중…</div>}>
      <AuthorizeClient />
    </Suspense>
  );
}
