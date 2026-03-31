'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/common/Layout';
import { FaSync, FaCheckCircle, FaExclamationTriangle, FaDatabase } from 'react-icons/fa';
import { authenticatedGet, authenticatedPost } from '@/lib/apiClient';

interface MigrationStats {
  total: number;
  likelyUpdated: number;
  likelyOldRefUserId: number;
  likelyOldEvaluatorId: number;
  samples: {
    updated: Array<{ id: string; refUserId: string; evaluatorId: string; evaluationStage: string }>;
    needUpdateRefUserId: Array<{ id: string; refUserId: string; evaluationStage: string }>;
    needUpdateEvaluatorId: Array<{ id: string; evaluatorId: string; evaluatorName: string; evaluationStage: string }>;
  };
}

interface MigrationResult {
  success: boolean;
  dryRun: boolean;
  message: string;
  summary?: {
    totalEvaluations: number;
    needUpdateCount: number;
    alreadyUpdatedCount: number;
    notFoundRefUserIdCount: number;
    notFoundEvaluatorIdCount: number;
    updateSuccessCount?: number;
    updateErrorCount?: number;
  };
  updateLog?: Array<{
    evaluationId: string;
    oldRefUserId: string;
    newRefUserId: string | null;
    oldEvaluatorId: string;
    newEvaluatorId: string | null;
    refUserIdNeedsUpdate: boolean;
    evaluatorIdNeedsUpdate: boolean;
    status: string;
    issues?: string[];
    evaluationStage?: string;
    evaluatorName?: string;
  }>;
  errors?: any[];
}

