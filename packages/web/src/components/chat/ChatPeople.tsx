'use client';

/**
 * 사람 목록 — [대화 상대] 창 · [새 1:1 대화] 사람 고르기
 */
import { useMemo, useState } from 'react';
import { FiSearch } from 'react-icons/fi';
import { L, type ChatMemberInfo, type ChatMemberKind } from '@smis-mentor/shared';
import { ChatDialog } from './ChatMenus';
import { KIND_ORDER, PersonAvatar, kindLabel } from './chatUi';

export interface ChatPerson extends ChatMemberInfo {
  uid: string;
  /** 사람 고르기에서 — 어느 캠프에서 만났는지 */
  campCode?: string | null;
}

const KIND_BADGE: Record<ChatMemberKind, string> = {
  manager: 'bg-blue-50 text-blue-700',
  mentor: 'bg-emerald-50 text-emerald-700',
  foreign: 'bg-violet-50 text-violet-700',
};

/** 사람 한 줄 — 누를 수 있는 줄이면 바깥(button)이 누름을 받고, 오른쪽 [대화하기]는 표시만 */
function PersonRow({ p, me, showStart, showKind }: { p: ChatPerson; me: boolean; showStart?: boolean; showKind?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <PersonAvatar name={p.name} photo={p.photo} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[15px] font-medium text-gray-900 truncate">{p.name}</span>
          {me && <span className="shrink-0 rounded bg-gray-100 px-1.5 text-[11px] font-medium text-gray-600">{L('chat.you')}</span>}
          {showKind && <span className={`shrink-0 rounded px-1.5 text-[11px] font-medium ${KIND_BADGE[p.kind]}`}>{kindLabel(p.kind)}</span>}
        </div>
        {(p.label || p.campCode) && (
          <div className="text-xs text-gray-500 truncate">{[p.campCode, p.label].filter(Boolean).join(' · ')}</div>
        )}
      </div>
      {!me && showStart && (
        <span className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">
          {L('chat.startChat')}
        </span>
      )}
    </div>
  );
}

/** 대화 상대 — 매니저 / 멘토 / 원어민 묶음, 나 표시, 다른 사람은 [대화하기] → 1:1 */
export function ChatMembersDialog({ members, myUid, onStartDm, onClose }: { members: ChatPerson[]; myUid: string; onStartDm: (uid: string) => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => {
    const sorted = [...members].sort((a, b) => (a.uid === myUid ? -1 : b.uid === myUid ? 1 : a.name.localeCompare(b.name, 'ko')));
    return KIND_ORDER.map((k) => ({ kind: k, people: sorted.filter((p) => p.kind === k) })).filter((g) => g.people.length);
  }, [members, myUid]);
  const start = async (uid: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await onStartDm(uid);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ChatDialog title={L('chat.members', { n: members.length })} onClose={onClose} wide>
      <div className="py-1">
        {groups.map((g) => (
          <section key={g.kind}>
            <h4 className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500">
              {kindLabel(g.kind)} <span className="font-normal">{g.people.length}</span>
            </h4>
            {g.people.map((p) =>
              p.uid === myUid ? (
                <PersonRow key={p.uid} p={p} me />
              ) : (
                <button key={p.uid} type="button" disabled={busy} onClick={() => start(p.uid)} className="block w-full text-left hover:bg-gray-50 disabled:opacity-50">
                  <PersonRow p={p} me={false} showStart />
                </button>
              ),
            )}
          </section>
        ))}
      </div>
    </ChatDialog>
  );
}

/** 새 1:1 대화 — 내가 들어간 모든 캠프 전체방의 사람 (이름 검색) */
export function ChatNewDmDialog({ people, onPick, onClose }: { people: ChatPerson[]; onPick: (uid: string) => Promise<void>; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? people.filter((p) => `${p.name} ${p.label ?? ''} ${p.campCode ?? ''}`.toLowerCase().includes(s)) : people;
  }, [people, q]);
  const pick = async (uid: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await onPick(uid);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ChatDialog title={L('chat.newDm')} onClose={onClose} wide>
      <div className="sticky top-0 bg-white px-4 pt-3 pb-2 z-10">
        <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3">
          <FiSearch className="text-gray-400 shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={L('chat.searchPeople')}
            className="w-full bg-transparent py-2 text-sm focus:outline-none"
          />
        </div>
      </div>
      {list.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-gray-500">{L('chat.noPeople')}</p>
      ) : (
        <div className="pb-2">
          {list.map((p) => (
            <button key={p.uid} type="button" disabled={busy} onClick={() => pick(p.uid)} className="block w-full text-left hover:bg-gray-50 disabled:opacity-50">
              <PersonRow p={p} me={false} showKind />
            </button>
          ))}
        </div>
      )}
    </ChatDialog>
  );
}
