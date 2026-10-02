'use client';

import type { ReactNode } from 'react';
import { L } from '@smis-mentor/shared';

interface LastLoginMarkProps {
  /** 이 버튼이 이 브라우저에서 마지막으로 성공한 로그인 방법인가 */
  active: boolean;
  /** 버튼 아래 작은 안내 (가린 이메일 ab***@gmail.com) */
  caption?: string;
  className?: string;
  children: ReactNode;
}

/** 로그인 버튼 오른쪽 위에 '최근 로그인' 꼬리표를 붙이는 감싸개 (클릭은 버튼으로 그대로 전달) */
export default function LastLoginMark({ active, caption, className = '', children }: LastLoginMarkProps) {
  return (
    <div className={`relative ${className}`}>
      {children}
      {active && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-2 right-3 z-10 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-bold leading-none text-blue-600 shadow-sm"
          >
            {L('profile.lastUsedLogin')}
          </span>
          <span className="sr-only">{L('profile.lastUsedLoginA11y')}</span>
          {caption && <p className="mt-1 text-center text-xs text-gray-500">{caption}</p>}
        </>
      )}
    </div>
  );
}
