import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TemplateSelector } from './TemplateSelector';
import { TemplateType } from '@smis-mentor/shared';

interface SMSMessageBoxProps {
  title: string;
  type: TemplateType;
  message: string;
  onMessageChange: (message: string) => void;
  fromNumber: '01076567933' | '01067117933';
  onFromNumberChange: (number: '01076567933' | '01067117933') => void;
  currentJobBoardId: string;
  onSave: () => void;
  onSend: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isSending: boolean;
  backgroundColor?: string;
  borderColor?: string;
  sendButtonColor?: string;
  buttonColor?: string;
}

export const SMSMessageBox: React.FC<SMSMessageBoxProps> = ({
  title,
  type,
  message,
  onMessageChange,
  fromNumber,
  onFromNumberChange,
  currentJobBoardId,
  onSave,
  onSend,
  onCancel,
  isSaving,
  isSending,
  backgroundColor = '#fef3c7',
  borderColor = '#f59e0b',
  sendButtonColor = '#f59e0b',
}) => {
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  const handleTemplateSelect = (content: string) => {
    onMessageChange(content);
  };

  return (
    <>
      <View
        style={[
          styles.container,
          { backgroundColor, borderColor, borderWidth: 1 },
        ]}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity
            onPress={() => setShowTemplateSelector(true)}
            style={styles.templateButton}
          >
            <Ionicons name="add-circle-outline" size={16} color="#92400e" />
            <Text style={styles.templateButtonText}>이전 템플릿 불러오기</Text>
          </TouchableOpacity>
        </View>

        {/* 메시지 입력 */}
        <TextInput
          value={message}
          onChangeText={onMessageChange}
          style={styles.textInput}
          multiline
          numberOfLines={6}
          placeholder="메시지 내용을 입력하세요..."
          placeholderTextColor="#9ca3af"
          textAlignVertical="top"
        />

        {/* 발신번호 선택 */}
        <View style={styles.radioContainer}>
          <Text style={styles.radioLabel}>발신번호 선택</Text>
          <View style={styles.radioGroup}>
            <TouchableOpacity
              onPress={() => onFromNumberChange('01076567933')}
              style={styles.radioOption}
            >
              <View style={styles.radioCircle}>
                {fromNumber === '01076567933' && (
                  <View style={styles.radioSelected} />
                )}
              </View>
              <Text style={styles.radioText}>010-7656-7933 (대표)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => onFromNumberChange('01067117933')}
              style={styles.radioOption}
            >
              <View style={styles.radioCircle}>
                {fromNumber === '01067117933' && (
                  <View style={styles.radioSelected} />
                )}
              </View>
              <Text style={styles.radioText}>010-6711-7933</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 버튼 그룹 */}
        <View style={styles.buttonGroup}>
          <TouchableOpacity
            onPress={onCancel}
            style={[styles.button, styles.cancelButton]}
            disabled={isSaving || isSending}
          >
            <Text style={styles.cancelButtonText}>취소</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onSave}
            style={[styles.button, styles.saveButton]}
            disabled={isSaving || isSending}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.saveButtonText}>저장</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onSend}
            style={[
              styles.button,
              styles.sendButton,
              { backgroundColor: sendButtonColor },
            ]}
            disabled={isSaving || isSending}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.sendButtonText}>전송</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* 템플릿 선택기 모달 */}
      <TemplateSelector
        visible={showTemplateSelector}
        type={type}
        currentJobBoardId={currentJobBoardId}
        onSelect={handleTemplateSelect}
        onClose={() => setShowTemplateSelector(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  templateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fde68a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  templateButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#92400e',
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 120,
    color: '#111827',
  },
  radioContainer: {
    marginTop: 16,
  },
  radioLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
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
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#f59e0b',
  },
  radioText: {
    fontSize: 14,
    color: '#374151',
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  saveButton: {
    backgroundColor: '#3b82f6',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  sendButton: {
    backgroundColor: '#f59e0b',
  },
  sendButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});
