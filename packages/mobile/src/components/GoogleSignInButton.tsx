import React, { useState } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SocialUserData } from '@smis-mentor/shared';
import { signInWithGoogleDirect } from '../services/googleAuthService';

interface GoogleSignInButtonProps {
  onSuccess: (socialData: SocialUserData) => void;
  onError: (error: Error) => void;
  disabled?: boolean;
}

/**
 * Google 로그인 버튼
 * - Development Build: Native SDK 자동 사용
 * - Expo Go: OAuth 2.0 자동 사용
 */
export function GoogleSignInButton({
  onSuccess,
  onError,
  disabled = false,
}: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (disabled || loading) return;

    setLoading(true);
    try {
      const result = await signInWithGoogleDirect();
      onSuccess(result.socialData);
    } catch (error: any) {
      logger.error('Google 로그인 실패:', error);
      onError(error);
    } finally {
      setLoading(false);
    }
  };

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
        <ActivityIndicator color="#4285F4" />
      ) : (
        <View style={styles.content}>
          <Ionicons name="logo-google" size={20} color="#4285F4" />
          <Text style={styles.text}>Google로 계속하기</Text>
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
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dadce0',
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
    color: '#3c4043',
  },
});
