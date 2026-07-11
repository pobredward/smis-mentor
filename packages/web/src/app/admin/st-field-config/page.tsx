'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/common/Layout';
import StFieldConfigEditor from '@/components/admin/StFieldConfigEditor';
import { auth } from '@/lib/firebase';
import {
  getDefaultFieldConfig,
  type CampType,
  type STSheetFieldConfig,
} from '@smis-mentor/shared';

const CAMP_TYPES: { type: CampType; label: string; description: string }[] = [
  { type: 'EJ', label: 'EJ 캠프', description: 'E캠프·J캠프 (입퇴소 여정 있음)' },
  { type: 'S',  label: 'S 캠프',  description: 'S캠프 (여권·단체티 있음)'       },
  { type: 'DG', label: 'DG 캠프', description: 'D·G·K캠프 (레벨 테스트 없음)' },
  { type: 'F',  label: 'F 캠프',  description: 'F캠프 (가족형)'                 },
];

export default function StFieldConfigPage() {
  const [activeCampType, setActiveCampType] = useState<CampType>('EJ');
  const [config, setConfig] = useState<STSheetFieldConfig | null>(null);
  const [availableHeaders, setAvailableHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<'success' | 'error' | null>(null);

  const loadConfig = useCallback(async (campType: CampType) => {
    setLoading(true);
    setSaveResult(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('로그인이 필요합니다.');

      const res = await fetch(`/api/admin/st-field-config?campType=${campType}`, {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const { config: fetchedConfig, availableHeaders: fetchedHeaders } = await res.json();
      setConfig(fetchedConfig ?? getDefaultFieldConfig(campType));
      setAvailableHeaders(fetchedHeaders ?? []);
    } catch (err) {
      console.error('[StFieldConfig] 설정 로드 실패:', err);
      setConfig(getDefaultFieldConfig(campType));
      setAvailableHeaders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig(activeCampType);
  }, [activeCampType, loadConfig]);

  const handleSave = useCallback(async (updatedConfig: STSheetFieldConfig) => {
    setIsSaving(true);
    setSaveResult(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('로그인이 필요합니다.');

      const res = await fetch('/api/admin/st-field-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify(updatedConfig),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setConfig(updatedConfig);
      setSaveResult('success');
    } catch (err) {
      console.error('[StFieldConfig] 저장 실패:', err);
      setSaveResult('error');
    } finally {
      setIsSaving(false);
    }
  }, []);

  const handleResetToDefault = useCallback(async () => {
    if (!confirm(`${activeCampType} 캠프의 설정을 기본값으로 초기화하시겠습니까?`)) return;
    const defaultCfg = getDefaultFieldConfig(activeCampType);
    await handleSave(defaultCfg);
  }, [activeCampType, handleSave]);

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-5xl mx-auto">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">ST시트 필드 설정</h1>
          <p className="mt-1 text-sm text-gray-500">
            학생 상세 화면에서 표시할 섹션과 필드를 캠프 타입별로 설정합니다.
            스프레드시트 동기화 후 새 헤더가 자동으로 감지됩니다.
          </p>
        </div>

        {/* 캠프 타입 탭 */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {CAMP_TYPES.map(({ type, label, description }) => (
            <button
              key={type}
              onClick={() => setActiveCampType(type)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition ${
                activeCampType === type
                  ? 'bg-white border border-b-white border-gray-200 text-blue-600 -mb-px'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title={description}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 알림 */}
        {saveResult === 'success' && (
          <div className="mb-4 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            설정이 저장되었습니다.
          </div>
        )}
        {saveResult === 'error' && (
          <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            저장에 실패했습니다. 다시 시도해 주세요.
          </div>
        )}

        {/* 안내 */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {availableHeaders.length > 0
              ? `최신 시트에서 ${availableHeaders.length}개 헤더 감지됨`
              : '아직 동기화 기록이 없습니다. 캠프 화면에서 ST시트 동기화를 먼저 실행하세요.'}
          </p>
          <button
            onClick={handleResetToDefault}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            기본값으로 초기화
          </button>
        </div>

        {/* 에디터 */}
        {loading ? (
          <div className="text-center py-16 text-sm text-gray-400">불러오는 중...</div>
        ) : config ? (
          <StFieldConfigEditor
            config={config}
            availableHeaders={availableHeaders}
            onSave={handleSave}
            isSaving={isSaving}
          />
        ) : null}
      </div>
    </Layout>
  );
}
