'use client';
import { logger } from '@smis-mentor/shared';

import { useState } from 'react';
import { updateCampLifeCriteria } from '@/scripts/updateCampLifeCriteria';
import Button from '@/components/common/Button';

export default function UpdateEvaluationCriteriaPage() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleUpdate = async () => {
    try {
      setIsUpdating(true);
      setResult(null);
      const res = await updateCampLifeCriteria();
      setResult(res);
    } catch (error) {
      logger.error('업데이트 오류:', error);
      setResult({
        success: false,
        message: '업데이트 중 오류가 발생했습니다.'
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            평가 기준 업데이트
          </h1>

          <div className="space-y-6">
            {/* 설명 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-blue-900 mb-2">
                캠프 생활 평가 기준 업데이트
              </h2>
              <p className="text-sm text-blue-800 mb-4">
                이 작업은 Firebase에 저장된 "캠프 생활" 평가 기준을 새로운 항목으로 업데이트합니다.
              </p>
              
              <div className="space-y-2 text-sm text-blue-800">
                <p className="font-semibold">변경 전:</p>
                <ul className="list-disc list-inside ml-2">
                  <li>적응력</li>
                  <li>협업 능력</li>
                  <li>책임감</li>
                  <li>리더십</li>
                </ul>
                
                <p className="font-semibold mt-3">변경 후:</p>
                <ul className="list-disc list-inside ml-2">
                  <li>멘토&매니저 협업</li>
                  <li>학생 생활 관리</li>
                  <li>책임감</li>
                  <li>인기도 (신규)</li>
                </ul>
              </div>
            </div>

            {/* 업데이트 버튼 */}
            <div className="flex justify-center">
              <Button
                variant="primary"
                size="lg"
                onClick={handleUpdate}
                isLoading={isUpdating}
                disabled={isUpdating}
              >
                {isUpdating ? '업데이트 중...' : '평가 기준 업데이트'}
              </Button>
            </div>

            {/* 결과 표시 */}
            {result && (
              <div
                className={`rounded-lg p-4 ${
                  result.success
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
                }`}
              >
                <h3
                  className={`text-lg font-semibold mb-2 ${
                    result.success ? 'text-green-900' : 'text-red-900'
                  }`}
                >
                  {result.success ? '✅ 성공' : '❌ 실패'}
                </h3>
                <p
                  className={`text-sm ${
                    result.success ? 'text-green-800' : 'text-red-800'
                  }`}
                >
                  {result.message}
                </p>

                {result.success && result.newCriteria && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-green-900 mb-2">
                      업데이트된 평가 항목:
                    </p>
                    <ul className="space-y-1">
                      {result.newCriteria.map((item: any) => (
                        <li
                          key={item.id}
                          className="text-sm text-green-800"
                        >
                          {item.order}. {item.name} - {item.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!result.success && result.error && (
                  <p className="text-xs text-red-600 mt-2">
                    오류 상세: {result.error}
                  </p>
                )}
              </div>
            )}

            {/* 안내 메시지 */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>주의:</strong> 업데이트 후 페이지를 새로고침하면 변경된 평가 기준이 적용됩니다.
                기존에 작성된 평가는 영향을 받지 않습니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
