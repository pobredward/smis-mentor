import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
  Modal as RNModal,
  SafeAreaView,
  Share,
  Platform,
  StatusBar,
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
  const isManager = currentGroupRole === '매니저' || currentGroupRole === 'Manager';
  const canEditTask = isAdmin || isManager;

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

  const handleShare = async () => {
    if (!task) return;
    
    const url = `https://smis-mentor.com/camp/tasks/${task.id}`;
    
    try {
      await Share.share({
        title: task.title,
        message: `${task.title}\n\n${task.description || '업무를 확인해주세요'}\n\n${url}`,
        url: url,
      });
    } catch (error) {
      console.error('공유 오류:', error);
    }
  };

  const handleEdit = () => {
    if (!task) return;
    
    console.log('handleEdit called, navigating back with editTaskId:', task.id);
    
    // handleBack과 동일한 구조로 navigation
    navigation.navigate('MainTabs', {
      screen: 'Camp',
      params: {
        screen: 'Tasks',
        params: {
          selectedDate: task.date.toDate().toISOString(),
          editTaskId: task.id,
          refresh: Date.now(),
        },
      },
    } as any);
  };

  const handleCopy = () => {
    if (!task) return;
    
    console.log('handleCopy called, navigating back with copyTaskId:', task.id);
    
    // handleBack과 동일한 구조로 navigation
    navigation.navigate('MainTabs', {
      screen: 'Camp',
      params: {
        screen: 'Tasks',
        params: {
          selectedDate: task.date.toDate().toISOString(),
          copyTaskId: task.id,
          refresh: Date.now(),
        },
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
          {/* 공유 버튼 */}
          <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
            <Ionicons name="share-outline" size={22} color="#1f2937" />
          </TouchableOpacity>

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
              <Ionicons name="calendar-outline" size={16} color="#6b7280" />
              <Text style={styles.infoText}>{dateStr}</Text>
            </View>

            {timeStr && (
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={16} color="#6b7280" />
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
                  <Ionicons name="open-outline" size={16} color="#9ca3af" />
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
                  <Ionicons name="open-outline" size={16} color="#9ca3af" />
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

      {/* 하단 액션 버튼 (관리자 또는 매니저) */}
      {canEditTask && (
        <View style={styles.actionButtons}>
          <Pressable
            onPress={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Copy button pressed');
              handleCopy();
            }}
            style={({ pressed }) => [
              styles.actionButton,
              styles.copyButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.copyButtonText}>복사</Text>
          </Pressable>
          <Pressable
            onPress={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Edit button pressed');
              handleEdit();
            }}
            style={({ pressed }) => [
              styles.actionButton,
              styles.editActionButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.editActionButtonText}>수정</Text>
          </Pressable>
          {isAdmin && (
            <Pressable
              onPress={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Delete button pressed');
                handleDelete();
              }}
              style={({ pressed }) => [
                styles.actionButton,
                styles.deleteActionButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.deleteActionButtonText}>삭제</Text>
            </Pressable>
          )}
        </View>
      )}

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
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
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
  shareButton: {
    padding: 8,
  },
  editButton: {
    padding: 8,
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
    padding: 16,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  section: {
    marginTop: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#dbeafe',
    borderRadius: 16,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1e40af',
  },
  groupBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#d1fae5',
    borderRadius: 16,
  },
  groupBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#065f46',
  },
  description: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 6,
  },
  attachmentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  attachmentIcon: {
    fontSize: 16,
  },
  attachmentLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  attachmentImage: {
    width: '100%',
    height: 250,
    borderRadius: 8,
    marginBottom: 6,
  },
  imageLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 10,
  },
  completionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#d1fae5',
    borderRadius: 16,
  },
  completionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#065f46',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    paddingBottom: Platform.OS === 'android' ? 32 : 20,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  copyButton: {
    backgroundColor: '#dcfce7',
  },
  copyButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#16a34a',
  },
  editActionButton: {
    backgroundColor: '#dbeafe',
  },
  editActionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  deleteActionButton: {
    backgroundColor: '#fee2e2',
  },
  deleteActionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#dc2626',
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
