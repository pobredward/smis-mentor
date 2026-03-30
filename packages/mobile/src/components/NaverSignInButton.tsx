import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import type { SocialUserData } from '@smis-mentor/shared';
import { signInWithNaver } from '../services/naverAuthService';

interface NaverSignInButtonProps {
  onSuccess: (socialData: SocialUserData) => void;
  onError: (error: Error) => void;
  disabled?: boolean;
}

/**
 * 네이버 로그인 버튼
 * 
 * Expo Go: OAuth 2.0 방식
 * Development Build: Native SDK 사용 가능
 */
export function NaverSignInButton({
  onSuccess,
  onError,
  disabled = false,
}: NaverSignInButtonProps) {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (disabled || loading) return;

    setLoading(true);
    try {
      const socialData = await signInWithNaver();
      onSuccess(socialData);
    } catch (error: any) {
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
        <ActivityIndicator color="#ffffff" />
      ) : (
        <View style={styles.content}>
          <Text style={styles.icon}>N</Text>
          <Text style={styles.text}>네이버로 계속하기</Text>
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
    backgroundColor: '#03C75A',
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
  icon: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  text: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
  },
});
