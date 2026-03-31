import React, { useState, useEffect } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getInterviewLinks, setInterviewLinks, validateUrl, InterviewLinks } from '../services/interviewLinksService';

interface InterviewLinksManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (links: InterviewLinks) => void;
}

export function InterviewLinksManager({
  isOpen,
  onClose,
  onUpdate,
}: InterviewLinksManagerProps) {
  const [links, setLinks] = useState<InterviewLinks>({
    zoomUrl: '',
    canvaUrl: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    zoomUrl?: string;
    canvaUrl?: string;
  }>({});

  useEffect(() => {
    if (isOpen) {
      loadLinks();
    }
  }, [isOpen]);

  const loadLinks = async () => {
    try {
      setLoading(true);
      const currentLinks = await getInterviewLinks();
      setLinks(currentLinks);
      setErrors({});
    } catch (error) {
      logger.error('링크 로드 오류:', error);
      Alert.alert('오류', '링크를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const validateLinks = (): boolean => {
    const newErrors: typeof errors = {};

    if (!links.zoomUrl.trim()) {
      newErrors.zoomUrl = 'Zoom 링크를 입력해주세요.';
    } else if (!validateUrl(links.zoomUrl)) {
      newErrors.zoomUrl = '유효한 URL을 입력해주세요.';
    }

    if (!links.canvaUrl.trim()) {
      newErrors.canvaUrl = '캔바 링크를 입력해주세요.';
    } else if (!validateUrl(links.canvaUrl)) {
      newErrors.canvaUrl = '유효한 URL을 입력해주세요.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateLinks()) {
      return;
    }

    try {
      setLoading(true);
      await setInterviewLinks({
        zoomUrl: links.zoomUrl.trim(),
        canvaUrl: links.canvaUrl.trim(),
      });

      const updatedLinks = await getInterviewLinks();
      onUpdate(updatedLinks);
      Alert.alert('성공', '링크가 성공적으로 저장되었습니다.');
      onClose();
    } catch (error) {
      logger.error('링크 저장 오류:', error);
      Alert.alert('오류', '링크를 저장하는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onClose();
    setErrors({});
  };

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* 헤더 */}
          <View style={styles.header}>
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>면접 링크 관리</Text>
              <Text style={styles.headerSubtitle}>
                Zoom 회의실과 캔바 링크를 관리할 수 있습니다.
              </Text>
            </View>
            <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {/* Zoom 링크 */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Zoom 회의실 링크</Text>
              <TextInput
                value={links.zoomUrl}
                onChangeText={(text) =>
                  setLinks((prev: InterviewLinks) => ({ ...prev, zoomUrl: text }))
                }
                style={[
                  styles.input,
                  errors.zoomUrl && styles.inputError,
                ]}
                placeholder="https://us06web.zoom.us/j/..."
                placeholderTextColor="#9ca3af"
                editable={!loading}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {errors.zoomUrl && (
                <Text style={styles.errorText}>{errors.zoomUrl}</Text>
              )}
              <Text style={styles.helperText}>
                Zoom 회의실 초대 링크를 입력하세요.
              </Text>
            </View>

            {/* 캔바 링크 */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>캔바 링크</Text>
              <TextInput
                value={links.canvaUrl}
                onChangeText={(text) =>
                  setLinks((prev: InterviewLinks) => ({ ...prev, canvaUrl: text }))
                }
                style={[
                  styles.input,
                  errors.canvaUrl && styles.inputError,
                ]}
                placeholder="https://www.canva.com/design/..."
                placeholderTextColor="#9ca3af"
                editable={!loading}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {errors.canvaUrl && (
                <Text style={styles.errorText}>{errors.canvaUrl}</Text>
              )}
              <Text style={styles.helperText}>
                면접에서 사용할 캔바 디자인 링크를 입력하세요.
              </Text>
            </View>

            {/* 업데이트 정보 */}
            {links.updatedAt && (
              <View style={styles.updateInfo}>
                <Text style={styles.updateInfoText}>
                  마지막 업데이트: {links.updatedAt.toLocaleString('ko-KR')}
                </Text>
              </View>
            )}
          </ScrollView>

          {/* 버튼 */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              onPress={handleCancel}
              style={[styles.button, styles.cancelButton]}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.button, styles.saveButton]}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.saveButtonText}>저장</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
    maxHeight: 400,
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
  },
  helperText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  updateInfo: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  updateInfoText: {
    fontSize: 12,
    color: '#6b7280',
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
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
});
