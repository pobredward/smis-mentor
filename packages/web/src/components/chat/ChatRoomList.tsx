'use client';

/**
 * 채팅방 목록 (화면만 — 데이터는 props)
 * 1) 지금 기수의 캠프 방·그룹방 (늘 고정) — 위 [All][1:1][J29][E29]… 버튼으로 골라 본다 ([1:1] = 1:1 대화만)
 *    [All] 에서는 캠프 제목을 눌러 그 캠프 방들을 접는다 (접은 캠프는 이 브라우저에 기억, 접힌 제목에 안 읽은 수 · 최근 시각)
 * 2) 고정한 대화  3) 1:1 대화 (최근 순)  4) 지난 기수 (접힘 — 기수별 · 캠프별 소제목)  5) 숨긴 채팅방 n개
 * 행 메뉴(길게 누르기 · 우클릭 · ⋯): 위에 고정/해제 · 채팅방 숨기기 (기본 방은 안내만)
 */
import { useCallback, useState, type ReactNode } from 'react';
import { FiAlertCircle, FiBellOff, FiChevronDown, FiChevronRight, FiEdit, FiEyeOff, FiMoreHorizontal } from 'react-icons/fi';
import { BsPin, BsPinAngle, BsPinAngleFill } from 'react-icons/bs';
import {
  L,
  chatListTimeLabel,
  chatPreviewText,
  chatRoomTitle,
  chatCampSummary,
  chatListChips,
  chatListToggle,
  chatListView,
  dmPeerOf,
  isRoomMuted,
  parseFoldedCamps,
  totalUnread,
  unreadBadgeText,
  unreadOf,
  type ChatCampGroup,
  type ChatListChip,
  type ChatRoom,
  type ChatRoomGroups,
  type ChatUserState,
  type Locale,
} from '@smis-mentor/shared';
import { ChatActionMenu, ChatDialog, type ChatMenuAction, type ChatMenuAnchor } from './ChatMenus';
import { RoomAvatar, UnreadBadge } from './chatUi';
import { useLongPress } from './useLongPress';

/** 목록 버튼 — 'all'(아무 버튼도 안 고름) · 'unread'(안 읽은 대화만) · 'dm'(1:1 대화만) · jobCodeId */
export type ChatCampFilter = string;

const FOLDED_KEY = 'smis_chat_folded_camps';

/** 접은 캠프 (이 브라우저에 기억) */
function useFoldedCamps(): [ReadonlySet<string>, (jobCodeId: string) => void] {
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => {
    try {
      return new Set(parseFoldedCamps(window.localStorage.getItem(FOLDED_KEY)));
    } catch {
      return new Set();
    }
  });
  const toggle = useCallback((jobCodeId: string) => {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(jobCodeId)) next.delete(jobCodeId);
      else next.add(jobCodeId);
      try {
        window.localStorage.setItem(FOLDED_KEY, JSON.stringify([...next]));
      } catch {
        /* 저장소를 못 쓰면 이번만 */
      }
      return next;
    });
  }, []);
  return [folded, toggle];
}

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
  /** 고른 버튼 ('all' · 'unread' · 'dm' · jobCodeId) */
  filter: ChatCampFilter;
  onFilterChange: (filter: ChatCampFilter) => void;
  onOpenRoom: (roomId: string) => void;
  onNewDm: () => void;
  /** 목록 위 안내 (브라우저 알림 켜기 등) */
  banner?: ReactNode;
  now?: Date;
  /** 숨긴 방 (숨긴 채팅방 보기) */
  hiddenRooms?: ChatRoom[];
  onPin?: (roomId: string, pinned: boolean) => void;
  onHide?: (roomId: string, hidden: boolean) => void;
}

interface RowMenu {
  room: ChatRoom;
  anchor: ChatMenuAnchor;
}

