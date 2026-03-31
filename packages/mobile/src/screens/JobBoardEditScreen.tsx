import React, { useState, useEffect, useRef } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {
  RichEditor,
  RichToolbar,
  actions,
} from 'react-native-pell-rich-editor';
import {
  doc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { JobBoardWithId, JobCodeWithId } from '../services/jobBoardService';

interface JobBoardEditScreenProps {
  jobBoard: JobBoardWithId;
  jobCode: JobCodeWithId | null;
  onBack: () => void;
  onSave: () => void;
}

export function JobBoardEditScreen({
  jobBoard,
  jobCode,
  onBack,
  onSave,
}: JobBoardEditScreenProps) {
  const [title, setTitle] = useState(jobBoard.title);
  const [description, setDescription] = useState(jobBoard.description);
  const [status, setStatus] = useState<'active' | 'closed'>(jobBoard.status);
  const [isSaving, setIsSaving] = useState(false);
  const [editorHeight, setEditorHeight] = useState(400);
  const richText = useRef<RichEditor>(null);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('입력 오류', '공고 제목을 입력해주세요.');
      return;
    }

    // 리치 에디터에서 HTML 가져오기
    const htmlContent = await richText.current?.getContentHtml();
    if (!htmlContent || htmlContent.trim() === '<p></p>' || htmlContent.trim() === '') {
      Alert.alert('입력 오류', '공고 내용을 입력해주세요.');
      return;
    }

    Alert.alert(
      '공고 수정',
      '공고를 수정하시겠습니까?',
      [
        {
          text: '취소',
          style: 'cancel',
        },
        {
          text: '저장',
          onPress: async () => {
            try {
              setIsSaving(true);
              const docRef = doc(db, 'jobBoards', jobBoard.id);
              await updateDoc(docRef, {
                title: title.trim(),
                description: htmlContent,
                status,
                updatedAt: Timestamp.now(),
              });

              Alert.alert('성공', '공고가 수정되었습니다.');
              onSave();
            } catch (error) {
              logger.error('공고 수정 오류:', error);
              Alert.alert('오류', '공고 수정 중 오류가 발생했습니다.');
            } finally {
              setIsSaving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backIconButton}>
          <Text style={styles.backIconText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>공고 수정</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* 업무 정보 (읽기 전용) */}
        {jobCode && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconText}>💼</Text>
              </View>
              <Text style={styles.cardTitle}>업무 정보 (읽기 전용)</Text>
            </View>
            <View style={styles.cardContent}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>기수</Text>
                <Text style={styles.infoValue}>{jobCode.generation}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>업무 코드</Text>
                <Text style={styles.infoValue}>{jobCode.code}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>업무명</Text>
                <Text style={styles.infoValue}>{jobCode.name}</Text>
              </View>
            </View>
          </View>
        )}

        {/* 공고 상태 */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>공고 상태</Text>
          </View>
          <View style={styles.cardContent}>
            <View style={styles.statusButtons}>
              <TouchableOpacity
                style={[
                  styles.statusButton,
                  status === 'active' && styles.statusButtonActive,
                ]}
                onPress={() => setStatus('active')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.statusButtonText,
                    status === 'active' && styles.statusButtonTextActive,
                  ]}
                >
                  모집중
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.statusButton,
                  status === 'closed' && styles.statusButtonClosed,
                ]}
                onPress={() => setStatus('closed')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.statusButtonText,
                    status === 'closed' && styles.statusButtonTextClosed,
                  ]}
                >
                  마감
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 공고 제목 */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>공고 제목</Text>
          </View>
          <View style={styles.cardContent}>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="공고 제목을 입력하세요"
              placeholderTextColor="#9ca3af"
              multiline={false}
            />
          </View>
        </View>

        {/* 공고 내용 */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>공고 내용</Text>
          </View>
          <View style={styles.cardContent}>
            <RichToolbar
              editor={richText}
              actions={[
                actions.setBold,
                actions.setItalic,
                actions.setUnderline,
                actions.heading1,
                actions.heading2,
                actions.insertBulletsList,
                actions.insertOrderedList,
                actions.insertLink,
                actions.setStrikethrough,
                actions.alignLeft,
                actions.alignCenter,
                actions.alignRight,
              ]}
              iconMap={{
                [actions.heading1]: ({ tintColor }) => (
                  <Text style={{ color: tintColor, fontWeight: 'bold' }}>H1</Text>
                ),
                [actions.heading2]: ({ tintColor }) => (
                  <Text style={{ color: tintColor, fontWeight: 'bold' }}>H2</Text>
                ),
              }}
              style={styles.richToolbar}
            />
            <View style={[styles.editorContainer, { height: editorHeight }]}>
              <RichEditor
                ref={richText}
                onChange={(html) => setDescription(html)}
                placeholder="공고 내용을 입력하세요"
                androidHardwareAccelerationDisabled={true}
                style={styles.richEditor}
                initialContentHTML={description}
                useContainer={true}
                initialHeight={editorHeight - 20}
                onHeightChange={(height) => {
                  const newHeight = Math.max(400, height + 50);
                  setEditorHeight(newHeight);
                }}
                editorStyle={{
                  backgroundColor: '#ffffff',
                  color: '#111827',
                  placeholderColor: '#9ca3af',
                  contentCSSText: `
                    font-size: 16px;
                    line-height: 1.6;
                    padding: 12px;
                  `,
                }}
              />
            </View>
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onBack}
          disabled={isSaving}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelButtonText}>취소</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.7}
        >
          {isSaving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.saveButtonText}>저장</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  backIconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIconText: {
    fontSize: 36,
    color: '#111827',
    fontWeight: '300',
    lineHeight: 36,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  headerRight: {
    width: 44,
  },
  content: {
    flex: 1,
  },
  card: {
    backgroundColor: '#ffffff',
    marginBottom: 8,
    paddingVertical: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  cardContent: {
    paddingHorizontal: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
  },
  infoLabel: {
    fontSize: 15,
    color: '#6b7280',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  statusButtonActive: {
    borderColor: '#10b981',
    backgroundColor: '#d1fae5',
  },
  statusButtonClosed: {
    borderColor: '#ef4444',
    backgroundColor: '#fee2e2',
  },
  statusButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  statusButtonTextActive: {
    color: '#047857',
  },
  statusButtonTextClosed: {
    color: '#b91c1c',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
  },
  helpText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
  },
  richToolbar: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
  },
  editorContainer: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    overflow: 'hidden',
  },
  richEditor: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  textArea: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111827',
    minHeight: 300,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#ffffff',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  bottomPadding: {
    height: 100,
  },
});
