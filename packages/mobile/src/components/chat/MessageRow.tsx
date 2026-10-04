/**
 * 대화방 한 줄 — 날짜 구분선 · (남) 사진·이름 · 말풍선 · 안 읽은 사람 수 · 시각 · 공감 칩
 * 글(답장 인용 · @멘션 · 링크) · 사진 묶음 · 음성 · 투표 · 공지 알림(가운데 알약) · '여기까지 읽었습니다' 줄.
 * 보내는 중인 사진 묶음·음성 · 보내지 못한 글(보낼 편지함)도 같은 모양으로 그린다.
 * 말풍선을 오른쪽으로 밀면 답장.
 */
import React, { memo, useRef } from 'react';
import { View, Text, Pressable, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import {
  L,
  callLogText,
  isMissedCallLog,
  chatDayLabel,
  chatTimeLabel,
  type ChatMemberInfo,
  type ChatMessageView,
  type ChatRoom,
  type ChatRowLayout,
  type Locale,
} from '@smis-mentor/shared';
import type { ChatOutboxItem } from '../../hooks/useChatOutbox';
import { messageMillis } from '../../hooks/useChatMessages';
import { PersonAvatar } from './ChatAvatar';
import { LinkedText } from './LinkedText';
import { MediaBundle, cellsOfMedia, type BundleCell } from './MediaBundle';
import { ReplyQuote } from './ReplyQuote';
import { ReactionChips } from './ChatReactions';
import { VoiceBubble } from './VoiceBubble';
import { PollBubble } from './PollBubble';
import { CHAT_COLORS } from './chatTheme';

/** firstInRun: 다른 사람·다른 날 다음의 첫 말풍선 (위 간격을 넓힌다) */
export type ChatRow =
  | { type: 'message'; key: string; message: ChatMessageView; layout: ChatRowLayout; firstInRun: boolean }
  | { type: 'outbox'; key: string; item: ChatOutboxItem; layout: ChatRowLayout; firstInRun: boolean }
  /** '여기까지 읽었습니다' */
  | { type: 'divider'; key: string };

/** 말풍선 동작 — 화면이 한 번 만들어 넘긴다 (바뀌지 않게) */
export interface MessageRowActions {
  onReveal: (messageId: string) => void;
  onLongPress: (message: ChatMessageView) => void;
  onOpenMedia: (message: ChatMessageView, index: number) => void;
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
  /** 답장 인용 · 공지 알림을 누르면 그 메시지로 */
  onJumpTo: (messageId: string) => void;
  onShowReactions: (message: ChatMessageView) => void;
  onReply: (message: ChatMessageView) => void;
  onVote: (message: ChatMessageView, optionIds: string[]) => Promise<void>;
  onClosePoll: (message: ChatMessageView) => void;
  onShowVoters: (message: ChatMessageView, optionId: string) => void;
}

interface MessageRowProps {
  row: ChatRow;
  lang: Locale;
  myUid: string;
  /** 멘션 · 답장 이름 (방 memberInfo) */
  room: Pick<ChatRoom, 'memberInfo' | 'type'> | null;
  /** 보낸 사람 (방의 memberInfo) */
  sender?: ChatMemberInfo;
  /** 안 읽은 사람 수 — null/0 이면 숨김 */
  unread: number | null;
  /** 차단한 사람의 메시지 */
  blocked: boolean;
  /** 차단 메시지를 [보기]로 펼쳤는가 */
  revealed: boolean;
  bubbleMaxWidth: number;
  /** 대화 내용 검색어 — 글에서 그 자리를 노란색으로 */
  highlight?: string;
  /** 검색 결과 · 답장 원문으로 이동한 메시지 — 잠깐 줄 전체를 밝힌다 */
  flash?: boolean;
  actions: MessageRowActions;
}

function DaySeparator({ date, lang }: { date: Date; lang: Locale }) {
  return (
    <View style={styles.dayWrap}>
      <View style={styles.dayPill}>
        <Ionicons name="calendar-outline" size={12} color="#ffffff" />
        <Text style={styles.dayText}>{chatDayLabel(date, lang)}</Text>
      </View>
    </View>
  );
}

function Meta({
  mine,
  unread,
  time,
  pending,
  failed,
  edited,
  silent,
}: {
  mine: boolean;
  unread: number | null;
  time: string;
  pending?: boolean;
  failed?: boolean;
  edited?: boolean;
  silent?: boolean;
}) {
  return (
    <View style={[styles.meta, mine ? styles.metaMine : styles.metaOther]}>
      {unread ? <Text style={styles.unread}>{unread}</Text> : null}
      {edited || silent ? (
        <View style={[styles.metaFlags, mine ? styles.metaFlagsMine : null]}>
          {silent ? <Ionicons name="notifications-off" size={10} color={CHAT_COLORS.muted} /> : null}
          {edited ? <Text style={styles.edited}>{L('chat.edited')}</Text> : null}
        </View>
      ) : null}
      {failed ? (
        <Ionicons name="alert-circle" size={16} color={CHAT_COLORS.danger} />
      ) : pending ? (
        <Ionicons name="time-outline" size={13} color={CHAT_COLORS.sub} />
      ) : time ? (
        <Text style={styles.time}>{time}</Text>
      ) : null}
    </View>
  );
}

/**
 * 왼쪽으로 밀면 답장 — 오른쪽으로 미는 건 뒤로가기(채팅 목록)에 양보한다.
 * dragOffsetFromLeftEdge 를 크게 두어 오른쪽으로 미는 손가락은 아예 잡지 않는다 (iOS 화면 전체 뒤로가기 제스처가 받는다).
 */
function SwipeReply({ enabled, onReply, children }: { enabled: boolean; onReply: () => void; children: React.ReactNode }) {
  const ref = useRef<SwipeableMethods>(null);
  return (
    <ReanimatedSwipeable
      ref={ref}
      enabled={enabled}
      friction={2}
      rightThreshold={56}
      overshootRight={false}
      dragOffsetFromLeftEdge={10_000}
      renderRightActions={() => (
        <View style={styles.swipeAction}>
          <Ionicons name="arrow-undo" size={20} color={CHAT_COLORS.sub} />
        </View>
      )}
      onSwipeableWillOpen={() => {
        onReply();
        requestAnimationFrame(() => ref.current?.close());
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

/** 보낼 편지함 항목 — 보내는 중(진행률) · 실패([다시 보내기][지우기]) */
function OutboxBody({ item, onRetry, onDiscard }: { item: ChatOutboxItem; onRetry: (id: string) => void; onDiscard: (id: string) => void }) {
  const failed = item.status === 'failed';
  let body: React.ReactNode;
  if (item.kind === 'media') {
    const cells: BundleCell[] = item.entries.map((e) => ({
      kind: e.asset.kind,
      uri: e.asset.previewUri ?? (e.asset.kind === 'image' ? e.asset.uri : undefined),
      w: e.asset.width,
      h: e.asset.height,
      durationMs: e.asset.durationMs,
    }));
    const total = item.entries.length;
    const done = item.entries.filter((e) => e.result).length;
    const fraction = total ? item.entries.reduce((s, e) => s + (e.result ? 1 : e.fraction), 0) / total : 0;
    const overlay = (
      <View style={styles.progressOverlay} pointerEvents="none">
        {failed ? (
          <Ionicons name="alert-circle" size={34} color="#ffffff" />
        ) : (
          <>
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.progressText}>{Math.round(fraction * 100)}%</Text>
            <Text style={styles.progressSub}>{L('chat.uploadingN', { done, total })}</Text>
          </>
        )}
      </View>
    );
    body = <MediaBundle cells={cells} overlay={overlay} dimmed />;
  } else if (item.kind === 'voice') {
    body = <VoiceBubble id={`o_${item.clientId}`} durationMs={item.voice?.durationMs} mine pending={!failed} />;
  } else {
    body = (
      <View style={[styles.bubble, styles.bubbleMine, styles.bubbleFailed]}>
        <Text style={styles.textMine}>{item.text}</Text>
      </View>
    );
  }
  return (
    <View style={styles.outboxCol}>
      {body}
      {failed ? (
        <View style={styles.failRow}>
          {item.error ? <Text style={styles.failText} numberOfLines={2}>{item.error}</Text> : null}
          <View style={styles.failButtons}>
            <TouchableOpacity style={styles.failBtn} onPress={() => onRetry(item.clientId)}>
              <Ionicons name="refresh" size={14} color={CHAT_COLORS.primary} />
              <Text style={styles.failBtnText}>{L('chat.retry')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.failBtn} onPress={() => onDiscard(item.clientId)}>
              <Ionicons name="trash-outline" size={14} color={CHAT_COLORS.danger} />
              <Text style={[styles.failBtnText, { color: CHAT_COLORS.danger }]}>{L('chat.discard')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MessageRowImpl(props: MessageRowProps) {
  const { row, lang, myUid, room, sender, unread, blocked, revealed, bubbleMaxWidth, highlight, flash, actions } = props;

  if (row.type === 'divider') {
    return (
      <View style={styles.dividerWrap}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{L('chat.unreadDivider')}</Text>
        <View style={styles.dividerLine} />
      </View>
    );
  }

  const { layout } = row;
  const gap = row.firstInRun ? styles.rowGapLarge : styles.rowGapSmall;
  const date = new Date(row.type === 'message' ? messageMillis(row.message) || Date.now() : row.item.createdAt);
  const day = layout.showDay ? <DaySeparator date={date} lang={lang} /> : null;

  if (row.type === 'outbox') {
    const item = row.item;
    return (
      <View>
        {day}
        <View style={[styles.rowMine, gap]}>
          <Meta mine unread={null} time="" pending={item.status !== 'failed'} failed={item.status === 'failed'} silent={item.extra?.silent} />
          <View style={{ maxWidth: bubbleMaxWidth }}>
            <OutboxBody item={item} onRetry={actions.onRetry} onDiscard={actions.onDiscard} />
          </View>
        </View>
      </View>
    );
  }

  const m = row.message;
  if (m.kind === 'system' && m.systemType === 'call' && m.call) {
    // 통화 기록 — 가운데 알약 (놓친 통화는 빨강)
    const c = m.call;
    const mineCall = m.senderId === myUid;
    const missed = isMissedCallLog(c) && !mineCall;
    const label = callLogText(c, { direct: room?.type === 'dm', mine: mineCall, startedByName: room?.memberInfo?.[m.senderId]?.name || m.senderName, lang });
    return (
      <View>
        {day}
        <View style={[styles.systemPill, styles.callPill, missed && styles.callPillMissed]}>
          <Ionicons name={c.media === 'video' ? 'videocam' : 'call'} size={12} color={missed ? '#dc2626' : '#374151'} />
          <Text style={[styles.systemText, missed && { color: '#dc2626' }]} numberOfLines={1}>{label}</Text>
        </View>
      </View>
    );
  }
  if (m.kind === 'system') {
    const isNotice = m.systemType === 'notice';
    const who = room?.memberInfo?.[m.senderId]?.name || m.senderName;
    const label = isNotice ? `📢 ${L('chat.appNoticePosted', { name: who })}${m.text ? ` — ${m.text}` : ''}` : m.text ?? '';
    return (
      <View>
        {day}
        <TouchableOpacity
          style={styles.systemPill}
          disabled={!m.noticeOf}
          onPress={() => m.noticeOf && actions.onJumpTo(m.noticeOf)}
          activeOpacity={0.7}
        >
          <Text style={styles.systemText} numberOfLines={2}>{label}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const mine = layout.mine;
  const time = layout.showTime && !m.pending ? chatTimeLabel(date, lang) : '';
  const longPress = () => actions.onLongPress(m);
  const media = m.media ?? [];
  const text = m.text ?? '';
  const hidden = blocked && !revealed;
  const replyName = m.replyTo ? room?.memberInfo?.[m.replyTo.senderId]?.name || m.replyTo.senderName : '';
  const quote = m.replyTo && !m.deleted && !hidden ? (
    <ReplyQuote
      reply={m.replyTo}
      name={replyName}
      lang={lang}
      mine={mine}
      onPress={() => actions.onJumpTo(m.replyTo!.id)}
      onLongPress={longPress}
    />
  ) : null;

  let body: React.ReactNode;
  if (m.deleted) {
    body = (
      <Pressable onLongPress={longPress} style={[styles.bubble, mine ? styles.bubbleMineDeleted : styles.bubbleOther]}>
        <Text style={styles.deleted}>{L('chat.deletedMessage')}</Text>
      </Pressable>
    );
  } else if (hidden) {
    body = (
      <View style={[styles.bubble, styles.bubbleOther, styles.blockedBubble]}>
        <Text style={styles.deleted}>{L('chat.blockedMessage')}</Text>
        <TouchableOpacity onPress={() => actions.onReveal(m.id)} hitSlop={6}>
          <Text style={styles.reveal}>{L('chat.showBlocked')}</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (m.kind === 'poll') {
    body = (
      <PollBubble
        message={m}
        myUid={myUid}
        lang={lang}
        onVote={actions.onVote}
        onClose={actions.onClosePoll}
        onShowVoters={actions.onShowVoters}
        onLongPress={longPress}
      />
    );
  } else if (m.kind === 'voice') {
    // 음성 — 첫 파일 (예전에 kind 'image' 로 저장된 것도 음성으로 본다)
    const audio = media[0];
    body = (
      <>
        {quote ? <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther, styles.quoteOnly]}>{quote}</View> : null}
        <VoiceBubble id={m.id} url={audio?.url} durationMs={audio?.durationMs} mine={mine} pending={m.pending} onLongPress={longPress} />
      </>
    );
  } else {
    const cells = cellsOfMedia(media);
    body = (
      <>
        {quote && cells.length ? (
          <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther, styles.quoteOnly]}>{quote}</View>
        ) : null}
        {cells.length ? (
          <MediaBundle cells={cells} onPressCell={(i) => actions.onOpenMedia(m, i)} onLongPress={longPress} />
        ) : null}
        {text ? (
          <Pressable
            onLongPress={longPress}
            delayLongPress={350}
            style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther, cells.length ? styles.afterMedia : null]}
          >
            {quote && !cells.length ? quote : null}
            <LinkedText
              text={text}
              style={mine ? styles.textMine : styles.textOther}
              linkStyle={mine ? styles.linkMine : styles.linkOther}
              onLongPress={longPress}
              highlight={highlight}
              highlightStyle={styles.hit}
              mentionRoom={room}
              myUid={myUid}
              mentionStyle={mine ? styles.mentionMine : styles.mentionOther}
              mentionMeStyle={mine ? styles.mentionMeMine : styles.mentionMeOther}
            />
          </Pressable>
        ) : null}
      </>
    );
  }

  const meta = (
    <Meta
      mine={mine}
      unread={m.pending ? null : unread}
      time={time}
      pending={m.pending}
      edited={!!m.editedAt && !m.deleted}
      silent={!!m.silent}
    />
  );
  const chips = !m.deleted && !hidden && m.reactions ? (
    <ReactionChips reactions={m.reactions} myUid={myUid} alignEnd={mine} onPress={() => actions.onShowReactions(m)} />
  ) : null;
  const canSwipe = !m.deleted && !hidden && !m.pending;

  if (mine) {
    return (
      <View>
        {day}
        <SwipeReply enabled={canSwipe} onReply={() => actions.onReply(m)}>
          <View style={[styles.rowMine, gap, flash && styles.flash]}>
            {meta}
            <View style={[styles.contentMine, { maxWidth: bubbleMaxWidth }]}>
              {body}
              {chips}
            </View>
          </View>
        </SwipeReply>
      </View>
    );
  }

  const name = sender?.name || m.senderName || L('chat.unknownUser');
  return (
    <View>
      {day}
      <SwipeReply enabled={canSwipe} onReply={() => actions.onReply(m)}>
        <View style={[styles.rowOther, gap, flash && styles.flash]}>
          <View style={styles.avatarSlot}>
            {layout.showSender ? <PersonAvatar name={name} photo={sender?.photo} size={38} /> : null}
          </View>
          <View style={styles.otherCol}>
            {layout.showSender ? <Text style={styles.senderName} numberOfLines={1}>{name}</Text> : null}
            <View style={styles.bubbleLine}>
              <View style={[styles.contentOther, { maxWidth: bubbleMaxWidth }]}>
                {body}
                {chips}
              </View>
              {meta}
            </View>
          </View>
        </View>
      </SwipeReply>
    </View>
  );
}

export const MessageRow = memo(MessageRowImpl);

const styles = StyleSheet.create({
  dayWrap: { alignItems: 'center', marginTop: 16, marginBottom: 6 },
  dayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(100, 116, 139, 0.45)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  dayText: { color: '#ffffff', fontSize: 12 },
  systemPill: {
    alignSelf: 'center',
    maxWidth: '86%',
    backgroundColor: 'rgba(100, 116, 139, 0.18)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginVertical: 8,
  },
  systemText: { color: '#334155', fontSize: 12.5, textAlign: 'center' },
  callPill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  callPillMissed: { backgroundColor: '#fee2e2' },
  dividerWrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginVertical: 12, gap: 8 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#94a3b8' },
  dividerText: { fontSize: 12, color: '#475569', fontWeight: '600' },

  rowMine: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', paddingLeft: 48, paddingRight: 10 },
  rowOther: { flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 8, paddingRight: 40 },
  rowGapLarge: { marginTop: 10 },
  rowGapSmall: { marginTop: 3 },
  avatarSlot: { width: 38, marginRight: 8 },
  otherCol: { flexShrink: 1 },
  senderName: { fontSize: 12.5, color: '#475569', marginBottom: 4, marginLeft: 2 },
  bubbleLine: { flexDirection: 'row', alignItems: 'flex-end' },
  contentMine: { alignItems: 'flex-end' },
  contentOther: { alignItems: 'flex-start' },
  outboxCol: { alignItems: 'flex-end' },
  swipeAction: { width: 56, alignItems: 'center', justifyContent: 'center' },

  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: CHAT_COLORS.mine, borderTopRightRadius: 4 },
  bubbleMineDeleted: { backgroundColor: '#dbe4ef', borderTopRightRadius: 4 },
  bubbleOther: { backgroundColor: CHAT_COLORS.other, borderTopLeftRadius: 4 },
  bubbleFailed: { opacity: 0.7 },
  quoteOnly: { paddingBottom: 2, marginBottom: 4 },
  afterMedia: { marginTop: 4 },
  blockedBubble: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textMine: { color: CHAT_COLORS.mineText, fontSize: 15, lineHeight: 21 },
  textOther: { color: CHAT_COLORS.otherText, fontSize: 15, lineHeight: 21 },
  linkMine: { color: '#ffffff', textDecorationLine: 'underline' },
  linkOther: { color: CHAT_COLORS.link, textDecorationLine: 'underline' },
  mentionMine: { fontWeight: '700' },
  mentionOther: { fontWeight: '700', color: CHAT_COLORS.link },
  mentionMeMine: { fontWeight: '800', backgroundColor: 'rgba(255,255,255,0.25)' },
  mentionMeOther: { fontWeight: '800', color: '#1d4ed8', backgroundColor: '#dbeafe' },
  deleted: { color: CHAT_COLORS.muted, fontStyle: 'italic', fontSize: 14 },
  hit: { backgroundColor: '#fde047', color: '#1e293b' },
  flash: { backgroundColor: 'rgba(253, 224, 71, 0.35)' },
  reveal: { color: CHAT_COLORS.primary, fontSize: 13, fontWeight: '600' },

  meta: { marginHorizontal: 5, marginBottom: 1 },
  metaMine: { alignItems: 'flex-end' },
  metaOther: { alignItems: 'flex-start' },
  metaFlags: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  metaFlagsMine: { justifyContent: 'flex-end' },
  edited: { color: CHAT_COLORS.muted, fontSize: 10 },
  unread: { color: CHAT_COLORS.unreadReaders, fontSize: 11, fontWeight: '800' },
  time: { color: CHAT_COLORS.sub, fontSize: 10.5 },

  progressOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  progressText: { color: '#ffffff', fontSize: 15, fontWeight: '700', marginTop: 6 },
  progressSub: { color: '#e2e8f0', fontSize: 11, marginTop: 2 },
  failRow: { marginTop: 4, alignItems: 'flex-end' },
  failText: { color: CHAT_COLORS.danger, fontSize: 12, marginBottom: 4, textAlign: 'right' },
  failButtons: { flexDirection: 'row', gap: 8 },
  failBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  failBtnText: { fontSize: 12.5, color: CHAT_COLORS.primary, fontWeight: '600' },
});
