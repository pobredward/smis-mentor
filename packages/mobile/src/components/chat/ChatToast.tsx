/**
 * 화면 아래 잠깐 뜨는 알림 ("복사했어요" 등)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';

export function useChatToast(bottom: number): [React.ReactNode, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(text);
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMessage(null));
    }, 1800);
  }, [opacity]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const node = message ? (
    <Animated.View pointerEvents="none" style={[styles.toast, { bottom, opacity }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  ) : null;
  return [node, show];
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.92)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    maxWidth: '85%',
  },
  text: { color: '#ffffff', fontSize: 14, textAlign: 'center' },
});
