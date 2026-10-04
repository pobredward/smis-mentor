/**
 * 음성 메시지 말풍선 — ▶/❚❚ · 진행 막대 · 길이. 한 번에 하나만 재생한다.
 * 재생할 때만 플레이어를 만든다 (보이는 음성 말풍선마다 플레이어를 들고 있지 않게).
 */
import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { L, formatChatDuration, logger } from '@smis-mentor/shared';
import { CHAT_COLORS } from './chatTheme';

// ── 지금 재생 중인 음성 (앱 전체에서 하나) ───────────────────────────
let activeId: string | null = null;
const listeners = new Set<() => void>();
function setActive(id: string | null) {
  activeId = id;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const getActive = () => activeId;

/** 다른 화면으로 갈 때 등 — 재생 멈춤 */
export function stopChatVoice(): void {
  setActive(null);
}

interface VoiceBubbleProps {
  id: string;
  url?: string;
  durationMs?: number;
  mine: boolean;
  /** 보내는 중 (아직 재생할 수 없음) */
  pending?: boolean;
  onLongPress?: () => void;
}

function Bar({ ratio, mine }: { ratio: number; mine: boolean }) {
  return (
    <View style={[styles.track, mine ? styles.trackMine : styles.trackOther]}>
      <View style={[styles.fill, mine ? styles.fillMine : styles.fillOther, { width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%` }]} />
    </View>
  );
}

/** 재생 중인 말풍선만 그리는 부분 — 여기서만 플레이어를 만든다 */
function ActiveVoice({ url, durationMs, mine, onLongPress }: { url: string; durationMs?: number; mine: boolean; onLongPress?: () => void }) {
  const player = useAudioPlayer({ uri: url }, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const failedRef = useRef(false);

  useEffect(() => {
    // 무음 모드에서도 들리게 · 녹음 모드 끄기 (iOS 스피커로)
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false })
      .catch(() => {})
      .finally(() => {
        try {
          player.play();
        } catch (e) {
          logger.warn('음성 재생 실패:', e);
        }
      });
  }, [player]);

  useEffect(() => {
    if (status.didJustFinish) setActive(null);
  }, [status.didJustFinish]);

  useEffect(() => {
    if (status.error && !failedRef.current) {
      failedRef.current = true;
      logger.warn('음성 재생 오류:', status.error);
      Alert.alert(L('chat.voicePlayFailed'));
      setActive(null);
    }
  }, [status.error]);

  const total = (status.duration || 0) * 1000 || durationMs || 0;
  const current = (status.currentTime || 0) * 1000;
  const loading = !status.isLoaded || status.isBuffering;
  const toggle = () => {
    if (status.playing) player.pause();
    else {
      if (total && current >= total - 200) void player.seekTo(0);
      player.play();
    }
  };
  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={toggle} onLongPress={onLongPress} style={[styles.btn, mine ? styles.btnMine : styles.btnOther]} hitSlop={6}>
        {loading && !status.playing ? (
          <ActivityIndicator size="small" color={mine ? CHAT_COLORS.mine : '#ffffff'} />
        ) : (
          <Ionicons name={status.playing ? 'pause' : 'play'} size={18} color={mine ? CHAT_COLORS.mine : '#ffffff'} />
        )}
      </TouchableOpacity>
      <Bar ratio={total ? current / total : 0} mine={mine} />
      <Text style={[styles.time, mine ? styles.timeMine : styles.timeOther]}>
        {formatChatDuration(status.playing || current > 0 ? current : total)}
      </Text>
    </View>
  );
}

export function VoiceBubble({ id, url, durationMs, mine, pending, onLongPress }: VoiceBubbleProps) {
  const active = useSyncExternalStore(subscribe, getActive, getActive) === id;
  // 화면에서 사라지면(언마운트) 재생도 멈춘다
  useEffect(() => () => {
    if (getActive() === id) setActive(null);
  }, [id]);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}
      onPress={() => {
        if (!url || pending || active) return;
        setActive(id);
      }}
    >
      {active && url ? (
        <ActiveVoice url={url} durationMs={durationMs} mine={mine} onLongPress={onLongPress} />
      ) : (
        <View style={styles.row}>
          <View style={[styles.btn, mine ? styles.btnMine : styles.btnOther]}>
            {pending ? (
              <ActivityIndicator size="small" color={mine ? CHAT_COLORS.mine : '#ffffff'} />
            ) : (
              <Ionicons name="play" size={18} color={mine ? CHAT_COLORS.mine : '#ffffff'} />
            )}
          </View>
          <Bar ratio={0} mine={mine} />
          <Text style={[styles.time, mine ? styles.timeMine : styles.timeOther]}>{formatChatDuration(durationMs)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bubble: { borderRadius: 16, paddingHorizontal: 10, paddingVertical: 8, width: 210 },
  bubbleMine: { backgroundColor: CHAT_COLORS.mine, borderTopRightRadius: 4 },
  bubbleOther: { backgroundColor: CHAT_COLORS.other, borderTopLeftRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  btn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  btnMine: { backgroundColor: '#ffffff' },
  btnOther: { backgroundColor: CHAT_COLORS.primary },
  track: { flex: 1, height: 4, borderRadius: 2, marginHorizontal: 10, overflow: 'hidden' },
  trackMine: { backgroundColor: 'rgba(255,255,255,0.35)' },
  trackOther: { backgroundColor: '#e2e8f0' },
  fill: { height: 4, borderRadius: 2 },
  fillMine: { backgroundColor: '#ffffff' },
  fillOther: { backgroundColor: CHAT_COLORS.primary },
  time: { fontSize: 12.5, fontVariant: ['tabular-nums'], minWidth: 36, textAlign: 'right' },
  timeMine: { color: '#ffffff' },
  timeOther: { color: CHAT_COLORS.sub },
});
