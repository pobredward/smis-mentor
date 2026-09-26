import React, { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { logger, LOCALES, type Locale } from '@smis-mentor/shared';
import { doc, updateDoc, deleteField, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
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
import { L, isEnglishUI } from '@smis-mentor/shared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { userData, refreshUserData, isSharingLocation, setIsSharingLocation } = useAuth();
  const [savingLocale, setSavingLocale] = useState(false);
  /** 화면 언어 바꾸기 — 빈 값이면 필드를 지워 자동(역할 기준)으로. 저장 후 화면을 새로 그린다 */
  const changeLocale = async (value: Locale | '') => {
    if (!userData || savingLocale || (userData.locale ?? '') === value) return;
    setSavingLocale(true);
    try {
      await updateDoc(doc(db, 'users', userData.userId), { locale: value ? value : deleteField(), updatedAt: Timestamp.now() });
      await refreshUserData();
    } catch (e) {
      logger.error('언어 변경 실패:', e);
      Alert.alert(L('common.error'), L('settings.languageSaveFailed'));
    } finally {
      setSavingLocale(false);
    }
  };
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
      Alert.alert(L('settings.locationSharingOff'), L('settings.locationSharingHasBeenTurned'));
    } catch {
      Alert.alert(L('common.error'), L('settings.failedToStopLocationSharing'));
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
      Alert.alert(L('common.error'), L('settings.failedToUnblock'));
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
        L('common.error'),
        L('settings.failedToLoadNotificationSettings')
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
        L('common.error'),
        L('settings.failedToUpdateNotificationSettings')
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
          {L('common.loginRequired')}
        </Text>
        <Text style={styles.emptyText}>
          {L('common.pleaseLogInToAccess')}
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>
          {L('settings.loadingSettings')}
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
      title: isEnglishUI()
        ? permissionStatus === 'denied' ? 'Notifications Blocked' : 'Enable Notifications'
        : permissionStatus === 'denied' ? L('common.notificationsAreBlocked') : L('settings.notificationsNeedToBeAllowed'),
      description: isEnglishUI()
        ? permissionStatus === 'denied'
          ? 'Tap below to open settings and enable notifications.'
          : 'Tap below to allow notifications for this app.'
        : permissionStatus === 'denied'
          ? L('settings.tapTheButtonBelowTo2')
          : L('settings.tapTheButtonBelowTo'),
      buttonText: isEnglishUI()
        ? permissionStatus === 'denied' ? 'Open Settings' : 'Allow Notifications'
        : permissionStatus === 'denied' ? L('common.openSettings') : L('settings.enableNotifications'),
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

      {/* 화면 언어 — 비워 두면 계정 유형으로 (원어민 영어) */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="language-outline" size={24} color="#3b82f6" />
          <Text style={styles.sectionTitle}>{L('settings.language')}</Text>
        </View>
        <Text style={styles.sectionDescription}>{L('settings.languageDesc')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {([{ value: '', label: L('settings.languageAuto') }, ...LOCALES] as Array<{ value: Locale | ''; label: string }>).map((o) => {
            const selected = (userData?.locale ?? '') === o.value;
            return (
              <TouchableOpacity
                key={o.value || 'auto'}
                disabled={savingLocale}
                onPress={() => changeLocale(o.value)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
                  borderColor: selected ? '#2563eb' : '#e5e7eb', backgroundColor: selected ? '#2563eb' : '#fff',
                  opacity: savingLocale ? 0.5 : 1,
                }}
              >
                <Text style={{ color: selected ? '#fff' : '#374151', fontSize: 14 }}>{o.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="notifications-outline" size={24} color="#3b82f6" />
          <Text style={styles.sectionTitle}>
            {L('common.notificationSettings')}
          </Text>
        </View>
        <Text style={styles.sectionDescription}>
          {L('settings.turnEverythingOffAtOnce')}
        </Text>

        {/* 전체 on/off */}
        <View style={styles.settingsList}>
          <View style={[styles.settingItem, { backgroundColor: '#f8fafc' }]}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconContainer}>
                <Ionicons name={masterOn ? 'notifications' : 'notifications-off'} size={24} color={masterOn ? '#10b981' : '#9ca3af'} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>{L('settings.allNotifications')}</Text>
                <Text style={styles.settingDescription}>
                  {masterOn
                    ? (L('settings.onEachKindCanBe'))
                    : (L('settings.offNoPushNotificationsAt'))}
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
                  {isEnglishUI() ? NOTIFICATION_GROUP_LABELS[groupKey].en : NOTIFICATION_GROUP_LABELS[groupKey].ko}
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
                          <Text style={styles.settingLabel}>{isEnglishUI() ? t.labelEn : t.label}</Text>
                          <Text style={styles.settingDescription}>{isEnglishUI() ? t.descEn : t.desc}</Text>
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
            {L('settings.youCanChangeYourNotification')}
          </Text>
        </View>
        {permissionStatus === 'granted' && (
          <TouchableOpacity
            style={styles.permissionGrantedBadge}
            onPress={() => Alert.alert(
              L('settings.notificationsEnabled'),
              L('settings.notificationsAreEnabledForThis')
            )}
            accessibilityLabel={L('settings.notificationsEnabled2')}
            accessibilityRole="button"
          >
            <Ionicons name="checkmark-circle" size={16} color="#10b981" />
            <Text style={styles.permissionGrantedText}>
              {L('settings.notificationsEnabled2')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.footerSection}>
        <Text style={styles.footerTitle}>
          {L('settings.locationSharing')}
        </Text>
        <Text style={styles.sectionDescription}>
          {isSharingLocation || bgLocationRunning
            ? (L('settings.yourLocationIsCurrentlyBeing'))
            : (L('settings.locationSharingIsOff'))}
          {'\n'}
          {L('settings.locationRecordsAreAutomaticallyDeleted')}
        </Text>
        <TouchableOpacity
          style={styles.footerLink}
          onPress={handleStopLocation}
          disabled={stoppingLocation}
          accessibilityRole="button"
          accessibilityLabel={L('settings.turnOffLocationSharing')}
        >
          <View style={styles.footerLinkContent}>
            <Ionicons name="location-outline" size={20} color={isSharingLocation || bgLocationRunning ? '#dc2626' : '#6b7280'} />
            <Text style={styles.footerLinkText}>{L('settings.turnOffLocationSharingNow')}</Text>
          </View>
          {stoppingLocation ? <ActivityIndicator size="small" color="#6b7280" /> : <Ionicons name="chevron-forward" size={20} color="#9ca3af" />}
        </TouchableOpacity>
      </View>

      <View style={styles.footerSection}>
        <Text style={styles.footerTitle}>
          {L('settings.blockedUsersCommunity')}
        </Text>
        {blockedUsers.length === 0 ? (
          <Text style={styles.sectionDescription}>
            {L('settings.noBlockedUsersYouCan')}
          </Text>
        ) : (
          blockedUsers.map((uid) => (
            <View key={uid} style={styles.footerLink}>
              <View style={styles.footerLinkContent}>
                <Ionicons name="ban-outline" size={20} color="#6b7280" />
                <Text style={styles.footerLinkText}>{blockedNames[uid] || (L('settings.user')) + ` (${uid.slice(0, 6)}…)`}</Text>
              </View>
              <TouchableOpacity onPress={() => handleUnblock(uid)} disabled={unblocking === uid} accessibilityRole="button" accessibilityLabel={L('settings.unblock')}>
                {unblocking === uid ? <ActivityIndicator size="small" color="#6b7280" /> : <Text style={{ color: '#2563eb', fontWeight: '600' }}>{L('settings.unblock2')}</Text>}
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={styles.footerSection}>
        <Text style={styles.footerTitle}>
          {L('settings.legal')}
        </Text>
        
        <TouchableOpacity 
          style={styles.footerLink}
          onPress={() => (navigation as any).navigate('PrivacyPolicy')}
        >
          <View style={styles.footerLinkContent}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#6b7280" />
            <Text style={styles.footerLinkText}>
              {L('common.privacyPolicy')}
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
              {L('common.termsOfService')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      <View style={styles.appInfo}>
        <Text style={styles.appVersion}>SMIS Mentor v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
        <Text style={styles.copyright}>{L('settings.n2026SmisCoLtdAll')}</Text>
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
