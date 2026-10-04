/**
 * 투표 만들기 — 제목 · 항목(처음 2개, 10개까지) · 여러 개 선택 · 익명 · 마감(없음/날짜·시각) · 마감 알림(몇 분 전)
 */
import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  StyleSheet,
  KeyboardAvoidingView,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Timestamp } from 'firebase/firestore';
import { CHAT_LIMITS, CHAT_POLL_REMIND_MINUTES, L, canPollRemind, getCurrentLocale, makeChatPoll, pollRemindLabel, type ChatPoll } from '@smis-mentor/shared';
import { DateTimeField, roundUpTo10Min } from './DateTimeField';
import { CHAT_COLORS } from './chatTheme';

interface PollCreateSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (poll: ChatPoll) => Promise<void>;
}

const defaultDeadline = () => roundUpTo10Min(new Date(Date.now() + 24 * 60 * 60 * 1000));

export function PollCreateSheet({ visible, onClose, onCreate }: PollCreateSheetProps) {
  const insets = useSafeAreaInsets();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multi, setMulti] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [hasDeadline, setHasDeadline] = useState(false);
  const [deadline, setDeadline] = useState<Date>(defaultDeadline);
  /** 마감 몇 분 전 알림 (0 = 안 함) */
  const [remindMin, setRemindMin] = useState(0);
  const [busy, setBusy] = useState(false);
  const lang = getCurrentLocale();
  // 마감을 당겨서 알림 시각이 지나 버리면 '안 함'으로
  useEffect(() => {
    if (remindMin && !canPollRemind(deadline.getTime(), remindMin)) setRemindMin(0);
  }, [deadline, remindMin]);

  useEffect(() => {
    if (!visible) return;
    setQuestion('');
    setOptions(['', '']);
    setMulti(false);
    setAnonymous(false);
    setHasDeadline(false);
    setDeadline(defaultDeadline());
    setRemindMin(0);
    setBusy(false);
  }, [visible]);

  const submit = async () => {
    if (busy) return;
    if (hasDeadline && deadline.getTime() <= Date.now() + 60 * 1000) {
      Alert.alert(L('chat.schedulePast'));
      return;
    }
    const poll = makeChatPoll(question, options, {
      multi,
      anonymous,
      closesAt: hasDeadline ? Timestamp.fromDate(deadline) : null,
      remindMin: hasDeadline && remindMin && canPollRemind(deadline.getTime(), remindMin) ? remindMin : null,
    });
    if (!poll) {
      Alert.alert(L('chat.pollNeedOptions'));
      return;
    }
    setBusy(true);
    try {
      await onCreate(poll);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? insets.top + 6 : 12 }]}>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Text style={styles.cancel}>{L('common.cancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{L('chat.pollCreate')}</Text>
          <TouchableOpacity onPress={submit} hitSlop={10} disabled={busy}>
            {busy ? <ActivityIndicator size="small" color={CHAT_COLORS.primary} /> : <Text style={styles.done}>{L('chat.send')}</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          <TextInput
            style={[styles.input, styles.question]}
            value={question}
            onChangeText={setQuestion}
            placeholder={L('chat.pollQuestion')}
            placeholderTextColor={CHAT_COLORS.muted}
            maxLength={CHAT_LIMITS.pollQuestionMax}
            multiline
            autoFocus
          />
          {options.map((o, i) => (
            <View key={i} style={styles.optionRow}>
              <TextInput
                style={[styles.input, styles.flex]}
                value={o}
                onChangeText={(t) => setOptions((list) => list.map((x, j) => (j === i ? t : x)))}
                placeholder={L('chat.pollOption', { n: i + 1 })}
                placeholderTextColor={CHAT_COLORS.muted}
                maxLength={CHAT_LIMITS.pollOptionMax}
                returnKeyType="next"
              />
              {options.length > CHAT_LIMITS.pollOptionsMin ? (
                <TouchableOpacity onPress={() => setOptions((list) => list.filter((_, j) => j !== i))} hitSlop={8} style={styles.remove}>
                  <Ionicons name="remove-circle" size={22} color={CHAT_COLORS.danger} />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
          {options.length < CHAT_LIMITS.pollOptionsMax ? (
            <TouchableOpacity style={styles.add} onPress={() => setOptions((list) => [...list, ''])}>
              <Ionicons name="add-circle-outline" size={20} color={CHAT_COLORS.primary} />
              <Text style={styles.addText}>{L('chat.pollAddOption')}</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.switchRow}>
            <Text style={styles.label}>{L('chat.pollMulti')}</Text>
            <Switch value={multi} onValueChange={setMulti} trackColor={{ true: CHAT_COLORS.primary, false: '#cbd5e1' }} />
          </View>
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={styles.label}>{L('chat.pollAnonymous')}</Text>
              <Text style={styles.hint}>{L('chat.pollAnonymousNote')}</Text>
            </View>
            <Switch value={anonymous} onValueChange={setAnonymous} trackColor={{ true: CHAT_COLORS.primary, false: '#cbd5e1' }} />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.label}>{L('chat.pollDeadline')}</Text>
            <Switch value={hasDeadline} onValueChange={setHasDeadline} trackColor={{ true: CHAT_COLORS.primary, false: '#cbd5e1' }} />
          </View>
          {hasDeadline ? (
            <>
              <DateTimeField
                value={deadline}
                onChange={setDeadline}
                minimumDate={new Date()}
                maximumDate={new Date(Date.now() + CHAT_LIMITS.scheduleMaxDays * 86400000)}
                minuteInterval={5}
              />
              <Text style={[styles.label, styles.remindLabel]}>{L('chat.pollRemind')}</Text>
              <View style={styles.remindRow}>
                {[0, ...CHAT_POLL_REMIND_MINUTES].map((min) => {
                  const ok = !min || canPollRemind(deadline.getTime(), min);
                  const on = remindMin === min;
                  return (
                    <TouchableOpacity
                      key={min}
                      style={[styles.remindChip, on && styles.remindChipOn, !ok && styles.remindChipOff]}
                      onPress={() => setRemindMin(min)}
                      disabled={!ok}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on, disabled: !ok }}
                    >
                      <Text style={[styles.remindText, on && styles.remindTextOn]}>{min ? pollRemindLabel(min, lang) : L('chat.pollRemindNone')}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.hint}>{L('chat.pollRemindHint')}</Text>
            </>
          ) : (
            <Text style={styles.hint}>{L('chat.pollNoDeadline')}</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CHAT_COLORS.border,
  },
  title: { fontSize: 16, fontWeight: '700', color: CHAT_COLORS.text },
  cancel: { fontSize: 15, color: CHAT_COLORS.sub },
  done: { fontSize: 15, color: CHAT_COLORS.primary, fontWeight: '700' },
  body: { padding: 16, gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: CHAT_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: CHAT_COLORS.text,
  },
  question: { minHeight: 56, fontWeight: '600' },
  optionRow: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  remove: { paddingLeft: 8 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  addText: { color: CHAT_COLORS.primary, fontSize: 14.5, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  label: { fontSize: 15, color: CHAT_COLORS.text },
  hint: { fontSize: 12, color: CHAT_COLORS.sub, marginTop: 2 },
  remindLabel: { marginTop: 6 },
  remindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  remindChip: { height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: CHAT_COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  remindChipOn: { backgroundColor: CHAT_COLORS.primary, borderColor: CHAT_COLORS.primary },
  remindChipOff: { opacity: 0.35 },
  remindText: { fontSize: 13.5, color: CHAT_COLORS.text, fontWeight: '600' },
  remindTextOn: { color: '#ffffff' },
});
