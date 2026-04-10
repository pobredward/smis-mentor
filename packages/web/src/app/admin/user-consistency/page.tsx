'use client';
import { logger } from '@smis-mentor/shared';

import { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle, XCircle, Search, Download, Edit2, Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { authenticatedGet, authenticatedPost } from '@/lib/apiClient';

interface ConsistencyIssue {
  firestoreDocId: string;
  firestoreUserId: string;
  firestoreId: string;
  authUid?: string;
  email: string;
  name: string;
  status: string;
  role: string;
  internalConsistent: boolean;
  issues: string[];
}

interface ConsistencySummary {
  totalFirestoreUsers: number;
  totalAuthUsers: number;
  consistentUsers: number;
  inconsistentUsers: number;
  orphanedFirestoreUsers: number;
  orphanedAuthUsers: number;
}

interface ConsistencyReport {
  summary: ConsistencySummary;
  allUsers: ConsistencyIssue[];
  inconsistencies: ConsistencyIssue[];
  orphanedFirestoreUsers: any[];
  orphanedAuthUsers: any[];
}

export default function UserConsistencyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ConsistencyReport | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'consistent' | 'inconsistent' | 'internal' | 'auth' | 'orphaned'>('all');
  const [filteredData, setFilteredData] = useState<ConsistencyIssue[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [newIdValue, setNewIdValue] = useState('');
  const [updating, setUpdating] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    try {
      const data = await authenticatedGet<ConsistencyReport & { success: boolean; error?: string }>('/api/debug/verify-consistency');
      
      if (data.success) {
        setReport(data);
        setFilteredData(data.allUsers);
        toast.success(`검증 완료: 총 ${data.summary.totalFirestoreUsers}명 (일치: ${data.summary.consistentUsers}명, 불일치: ${data.summary.inconsistentUsers}명)`);
      } else {
        toast.error('검증 실패: ' + data.error);
      }
    } catch (error: any) {
      logger.error('검증 오류:', error);
      toast.error(error.message || '검증 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  useEffect(() => {
    if (!report) return;

    let filtered = report.allUsers;

    // 필터 적용
    if (filterType === 'consistent') {
      filtered = filtered.filter(u => u.issues.length === 0);
    } else if (filterType === 'inconsistent') {
      filtered = filtered.filter(u => u.issues.length > 0);
    } else if (filterType === 'internal') {
      filtered = filtered.filter(u => !u.internalConsistent);
    } else if (filterType === 'auth') {
      filtered = filtered.filter(u => 
        u.issues.some(issue => issue.includes('Auth UID'))
      );
    } else if (filterType === 'orphaned') {
      filtered = filtered.filter(u => 
        u.issues.some(issue => issue.includes('존재하지 않음'))
      );
    }

    // 검색 적용
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(u => 
        u.email?.toLowerCase().includes(term) ||
        u.name?.toLowerCase().includes(term) ||
        u.firestoreDocId?.toLowerCase().includes(term) ||
        u.authUid?.toLowerCase().includes(term)
      );
    }

    setFilteredData(filtered);
  }, [report, filterType, searchTerm]);

  const downloadReport = () => {
    if (!report) return;

    const dataStr = JSON.stringify(report, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `user-consistency-report-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('리포트 다운로드 완료');
  };

  const getSeverityColor = (issues: string[]) => {
    if (issues.some(i => i.includes('Auth UID') && i.includes('불일치'))) return 'text-red-600 bg-red-50';
    if (issues.some(i => i.includes('documentId ≠'))) return 'text-orange-600 bg-orange-50';
    return 'text-yellow-600 bg-yellow-50';
  };

  const getSeverityBadge = (issues: string[]) => {
    if (issues.some(i => i.includes('Auth UID') && i.includes('불일치'))) return '🔴 심각';
    if (issues.some(i => i.includes('documentId ≠'))) return '🟠 경고';
    return '🟡 주의';
  };

  const handleStartEdit = (user: ConsistencyIssue) => {
    setEditingUserId(user.firestoreDocId);
    setNewIdValue(user.authUid || user.firestoreDocId);
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setNewIdValue('');
  };

  const handleUpdateIds = async (currentDocId: string) => {
    if (!newIdValue || newIdValue === currentDocId) {
      toast.error('새로운 ID를 입력하거나 다른 값을 사용하세요.');
      return;
    }

    if (!confirm(`정말로 사용자 ID를 변경하시겠습니까?\n\n현재 ID: ${currentDocId}\n새로운 ID: ${newIdValue}\n\n⚠️ 이 작업은 되돌릴 수 없으며, 관련된 모든 데이터가 업데이트됩니다.`)) {
      return;
    }

    setUpdating(true);
    try {
      const result = await authenticatedPost<any>('/api/admin/user-consistency/update-ids', {
        currentDocId,
        newId: newIdValue,
      });

      if (result.success) {
        toast.success(`사용자 ID가 성공적으로 변경되었습니다: ${currentDocId} → ${newIdValue}`);
        if (result.authNote) {
          toast.success(result.authNote);
        }
        setEditingUserId(null);
        setNewIdValue('');
        await loadReport();
      } else {
        toast.error(`ID 변경 실패: ${result.error}`);
      }
    } catch (error: any) {
      logger.error('ID 변경 오류:', error);
      toast.error(error.message || 'ID 변경 중 오류가 발생했습니다.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading && !report) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">사용자 ID 일관성 검증 중...</p>
              <p className="text-sm text-gray-500 mt-2">440명의 사용자 데이터를 분석하고 있습니다.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/admin')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            관리자 페이지로 돌아가기
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">사용자 ID 일관성 검증</h1>
              <p className="text-gray-600 mt-2">
                Firebase Auth UID, Firestore Document ID, userId 필드, id 필드의 일관성을 확인합니다.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={downloadReport}
                disabled={!report}
                className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
              >
                <Download className="w-4 h-4 mr-2" />
                리포트 다운로드
              </button>
              <button
                onClick={loadReport}
                disabled={loading}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                재검증
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {report && (
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">전체 사용자</p>
                  <p className="text-2xl font-bold text-gray-900">{report.summary.totalFirestoreUsers}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <CheckCircle className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">일치</p>
                  <p className="text-2xl font-bold text-green-600">{report.summary.consistentUsers}</p>
                  <p className="text-xs text-gray-500">
                    ({((report.summary.consistentUsers / report.summary.totalFirestoreUsers) * 100).toFixed(1)}%)
                  </p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">불일치</p>
                  <p className="text-2xl font-bold text-red-600">{report.summary.inconsistentUsers}</p>
                  <p className="text-xs text-gray-500">
                    ({((report.summary.inconsistentUsers / report.summary.totalFirestoreUsers) * 100).toFixed(1)}%)
                  </p>
                </div>
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Auth 사용자</p>
                  <p className="text-2xl font-bold text-gray-900">{report.summary.totalAuthUsers}</p>
                </div>
                <div className="p-3 bg-indigo-100 rounded-full">
                  <CheckCircle className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">고아 Firestore</p>
                  <p className="text-2xl font-bold text-orange-600">{report.summary.orphanedFirestoreUsers}</p>
                </div>
                <div className="p-3 bg-orange-100 rounded-full">
                  <XCircle className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">고아 Auth</p>
                  <p className="text-2xl font-bold text-yellow-600">{report.summary.orphanedAuthUsers}</p>
                </div>
                <div className="p-3 bg-yellow-100 rounded-full">
                  <XCircle className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="text"
                placeholder="이메일, 이름, Document ID, Auth UID로 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilterType('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterType === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                전체 ({report?.allUsers.length || 0})
              </button>
              <button
                onClick={() => setFilterType('consistent')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterType === 'consistent'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                일치 ({report?.summary.consistentUsers || 0})
              </button>
              <button
                onClick={() => setFilterType('inconsistent')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterType === 'inconsistent'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                불일치 ({report?.summary.inconsistentUsers || 0})
              </button>
              <button
                onClick={() => setFilterType('internal')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterType === 'internal'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                내부 불일치
              </button>
              <button
                onClick={() => setFilterType('auth')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterType === 'auth'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Auth 불일치
              </button>
              <button
                onClick={() => setFilterType('orphaned')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterType === 'orphaned'
                    ? 'bg-yellow-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                고아 데이터
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">
              사용자 목록 ({filteredData.length}명)
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상태
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    사용자 정보
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Firestore Doc ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Firestore userId
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Firestore id
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Firebase Auth UID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    문제점
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData.map((user, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.issues.length === 0 ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full text-green-600 bg-green-50">
                          ✅ 정상
                        </span>
                      ) : (
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSeverityColor(user.issues)}`}>
                          {getSeverityBadge(user.issues)}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">{user.name}</div>
                        <div className="text-gray-500 text-xs">{user.email}</div>
                        <div className="text-gray-400 text-xs">
                          {user.status} / {user.role}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-mono text-gray-900 bg-gray-100 px-2 py-1 rounded">
                        {user.firestoreDocId}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`text-xs font-mono px-2 py-1 rounded ${
                        user.firestoreDocId === user.firestoreUserId
                          ? 'text-green-900 bg-green-100'
                          : 'text-red-900 bg-red-100'
                      }`}>
                        {user.firestoreUserId}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`text-xs font-mono px-2 py-1 rounded ${
                        user.firestoreDocId === user.firestoreId
                          ? 'text-green-900 bg-green-100'
                          : 'text-red-900 bg-red-100'
                      }`}>
                        {user.firestoreId || 'undefined'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {user.authUid ? (
                        <div className={`text-xs font-mono px-2 py-1 rounded ${
                          user.firestoreDocId === user.authUid
                            ? 'text-green-900 bg-green-100'
                            : 'text-red-900 bg-red-100'
                        }`}>
                          {user.authUid}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {user.issues.length === 0 ? (
                        <span className="text-xs text-green-600 flex items-center">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          문제 없음
                        </span>
                      ) : (
                        <div className="space-y-1">
                          {user.issues.map((issue, i) => (
                            <div key={i} className="text-xs text-gray-600 flex items-start">
                              <AlertTriangle className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0 text-orange-500" />
                              <span>{issue}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {editingUserId === user.firestoreDocId ? (
                        <div className="flex flex-col gap-2 min-w-[200px]">
                          <input
                            type="text"
                            value={newIdValue}
                            onChange={(e) => setNewIdValue(e.target.value)}
                            placeholder="새로운 ID 입력"
                            className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            disabled={updating}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleUpdateIds(user.firestoreDocId)}
                              disabled={updating || !newIdValue}
                              className="flex-1 flex items-center justify-center px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Save className="w-3 h-3 mr-1" />
                              {updating ? '저장 중...' : '저장'}
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              disabled={updating}
                              className="flex-1 flex items-center justify-center px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50"
                            >
                              <X className="w-3 h-3 mr-1" />
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleStartEdit(user)}
                          disabled={updating || editingUserId !== null}
                          className="flex items-center px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          ID 변경
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredData.length === 0 && (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <p className="text-gray-600">조건에 맞는 사용자가 없습니다.</p>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">💡 용어 설명</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li><strong>Firestore Doc ID:</strong> Firestore 문서의 고유 ID (Document ID)</li>
            <li><strong>Firestore userId:</strong> Firestore 문서 내부의 userId 필드 값</li>
            <li><strong>Firestore id:</strong> Firestore 문서 내부의 id 필드 값</li>
            <li><strong>Firebase Auth UID:</strong> Firebase Authentication의 사용자 고유 ID</li>
            <li><strong>🔴 심각:</strong> Firebase Auth UID와 Firestore Document ID가 불일치 (직접 조회 실패)</li>
            <li><strong>🟠 경고:</strong> Firestore 내부 필드 불일치 (userId ≠ id 또는 ≠ Document ID)</li>
            <li><strong>🟡 주의:</strong> 기타 일관성 문제</li>
          </ul>
        </div>

        {/* ID 변경 기능 설명 */}
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-amber-900 mb-2">⚠️ ID 변경 기능 안내</h3>
          <ul className="text-sm text-amber-800 space-y-1">
            <li><strong>ID 변경 버튼:</strong> 각 사용자 행의 오른쪽 "작업" 열에서 ID 변경 가능</li>
            <li><strong>변경 범위:</strong> Firestore Document ID, userId, id 필드 일괄 변경</li>
            <li><strong>관련 데이터:</strong> evaluations, applicationHistories, reviews, tasks 등의 refUserId도 자동 업데이트</li>
            <li><strong>Firebase Auth UID:</strong> Firebase의 제약으로 Auth UID는 변경 불가 (수동 작업 필요)</li>
            <li><strong>권장 사항:</strong> 가능하면 Firebase Auth UID와 일치하도록 변경하는 것을 권장</li>
            <li><strong>주의:</strong> 이 작업은 되돌릴 수 없으므로 신중하게 진행하세요</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
