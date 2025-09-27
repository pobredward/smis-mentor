'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Evaluation, EvaluationStage } from '@/types/evaluation';
import { EvaluationService } from '@/lib/evaluationService';

interface Props {
  userId: string;
  evaluationStage?: EvaluationStage;
  showDetails?: boolean;
  maxItems?: number;
}

export default function EvaluationList({ 
  userId, 
  evaluationStage, 
  showDetails = true, 
  maxItems 
}: Props) {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null);

  useEffect(() => {
    loadEvaluations();
  }, [userId, evaluationStage]);

  const loadEvaluations = async () => {
    try {
      setIsLoading(true);
      const data = await EvaluationService.getUserEvaluations(userId, evaluationStage);
      setEvaluations(maxItems ? data.slice(0, maxItems) : data);
    } catch (error) {
      console.error('평가 목록 로드 오류:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getScoreColor = (score: number, maxScore: number = 10) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 90) return 'text-green-600 bg-green-50';
    if (percentage >= 80) return 'text-blue-600 bg-blue-50';
    if (percentage >= 70) return 'text-yellow-600 bg-yellow-50';
    if (percentage >= 60) return 'text-orange-600 bg-orange-50';
    return 'text-red-600 bg-red-50';
  };

  const getEvaluationStageLabel = (stage: EvaluationStage) => {
    const labels = {
      '서류 전형': '서류 전형',
      '면접 전형': '면접 전형', 
      '대면 교육': '대면 교육',
      '캠프 생활': '캠프 생활'
    };
    return labels[stage];
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (evaluations.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>평가 내역이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 평가 목록 */}
      <div className="space-y-3">
        {evaluations.map((evaluation) => (
          <div
            key={evaluation.id}
            className={`border rounded-lg p-4 transition-colors ${
              selectedEvaluation?.id === evaluation.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                    {getEvaluationStageLabel(evaluation.evaluationStage)}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  평가자: <span className="font-medium">{evaluation.evaluatorName}</span>
                  {evaluation.evaluatorRole && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                      {evaluation.evaluatorRole}
                    </span>
                  )}
                </p>
                <p className="text-sm text-gray-600">
                  평가일: {format(evaluation.evaluationDate.toDate(), 'yyyy년 MM월 dd일', { locale: ko })}
                </p>
              </div>
              
              <div className="text-right">
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  getScoreColor(evaluation.totalScore, evaluation.maxTotalScore)
                }`}>
                  {evaluation.totalScore.toFixed(1)}점 / {evaluation.maxTotalScore}점
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {evaluation.percentage.toFixed(1)}%
                </div>
              </div>
            </div>

            {showDetails && (
              <>
                {/* 간단한 피드백 미리보기 */}
                {evaluation.feedback && (
                  <div className="mb-3">
                    <p className="text-sm text-gray-700 line-clamp-2">
                      {evaluation.feedback}
                    </p>
                  </div>
                )}

                {/* 상세보기 토글 버튼 */}
                <button
                  onClick={() => setSelectedEvaluation(
                    selectedEvaluation?.id === evaluation.id ? null : evaluation
                  )}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  {selectedEvaluation?.id === evaluation.id ? '접기' : '상세보기'}
                </button>
              </>
            )}

            {/* 상세 정보 */}
            {selectedEvaluation?.id === evaluation.id && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                {/* 항목별 점수 */}
                <div className="mb-4">
                  <h4 className="font-medium text-gray-900 mb-2">항목별 점수</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries(evaluation.scores).map(([criteriaId, scoreData]) => (
                      <div key={criteriaId} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                        <span className="text-sm text-gray-700">{criteriaId}</span>
                        <div className="text-right">
                          <span className={`text-sm font-medium ${getScoreColor(scoreData.score, scoreData.maxScore)}`}>
                            {scoreData.score}점 / {scoreData.maxScore}점
                          </span>
                          <div className="text-xs text-gray-500">
                            가중치: {(scoreData.weight * 100).toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 전체 피드백 */}
                <div className="mb-4">
                  <h4 className="font-medium text-gray-900 mb-2">종합 피드백</h4>
                  <div className="p-3 bg-gray-50 rounded-md">
                    <p className="text-sm text-gray-700 whitespace-pre-line">
                      {evaluation.feedback}
                    </p>
                  </div>
                </div>

                {/* 항목별 피드백 */}
                {evaluation.criteriaFeedback && Object.keys(evaluation.criteriaFeedback).length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">항목별 피드백</h4>
                    <div className="space-y-2">
                      {Object.entries(evaluation.criteriaFeedback).map(([criteriaId, feedback]) => (
                        <div key={criteriaId} className="p-2 bg-gray-50 rounded">
                          <div className="font-medium text-sm text-gray-900 mb-1">{criteriaId}</div>
                          <p className="text-sm text-gray-700">{feedback}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 평가 메타 정보 */}
                <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
                  <div className="flex justify-between">
                    <span>
                      생성일: {format(evaluation.createdAt.toDate(), 'yyyy-MM-dd HH:mm')}
                    </span>
                    {evaluation.duration && (
                      <span>소요시간: {evaluation.duration}분</span>
                    )}
                  </div>
                  {evaluation.updatedAt.seconds !== evaluation.createdAt.seconds && (
                    <div className="mt-1">
                      수정일: {format(evaluation.updatedAt.toDate(), 'yyyy-MM-dd HH:mm')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 더 많은 평가가 있는 경우 */}
      {maxItems && evaluations.length >= maxItems && (
        <div className="text-center">
          <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            더 많은 평가 보기
          </button>
        </div>
      )}
    </div>
  );
}
