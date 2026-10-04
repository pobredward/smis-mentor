'use client';

/**
 * 채팅방 목록 (화면만 — 데이터는 props)
 * 1) 지금 기수의 캠프 방 — 캠프가 2개 이상이면 위에 [All][J29][E29]… 버튼으로 골라 본다
 * 2) 1:1 대화 (최근 순)
 * 3) 지난 기수 (접힘 — 기수별 · 캠프별 소제목)
 */
import { useState, type ReactNode } from 'react';
import { FiAlertCircle, FiBellOff, FiChevronDown, FiChevronRight, FiEdit } from 'react-icons/fi';
import {
  L,
  chatListTimeLabel,
  chatPreviewText,
  chatRoomTitle,
  dmPeerOf,
  filterCampGroups,
  isRoomMuted,
  totalUnread,
  unreadBadgeText,
  unreadOf,
  type ChatCampGroup,
  type ChatRoom,
  type ChatRoomGroups,
  type ChatUserState,
  type Locale,
} from '@smis-mentor/shared';
import { RoomAvatar, UnreadBadge } from './chatUi';

/** 캠프 버튼 — 'all' 또는 jobCodeId */
export type ChatCampFilter = string;

export interface ChatRoomListProps {
  groups: ChatRoomGroups;
  state: ChatUserState | null;
  myUid: string;
  lang: Locale;
  activeRoomId: string | null;
  /** 방 목록을 다 받았는가 */
  ready: boolean;
  /** 방 목록을 불러오지 못함 (규칙 거절 등) */
  loadFailed?: boolean;
  /** 지금 기수에서 고른 캠프 ('all' · jobCodeId) */
  filter: ChatCampFilter;
  onFilterChange: (filter: ChatCampFilter) => void;
  onOpenRoom: (roomId: string) => void;
  onNewDm: () => void;
  /** 목록 위 안내 (브라우저 알림 켜기 등) */
  banner?: ReactNode;
  now?: Date;
}

