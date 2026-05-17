import React, { useEffect, useState } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { deletePersonalTask, deletePersonalTaskGroup, togglePersonalTaskCompletion } from '../services/personalTaskService';
import { getTaskCategories } from '../services/taskCategoryService';
import { formatTime, formatDuration } from '../services/taskService';
import type { PersonalTask, TaskCategory } from '../../../shared/src/types';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';

type PersonalTaskDetailRouteProp = RouteProp<RootStackParamList, 'PersonalTaskDetail'>;
type PersonalTaskDetailNavigationProp = NativeStackNavigationProp<RootStackParamList, 'PersonalTaskDetail'>;

export default function PersonalTaskDetailScreen() {
  const route = useRoute<PersonalTaskDetailRouteProp>();
  const navigation = useNavigation<PersonalTaskDetailNavigationProp>();
  const { userData } = useAuth();
  const { taskId, taskDate } = route.params;

  const [task, setTask] = useState<PersonalTask | null>(null);
  const [category, setCategory] = useState<TaskCategory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTask();
  }, [taskId]);

  const loadTask = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'personalTasks', taskId));
      if (!docSnap.exists()) {
        Alert.alert('오류', '개인 업무를 찾을 수 없습니다.');
        handleBack();
        return;
      }
      const taskData = { id: docSnap.id, ...docSnap.data() } as PersonalTask;
      setTask(taskData);

      // 카테고리 로드
      if (taskData.categoryId && taskData.campCode) {
        try {
          const cats = await getTaskCategories(taskData.campCode);
          const found = cats.find(c => c.id === taskData.categoryId);
          setCategory(found ?? null);
        } catch {
          // 카테고리 로드 실패는 무시
        }
      }
    } catch (error) {
      logger.error('개인 업무 로드 오류:', error);
      Alert.alert('오류', '업무를 불러오는 중 오류가 발생했습니다.');
      handleBack();
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigation.navigate('MainTabs', {
      screen: 'Camp',
      params: {
        screen: 'Tasks',
        params: taskDate
          ? { selectedDate: taskDate, refresh: Date.now() }
          : { refresh: Date.now() },
      },
    } as any);
  };

  const handleToggleComplete = async () => {
    if (!task) return;
    try {
      await togglePersonalTaskCompletion(task.id, task.isCompleted);
      await loadTask();
    } catch (error) {
      logger.error('완료 토글 오류:', error);
      Alert.alert('오류', '상태 변경 중 오류가 발생했습니다.');
    }
  };

  const handleEdit = () => {
    if (!task) return;
    // _editTs로 항상 고유한 파라미터를 보장해 useEffect가 매번 발화되도록 함
    navigation.navigate('MainTabs', {
      screen: 'Camp',
      params: {
        screen: 'Tasks',
        params: {
          selectedDate: task.date.toDate().toISOString(),
          editPersonalTaskId: task.id,
          _editTs: Date.now(),
        },
      },
    } as any);
  };

  const handleDelete = () => {
    if (!task) return;

    if (task.groupId) {
      // 그룹 업무: 이 날짜만 / 전체 삭제 선택지 제공
      Alert.alert(
        '개인 업무 삭제',
        '이 업무는 여러 날짜에 묶인 그룹 업무입니다.',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '이 날짜만 삭제',
            onPress: async () => {
              try {
                await deletePersonalTask(task.id);
                handleBack();
              } catch (error) {
                logger.error('개인 업무 삭제 오류:', error);
                Alert.alert('오류', '삭제 중 오류가 발생했습니다.');
              }
            },
          },
          {
            text: '그룹 전체 삭제',
            style: 'destructive',
            onPress: async () => {
              try {
                await deletePersonalTaskGroup(task.groupId!);
                handleBack();
              } catch (error) {
                logger.error('개인 업무 그룹 삭제 오류:', error);
                Alert.alert('오류', '삭제 중 오류가 발생했습니다.');
              }
            },
          },
        ]
      );
    } else {
      Alert.alert('개인 업무 삭제', '이 개인 업무를 삭제하시겠습니까?', [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePersonalTask(task.id);
              handleBack();
            } catch (error) {
              logger.error('개인 업무 삭제 오류:', error);
              Alert.alert('오류', '삭제 중 오류가 발생했습니다.');
            }
          },
        },
      ]);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#7c3aed" />
        <Text style={styles.loadingText}>로딩 중...</Text>
      </View>
    );
  }

  if (!task) return null;

  const accentColor = category?.color ?? '#7c3aed';
  const dateStr = task.date.toDate().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  const timeStr = formatTime(task.time);
  const durationStr = formatDuration(task.estimatedDuration);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
          <Text style={styles.backText}>뒤로</Text>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          {/* 완료 토글 버튼 */}
          <TouchableOpacity
            onPress={handleToggleComplete}
            style={[
              styles.completeButton,
              task.isCompleted && { backgroundColor: accentColor },
            ]}
          >
            <Text
              style={[
                styles.completeButtonText,
                task.isCompleted && styles.completeButtonTextActive,
              ]}
            >
              {task.isCompleted ? '✓ 완료됨' : '완료 표시'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 본문 */}
      <ScrollView style={styles.content}>
        <View style={styles.card}>
          {/* 개인 업무 배지 */}
          <View style={styles.personalBadge}>
            <Ionicons name="person-outline" size={12} color="#7c3aed" />
            <Text style={styles.personalBadgeText}>나만 보이는 개인 업무</Text>
          </View>

          {/* 제목 */}
          <Text
            style={[
              styles.title,
              task.isCompleted && styles.titleCompleted,
            ]}
          >
            {task.title}
          </Text>

          {/* 카테고리 */}
          {category && (
            <View style={[styles.categoryBadge, { backgroundColor: `${category.color}20`, borderColor: `${category.color}60` }]}>
              <Text style={[styles.categoryBadgeText, { color: category.color }]}>{category.name}</Text>
            </View>
          )}

          {/* 날짜 */}
          <View style={styles.section}>
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={16} color="#6b7280" />
              <Text style={styles.infoText}>{dateStr}</Text>
            </View>

            {timeStr && (
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={16} color="#6b7280" />
                <Text style={[styles.infoText, { color: accentColor, fontWeight: '700' }]}>
                  {timeStr}
                  {durationStr && (
                    <Text style={{ color: '#9ca3af', fontWeight: '400' }}> ({durationStr})</Text>
                  )}
                </Text>
              </View>
            )}

            {!timeStr && durationStr && (
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={16} color="#6b7280" />
                <Text style={styles.infoText}>예상 소요시간: {durationStr}</Text>
              </View>
            )}
          </View>

          {/* 메모 */}
          {task.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>메모</Text>
              <Text style={styles.description}>{task.description}</Text>
            </View>
          ) : null}

          {/* 완료 상태 */}
          <View style={styles.section}>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: task.isCompleted ? `${accentColor}18` : '#f3f4f6' },
              ]}
            >
              <Ionicons
                name={task.isCompleted ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={task.isCompleted ? accentColor : '#9ca3af'}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: task.isCompleted ? accentColor : '#9ca3af' },
                ]}
              >
                {task.isCompleted ? '완료됨' : '미완료'}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* 하단 액션 버튼 */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          onPress={handleEdit}
          style={[styles.actionButton, styles.editButton]}
          activeOpacity={0.8}
        >
          <Text style={styles.editButtonText}>수정</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleDelete}
          style={[styles.actionButton, styles.deleteButton]}
          activeOpacity={0.8}
        >
          <Text style={styles.deleteButtonText}>삭제</Text>
        </TouchableOpacity>
      </View>
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
    paddingTop: 8,
    paddingBottom: 10,
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
  completeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  completeButtonTextActive: {
    color: '#ffffff',
  },
  content: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  card: {
    padding: 16,
    backgroundColor: '#ffffff',
  },
  personalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#f3e8ff',
    borderRadius: 10,
    marginBottom: 10,
  },
  personalBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7c3aed',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 10,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: '#9ca3af',
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '700',
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
  description: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
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
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    backgroundColor: '#dbeafe',
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2563eb',
  },
  deleteButton: {
    backgroundColor: '#fee2e2',
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#dc2626',
  },
});
