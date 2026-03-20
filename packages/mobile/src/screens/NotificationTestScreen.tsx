import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import * as Notifications from 'expo-notifications';
import { scheduleTaskReminderNotification } from '../services/notificationService';

export function NotificationTestScreen() {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(false);
  const [testMessage, setTestMessage] = useState('테스트 알림입니다!');
  const [scheduledSeconds, setScheduledSeconds] = useState('5');

  // 즉시 로컬 알림 전송
  const sendImmediateNotification = async () => {
    try {
      setLoading(true);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '📱 즉시 테스트 알림',
          body: testMessage,
          data: { type: 'test', timestamp: Date.now() },
          sound: true,
        },
        trigger: null, // 즉시 전송
      });
      Alert.alert('성공', '알림이 전송되었습니다!');
    } catch (error) {
      console.error('즉시 알림 전송 실패:', error);
      Alert.alert('오류', '알림 전송에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 스케줄된 로컬 알림 전송
  const sendScheduledNotification = async () => {
    try {
      setLoading(true);
      const seconds = parseInt(scheduledSeconds) || 5;
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ 예약된 테스트 알림',
          body: `${seconds}초 후에 알림이 도착했습니다!`,
          data: { type: 'test-scheduled', timestamp: Date.now() },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: seconds,
          repeats: false,
        },
      });
      
      Alert.alert(
        '성공',
        `${seconds}초 후에 알림이 전송됩니다.\n앱을 백그라운드로 전환해보세요.`
      );
    } catch (error) {
      console.error('예약 알림 전송 실패:', error);
      Alert.alert('오류', '알림 예약에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 업무 독촉 스타일 알림 테스트
  const sendTaskReminderStyleNotification = async () => {
    try {
      setLoading(true);
      const scheduledTime = new Date(Date.now() + 5000); // 5초 후
      
      await scheduleTaskReminderNotification(
        'test-task-id',
        '학생 출결 확인',
        scheduledTime
      );
      
      Alert.alert(
        '성공',
        '업무 독촉 스타일 알림이 5초 후 전송됩니다.\n앱을 백그라운드로 전환해보세요.'
      );
    } catch (error) {
      console.error('업무 알림 전송 실패:', error);
      Alert.alert('오류', '업무 알림 전송에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 알림 권한 상태 확인
  const checkNotificationPermissions = async () => {
    try {
      setLoading(true);
      const settings = await Notifications.getPermissionsAsync();
      
      let status = '거부됨 ❌';
      if (settings.granted) {
        status = '허용됨 ✅';
      } else if (settings.canAskAgain) {
        status = '아직 요청 안함 ⚠️';
      }
      
      Alert.alert(
        '알림 권한 상태',
        `상태: ${status}\n\n권한 세부 정보:\n` +
        `- granted: ${settings.granted}\n` +
        `- canAskAgain: ${settings.canAskAgain}\n` +
        `- iOS sound: ${settings.ios?.sound}\n` +
        `- iOS badge: ${settings.ios?.badge}\n` +
        `- iOS alert: ${settings.ios?.alert}\n` +
        `- Android importance: ${settings.android?.importance}`
      );
    } catch (error) {
      console.error('권한 확인 실패:', error);
      Alert.alert('오류', '권한 확인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 예약된 알림 모두 취소
  const cancelAllScheduledNotifications = async () => {
    try {
      setLoading(true);
      await Notifications.cancelAllScheduledNotificationsAsync();
      Alert.alert('완료', '예약된 모든 알림이 취소되었습니다.');
    } catch (error) {
      console.error('알림 취소 실패:', error);
      Alert.alert('오류', '알림 취소에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 푸시 토큰 확인
  const showPushToken = async () => {
    if (!userData?.userId) {
      Alert.alert('오류', '로그인이 필요합니다.');
      return;
    }

    try {
      setLoading(true);
      const { db } = await import('../config/firebase');
      const { doc, getDoc } = await import('firebase/firestore');
      
      const userDoc = await getDoc(doc(db, 'users', userData.userId));
      const pushTokens = userDoc.data()?.pushTokens || {};
      const tokens = Object.keys(pushTokens);
      
      if (tokens.length === 0) {
        Alert.alert('알림', '등록된 푸시 토큰이 없습니다.');
      } else {
        Alert.alert(
          '등록된 푸시 토큰',
          `총 ${tokens.length}개\n\n` + tokens.slice(0, 2).join('\n\n') +
          (tokens.length > 2 ? '\n\n...' : '')
        );
      }
    } catch (error) {
      console.error('토큰 조회 실패:', error);
      Alert.alert('오류', '토큰 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!userData) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="lock-closed-outline" size={64} color="#cbd5e1" />
        <Text style={styles.emptyTitle}>로그인 필요</Text>
        <Text style={styles.emptyText}>로그인 후 이용 가능합니다.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="notifications" size={32} color="#3b82f6" />
        <Text style={styles.headerTitle}>푸시 알림 테스트</Text>
        <Text style={styles.headerSubtitle}>
          다양한 방법으로 알림을 테스트할 수 있습니다
        </Text>
      </View>

      {/* 메시지 입력 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>테스트 메시지</Text>
        <TextInput
          style={styles.input}
          value={testMessage}
          onChangeText={setTestMessage}
          placeholder="알림 메시지를 입력하세요"
          placeholderTextColor="#9ca3af"
        />
      </View>

      {/* 즉시 알림 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🚀 즉시 알림</Text>
        <Text style={styles.sectionDescription}>
          버튼을 누르면 바로 알림이 표시됩니다
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={sendImmediateNotification}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons name="flash" size={20} color="#ffffff" />
              <Text style={styles.buttonText}>즉시 알림 전송</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* 예약 알림 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⏰ 예약 알림</Text>
        <Text style={styles.sectionDescription}>
          지정한 시간 후에 알림이 표시됩니다
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.timeInput]}
            value={scheduledSeconds}
            onChangeText={setScheduledSeconds}
            placeholder="5"
            keyboardType="numeric"
            placeholderTextColor="#9ca3af"
          />
          <Text style={styles.inputLabel}>초 후</Text>
        </View>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={sendScheduledNotification}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#3b82f6" />
          ) : (
            <>
              <Ionicons name="time" size={20} color="#3b82f6" />
              <Text style={[styles.buttonText, styles.buttonTextSecondary]}>
                예약 알림 전송
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* 업무 독촉 스타일 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📌 업무 독촉 스타일</Text>
        <Text style={styles.sectionDescription}>
          실제 업무 독촉 알림과 동일한 형식으로 테스트합니다
        </Text>
        <TouchableOpacity
          style={[styles.button, styles.buttonWarning]}
          onPress={sendTaskReminderStyleNotification}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons name="clipboard" size={20} color="#ffffff" />
              <Text style={styles.buttonText}>업무 알림 테스트</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* 유틸리티 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🛠️ 유틸리티</Text>
        
        <TouchableOpacity
          style={styles.utilButton}
          onPress={checkNotificationPermissions}
          disabled={loading}
        >
          <Ionicons name="shield-checkmark" size={20} color="#6b7280" />
          <Text style={styles.utilButtonText}>알림 권한 확인</Text>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.utilButton}
          onPress={showPushToken}
          disabled={loading}
        >
          <Ionicons name="key" size={20} color="#6b7280" />
          <Text style={styles.utilButtonText}>푸시 토큰 확인</Text>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.utilButton, styles.utilButtonDanger]}
          onPress={cancelAllScheduledNotifications}
          disabled={loading}
        >
          <Ionicons name="close-circle" size={20} color="#ef4444" />
          <Text style={[styles.utilButtonText, styles.utilButtonTextDanger]}>
            예약 알림 모두 취소
          </Text>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      {/* 안내 */}
      <View style={styles.infoSection}>
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color="#3b82f6" />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>테스트 팁</Text>
            <Text style={styles.infoText}>
              • 예약 알림 테스트 시 앱을 백그라운드로 전환하세요{'\n'}
              • 시뮬레이터는 푸시 알림을 지원하지 않습니다{'\n'}
              • 실제 기기에서 테스트해주세요{'\n'}
              • 알림 권한이 허용되어 있는지 확인하세요
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: '#f8fafc',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  header: {
    backgroundColor: '#ffffff',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#ffffff',
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  timeInput: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonSecondary: {
    backgroundColor: '#dbeafe',
  },
  buttonWarning: {
    backgroundColor: '#f59e0b',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: '#3b82f6',
  },
  utilButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
  },
  utilButtonDanger: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  utilButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },
  utilButtonTextDanger: {
    color: '#ef4444',
  },
  infoSection: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 32,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#374151',
    lineHeight: 18,
  },
});
