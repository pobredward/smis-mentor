'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { getAppConfig, updateAppConfig, DEFAULT_LOADING_QUOTES } from '@smis-mentor/shared';
import toast from 'react-hot-toast';

export default function AppConfigPage() {
  const { userData } = useAuth();
  const [loadingQuotes, setLoadingQuotes] = useState<string[]>([]);
  const [iosMinVersion, setIosMinVersion] = useState('');
  const [androidMinVersion, setAndroidMinVersion] = useState('');
  const [iosStoreUrl, setIosStoreUrl] = useState('');
  const [androidStoreUrl, setAndroidStoreUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newQuote, setNewQuote] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const config = await getAppConfig(db);
      
      if (config && config.loadingQuotes.length > 0) {
        setLoadingQuotes(config.loadingQuotes);
      } else {
        setLoadingQuotes(DEFAULT_LOADING_QUOTES);
      }

      // 플랫폼별 버전 우선, 없으면 공통 minVersion으로 초기값 설정 (마이그레이션 대응)
      setIosMinVersion(config?.iosMinVersion ?? config?.minVersion ?? '');
      setAndroidMinVersion(config?.androidMinVersion ?? config?.minVersion ?? '');
      setIosStoreUrl(config?.iosStoreUrl ?? '');
      setAndroidStoreUrl(config?.androidStoreUrl ?? '');
    } catch (error) {
      console.error('앱 설정 불러오기 실패:', error);
      toast.error('설정을 불러오는데 실패했습니다.');
      setLoadingQuotes(DEFAULT_LOADING_QUOTES);
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuote = () => {
    const trimmed = newQuote.trim();
    if (!trimmed) {
      toast.error('문구를 입력해주세요.');
      return;
    }
    
    if (loadingQuotes.includes(trimmed)) {
      toast.error('이미 존재하는 문구입니다.');
      return;
    }
    
    setLoadingQuotes([...loadingQuotes, trimmed]);
    setNewQuote('');
    toast.success('문구가 추가되었습니다.');
  };

  const handleRemoveQuote = (index: number) => {
    if (loadingQuotes.length <= 1) {
      toast.error('최소 1개의 문구가 필요합니다.');
      return;
    }
    
    const newQuotes = loadingQuotes.filter((_, i) => i !== index);
    setLoadingQuotes(newQuotes);
    toast.success('문구가 삭제되었습니다.');
  };

  const handleSave = async () => {
    if (!userData?.userId) {
      toast.error('사용자 정보를 찾을 수 없습니다.');
      return;
    }
    
    if (loadingQuotes.length === 0) {
      toast.error('최소 1개의 로딩 문구가 필요합니다.');
      return;
    }

    const trimmedIosMinVersion = iosMinVersion.trim();
    const trimmedAndroidMinVersion = androidMinVersion.trim();

    if (trimmedIosMinVersion && !/^\d+\.\d+\.\d+$/.test(trimmedIosMinVersion)) {
      toast.error('iOS 최소 버전은 1.0.0 형식으로 입력해주세요.');
      return;
    }
    if (trimmedAndroidMinVersion && !/^\d+\.\d+\.\d+$/.test(trimmedAndroidMinVersion)) {
      toast.error('Android 최소 버전은 1.0.0 형식으로 입력해주세요.');
      return;
    }
    
    try {
      setSaving(true);
      await updateAppConfig(
        db,
        {
          loadingQuotes,
          iosMinVersion: trimmedIosMinVersion || undefined,
          androidMinVersion: trimmedAndroidMinVersion || undefined,
          iosStoreUrl: iosStoreUrl.trim() || undefined,
          androidStoreUrl: androidStoreUrl.trim() || undefined,
        },
        userData.userId
      );
      toast.success('설정이 저장되었습니다!');
    } catch (error) {
      console.error('설정 저장 실패:', error);
      toast.error('설정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('기본 문구로 초기화하시겠습니까?')) {
      return;
    }
    
    setLoadingQuotes(DEFAULT_LOADING_QUOTES);
    toast.success('기본 문구로 초기화되었습니다.');
  };

  if (loading) {
    return (
      <Layout requireAuth requireAdmin>
        <div className="flex justify-center items-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-4xl mx-auto lg:px-4 px-0">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">앱 설정 관리</h1>
          <p className="mt-1 text-sm text-gray-600">
            모바일 앱의 로딩 문구와 강제 업데이트 정책을 관리합니다.
          </p>
        </div>

        {/* 현재 문구 목록 */}
        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <div className="border-b px-4 sm:px-6 py-3 flex justify-between items-center">
            <h2 className="text-lg font-semibold">로딩 문구 목록</h2>
            <span className="text-sm text-gray-600">{loadingQuotes.length}개</span>
          </div>
          
          <div className="px-4 sm:px-6 py-4">
            <div className="space-y-3">
              {loadingQuotes.map((quote, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <span className="text-sm text-gray-500 font-mono mt-0.5">
                    {(index + 1).toString().padStart(2, '0')}
                  </span>
                  <p className="flex-1 text-sm text-gray-800">{quote}</p>
                  <button
                    onClick={() => handleRemoveQuote(index)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                    disabled={saving}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 새 문구 추가 */}
        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <div className="border-b px-4 sm:px-6 py-3">
            <h2 className="text-lg font-semibold">새 문구 추가</h2>
          </div>
          
          <div className="px-4 sm:px-6 py-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={newQuote}
                onChange={(e) => setNewQuote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddQuote();
                  }
                }}
                placeholder="예: 오늘도 학생들과 함께 성장하는 하루 되세요 ✨"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={saving}
              />
              <Button
                variant="primary"
                onClick={handleAddQuote}
                disabled={saving}
              >
                추가
              </Button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              💡 팁: 이모지를 포함하면 더 생동감 있는 문구가 됩니다!
            </p>
          </div>
        </div>

        {/* 강제 업데이트 설정 */}
        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <div className="border-b px-4 sm:px-6 py-3">
            <h2 className="text-lg font-semibold">강제 업데이트 설정</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              최소 버전 미만의 앱 사용자에게 스토어 업데이트 화면이 표시됩니다. 비워두면 강제 업데이트를 사용하지 않습니다.
            </p>
          </div>
          <div className="px-4 sm:px-6 py-4 space-y-6">
            {/* iOS 설정 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                <h3 className="text-sm font-semibold text-gray-800">iOS</h3>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  최소 허용 버전
                  <span className="ml-1 text-xs text-gray-400 font-normal">(예: 1.0.0)</span>
                </label>
                <input
                  type="text"
                  value={iosMinVersion}
                  onChange={(e) => setIosMinVersion(e.target.value)}
                  placeholder="예: 1.0.0 (비워두면 강제 업데이트 비활성화)"
                  className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  App Store URL
                  <span className="ml-1 text-xs text-gray-400 font-normal">(비워두면 기본값 사용)</span>
                </label>
                <input
                  type="url"
                  value={iosStoreUrl}
                  onChange={(e) => setIosStoreUrl(e.target.value)}
                  placeholder="https://apps.apple.com/kr/app/..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Android 설정 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.523 15.341c-.065.066-.143.099-.221.099s-.157-.033-.221-.099l-1.064-1.064c-.979.638-2.147.999-3.396.999s-2.417-.361-3.396-.999l-1.064 1.064c-.065.066-.143.099-.221.099s-.157-.033-.221-.099c-.122-.122-.122-.32 0-.442l1.074-1.074C7.4 13.128 6.826 11.633 6.826 10H5.5c-.172 0-.312-.14-.312-.312s.14-.312.312-.312H6.826V8.532C6.826 5.459 9.285 3 12.621 3s5.795 2.459 5.795 5.532v.844h1.326c.172 0 .312.14.312.312s-.14.312-.312.312h-1.326c0 1.633-.574 3.128-1.567 4.293l1.074 1.074c.122.122.122.32 0 .442zm-8.702-6.09c0 1.762 1.439 3.201 3.2 3.201s3.201-1.439 3.201-3.201S13.783 6.05 12.021 6.05s-3.2 1.439-3.2 3.201zm1.5-4.5l-.75-1.5h6l-.75 1.5H10.32z"/>
                </svg>
                <h3 className="text-sm font-semibold text-gray-800">Android</h3>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  최소 허용 버전
                  <span className="ml-1 text-xs text-gray-400 font-normal">(예: 1.0.0)</span>
                </label>
                <input
                  type="text"
                  value={androidMinVersion}
                  onChange={(e) => setAndroidMinVersion(e.target.value)}
                  placeholder="예: 1.0.0 (비워두면 강제 업데이트 비활성화)"
                  className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Google Play URL
                  <span className="ml-1 text-xs text-gray-400 font-normal">(비워두면 기본값 사용)</span>
                </label>
                <input
                  type="url"
                  value={androidStoreUrl}
                  onChange={(e) => setAndroidStoreUrl(e.target.value)}
                  placeholder="https://play.google.com/store/apps/details?id=..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  disabled={saving}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 저장 버튼 */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={saving}
            className="flex-1"
          >
            기본값으로 초기화
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            isLoading={saving}
            className="flex-1"
          >
            {saving ? '저장 중...' : '저장'}
          </Button>
        </div>

        {/* 안내 */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">참고 사항</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• 로딩 문구는 모바일 앱 실행 시 랜덤으로 1개가 표시됩니다.</li>
                <li>• 변경사항은 즉시 반영되며, 다음 앱 실행부터 적용됩니다.</li>
                <li>• 최소 1개 이상의 문구가 필요합니다.</li>
                <li>• 강제 업데이트는 최소 버전을 설정해야 활성화되며, 스토어 배포 후 적용하세요.</li>
                <li>• 스토어 URL을 비워두면 기본 스토어 URL(com.smis.smismentor)이 사용됩니다.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
