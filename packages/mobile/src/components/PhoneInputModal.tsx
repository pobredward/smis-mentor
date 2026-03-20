import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PhoneInputModalProps {
  visible: boolean;
  socialProviderName: string; // "Google", "Apple" 등
  onSubmit: (phone: string) => void;
  onCancel: () => void;
}

export function PhoneInputModal({
  visible,
  socialProviderName,
  onSubmit,
  onCancel,
}: PhoneInputModalProps) {
  const [phone, setPhone] = useState('');

  const handleSubmit = () => {
    // 전화번호 유효성 검사
    const cleanedPhone = phone.replace(/[^0-9]/g, '');
    
    if (!cleanedPhone || cleanedPhone.length < 10 || cleanedPhone.length > 11) {
      Alert.alert('입력 오류', '올바른 휴대폰 번호를 입력해주세요.');
      return;
    }

    onSubmit(cleanedPhone);
    setPhone(''); // 초기화
  };

  const handleCancel = () => {
    setPhone('');
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleCancel}
        />
        
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="call-outline" size={24} color="#3b82f6" />
            </View>
            <Text style={styles.title}>휴대폰 번호 입력</Text>
            <Text style={styles.description}>
              {socialProviderName} 계정으로 회원가입하려면{'\n'}
              휴대폰 번호를 입력해주세요.{'\n\n'}
              관리자가 등록한 계정이 있는지 확인합니다.
            </Text>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>휴대폰 번호</Text>
            <TextInput
              style={styles.input}
              placeholder="01012345678"
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              maxLength={11}
              autoFocus
            />
            <Text style={styles.hint}>'-' 없이 숫자만 입력하세요</Text>
          </View>

          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>취소</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.submitButton]}
              onPress={handleSubmit}
              disabled={!phone}
              activeOpacity={0.7}
            >
              <Text style={styles.submitButtonText}>확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    width: '85%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  hint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  submitButton: {
    backgroundColor: '#3b82f6',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
