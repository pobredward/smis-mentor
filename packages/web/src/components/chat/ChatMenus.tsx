'use client';

/**
 * 채팅 팝업들 — 메시지 메뉴(우클릭 자리 · 터치는 아래 시트) · 신고 창 · 공용 창 틀
 * 대화방이 좁은 화면에서 탭바 위를 덮으므로(z-60) 그보다 위(z-100)에 띄운다.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { FiX } from 'react-icons/fi';
import { L, type ChatReportReason } from '@smis-mentor/shared';

export interface ChatMenuAction {
  key: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

export interface ChatMenuAnchor {
  x: number;
  y: number;
  /** 터치(길게 누르기) — 아래에서 올라오는 시트로 */
  sheet: boolean;
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

export function ChatActionMenu({ anchor, actions, title, onClose }: { anchor: ChatMenuAnchor; actions: ChatMenuAction[]; title?: string; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEscape(onClose);

  // 화면 밖으로 나가지 않게 자리 잡기
  useLayoutEffect(() => {
    if (anchor.sheet || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.x, window.innerWidth - r.width - 8));
    const top = anchor.y + r.height + 8 > window.innerHeight ? Math.max(8, anchor.y - r.height) : anchor.y;
    setPos({ left, top });
  }, [anchor]);

  const run = (a: ChatMenuAction) => {
    onClose();
    a.onSelect();
  };

  if (anchor.sheet) {
    return (
      <div className="fixed top-0 left-0 right-0 bottom-0 z-[100] bg-black/40 flex items-end" onClick={onClose}>
        <div className="w-full bg-white rounded-t-2xl pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-xl" onClick={(e) => e.stopPropagation()} role="menu">
          {title && <div className="px-5 pt-1 pb-2 text-xs text-gray-500 truncate">{title}</div>}
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              onClick={() => run(a)}
              className={`w-full flex items-center gap-3 px-5 py-3.5 text-[15px] text-left active:bg-gray-100 ${a.danger ? 'text-red-600' : 'text-gray-800'}`}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
          <button type="button" onClick={onClose} className="w-full px-5 py-3.5 text-[15px] text-gray-500 border-t border-gray-100 mt-1">
            {L('common.cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 z-[100]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div
        ref={boxRef}
        role="menu"
        onClick={(e) => e.stopPropagation()}
        style={{ left: pos?.left ?? anchor.x, top: pos?.top ?? anchor.y, visibility: pos ? 'visible' : 'hidden' }}
        className="absolute min-w-[180px] max-w-[260px] bg-white rounded-xl shadow-xl border border-gray-100 py-1.5"
      >
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            role="menuitem"
            onClick={() => run(a)}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left hover:bg-gray-50 ${a.danger ? 'text-red-600' : 'text-gray-800'}`}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 가운데 창 (좁은 화면에서는 아래 시트) */
export function ChatDialog({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEscape(onClose);
  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 z-[100] bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? 'sm:max-w-md' : 'sm:max-w-sm'} bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[88dvh] sm:max-h-[80vh]`}
      >
        <div className="flex items-center justify-between px-4 h-12 border-b border-gray-100 shrink-0">
          <h3 className="text-base font-semibold text-gray-900 truncate">{title}</h3>
          <button type="button" onClick={onClose} className="h-8 w-8 -mr-1 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 flex items-center justify-center" aria-label={L('common.close')}>
            <FiX size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-gray-100 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

const REASONS: Array<{ value: ChatReportReason; key: 'chat.reasonSpam' | 'chat.reasonAbuse' | 'chat.reasonSexual' | 'chat.reasonPrivacy' | 'chat.reasonOther' }> = [
  { value: 'spam', key: 'chat.reasonSpam' },
  { value: 'abuse', key: 'chat.reasonAbuse' },
  { value: 'sexual', key: 'chat.reasonSexual' },
  { value: 'privacy', key: 'chat.reasonPrivacy' },
  { value: 'other', key: 'chat.reasonOther' },
];

/** 메시지 신고 — 이유 고르기 + 자세한 내용 */
export function ChatReportDialog({ preview, onSubmit, onClose }: { preview?: string; onSubmit: (reason: ChatReportReason, detail: string) => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState<ChatReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true);
    try {
      await onSubmit(reason, detail.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <ChatDialog
      title={L('chat.reportTitle')}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
            {L('common.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!reason || busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-40"
          >
            {L('chat.report')}
          </button>
        </div>
      }
    >
      <div className="px-4 py-3 space-y-3">
        {preview && <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 line-clamp-3 whitespace-pre-wrap break-words">{preview}</p>}
        <div className="space-y-1" role="radiogroup">
          {REASONS.map((r) => (
            <label key={r.value} className="flex items-center gap-3 py-2 cursor-pointer">
              <input
                type="radio"
                name="chat-report-reason"
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="h-4 w-4 text-red-500 focus:ring-red-400"
              />
              <span className="text-[15px] text-gray-800">{L(r.key)}</span>
            </label>
          ))}
        </div>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value.slice(0, 500))}
          rows={3}
          placeholder={L('chat.reportDetail')}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
        />
      </div>
    </ChatDialog>
  );
}
