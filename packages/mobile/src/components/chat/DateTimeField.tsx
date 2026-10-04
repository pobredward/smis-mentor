/**
 * 날짜·시각 고르기 — iOS 는 작은 날짜·시각 버튼(눌러서 고르기), Android 는 날짜 → 시각 창을 차례로
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { chatDayLabel, chatTimeLabel, getCurrentLocale } from '@smis-mentor/shared';
import { CHAT_COLORS } from './chatTheme';

/** 10분 단위로 올림 */
export function roundUpTo10Min(d: Date): Date {
  const out = new Date(d);
  out.setSeconds(0, 0);
  const m = out.getMinutes();
  const up = Math.ceil(m / 10) * 10;
  out.setMinutes(up);
  return out;
}

interface DateTimeFieldProps {
  value: Date;
  onChange: (d: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}

export function DateTimeField({ value, onChange, minimumDate, maximumDate }: DateTimeFieldProps) {
  const lang = getCurrentLocale();
  if (Platform.OS === 'ios') {
    return (
      <View style={styles.iosWrap}>
        <DateTimePicker
          value={value}
          mode="datetime"
          display="compact"
          minuteInterval={10}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          locale={lang === 'en' ? 'en-US' : 'ko-KR'}
          onChange={(_, d) => {
            if (d) onChange(d);
          }}
        />
      </View>
    );
  }
  const openAndroid = () => {
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      minimumDate,
      maximumDate,
      onChange: (e, date) => {
        if (e.type !== 'set' || !date) return;
        const picked = new Date(value);
        picked.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
        DateTimePickerAndroid.open({
          value: picked,
          mode: 'time',
          is24Hour: false,
          onChange: (e2, time) => {
            if (e2.type !== 'set' || !time) return;
            const out = new Date(picked);
            out.setHours(time.getHours(), time.getMinutes(), 0, 0);
            onChange(out);
          },
        });
      },
    });
  };
  return (
    <TouchableOpacity style={styles.androidBtn} onPress={openAndroid} activeOpacity={0.7}>
      <Ionicons name="calendar-outline" size={17} color={CHAT_COLORS.primary} />
      <Text style={styles.androidText}>{`${chatDayLabel(value, lang)} ${chatTimeLabel(value, lang)}`}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  iosWrap: { alignItems: 'flex-start' },
  androidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: CHAT_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  androidText: { fontSize: 14.5, color: CHAT_COLORS.text },
});
