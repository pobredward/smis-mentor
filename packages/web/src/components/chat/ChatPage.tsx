'use client';

/**
 * /chat — 채팅 (카톡방 대체)
 * 넓은 화면: 왼쪽 방 목록(340px) + 오른쪽 열린 방. 좁은 화면: 목록 또는 방(전체 화면, 뒤로 버튼).
 * 열린 방 = ?room=<roomId> (푸시 링크도 /chat?room=…)
 * 방 열기·닫기는 주소만 바꾼다 (history.pushState — Next 가 useSearchParams 를 맞춰 준다, 서버 왕복 없음).
 * router.push 를 쓰지 않는 까닭: Next 16.2 는 /chat?room=A 로 처음 들어온 뒤 router.push 로 다른 방을 열면
 * 미리 불러온 캐시 때문에 A 로 되돌아간다 (vercel/next.js#92187) — 왼쪽 목록을 눌러도 방이 안 바뀌던 문제.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  L,
  chatRoomGroups,
  compareCampCodes,
  getCurrentLocale,
  isChatStaff,
  isDmRoomId,
  isRoomHidden,
  logger,
  setChatRoomHidden,
  setChatRoomPinned,
  resolveActiveJobCodeId,
  unreadBadgeText,
  type ChatUserLike,
} from '@smis-mentor/shared';
import Layout from '@/components/common/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { authenticatedPost } from '@/lib/apiClient';
import { useChatInbox } from '@/hooks/useChatUnread';
import ChatRoomList, { type ChatCampFilter } from './ChatRoomList';
import ChatRoomContainer from './ChatRoomContainer';
import ChatPushBanner from './ChatPushBanner';
import { ChatNewDmDialog, type ChatPerson } from './ChatPeople';
import type { User } from '@/types';

/** 탭 제목 앞에 안 읽은 수 "(3) " — Next 가 제목을 다시 써도 붙여 둔다 */
function useUnreadTitle(total: number) {
  useEffect(() => {
    const strip = (s: string) => s.replace(/^\(\d+\+?\)\s/, '');
    const apply = () => {
      const base = strip(document.title);
      const next = total > 0 ? `(${unreadBadgeText(total)}) ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    const titleEl = document.querySelector('head > title');
    const obs = titleEl ? new MutationObserver(apply) : null;
    if (titleEl && obs) obs.observe(titleEl, { childList: true, characterData: true, subtree: true });
    return () => {
      obs?.disconnect();
      document.title = strip(document.title);
    };
  }, [total]);
}

const FILTER_KEY = 'smis_chat_camp_filter';

function readFilter(): ChatCampFilter {
  try {
    return window.localStorage.getItem(FILTER_KEY) || 'all';
  } catch {
    return 'all';
  }
}

/** 채팅 화면 안에서 주소 바꾸기 (방 열기·닫기) */
function goChat(href: string, replace = false) {
  if (replace) window.history.replaceState(null, '', href);
  else window.history.pushState(null, '', href);
}

function ChatScreen({ uid, user }: { uid: string; user: User }) {
  const searchParams = useSearchParams();
  const roomId = searchParams.get('room') || null;
  const inbox = useChatInbox();
  const lang = getCurrentLocale();
  const [keepDm, setKeepDm] = useState<string | null>(null);
  const [newDmOpen, setNewDmOpen] = useState(false);
  // 고른 목록 버튼 ('all' · 'unread' · 'dm' · jobCodeId) — 이 브라우저에 기억 (없어진 캠프면 전체로 보인다)
  const [filter, setFilter] = useState<ChatCampFilter>(readFilter);
  const changeFilter = useCallback((f: ChatCampFilter) => {
    setFilter(f);
    try {
      window.localStorage.setItem(FILTER_KEY, f);
    } catch {
      /* 저장소를 못 쓰면 이번만 */
    }
  }, []);
  useUnreadTitle(inbox.total);

  // 목록을 열 때 캠프 방을 캠프 배정대로 맞춘다 (조용히 — 실패해도 무시)
  useEffect(() => {
    authenticatedPost('/api/chat/sync', {}).catch(() => undefined);
  }, [uid]);

  const activeJobCodeId = resolveActiveJobCodeId(user as unknown as Parameters<typeof resolveActiveJobCodeId>[0]) ?? null;
  const groups = useMemo(
    () => chatRoomGroups(inbox.rooms, { activeJobCodeId, keepEmptyDmId: roomId && isDmRoomId(roomId) ? roomId : keepDm, state: inbox.state }),
    [inbox.rooms, activeJobCodeId, roomId, keepDm, inbox.state],
  );
  const hiddenRooms = useMemo(() => inbox.rooms.filter((r) => isRoomHidden(inbox.state, r)), [inbox.rooms, inbox.state]);

  // 새 1:1 대화 후보 — 내가 들어간 모든 캠프 전체방의 사람 (지금 캠프 먼저)
  const people = useMemo<ChatPerson[]>(() => {
    const campRooms = inbox.rooms
      .filter((r) => r.type === 'camp_all')
      .sort((a, b) => (a.jobCodeId === activeJobCodeId ? -1 : b.jobCodeId === activeJobCodeId ? 1 : compareCampCodes(b.campCode, a.campCode)));
    const seen = new Map<string, ChatPerson>();
    campRooms.forEach((r) => {
      Object.entries(r.memberInfo ?? {}).forEach(([id, info]) => {
        if (id === uid || seen.has(id) || !(r.memberIds ?? []).includes(id)) return;
        seen.set(id, { uid: id, ...info, campCode: r.campCode });
      });
    });
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [inbox.rooms, activeJobCodeId, uid]);

  const openRoom = useCallback((id: string) => {
    if (id === roomId) return;
    goChat(`/chat?room=${encodeURIComponent(id)}`);
  }, [roomId]);

  const closeRoom = useCallback(() => {
    goChat('/chat');
  }, []);

  const onPin = useCallback((id: string, pinned: boolean) => {
    setChatRoomPinned(db, uid, id, pinned).catch((e) => {
      logger.warn('채팅방 고정 실패:', e);
      toast.error(L('chat.webActionFailed'));
    });
  }, [uid]);
  const onHide = useCallback((id: string, hidden: boolean) => {
    setChatRoomHidden(db, uid, id, hidden)
      .then(() => { if (hidden) toast(L('chat.hideHint')); })
      .catch((e) => {
        logger.warn('채팅방 숨기기 실패:', e);
        toast.error(L('chat.webActionFailed'));
      });
    if (hidden && id === roomId) goChat('/chat', true);
  }, [uid, roomId]);

  const startDm = useCallback(async (userId: string) => {
    try {
      const { roomId: dmId } = await authenticatedPost<{ roomId: string }>('/api/chat/dm', { userId });
      if (!dmId) throw new Error('no room');
      setKeepDm(dmId);
      setNewDmOpen(false);
      openRoom(dmId);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : L('chat.webActionFailed'));
    }
  }, [openRoom]);

  return (
    <div className="md:flex md:h-[calc(100dvh-4rem)] bg-white">
      <aside className="md:w-[340px] md:shrink-0 md:border-r md:border-gray-200 md:overflow-y-auto md:overscroll-contain">
        <ChatRoomList
          groups={groups}
          state={inbox.state}
          myUid={uid}
          lang={lang}
          activeRoomId={roomId}
          ready={inbox.ready}
          loadFailed={inbox.error}
          filter={filter}
          onFilterChange={changeFilter}
          onOpenRoom={openRoom}
          onNewDm={() => setNewDmOpen(true)}
          banner={<ChatPushBanner uid={uid} />}
          hiddenRooms={hiddenRooms}
          onPin={onPin}
          onHide={onHide}
        />
      </aside>
      {roomId ? (
        <ChatRoomContainer
          key={roomId}
          roomId={roomId}
          myUid={uid}
          myName={String(user.name ?? '')}
          state={inbox.state}
          currentGeneration={groups.generation}
          onBack={closeRoom}
          onStartDm={startDm}
        />
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center gap-2 bg-[#e8eef5] text-gray-500">
          <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-sm">{L('chat.webPickRoom')}</p>
        </div>
      )}
      {newDmOpen && <ChatNewDmDialog people={people} onPick={startDm} onClose={() => setNewDmOpen(false)} />}
    </div>
  );
}

export default function ChatPage() {
  const { userData, currentUser } = useAuth();
  const uid = currentUser?.uid || userData?.userId || '';
  const staff = isChatStaff(userData as unknown as ChatUserLike);

  return (
    <Layout requireAuth noPadding>
      {!userData || !uid ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : !staff ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-2 text-center px-6">
          <h2 className="text-lg font-semibold text-gray-800">{L('chat.title')}</h2>
          <p className="text-sm text-gray-500">{L('chat.webStaffOnly')}</p>
        </div>
      ) : (
        <ChatScreen uid={uid} user={userData} />
      )}
    </Layout>
  );
}
