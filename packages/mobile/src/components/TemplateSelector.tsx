import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { getTemplatesWithJobBoardInfo, TemplateType } from '@smis-mentor/shared';
import { db } from '../config/firebase';

interface TemplateSelectorProps {
  visible: boolean;
  type: TemplateType;
  currentJobBoardId: string;
  onSelect: (content: string) => void;
  onClose: () => void;
}

interface TemplateWithJobBoard {
  id?: string;
  content: string;
  jobBoardTitle: string;
  jobBoardGeneration: string | null;
  refJobBoardId?: string;
  updatedAt: any;
}

const getTypeLabel = (type: TemplateType): string => {
  const labels: Record<TemplateType, string> = {
    document_pass: '서류 합격',
    document_fail: '서류 불합격',
    interview_scheduled: '면접 예정',
    interview_pass: '면접 합격',
    interview_fail: '면접 불합격',
    final_pass: '최종 합격',
    final_fail: '최종 불합격',
  };
  return labels[type];
};

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  visible,
  type,
  currentJobBoardId,
  onSelect,
  onClose,
}) => {
  const [templates, setTemplates] = useState<TemplateWithJobBoard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadTemplates();
    }
  }, [visible, type]);

  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      const data = await getTemplatesWithJobBoardInfo(db, type);
      
      // 현재 공고는 제외하고 표시
      const filtered = data.filter((t: any) => t.refJobBoardId !== currentJobBoardId);
      setTemplates(filtered);
    } catch (error) {
      console.error('템플릿 목록 로드 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = () => {
    const template = templates.find(t => t.id === selectedTemplateId);
    if (template) {
      onSelect(template.content);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp || !timestamp.toDate) return '';
    const date = timestamp.toDate();
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* 헤더 */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              이전 템플릿 불러오기 - {getTypeLabel(type)}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 템플릿 목록 */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#f59e0b" />
            </View>
          ) : templates.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>이전 공고의 템플릿이 없습니다.</Text>
            </View>
          ) : (
            <ScrollView style={styles.templateList}>
              {templates.map((template) => (
                <TouchableOpacity
                  key={template.id}
                  onPress={() => setSelectedTemplateId(template.id || null)}
                  style={[
                    styles.templateItem,
                    selectedTemplateId === template.id && styles.templateItemSelected,
                  ]}
                >
                  <View style={styles.templateHeader}>
                    <View style={styles.templateHeaderLeft}>
                      <Text style={styles.templateTitle}>{template.jobBoardTitle}</Text>
                      {template.jobBoardGeneration && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{template.jobBoardGeneration}</Text>
                        </View>
                      )}
                      {!template.refJobBoardId && (
                        <View style={[styles.badge, styles.badgeGray]}>
                          <Text style={styles.badgeTextGray}>공통</Text>
                        </View>
                      )}
                    </View>
                    {selectedTemplateId === template.id && (
                      <Text style={styles.checkMark}>✓</Text>
                    )}
                  </View>

                  <Text style={styles.templateDate}>
                    마지막 수정: {formatDate(template.updatedAt)}
                  </Text>

                  {/* 미리보기 */}
                  <View style={styles.previewContainer}>
                    <Text style={styles.previewText} numberOfLines={4}>
                      {template.content}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* 버튼 */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={onClose}
            >
              <Text style={styles.buttonTextSecondary}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                styles.buttonPrimary,
                !selectedTemplateId && styles.buttonDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!selectedTemplateId}
            >
              <Text style={styles.buttonTextPrimary}>선택한 템플릿 사용</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

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
    width: '100%',
    height: '70%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#9ca3af',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
  },
  templateList: {
    maxHeight: 350,
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  templateItem: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  templateItemSelected: {
    borderColor: '#f59e0b',
    backgroundColor: '#fef3c7',
    borderWidth: 2,
  },
  templateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  templateHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  templateTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#dbeafe',
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1e40af',
  },
  badgeGray: {
    backgroundColor: '#f3f4f6',
  },
  badgeTextGray: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
  },
  checkMark: {
    fontSize: 20,
    color: '#f59e0b',
    fontWeight: '700',
  },
  templateDate: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 8,
  },
  previewContainer: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    padding: 10,
    marginBottom: 6,
  },
  previewText: {
    fontSize: 12,
    color: '#374151',
    lineHeight: 18,
  },
  charCount: {
    fontSize: 11,
    color: '#6b7280',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#f3f4f6',
  },
  buttonPrimary: {
    backgroundColor: '#f59e0b',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonTextSecondary: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  buttonTextPrimary: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});
