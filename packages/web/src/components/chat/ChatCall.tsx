'use client';

/**
 * 통화 화면 조각 (화면만 — 상태·동작은 props)
 * - ChatCallScreen: 전체 화면 (거는 중 · 받는 중 · 연결 중 · 통화 중 · 끝남)
 * - ChatCallTile: 사람 칸 — 카메라 켬이면 영상 자리(renderVideo, 지금은 자리표시), 끔이면 둥근 사진/첫 글자
 * - ChatCallPill: 작게 보기 (오른쪽 아래 떠 있는 알약)
 * - ChatCallStartSheet: 방 머리글 📞 → 음성/영상 통화 고르기
 * - ChatCallBanner: 방 위 '그룹 음성 통화 중 · 3명' [참여 ▾] / [통화로 돌아가기]
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  FiChevronDown,
  FiMic,
  FiMicOff,
  FiMinimize2,
  FiPhone,
  FiPhoneCall,
  FiPhoneOff,
  FiVideo,
  FiVideoOff,
  FiWifiOff,
} from 'react-icons/fi';
import {
  CHAT_CALL_LIMITS,
  L,
  callGridColumns,
  callMediaLabel,
  formatCallDuration,
  orderCallTiles,
  type ChatCallInfo,
  type ChatCallMedia,
  type ChatCallParticipant,
  type ChatCallState,
  type Locale,
} from '@smis-mentor/shared';
import { ChatActionMenu, ChatDialog, type ChatMenuAnchor } from './ChatMenus';

/** 화면용 통화 상태 — 끝난 시각을 붙인다 (끝난 화면에 통화 시간) */
export type ChatCallView = ChatCallState & { endedAt?: number };

/** 통화 중인가 (거는 중 · 받는 중 · 연결 중 포함) */
export const isCallActive = (s: Pick<ChatCallState, 'phase'>) => s.phase !== 'idle' && s.phase !== 'ended';

/** 영상 자리 — 나중에 Agora 영상 트랙을 그린다 (없으면 자리표시) */
export type RenderCallVideo = (uid: string, isMe: boolean) => ReactNode;

const TILE_COLORS = ['from-sky-600 to-indigo-700', 'from-emerald-600 to-teal-700', 'from-rose-500 to-pink-700', 'from-amber-500 to-orange-700', 'from-violet-600 to-purple-800', 'from-cyan-600 to-blue-800'];
const colorOf = (key: string) => TILE_COLORS[[...key].reduce((s, c) => s + c.charCodeAt(0), 0) % TILE_COLORS.length];
const initialOf = (name?: string) => (String(name ?? '').trim()[0] ?? '?').toUpperCase();

/** 1초마다 지금 시각 (통화 시간) */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** 넓은 화면인가 (칸 나누기) */
function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

function BigAvatar({ name, photo, size = 112 }: { name?: string; photo?: string; size?: number }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" style={{ width: size, height: size }} className="rounded-full object-cover ring-4 ring-white/20" />;
  }
  return (
    <div style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} className={`rounded-full bg-gradient-to-br ${colorOf(name ?? '?')} text-white font-semibold flex items-center justify-center ring-4 ring-white/20`}>
      {initialOf(name)}
    </div>
  );
}

