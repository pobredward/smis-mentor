/**
 * 통화 화면 조각 (앱) — web components/chat/ChatCall.tsx 와 같은 구성
 * - CallScreen: 전체 화면 (거는 중 · 받는 중 · 연결 중 · 통화 중 · 끝남) — Android 뒤로가기 = 작게 보기
 * - CallTile: 사람 칸 — 카메라 켬이면 Agora 영상(RtcSurfaceView), 끔이면 둥근 사진/첫 글자
 * - CallBar: 작게 보기 — 떠 있는 초록 알약 '📞 03:12 / J29 전체방' (누르면 다시 크게, 끌어서 옮기면 좌우 가장자리에 붙음)
 * - CallBanner: 방 위 '그룹 음성 통화 중 · 3명' [참여] / [통화로 돌아가기]
 * - CallStartOptions: 방 머리글 📞 → [음성 통화] [영상 통화]
 */
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext, initialWindowMetrics } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { loadAgora } from '../../../services/agoraNative';
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
  type Locale,
} from '@smis-mentor/shared';
import type { ChatCallView } from '../../../services/chatCalls';
import { initialColor } from '../chatTheme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
const initialOf = (name?: string) => (String(name ?? '').trim()[0] ?? '?').toUpperCase();

/** 안전 영역 — 통화 화면은 내비게이터 밖(App)에 있어서 SafeAreaProvider 가 없을 수 있다 */
const ZERO = { top: 0, bottom: 0, left: 0, right: 0 };
function useInsets() {
  return useContext(SafeAreaInsetsContext) ?? initialWindowMetrics?.insets ?? ZERO;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function BigAvatar({ name, photo, size = 112 }: { name?: string; photo?: string; size?: number }) {
  if (photo) return <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: initialColor(name ?? '?') }]}>
      <Text style={{ color: '#fff', fontSize: Math.round(size * 0.4), fontWeight: '600' }}>{initialOf(name)}</Text>
    </View>
  );
}

/** 사람 칸 */
export function CallTile({ p, video, real, frontCamera, compact, style }: {
  p: ChatCallParticipant;
  video: boolean;
  /** 실제 연결 (영상을 그린다) — 가짜 연결이면 자리표시 */
  real: boolean;
  frontCamera?: boolean;
  compact?: boolean;
  style?: object;
}) {
  const poor = p.connection === 'poor' || p.connection === 'reconnecting';
  // 실제 연결일 때만 Agora 를 불러온다 (가짜 연결 · Expo Go 에서는 자리표시만)
  const agora = real && video && p.agoraUid != null ? loadAgora() : null;
  return (
    <View style={[styles.tile, p.speaking && styles.tileSpeaking, style]} accessibilityLabel={p.isMe ? L('chat.callYou') : p.name}>
      {video ? (
        agora && p.agoraUid != null ? (
          <agora.RtcSurfaceView
            style={StyleSheet.absoluteFill}
            zOrderMediaOverlay={!!compact}
            canvas={{
              uid: p.isMe ? 0 : p.agoraUid,
              renderMode: agora.RenderModeType.RenderModeHidden,
              mirrorMode: p.isMe && frontCamera ? agora.VideoMirrorModeType.VideoMirrorModeEnabled : agora.VideoMirrorModeType.VideoMirrorModeAuto,
            }}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: initialColor(p.name) }]}>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: compact ? 24 : 44, fontWeight: '600' }}>{initialOf(p.name)}</Text>
          </View>
        )
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <BigAvatar name={p.name} photo={p.photo} size={compact ? 40 : 72} />
        </View>
      )}
      <View style={[styles.tileFoot, compact && styles.tileFootCompact]}>
        {!p.micOn ? <Ionicons name="mic-off" size={compact ? 11 : 14} color="#fca5a5" /> : null}
        <Text style={[styles.tileName, compact && { fontSize: 11 }]} numberOfLines={1}>{p.isMe ? L('chat.callYou') : p.name}</Text>
        {poor ? <Ionicons name="cellular-outline" size={compact ? 11 : 14} color="#fcd34d" accessibilityLabel={L('chat.callPoor')} /> : null}
      </View>
    </View>
  );
}

