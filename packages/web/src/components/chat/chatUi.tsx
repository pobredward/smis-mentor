/**
 * 채팅 화면(web) 작은 도우미 — 시각 · 글 속 링크 · 동영상 길이 · 자리 이름 · 아바타
 */
import { Fragment, type ReactNode } from 'react';
import { FiBriefcase, FiGlobe, FiUsers } from 'react-icons/fi';
import { HiOutlineAcademicCap } from 'react-icons/hi2';
import {
  L,
  chatGroupLabel,
  chatTimeLabel,
  mentionParts,
  splitByQuery,
  type ChatMemberInfo,
  type ChatMemberKind,
  type ChatRoomType,
  type Locale,
} from '@smis-mentor/shared';

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

/** 짧은 날짜·시각 — "10월 5일 오후 3:00" / "Oct 5, 3:00 PM" */
export function shortDateTime(d: Date, lang: Locale): string {
  const day = lang === 'en' ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return lang === 'en' ? `${day}, ${chatTimeLabel(d, lang)}` : `${day} ${chatTimeLabel(d, lang)}`;
}

/** 달 머리글 — "2026년 10월" / "October 2026" */
export const monthLabel = (d: Date, lang: Locale): string =>
  d.toLocaleDateString(lang === 'en' ? 'en-US' : 'ko-KR', { year: 'numeric', month: 'long' });

/** 검색어 자리를 노란 형광펜으로 */
function marked(text: string, highlight?: { query: string; markClass: string }): ReactNode {
  if (!highlight?.query) return text;
  const parts = splitByQuery(text, highlight.query);
  if (!parts.some((p) => p.hit)) return text;
  return parts.map((p, i) => (p.hit ? <mark key={i} className={highlight.markClass}>{p.text}</mark> : <Fragment key={i}>{p.text}</Fragment>));
}

export interface RichTextOptions {
  linkClass: string;
  /** 검색어 표시 */
  highlight?: { query: string; markClass: string };
  /** @멘션 표시 — 방 사람 이름으로 찾는다 */
  mentions?: { memberInfo: Record<string, ChatMemberInfo>; myUid: string; className: string; meClassName: string };
}

/** 글 한 조각 — @멘션 자리를 굵게 (나를 부른 것은 더 진하게), 그 안에서도 검색어 표시 */
function mentioned(text: string, opts: RichTextOptions): ReactNode {
  if (!opts.mentions || !text.includes('@')) return marked(text, opts.highlight);
  const parts = mentionParts(text, { memberInfo: opts.mentions.memberInfo });
  if (!parts.some((p) => p.mention)) return marked(text, opts.highlight);
  const me = opts.mentions.myUid;
  return parts.map((p, i) =>
    p.mention ? (
      <span key={i} className={p.mention === me || p.mention === 'all' ? opts.mentions!.meClassName : opts.mentions!.className}>
        {marked(p.text, opts.highlight)}
      </span>
    ) : (
      <Fragment key={i}>{marked(p.text, opts.highlight)}</Fragment>
    ),
  );
}

/** 말풍선 글 — 링크 · @멘션 · 검색어 (줄바꿈은 whitespace-pre-wrap 이 유지) */
export function richText(text: string, opts: RichTextOptions): ReactNode {
  const parts = text.split(URL_RE);
  if (parts.length === 1) return mentioned(text, opts);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <a key={i} href={p} target="_blank" rel="noopener noreferrer" className={opts.linkClass} onClick={(e) => e.stopPropagation()}>
        {marked(p, opts.highlight)}
      </a>
    ) : (
      <Fragment key={i}>{mentioned(p, opts)}</Fragment>
    ),
  );
}

/** 캠프 방 종류별 색 · 아이콘 (그룹방은 주황 동그라미 + 그룹 첫 글자) */
const ROOM_STYLE: Record<Exclude<ChatRoomType, 'dm' | 'camp_group'>, { bg: string; icon: 'all' | 'mentor' | 'foreign' | 'manager' }> = {
  camp_all: { bg: 'bg-blue-500', icon: 'all' },
  camp_manager: { bg: 'bg-slate-700', icon: 'manager' },
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

/** 방 아바타 — 캠프 방은 종류별 색 동그라미 + 아이콘, 그룹방은 주황 + 그룹 첫 글자, DM 은 상대 사진·첫 글자 */
export function RoomAvatar({ type, peerName, peerPhoto, groupKey, size = 44 }: { type: ChatRoomType; peerName?: string | null; peerPhoto?: string | null; groupKey?: string | null; size?: number }) {
  if (type === 'dm') return <PersonAvatar name={peerName} photo={peerPhoto} size={size} />;
  if (type === 'camp_group') {
    const letter = (chatGroupLabel(groupKey).trim()[0] ?? 'G').toUpperCase();
    return (
      <div style={{ ...avatarSize(size), fontSize: Math.round(size * 0.42) }} className="bg-orange-500 rounded-full text-white font-bold flex items-center justify-center shrink-0" aria-hidden="true">
        {letter}
      </div>
    );
  }
  const st = ROOM_STYLE[type];
  const iconSize = Math.round(size * 0.48);
  return (
    <div style={avatarSize(size)} className={`${st.bg} rounded-full text-white flex items-center justify-center shrink-0`} aria-hidden="true">
      {st.icon === 'all' ? <FiUsers size={iconSize} /> : st.icon === 'mentor' ? <HiOutlineAcademicCap size={iconSize} /> : st.icon === 'manager' ? <FiBriefcase size={iconSize} /> : <FiGlobe size={iconSize} />}
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
