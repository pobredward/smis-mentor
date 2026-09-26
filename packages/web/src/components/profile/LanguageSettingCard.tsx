'use client';

/**
 * 화면 언어 설정 — 비워 두면 계정 유형으로 (원어민 영어, 나머지 한국어)
 * 바꾸면 페이지를 새로 불러 모든 화면에 바로 적용한다.
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { L, LOCALES, type Locale } from '@smis-mentor/shared';
import { useAuth } from '@/contexts/AuthContext';
import { updateUser } from '@/lib/firebaseService';
import type { User } from '@/types';

export default function LanguageSettingCard() {
  const { userData } = useAuth();
  const [saving, setSaving] = useState(false);
  if (!userData) return null;
  const current: Locale | '' = userData.locale ?? '';

  const change = async (value: Locale | '') => {
    if (value === current || saving) return;
    setSaving(true);
    try {
      // 빈 값이면 필드를 지워 자동(역할 기준)으로
      await updateUser(userData.userId, { locale: value || null } as unknown as Partial<User>);
      toast.success(L('settings.languageSaved'));
      window.location.reload();
    } catch {
      toast.error(L('settings.languageSaveFailed'));
      setSaving(false);
    }
  };

  const options: Array<{ value: Locale | ''; label: string }> = [{ value: '', label: L('settings.languageAuto') }, ...LOCALES];
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-base font-semibold text-gray-900">{L('settings.language')}</h3>
      <p className="text-xs text-gray-500 mt-1 mb-3">{L('settings.languageDesc')}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value || 'auto'}
            type="button"
            disabled={saving}
            onClick={() => change(o.value)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              current === o.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            } disabled:opacity-50`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