function Ctrl({ label, icon, onPress, active = true, danger, accept }: { label: string; icon: IoniconName; onPress: () => void; active?: boolean; danger?: boolean; accept?: boolean }) {
  return (
    <View style={styles.ctrl}>
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.ctrlBtn, danger ? styles.ctrlDanger : accept ? styles.ctrlAccept : active ? styles.ctrlOn : styles.ctrlOff]}
      >
        <Ionicons name={icon} size={26} color={!danger && !accept && !active ? '#111827' : '#ffffff'} />
      </TouchableOpacity>
      <Text style={styles.ctrlLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export interface CallScreenProps {
  state: ChatCallView;
  title: string;
  lang: Locale;
  real: boolean;
  /** OS 수신 화면이 벨을 맡으면 받는 중 화면은 그리지 않는다 */
  hideIncoming?: boolean;
  onMinimize: () => void;
  onLeave: () => void;
  onAccept: (media?: ChatCallMedia) => void;
  onDecline: () => void;
  onMic: (on: boolean) => void;
  onCamera: (on: boolean) => void;
  onSwitchCamera: () => void;
  onSpeaker: (on: boolean) => void;
}

/** 통화 화면 (전체 화면) */
export function CallScreen({ state, title, lang, real, hideIncoming, onMinimize, onLeave, onAccept, onDecline, onMic, onCamera, onSwitchCamera, onSpeaker }: CallScreenProps) {
  const insets = useInsets();
  const { width, height } = useWindowDimensions();
  const now = useNow(state.phase === 'inCall');
  const direct = !!state.direct;
  const video = state.media === 'video';
  const tiles = useMemo(() => orderCallTiles(state.participants), [state.participants]);
  const mediaLabel = callMediaLabel(state.media, direct, lang);
  const visible = state.phase !== 'idle' && !state.minimized && !(hideIncoming && state.phase === 'incoming');

  const peerBlock = (sub: string) => (
    <View style={[styles.center, { gap: 12, paddingHorizontal: 24 }]}>
      <BigAvatar name={state.peer?.name} photo={state.peer?.photo} />
      <Text style={styles.peerName} numberOfLines={1}>{state.peer?.name ?? title}</Text>
      <Text style={styles.sub}>{sub}</Text>
    </View>
  );
  const hangUp = <Ctrl label={direct ? L('chat.callHangUp') : L('chat.callLeave')} icon="call" onPress={onLeave} danger />;

  let body: React.ReactNode = null;
  let controls: React.ReactNode = null;
  if (state.phase === 'outgoing') {
    body = peerBlock(L('chat.callRinging'));
    controls = <Ctrl label={L('chat.callHangUp')} icon="call" onPress={onLeave} danger />;
  } else if (state.phase === 'incoming') {
    body = peerBlock(L('chat.callIncoming', { media: callMediaLabel(state.media, true, lang) }));
    controls = (
      <>
        <Ctrl label={L('chat.callDecline')} icon="call" onPress={onDecline} danger />
        {video ? <Ctrl label={L('chat.callAcceptVoice')} icon="call-outline" onPress={() => onAccept('voice')} /> : null}
        <Ctrl label={L('chat.callAccept')} icon={video ? 'videocam' : 'call'} onPress={() => onAccept()} accept />
      </>
    );
  } else if (state.phase === 'connecting') {
    body = (
      <View style={[styles.center, { gap: 16 }]}>
        <Text style={styles.peerName}>{title}</Text>
        <ActivityIndicator color="#ffffff" size="large" />
        <Text style={styles.sub}>{L('chat.callConnecting')}</Text>
      </View>
    );
    controls = hangUp;
  } else if (state.phase === 'ended') {
    const reason = state.endedReason === 'declined' ? L('chat.callDeclined')
      : state.endedReason === 'rejected' ? L('chat.callDeclinedByPeer')
        : state.endedReason === 'missed' ? L('chat.callMissed')
          : state.endedReason === 'busy' ? L('chat.callBusy')
            : state.endedReason === 'failed' ? L('chat.callFailed')
              : L('chat.callEnded');
    body = (
      <View style={[styles.center, { gap: 8 }]}>
        <Ionicons name="call" size={36} color="rgba(255,255,255,0.7)" style={{ transform: [{ rotate: '135deg' }] }} />
        <Text style={styles.endedText}>{reason}</Text>
        {state.startedAt ? <Text style={styles.sub}>{formatCallDuration((state.endedAt ?? Date.now()) - state.startedAt)}</Text> : null}
      </View>
    );
  } else if (state.phase === 'inCall') {
    const videoIds = new Set(tiles.filter((p) => video && p.camOn).slice(0, CHAT_CALL_LIMITS.videoTilesMax).map((p) => p.uid));
    const shown = tiles.map((p) => ({ p, v: videoIds.has(p.uid) }));
    const me = shown.find((x) => x.p.isMe);
    const pip = direct && video && shown.length === 2 && me;
    if (pip) {
      const other = shown.find((x) => !x.p.isMe)!;
      body = (
        <View style={{ flex: 1, alignSelf: 'stretch' }}>
          <CallTile p={other.p} video={other.v} real={real} style={[StyleSheet.absoluteFill, { borderRadius: 0 }]} />
          <CallTile p={me.p} video={me.v} real={real} frontCamera={state.frontCamera} compact style={styles.pip} />
        </View>
      );
    } else {
      const wide = width >= 700;
      const cols = callGridColumns(shown.length, wide);
      const gap = 8;
      const tileW = Math.floor((width - 16 - gap * (cols - 1)) / cols);
      const rows = Math.ceil(shown.length / cols);
      const areaH = height - insets.top - insets.bottom - 64 - 120;
      const tileH = Math.max(140, Math.floor((areaH - gap * (rows - 1)) / rows));
      body = (
        <ScrollView style={{ alignSelf: 'stretch' }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap, paddingHorizontal: 8 }}>
          {shown.map(({ p, v }) => (
            <CallTile key={p.uid} p={p} video={v} real={real} frontCamera={state.frontCamera} style={{ width: tileW, height: tileH }} />
          ))}
        </ScrollView>
      );
    }
    controls = (
      <>
        <Ctrl label={state.micOn ? L('chat.callMic') : L('chat.callMicOff')} icon={state.micOn ? 'mic' : 'mic-off'} onPress={() => onMic(!state.micOn)} active={state.micOn} />
        {video ? <Ctrl label={state.camOn ? L('chat.callCamera') : L('chat.callCameraOff')} icon={state.camOn ? 'videocam' : 'videocam-off'} onPress={() => onCamera(!state.camOn)} active={state.camOn} /> : null}
        {video && state.camOn ? <Ctrl label={L('chat.callSwitchCamera')} icon="camera-reverse" onPress={onSwitchCamera} /> : null}
        <Ctrl label={L('chat.callSpeaker')} icon={state.speakerOn ? 'volume-high' : 'volume-low'} onPress={() => onSpeaker(!state.speakerOn)} active={state.speakerOn} />
        {hangUp}
      </>
    );
  }

  const showTop = state.phase === 'inCall' || state.phase === 'connecting' || state.phase === 'outgoing';
  const dark = video || state.phase === 'inCall';
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={() => (showTop ? onMinimize() : undefined)}>
      <View style={[styles.screen, { backgroundColor: dark ? '#030712' : '#1e293b', paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.top}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {state.phase === 'inCall' ? (
              <>
                <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
                <Text style={styles.topSub} numberOfLines={1}>
                  {mediaLabel} · {formatCallDuration(now - (state.startedAt ?? now))} · {L('chat.callParticipants', { n: state.participants.length })}
                </Text>
              </>
            ) : (
              <Text style={styles.topSub} numberOfLines={1}>{mediaLabel}</Text>
            )}
            {state.mock ? <Text style={styles.mock} numberOfLines={1}>{L('chat.callPreviewNote')}</Text> : null}
          </View>
          {showTop ? (
            <TouchableOpacity onPress={onMinimize} style={styles.minBtn} accessibilityLabel={L('chat.callMinimize')} hitSlop={8}>
              <Ionicons name="contract" size={20} color="#ffffff" />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={[styles.body, styles.center]}>{body}</View>
        {controls ? <View style={styles.controls}>{controls}</View> : null}
      </View>
    </Modal>
  );
}

/**
 * 작게 보기 — 떠 있는 초록 알약 (웹과 같은 방식).
 * 화면 위 막대는 머리글·뒤로가기를 가려서, 작은 알약을 오른쪽 가장자리(머리글 아래)에 띄운다.
 * 누르면 다시 크게, 끌어서 옮기면 가까운 좌우 가장자리에 붙고 그 자리를 이번 실행 동안 기억한다.
 */
const PILL_MARGIN = 10;
let pillSpot: { side: 'left' | 'right'; y: number } | null = null;

export function CallBar({ state, title, lang, onReturn }: { state: ChatCallView; title: string; lang: Locale; onReturn: () => void }) {
  const insets = useInsets();
  const { width, height } = useWindowDimensions();
  const now = useNow(state.phase === 'inCall');
  const status = state.phase === 'inCall'
    ? formatCallDuration(now - (state.startedAt ?? now))
    : state.phase === 'incoming'
      ? L('chat.callIncoming', { media: callMediaLabel(state.media, true, lang) })
      : state.phase === 'outgoing' ? L('chat.callRinging') : L('chat.callConnecting');
  const speaking = state.phase === 'inCall' && state.participants.some((p) => p.speaking);

  const [size, setSize] = useState({ w: 150, h: 48 });
  const box = useRef({ minX: 0, maxX: 0, minY: 0, maxY: 0, w: 150 });
  box.current = {
    minX: insets.left + PILL_MARGIN,
    maxX: Math.max(insets.left + PILL_MARGIN, width - insets.right - PILL_MARGIN - size.w),
    minY: insets.top + PILL_MARGIN,
    maxY: Math.max(insets.top + PILL_MARGIN, height - insets.bottom - PILL_MARGIN - size.h - 64),
    w: size.w,
  };
  const clampY = (y: number) => Math.min(box.current.maxY, Math.max(box.current.minY, y));
  const spotXY = (spot: { side: 'left' | 'right'; y: number }) => ({
    x: spot.side === 'left' ? box.current.minX : box.current.maxX,
    y: clampY(spot.y),
  });
  // 처음 자리: 오른쪽, 머리글(약 56) 아래
  const spot = useRef(pillSpot ?? { side: 'right' as const, y: insets.top + 64 });
  const pos = useRef(new Animated.ValueXY(spotXY(spot.current))).current;
  const cur = useRef(spotXY(spot.current));
  const drag = useRef({ x: 0, y: 0, moved: false });
  const returnRef = useRef(onReturn);
  returnRef.current = onReturn;

  // 화면 크기 · 알약 크기가 바뀌면 (회전 · 글자 길이) 같은 가장자리로 다시
  useEffect(() => {
    const xy = spotXY(spot.current);
    cur.current = xy;
    pos.setValue(xy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, size.w, size.h, insets.top, insets.bottom, insets.left, insets.right]);

  const pan = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        drag.current = { x: cur.current.x, y: cur.current.y, moved: false };
      },
      onPanResponderMove: (_, g) => {
        if (Math.abs(g.dx) + Math.abs(g.dy) > 4) drag.current.moved = true;
        if (drag.current.moved) pos.setValue({ x: drag.current.x + g.dx, y: drag.current.y + g.dy });
      },
      onPanResponderRelease: (_, g) => {
        if (!drag.current.moved) {
          returnRef.current();
          return;
        }
        const x = drag.current.x + g.dx;
        const next = { side: (x + box.current.w / 2 < width / 2 ? 'left' : 'right') as 'left' | 'right', y: drag.current.y + g.dy };
        spot.current = next;
        pillSpot = { side: next.side, y: clampY(next.y) };
        const xy = spotXY(next);
        cur.current = xy;
        Animated.spring(pos, { toValue: xy, useNativeDriver: false, friction: 7, tension: 60 }).start();
      },
      onPanResponderTerminate: () => {
        const xy = spotXY(spot.current);
        cur.current = xy;
        Animated.spring(pos, { toValue: xy, useNativeDriver: false }).start();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, pos],
  );

  return (
    <Animated.View
      {...pan.panHandlers}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        if (Math.abs(w - size.w) > 0.5 || Math.abs(h - size.h) > 0.5) setSize({ w, h });
      }}
      style={[styles.pill, { transform: pos.getTranslateTransform() }]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${title} — ${L('chat.callReturn')}`}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate') onReturn();
      }}
    >
      <View style={styles.pillIcon}>
        <Ionicons name={state.media === 'video' ? 'videocam' : 'call'} size={15} color="#ffffff" />
        {speaking ? <View style={styles.pillSpeaking} /> : null}
      </View>
      <View style={styles.pillTextWrap}>
        <Text style={styles.pillStatus} numberOfLines={1}>{status}</Text>
        {title ? <Text style={styles.pillTitle} numberOfLines={1}>{title}</Text> : null}
      </View>
    </Animated.View>
  );
}

/** 방 위 통화 띠 — 진행 중인 통화 (room.activeCall) */
export function CallBanner({ info, direct, lang, inThisCall, onJoin, onReturn }: { info: ChatCallInfo; direct: boolean; lang: Locale; inThisCall: boolean; onJoin: (media: ChatCallMedia) => void; onReturn: () => void }) {
  return (
    <View style={styles.banner}>
      <View style={styles.bannerIcon}>
        <Ionicons name={info.media === 'video' ? 'videocam' : 'call'} size={14} color="#ffffff" />
      </View>
      <Text style={styles.bannerText} numberOfLines={1}>{L('chat.callOngoing', { media: callMediaLabel(info.media, direct, lang), n: info.participantIds.length })}</Text>
      {inThisCall ? (
        <TouchableOpacity onPress={onReturn} style={styles.bannerBtn}>
          <Text style={styles.bannerBtnText}>{L('chat.callReturn')}</Text>
        </TouchableOpacity>
      ) : (
        <>
          <TouchableOpacity onPress={() => onJoin('voice')} style={styles.bannerBtn} accessibilityLabel={L('chat.callJoinVoice')}>
            <Ionicons name="call" size={13} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onJoin('video')} style={styles.bannerBtn} accessibilityLabel={L('chat.callJoinVideo')}>
            <Ionicons name="videocam" size={13} color="#ffffff" />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

/** 방 머리글 📞 → [음성 통화] [영상 통화] (ChatSheet 안) */
export function CallStartOptions({ direct, lang, mock, busy, onStart }: { direct: boolean; lang: Locale; mock: boolean; busy: boolean; onStart: (media: ChatCallMedia) => void }) {
  const opt = (media: ChatCallMedia) => (
    <TouchableOpacity onPress={() => onStart(media)} disabled={busy} style={[styles.startOpt, busy && { opacity: 0.4 }]} accessibilityRole="button">
      <View style={[styles.startIcon, { backgroundColor: media === 'video' ? '#3b82f6' : '#22c55e' }]}>
        <Ionicons name={media === 'video' ? 'videocam' : 'call'} size={22} color="#ffffff" />
      </View>
      <Text style={styles.startLabel}>{callMediaLabel(media, direct, lang)}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {opt('voice')}
        {opt('video')}
      </View>
      {busy ? <Text style={styles.startNote}>{L('chat.callAlreadyInCall')}</Text> : null}
      {mock ? <Text style={[styles.startNote, { color: '#64748b' }]}>{L('chat.callPreviewNote')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 64, gap: 8 },
  topTitle: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  topSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, fontVariant: ['tabular-nums'] },
  mock: { color: '#fde68a', fontSize: 11, marginTop: 2 },
  minBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingVertical: 8 },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 18, paddingHorizontal: 12, paddingTop: 12 },
  ctrl: { alignItems: 'center', gap: 6, width: 64 },
  ctrlBtn: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  ctrlOn: { backgroundColor: 'rgba(255,255,255,0.16)' },
  ctrlOff: { backgroundColor: '#ffffff' },
  ctrlDanger: { backgroundColor: '#ef4444', transform: [{ rotate: '135deg' }] },
  ctrlAccept: { backgroundColor: '#22c55e' },
  ctrlLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11 },
  peerName: { color: '#ffffff', fontSize: 24, fontWeight: '600' },
  sub: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontVariant: ['tabular-nums'] },
  endedText: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  tile: { overflow: 'hidden', borderRadius: 16, backgroundColor: '#1f2937', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  tileSpeaking: { borderWidth: 3, borderColor: '#4ade80' },
  tileFoot: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.35)' },
  tileFootCompact: { paddingHorizontal: 6, paddingVertical: 4 },
  tileName: { flex: 1, color: '#ffffff', fontSize: 13.5, fontWeight: '500' },
  pip: { position: 'absolute', right: 12, bottom: 12, width: 110, height: 160 },
  pill: {
    position: 'absolute', top: 0, left: 0, zIndex: 60, flexDirection: 'row', alignItems: 'center', gap: 8,
    maxWidth: 200, paddingVertical: 6, paddingLeft: 6, paddingRight: 14, borderRadius: 26, backgroundColor: '#16a34a',
    shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 8,
  },
  pillIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  pillSpeaking: { position: 'absolute', top: -1, right: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: '#bef264', borderWidth: 2, borderColor: '#16a34a' },
  pillTextWrap: { flexShrink: 1, minWidth: 0 },
  pillStatus: { color: '#ffffff', fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pillTitle: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#f0fdf4', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#bbf7d0' },
  bannerIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#22c55e', alignItems: 'center', justifyContent: 'center' },
  bannerText: { flex: 1, color: '#14532d', fontSize: 13.5, fontWeight: '500' },
  bannerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#16a34a', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  bannerBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  startOpt: { flex: 1, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, paddingVertical: 16 },
  startIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  startLabel: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  startNote: { textAlign: 'center', fontSize: 13, color: '#ef4444' },
});
