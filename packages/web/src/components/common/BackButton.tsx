'use client';

/**
 * 뒤로가기 버튼 — 이 사이트 안에서 들어왔으면 이전 화면으로, 링크를 바로 열었으면(공유 링크·알림·새 탭) fallbackHref 로 간다.
 */
import { useRouter } from 'next/navigation';

export default function BackButton({ fallbackHref = '/', className = '', label }: { fallbackHref?: string; className?: string; label?: string }) {
  const router = useRouter();
  const goBack = () => {
    let sameSite = false;
    try {
      sameSite = !!document.referrer && new URL(document.referrer).origin === window.location.origin;
    } catch { /* 잘못된 referrer */ }
    if (window.history.length > 1 && sameSite) router.back();
    else router.push(fallbackHref);
  };
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="뒤로가기"
      className={`inline-flex items-center gap-1 p-2 -ml-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors ${className}`}
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      {label && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
}
