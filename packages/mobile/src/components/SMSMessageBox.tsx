import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';

interface SMSMessageBoxProps {
  message: string;
  onMessageChange: (text: string) => void;
  fromNumber: '01076567933' | '01067117933';
  onFromNumberChange: (number: '01076567933' | '01067117933') => void;
  onSave: () => void;
  onSend: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isSending: boolean;
  backgroundColor: string;
  buttonColor: string;
  title: string;
}

export const SMSMessageBox: React.FC<SMSMessageBoxProps> = ({
  message,
  onMessageChange,
  fromNumber,
  onFromNumberChange,
  onSave,
  onSend,
  onCancel,
  isSaving,
  isSending,
  backgroundColor,
  buttonColor,
  title,
}) => {
  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Text style={styles.title}>{title}</Text>
      
      <TextInput
        style={styles.textarea}
        value={message}
        onChangeText={onMessageChange}
        multiline
        numberOfLines={6}
        textAlignVertical="top"
        placeholder="SMS 내용을 입력하세요"
      />
      
      <View style={styles.fromNumberSection}>
        <Text style={styles.fromNumberLabel}>발신번호 선택</Text>
        <View style={styles.radioGroup}>
          <TouchableOpacity
            style={styles.radioOption}
            onPress={() => onFromNumberChange('01076567933')}
          >
            <View style={styles.radio}>
              {fromNumber === '01076567933' && <View style={styles.radioSelected} />}
            </View>
            <Text style={styles.radioLabel}>010-7656-7933 (대표)</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.radioOption}
            onPress={() => onFromNumberChange('01067117933')}
          >
            <View style={styles.radio}>
              {fromNumber === '01067117933' && <View style={styles.radioSelected} />}
            </View>
            <Text style={styles.radioLabel}>010-6711-7933</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.cancelButton]}
          onPress={onCancel}
          disabled={isSaving || isSending}
        >
          <Text style={styles.cancelButtonText}>취소</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, styles.saveButton]}
          onPress={onSave}
          disabled={isSaving || isSending}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>저장</Text>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, styles.sendButton, { backgroundColor: buttonColor }]}
          onPress={onSend}
          disabled={isSaving || isSending}
        >
          {isSending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>전송</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    color: '#374151',
  },
  textarea: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    minHeight: 120,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  fromNumberSection: {
    marginBottom: 16,
  },
  fromNumberLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#374151',
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 16,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#6b7280',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3b82f6',
  },
  radioLabel: {
    fontSize: 14,
    color: '#374151',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  saveButton: {
    backgroundColor: '#6b7280',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  sendButton: {
    backgroundColor: '#3b82f6',
  },
  sendButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