function RoomRow({ room, state, myUid, lang, active, onOpen, now }: { room: ChatRoom; state: ChatUserState | null; myUid: string; lang: Locale; active: boolean; onOpen: () => void; now?: Date }) {
  const unread = unreadOf(state, room.id);
  const muted = isRoomMuted(state, room.id);
  const peer = room.type === 'dm' ? room.memberInfo?.[dmPeerOf(room, myUid) ?? ''] : undefined;
  const at = room.lastMessageAt?.toDate?.() ?? null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${active ? 'bg-blue-50' : 'hover:bg-gray-50 active:bg-gray-100'}`}
      aria-current={active ? 'true' : undefined}
    >
      <RoomAvatar type={room.type} peerName={peer?.name} peerPhoto={peer?.photo} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 flex items-center gap-1.5">
            <span className="text-[15px] font-semibold text-gray-900 truncate">{chatRoomTitle(room, lang, myUid)}</span>
            {room.type !== 'dm' && <span className="shrink-0 text-xs text-gray-400">{room.memberIds?.length ?? 0}</span>}
            {muted && <FiBellOff size={12} className="shrink-0 text-gray-400" aria-label={L('chat.muted')} />}
          </div>
          <span className="shrink-0 text-[11px] text-gray-400">{chatListTimeLabel(at, lang, now)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p className="min-w-0 flex-1 text-[13px] text-gray-500 truncate">{chatPreviewText(room.lastMessage, lang)}</p>
          {unread > 0 && <UnreadBadge text={unreadBadgeText(unread)} />}
        </div>
      </div>
    </button>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-1.5">
      <h3 className="text-xs font-semibold text-gray-500">{children}</h3>
    </div>
  );
}

/** [All][J29][E29]… — 좁은 화면에서는 옆으로 밀어 본다 */
function CampChips({ camps, filter, state, onChange }: { camps: ChatCampGroup[]; filter: ChatCampFilter; state: ChatUserState | null; onChange: (f: ChatCampFilter) => void }) {
  const chips = [
    { key: 'all', label: L('chat.filterAll'), unread: totalUnread(state, camps.flatMap((c) => c.rooms)) },
    ...camps.map((c) => ({ key: c.jobCodeId, label: c.campCode || '—', unread: totalUnread(state, c.rooms) })),
  ];
  return (
    <div className="flex gap-1.5 overflow-x-auto px-4 pt-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
      {chips.map((c) => {
        const on = c.key === filter;
        return (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(c.key)}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              on ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {c.label}
            {c.unread > 0 && (
              <span className={`min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold leading-4 text-center ${on ? 'bg-white text-gray-900' : 'bg-red-500 text-white'}`}>
                {unreadBadgeText(c.unread)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function ChatRoomList({ groups, state, myUid, lang, activeRoomId, ready, loadFailed, filter, onFilterChange, onOpenRoom, onNewDm, banner, now }: ChatRoomListProps) {
  const [pastOpen, setPastOpen] = useState(false);
  const { camps, dms, otherGenerations } = groups;
  const shownCamps = filterCampGroups(camps, filter);
  // 고른 캠프가 사라졌으면 All 로 본다
  const selected = camps.length >= 2 && camps.some((c) => c.jobCodeId === filter) ? filter : 'all';
  const empty = !camps.length && !dms.length && !otherGenerations.length;
  const pastUnread = totalUnread(state, otherGenerations.flatMap((g) => g.camps.flatMap((c) => c.rooms)));
  const pastCamps = otherGenerations.reduce((s, g) => s + g.camps.length, 0);
  const row = (r: ChatRoom) => (
    <RoomRow key={r.id} room={r} state={state} myUid={myUid} lang={lang} active={r.id === activeRoomId} onOpen={() => onOpenRoom(r.id)} now={now} />
  );

  return (
    <div className="flex flex-col min-h-full bg-white">
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 shrink-0">
        <h2 className="text-lg font-bold text-gray-900">{L('chat.title')}</h2>
        <button
          type="button"
          onClick={onNewDm}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          title={L('chat.newDm')}
        >
          <FiEdit size={16} />
          <span>{L('chat.newDm')}</span>
        </button>
      </div>
      {banner}
      {!ready ? (
        <div className="flex-1 flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" aria-label={L('chat.loading')} />
        </div>
      ) : empty && loadFailed ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6 py-16">
          <FiAlertCircle size={28} className="text-gray-400" />
          <p className="text-sm text-gray-600">{L('chat.loadFailed')}</p>
        </div>
      ) : empty ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16">
          <p className="text-[15px] font-semibold text-gray-800">{L('chat.noRooms')}</p>
          <p className="mt-1 text-sm text-gray-500">{L('chat.noRoomsHint')}</p>
        </div>
      ) : (
        <div className="pb-4">
          {camps.length >= 2 && <CampChips camps={camps} filter={selected} state={state} onChange={onFilterChange} />}
          {shownCamps.map((c) => (
            <section key={c.jobCodeId}>
              <SectionTitle>{L('chat.campRooms', { camp: c.campCode })}</SectionTitle>
              {c.rooms.map(row)}
            </section>
          ))}
          {dms.length > 0 && (
            <section>
              <SectionTitle>{L('chat.sectionDms')}</SectionTitle>
              {dms.map(row)}
            </section>
          )}
          {otherGenerations.length > 0 && (
            <section className="mt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setPastOpen((v) => !v)}
                className="w-full flex items-center gap-1.5 px-4 pt-3 pb-2 text-xs font-semibold text-gray-500 hover:text-gray-700"
                aria-expanded={pastOpen}
              >
                {pastOpen ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                {L('chat.sectionOtherGenerations')}
                <span className="font-normal text-gray-400">{pastCamps}</span>
                {!pastOpen && pastUnread > 0 && <UnreadBadge text={unreadBadgeText(pastUnread)} className="ml-auto" />}
              </button>
              {pastOpen &&
                otherGenerations.map((g) => (
                  <div key={g.generation || '-'} className="pb-1">
                    <div className="px-4 pt-3 pb-1 text-xs font-bold text-gray-700">{g.generation || '—'}</div>
                    {g.camps.map((c) => (
                      <div key={c.jobCodeId}>
                        <div className="px-4 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{c.campCode || '—'}</div>
                        {c.rooms.map(row)}
                      </div>
                    ))}
                  </div>
                ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
