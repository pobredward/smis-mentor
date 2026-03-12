import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { TemplateType } from '@smis-mentor/shared';
import { TemplateSelector } from './TemplateSelector';

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
  buttonColor = '#f59e0b',
}) => {
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  const handleTemplateSelect = (content: string) => {
    onMessageChange(content);
    setShowTemplateSelector(false);
  };

  return (
    <>
      <View style={[styles.container, { backgroundColor }]}>
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity
            style={styles.loadTemplateButton}
            onPress={() => setShowTemplateSelector(true)}
          >
            <Text style={styles.loadTemplateButtonText}>📋 이전 템플릿</Text>
          </TouchableOpacity>
        </View>

        {/* 메시지 입력 */}
        <TextInput
          style={styles.textInput}
          value={message}
          onChangeText={onMessageChange}
          placeholder="메시지 내용을 입력하세요..."
          placeholderTextColor="#9ca3af"
          multiline
          numberOfLines={6}
        />

        {/* 발신번호 선택 */}
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

        {/* 버튼 */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={onCancel}
            disabled={isSaving || isSending}
          >
            <Text style={styles.buttonTextSecondary}>취소</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonGray]}
            onPress={onSave}
            disabled={isSaving || isSending}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonTextWhite}>템플릿 저장</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: buttonColor }]}
            onPress={onSend}
            disabled={isSaving || isSending}
          >
            {isSending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonTextWhite}>SMS 전송</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* 템플릿 선택 모달 */}
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
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  loadTemplateButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fcd34d',
    borderRadius: 6,
  },
  loadTemplateButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#78350f',
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    padding: 10,
    fontSize: 13,
    color: '#111827',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  charInfoText: {
    fontSize: 11,
    color: '#6b7280',
  },
  charInfoWarning: {
    color: '#f59e0b',
    fontWeight: '600',
  },
  charInfoError: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: '600',
  },
  fromNumberSection: {
    marginTop: 12,
  },
  fromNumberLabel: {
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
    gap: 6,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#6b7280',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#f59e0b',
  },
  radioLabel: {
    fontSize: 12,
    color: '#374151',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#f3f4f6',
  },
  buttonGray: {
    backgroundColor: '#6b7280',
  },
  buttonTextSecondary: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  buttonTextWhite: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
});
