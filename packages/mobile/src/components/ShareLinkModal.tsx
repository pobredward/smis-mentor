import React, { useState, useEffect } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authenticatedFetch } from '../utils/apiClient';

interface ShareLinkModalProps {
  visible: boolean;
  onClose: () => void;
  jobBoardId: string;
  jobBoardTitle: string;
  applicationId: string;
  applicantName: string;
  currentUserId: string;
}

interface ExpirationOption {
  label: string;
  hours: number;
}

const EXPIRATION_OPTIONS: ExpirationOption[] = [
  { label: '10분', hours: 10 / 60 },
  { label: '30분', hours: 0.5 },
  { label: '1시간', hours: 1 },
  { label: '3시간', hours: 3 },
  { label: '1일', hours: 24 },
  { label: '7일', hours: 168 },
];

export function ShareLinkModal({
  visible,
  onClose,
  jobBoardId,
  jobBoardTitle,
  applicationId,
  applicantName,
  currentUserId,
}: ShareLinkModalProps) {
  const [selectedHours, setSelectedHours] = useState<number>(1);
  const [customMinutes, setCustomMinutes] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!visible) {
      setGeneratedLink(null);
      setExpiresAt(null);
      setIsCopied(false);
      setSelectedHours(1);
      setCustomMinutes('');
    }
  }, [visible]);

  const handleGenerate = async () => {
    const finalHours = customMinutes
      ? parseInt(customMinutes, 10) / 60
      : selectedHours;

    if (customMinutes) {
      const minutes = parseInt(customMinutes, 10);
      if (isNaN(minutes) || minutes < 1 || minutes > 43200) {
        Alert.alert('입력 오류', '유효 시간은 1분에서 30일(43200분) 사이여야 합니다.');
        return;
      }
    }

    try {
      setIsGenerating(true);

      const response = await authenticatedFetch('/api/share-applicants/generate', {
        method: 'POST',
        body: JSON.stringify({
          jobBoardId,
          applicationIds: [applicationId],
          expirationHours: finalHours,
          createdBy: currentUserId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '링크 생성에 실패했습니다.');
      }

      const data = await response.json();
      setGeneratedLink(data.shareUrl);
      setExpiresAt(data.expiresAt);
    } catch (error) {
      logger.error('공유 링크 생성 오류:', error);
      Alert.alert('오류', error instanceof Error ? error.message : '링크 생성에 실패했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = () => {
    if (!generatedLink) return;
    Clipboard.setString(generatedLink);
    setIsCopied(true);
    Alert.alert('복사 완료', '링크가 클립보드에 복사되었습니다.');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const formatExpiresAt = (isoString: string): string => {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}년 ${month}월 ${day}일 ${hours}:${minutes}`;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.modalContainer}>
          {/* 헤더 */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>지원자 정보 공유 링크 생성</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="닫기" accessibilityRole="button">
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {!generatedLink ? (
              <>
                {/* 안내 */}
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle" size={18} color="#2563eb" style={styles.infoIcon} />
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoTitle}>임시 공유 링크란?</Text>
                    <Text style={styles.infoItem}>· 관리자가 아니어도 링크만 있으면 누구나 볼 수 있습니다</Text>
                    <Text style={styles.infoItem}>· 설정한 시간이 지나면 자동으로 만료됩니다</Text>
                    <Text style={styles.infoItem}>· 민감한 정보가 포함되어 있으니 신중하게 공유하세요</Text>
                  </View>
                </View>

                {/* 공유 대상 */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>공유 정보</Text>
                  <View style={styles.infoCard}>
                    <Text style={styles.infoCardTitle} numberOfLines={2}>{jobBoardTitle}</Text>
                    <Text style={styles.infoCardSub}>
                      공유할 지원자:{' '}
                      <Text style={styles.infoCardHighlight}>{applicantName}</Text>
                    </Text>
                    <Text style={styles.infoCardHint}>
                      기본정보, 학력, 경력, 자기소개, 평가점수가 공유됩니다
                    </Text>
                  </View>
                </View>

                {/* 만료 시간 */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>링크 유효 시간</Text>
                  <View style={styles.optionGrid}>
                    {EXPIRATION_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.label}
                        style={[
                          styles.optionButton,
                          selectedHours === opt.hours && !customMinutes && styles.optionButtonActive,
                        ]}
                        onPress={() => {
                          setSelectedHours(opt.hours);
                          setCustomMinutes('');
                        }}
                      >
                        <Text
                          style={[
                            styles.optionButtonText,
                            selectedHours === opt.hours && !customMinutes && styles.optionButtonTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.customInputSection}>
                    <Text style={styles.customInputLabel}>직접 입력</Text>
                    <View style={styles.customInputRow}>
                      <TextInput
                        style={styles.customInput}
                        placeholder="분 단위로 입력 (예: 45)"
                        placeholderTextColor="#9ca3af"
                        keyboardType="number-pad"
                        value={customMinutes}
                        onChangeText={setCustomMinutes}
                        onFocus={() => setSelectedHours(0)}
                      />
                      <Text style={styles.customInputUnit}>분</Text>
                    </View>
                    <Text style={styles.customInputHint}>1분 ~ 30일(43200분)까지 설정 가능</Text>
                  </View>
                </View>
              </>
            ) : (
              <>
                {/* 생성 완료 */}
                <View style={styles.successBox}>
                  <Ionicons name="checkmark-circle" size={18} color="#16a34a" style={styles.infoIcon} />
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.successTitle}>링크가 생성되었습니다!</Text>
                    <Text style={styles.successSub}>이 링크를 통해 지원자 정보를 공유할 수 있습니다.</Text>
                  </View>
                </View>

                {/* 만료 시간 */}
                {expiresAt && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>만료 시간</Text>
                    <Text style={styles.expiresText}>{formatExpiresAt(expiresAt)}</Text>
                  </View>
                )}

                {/* 링크 */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>공유 링크</Text>
                  <View style={styles.linkBox}>
                    <Text style={styles.linkText} numberOfLines={2} selectable>
                      {generatedLink}
                    </Text>
                  </View>
                </View>

                {/* 주의 사항 */}
                <View style={styles.warningBox}>
                  <Ionicons name="warning" size={18} color="#d97706" style={styles.infoIcon} />
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.warningTitle}>주의사항</Text>
                    <Text style={styles.infoItem}>· 이 링크는 만료 시간까지 누구나 접근할 수 있습니다</Text>
                    <Text style={styles.infoItem}>· 개인정보가 포함되어 있으니 신중하게 공유하세요</Text>
                  </View>
                </View>
              </>
            )}
          </ScrollView>

          {/* 푸터 버튼 */}
          <View style={styles.footer}>
            {!generatedLink ? (
              <>
                <TouchableOpacity
                  style={[styles.footerButton, styles.cancelButton]}
                  onPress={onClose}
                  disabled={isGenerating}
                >
                  <Text style={styles.cancelButtonText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.footerButton, styles.generateButton, isGenerating && styles.disabledButton]}
                  onPress={handleGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.generateButtonText}>링크 생성</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.footerButton, styles.cancelButton]}
                  onPress={onClose}
                >
                  <Text style={styles.cancelButtonText}>닫기</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.footerButton, isCopied ? styles.copiedButton : styles.generateButton]}
                  onPress={handleCopyLink}
                >
                  <Ionicons
                    name={isCopied ? 'checkmark' : 'copy-outline'}
                    size={16}
                    color="#ffffff"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.generateButtonText}>
                    {isCopied ? '복사됨' : '링크 복사'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
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
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    width: '92%',
    maxWidth: 420,
    maxHeight: '88%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  closeButton: {
    padding: 4,
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  infoIcon: {
    marginRight: 8,
    marginTop: 1,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 4,
  },
  infoItem: {
    fontSize: 12,
    color: '#1d4ed8',
    lineHeight: 18,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  infoCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  infoCardSub: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  infoCardHighlight: {
    fontWeight: '700',
    color: '#f59e0b',
  },
  infoCardHint: {
    fontSize: 11,
    color: '#9ca3af',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    minWidth: '30%',
    alignItems: 'center',
  },
  optionButtonActive: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  optionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  optionButtonTextActive: {
    color: '#ffffff',
  },
  customInputSection: {
    marginTop: 4,
  },
  customInputLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 6,
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  customInputUnit: {
    fontSize: 14,
    color: '#6b7280',
  },
  customInputHint: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 4,
  },
  successBox: {
    flexDirection: 'row',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#15803d',
    marginBottom: 2,
  },
  successSub: {
    fontSize: 12,
    color: '#16a34a',
  },
  expiresText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  linkBox: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
  },
  linkText: {
    fontSize: 12,
    color: '#374151',
    lineHeight: 18,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400e',
    marginBottom: 4,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  footerButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  generateButton: {
    backgroundColor: '#2563eb',
  },
  copiedButton: {
    backgroundColor: '#16a34a',
  },
  generateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  disabledButton: {
    backgroundColor: '#93c5fd',
  },
});
