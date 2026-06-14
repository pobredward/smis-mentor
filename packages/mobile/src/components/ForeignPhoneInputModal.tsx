import React, { useState, useEffect } from 'react';
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
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const COUNTRY_CODES = [
  { code: '+82', country: 'South Korea', flag: '🇰🇷' },
  { code: '+1', country: 'USA/Canada', flag: '🇺🇸' },
  { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
  { code: '+353', country: 'Ireland', flag: '🇮🇪' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
  { code: '+64', country: 'New Zealand', flag: '🇳🇿' },
  { code: '+27', country: 'South Africa', flag: '🇿🇦' },
];

interface ForeignPhoneInputModalProps {
  visible: boolean;
  socialProviderName: string;
  defaultName?: string;
  onSubmit: (data: {
    firstName: string;
    lastName: string;
    middleName?: string;
    countryCode: string;
    phoneNumber: string;
  }) => void;
  onCancel: () => void;
}

export function ForeignPhoneInputModal({
  visible,
  socialProviderName,
  defaultName = '',
  onSubmit,
  onCancel,
}: ForeignPhoneInputModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [countryCode, setCountryCode] = useState('+82');
  const [phone, setPhone] = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  // 소셜 로그인에서 받아온 이름을 first/last로 분리
  useEffect(() => {
    if (visible && defaultName) {
      const parts = defaultName.trim().split(/\s+/);
      if (parts.length >= 2) {
        setFirstName(parts[0]);
        setLastName(parts[parts.length - 1]);
        if (parts.length > 2) {
          setMiddleName(parts.slice(1, -1).join(' '));
        }
      } else if (parts.length === 1) {
        setFirstName(parts[0]);
        setLastName('');
      }
    }
  }, [visible, defaultName]);

  const handleSubmit = () => {
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const cleanedPhone = phone.replace(/[^0-9]/g, '');

    if (!trimmedFirst || trimmedFirst.length < 1) {
      Alert.alert('Input Error', 'Please enter your First Name.');
      return;
    }
    if (!trimmedLast || trimmedLast.length < 1) {
      Alert.alert('Input Error', 'Please enter your Last Name.');
      return;
    }
    if (!cleanedPhone || cleanedPhone.length < 7) {
      Alert.alert('Input Error', 'Please enter a valid phone number.');
      return;
    }

    onSubmit({
      firstName: trimmedFirst,
      lastName: trimmedLast,
      middleName: middleName.trim() || undefined,
      countryCode,
      phoneNumber: cleanedPhone,
    });

    setFirstName('');
    setLastName('');
    setMiddleName('');
    setCountryCode('+82');
    setPhone('');
  };

  const handleCancel = () => {
    setFirstName('');
    setLastName('');
    setMiddleName('');
    setCountryCode('+82');
    setPhone('');
    onCancel();
  };

  const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode) ?? COUNTRY_CODES[0];

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
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Ionicons name="globe-outline" size={24} color="#10b981" />
              </View>
              <Text style={styles.title}>Identity Verification</Text>
              <Text style={styles.description}>
                To sign up with {socialProviderName},{'\n'}
                please enter your name and phone number.
              </Text>
            </View>

            {/* First Name */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>First Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. John"
                placeholderTextColor="#9ca3af"
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
              />
            </View>

            {/* Middle Name (선택) */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>
                Middle Name{' '}
                <Text style={styles.optionalLabel}>(optional)</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Michael"
                placeholderTextColor="#9ca3af"
                value={middleName}
                onChangeText={setMiddleName}
                autoCapitalize="words"
              />
            </View>

            {/* Last Name */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Smith"
                placeholderTextColor="#9ca3af"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
              />
            </View>

            {/* Phone Number */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.phoneRow}>
                {/* 국가코드 선택 */}
                <TouchableOpacity
                  style={styles.countryButton}
                  onPress={() => setShowCountryPicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
                  <Text style={styles.countryCode}>{selectedCountry.code}</Text>
                  <Ionicons name="chevron-down" size={14} color="#64748b" />
                </TouchableOpacity>

                <TextInput
                  style={styles.phoneInput}
                  placeholder="Phone number"
                  placeholderTextColor="#9ca3af"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  maxLength={15}
                />
              </View>
              <Text style={styles.hint}>Enter digits only, no dashes</Text>
            </View>

            <View style={styles.buttons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={handleCancel}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.submitButton]}
                onPress={handleSubmit}
                activeOpacity={0.7}
              >
                <Text style={styles.submitButtonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* 국가코드 선택 Modal */}
        <Modal
          visible={showCountryPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowCountryPicker(false)}
        >
          <TouchableOpacity
            style={styles.pickerBackdrop}
            activeOpacity={1}
            onPress={() => setShowCountryPicker(false)}
          />
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerTitle}>Select Country Code</Text>
            {COUNTRY_CODES.map(item => (
              <TouchableOpacity
                key={item.code}
                style={[
                  styles.pickerItem,
                  item.code === countryCode && styles.pickerItemSelected,
                ]}
                onPress={() => {
                  setCountryCode(item.code);
                  setShowCountryPicker(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.pickerFlag}>{item.flag}</Text>
                <Text style={styles.pickerCountry}>{item.country}</Text>
                <Text style={styles.pickerCode}>{item.code}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Modal>
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
    width: '90%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
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
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 6,
  },
  optionalLabel: {
    fontWeight: '400',
    color: '#94a3b8',
    fontSize: 12,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1e293b',
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  countryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 4,
  },
  countryFlag: {
    fontSize: 18,
  },
  countryCode: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '600',
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
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
    marginTop: 8,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  submitButton: {
    backgroundColor: '#10b981',
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    paddingBottom: 40,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 16,
    textAlign: 'center',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 12,
  },
  pickerItemSelected: {
    backgroundColor: '#ecfdf5',
  },
  pickerFlag: {
    fontSize: 24,
  },
  pickerCountry: {
    flex: 1,
    fontSize: 15,
    color: '#1e293b',
  },
  pickerCode: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
});
