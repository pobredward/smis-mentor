import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontWeight, borderRadius } from '../styles/theme';

interface FormInputProps extends TextInputProps {
  label?: string;
  error?: string;
  showPasswordToggle?: boolean;
  containerStyle?: ViewStyle;
  labelStyle?: TextStyle;
  inputStyle?: ViewStyle;
  errorStyle?: TextStyle;
}

export function FormInput({
  label,
  error,
  showPasswordToggle = false,
  containerStyle,
  labelStyle,
  inputStyle,
  errorStyle,
  secureTextEntry,
  ...props
}: FormInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPasswordInput = secureTextEntry || showPasswordToggle;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text style={[styles.label, labelStyle]} accessibilityLabel={label}>
          {label}
        </Text>
      )}
      <View style={styles.inputContainer}>
        <TextInput
          style={[
            styles.input,
            error && styles.inputError,
            inputStyle,
          ]}
          secureTextEntry={isPasswordInput && !showPassword}
          placeholderTextColor={colors.secondary[400]}
          accessibilityLabel={label}
          accessibilityHint={error}
          accessibilityInvalid={!!error}
          {...props}
        />
        {isPasswordInput && showPasswordToggle && (
          <TouchableOpacity
            style={styles.passwordToggle}
            onPress={() => setShowPassword(!showPassword)}
            accessibilityLabel={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
            accessibilityRole="button"
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.secondary[600]}
            />
          </TouchableOpacity>
        )}
      </View>
      {error && (
        <Text 
          style={[styles.error, errorStyle]} 
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.secondary[700],
    marginBottom: spacing.xs,
  },
  inputContainer: {
    position: 'relative',
  },
  input: {
    width: '100%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.secondary[300],
    borderRadius: borderRadius.md,
    fontSize: fontSize.base,
    color: colors.secondary[900],
    backgroundColor: colors.white,
  },
  inputError: {
    borderColor: colors.danger[500],
  },
  passwordToggle: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
  },
  error: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.danger[600],
  },
});
