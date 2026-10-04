/**
 * 투표 만들기 — 제목 · 항목(처음 2개, 10개까지) · 여러 개 선택 · 익명 · 마감(없음/날짜·시각)
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
import { CHAT_LIMITS, L, makeChatPoll, type ChatPoll } from '@smis-mentor/shared';
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQuestion('');
    setOptions(['', '']);
    setMulti(false);
    setAnonymous(false);
    setHasDeadline(false);
    setDeadline(defaultDeadline());
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
            <DateTimeField
              value={deadline}
              onChange={setDeadline}
              minimumDate={new Date()}
              maximumDate={new Date(Date.now() + CHAT_LIMITS.scheduleMaxDays * 86400000)}
            />
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
});
