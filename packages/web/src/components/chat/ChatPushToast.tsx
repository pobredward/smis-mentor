'use client';

/**
 * 창이 앞에 있을 때 온 채팅 푸시 — 화면 위 작은 알림 (누르면 그 방으로)
 */
import toast from 'react-hot-toast';
import { FiMessageCircle } from 'react-icons/fi';

export function showChatPushToast(args: { id: string; title: string; body: string; onOpen: () => void }) {
  toast.custom(
    (t) => (
      <button
        type="button"
        onClick={() => {
          toast.dismiss(t.id);
          args.onOpen();
        }}
        className={`w-[min(92vw,360px)] flex items-start gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-lg ring-1 ring-black/5 transition-all duration-200 ${t.visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
      >
        <span className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-blue-500 text-white flex items-center justify-center">
          <FiMessageCircle size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900 truncate">{args.title}</span>
          <span className="block text-sm text-gray-600 line-clamp-2 break-words">{args.body}</span>
        </span>
      </button>
    ),
    { id: `chat-push-${args.id}`, duration: 5000 },
  );
}
