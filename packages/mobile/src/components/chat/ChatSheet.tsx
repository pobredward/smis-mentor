/**
 * 아래에서 올라오는 시트 (메뉴 · 신고 · 대화 상대 · 새 1:1 대화)
 */
import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CHAT_COLORS } from './chatTheme';

interface ChatSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** 화면 높이의 이 비율까지 (목록 시트는 0.85 정도) — 없으면 내용 높이 */
  heightRatio?: number;
  children: React.ReactNode;
}

export function ChatSheet({ visible, onClose, title, heightRatio, children }: ChatSheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {/* 신고 내용 입력 등 — 키보드에 가리지 않게 (Android 창이 이미 줄어들면 덧붙이지 않는다) */}
      <KeyboardAvoidingView style={[styles.fill, { paddingTop: insets.top + 8 }]} behavior="padding">
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 12) },
            heightRatio ? { height: Math.round(height * heightRatio) } : { maxHeight: Math.round(height * 0.85) },
          ]}
        >
          <View style={styles.grabber} />
          {title ? (
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.close}>
                <Ionicons name="close" size={22} color={CHAT_COLORS.sub} />
              </TouchableOpacity>
            </View>
          ) : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** 메뉴 한 줄 */
export function ChatSheetOption({
  icon,
  label,
  onPress,
  destructive,
  disabled,
}: {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const color = destructive ? CHAT_COLORS.danger : CHAT_COLORS.text;
  return (
    <TouchableOpacity style={[styles.option, disabled && { opacity: 0.4 }]} onPress={onPress} disabled={disabled}>
      {icon ? <Ionicons name={icon} size={20} color={color} style={styles.optionIcon} /> : null}
      <Text style={[styles.optionText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: {
    // 키보드가 올라오면 화면에 맞게 줄어든다
    flexShrink: 1,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    overflow: 'hidden',
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', marginBottom: 6 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: CHAT_COLORS.text },
  close: { padding: 2 },
  option: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
  optionIcon: { marginRight: 14 },
  optionText: { fontSize: 16 },
});
