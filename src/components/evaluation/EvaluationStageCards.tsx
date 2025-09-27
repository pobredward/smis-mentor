'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { auth } from '@/lib/firebase';
import { Evaluation, EvaluationStage, EvaluationCriteria } from '@/types/evaluation';
import { EvaluationService, EvaluationCriteriaService } from '@/lib/evaluationService';
import EvaluationEditForm from './EvaluationEditForm';
import { toast } from 'react-hot-toast';

interface Props {
  userId: string;
}

export default function EvaluationStageCards({ userId }: Props) {
  const [evaluationsByStage, setEvaluationsByStage] = useState<{
    [key in EvaluationStage]: Evaluation[];
  }>({
    '서류 전형': [],
    '면접 전형': [],
    '대면 교육': [],
    '캠프 생활': []
  });
  const [criteriaMap, setCriteriaMap] = useState<{[key: string]: EvaluationCriteria}>({});
  const [isLoading, setIsLoading] = useState(true);
  const [expandedStage, setExpandedStage] = useState<EvaluationStage | null>(null);
  const [detailExpandedStage, setDetailExpandedStage] = useState<EvaluationStage | null>(null);
  const [editingEvaluation, setEditingEvaluation] = useState<Evaluation | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    loadEvaluations();
    // 현재 로그인한 사용자 ID 가져오기
    const currentUser = auth.currentUser;
    if (currentUser) {
      setCurrentUserId(currentUser.uid);
    }
  }, [userId]);

  const loadEvaluations = async () => {
    try {
      setIsLoading(true);
      const allEvaluations = await EvaluationService.getUserEvaluations(userId);
      
      // 평가 기준 템플릿들을 로드
      const criteriaTemplateIds = [...new Set(allEvaluations.map(e => e.criteriaTemplateId))];
      const criteriaData: {[key: string]: EvaluationCriteria} = {};
      
      await Promise.all(
        criteriaTemplateIds.map(async (templateId) => {
          try {
            const criteria = await EvaluationCriteriaService.getCriteriaById(templateId);
            if (criteria) {
              criteriaData[templateId] = criteria;
            }
          } catch (error) {
            console.error(`평가 기준 로드 실패 (${templateId}):`, error);
          }
        })
      );
      
      setCriteriaMap(criteriaData);
      
      // 단계별로 평가 그룹화
      const grouped = allEvaluations.reduce((acc, evaluation) => {
        if (!acc[evaluation.evaluationStage]) {
          acc[evaluation.evaluationStage] = [];
        }
        acc[evaluation.evaluationStage].push(evaluation);
        return acc;
      }, {} as { [key in EvaluationStage]: Evaluation[] });

      // 각 단계별로 최신순 정렬
      Object.keys(grouped).forEach(stage => {
        grouped[stage as EvaluationStage].sort((a, b) => 
          b.evaluationDate.seconds - a.evaluationDate.seconds
        );
      });

      setEvaluationsByStage({
        '서류 전형': grouped['서류 전형'] || [],
        '면접 전형': grouped['면접 전형'] || [],
        '대면 교육': grouped['대면 교육'] || [],
        '캠프 생활': grouped['캠프 생활'] || []
      });
    } catch (error) {
      console.error('평가 로드 오류:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStageInfo = (stage: EvaluationStage) => {
    const configs = {
      '서류 전형': {
        label: '서류 전형',
        color: 'gray',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        textColor: 'text-gray-700',
        badgeColor: 'bg-gray-100 text-gray-700',
        icon: '📄'
      },
      '면접 전형': {
        label: '면접 전형',
        color: 'blue',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        textColor: 'text-blue-700',
        badgeColor: 'bg-blue-100 text-blue-700',
        icon: '💼'
      },
      '대면 교육': {
        label: '대면 교육',
        color: 'green',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        textColor: 'text-green-700',
        badgeColor: 'bg-green-100 text-green-700',
        icon: '👥'
      },
      '캠프 생활': {
        label: '캠프 생활',
        color: 'purple',
        bgColor: 'bg-purple-50',
        borderColor: 'border-purple-200',
        textColor: 'text-purple-700',
        badgeColor: 'bg-purple-100 text-purple-700',
        icon: '🏕️'
      }
    };
    return configs[stage];
  };

  const getScoreColorClass = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 80) return 'text-blue-600';
    if (percentage >= 70) return 'text-yellow-600';
    if (percentage >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  const calculateStageAverage = (evaluations: Evaluation[]) => {
    if (evaluations.length === 0) return 0;
    const total = evaluations.reduce((sum, evaluation) => sum + evaluation.percentage, 0);
    return total / evaluations.length;
  };

  const handleEditEvaluation = (evaluation: Evaluation) => {
    setEditingEvaluation(evaluation);
  };

  const handleDeleteEvaluation = async (evaluation: Evaluation) => {
    if (!confirm('이 평가를 삭제하시겠습니까? 삭제된 평가는 복구할 수 없습니다.')) {
      return;
    }

    try {
      await EvaluationService.deleteEvaluation(evaluation.id);
      toast.success('평가가 삭제되었습니다.');
      loadEvaluations(); // 목록 새로고침
    } catch (error) {
      console.error('평가 삭제 오류:', error);
      toast.error('평가 삭제에 실패했습니다.');
    }
  };

  const handleEditSuccess = () => {
    setEditingEvaluation(null);
    toast.success('평가가 수정되었습니다.');
    loadEvaluations(); // 목록 새로고침
  };

  const handleEditCancel = () => {
    setEditingEvaluation(null);
  };

  const canEditEvaluation = (evaluation: Evaluation) => {
    return currentUserId && evaluation.evaluatorId === currentUserId;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {Object.entries(evaluationsByStage).map(([stage, evaluations]) => {
        const stageKey = stage as EvaluationStage;
        const stageInfo = getStageInfo(stageKey);
        const average = calculateStageAverage(evaluations);
        const isExpanded = expandedStage === stageKey;
        const hasEvaluations = evaluations.length > 0;

        return (
          <div
            key={stage}
            className={`border rounded-lg ${stageInfo.borderColor} ${stageInfo.bgColor} transition-all duration-200`}
          >
            {/* 헤더 */}
            <div 
              className="p-4 cursor-pointer"
              onClick={() => setExpandedStage(isExpanded ? null : stageKey)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{stageInfo.icon}</span>
                  <div>
                    <h3 className={`font-semibold ${stageInfo.textColor}`}>
                      {stageInfo.label}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {hasEvaluations ? `${evaluations.length}개의 평가` : '평가 없음'}
                    </p>
                  </div>
                </div>
                
                  <div className="flex items-center justify-between">
                    {hasEvaluations && (
                      <div className="text-right">
                        <div className={`text-xl font-bold ${getScoreColorClass(average)}`}>
                          {average.toFixed(1)}점
                        </div>
                      </div>
                    )}

                    <div className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
              </div>
            </div>

            {/* 확장된 내용 - 플랫 디자인 */}
            {isExpanded && (
              <div className="border-t border-gray-100 bg-gray-50">
                {hasEvaluations ? (
                  <div className="p-3">
                    {/* 평가자별 간단 요약 - 너비 최대 활용 */}
                    <div className="space-y-2 mb-3">
                      {evaluations.map((evaluation, index) => (
                        <div
                          key={evaluation.id}
                          className="bg-white border-l-2 border-gray-300 pl-3 py-2"
                        >
                          {/* 평가자 정보 헤더 */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${
                                evaluation.percentage >= 90 ? 'bg-green-500' :
                                evaluation.percentage >= 80 ? 'bg-blue-500' :
                                evaluation.percentage >= 70 ? 'bg-yellow-500' :
                                evaluation.percentage >= 60 ? 'bg-orange-500' : 'bg-red-500'
                              }`}></div>
                              <span className="text-sm font-medium text-gray-800">
                                {evaluation.evaluatorName}
                              </span>
                              <span className="text-xs text-gray-500">
                                {format(evaluation.evaluationDate.toDate(), 'MM/dd HH:mm', { locale: ko })}
                              </span>
                              {canEditEvaluation(evaluation) && (
                                <div className="flex items-center gap-1 ml-2">
                                  <button
                                    onClick={() => handleEditEvaluation(evaluation)}
                                    className="text-xs text-blue-600 hover:text-blue-800 px-1 py-0.5 rounded hover:bg-blue-50"
                                    title="수정"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => handleDeleteEvaluation(evaluation)}
                                    className="text-xs text-red-600 hover:text-red-800 px-1 py-0.5 rounded hover:bg-red-50"
                                    title="삭제"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className={`text-lg font-bold ${getScoreColorClass(evaluation.percentage)}`}>
                              {evaluation.percentage.toFixed(1)}점
                            </div>
                          </div>

                          {/* 세부 점수 바 차트 - 전체 너비 활용 */}
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
                            {Object.entries(evaluation.scores).map(([criteriaId, scoreData]) => {
                              const percentage = (scoreData.score / scoreData.maxScore) * 100;
                              const criteriaTemplate = criteriaMap[evaluation.criteriaTemplateId];
                              const criteriaItem = criteriaTemplate?.criteria.find(c => c.id === criteriaId);
                              const criteriaName = criteriaItem?.name || criteriaId;
                              
                              return (
                                <div key={criteriaId} className="flex-1">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-gray-700 font-medium" title={criteriaName}>
                                      {criteriaName}
                                    </span>
                                    <span className={`text-xs font-bold ${getScoreColorClass(percentage)}`}>
                                      {scoreData.score.toFixed(1)}점
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                      className={`h-2 rounded-full transition-all duration-300 ${
                                        percentage >= 90 ? 'bg-green-500' :
                                        percentage >= 80 ? 'bg-blue-500' :
                                        percentage >= 70 ? 'bg-yellow-500' :
                                        percentage >= 60 ? 'bg-orange-500' : 'bg-red-500'
                                      }`}
                                      style={{ width: `${percentage}%` }}
                                    ></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* 한줄평 */}
                          {evaluation.feedback && (
                            <div className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded italic">
                              "{evaluation.feedback.length > 80 
                                ? evaluation.feedback.substring(0, 80) + '...' 
                                : evaluation.feedback}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* 항목별 평균 (여러 평가자가 있을 때만) */}
                    {evaluations.length > 1 && (
                      <div className="border-t border-gray-200 pt-2">
                        <div className="text-xs font-medium text-gray-600 mb-2">항목별 평균</div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                          {Object.keys(evaluations[0]?.scores || {}).map(criteriaId => {
                            const criteriaTemplate = criteriaMap[evaluations[0]?.criteriaTemplateId];
                            const criteriaItem = criteriaTemplate?.criteria.find(c => c.id === criteriaId);
                            const criteriaName = criteriaItem?.name || criteriaId;
                            const avgScore = evaluations.reduce((sum, evaluation) => 
                              sum + (evaluation.scores[criteriaId]?.score || 0), 0) / evaluations.length;
                            const avgPercentage = (avgScore / (criteriaItem?.maxScore || 10)) * 100;
                            
                            return (
                              <div key={criteriaId} className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-gray-600 font-medium" title={criteriaName}>
                                    {criteriaName}
                                  </span>
                                  <span className={`text-xs font-bold ${getScoreColorClass(avgPercentage)}`}>
                                    {avgScore.toFixed(1)}점
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                                  <div 
                                    className={`h-2 rounded-full transition-all duration-300 ${
                                      avgPercentage >= 90 ? 'bg-green-500' :
                                      avgPercentage >= 80 ? 'bg-blue-500' :
                                      avgPercentage >= 70 ? 'bg-yellow-500' :
                                      avgPercentage >= 60 ? 'bg-orange-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${avgPercentage}%` }}
                                  ></div>
                                </div>
                                {/* 평가자별 점수 분포 미니 바 */}
                                <div className="flex gap-0.5">
                                  {evaluations.map((evaluation, index) => {
                                    const score = evaluation.scores[criteriaId];
                                    const percentage = score ? (score.score / score.maxScore) * 100 : 0;
                                    return (
                                      <div 
                                        key={index}
                                        className={`flex-1 h-1 rounded-sm transition-all duration-300 ${
                                          percentage >= 90 ? 'bg-green-400' :
                                          percentage >= 80 ? 'bg-blue-400' :
                                          percentage >= 70 ? 'bg-yellow-400' :
                                          percentage >= 60 ? 'bg-orange-400' : 'bg-red-400'
                                        }`}
                                        style={{ opacity: Math.max(percentage / 100, 0.3) }}
                                        title={`${evaluation.evaluatorName}: ${score?.score.toFixed(1) || 0}점`}
                                      ></div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 상세 정보 토글 버튼 */}
                    <div className="mt-2 text-center">
                      <button
                        onClick={() => setDetailExpandedStage(detailExpandedStage === stageKey ? null : stageKey)}
                        className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
                      >
                        {detailExpandedStage === stageKey ? '▲ 접기' : '▼ 상세보기'}
                      </button>
                    </div>

                    {/* 상세 정보 섹션 */}
                    {detailExpandedStage === stageKey && (
                      <div className="mt-3 pt-3 border-t border-gray-200 bg-white rounded p-3">
                        <div className="space-y-4">
                          {evaluations.map((evaluation, index) => (
                            <div key={evaluation.id} className="border-l-2 border-gray-300 pl-3">
                              <div className="flex justify-between items-center mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-800">{evaluation.evaluatorName}</span>
                                  <span className="text-xs text-gray-500">
                                    {format(evaluation.evaluationDate.toDate(), 'MM/dd HH:mm', { locale: ko })}
                                  </span>
                                  {canEditEvaluation(evaluation) && (
                                    <div className="flex items-center gap-1 ml-2">
                                      <button
                                        onClick={() => handleEditEvaluation(evaluation)}
                                        className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
                                        title="수정"
                                      >
                                        ✏️ 수정
                                      </button>
                                      <button
                                        onClick={() => handleDeleteEvaluation(evaluation)}
                                        className="text-xs text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50"
                                        title="삭제"
                                      >
                                        🗑️ 삭제
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <div className={`text-lg font-bold ${getScoreColorClass(evaluation.percentage)}`}>
                                  {evaluation.percentage.toFixed(1)}점
                                </div>
                              </div>

                              {/* 한줄평 */}
                              {evaluation.feedback && (
                                <div className="mb-3 p-2 bg-gray-50 rounded text-sm text-gray-700">
                                  <span className="text-gray-500">💬</span> {evaluation.feedback}
                                </div>
                              )}

                              {/* 세부 점수 - 그리드로 표시 */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {Object.entries(evaluation.scores).map(([criteriaId, scoreData]) => {
                                  const percentage = (scoreData.score / scoreData.maxScore) * 100;
                                  const criteriaComment = evaluation.criteriaFeedback?.[criteriaId];
                                  const criteriaTemplate = criteriaMap[evaluation.criteriaTemplateId];
                                  const criteriaItem = criteriaTemplate?.criteria.find(c => c.id === criteriaId);
                                  const criteriaName = criteriaItem?.name || criteriaId;
                                  
                                  return (
                                    <div key={criteriaId} className="bg-white p-2 rounded border">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-medium text-gray-700">{criteriaName}</span>
                                        <span className={`text-sm font-bold ${getScoreColorClass(percentage)}`}>
                                          {scoreData.score.toFixed(1)}점
                                        </span>
                                      </div>
                                      
                                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                                        <div 
                                          className={`h-2 rounded-full transition-all duration-300 ${
                                            percentage >= 90 ? 'bg-green-500' :
                                            percentage >= 80 ? 'bg-blue-500' :
                                            percentage >= 70 ? 'bg-yellow-500' :
                                            percentage >= 60 ? 'bg-orange-500' : 'bg-red-500'
                                          }`}
                                          style={{ width: `${percentage}%` }}
                                        ></div>
                                      </div>
                                      
                                      {criteriaComment && (
                                        <div className="text-xs text-gray-600 bg-gray-50 p-1 rounded">
                                          {criteriaComment}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 text-center text-gray-500">
                    <div className="text-gray-400 mb-2">📝</div>
                    <p className="text-sm">아직 {stageInfo.label} 평가가 없습니다.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
        })}
      </div>

      {/* 평가 수정 모달 */}
      {editingEvaluation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <EvaluationEditForm
            evaluation={editingEvaluation}
            onSuccess={handleEditSuccess}
            onCancel={handleEditCancel}
          />
        </div>
      )}
    </>
  );
}
