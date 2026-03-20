import React, { useState, useEffect } from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SocialUserData } from '@smis-mentor/shared';
import { useGoogleAuth, handleGoogleAuthResponse } from '../services/googleAuthService';

interface GoogleSignInButtonProps {
  onSuccess: (socialData: SocialUserData) => void;
  onError: (error: Error) => void;
  disabled?: boolean;
}

export function GoogleSignInButton({
  onSuccess,
  onError,
  disabled = false,
}: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const { request, response, promptAsync } = useGoogleAuth();

  // 인증 응답 처리
  useEffect(() => {
    if (response) {
      handleAuthResponse();
    }
  }, [response]);

  const handleAuthResponse = async () => {
    if (!response) return;

    setLoading(true);
    try {
      const socialData = await handleGoogleAuthResponse(response);
      onSuccess(socialData);
    } catch (error) {
      onError(error as Error);
    } finally {
      setLoading(false);
    }
  };

  const handlePress = async () => {
    if (disabled || loading || !request) return;

    setLoading(true);
    try {
      await promptAsync();
    } catch (error) {
      onError(error as Error);
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        (disabled || loading || !request) && styles.buttonDisabled,
      ]}
      onPress={handlePress}
      disabled={disabled || loading || !request}
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
