'use client';

/**
 * 목록 위 '브라우저 알림 켜기' 안내 — 알림 권한을 아직 묻지 않은 브라우저에서만 (닫으면 2주 동안 숨김)
 * 이미 허용했으면 조용히 토큰만 확인(useChatInbox), 막혀 있으면 목록에는 아무것도 보이지 않는다(방 메뉴에 안내).
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { FiBell, FiX } from 'react-icons/fi';
import { L } from '@smis-mentor/shared';
import { enableWebPush, webPushPermission } from '@/lib/webPush';

const DISMISS_KEY = 'smis_chat_push_banner_dismissed';
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

export function ChatPushBannerView({ busy, onEnable, onDismiss }: { busy?: boolean; onEnable: () => void; onDismiss: () => void }) {
  return (
    <div className="mx-3 mt-3 flex items-start gap-3 rounded-xl bg-blue-50 px-3.5 py-3 ring-1 ring-blue-100">
      <span className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-blue-500 text-white flex items-center justify-center">
        <FiBell size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{L('chat.pushEnableTitle')}</p>
        <p className="mt-0.5 text-xs text-gray-600">{L('chat.pushEnableDesc')}</p>
        <button
          type="button"
          onClick={onEnable}
          disabled={busy}
          className="mt-2 rounded-full bg-blue-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {L('chat.pushEnable')}
        </button>
      </div>
      <button type="button" onClick={onDismiss} className="-mr-1 -mt-1 h-7 w-7 shrink-0 rounded-full text-gray-400 hover:bg-blue-100 hover:text-gray-600 flex items-center justify-center" aria-label={L('common.close')}>
        <FiX size={16} />
      </button>
    </div>
  );
}

function shouldShow(): boolean {
  if (typeof window === 'undefined' || webPushPermission() !== 'default') return false;
  let dismissedAt = 0;
  try {
    dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
  } catch {
    dismissedAt = 0;
  }
  return Date.now() - dismissedAt > DISMISS_MS;
}

export default function ChatPushBanner({ uid }: { uid: string }) {
  // 이 화면은 로그인 확인 뒤 브라우저에서만 그려진다 (서버 렌더 없음)
  const [show, setShow] = useState(shouldShow);
  const [busy, setBusy] = useState(false);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* 저장소를 못 쓰면 이번만 숨김 */
    }
  };

  const enable = async () => {
    setBusy(true);
    try {
      const r = await enableWebPush(uid);
      if (r === 'granted') {
        toast.success(L('chat.pushEnabled'));
        setShow(false);
      } else if (r === 'denied') {
        toast(L('chat.pushDenied'), { duration: 6000 });
        setShow(false);
      } else if (r === 'error') {
        toast.error(L('chat.webActionFailed'));
      } else if (r === 'unsupported') {
        toast(L('chat.pushUnsupported'));
        setShow(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return <ChatPushBannerView busy={busy} onEnable={enable} onDismiss={dismiss} />;
}
