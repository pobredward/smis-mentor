'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { FiBell, FiBellOff } from 'react-icons/fi';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
  visibleNotificationTypes,
  notificationMasterOn,
  notificationMasterTogglePatch,
  NOTIFICATION_GROUP_LABELS,
  type NotificationKey,
  type NotificationSettings,
  type NotificationType,
} from '@smis-mentor/shared';

/**
 * 마이페이지 › 알림 설정
 * - 전체 on/off 하나 + 종류별 on/off
 * - 보이는 종류는 권한(관리자 · 부매니저 · 멘토 · 원어민)에 따라 다르고,
 *   users 문서를 onSnapshot 으로 보고 있으므로 권한이 바뀌면 화면도 바로 바뀐다.
 * - 값이 저장되어 있지 않은 종류는 '켜짐'으로 본다 (보내는 쪽 notificationAllowed 와 같은 기준).
 */
export default function NotificationSettingsCard() {
  const { userData } = useAuth();
  const uid = userData?.userId;
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const [settings, setSettings] = useState<NotificationSettings>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  // 설정도 실시간으로 (다른 기기에서 바꿔도 바로 반영)
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'users', uid), snap => {
      setSettings((snap.data()?.notificationSettings ?? {}) as NotificationSettings);
    }, e => console.warn('알림 설정 구독 오류:', e));
  }, [uid]);

  const masterOn = notificationMasterOn(settings);

  const groups = useMemo(() => {
    const list = visibleNotificationTypes(userData as { role?: string; jobExperiences?: Array<{ id?: string; group?: string; groupRole?: string }> } | null);
    const order: NotificationType['group'][] = ['task', 'supply', 'stock', 'lost'];
    return order.map(g => ({ g, types: list.filter(t => t.group === g) })).filter(x => x.types.length > 0);
  }, [userData]);

  const toggle = async (key: NotificationKey | 'generalNotifications') => {
    if (!uid || saving) return;
    // 전체 스위치: 켤 때는 보이는 종류도 모두 켠다
    const patch: NotificationSettings = key === 'generalNotifications'
      ? notificationMasterTogglePatch(settings, groups.flatMap(g => g.types.map(t => t.key)))
      : { [key]: settings[key] === false }; // 없으면 켜짐 → 끈다
    setSaving(key);
    setError('');
    try {
      await setDoc(doc(db, 'users', uid), { notificationSettings: patch }, { merge: true });
    } catch (e) {
      console.error('알림 설정 저장 오류:', e);
      setError(isForeign ? 'Failed to save. Please try again.' : '저장하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(null);
    }
  };

  const Toggle = ({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-emerald-500' : 'bg-gray-300'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );

  if (!uid) return null;

  return (
    <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        {masterOn ? <FiBell className="w-5 h-5 text-emerald-600" /> : <FiBellOff className="w-5 h-5 text-gray-400" />}
        <h2 className="text-base font-bold text-gray-900">{isForeign ? 'Notification Settings' : '알림 설정'}</h2>
        <span className="ml-auto text-xs text-gray-400">
          {isForeign ? 'Push notifications on the app' : '앱 푸시 알림'}
        </span>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-4">
        <p className="text-xs text-gray-500">
          {isForeign
            ? 'Turn everything off at once, or choose the kinds you want. Types shown here depend on your role in the camp.'
            : '전체를 한 번에 끄거나, 종류별로 고를 수 있어요. 보이는 종류는 캠프에서의 역할에 따라 달라집니다.'}
        </p>

        {/* 전체 */}
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">{isForeign ? 'All notifications' : '전체 알림'}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {masterOn
                ? (isForeign ? 'On — set each kind below.' : '켜짐 — 아래에서 종류별로 조절할 수 있어요.')
                : (isForeign ? 'Off — no push notifications at all.' : '꺼짐 — 어떤 푸시 알림도 오지 않아요.')}
            </p>
          </div>
          <Toggle on={masterOn} disabled={saving === 'generalNotifications'} onClick={() => toggle('generalNotifications')} />
        </div>

        {/* 종류별 */}
        <div className={masterOn ? '' : 'opacity-50 pointer-events-none'}>
          {groups.map(({ g, types }) => (
            <div key={g} className="mb-4 last:mb-0">
              <p className="text-[11px] font-bold text-gray-500 mb-1.5">
                {isForeign ? NOTIFICATION_GROUP_LABELS[g].en : NOTIFICATION_GROUP_LABELS[g].ko}
              </p>
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                {types.map(t => {
                  const on = settings[t.key] !== false;
                  return (
                    <div key={t.key} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{isForeign ? t.labelEn : t.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{isForeign ? t.descEn : t.desc}</p>
                      </div>
                      <Toggle on={masterOn && on} disabled={saving === t.key} onClick={() => toggle(t.key)} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        <p className="text-[11px] text-gray-400">
          {isForeign
            ? 'Notifications are delivered to the mobile app. If you denied permission in your phone settings, you will not receive them even when enabled here.'
            : '알림은 모바일 앱으로 갑니다. 휴대폰 설정에서 알림을 거부했다면 여기서 켜도 받을 수 없어요.'}
        </p>
      </div>
    </div>
  );
}
