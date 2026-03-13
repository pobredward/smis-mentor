import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Modal as RNModal,
  SafeAreaView,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import type { Task, JobExperienceGroupRole } from '../../../shared/src/types/camp';
import {
  getTaskById,
  toggleTaskCompletion,
  deleteTask,
  formatTime,
  formatDuration,
} from '../services/taskService';
import { RootStackParamList } from '../navigation/types';

type TaskDetailRouteProp = RouteProp<RootStackParamList, 'TaskDetail'>;
type TaskDetailNavigationProp = NativeStackNavigationProp<RootStackParamList, 'TaskDetail'>;

export default function TaskDetailScreen() {
  const route = useRoute<TaskDetailRouteProp>();
  const navigation = useNavigation<TaskDetailNavigationProp>();
  const { taskId, taskDate } = route.params;
  const { userData } = useAuth();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [currentGroupRole, setCurrentGroupRole] = useState<JobExperienceGroupRole | null>(null);

  const isAdmin = userData?.role === 'admin';

  useEffect(() => {
    loadTask();
  }, [taskId]);

  useEffect(() => {
    if (userData?.activeJobExperienceId) {
      const activeExp = userData.jobExperiences?.find(
        exp => exp.id === userData.activeJobExperienceId
      );
      if (activeExp?.groupRole) {
        setCurrentGroupRole(activeExp.groupRole as JobExperienceGroupRole);
      }
    }
  }, [userData]);

  const loadTask = async () => {
    try {
      const taskData = await getTaskById(taskId);
      if (!taskData) {
        Alert.alert('오류', '업무를 찾을 수 없습니다.');
        handleBack();
        return;
      }
      setTask(taskData);
    } catch (error) {
      console.error('업무 로드 오류:', error);
      Alert.alert('오류', '업무를 불러오는 중 오류가 발생했습니다.');
      handleBack();
    } finally {
      setLoading(false);
    }
  };

  const handleToggleComplete = async () => {
    if (!task || !userData) return;

    const role = currentGroupRole || '담임' as JobExperienceGroupRole;

    try {
      await toggleTaskCompletion(task.id, userData.userId, userData.name, role);
      await loadTask();
    } catch (error) {
      console.error('업무 완료 토글 오류:', error);
      Alert.alert('오류', '업무 상태 변경 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = () => {
    if (!task) return;

    Alert.alert(
      '업무 삭제',
      '정말 이 업무를 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTask(task.id);
              Alert.alert('성공', '업무가 삭제되었습니다.');
              handleBack();
            } catch (error) {
              console.error('업무 삭제 오류:', error);
              Alert.alert('오류', '업무 삭제 중 오류가 발생했습니다.');
            }
          },
        },
      ]
    );
  };

  const handleBack = () => {
    // 업무 탭으로 돌아가기 (날짜 정보 및 refresh 트리거 전달)
    navigation.navigate('MainTabs', {
      screen: 'Camp',
      params: {
        screen: 'Tasks',
        params: taskDate ? { selectedDate: taskDate, refresh: Date.now() } : { refresh: Date.now() },
      },
    } as any);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>로딩 중...</Text>
      </View>
    );
  }

  if (!task) {
    return null;
  }

  const isCompleted = task.completions.some(c => c.userId === userData?.userId);
  const dateStr = task.date.toDate().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  const timeStr = formatTime(task.time);
  const durationStr = formatDuration(task.estimatedDuration);

  const linkAttachments = task.attachments?.filter(a => a.type === 'link') || [];
  const imageAttachments = task.attachments?.filter(a => a.type === 'image') || [];
  const otherAttachments = task.attachments?.filter(a => a.type !== 'link' && a.type !== 'image') || [];

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
          <Text style={styles.backText}>뒤로</Text>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          {/* 완료 버튼 */}
          <TouchableOpacity
            onPress={handleToggleComplete}
            style={[
              styles.completeButton,
              isCompleted && styles.completeButtonActive,
            ]}
          >
            <Text style={[
              styles.completeButtonText,
              isCompleted && styles.completeButtonTextActive,
            ]}>
              {isCompleted ? '✓ 완료됨' : '완료 표시'}
            </Text>
          </TouchableOpacity>

          {/* 삭제 버튼 (관리자) */}
          {isAdmin && (
            <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 본문 */}
      <ScrollView style={styles.content}>
        <View style={styles.card}>
          {/* 제목 */}
          <Text style={styles.title}>{task.title}</Text>

          {/* 날짜 및 시간 */}
          <View style={styles.section}>
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={18} color="#6b7280" />
              <Text style={styles.infoText}>{dateStr}</Text>
            </View>

            {timeStr && (
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={18} color="#6b7280" />
                <Text style={styles.infoText}>
                  {timeStr}
                  {durationStr && ` (${durationStr})`}
                </Text>
              </View>
            )}
          </View>

          {/* 대상 역할 */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>대상 역할</Text>
            <View style={styles.badgeContainer}>
              {task.targetRoles.map(role => (
                <View key={role} style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{role}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 대상 그룹 */}
          {task.targetGroups && task.targetGroups.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>대상 그룹</Text>
              <View style={styles.badgeContainer}>
                {task.targetGroups.map(group => (
                  <View key={group} style={styles.groupBadge}>
                    <Text style={styles.groupBadgeText}>{group}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 설명 */}
          {task.description && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>상세 설명</Text>
              <Text style={styles.description}>{task.description}</Text>
            </View>
          )}

          {/* 링크 */}
          {linkAttachments.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>링크</Text>
              {linkAttachments.map((attachment, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.attachmentItem}
                  onPress={() => Linking.openURL(attachment.url)}
                >
                  <View style={styles.attachmentInfo}>
                    <Text style={styles.attachmentIcon}>🔗</Text>
                    <Text style={styles.attachmentLabel} numberOfLines={1}>
                      {attachment.label}
                    </Text>
                  </View>
                  <Ionicons name="open-outline" size={18} color="#9ca3af" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* 이미지 */}
          {imageAttachments.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>이미지</Text>
              {imageAttachments.map((attachment, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => setSelectedImage(attachment.url)}
                >
                  <Image
                    source={{ uri: attachment.url }}
                    style={styles.attachmentImage}
                    contentFit="cover"
                    transition={200}
                  />
                  <Text style={styles.imageLabel}>{attachment.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* 기타 파일 */}
          {otherAttachments.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>첨부파일</Text>
              {otherAttachments.map((attachment, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.attachmentItem}
                  onPress={() => Linking.openURL(attachment.url)}
                >
                  <View style={styles.attachmentInfo}>
                    <Text style={styles.attachmentIcon}>
                      {attachment.type === 'video' && '🎥'}
                      {attachment.type === 'file' && '📎'}
                    </Text>
                    <Text style={styles.attachmentLabel} numberOfLines={1}>
                      {attachment.label}
                    </Text>
                  </View>
                  <Ionicons name="open-outline" size={18} color="#9ca3af" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* 완료 현황 (관리자) */}
          {isAdmin && task.completions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                완료 현황 ({task.completions.length}명)
              </Text>
              <View style={styles.badgeContainer}>
                {task.completions.map((completion, idx) => (
                  <View key={idx} style={styles.completionBadge}>
                    <Text style={styles.completionText}>
                      {completion.userName} ({completion.userRole})
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* 이미지 확대 모달 */}
      {selectedImage && (
        <RNModal
          visible={true}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedImage(null)}
        >
          <View style={styles.imageModal}>
            <TouchableOpacity
              style={styles.imageModalClose}
              onPress={() => setSelectedImage(null)}
            >
              <Ionicons name="close" size={32} color="#ffffff" />
            </TouchableOpacity>
            <Image
              source={{ uri: selectedImage }}
              style={styles.imageModalContent}
              contentFit="contain"
            />
          </View>
        </RNModal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6b7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  completeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  completeButtonActive: {
    backgroundColor: '#3b82f6',
  },
  completeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  completeButtonTextActive: {
    color: '#ffffff',
  },
  deleteButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  card: {
    padding: 20,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  section: {
    marginTop: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#dbeafe',
    borderRadius: 20,
  },
  roleBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e40af',
  },
  groupBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#d1fae5',
    borderRadius: 20,
  },
  groupBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#065f46',
  },
  description: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 24,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 8,
  },
  attachmentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  attachmentIcon: {
    fontSize: 18,
  },
  attachmentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  attachmentImage: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    marginBottom: 8,
  },
  imageLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
  },
  completionBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#d1fae5',
    borderRadius: 20,
  },
  completionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#065f46',
  },
  imageModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  imageModalContent: {
    width: '100%',
    height: '100%',
  },
});
