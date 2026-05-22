import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Linking,
  Platform,
  BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';

interface ForceUpdateModalProps {
  visible: boolean;
  iosStoreUrl: string;
  androidStoreUrl: string;
}

export function ForceUpdateModal({ visible, iosStoreUrl, androidStoreUrl }: ForceUpdateModalProps) {
  // Android 뒤로가기 버튼 비활성화
  useEffect(() => {
    if (!visible) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [visible]);

  const handleUpdate = async () => {
    const url = Platform.OS === 'ios' ? iosStoreUrl : androidStoreUrl;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // 뒤로가기로 닫히지 않도록 차단
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconContainer}>
            <Ionicons name="refresh-circle" size={64} color="#3b82f6" />
          </View>

          <Text style={styles.title}>업데이트 필요</Text>
          <Text style={styles.description}>
            더 나은 서비스를 위해{'\n'}최신 버전으로 업데이트해주세요.
          </Text>

          <TouchableOpacity
            style={styles.updateButton}
            onPress={handleUpdate}
            activeOpacity={0.85}
          >
            <Ionicons name="download-outline" size={20} color="#ffffff" />
            <Text style={styles.updateButtonText}>
              {Platform.OS === 'ios' ? 'App Store에서 업데이트' : 'Google Play에서 업데이트'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.notice}>
            업데이트 후 앱을 다시 실행해주세요.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 28,
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    width: '100%',
    justifyContent: 'center',
    marginBottom: 16,
  },
  updateButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  notice: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
