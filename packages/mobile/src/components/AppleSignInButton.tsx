import React, { useState, useEffect } from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SocialUserData } from '@smis-mentor/shared';
import { signInWithApple, isAppleAuthAvailable } from '../services/appleAuthService';

interface AppleSignInButtonProps {
  onSuccess: (socialData: SocialUserData) => void;
  onError: (error: Error) => void;
  disabled?: boolean;
}

/**
 * Apple 로그인 버튼
 * - iOS 13+ 에서만 표시됨
 * - Expo Go에서도 동작 (Native SDK)
 */
export function AppleSignInButton({
  onSuccess,
  onError,
  disabled = false,
}: AppleSignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);

  // iOS가 아니면 버튼을 렌더링하지 않음
  useEffect(() => {
    const checkAvailability = async () => {
      const available = await isAppleAuthAvailable();
      setIsAvailable(available);
    };
    
    checkAvailability();
  }, []);

  const handlePress = async () => {
    if (disabled || loading) return;

    setLoading(true);
    try {
      const result = await signInWithApple();
      onSuccess(result);
    } catch (error: any) {
      console.error('Apple 로그인 실패:', error);
      onError(error);
    } finally {
      setLoading(false);
    }
  };

  // iOS가 아니거나 애플 로그인을 사용할 수 없으면 버튼을 표시하지 않음
  if (!isAvailable) {
    return null;
  }

  return (
    <TouchableOpacity
      style={[
        styles.button,
        (disabled || loading) && styles.buttonDisabled,
      ]}
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <View style={styles.content}>
          <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
          <Text style={styles.text}>Apple로 계속하기</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  text: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});
