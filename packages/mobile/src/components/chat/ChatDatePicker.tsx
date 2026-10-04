/**
 * 날짜 고르기 — 대화 검색의 '날짜로 이동' (카톡처럼)
 * iOS 는 달력 창(고르고 [이동]), Android 는 시스템 날짜 창(고르면 바로 이동)
 */
import React, { useCallback, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { L, getCurrentLocale } from '@smis-mentor/shared';
import { CHAT_COLORS } from './chatTheme';

export interface ChatDatePickerOptions {
  value?: Date | null;
  minimumDate?: Date | null;
  maximumDate?: Date | null;
}

const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function useChatDatePicker(onPick: (day: Date) => void): [React.ReactNode, (opts?: ChatDatePickerOptions) => void] {
  const [ios, setIos] = useState<{ value: Date; min?: Date; max: Date } | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  const open = useCallback((opts: ChatDatePickerOptions = {}) => {
    const max = dayOf(opts.maximumDate ?? new Date());
    const min = opts.minimumDate ? dayOf(opts.minimumDate) : undefined;
    let value = dayOf(opts.value ?? max);
    if (min && value < min) value = min;
    if (value > max) value = max;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        minimumDate: min,
        maximumDate: max,
        onChange: (e, d) => {
          if (e.type === 'set' && d) pickRef.current(d);
        },
      });
      return;
    }
    setIos({ value, min, max });
  }, []);

  const close = () => setIos(null);
  const go = () => {
    const v = ios?.value;
    setIos(null);
    if (v) pickRef.current(v);
  };

  const node = Platform.OS === 'ios' ? (
    <Modal visible={!!ios} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} accessibilityLabel={L('common.cancel')} />
        <View style={styles.card}>
          <Text style={styles.title}>{L('chat.jumpToDate')}</Text>
          {ios ? (
            <DateTimePicker
              value={ios.value}
              mode="date"
              display="inline"
              themeVariant="light"
              accentColor={CHAT_COLORS.primary}
              minimumDate={ios.min}
              maximumDate={ios.max}
              locale={getCurrentLocale() === 'en' ? 'en-US' : 'ko-KR'}
              onChange={(_, d) => {
                if (d) setIos((cur) => (cur ? { ...cur, value: d } : cur));
              }}
            />
          ) : null}
          <View style={styles.row}>
            <TouchableOpacity onPress={close} style={styles.btn} accessibilityRole="button">
              <Text style={styles.cancel}>{L('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={go} style={[styles.btn, styles.goBtn]} accessibilityRole="button">
              <Text style={styles.goText}>{L('chat.jumpDateGo')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  ) : null;

  return [node, open];
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 380, backgroundColor: '#ffffff', borderRadius: 16, paddingTop: 16, paddingHorizontal: 12, paddingBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', color: CHAT_COLORS.text, paddingHorizontal: 6, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  cancel: { fontSize: 15, color: CHAT_COLORS.sub, fontWeight: '600' },
  goBtn: { backgroundColor: CHAT_COLORS.primary },
  goText: { fontSize: 15, color: '#ffffff', fontWeight: '700' },
});
