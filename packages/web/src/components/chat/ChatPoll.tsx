'use client';

/**
 * 투표 — 말풍선(고르기 · 결과 막대) · 만들기 창
 * 결과는 내가 투표했거나, 마감됐거나, 내가 만든 투표일 때 보인다.
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { FiBarChart2, FiCheck, FiPlus, FiX } from 'react-icons/fi';
import {
  CHAT_LIMITS,
  L,
  isPollClosed,
  makeChatPoll,
  pollResults,
  type ChatMessageView,
  type ChatPoll,
  type Locale,
} from '@smis-mentor/shared';
import { ChatDialog } from './ChatMenus';
import { shortDateTime } from './chatUi';

export function ChatPollBubble({ m, myUid, lang, onVote, onClose, onVoters }: {
  m: ChatMessageView;
  myUid: string;
  lang: Locale;
  onVote: (ids: string[]) => Promise<void>;
  onClose: () => void;
  onVoters: (optionId: string) => void;
}) {
  const poll = m.poll;
  const r = pollResults(m, myUid);
  const closed = isPollClosed(m);
  const creator = m.senderId === myUid;
  const [revoting, setRevoting] = useState(false);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  if (!poll) return null;
  const voted = r.mine.length > 0;
  const choosing = !closed && !m.pending && (!voted || revoting);
  const showResults = voted || closed || creator;
  const selected = picked ?? r.mine;
  const closesAt = poll.closesAt?.toDate?.() ?? null;

  const toggle = (id: string) => {
    if (!choosing) return;
    setPicked(poll.multi ? (selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]) : [id]);
  };
  const submit = async () => {
    if (!selected.length || busy) return;
    setBusy(true);
    try {
      await onVote(selected);
      setRevoting(false);
      setPicked(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-[260px] max-w-full rounded-2xl bg-white text-gray-900 shadow-sm overflow-hidden">
      <div className="px-3.5 pt-3 pb-2">
        <div className="flex items-start gap-2">
          <FiBarChart2 className="mt-0.5 shrink-0 text-blue-500" size={18} />
          <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug break-words">{poll.question}</p>
          {closed && <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">{L('chat.pollClosed')}</span>}
        </div>
        <p className="mt-1 text-[11px] text-gray-500">
          {[poll.multi ? L('chat.pollMulti') : '', poll.anonymous ? L('chat.pollAnonymous') : '', closesAt ? L('chat.pollEndsAt', { at: shortDateTime(closesAt, lang) }) : ''].filter(Boolean).join(' · ')}
        </p>
      </div>
      <ul className="px-2.5 space-y-1.5">
        {r.options.map((o) => {
          const on = selected.includes(o.id);
          const top = showResults && r.top.includes(o.id);
          return (
            <li key={o.id}>
              <div
                role={choosing ? (poll.multi ? 'checkbox' : 'radio') : undefined}
                aria-checked={choosing ? on : undefined}
                tabIndex={choosing ? 0 : undefined}
                onClick={() => toggle(o.id)}
                onKeyDown={(e) => { if (choosing && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); toggle(o.id); } }}
                className={`relative overflow-hidden rounded-lg border px-2.5 py-2 text-sm ${choosing ? 'cursor-pointer hover:bg-gray-50' : ''} ${on && choosing ? 'border-blue-400' : 'border-gray-200'}`}
              >
                {showResults && (
                  <span className={`absolute inset-y-0 left-0 ${top ? 'bg-blue-100' : 'bg-gray-100'}`} style={{ width: `${Math.round(o.ratio * 100)}%` }} aria-hidden="true" />
                )}
                <span className="relative flex items-center gap-2">
                  {choosing && (
                    <span className={`h-4 w-4 shrink-0 border flex items-center justify-center ${poll.multi ? 'rounded' : 'rounded-full'} ${on ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300 bg-white'}`}>
                      {on && <FiCheck size={11} />}
                    </span>
                  )}
                  {!choosing && r.mine.includes(o.id) && <FiCheck size={14} className="shrink-0 text-blue-600"/>}
                  <span className={`min-w-0 flex-1 break-words ${top ? 'font-semibold' : ''}`}>{o.text}</span>
                  {showResults && (
                    <button
                      type="button"
                      disabled={poll.anonymous || !o.count}
                      onClick={(e) => { e.stopPropagation(); onVoters(o.id); }}
                      className="shrink-0 tabular-nums text-xs text-gray-600 enabled:hover:underline disabled:cursor-default"
                    >
                      {o.count} · {Math.round(o.ratio * 100)}%
                    </button>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="px-3.5 pt-2 pb-3">
        <p className="text-[11px] text-gray-500">
          {L('chat.pollVoters', { n: r.voters })}
          {poll.anonymous && <span> · {L('chat.pollAnonymousNote')}</span>}
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          {choosing ? (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={submit}
                disabled={!selected.length || busy}
                className="flex-1 rounded-lg bg-blue-500 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-40"
              >
                {L('chat.pollVote')}
              </button>
              {revoting && (
                <button type="button" onClick={() => { setRevoting(false); setPicked(null); }} className="rounded-lg border border-gray-200 px-3 text-sm text-gray-600 hover:bg-gray-50">
                  {L('common.cancel')}
                </button>
              )}
            </div>
          ) : !closed && voted ? (
            <button type="button" onClick={() => setRevoting(true)} className="rounded-lg border border-gray-200 py-2 text-sm text-gray-700 hover:bg-gray-50">
              {L('chat.pollRevote')}
            </button>
          ) : null}
          {creator && !closed && !m.pending && (
            <button
              type="button"
              onClick={() => { if (window.confirm(L('chat.pollCloseConfirm'))) onClose(); }}
              className="rounded-lg py-1.5 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            >
              {L('chat.pollClose')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
/** <input type="datetime-local"> 값 (이 기기 시각) */
export const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** 투표 만들기 — 제목 · 항목(2~10) · 여러 개 선택 · 익명 · 마감 */
export function ChatPollCreateDialog({ onCreate, onClose }: { onCreate: (poll: ChatPoll, closesAt: Date | null) => Promise<void>; onClose: () => void }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multi, setMulti] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const now = new Date();

  const submit = async () => {
    if (busy) return;
    const closesAt = deadline ? new Date(deadline) : null;
    if (closesAt && !(closesAt.getTime() > Date.now())) {
      toast.error(L('chat.schedulePast'));
      return;
    }
    // closesAt 은 보낼 때 Timestamp 로 바꾼다 — 여기서는 항목 검사만
    const poll = makeChatPoll(question, options, { multi, anonymous });
    if (!poll) {
      toast.error(L('chat.pollNeedOptions'));
      return;
    }
    setBusy(true);
    try {
      await onCreate(poll, closesAt);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ChatDialog
      title={L('chat.pollCreate')}
      onClose={onClose}
      wide
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">{L('common.cancel')}</button>
          <button type="button" onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-40">
            {L('chat.send')}
          </button>
        </div>
      }
    >
      <div className="px-4 py-3 space-y-3">
        <input
          autoFocus
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, CHAT_LIMITS.pollQuestionMax))}
          placeholder={L('chat.pollQuestion')}
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[15px] font-medium focus:outline-none focus:border-blue-400"
        />
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={o}
                onChange={(e) => setOptions((list) => list.map((x, k) => (k === i ? e.target.value.slice(0, CHAT_LIMITS.pollOptionMax) : x)))}
                placeholder={L('chat.pollOption', { n: i + 1 })}
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              />
              {options.length > CHAT_LIMITS.pollOptionsMin && (
                <button type="button" onClick={() => setOptions((list) => list.filter((_, k) => k !== i))} className="h-9 w-9 shrink-0 rounded-full text-gray-400 hover:bg-gray-100 flex items-center justify-center" aria-label={L('chat.webRemove')}>
                  <FiX size={16} />
                </button>
              )}
            </div>
          ))}
          {options.length < CHAT_LIMITS.pollOptionsMax && (
            <button type="button" onClick={() => setOptions((list) => [...list, ''])} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-blue-600 hover:bg-blue-50">
              <FiPlus size={15} />
              {L('chat.pollAddOption')}
            </button>
          )}
        </div>
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <label className="flex items-center gap-2.5 text-sm text-gray-800 cursor-pointer">
            <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
            {L('chat.pollMulti')}
          </label>
          <label className="flex items-center gap-2.5 text-sm text-gray-800 cursor-pointer">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
            {L('chat.pollAnonymous')}
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-800">
            <span>{L('chat.pollDeadline')}</span>
            <input
              type="datetime-local"
              value={deadline}
              min={toLocalInput(new Date(now.getTime() + 60_000))}
              onChange={(e) => setDeadline(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400"
            />
            {deadline ? (
              <button type="button" onClick={() => setDeadline('')} className="text-xs text-gray-500 underline">{L('chat.pollNoDeadline')}</button>
            ) : (
              <span className="text-xs text-gray-500">{L('chat.pollNoDeadline')}</span>
            )}
          </div>
        </div>
      </div>
    </ChatDialog>
  );
}
