'use client';
import { logger } from '@smis-mentor/shared';

import { useState, useEffect } from 'react';
import { FiArrowLeft, FiRefreshCw, FiDatabase, FiSearch, FiDownload, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { authenticatedGet, authenticatedPost } from '@/lib/apiClient';

interface BackupMetadata {
  backupDate: { _seconds: number };
  totalUsers: number;
  successCount: number;
  errorCount: number;
  statistics: {
    totalConsistent: number;
    totalInconsistent: number;
    noAuthAccount: number;
    docIdNotEqualUserId: number;
    docIdNotEqualId: number;
    docIdNotEqualAuthUid: number;
  };
}

interface BackupData {
  firestoreDocId: string;
  firestoreUserId: string;
  firestoreIdField: string;
  firebaseAuthUid: string | null;
  email: string;
  name: string;
  phoneNumber: string;
  status: string;
  role: string;
  isConsistent: boolean;
  hasAuthAccount: boolean;
  issues: string[];
}

export default function UserIdBackupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [backupStatus, setBackupStatus] = useState<any>(null);
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState<BackupData | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const loadBackupStatus = async () => {
    try {
      const data = await authenticatedGet<any>('/api/admin/backup-user-ids');
      
      if (data.success) {
        setBackupStatus(data);
      }
    } catch (error: any) {
      logger.error('백업 상태 조회 실패:', error);
    }
  };

  useEffect(() => {
    loadBackupStatus();
  }, []);

  const createBackup = async () => {
    if (!confirm('440명의 사용자 ID 매핑 데이터를 백업하시겠습니까? (약 1-2분 소요)')) {
      return;
    }

    setLoading(true);
    try {
      const data = await authenticatedPost<any>('/api/admin/backup-user-ids', {});
      
      if (data.success) {
        toast.success(`백업 완료: ${data.summary.successCount}명`);
        await loadBackupStatus();
      } else {
        toast.error('백업 실패: ' + data.error);
      }
    } catch (error: any) {
      logger.error('백업 오류:', error);
      toast.error(error.message || '백업 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const searchBackup = async () => {
    if (!searchEmail) {
      toast.error('이메일을 입력하세요.');
      return;
    }

    setSearchLoading(true);
    setSearchResult(null);
    
    try {
      const data = await authenticatedGet<any>(`/api/admin/backup-user-ids/search?email=${encodeURIComponent(searchEmail)}`);
      
      if (data.success && data.found) {
        setSearchResult(data.backup);
        toast.success('백업 데이터를 찾았습니다.');
      } else {
        toast.error('해당 이메일의 백업 데이터를 찾을 수 없습니다.');
      }
    } catch (error: any) {
      logger.error('검색 오류:', error);
      toast.error(error.message || '검색 중 오류가 발생했습니다.');
    } finally {
      setSearchLoading(false);
    }
  };

  const formatDate = (seconds: number) => {
    return new Date(seconds * 1000).toLocaleString('ko-KR');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/admin')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <FiArrowLeft className="w-5 h-5 mr-2" />
            관리자 페이지로 돌아가기
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">사용자 ID 매핑 백업</h1>
              <p className="text-gray-600 mt-2">
                Firebase Auth UID와 Firestore Document ID의 매핑 관계를 안전하게 백업합니다.
              </p>
            </div>
            <button
              onClick={createBackup}
              disabled={loading}
              className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              <FiDatabase className={`w-5 h-5 mr-2 ${loading ? 'animate-pulse' : ''}`} />
              {loading ? '백업 중...' : '새 백업 생성'}
            </button>
          </div>
        </div>

        {/* 백업 상태 */}
        {backupStatus?.hasBackup && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">전체 사용자</p>
                  <p className="text-2xl font-bold text-gray-900">{backupStatus.metadata.totalUsers}</p>
                </div>
                <FiCheckCircle className="w-8 h-8 text-blue-600" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">일관성 있음</p>
                  <p className="text-2xl font-bold text-green-600">{backupStatus.metadata.statistics.totalConsistent}</p>
                </div>
                <FiCheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">불일치</p>
                  <p className="text-2xl font-bold text-red-600">{backupStatus.metadata.statistics.totalInconsistent}</p>
                </div>
                <FiAlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Auth 없음</p>
                  <p className="text-2xl font-bold text-orange-600">{backupStatus.metadata.statistics.noAuthAccount}</p>
                </div>
                <FiAlertTriangle className="w-8 h-8 text-orange-600" />
              </div>
            </div>
          </div>
        )}

        {/* 백업 정보 */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">백업 정보</h2>
          </div>
          <div className="p-6">
            {backupStatus?.hasBackup ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">백업 컬렉션:</span>
                  <span className="font-mono text-sm bg-gray-100 px-3 py-1 rounded">
                    user_id_mappings_backup
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">백업 일시:</span>
                  <span className="font-medium">
                    {formatDate(backupStatus.metadata.backupDate._seconds)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">백업된 문서 수:</span>
                  <span className="font-medium">{backupStatus.backupCount}개</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">성공:</span>
                  <span className="text-green-600 font-medium">{backupStatus.metadata.successCount}명</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">실패:</span>
                  <span className="text-red-600 font-medium">{backupStatus.metadata.errorCount}명</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <FiDatabase className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600">백업이 존재하지 않습니다.</p>
                <p className="text-sm text-gray-500 mt-2">위의 "새 백업 생성" 버튼을 눌러 백업을 시작하세요.</p>
              </div>
            )}
          </div>
        </div>

        {/* 백업 데이터 검색 */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">백업 데이터 검색</h2>
          </div>
          <div className="p-6">
            <div className="flex gap-3 mb-6">
              <div className="flex-1 relative">
                <FiSearch className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <input
                  type="email"
                  placeholder="이메일로 검색..."
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchBackup()}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={searchBackup}
                disabled={searchLoading || !backupStatus?.hasBackup}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {searchLoading ? '검색 중...' : '검색'}
              </button>
            </div>

            {searchResult && (
              <div className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{searchResult.name}</h3>
                    <p className="text-sm text-gray-600">{searchResult.email}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    searchResult.isConsistent
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {searchResult.isConsistent ? '일관성 있음' : '불일치'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Firestore Document ID</p>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                      {searchResult.firestoreDocId}
                    </code>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Firebase Auth UID</p>
                    <code className={`text-xs px-2 py-1 rounded block ${
                      searchResult.firebaseAuthUid
                        ? 'bg-gray-100'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {searchResult.firebaseAuthUid || 'N/A'}
                    </code>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Firestore userId 필드</p>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                      {searchResult.firestoreUserId}
                    </code>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Firestore id 필드</p>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                      {searchResult.firestoreIdField}
                    </code>
                  </div>
                </div>

                {searchResult.issues.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-red-900 mb-2">문제점:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {searchResult.issues.map((issue, i) => (
                        <li key={i} className="text-sm text-red-800">{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 안내 */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">💡 백업 용도</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• ID 마이그레이션 전 안전장치로 사용</li>
            <li>• 문제 발생 시 원본 ID 확인 및 복구</li>
            <li>• Firestore 컬렉션: <code className="bg-blue-100 px-2 py-0.5 rounded">user_id_mappings_backup</code></li>
            <li>• 메타데이터: <code className="bg-blue-100 px-2 py-0.5 rounded">user_id_mappings_backup_metadata/latest</code></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
