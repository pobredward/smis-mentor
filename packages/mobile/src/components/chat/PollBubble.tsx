/**
 * 투표 말풍선 — 📊 제목 · 항목(라디오/체크) · [투표하기]
 * 내가 투표했거나 · 마감됐거나 · 내가 만든 투표면 결과(막대 · 수 · %) · 'n명 참여' · 마감 시각
 * 익명이 아니면 항목 수를 누르면 고른 사람. [다시 투표] · 만든 사람은 [투표 마감]
 */
import React, { memo, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  L,
  chatDayLabel,
  chatTimeLabel,
  isPollClosed,
  pollResults,
  type ChatMessageView,
  type Locale,
} from '@smis-mentor/shared';
import { CHAT_COLORS } from './chatTheme';

interface PollBubbleProps {
  message: ChatMessageView;
  myUid: string;
  lang: Locale;
  onVote: (message: ChatMessageView, optionIds: string[]) => Promise<void>;
  onClose: (message: ChatMessageView) => void;
  onShowVoters: (message: ChatMessageView, optionId: string) => void;
  onLongPress: () => void;
}

const millisOf = (ts: unknown): number => {
  const t = ts as { toMillis?: () => number } | null | undefined;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : 0;
};

function PollBubbleImpl({ message, myUid, lang, onVote, onClose, onShowVoters, onLongPress }: PollBubbleProps) {
  const poll = message.poll;
  const results = useMemo(() => pollResults(message, myUid), [message, myUid]);
  const closed = isPollClosed(message);
  const creator = message.senderId === myUid;
  const voted = results.mine.length > 0;
  const [revoting, setRevoting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!poll) return null;

  const selecting = !closed && (revoting || (!voted && !creator));
  const showResults = !selecting;
  const closesAt = millisOf(poll.closesAt);

  const toggle = (id: string) => {
    if (!selecting) return;
    if (poll.multi) setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    else setPicked([id]);
  };
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onVote(message, picked);
      setRevoting(false);
    } finally {
      setBusy(false);
    }
  };
  const startRevote = () => {
    setPicked(results.mine);
    setRevoting(true);
  };

  return (
    <TouchableOpacity activeOpacity={1} onLongPress={onLongPress} delayLongPress={350} style={styles.box}>
      <View style={styles.head}>
        <Text style={styles.icon}>📊</Text>
        <Text style={styles.question}>{poll.question}</Text>
      </View>
      <View style={styles.flags}>
        {poll.multi ? <Text style={styles.flag}>{L('chat.pollMulti')}</Text> : null}
        {poll.anonymous ? <Text style={styles.flag}>{L('chat.pollAnonymous')}</Text> : null}
        {closed ? <Text style={[styles.flag, styles.flagClosed]}>{L('chat.pollClosed')}</Text> : null}
      </View>

      {results.options.map((o) => {
        const on = selecting ? picked.includes(o.id) : results.mine.includes(o.id);
        const top = showResults && results.top.includes(o.id);
        return (
          <TouchableOpacity key={o.id} style={styles.option} onPress={() => toggle(o.id)} disabled={!selecting} activeOpacity={0.7}>
            {showResults ? (
              <View style={[styles.fill, top && styles.fillTop, { width: `${Math.round(o.ratio * 100)}%` }]} />
            ) : null}
            <Ionicons
              name={poll.multi ? (on ? 'checkbox' : 'square-outline') : on ? 'radio-button-on' : 'radio-button-off'}
              size={19}
              color={on ? CHAT_COLORS.primary : CHAT_COLORS.muted}
            />
            <Text style={[styles.optionText, top && styles.optionTop]} numberOfLines={3}>{o.text}</Text>
            {showResults ? (
              <TouchableOpacity
                disabled={poll.anonymous || !o.count}
                onPress={() => onShowVoters(message, o.id)}
                hitSlop={6}
                style={styles.countWrap}
              >
                <Text style={[styles.count, !poll.anonymous && o.count ? styles.countLink : null]}>
                  {`${o.count} · ${Math.round(o.ratio * 100)}%`}
                </Text>
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        );
      })}

      <Text style={styles.meta}>
        {[
          L('chat.pollVoters', { n: results.voters }),
          closesAt && !message.pollClosed ? L('chat.pollEndsAt', { at: `${chatDayLabel(new Date(closesAt), lang)} ${chatTimeLabel(new Date(closesAt), lang)}` }) : '',
        ].filter(Boolean).join(' · ')}
      </Text>
      {poll.anonymous ? <Text style={styles.note}>{L('chat.pollAnonymousNote')}</Text> : null}

      <View style={styles.actions}>
        {selecting ? (
          <TouchableOpacity
            style={[styles.primary, (!picked.length && !revoting) || busy ? styles.disabled : null]}
            onPress={submit}
            disabled={(!picked.length && !revoting) || busy}
          >
            {busy ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.primaryText}>{L('chat.pollVote')}</Text>}
          </TouchableOpacity>
        ) : !closed ? (
          <TouchableOpacity style={styles.secondary} onPress={startRevote}>
            <Text style={styles.secondaryText}>{voted ? L('chat.pollRevote') : L('chat.pollVote')}</Text>
          </TouchableOpacity>
        ) : null}
        {creator && !closed ? (
          <TouchableOpacity style={styles.secondary} onPress={() => onClose(message)}>
            <Text style={[styles.secondaryText, styles.danger]}>{L('chat.pollClose')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export const PollBubble = memo(PollBubbleImpl);

const styles = StyleSheet.create({
  box: { width: 260, backgroundColor: '#ffffff', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: CHAT_COLORS.border },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  icon: { fontSize: 16 },
  question: { flex: 1, fontSize: 15, fontWeight: '700', color: CHAT_COLORS.text },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 6 },
  flag: { fontSize: 11, color: CHAT_COLORS.sub, backgroundColor: '#f1f5f9', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  flagClosed: { color: '#ffffff', backgroundColor: CHAT_COLORS.muted },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: CHAT_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 6,
    overflow: 'hidden',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#eff6ff' },
  fillTop: { backgroundColor: '#dbeafe' },
  optionText: { flex: 1, fontSize: 14, color: CHAT_COLORS.text },
  optionTop: { fontWeight: '700' },
  countWrap: { paddingLeft: 4 },
  count: { fontSize: 12, color: CHAT_COLORS.sub, fontVariant: ['tabular-nums'] },
  countLink: { color: CHAT_COLORS.primary, textDecorationLine: 'underline' },
  meta: { fontSize: 12, color: CHAT_COLORS.sub, marginTop: 8 },
  note: { fontSize: 11.5, color: CHAT_COLORS.muted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  primary: { flex: 1, backgroundColor: CHAT_COLORS.primary, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  primaryText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.45 },
  secondary: { flex: 1, borderWidth: 1, borderColor: CHAT_COLORS.border, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  secondaryText: { color: CHAT_COLORS.primary, fontWeight: '600', fontSize: 13.5 },
  danger: { color: CHAT_COLORS.danger },
});