export default function MigrateEvaluationsPage() {
  const [stats, setStats] = useState<MigrationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 페이지 로드 시 현재 상태 조회
  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await authenticatedGet<any>('/api/admin/migrate-evaluation-references');

      if (data.success) {
        setStats(data.stats);
      } else {
        setError(data.error || '상태 조회 실패');
      }
    } catch (err: any) {
      setError(err.message || '상태 조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const runMigration = async (dryRun: boolean) => {
    if (!dryRun) {
      const totalNeedUpdate = (stats?.likelyOldRefUserId || 0) + (stats?.likelyOldEvaluatorId || 0);
      const confirmed = confirm(
        `⚠️ 실제 마이그레이션을 실행하시겠습니까?\n\n` +
        `- refUserId: ${stats?.likelyOldRefUserId || 0}개 업데이트\n` +
        `- evaluatorId: ${stats?.likelyOldEvaluatorId || 0}개 업데이트\n` +
        `- 총 ${totalNeedUpdate}개 필드가 업데이트됩니다.\n\n` +
        `- 이 작업은 되돌릴 수 없습니다.\n` +
        `- 먼저 Dry Run을 실행하여 결과를 확인하는 것을 권장합니다.`
      );

      if (!confirmed) return;
    }

    try {
      setLoading(true);
      setError(null);
      setMigrationResult(null);

      const data = await authenticatedPost<any>('/api/admin/migrate-evaluation-references', { dryRun });

      if (data.success) {
        setMigrationResult(data);
        if (!dryRun) {
          await fetchStats();
        }
      } else {
        setError(data.error || '마이그레이션 실패');
      }
    } catch (err: any) {
      setError(err.message || '마이그레이션 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
          <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <FaDatabase className="text-emerald-600" />
            평가 참조 마이그레이션
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            evaluations 컬렉션의 <strong>refUserId</strong>(평가 대상자)와 <strong>evaluatorId</strong>(평가자)를 구 Document ID에서 최신 Auth UID로 업데이트합니다.
          </p>
        </div>

        {/* 현재 상태 */}
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">현재 상태</h2>
            <button
              onClick={fetchStats}
              disabled={loading}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2"
            >
              <FaSync className={loading ? 'animate-spin' : ''} />
              새로고침
            </button>
          </div>

          {loading && !stats ? (
            <div className="text-center py-8 text-gray-500">
              <FaSync className="animate-spin inline-block mr-2" />
              상태 조회 중...
            </div>
          ) : stats ? (
            <div className="space-y-4">
              {/* 통계 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-sm text-blue-600 font-medium">총 평가 문서</div>
                  <div className="text-2xl font-bold text-blue-900">{stats.total}</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-sm text-green-600 font-medium">최신 상태</div>
                  <div className="text-2xl font-bold text-green-900">{stats.likelyUpdated}</div>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="text-sm text-orange-600 font-medium">refUserId 업데이트 필요</div>
                  <div className="text-2xl font-bold text-orange-900">{stats.likelyOldRefUserId}</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-sm text-red-600 font-medium">evaluatorId 업데이트 필요</div>
                  <div className="text-2xl font-bold text-red-900">{stats.likelyOldEvaluatorId}</div>
                </div>
              </div>

              {/* 샘플 데이터 */}
              {stats.samples.needUpdateRefUserId.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">refUserId 업데이트 필요 샘플 (최대 3개)</h3>
                  <div className="bg-gray-50 p-4 rounded-md space-y-2">
                    {stats.samples.needUpdateRefUserId.map((sample) => (
                      <div key={sample.id} className="text-xs font-mono bg-white p-2 rounded border border-gray-200">
                        <div><span className="text-gray-500">평가 ID:</span> {sample.id}</div>
                        <div><span className="text-gray-500">refUserId (평가 대상자):</span> <span className="text-orange-600">{sample.refUserId}</span></div>
                        <div><span className="text-gray-500">단계:</span> {sample.evaluationStage}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stats.samples.needUpdateEvaluatorId.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">evaluatorId 업데이트 필요 샘플 (최대 3개)</h3>
                  <div className="bg-gray-50 p-4 rounded-md space-y-2">
                    {stats.samples.needUpdateEvaluatorId.map((sample) => (
                      <div key={sample.id} className="text-xs font-mono bg-white p-2 rounded border border-gray-200">
                        <div><span className="text-gray-500">평가 ID:</span> {sample.id}</div>
                        <div><span className="text-gray-500">evaluatorId (평가자):</span> <span className="text-red-600">{sample.evaluatorId}</span></div>
                        <div><span className="text-gray-500">평가자 이름:</span> {sample.evaluatorName}</div>
                        <div><span className="text-gray-500">단계:</span> {sample.evaluationStage}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stats.samples.updated.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">최신 상태 샘플 (최대 3개)</h3>
                  <div className="bg-gray-50 p-4 rounded-md space-y-2">
                    {stats.samples.updated.map((sample) => (
                      <div key={sample.id} className="text-xs font-mono bg-white p-2 rounded border border-gray-200">
                        <div><span className="text-gray-500">평가 ID:</span> {sample.id}</div>
                        <div><span className="text-gray-500">refUserId (평가 대상자):</span> <span className="text-green-600">{sample.refUserId}</span></div>
                        <div><span className="text-gray-500">evaluatorId (평가자):</span> <span className="text-green-600">{sample.evaluatorId}</span></div>
                        <div><span className="text-gray-500">단계:</span> {sample.evaluationStage}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 경고 메시지 */}
              {(stats.likelyOldRefUserId > 0 || stats.likelyOldEvaluatorId > 0) && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                  <FaExclamationTriangle className="text-yellow-600 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <strong>업데이트 필요:</strong>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      {stats.likelyOldRefUserId > 0 && (
                        <li><strong>refUserId</strong> (평가 대상자): {stats.likelyOldRefUserId}개 문서</li>
                      )}
                      {stats.likelyOldEvaluatorId > 0 && (
                        <li><strong>evaluatorId</strong> (평가자): {stats.likelyOldEvaluatorId}개 문서</li>
                      )}
                    </ul>
                    <p className="mt-2">
                      이로 인해 관리자가 유저의 평가 점수를 조회하거나, 평가자가 본인이 작성한 평가를 수정/삭제할 수 없습니다.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
              <strong>오류:</strong> {error}
            </div>
          )}
        </div>

        {/* 마이그레이션 실행 */}
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">마이그레이션 실행</h2>

          <div className="space-y-4">
            {/* Dry Run 버튼 */}
            <div className="flex items-start gap-4">
              <button
                onClick={() => runMigration(true)}
                disabled={loading || (stats?.likelyOldRefUserId === 0 && stats?.likelyOldEvaluatorId === 0)}
                className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
              >
                <FaSync className={loading ? 'animate-spin' : ''} />
                Dry Run (시뮬레이션)
              </button>
              <div className="flex-1">
                <p className="text-sm text-gray-700 font-medium">1단계: Dry Run 실행</p>
                <p className="text-xs text-gray-500 mt-1">
                  실제로 데이터를 변경하지 않고 어떤 변경이 발생할지 미리 확인합니다.
                </p>
              </div>
            </div>

            {/* 실제 마이그레이션 버튼 */}
            <div className="flex items-start gap-4">
              <button
                onClick={() => runMigration(false)}
                disabled={loading || (stats?.likelyOldRefUserId === 0 && stats?.likelyOldEvaluatorId === 0)}
                className="px-6 py-3 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
              >
                <FaCheckCircle />
                실제 마이그레이션 실행
              </button>
              <div className="flex-1">
                <p className="text-sm text-gray-700 font-medium">2단계: 실제 마이그레이션</p>
                <p className="text-xs text-gray-500 mt-1">
                  ⚠️ 주의: 이 작업은 되돌릴 수 없습니다. Dry Run으로 먼저 확인하세요.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 마이그레이션 결과 */}
        {migrationResult && (
          <div className="bg-white shadow-md rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {migrationResult.dryRun ? 'Dry Run 결과' : '마이그레이션 결과'}
            </h2>

            {/* 성공 메시지 */}
            <div className={`rounded-lg p-4 mb-4 ${migrationResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className={`flex items-center gap-2 ${migrationResult.success ? 'text-green-800' : 'text-red-800'}`}>
                {migrationResult.success ? <FaCheckCircle /> : <FaExclamationTriangle />}
                <span className="font-medium">{migrationResult.message}</span>
              </div>
            </div>

            {/* 요약 */}
            {migrationResult.summary && (
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">요약</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">총 평가:</span>{' '}
                    <span className="font-medium">{migrationResult.summary.totalEvaluations}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">업데이트 필요:</span>{' '}
                    <span className="font-medium text-orange-600">{migrationResult.summary.needUpdateCount}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">이미 최신:</span>{' '}
                    <span className="font-medium text-green-600">{migrationResult.summary.alreadyUpdatedCount}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">refUserId 매핑 없음:</span>{' '}
                    <span className="font-medium text-red-600">{migrationResult.summary.notFoundRefUserIdCount}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">evaluatorId 매핑 없음:</span>{' '}
                    <span className="font-medium text-red-600">{migrationResult.summary.notFoundEvaluatorIdCount}</span>
                  </div>
                  {migrationResult.summary.updateSuccessCount !== undefined && (
                    <div>
                      <span className="text-gray-500">성공:</span>{' '}
                      <span className="font-medium text-green-600">{migrationResult.summary.updateSuccessCount}</span>
                    </div>
                  )}
                  {migrationResult.summary.updateErrorCount !== undefined && (
                    <div>
                      <span className="text-gray-500">실패:</span>{' '}
                      <span className="font-medium text-red-600">{migrationResult.summary.updateErrorCount}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 업데이트 로그 */}
            {migrationResult.updateLog && migrationResult.updateLog.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  업데이트 로그 (최대 50개 표시)
                </h3>
                <div className="bg-gray-50 p-4 rounded-md max-h-96 overflow-y-auto">
                  <div className="space-y-2">
                    {migrationResult.updateLog.map((log, index) => (
                      <div key={index} className="text-xs font-mono bg-white p-3 rounded border border-gray-200">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-gray-500">평가 ID:</span> {log.evaluationId}
                          </div>
                          <div>
                            <span className="text-gray-500">상태:</span>{' '}
                            <span className={`font-medium ${log.status === 'NEED_UPDATE' ? 'text-orange-600' : 'text-red-600'}`}>
                              {log.status}
                            </span>
                          </div>
                          
                          {/* refUserId */}
                          {log.refUserIdNeedsUpdate && (
                            <>
                              <div className="col-span-2 border-t pt-2 mt-2">
                                <span className="text-gray-500 font-semibold">refUserId (평가 대상자)</span>
                              </div>
                              <div className="col-span-2">
                                <span className="text-gray-500">기존:</span>{' '}
                                <span className="text-red-600">{log.oldRefUserId}</span>
                              </div>
                              {log.newRefUserId && (
                                <div className="col-span-2">
                                  <span className="text-gray-500">변경:</span>{' '}
                                  <span className="text-green-600">{log.newRefUserId}</span>
                                </div>
                              )}
                            </>
                          )}
                          
                          {/* evaluatorId */}
                          {log.evaluatorIdNeedsUpdate && (
                            <>
                              <div className="col-span-2 border-t pt-2 mt-2">
                                <span className="text-gray-500 font-semibold">evaluatorId (평가자)</span>
                              </div>
                              <div className="col-span-2">
                                <span className="text-gray-500">기존:</span>{' '}
                                <span className="text-red-600">{log.oldEvaluatorId}</span>
                              </div>
                              {log.newEvaluatorId && (
                                <div className="col-span-2">
                                  <span className="text-gray-500">변경:</span>{' '}
                                  <span className="text-green-600">{log.newEvaluatorId}</span>
                                </div>
                              )}
                            </>
                          )}
                          
                          {log.evaluationStage && (
                            <div className="col-span-2 border-t pt-2 mt-2">
                              <span className="text-gray-500">단계:</span> {log.evaluationStage}
                            </div>
                          )}
                          {log.evaluatorName && (
                            <div className="col-span-2">
                              <span className="text-gray-500">평가자 이름:</span> {log.evaluatorName}
                            </div>
                          )}
                          {log.issues && log.issues.length > 0 && (
                            <div className="col-span-2 mt-2 p-2 bg-red-50 border border-red-200 rounded">
                              <span className="text-red-700 font-semibold">⚠️ 문제:</span>
                              <ul className="text-red-600 list-disc list-inside mt-1">
                                {log.issues.map((issue, idx) => (
                                  <li key={idx}>{issue}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 에러 로그 */}
            {migrationResult.errors && migrationResult.errors.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-red-700 mb-2">에러 로그</h3>
                <div className="bg-red-50 p-4 rounded-md">
                  <pre className="text-xs text-red-800 overflow-x-auto">
                    {JSON.stringify(migrationResult.errors, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
