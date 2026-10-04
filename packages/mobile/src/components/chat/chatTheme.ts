/**
 * 채팅 화면 공통 색 · 방 종류별 아바타 모양
 */
import type { Ionicons } from '@expo/vector-icons';
import type { ChatMemberKind, ChatRoomType } from '@smis-mentor/shared';

export const CHAT_COLORS = {
  /** 대화방 배경 (연한 회청색) */
  roomBg: '#e8eef5',
  /** 내 말풍선 */
  mine: '#3b82f6',
  mineText: '#ffffff',
  /** 남의 말풍선 */
  other: '#ffffff',
  otherText: '#1e293b',
  /** 안 읽은 사람 수 ('1') */
  unreadReaders: '#f59e0b',
  /** 목록의 안 읽은 수 배지 */
  badge: '#ef4444',
  muted: '#94a3b8',
  sub: '#64748b',
  border: '#e2e8f0',
  text: '#1e293b',
  primary: '#3b82f6',
  danger: '#ef4444',
  link: '#2563eb',
} as const;

type IoniconName = keyof typeof Ionicons.glyphMap;

/** 캠프 방 아바타 — 방 종류별 색 동그라미 + 아이콘 */
export const ROOM_AVATAR: Record<Exclude<ChatRoomType, 'dm'>, { color: string; icon: IoniconName }> = {
  camp_all: { color: '#3b82f6', icon: 'people' },
  camp_manager: { color: '#334155', icon: 'briefcase' },
  camp_mentor: { color: '#10b981', icon: 'school' },
  camp_mentor_only: { color: '#0ea5e9', icon: 'chatbubbles' },
  camp_foreign: { color: '#8b5cf6', icon: 'globe-outline' },
  camp_foreign_only: { color: '#ec4899', icon: 'earth' },
  // 그룹방 (Junior · Summer …) — 캠프 방과 다른 색
  camp_group: { color: '#f59e0b', icon: 'people-circle' },
};

/** 사람 자리별 순서 · 문구 키 */
export const MEMBER_KIND_ORDER: readonly ChatMemberKind[] = ['manager', 'mentor', 'foreign'];
export const MEMBER_KIND_LABEL_KEY = {
  manager: 'chat.kindManager',
  mentor: 'chat.kindMentor',
  foreign: 'chat.kindForeign',
} as const;

/** 이름 첫 글자 동그라미 색 (이름으로 고정) */
const INITIAL_COLORS = ['#60a5fa', '#34d399', '#f472b6', '#a78bfa', '#fbbf24', '#fb923c', '#2dd4bf', '#94a3b8'];
export function initialColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return INITIAL_COLORS[h % INITIAL_COLORS.length];
}

/** 동영상 길이 "1:05" */
export function formatDuration(ms?: number | null): string {
  if (!ms || ms <= 0) return '';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