function RoomRow({ room, state, myUid, lang, active, onOpen, now, pinned, onMenu }: {
  room: ChatRoom;
  state: ChatUserState | null;
  myUid: string;
  lang: Locale;
  active: boolean;
  onOpen: () => void;
  now?: Date;
  /** 고정 아이콘 (기본 방 · 내가 고정한 방) */
  pinned?: boolean;
  onMenu?: (a: ChatMenuAnchor) => void;
}) {
  const unread = unreadOf(state, room.id);
  const muted = isRoomMuted(state, room.id);
  const peer = room.type === 'dm' ? room.memberInfo?.[dmPeerOf(room, myUid) ?? ''] : undefined;
  const at = room.lastMessageAt?.toDate?.() ?? null;
  const press = useLongPress((a) => onMenu?.(a));
  return (
    <div className="group relative" {...(onMenu ? press : {})}>
      <button
        type="button"
        onClick={onOpen}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors [-webkit-touch-callout:none] ${active ? 'bg-blue-50' : 'hover:bg-gray-50 active:bg-gray-100'}`}
        aria-current={active ? 'true' : undefined}
      >
        <RoomAvatar type={room.type} peerName={peer?.name} peerPhoto={peer?.photo} groupKey={room.groupKey} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <span className="text-[15px] font-semibold text-gray-900 truncate">{chatRoomTitle(room, lang, myUid)}</span>
              {room.type !== 'dm' && <span className="shrink-0 text-xs text-gray-400">{room.memberIds?.length ?? 0}</span>}
              {pinned && <BsPinAngleFill size={11} className="shrink-0 text-gray-400" aria-label={L('chat.pinnedSection')} />}
              {muted && <FiBellOff size={12} className="shrink-0 text-gray-400" aria-label={L('chat.muted')} />}
            </div>
            <span className="shrink-0 text-[11px] text-gray-400">{chatListTimeLabel(at, lang, now)}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <p className="min-w-0 flex-1 text-[13px] text-gray-500 truncate">{chatPreviewText(room.lastMessage, lang, { myUid, direct: room.type === 'dm' })}</p>
            {unread > 0 && <UnreadBadge text={unreadBadgeText(unread)} />}
          </div>
        </div>
      </button>
      {onMenu && (
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onMenu({ x: r.right - 200, y: r.bottom + 2, sheet: false });
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 text-gray-500 shadow-sm ring-1 ring-black/5 items-center justify-center hidden group-hover:flex focus:flex [@media(pointer:coarse)]:!hidden"
          aria-label={L('chat.roomMenu')}
          title={L('chat.roomMenu')}
        >
          <FiMoreHorizontal size={16} />
        </button>
      )}
    </div>
  );
}

/** [All] 의 캠프 묶음 — 제목을 누르면 접고 펼친다. 접히면 제목 줄에 최근 시각 · 안 읽은 수 합 */
function FoldableCamp({ camp, state, lang, now, folded, onToggle, children }: {
  camp: ChatCampGroup;
  state: ChatUserState | null;
  lang: Locale;
  now?: Date;
  folded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const sum = folded ? chatCampSummary(camp, state) : null;
  return (
    <section>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!folded}
        aria-label={L(folded ? 'chat.unfoldCamp' : 'chat.foldCamp', { camp: camp.campCode })}
        className={`w-full flex items-center gap-1.5 px-4 pt-4 pb-1.5 text-left hover:bg-gray-50 ${folded ? 'pb-3 border-b border-gray-100' : ''}`}
      >
        {folded ? <FiChevronRight size={14} className="shrink-0 text-gray-400" /> : <FiChevronDown size={14} className="shrink-0 text-gray-400" />}
        <h3 className="text-xs font-semibold text-gray-500">{L('chat.campRooms', { camp: camp.campCode })}</h3>
        <span className="text-xs text-gray-400">{camp.rooms.length}</span>
        {sum && (
          <span className="ml-auto flex items-center gap-2">
            {sum.lastAt && <span className="text-[11px] text-gray-400">{chatListTimeLabel(sum.lastAt, lang, now)}</span>}
            {sum.unread > 0 && <UnreadBadge text={unreadBadgeText(sum.unread)} />}
          </span>
        )}
      </button>
      {!folded && children}
    </section>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-1.5">
      <h3 className="text-xs font-semibold text-gray-500">{children}</h3>
    </div>
  );
}

/** [안 읽음][1:1][J29][E29]… — 고른 버튼을 다시 누르면 전체. 좁은 화면에서는 옆으로 밀어 본다 */
function ListChips({ chips, filter, onChange }: { chips: ChatListChip[]; filter: ChatCampFilter; onChange: (f: ChatCampFilter) => void }) {
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
            onClick={() => onChange(chatListToggle(filter, c.key))}
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

export default function ChatRoomList({ groups, state, myUid, lang, activeRoomId, ready, loadFailed, filter, onFilterChange, onOpenRoom, onNewDm, banner, now, hiddenRooms = [], onPin, onHide }: ChatRoomListProps) {
  const [pastOpen, setPastOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<RowMenu | null>(null);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [folded, toggleFold] = useFoldedCamps();
  const { camps, hiddenCount } = groups;
  const chips = chatListChips(groups, state, lang);
  // 고른 캠프가 사라졌거나 1:1 대화가 없으면 전체로 본다
  const view = chatListView(groups, filter, state);
  const { pinned, dms, otherGenerations } = view;
  const dmOnly = view.filter === 'dm';
  const unreadOnly = view.filter === 'unread';
  const empty = !camps.length && !groups.pinned.length && !groups.dms.length && !groups.otherGenerations.length;
  const pastUnread = totalUnread(state, otherGenerations.flatMap((g) => g.camps.flatMap((c) => c.rooms)));
  const pastCamps = otherGenerations.reduce((s, g) => s + g.camps.length, 0);
  const presetIds = new Set(camps.flatMap((c) => c.rooms.map((r) => r.id)));
  const canMenu = !!(onPin && onHide);
  const row = (r: ChatRoom) => (
    <RoomRow
      key={r.id}
      room={r}
      state={state}
      myUid={myUid}
      lang={lang}
      active={r.id === activeRoomId}
      onOpen={() => onOpenRoom(r.id)}
      now={now}
      pinned={presetIds.has(r.id) || !!state?.pinned?.[r.id]}
      onMenu={canMenu ? (anchor) => setRowMenu({ room: r, anchor }) : undefined}
    />
  );
  const rowMenuActions = (r: ChatRoom): ChatMenuAction[] => {
    if (presetIds.has(r.id)) return [{ key: 'preset', label: L('chat.presetPinned'), icon: <BsPinAngle size={15} />, note: true, onSelect: () => undefined }];
    const isPinned = !!state?.pinned?.[r.id];
    return [
      { key: 'pin', label: isPinned ? L('chat.unpin') : L('chat.pin'), icon: isPinned ? <BsPin size={15} /> : <BsPinAngle size={15} />, onSelect: () => onPin?.(r.id, !isPinned) },
      { key: 'hide', label: L('chat.hideRoom'), icon: <FiEyeOff size={16} />, onSelect: () => onHide?.(r.id, true) },
    ];
  };

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
          {chips.length > 0 && <ListChips chips={chips} filter={view.filter} onChange={onFilterChange} />}
          {unreadOnly && view.unread.map(row)}
          {unreadOnly && !view.unread.length && (
            <div className="px-6 py-14 text-center text-sm text-gray-500">{L('chat.noUnread')}</div>
          )}
          {view.camps.map((c) =>
            view.foldable ? (
              <FoldableCamp key={c.jobCodeId} camp={c} state={state} lang={lang} now={now} folded={folded.has(c.jobCodeId)} onToggle={() => toggleFold(c.jobCodeId)}>
                {c.rooms.map(row)}
              </FoldableCamp>
            ) : (
              <section key={c.jobCodeId}>
                <SectionTitle>{L('chat.campRooms', { camp: c.campCode })}</SectionTitle>
                {c.rooms.map(row)}
              </section>
            ),
          )}
          {pinned.length > 0 && (
            <section>
              <SectionTitle>{L('chat.pinnedSection')}</SectionTitle>
              {pinned.map(row)}
            </section>
          )}
          {dms.length > 0 && (
            <section>
              <SectionTitle>{L('chat.sectionDms')}</SectionTitle>
              {dms.map(row)}
            </section>
          )}
          {dmOnly && !pinned.length && !dms.length && (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <p className="text-sm text-gray-500">{L('chat.noDms')}</p>
              <button type="button" onClick={onNewDm} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <FiEdit size={15} />
                {L('chat.newDm')}
              </button>
            </div>
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
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setHiddenOpen(true)}
              className="mt-3 w-full flex items-center justify-center gap-1.5 px-4 py-3 text-xs text-gray-500 hover:text-gray-700 border-t border-gray-100"
            >
              <FiEyeOff size={13} />
              {L('chat.hiddenN', { n: hiddenCount })}
            </button>
          )}
        </div>
      )}
      {rowMenu && (
        <ChatActionMenu
          anchor={rowMenu.anchor}
          actions={rowMenuActions(rowMenu.room)}
          title={chatRoomTitle(rowMenu.room, lang, myUid)}
          onClose={() => setRowMenu(null)}
        />
      )}
      {hiddenOpen && (
        <ChatDialog title={L('chat.showHidden')} onClose={() => setHiddenOpen(false)} wide>
          {hiddenRooms.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-500">—</p>
          ) : (
            <div className="py-1">
              <p className="px-4 pt-2 pb-1 text-xs text-gray-500">{L('chat.hideHint')}</p>
              {hiddenRooms.map((r) => {
                const peer = r.type === 'dm' ? r.memberInfo?.[dmPeerOf(r, myUid) ?? ''] : undefined;
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <RoomAvatar type={r.type} peerName={peer?.name} peerPhoto={peer?.photo} groupKey={r.groupKey} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-medium text-gray-900 truncate">{chatRoomTitle(r, lang, myUid)}</div>
                      <div className="text-xs text-gray-500 truncate">{chatPreviewText(r.lastMessage, lang, { myUid, direct: r.type === 'dm' })}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onHide?.(r.id, false)}
                      className="shrink-0 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {L('chat.unhideRoom')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </ChatDialog>
      )}
    </div>
  );
}
