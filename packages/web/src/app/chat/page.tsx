import type { Metadata } from 'next';
import { Suspense } from 'react';
import ChatPage from '@/components/chat/ChatPage';

export const metadata: Metadata = {
  title: '채팅 | SMIS Mentor',
  description: '캠프 선생님 채팅',
  // 로그인한 캠프 선생님만 쓰는 화면 — 검색엔진에 올리지 않는다
  robots: { index: false, follow: false },
};

/** /chat — 채팅 (열린 방은 ?room=<roomId>) */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ChatPage />
    </Suspense>
  );
}
