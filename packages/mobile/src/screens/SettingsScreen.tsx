import React, { useEffect, useState } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import {
  getNotificationSettings,
  updateNotificationSettings,
  NotificationSettings,
} from '../services/notificationService';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { userData } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>({
    taskReminders: true,
    generalNotifications: true,
  });

  useEffect(() => {
    loadSettings();
  }, [userData?.userId]);

  const loadSettings = async () => {
    if (!userData?.userId) return;

    try {
      setLoading(true);
      const userSettings = await getNotificationSettings(userData.userId);
      setSettings(userSettings);
    } catch (error) {
      logger.error('알림 설정 로드 실패:', error);
      Alert.alert('오류', '알림 설정을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSetting = async (key: keyof NotificationSettings) => {
    if (!userData?.userId || saving) return;

    const newValue = !settings[key];
    const newSettings = { ...settings, [key]: newValue };
    
    setSettings(newSettings);
    setSaving(true);

    try {
      await updateNotificationSettings(userData.userId, { [key]: newValue });
    } catch (error) {
      logger.error('알림 설정 업데이트 실패:', error);
      setSettings({ ...settings, [key]: !newValue });
      Alert.alert('오류', '알림 설정 변경에 실패했습니다.');
    } finally {
      setSaving(false);
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

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>설정을 불러오는 중...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="notifications-outline" size={24} color="#3b82f6" />
          <Text style={styles.sectionTitle}>알림 설정</Text>
        </View>
        <Text style={styles.sectionDescription}>
          받고 싶은 알림을 선택하세요. 알림을 끄면 해당 유형의 푸시 알림을 받지 않습니다.
        </Text>

        <View style={styles.settingsList}>
          {/* 업무 알림 */}
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconContainer}>
                <Ionicons name="checkmark-circle-outline" size={24} color="#3b82f6" />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>업무 알림</Text>
                <Text style={styles.settingDescription}>
                  업무 마감 시간이 지났을 때 독촉 알림을 받습니다.
                </Text>
              </View>
            </View>
            <Switch
              value={settings.taskReminders}
              onValueChange={() => handleToggleSetting('taskReminders')}
              disabled={saving}
              trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
              thumbColor={settings.taskReminders ? '#3b82f6' : '#f3f4f6'}
            />
          </View>

          {/* 일반 알림 */}
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconContainer}>
                <Ionicons name="megaphone-outline" size={24} color="#10b981" />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>일반 알림</Text>
                <Text style={styles.settingDescription}>
                  공지사항, 업데이트 등 일반적인 알림을 받습니다.
                </Text>
              </View>
            </View>
            <Switch
              value={settings.generalNotifications}
              onValueChange={() => handleToggleSetting('generalNotifications')}
              disabled={saving}
              trackColor={{ false: '#d1d5db', true: '#6ee7b7' }}
              thumbColor={settings.generalNotifications ? '#10b981' : '#f3f4f6'}
            />
          </View>
        </View>
      </View>

      <View style={styles.infoSection}>
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color="#6b7280" />
          <Text style={styles.infoText}>
            알림 설정은 언제든지 변경할 수 있습니다. 시스템 설정에서 알림 권한이 거부된 경우,
            설정을 변경하더라도 알림을 받을 수 없습니다.
          </Text>
        </View>
      </View>

      <View style={styles.footerSection}>
        <Text style={styles.footerTitle}>법률 문서</Text>
        
        <TouchableOpacity 
          style={styles.footerLink}
          onPress={() => (navigation as any).navigate('PrivacyPolicy')}
        >
          <View style={styles.footerLinkContent}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#6b7280" />
            <Text style={styles.footerLinkText}>개인정보처리방침</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.footerLink}
          onPress={() => (navigation as any).navigate('TermsOfService')}
        >
          <View style={styles.footerLinkContent}>
            <Ionicons name="document-text-outline" size={20} color="#6b7280" />
            <Text style={styles.footerLinkText}>서비스 이용약관</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      <View style={styles.appInfo}>
        <Text style={styles.appVersion}>SMIS Mentor v1.0.0</Text>
        <Text style={styles.copyright}>© 2026 (주)에스엠아이에스. All rights reserved.</Text>
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
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6b7280',
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  sectionDescription: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 16,
  },
  settingsList: {
    gap: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  settingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginRight: 12,
  },
  settingIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
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
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#374151',
    lineHeight: 18,
  },
  footerSection: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  footerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  footerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  footerLinkContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  footerLinkText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  appVersion: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '500',
    marginBottom: 4,
  },
  copyright: {
    fontSize: 12,
    color: '#d1d5db',
  },
});
