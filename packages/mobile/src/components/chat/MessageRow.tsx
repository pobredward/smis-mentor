/**
 * 대화방 한 줄 — 날짜 구분선 · (남) 사진·이름 · 말풍선 · 안 읽은 사람 수 · 시각
 * 보내는 중인 사진 묶음 · 보내지 못한 글(보낼 편지함)도 같은 모양으로 그린다.
 */
import React, { memo } from 'react';
import { View, Text, Pressable, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  L,
  chatDayLabel,
  chatTimeLabel,
  type ChatMemberInfo,
  type ChatMessageView,
  type ChatRowLayout,
  type Locale,
} from '@smis-mentor/shared';
import type { ChatOutboxItem } from '../../hooks/useChatOutbox';
import { messageMillis } from '../../hooks/useChatMessages';
import { PersonAvatar } from './ChatAvatar';
import { LinkedText } from './LinkedText';
import { MediaBundle, cellsOfMedia, type BundleCell } from './MediaBundle';
import { CHAT_COLORS } from './chatTheme';

/** firstInRun: 다른 사람·다른 날 다음의 첫 말풍선 (위 간격을 넓힌다) */
export type ChatRow =
  | { type: 'message'; key: string; message: ChatMessageView; layout: ChatRowLayout; firstInRun: boolean }
  | { type: 'outbox'; key: string; item: ChatOutboxItem; layout: ChatRowLayout; firstInRun: boolean };

interface MessageRowProps {
  row: ChatRow;
  lang: Locale;
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
  /** 검색 결과로 이동한 메시지 — 잠깐 줄 전체를 밝힌다 */
  flash?: boolean;
  onReveal: (messageId: string) => void;
  onLongPress: (message: ChatMessageView) => void;
  onOpenMedia: (message: ChatMessageView, index: number) => void;
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
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

function Meta({ mine, unread, time, pending, failed }: { mine: boolean; unread: number | null; time: string; pending?: boolean; failed?: boolean }) {
  return (
    <View style={[styles.meta, mine ? styles.metaMine : styles.metaOther]}>
      {unread ? <Text style={styles.unread}>{unread}</Text> : null}
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
  const { row, lang, sender, unread, blocked, revealed, bubbleMaxWidth, highlight, flash, onReveal, onLongPress, onOpenMedia, onRetry, onDiscard } = props;
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
          <Meta mine unread={null} time="" pending={item.status !== 'failed'} failed={item.status === 'failed'} />
          <View style={{ maxWidth: bubbleMaxWidth }}>
            <OutboxBody item={item} onRetry={onRetry} onDiscard={onDiscard} />
          </View>
        </View>
      </View>
    );
  }

  const m = row.message;
  if (m.kind === 'system') {
    return (
      <View>
        {day}
        <Text style={styles.system}>{m.text}</Text>
      </View>
    );
  }

  const mine = layout.mine;
  const time = layout.showTime && !m.pending ? chatTimeLabel(date, lang) : '';
  const longPress = () => onLongPress(m);
  const media = m.media ?? [];
  const text = m.text ?? '';

  let body: React.ReactNode;
  if (m.deleted) {
    body = (
      <Pressable onLongPress={longPress} style={[styles.bubble, mine ? styles.bubbleMineDeleted : styles.bubbleOther]}>
        <Text style={styles.deleted}>{L('chat.deletedMessage')}</Text>
      </Pressable>
    );
  } else if (blocked && !revealed) {
    body = (
      <View style={[styles.bubble, styles.bubbleOther, styles.blockedBubble]}>
        <Text style={styles.deleted}>{L('chat.blockedMessage')}</Text>
        <TouchableOpacity onPress={() => onReveal(m.id)} hitSlop={6}>
          <Text style={styles.reveal}>{L('chat.showBlocked')}</Text>
        </TouchableOpacity>
      </View>
    );
  } else {
    body = (
      <>
        {media.length ? (
          <MediaBundle cells={cellsOfMedia(media)} onPressCell={(i) => onOpenMedia(m, i)} onLongPress={longPress} />
        ) : null}
        {text ? (
          <Pressable
            onLongPress={longPress}
            delayLongPress={350}
            style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther, media.length ? styles.afterMedia : null]}
          >
            <LinkedText
              text={text}
              style={mine ? styles.textMine : styles.textOther}
              linkStyle={mine ? styles.linkMine : styles.linkOther}
              onLongPress={longPress}
              highlight={highlight}
              highlightStyle={styles.hit}
            />
          </Pressable>
        ) : null}
      </>
    );
  }

  const meta = <Meta mine={mine} unread={m.pending ? null : unread} time={time} pending={m.pending} />;

  if (mine) {
    return (
      <View>
        {day}
        <View style={[styles.rowMine, gap, flash && styles.flash]}>
          {meta}
          <View style={[styles.contentMine, { maxWidth: bubbleMaxWidth }]}>{body}</View>
        </View>
      </View>
    );
  }

  const name = sender?.name || m.senderName || L('chat.unknownUser');
  return (
    <View>
      {day}
      <View style={[styles.rowOther, gap, flash && styles.flash]}>
        <View style={styles.avatarSlot}>
          {layout.showSender ? <PersonAvatar name={name} photo={sender?.photo} size={38} /> : null}
        </View>
        <View style={styles.otherCol}>
          {layout.showSender ? <Text style={styles.senderName} numberOfLines={1}>{name}</Text> : null}
          <View style={styles.bubbleLine}>
            <View style={[styles.contentOther, { maxWidth: bubbleMaxWidth }]}>{body}</View>
            {meta}
          </View>
        </View>
      </View>
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
  system: { alignSelf: 'center', color: CHAT_COLORS.sub, fontSize: 12, marginVertical: 8, paddingHorizontal: 24, textAlign: 'center' },

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

  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: CHAT_COLORS.mine, borderTopRightRadius: 4 },
  bubbleMineDeleted: { backgroundColor: '#dbe4ef', borderTopRightRadius: 4 },
  bubbleOther: { backgroundColor: CHAT_COLORS.other, borderTopLeftRadius: 4 },
  bubbleFailed: { opacity: 0.7 },
  afterMedia: { marginTop: 4 },
  blockedBubble: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textMine: { color: CHAT_COLORS.mineText, fontSize: 15, lineHeight: 21 },
  textOther: { color: CHAT_COLORS.otherText, fontSize: 15, lineHeight: 21 },
  linkMine: { color: '#ffffff', textDecorationLine: 'underline' },
  linkOther: { color: CHAT_COLORS.link, textDecorationLine: 'underline' },
  deleted: { color: CHAT_COLORS.muted, fontStyle: 'italic', fontSize: 14 },
  hit: { backgroundColor: '#fde047', color: '#1e293b' },
  flash: { backgroundColor: 'rgba(253, 224, 71, 0.35)' },
  reveal: { color: CHAT_COLORS.primary, fontSize: 13, fontWeight: '600' },

  meta: { marginHorizontal: 5, marginBottom: 1 },
  metaMine: { alignItems: 'flex-end' },
  metaOther: { alignItems: 'flex-start' },
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