/** 사람 칸 */
export function ChatCallTile({ p, video, renderVideo, compact, className = '' }: {
  p: ChatCallParticipant;
  /** 영상으로 보여 줄까 (카메라 켬 + 영상 칸 수 안) */
  video: boolean;
  renderVideo?: RenderCallVideo;
  /** 작은 창 (1:1 영상의 나) */
  compact?: boolean;
  className?: string;
}) {
  const poor = p.connection === 'poor' || p.connection === 'reconnecting';
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gray-800 ${p.speaking ? 'ring-[3px] ring-green-400' : 'ring-1 ring-white/10'} ${className}`}
      aria-label={p.isMe ? L('chat.callYou') : p.name}
    >
      {video ? (
        renderVideo?.(p.uid, !!p.isMe) ?? (
          // 영상 자리표시 — Agora 를 붙이면 renderVideo 가 실제 영상을 그린다
          <div className={`absolute inset-0 bg-gradient-to-br ${colorOf(p.name)} flex items-center justify-center`}>
            <span className={`${compact ? 'text-2xl' : 'text-5xl'} font-semibold text-white/85`}>{initialOf(p.name)}</span>
            <FiVideo className="absolute right-2 top-2 text-white/60" size={compact ? 12 : 16} />
          </div>
        )
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <BigAvatar name={p.name} photo={p.photo} size={compact ? 40 : 72} />
        </div>
      )}
      <div className={`absolute left-0 right-0 bottom-0 flex items-center gap-1.5 ${compact ? 'px-1.5 py-1' : 'px-2.5 py-2'} bg-gradient-to-t from-black/60 to-transparent text-white`}>
        {!p.micOn && <FiMicOff size={compact ? 11 : 14} className="shrink-0 text-red-300" aria-label={L('chat.callMicOff')} />}
        <span className={`min-w-0 truncate ${compact ? 'text-[11px]' : 'text-sm'} font-medium`}>{p.isMe ? L('chat.callYou') : p.name}</span>
        {poor && (
          <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-amber-300" title={p.connection === 'reconnecting' ? L('chat.callReconnecting') : L('chat.callPoor')}>
            <FiWifiOff size={compact ? 11 : 14} aria-label={L('chat.callPoor')} />
            {!compact && <span className="text-[11px]">{p.connection === 'reconnecting' ? L('chat.callReconnecting') : L('chat.callPoor')}</span>}
          </span>
        )}
      </div>
    </div>
  );
}

function CtrlButton({ label, onClick, active = true, danger, accept, children }: { label: string; onClick: () => void; active?: boolean; danger?: boolean; accept?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={danger || accept ? undefined : !active}
        className={`h-14 w-14 rounded-full flex items-center justify-center transition-colors ${
          danger ? 'bg-red-500 text-white hover:bg-red-600' : accept ? 'bg-green-500 text-white hover:bg-green-600' : active ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-white text-gray-900 hover:bg-gray-100'
        }`}
      >
        {children}
      </button>
      <span className="text-[11px] text-white/80">{label}</span>
    </div>
  );
}

export interface ChatCallScreenProps {
  state: ChatCallView;
  /** 방 이름 (callTitle) */
  title: string;
  lang: Locale;
  /** 넓은 화면 (없으면 화면 폭으로) */
  wide?: boolean;
  renderVideo?: RenderCallVideo;
  onMinimize: () => void;
  onLeave: () => void;
  onAccept: (media?: ChatCallMedia) => void;
  onDecline: () => void;
  onMic: (on: boolean) => void;
  onCamera: (on: boolean) => void;
  /** 미리보기 고정 시각 */
  now?: number;
}

/** 통화 화면 (전체 화면) */
export function ChatCallScreen({ state, title, lang, wide: wideProp, renderVideo, onMinimize, onLeave, onAccept, onDecline, onMic, onCamera, now: nowProp }: ChatCallScreenProps) {
  const liveNow = useNow(state.phase === 'inCall' && nowProp == null);
  const now = nowProp ?? liveNow;
  const autoWide = useWide();
  const wide = wideProp ?? autoWide;
  const direct = !!state.direct;
  const video = state.media === 'video';
  const tiles = useMemo(() => orderCallTiles(state.participants), [state.participants]);
  const mediaLabel = callMediaLabel(state.media, direct, lang);

  const peerBlock = (sub: string) => (
    <div className="flex flex-col items-center text-center gap-3 px-6">
      <BigAvatar name={state.peer?.name} photo={state.peer?.photo} />
      <div className="text-2xl font-semibold">{state.peer?.name ?? title}</div>
      <div className="text-sm text-white/75">{sub}</div>
    </div>
  );

  let body: ReactNode = null;
  let controls: ReactNode = null;

  if (state.phase === 'outgoing') {
    body = peerBlock(L('chat.callRinging'));
    controls = (
      <CtrlButton label={L('chat.callHangUp')} onClick={onLeave} danger>
        <FiPhoneOff size={22} />
      </CtrlButton>
    );
  } else if (state.phase === 'incoming') {
    body = peerBlock(L('chat.callIncoming', { media: callMediaLabel(state.media, true, lang) }));
    controls = (
      <>
        <CtrlButton label={L('chat.callDecline')} onClick={onDecline} danger>
          <FiPhoneOff size={22} />
        </CtrlButton>
        {video && (
          <CtrlButton label={L('chat.callAcceptVoice')} onClick={() => onAccept('voice')}>
            <FiPhone size={22} />
          </CtrlButton>
        )}
        <CtrlButton label={L('chat.callAccept')} onClick={() => onAccept()} accept>
          {video ? <FiVideo size={22} /> : <FiPhoneCall size={22} />}
        </CtrlButton>
      </>
    );
  } else if (state.phase === 'connecting') {
    body = (
      <div className="flex flex-col items-center gap-4">
        <div className="text-xl font-semibold">{title}</div>
        <span className="h-10 w-10 rounded-full border-[3px] border-white/30 border-t-white animate-spin" />
        <div className="text-sm text-white/75">{L('chat.callConnecting')}</div>
      </div>
    );
    controls = (
      <CtrlButton label={direct ? L('chat.callHangUp') : L('chat.callLeave')} onClick={onLeave} danger>
        <FiPhoneOff size={22} />
      </CtrlButton>
    );
  } else if (state.phase === 'ended') {
    const reason = state.endedReason === 'declined' ? L('chat.callDeclined')
      : state.endedReason === 'rejected' ? L('chat.callDeclinedByPeer')
      : state.endedReason === 'missed' ? L('chat.callMissed')
        : state.endedReason === 'busy' ? L('chat.callBusy')
          : state.endedReason === 'failed' ? L('chat.callFailed')
            : L('chat.callEnded');
    body = (
      <div className="flex flex-col items-center gap-2 text-center">
        <FiPhoneOff size={36} className="text-white/70" />
        <div className="text-lg font-semibold">{reason}</div>
        {state.startedAt && <div className="text-sm text-white/70 tabular-nums">{formatCallDuration((state.endedAt ?? now) - state.startedAt)}</div>}
      </div>
    );
  } else if (state.phase === 'inCall') {
    // 영상 칸은 CHAT_CALL_LIMITS.videoTilesMax 까지 — 넘으면 사진 칸
    const videoIds = new Set(tiles.filter((p) => video && p.camOn).slice(0, CHAT_CALL_LIMITS.videoTilesMax).map((p) => p.uid));
    const shown = tiles.map((p) => ({ p, v: videoIds.has(p.uid) }));
    const overVideo = video && tiles.filter((p) => p.camOn).length > CHAT_CALL_LIMITS.videoTilesMax;
    const me = shown.find((x) => x.p.isMe);
    const pip = direct && video && shown.length === 2 && me;
    if (pip) {
      const other = shown.find((x) => !x.p.isMe)!;
      body = (
        <div className="relative h-full w-full">
          {/* 칸 자체는 relative 라서 위치는 감싸는 div 가 잡는다 */}
          <div className="absolute inset-0">
            <ChatCallTile p={other.p} video={other.v} renderVideo={renderVideo} className="h-full w-full !rounded-none sm:!rounded-2xl" />
          </div>
          <div className="absolute right-3 bottom-3 w-28 h-40 sm:w-40 sm:h-28 shadow-xl rounded-2xl">
            <ChatCallTile p={me.p} video={me.v} renderVideo={renderVideo} compact className="h-full w-full" />
          </div>
        </div>
      );
    } else {
      const cols = callGridColumns(shown.length, wide);
      // 칸이 화면 높이를 나눠 채운다 — 사람이 많아 칸이 너무 작아지면(140px) 안에서 스크롤
      body = (
        <div className="h-full w-full flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div
              className="grid gap-2 h-full"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: 'minmax(140px, 1fr)' }}
            >
              {shown.map(({ p, v }) => (
                <ChatCallTile key={p.uid} p={p} video={v} renderVideo={renderVideo} className="h-full w-full" />
              ))}
            </div>
          </div>
          {overVideo && <p className="mt-2 text-center text-xs text-white/60">{L('chat.callMaxVideo', { n: CHAT_CALL_LIMITS.videoTilesMax })}</p>}
        </div>
      );
    }
    controls = (
      <>
        <CtrlButton label={state.micOn ? L('chat.callMic') : L('chat.callMicOff')} onClick={() => onMic(!state.micOn)} active={state.micOn}>
          {state.micOn ? <FiMic size={22} /> : <FiMicOff size={22} />}
        </CtrlButton>
        {video && (
          <CtrlButton label={state.camOn ? L('chat.callCamera') : L('chat.callCameraOff')} onClick={() => onCamera(!state.camOn)} active={state.camOn}>
            {state.camOn ? <FiVideo size={22} /> : <FiVideoOff size={22} />}
          </CtrlButton>
        )}
        <CtrlButton label={direct ? L('chat.callHangUp') : L('chat.callLeave')} onClick={onLeave} danger>
          <FiPhoneOff size={22} />
        </CtrlButton>
      </>
    );
  }

  const showTop = state.phase === 'inCall' || state.phase === 'connecting' || state.phase === 'outgoing';
  const dark = video || state.phase === 'inCall';

  return (
    <div
      className={`fixed top-0 left-0 right-0 bottom-0 z-[110] flex flex-col text-white ${dark ? 'bg-gray-950' : 'bg-gradient-to-b from-slate-800 to-slate-950'}`}
      role="dialog"
      aria-modal="true"
      aria-label={mediaLabel}
    >
      <div className="flex items-center gap-2 px-3 sm:px-5 h-14 shrink-0 pt-[env(safe-area-inset-top)] box-content">
        <div className="min-w-0 flex-1">
          {state.phase === 'inCall' ? (
            <>
              <div className="text-[15px] font-semibold truncate">{title}</div>
              <div className="text-xs text-white/70 tabular-nums truncate">
                {mediaLabel} · {formatCallDuration(now - (state.startedAt ?? now))} · {L('chat.callParticipants', { n: state.participants.length })}
              </div>
            </>
          ) : (
            <div className="text-sm text-white/80 truncate">{mediaLabel}</div>
          )}
        </div>
        {state.mock && <span className="hidden sm:inline max-w-[50%] truncate rounded-full bg-amber-400/20 px-2.5 py-1 text-[11px] text-amber-200">{L('chat.callPreviewNote')}</span>}
        {showTop && (
          <button
            type="button"
            onClick={onMinimize}
            className="h-10 w-10 shrink-0 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
            aria-label={L('chat.callMinimize')}
            title={`${L('chat.callMinimize')} (Esc)`}
          >
            <FiMinimize2 size={18} />
          </button>
        )}
      </div>
      {state.mock && <p className="sm:hidden px-4 -mt-1 mb-1 text-[11px] text-amber-200/90">{L('chat.callPreviewNote')}</p>}
      <div className="flex-1 min-h-0 flex items-center justify-center px-2 sm:px-6 pb-2">{body}</div>
      {controls && (
        <div className="shrink-0 flex items-start justify-center gap-6 sm:gap-8 px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{controls}</div>
      )}
    </div>
  );
}

/** 작게 보기 — 오른쪽 아래 떠 있는 알약 (누르면 다시 크게) */
export function ChatCallPill({ state, title, lang, onReturn, now: nowProp }: { state: ChatCallView; title: string; lang: Locale; onReturn: () => void; now?: number }) {
  const liveNow = useNow(state.phase === 'inCall' && nowProp == null);
  const now = nowProp ?? liveNow;
  const status = state.phase === 'inCall'
    ? formatCallDuration(now - (state.startedAt ?? now))
    : state.phase === 'incoming'
      ? L('chat.callIncoming', { media: callMediaLabel(state.media, true, lang) })
      : state.phase === 'outgoing'
        ? L('chat.callRinging')
        : L('chat.callConnecting');
  return (
    <button
      type="button"
      onClick={onReturn}
      className="fixed right-3 bottom-24 md:right-6 md:bottom-6 z-[80] inline-flex max-w-[min(92vw,360px)] items-center gap-2.5 rounded-full bg-green-600 py-2 pl-2.5 pr-4 text-white shadow-xl hover:bg-green-700"
      aria-label={L('chat.callReturn')}
      title={L('chat.callReturn')}
    >
      <span className="relative h-8 w-8 shrink-0 rounded-full bg-white/20 flex items-center justify-center">
        {state.media === 'video' ? <FiVideo size={15} /> : <FiPhone size={15} />}
        {state.phase === 'inCall' && state.participants.some((p) => p.speaking) && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-lime-300 ring-2 ring-green-600" />}
      </span>
      <span className="min-w-0 text-left leading-tight">
        <span className="block text-sm font-semibold tabular-nums truncate">{status}</span>
        <span className="block text-[11px] text-white/85 truncate">{title} — {L('chat.callReturn')}</span>
      </span>
    </button>
  );
}

/** 방 머리글 📞 → 음성/영상 통화 고르기 */
export function ChatCallStartSheet({ direct, lang, mock, busy, onStart, onClose }: { direct: boolean; lang: Locale; mock: boolean; busy: boolean; onStart: (media: ChatCallMedia) => void; onClose: () => void }) {
  const opt = (media: ChatCallMedia) => (
    <button
      type="button"
      onClick={() => { onClose(); onStart(media); }}
      disabled={busy}
      className="flex-1 flex flex-col items-center gap-2 rounded-2xl border border-gray-200 px-3 py-4 hover:bg-gray-50 disabled:opacity-40"
    >
      <span className={`h-12 w-12 rounded-full flex items-center justify-center text-white ${media === 'video' ? 'bg-blue-500' : 'bg-green-500'}`}>
        {media === 'video' ? <FiVideo size={22} /> : <FiPhone size={22} />}
      </span>
      <span className="text-sm font-medium text-gray-900">{callMediaLabel(media, direct, lang)}</span>
    </button>
  );
  return (
    <ChatDialog title={L('chat.callStartTitle')} onClose={onClose}>
      <div className="px-4 py-4 space-y-3">
        <div className="flex gap-3">
          {opt('voice')}
          {opt('video')}
        </div>
        {busy && <p className="text-center text-sm text-red-500">{L('chat.callAlreadyInCall')}</p>}
        {mock && <p className="text-center text-xs text-gray-500">{L('chat.callPreviewNote')}</p>}
      </div>
    </ChatDialog>
  );
}

/** 방 위 통화 띠 — 진행 중인 통화 (room.activeCall) */
export function ChatCallBanner({ info, direct, lang, inThisCall, onJoin, onReturn }: { info: ChatCallInfo; direct: boolean; lang: Locale; inThisCall: boolean; onJoin: (media: ChatCallMedia) => void; onReturn: () => void }) {
  const [menu, setMenu] = useState<ChatMenuAnchor | null>(null);
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border-b border-green-100 shrink-0">
      <span className="h-7 w-7 shrink-0 rounded-full bg-green-500 text-white flex items-center justify-center">
        {info.media === 'video' ? <FiVideo size={14} /> : <FiPhone size={14} />}
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium text-green-900 truncate">
        {L('chat.callOngoing', { media: callMediaLabel(info.media, direct, lang), n: info.participantIds.length })}
      </span>
      {inThisCall ? (
        <button type="button" onClick={onReturn} className="shrink-0 rounded-full bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
          {L('chat.callReturn')}
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.right - 180, y: r.bottom + 4, sheet: false });
          }}
          className="shrink-0 inline-flex items-center gap-1 rounded-full bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
          aria-haspopup="menu"
        >
          {L('chat.callJoin')}
          <FiChevronDown size={13} />
        </button>
      )}
      {menu && (
        <ChatActionMenu
          anchor={menu}
          actions={[
            { key: 'voice', label: L('chat.callJoinVoice'), icon: <FiPhone size={16} />, onSelect: () => onJoin('voice') },
            { key: 'video', label: L('chat.callJoinVideo'), icon: <FiVideo size={16} />, onSelect: () => onJoin('video') },
          ]}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
