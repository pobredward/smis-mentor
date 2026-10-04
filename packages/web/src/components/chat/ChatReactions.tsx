'use client';

/**
 * 공감 — 메시지 메뉴 위 이모지 줄 · 말풍선 아래 칩 · '공감한 사람' 창
 * 그리고 사람 목록 창(탭) — 공감 · 공지 확인 현황 · 투표한 사람에서 같이 쓴다
 */
import { useState, type ReactNode } from 'react';
import {
  CHAT_REACTIONS,
  CHAT_REACTION_EMOJI,
  L,
  reactionSummary,
  type ChatMemberInfo,
  type ChatReactionKey,
} from '@smis-mentor/shared';
import { ChatDialog } from './ChatMenus';
import { PersonAvatar } from './chatUi';

/** 메뉴 위 이모지 6개 — 내가 단 것 강조, 같은 걸 다시 누르면 취소 */
export function ReactionPickerRow({ mine, onPick }: { mine?: ChatReactionKey | null; onPick: (key: ChatReactionKey | null) => void }) {
  return (
    <div className="flex items-center justify-between gap-1 px-2 py-1.5" role="group" aria-label={L('chat.react')}>
      {CHAT_REACTIONS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onPick(mine === k ? null : k)}
          className={`h-10 w-10 rounded-full text-[22px] leading-none flex items-center justify-center transition-transform hover:scale-110 ${mine === k ? 'bg-blue-100 ring-2 ring-blue-400' : 'hover:bg-gray-100'}`}
          aria-pressed={mine === k}
        >
          {CHAT_REACTION_EMOJI[k]}
        </button>
      ))}
    </div>
  );
}

/** 말풍선 아래 "✅ 3 ❤️ 1" — 누르면 공감한 사람 */
export function ReactionChips({ reactions, myUid, onOpen }: { reactions?: Record<string, ChatReactionKey> | null; myUid: string; onOpen: () => void }) {
  const list = reactionSummary(reactions);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((r) => {
        const mine = r.uids.includes(myUid);
        return (
          <button
            key={r.key}
            type="button"
            onClick={onOpen}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium shadow-sm ${mine ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            <span className="text-sm leading-none">{r.emoji}</span>
            {r.count}
          </button>
        );
      })}
    </div>
  );
}

export interface ChatPeopleTab {
  key: string;
  label: ReactNode;
  uids: string[];
  /** 이름 옆 (공감 종류 등) */
  badge?: (uid: string) => ReactNode;
}

/** 사람 목록 창 — 탭마다 사람들 (이름·사진은 방 memberInfo) */
export function ChatPeopleTabsDialog({ title, tabs, memberInfo, myUid, initialTab, onClose }: { title: string; tabs: ChatPeopleTab[]; memberInfo: Record<string, ChatMemberInfo>; myUid?: string; initialTab?: string; onClose: () => void }) {
  const [active, setActive] = useState(initialTab ?? tabs[0]?.key ?? '');
  const tab = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <ChatDialog title={title} onClose={onClose}>
      {tabs.length > 1 && (
        <div className="sticky top-0 z-10 bg-white flex gap-1 overflow-x-auto px-3 pt-2 pb-1 border-b border-gray-100 [scrollbar-width:none]" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === tab?.key}
              onClick={() => setActive(t.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${t.key === tab?.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {t.label} <span className="tabular-nums opacity-80">{t.uids.length}</span>
            </button>
          ))}
        </div>
      )}
      <div className="py-1">
        {!tab?.uids.length ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">—</p>
        ) : (
          tab.uids.map((uid) => {
            const info = memberInfo[uid];
            return (
              <div key={uid} className="flex items-center gap-3 px-4 py-2">
                <PersonAvatar name={info?.name} photo={info?.photo} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] text-gray-900 truncate">
                    {info?.name ?? L('chat.unknownUser')}
                    {uid === myUid && <span className="ml-1.5 rounded bg-gray-100 px-1.5 text-[11px] text-gray-600">{L('chat.you')}</span>}
                  </div>
                  {info?.label && <div className="text-xs text-gray-500 truncate">{info.label}</div>}
                </div>
                {tab.badge?.(uid)}
              </div>
            );
          })
        )}
      </div>
    </ChatDialog>
  );
}

/** 공감한 사람 — 전체 / 종류별 */
export function ChatReactionsDialog({ reactions, memberInfo, myUid, onClose }: { reactions?: Record<string, ChatReactionKey> | null; memberInfo: Record<string, ChatMemberInfo>; myUid: string; onClose: () => void }) {
  const list = reactionSummary(reactions);
  const all = list.flatMap((r) => r.uids);
  const tabs: ChatPeopleTab[] = [
    { key: 'all', label: L('common.all'), uids: all, badge: (uid) => <span className="text-xl">{CHAT_REACTION_EMOJI[reactions![uid]]}</span> },
    ...list.map((r) => ({ key: r.key, label: r.emoji, uids: r.uids })),
  ];
  return <ChatPeopleTabsDialog title={L('chat.reactionsTitle')} tabs={tabs} memberInfo={memberInfo} myUid={myUid} onClose={onClose} />;
}
