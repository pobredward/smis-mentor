/**
 * 채팅 화면(web) 작은 도우미 — 시각 · 글 속 링크 · 동영상 길이 · 자리 이름 · 아바타
 */
import { Fragment, type ReactNode } from 'react';
import { FiGlobe, FiUsers } from 'react-icons/fi';
import { HiOutlineAcademicCap } from 'react-icons/hi2';
import { L, type ChatMemberKind, type ChatRoomType } from '@smis-mentor/shared';

/** Timestamp(또는 비슷한 것) → ms. 없으면 0 */
export const tsMillis = (ts: { toMillis?: () => number } | null | undefined): number =>
  ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;

export const dayKeyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** 동영상 길이 "1:05" · "1:02:03" */
export function formatDuration(ms?: number | null): string {
  if (!ms || ms < 0) return '';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export const kindLabel = (k: ChatMemberKind): string =>
  k === 'manager' ? L('chat.kindManager') : k === 'foreign' ? L('chat.kindForeign') : L('chat.kindMentor');

export const KIND_ORDER: ChatMemberKind[] = ['manager', 'mentor', 'foreign'];

// 주소 뒤에 붙은 문장부호는 빼고 링크로
const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]}])/g;

/** 글 속 http(s) 주소를 링크로 (줄바꿈은 whitespace-pre-wrap 이 유지) */
export function linkify(text: string, linkClass: string): ReactNode {
  const parts = text.split(URL_RE);
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={p}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
        onClick={(e) => e.stopPropagation()}
      >
        {p}
      </a>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

/** 캠프 방 종류별 색 · 아이콘 */
const ROOM_STYLE: Record<Exclude<ChatRoomType, 'dm'>, { bg: string; icon: 'all' | 'mentor' | 'foreign' }> = {
  camp_all: { bg: 'bg-blue-500', icon: 'all' },
  camp_mentor: { bg: 'bg-emerald-500', icon: 'mentor' },
  camp_mentor_only: { bg: 'bg-teal-600', icon: 'mentor' },
  camp_foreign: { bg: 'bg-violet-500', icon: 'foreign' },
  camp_foreign_only: { bg: 'bg-fuchsia-500', icon: 'foreign' },
};

const avatarSize = (size: number) => ({ width: size, height: size });

/** 사람 아바타 — 사진 또는 이름 첫 글자 */
export function PersonAvatar({ name, photo, size = 40 }: { name?: string | null; photo?: string | null; size?: number }) {
  const initial = (String(name ?? '').trim()[0] ?? '?').toUpperCase();
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photo} alt="" style={avatarSize(size)} className="rounded-full object-cover bg-gray-200 shrink-0" loading="lazy" />
    );
  }
  return (
    <div
      style={{ ...avatarSize(size), fontSize: Math.round(size * 0.42) }}
      className="rounded-full bg-slate-300 text-white font-semibold flex items-center justify-center shrink-0 select-none"
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

/** 방 아바타 — 캠프 방은 종류별 색 동그라미 + 아이콘, DM 은 상대 사진·첫 글자 */
export function RoomAvatar({ type, peerName, peerPhoto, size = 44 }: { type: ChatRoomType; peerName?: string | null; peerPhoto?: string | null; size?: number }) {
  if (type === 'dm') return <PersonAvatar name={peerName} photo={peerPhoto} size={size} />;
  const st = ROOM_STYLE[type];
  const iconSize = Math.round(size * 0.48);
  return (
    <div style={avatarSize(size)} className={`${st.bg} rounded-full text-white flex items-center justify-center shrink-0`} aria-hidden="true">
      {st.icon === 'all' ? <FiUsers size={iconSize} /> : st.icon === 'mentor' ? <HiOutlineAcademicCap size={iconSize} /> : <FiGlobe size={iconSize} />}
    </div>
  );
}

/** 빨간 안 읽은 수 배지 */
export function UnreadBadge({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold leading-none ${className}`}>
      {text}
    </span>
  );
}
