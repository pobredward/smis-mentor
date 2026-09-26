import React, { useEffect, useState } from 'react';
import Constants from 'expo-constants';
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
import {
  visibleNotificationTypes,
  notificationMasterOn,
  notificationMasterTogglePatch,
  NOTIFICATION_GROUP_LABELS,
  type NotificationKey,
  type NotificationType,
} from '@smis-mentor/shared';

/** 종류별 아이콘 */
const NOTIFICATION_ICONS: Record<NotificationKey, keyof typeof Ionicons.glyphMap> = {
  taskReminders: 'checkmark-circle-outline',
  lostItem: 'search-outline',
  supplyRequest: 'clipboard-outline',
  supplyBuyer: 'cart-outline',
  supplyProgress: 'checkmark-done-outline',
  supplyComment: 'chatbubble-ellipses-outline',
  supplySettle: 'cash-outline',
  supplyIntake: 'archive-outline',
  stockLow: 'trending-down-outline',
  stockTransfer: 'swap-horizontal-outline',
};
import { RootStackParamList } from '../navigation/types';
import { useNotificationPermission } from '../hooks/useNotificationPermission';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { userData, refreshUserData, isSharingLocation, setIsSharingLocation } = useAuth();
  // 위치 공유: 위치 탭이 보이지 않는 상황에서도 여기서 항상 끌 수 있어야 한다 (백그라운드 위치 정책)
  const [bgLocationRunning, setBgLocationRunning] = useState(false);
  const [stoppingLocation, setStoppingLocation] = useState(false);
  useEffect(() => {
    import('../services/locationSharingService')
      .then(({ isBackgroundLocationRunning }) => isBackgroundLocationRunning())
      .then(setBgLocationRunning)
      .catch(() => undefined);
  }, [isSharingLocation]);
  const handleStopLocation = async () => {
    if (!userData?.userId || stoppingLocation) return;
    setStoppingLocation(true);
    try {
      const [{ forceStopAllLocationSharing }, { db }] = await Promise.all([
        import('../services/locationSharingService'),
        import('../config/firebase'),
      ]);
      await forceStopAllLocationSharing(db, userData.userId);
      setIsSharingLocation(false);
      setBgLocationRunning(false);
      Alert.alert(isForeign ? 'Location sharing off' : '위치 공유 중지', isForeign ? 'Location sharing has been turned off on this device.' : '이 기기의 위치 공유를 껐습니다.');
    } catch {
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Failed to stop location sharing.' : '위치 공유를 끄지 못했습니다.');
    } finally {
      setStoppingLocation(false);
    }
  };
  // 커뮤니티 차단 목록 (이름은 조회 가능한 경우만 표시)
  const blockedUsers = userData?.blockedUsers ?? [];
  const [blockedNames, setBlockedNames] = useState<Record<string, string>>({});
  const [unblocking, setUnblocking] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (blockedUsers.length === 0) { setBlockedNames({}); return; }
      const { getUserById } = await import('../services/authService');
      const entries = await Promise.all(blockedUsers.map(async (uid) => {
        try { const u = await getUserById(uid); return [uid, u?.name || ''] as const; } catch { return [uid, ''] as const; }
      }));
      if (!cancelled) setBlockedNames(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockedUsers.join(',')]);

  const handleUnblock = async (uid: string) => {
    if (!userData?.userId || unblocking) return;
    setUnblocking(uid);
    try {
      const { unblockUser } = await import('../services/communityService');
      await unblockUser(userData.userId, uid);
      await refreshUserData();
    } catch {
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Failed to unblock.' : '차단 해제에 실패했습니다.');
    } finally {
      setUnblocking(null);
    }
  };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>({});

  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const masterOn = notificationMasterOn(settings);
  /**
   * 이 사람에게 보여 줄 알림 종류 — 묶음별로 정리.
   * userData 는 users 문서 onSnapshot 으로 실시간 갱신되므로,
   * 관리자가 권한이나 캠프 역할(부매니저 등)을 바꾸면 이 목록도 즉시 바뀐다.
   */
  const visibleTypes = React.useMemo(() => {
    const list = visibleNotificationTypes(userData as { role?: string; jobExperiences?: Array<{ id?: string; group?: string; groupRole?: string }> } | null);
    const order: NotificationType['group'][] = ['task', 'supply', 'stock', 'lost'];
    return order
      .map(groupKey => ({ groupKey, types: list.filter(t => t.group === groupKey) }))
      .filter(g => g.types.length > 0);
  }, [userData]);

  const {
    permissionStatus,
    requesting: requestingPermission,
    requestPermission: handleNotificationPermission,
  } = useNotificationPermission({ isForeign });

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
      Alert.alert(
        isForeign ? 'Error' : '오류',
        isForeign ? 'Failed to load notification settings.' : '알림 설정을 불러오는데 실패했습니다.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSetting = async (key: NotificationKey | 'generalNotifications') => {
    if (!userData?.userId || saving) return;

    // 전체 스위치: 켤 때는 보이는 종류도 모두 켠다 / 종류별: 값이 없으면 '켜짐'이 기본 — 그 반대로 뒤집는다
    const patch: Partial<NotificationSettings> = key === 'generalNotifications'
      ? notificationMasterTogglePatch(settings, visibleTypes.flatMap(g => g.types.map(t => t.key)))
      : { [key]: settings[key] === false };
    const prev = settings;
    setSettings({ ...settings, ...patch });
    setSaving(true);

    try {
      await updateNotificationSettings(userData.userId, patch);
    } catch (error) {
      logger.error('알림 설정 업데이트 실패:', error);
      setSettings(prev);
      Alert.alert(
        isForeign ? 'Error' : '오류',
        isForeign ? 'Failed to update notification settings.' : '알림 설정 변경에 실패했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!userData) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="lock-closed-outline" size={64} color="#cbd5e1" />
        <Text style={styles.emptyTitle}>
          {isForeign ? 'Login Required' : '로그인 필요'}
        </Text>
        <Text style={styles.emptyText}>
          {isForeign ? 'Please log in to access this page.' : '로그인 후 이용 가능합니다.'}
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>
          {isForeign ? 'Loading settings...' : '설정을 불러오는 중...'}
        </Text>
      </View>
    );
  }

  const permissionBannerConfig = (() => {
    if (permissionStatus === 'granted') return null;
    return {
      icon: permissionStatus === 'denied' ? 'notifications-off-outline' : 'notifications-outline',
      color: permissionStatus === 'denied' ? '#ef4444' : '#f59e0b',
      bg: permissionStatus === 'denied' ? '#fef2f2' : '#fffbeb',
      border: permissionStatus === 'denied' ? '#fecaca' : '#fde68a',
      title: isForeign
        ? permissionStatus === 'denied' ? 'Notifications Blocked' : 'Enable Notifications'
        : permissionStatus === 'denied' ? '알림이 차단되어 있습니다' : '알림 허용이 필요합니다',
      description: isForeign
        ? permissionStatus === 'denied'
          ? 'Tap below to open settings and enable notifications.'
          : 'Tap below to allow notifications for this app.'
        : permissionStatus === 'denied'
          ? '아래 버튼을 눌러 설정에서 알림을 허용해 주세요.'
          : '아래 버튼을 눌러 알림을 허용해 주세요.',
      buttonText: isForeign
        ? permissionStatus === 'denied' ? 'Open Settings' : 'Allow Notifications'
        : permissionStatus === 'denied' ? '설정 열기' : '알림 허용하기',
    };
  })();

  return (
    <ScrollView style={styles.container}>
      {/* 알림 권한 배너 */}
      {permissionBannerConfig && (
        <View style={[
          styles.permissionBanner,
          { backgroundColor: permissionBannerConfig.bg, borderColor: permissionBannerConfig.border }
        ]}>
          <View style={styles.permissionBannerContent}>
            <Ionicons
              name={permissionBannerConfig.icon as any}
              size={24}
              color={permissionBannerConfig.color}
            />
            <View style={styles.permissionBannerText}>
              <Text style={[styles.permissionBannerTitle, { color: permissionBannerConfig.color }]}>
                {permissionBannerConfig.title}
              </Text>
              <Text style={styles.permissionBannerDescription}>
                {permissionBannerConfig.description}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.permissionButton, { backgroundColor: permissionBannerConfig.color }]}
            onPress={handleNotificationPermission}
            disabled={requestingPermission}
            accessibilityLabel={permissionBannerConfig.buttonText}
            accessibilityRole="button"
          >
            {requestingPermission ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons
                  name={permissionStatus === 'denied' ? 'settings-outline' : 'checkmark-circle-outline'}
                  size={16}
                  color="#ffffff"
                />
                <Text style={styles.permissionButtonText}>
                  {permissionBannerConfig.buttonText}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="notifications-outline" size={24} color="#3b82f6" />
          <Text style={styles.sectionTitle}>
            {isForeign ? 'Notification Settings' : '알림 설정'}
          </Text>
        </View>
        <Text style={styles.sectionDescription}>
          {isForeign
            ? 'Turn everything off at once, or choose the kinds you want. Types shown here depend on your role in the camp.'
            : '전체를 한 번에 끄거나, 종류별로 고를 수 있어요. 보이는 종류는 캠프에서의 역할에 따라 달라집니다.'}
        </Text>

        {/* 전체 on/off */}
        <View style={styles.settingsList}>
          <View style={[styles.settingItem, { backgroundColor: '#f8fafc' }]}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconContainer}>
                <Ionicons name={masterOn ? 'notifications' : 'notifications-off'} size={24} color={masterOn ? '#10b981' : '#9ca3af'} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>{isForeign ? 'All notifications' : '전체 알림'}</Text>
                <Text style={styles.settingDescription}>
                  {masterOn
                    ? (isForeign ? 'On — each kind can be set below.' : '켜짐 — 아래에서 종류별로 조절할 수 있어요.')
                    : (isForeign ? 'Off — no push notifications at all.' : '꺼짐 — 어떤 푸시 알림도 오지 않아요.')}
                </Text>
              </View>
            </View>
            <Switch
              value={masterOn}
              onValueChange={() => handleToggleSetting('generalNotifications')}
              disabled={saving}
              trackColor={{ false: '#d1d5db', true: '#6ee7b7' }}
              thumbColor={masterOn ? '#10b981' : '#f3f4f6'}
            />
          </View>
        </View>

        {/* 종류별 */}
        {visibleTypes.length > 0 && (
          <View style={[styles.settingsList, { marginTop: 12, opacity: masterOn ? 1 : 0.45 }]}>
            {visibleTypes.map(({ groupKey, types }) => (
              <View key={groupKey} style={{ gap: 14 }}>
                <Text style={styles.groupHeader}>
                  {isForeign ? NOTIFICATION_GROUP_LABELS[groupKey].en : NOTIFICATION_GROUP_LABELS[groupKey].ko}
                </Text>
                {types.map(t => {
                  const on = settings[t.key] !== false;
                  return (
                    <View key={t.key} style={styles.settingItem}>
                      <View style={styles.settingInfo}>
                        <View style={styles.settingIconContainer}>
                          <Ionicons name={NOTIFICATION_ICONS[t.key]} size={22} color={masterOn && on ? '#3b82f6' : '#9ca3af'} />
                        </View>
                        <View style={styles.settingTextContainer}>
                          <Text style={styles.settingLabel}>{isForeign ? t.labelEn : t.label}</Text>
                          <Text style={styles.settingDescription}>{isForeign ? t.descEn : t.desc}</Text>
                        </View>
                      </View>
                      <Switch
                        value={masterOn && on}
                        onValueChange={() => handleToggleSetting(t.key)}
                        disabled={saving || !masterOn}
                        trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                        thumbColor={masterOn && on ? '#3b82f6' : '#f3f4f6'}
                      />
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.infoSection}>
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color="#6b7280" />
          <Text style={styles.infoText}>
            {isForeign
              ? 'You can change your notification settings at any time. If notification permission has been denied in your system settings, you will not receive notifications even after enabling them here.'
              : '알림 설정은 언제든지 변경할 수 있습니다. 시스템 설정에서 알림 권한이 거부된 경우, 설정을 변경하더라도 알림을 받을 수 없습니다.'}
          </Text>
        </View>
        {permissionStatus === 'granted' && (
          <TouchableOpacity
            style={styles.permissionGrantedBadge}
            onPress={() => Alert.alert(
              isForeign ? 'Notifications Enabled' : '알림 허용됨',
              isForeign
                ? 'Notifications are enabled for this app.'
                : '이 앱의 알림이 허용되어 있습니다.'
            )}
            accessibilityLabel={isForeign ? 'Notifications enabled' : '알림 허용됨'}
            accessibilityRole="button"
          >
            <Ionicons name="checkmark-circle" size={16} color="#10b981" />
            <Text style={styles.permissionGrantedText}>
              {isForeign ? 'Notifications enabled' : '알림 허용됨'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.footerSection}>
        <Text style={styles.footerTitle}>
          {isForeign ? 'Location Sharing' : '위치 공유'}
        </Text>
        <Text style={styles.sectionDescription}>
          {isSharingLocation || bgLocationRunning
            ? (isForeign ? 'Your location is currently being shared with camp staff (including in the background).' : '현재 캠프 운영진에게 위치를 공유하고 있습니다 (백그라운드 포함).')
            : (isForeign ? 'Location sharing is off.' : '위치 공유가 꺼져 있습니다.')}
          {'\n'}
          {isForeign ? 'Location records are automatically deleted 14 days after the last update.' : '위치 기록은 마지막 갱신 후 14일이 지나면 자동 삭제됩니다.'}
        </Text>
        <TouchableOpacity
          style={styles.footerLink}
          onPress={handleStopLocation}
          disabled={stoppingLocation}
          accessibilityRole="button"
          accessibilityLabel={isForeign ? 'Turn off location sharing' : '위치 공유 끄기'}
        >
          <View style={styles.footerLinkContent}>
            <Ionicons name="location-outline" size={20} color={isSharingLocation || bgLocationRunning ? '#dc2626' : '#6b7280'} />
            <Text style={styles.footerLinkText}>{isForeign ? 'Turn off location sharing now' : '지금 위치 공유 끄기'}</Text>
          </View>
          {stoppingLocation ? <ActivityIndicator size="small" color="#6b7280" /> : <Ionicons name="chevron-forward" size={20} color="#9ca3af" />}
        </TouchableOpacity>
      </View>

      <View style={styles.footerSection}>
        <Text style={styles.footerTitle}>
          {isForeign ? 'Blocked Users (Community)' : '차단한 사용자 (게시판)'}
        </Text>
        {blockedUsers.length === 0 ? (
          <Text style={styles.sectionDescription}>
            {isForeign ? 'No blocked users. You can block an author from a post menu.' : '차단한 사용자가 없습니다. 게시글 메뉴에서 작성자를 차단할 수 있습니다.'}
          </Text>
        ) : (
          blockedUsers.map((uid) => (
            <View key={uid} style={styles.footerLink}>
              <View style={styles.footerLinkContent}>
                <Ionicons name="ban-outline" size={20} color="#6b7280" />
                <Text style={styles.footerLinkText}>{blockedNames[uid] || (isForeign ? 'User' : '사용자') + ` (${uid.slice(0, 6)}…)`}</Text>
              </View>
              <TouchableOpacity onPress={() => handleUnblock(uid)} disabled={unblocking === uid} accessibilityRole="button" accessibilityLabel={isForeign ? 'Unblock' : '차단 해제'}>
                {unblocking === uid ? <ActivityIndicator size="small" color="#6b7280" /> : <Text style={{ color: '#2563eb', fontWeight: '600' }}>{isForeign ? 'Unblock' : '해제'}</Text>}
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={styles.footerSection}>
        <Text style={styles.footerTitle}>
          {isForeign ? 'Legal' : '법률 문서'}
        </Text>
        
        <TouchableOpacity 
          style={styles.footerLink}
          onPress={() => (navigation as any).navigate('PrivacyPolicy')}
        >
          <View style={styles.footerLinkContent}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#6b7280" />
            <Text style={styles.footerLinkText}>
              {isForeign ? 'Privacy Policy' : '개인정보처리방침'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.footerLink}
          onPress={() => (navigation as any).navigate('TermsOfService')}
        >
          <View style={styles.footerLinkContent}>
            <Ionicons name="document-text-outline" size={20} color="#6b7280" />
            <Text style={styles.footerLinkText}>
              {isForeign ? 'Terms of Service' : '서비스 이용약관'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      <View style={styles.appInfo}>
        <Text style={styles.appVersion}>SMIS Mentor v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
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
  groupHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    marginBottom: 10,
    marginTop: 2,
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
  permissionBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  permissionBannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  permissionBannerText: {
    flex: 1,
  },
  permissionBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  permissionBannerDescription: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  permissionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  permissionGrantedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  permissionGrantedText: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '500',
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
