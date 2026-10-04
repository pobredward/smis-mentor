'use client';

/**
 * 입력창에서 여는 창들 — 예약 메시지 만들기 · 예약 목록 · 대화 내보내기
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { FiClock, FiTrash2 } from 'react-icons/fi';
import {
  CHAT_LIMITS,
  L,
  scheduleTimeError,
  type ChatScheduledMessage,
  type Locale,
} from '@smis-mentor/shared';
import { ChatDialog } from './ChatMenus';
import { toLocalInput } from './ChatPoll';
import { shortDateTime } from './chatUi';

/** 기본 예약 시각 — 지금 + 1시간, 10분 단위 */
function defaultScheduleTime(): Date {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 10) * 10);
  return d;
}

/** 예약 메시지 — 보낼 시각 + 글 (입력창에 쓴 글이 있으면 그것) */
export function ChatScheduleDialog({ initialText, lang, onSchedule, onClose }: {
  initialText: string;
  lang: Locale;
  onSchedule: (text: string, at: Date) => Promise<void>;
  onClose: () => void;
}) {
  const [when, setWhen] = useState(() => toLocalInput(defaultScheduleTime()));
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  /** 창을 연 시각 — 고를 수 있는 범위 */
  const [now] = useState(() => Date.now());
  const at = when ? new Date(when) : null;

  const submit = async () => {
    const err = scheduleTimeError(at);
    if (err) {
      toast.error(err === 'tooFar' ? L('chat.scheduleTooFar') : L('chat.schedulePast'));
      return;
    }
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onSchedule(text, at!);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ChatDialog
      title={L('chat.schedule')}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">{L('common.cancel')}</button>
          <button type="button" onClick={submit} disabled={busy || !text.trim() || text.length > CHAT_LIMITS.textMax} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-40">
            {L('chat.schedule')}
          </button>
        </div>
      }
    >
      <div className="px-4 py-3 space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-gray-500">{L('chat.scheduleAt')}</span>
          <input
            type="datetime-local"
            value={when}
            step={600}
            min={toLocalInput(new Date(now + CHAT_LIMITS.scheduleMinMs))}
            max={toLocalInput(new Date(now + CHAT_LIMITS.scheduleMaxDays * 86400000))}
            onChange={(e) => setWhen(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[15px] focus:outline-none focus:border-blue-400"
          />
          {at && !scheduleTimeError(at) && <span className="mt-1 block text-xs text-blue-600">{L('chat.scheduleSet', { at: shortDateTime(at, lang) })}</span>}
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={L('chat.inputPlaceholder')}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[15px] focus:outline-none focus:border-blue-400 resize-none"
        />
        {text.length > CHAT_LIMITS.textMax && <p className="text-xs text-red-500">{L('chat.textTooLong', { max: CHAT_LIMITS.textMax })}</p>}
      </div>
    </ChatDialog>
  );
}

/** 이 방의 내 예약 메시지 — 하나씩 [예약 취소] */
export function ChatScheduledListDialog({ list, lang, onCancel, onClose }: {
  list: ChatScheduledMessage[];
  lang: Locale;
  onCancel: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <ChatDialog title={L('chat.scheduledN', { n: list.length })} onClose={onClose} wide>
      <ul className="divide-y divide-gray-100">
        {list.map((s) => (
          <li key={s.id} className="flex items-start gap-3 px-4 py-3">
            <FiClock className="mt-0.5 shrink-0 text-blue-500" size={16} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-blue-600">{s.sendAt?.toDate ? shortDateTime(s.sendAt.toDate(), lang) : ''}</div>
              <p className="mt-0.5 text-sm text-gray-800 whitespace-pre-wrap break-words line-clamp-4">{s.text}</p>
            </div>
            <button
              type="button"
              onClick={() => { if (window.confirm(L('chat.scheduleCancelConfirm'))) void onCancel(s.id); }}
              className="shrink-0 inline-flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              <FiTrash2 size={12} />
              {L('chat.scheduleCancel')}
            </button>
          </li>
        ))}
      </ul>
    </ChatDialog>
  );
}

/** 대화 내보내기 — 사진·동영상 주소 포함(기본 끔) → .txt */
export function ChatExportDialog({ onExport, onClose }: { onExport: (includeLinks: boolean, onProgress: (n: number) => void) => Promise<void>; onClose: () => void }) {
  const [links, setLinks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onExport(links, setCount);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <ChatDialog
      title={L('chat.export')}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          {busy && <span className="mr-auto text-xs text-gray-500">{L('chat.exportLoading', { n: count })}</span>}
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">{L('common.cancel')}</button>
          <button type="button" onClick={run} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-40">
            {L('chat.export')}
          </button>
        </div>
      }
    >
      <div className="px-4 py-4">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" checked={links} onChange={(e) => setLinks(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600" />
          <span className="text-sm text-gray-800">
            {L('chat.exportIncludeLinks')}
            <span className="mt-0.5 block text-xs text-gray-500">{L('chat.exportLinksHint')}</span>
          </span>
        </label>
      </div>
    </ChatDialog>
  );
}
