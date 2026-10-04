/**
 * 음성 메시지 녹음 — 입력창 자리에 녹음 시간 · ✕ 취소 · ■ 끝내고 보내기. 5분이 되면 저절로 끝내고 보낸다.
 * expo-audio 로 m4a(AAC, 모노 64kbps) 녹음.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { CHAT_LIMITS, L, formatChatDuration, logger } from '@smis-mentor/shared';
import { CHAT_COLORS } from './chatTheme';

/** 말소리용 — m4a(AAC) 모노 64kbps (5분에 약 2.4MB) */
const VOICE_PRESET: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
};

/** 이보다 짧으면 보내지 않는다 */
const MIN_MS = 700;

interface VoiceRecorderBarProps {
  bottomInset: number;
  onDone: (voice: { uri: string; durationMs: number }) => void;
  onCancel: () => void;
  onError: (e: unknown) => void;
}

export function VoiceRecorderBar({ bottomInset, onDone, onCancel, onError }: VoiceRecorderBarProps) {
  const recorder = useAudioRecorder(VOICE_PRESET);
  const state = useAudioRecorderState(recorder, 200);
  const [starting, setStarting] = useState(true);
  const finishedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        if (cancelled) return;
        recorder.record();
      } catch (e) {
        logger.warn('녹음 시작 실패:', e);
        if (!cancelled) onError(e);
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();
    return () => {
      cancelled = true;
      // 녹음 중에 화면을 떠나면 멈추고 버린다
      if (!finishedRef.current) {
        finishedRef.current = true;
        try {
          recorder.stop().catch(() => {});
        } catch {
          // 녹음기가 이미 풀렸다
        }
        setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      }
    };
    // 녹음기는 이 화면이 떠 있는 동안 하나
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder]);

  const finish = useCallback(
    async (send: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const durationMs = Math.min(CHAT_LIMITS.voiceMaxMs, Math.max(state.durationMillis, Math.round((recorder.currentTime || 0) * 1000)));
      try {
        await recorder.stop();
      } catch (e) {
        logger.warn('녹음 멈춤 실패:', e);
      }
      // 재생은 스피커로 (iOS 는 녹음 모드면 수화부로 나온다)
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      const uri = recorder.uri;
      if (send && uri && durationMs >= MIN_MS) onDone({ uri, durationMs });
      else onCancel();
    },
    [recorder, state.durationMillis, onDone, onCancel],
  );

  // 5분이 되면 끝내고 보낸다
  useEffect(() => {
    if (state.isRecording && state.durationMillis >= CHAT_LIMITS.voiceMaxMs) void finish(true);
  }, [state.isRecording, state.durationMillis, finish]);

  const remainingSec = Math.max(0, Math.ceil((CHAT_LIMITS.voiceMaxMs - state.durationMillis) / 1000));
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(bottomInset, 8) }]}>
      <TouchableOpacity style={styles.cancel} onPress={() => void finish(false)} accessibilityLabel={L('chat.voiceCancel')} hitSlop={6}>
        <Ionicons name="close" size={24} color={CHAT_COLORS.sub} />
      </TouchableOpacity>
      <View style={styles.center}>
        {starting ? (
          <ActivityIndicator size="small" color={CHAT_COLORS.danger} />
        ) : (
          <View style={[styles.dot, state.isRecording && styles.dotOn]} />
        )}
        <Text style={styles.time}>{L('chat.voiceRecording', { t: formatChatDuration(state.durationMillis) })}</Text>
        {remainingSec <= 30 ? <Text style={styles.limit}>{L('chat.voiceTooLong')}</Text> : null}
      </View>
      <TouchableOpacity
        style={styles.stop}
        onPress={() => void finish(true)}
        disabled={starting}
        accessibilityLabel={L('chat.voiceStop')}
      >
        <Ionicons name="stop" size={18} color="#ffffff" />
        <Text style={styles.stopText}>{L('chat.send')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CHAT_COLORS.border,
  },
  cancel: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fecaca' },
  dotOn: { backgroundColor: CHAT_COLORS.danger },
  time: { fontSize: 15, color: CHAT_COLORS.text, fontVariant: ['tabular-nums'] },
  limit: { fontSize: 11.5, color: CHAT_COLORS.danger },
  stop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CHAT_COLORS.danger,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  stopText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
});
