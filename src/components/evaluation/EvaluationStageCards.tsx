'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { auth } from '@/lib/firebase';
import { Evaluation, EvaluationStage, EvaluationCriteria, EvaluationFormData } from '@/types/evaluation';
import { EvaluationService, EvaluationCriteriaService } from '@/lib/evaluationService';
import EvaluationEditForm from './EvaluationEditForm';
import Button from '@/components/common/Button';
import { toast } from 'react-hot-toast';

interface Props {
  userId: string;
  targetUserName: string;
  evaluatorName: string;
  refApplicationId?: string;
  refJobBoardId?: string;
  onEvaluationSuccess?: () => void;
}

export default function EvaluationStageCards({ userId, targetUserName, evaluatorName, refApplicationId, refJobBoardId, onEvaluationSuccess }: Props) {
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
  const [showingEvaluationForm, setShowingEvaluationForm] = useState<EvaluationStage | null>(null);
  const [evaluationFormData, setEvaluationFormData] = useState<EvaluationFormData | null>(null);
  const [availableCriteria, setAvailableCriteria] = useState<{[key in EvaluationStage]: EvaluationCriteria | null}>({
    '서류 전형': null,
    '면접 전형': null,
    '대면 교육': null,
    '캠프 생활': null
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadEvaluations();
    loadAvailableCriteria();
    // 현재 로그인한 사용자 ID 가져오기
    const currentUser = auth.currentUser;
    if (currentUser) {
      setCurrentUserId(currentUser.uid);
    }
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

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


  const calculateStageAverage = (evaluations: Evaluation[]) => {
    if (evaluations.length === 0) return 0;
    const total = evaluations.reduce((sum, evaluation) => sum + evaluation.percentage, 0);
    return total / evaluations.length;
  };


  const handleDeleteEvaluation = async (evaluationId: string) => {
    if (!confirm('이 평가를 삭제하시겠습니까? 삭제된 평가는 복구할 수 없습니다.')) {
      return;
    }

    try {
      await EvaluationService.deleteEvaluation(evaluationId);
      toast.success('평가가 삭제되었습니다.');
      loadEvaluations(); // 목록 새로고침
      // 부모 컴포넌트에 변경 사항 알림 (평가 요약 업데이트)
      if (onEvaluationSuccess) {
        onEvaluationSuccess();
      }
    } catch (error) {
      console.error('평가 삭제 오류:', error);
      toast.error('평가 삭제에 실패했습니다.');
    }
  };

  const handleEditSuccess = () => {
    setEditingEvaluation(null);
    toast.success('평가가 수정되었습니다.');
    loadEvaluations(); // 목록 새로고침
    // 부모 컴포넌트에 변경 사항 알림 (평가 요약 업데이트)
    if (onEvaluationSuccess) {
      onEvaluationSuccess();
    }
  };

  const handleEditCancel = () => {
    setEditingEvaluation(null);
  };


  const hasCurrentUserEvaluated = (stage: EvaluationStage) => {
    if (!currentUserId) return false;
    const stageEvaluations = evaluationsByStage[stage];
    return stageEvaluations.some(evaluation => evaluation.evaluatorId === currentUserId);
  };

  const loadAvailableCriteria = async () => {
    try {
      const stages: EvaluationStage[] = ['서류 전형', '면접 전형', '대면 교육', '캠프 생활'];
      const criteriaData: {[key in EvaluationStage]: EvaluationCriteria | null} = {
        '서류 전형': null,
        '면접 전형': null,
        '대면 교육': null,
        '캠프 생활': null
      };

      await Promise.all(
        stages.map(async (stage) => {
          try {
            const templates = await EvaluationCriteriaService.getCriteriaByStage(stage);
            if (templates.length > 0) {
              criteriaData[stage] = templates.find(t => t.isDefault) || templates[0];
            }
          } catch (error) {
            console.error(`${stage} 평가 기준 로드 실패:`, error);
          }
        })
      );

      setAvailableCriteria(criteriaData);
    } catch (error) {
      console.error('평가 기준 로드 오류:', error);
    }
  };

  const handleStartEvaluation = (stage: EvaluationStage) => {
    const criteria = availableCriteria[stage];
    if (!criteria) {
      toast.error('평가 기준을 불러올 수 없습니다.');
      return;
    }

    const formData: EvaluationFormData = {
      evaluationStage: stage,
      criteriaTemplateId: criteria.id,
      targetUserId: userId,
      targetUserName: targetUserName,
      refApplicationId,
      refJobBoardId,
      scores: {},
      overallFeedback: '',
      evaluatorName: evaluatorName // 기본값으로 설정
    };

    setEvaluationFormData(formData);
    setShowingEvaluationForm(stage);
  };

  const handleScoreChange = (criteriaId: string, score: number) => {
    if (!evaluationFormData) return;
    
    setEvaluationFormData(prev => ({
      ...prev!,
      scores: {
        ...prev!.scores,
        [criteriaId]: {
          ...prev!.scores[criteriaId],
          score
        }
      }
    }));
  };

  const handleCriteriaCommentChange = (criteriaId: string, comment: string) => {
    if (!evaluationFormData) return;
    
    setEvaluationFormData(prev => ({
      ...prev!,
      scores: {
        ...prev!.scores,
        [criteriaId]: {
          ...prev!.scores[criteriaId],
          comment
        }
      }
    }));
  };

  const handleSubmitEvaluation = async () => {
    if (!evaluationFormData || !currentUserId) {
      toast.error('평가 데이터가 올바르지 않습니다.');
      return;
    }

    // 필수 점수 체크
    const criteria = availableCriteria[evaluationFormData.evaluationStage];
    if (!criteria) {
      toast.error('평가 기준을 찾을 수 없습니다.');
      return;
    }

    const hasAllScores = criteria.criteria.every(criteriaItem => 
      evaluationFormData.scores[criteriaItem.id]?.score > 0
    );

    if (!hasAllScores) {
      toast.error('모든 항목에 점수를 입력해주세요.');
      return;
    }

    // 평가자 이름 체크
    if (!evaluationFormData.evaluatorName.trim()) {
      toast.error('평가자 이름을 입력해주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      
      console.log('🔄 Creating evaluation with:', {
        currentUserId,
        evaluatorName: evaluationFormData.evaluatorName,
        evaluationStage: evaluationFormData.evaluationStage
      });
      
      await EvaluationService.createEvaluation(
        evaluationFormData,
        currentUserId,
        evaluationFormData.evaluatorName
      );

      toast.success('평가가 성공적으로 저장되었습니다.');
      setShowingEvaluationForm(null);
      setEvaluationFormData(null);
      
      // 평가 목록 새로고침
      await loadEvaluations();
      onEvaluationSuccess?.(); // 부모 컴포넌트에 알림
      
    } catch (error) {
      console.error('평가 저장 오류:', error);
      const errorMessage = error instanceof Error ? error.message : '평가 저장에 실패했습니다.';
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEvaluation = () => {
    setShowingEvaluationForm(null);
    setEvaluationFormData(null);
  };

  const renderEvaluationForm = (stage: EvaluationStage) => {
    const criteria = availableCriteria[stage];
    if (!criteria || !evaluationFormData) {
      return (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 mx-auto mb-2"></div>
          <p className="text-sm text-gray-500">평가 기준을 불러오는 중...</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="border-b border-gray-200 pb-2 mb-4">
          <h4 className="font-medium text-gray-900">{stage} 평가 작성</h4>
          <p className="text-sm text-gray-600">각 항목에 대해 점수를 선택하고 코멘트를 작성해주세요.</p>
        </div>

        {/* 평가자 이름 입력 */}
        <div className="bg-white p-3 rounded-lg border border-gray-200 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            평가자 이름 *
          </label>
          <input
            type="text"
            value={evaluationFormData.evaluatorName}
            onChange={(e) => setEvaluationFormData(prev => ({ ...prev!, evaluatorName: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder="평가자 이름을 입력하세요"
            required
          />
        </div>

        {/* 평가 항목들 */}
        <div className="space-y-4">
          {criteria.criteria
            .sort((a, b) => a.order - b.order)
            .map(criteriaItem => (
            <div key={criteriaItem.id} className="border border-gray-200 rounded-lg p-3">
              <div className="mb-3">
                <h5 className="font-medium text-gray-900">{criteriaItem.name}</h5>
                <p className="text-sm text-gray-600">{criteriaItem.description}</p>
                <p className="text-xs text-gray-500">최대 점수: {criteriaItem.maxScore}점</p>
              </div>

              {/* 점수 선택 */}
              <div className="mb-3">
                <div className="flex flex-wrap gap-2 mb-2">
                  {Array.from({ length: criteriaItem.maxScore }, (_, i) => i + 1).map(score => (
                    <button
                      key={score}
                      onClick={() => handleScoreChange(criteriaItem.id, score)}
                      className={`
                        w-8 h-8 rounded border font-bold text-sm transition-all hover:scale-105
                        ${evaluationFormData.scores[criteriaItem.id]?.score === score
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : 'border-gray-300 hover:border-blue-300 hover:bg-blue-50'
                        }
                      `}
                    >
                      {score}
                    </button>
                  ))}
                </div>
                {evaluationFormData.scores[criteriaItem.id]?.score && (
                  <p className="text-xs text-gray-600">
                    선택된 점수: {evaluationFormData.scores[criteriaItem.id].score}점
                  </p>
                )}
              </div>

              {/* 세부 코멘트 */}
              <div>
                <textarea
                  value={evaluationFormData.scores[criteriaItem.id]?.comment || ''}
                  onChange={(e) => handleCriteriaCommentChange(criteriaItem.id, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  rows={2}
                  placeholder="세부 코멘트 (선택사항)"
                />
              </div>
            </div>
          ))}
        </div>

        {/* 종합 의견 */}
        <div className="bg-gray-50 p-3 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            한줄평 (선택사항)
          </label>
          <textarea
            value={evaluationFormData.overallFeedback}
            onChange={(e) => setEvaluationFormData(prev => ({ ...prev!, overallFeedback: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            rows={3}
            placeholder="전체적인 평가 의견을 작성해주세요..."
            required
          />
        </div>

        {/* 버튼들 */}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="secondary"
            onClick={handleCancelEvaluation}
            disabled={isSubmitting}
          >
            취소
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmitEvaluation}
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            평가 저장
          </Button>
        </div>
      </div>
    );
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
            className="border rounded-xl border-gray-200 bg-white shadow-sm hover:shadow-md transition-all duration-200"
          >
            {/* 헤더 - 통일된 레이아웃 */}
            <div 
              className="p-4 cursor-pointer hover:bg-gray-50 rounded-t-xl transition-colors duration-200"
              onClick={() => {
                if (hasEvaluations) {
                  // 평가가 있으면 상세보기 토글
                  setDetailExpandedStage(detailExpandedStage === stageKey ? null : stageKey);
                } else {
                  // 평가가 없으면 기존 토글 (평가 작성 폼)
                  setExpandedStage(isExpanded ? null : stageKey);
                }
              }}
            >
              {/* 첫 번째 행 - 제목과 총점 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                    hasEvaluations 
                      ? average >= 90 ? 'bg-green-100 text-green-600' :
                        average >= 80 ? 'bg-blue-100 text-blue-600' :
                        average >= 70 ? 'bg-yellow-100 text-yellow-600' :
                        average >= 60 ? 'bg-orange-100 text-orange-600' :
                        'bg-red-100 text-red-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {stageInfo.icon}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 mb-1">
                      {stageInfo.label}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {hasEvaluations ? `${evaluations.length}개 평가` : '평가 없음'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* 총점 */}
                  {hasEvaluations && (
                    <div className={`px-3 py-1.5 rounded-lg font-bold text-lg border ${
                      average >= 90 ? 'text-green-600 border-green-200 bg-green-50' :
                      average >= 80 ? 'text-blue-600 border-blue-200 bg-blue-50' :
                      average >= 70 ? 'text-yellow-600 border-yellow-200 bg-yellow-50' :
                      average >= 60 ? 'text-orange-600 border-orange-200 bg-orange-50' :
                      'text-red-600 border-red-200 bg-red-50'
                    }`}>
                      {Math.round(average)}점
                    </div>
                  )}
                  
                  {/* 토글 화살표 */}
                  <div className={`transform transition-transform duration-200 ${
                    hasEvaluations 
                      ? (detailExpandedStage === stageKey ? 'rotate-180' : '') 
                      : (isExpanded ? 'rotate-180' : '')
                  }`}>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
              
              {/* 두 번째 행 - 항목별 점수 (2x2 그리드) */}
              {hasEvaluations && evaluations.length > 0 && criteriaMap[evaluations[0]?.criteriaTemplateId] && (
                <div className="grid grid-cols-2 gap-2">
                  {criteriaMap[evaluations[0]?.criteriaTemplateId]?.criteria
                    .sort((a, b) => a.order - b.order)
                    .slice(0, 4) // 4개 모두 표시
                    .map(criteriaItem => {
                      const criteriaId = criteriaItem.id;
                      const criteriaName = criteriaItem.name;
                      const avgScore = evaluations.reduce((sum, evaluation) => 
                        sum + (evaluation.scores[criteriaId]?.score || 0), 0) / evaluations.length;
                      const avgPercentage = (avgScore / criteriaItem.maxScore) * 100;
                      
                      // 통일된 색상 시스템
                      const getScoreColor = (percentage: number) => {
                        if (percentage >= 90) return 'text-green-600';
                        if (percentage >= 80) return 'text-blue-600';
                        if (percentage >= 70) return 'text-yellow-600';
                        if (percentage >= 60) return 'text-orange-600';
                        return 'text-red-600';
                      };

                      const getDotColor = (percentage: number) => {
                        if (percentage >= 90) return 'bg-green-500';
                        if (percentage >= 80) return 'bg-blue-500';
                        if (percentage >= 70) return 'bg-yellow-500';
                        if (percentage >= 60) return 'bg-orange-500';
                        return 'bg-red-500';
                      };
                      
                      return (
                        <div 
                          key={criteriaId} 
                          className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-100 text-sm hover:bg-gray-100 transition-colors duration-150"
                          title={`${criteriaName}: ${Math.round(avgScore)}점`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getDotColor(avgPercentage)}`} />
                            <span className="text-gray-700 truncate font-medium">
                              {criteriaName}
                            </span>
                          </div>
                          <span className={`font-bold ml-2 flex-shrink-0 ${getScoreColor(avgPercentage)}`}>
                            {Math.round(avgScore)}
                          </span>
                        </div>
                      );
                    })
                  }
                </div>
              )}
            </div>

            {/* 평가가 없을 때 - 평가 작성 폼 */}
            {!hasEvaluations && isExpanded && (
              <div className="border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <div className="p-4">
                  {/* 평가 작성 버튼 */}
                  {!hasCurrentUserEvaluated(stageKey) && showingEvaluationForm !== stageKey && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-blue-600 text-lg">📝</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-blue-800">
                              {stageInfo.label} 평가를 작성해주세요
                            </p>
                            <p className="text-xs text-blue-600">
                              이 단계의 평가를 작성해주세요.
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleStartEvaluation(stageKey)}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors duration-150 shadow-sm"
                        >
                          <span>📝</span>
                          평가 작성
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 평가 폼 */}
                  {showingEvaluationForm === stageKey && (
                    <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                      {renderEvaluationForm(stageKey)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 평가가 있을 때 - 상세보기 */}
            {hasEvaluations && detailExpandedStage === stageKey && (
              <div className="border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <div className="p-4 space-y-4">
                  {evaluations.map((evaluation) => (
                    <div key={evaluation.id} className="bg-white rounded-lg p-4 border border-gray-100 shadow-sm">
                      {/* 평가자 정보 헤더 */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-sm">
                            <span className="text-white text-sm font-semibold">
                              {evaluation.evaluatorName?.charAt(0) || '?'}
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{evaluation.evaluatorName}</p>
                            <p className="text-sm text-gray-500">
                              {format(evaluation.createdAt.toDate(), 'yyyy.MM.dd HH:mm', { locale: ko })}
                            </p>
                          </div>
                        </div>
                        
                        {/* 총점 */}
                        <div className={`font-bold text-lg ${
                          evaluation.percentage >= 90 ? 'text-green-600' :
                          evaluation.percentage >= 80 ? 'text-blue-600' :
                          evaluation.percentage >= 70 ? 'text-yellow-600' :
                          evaluation.percentage >= 60 ? 'text-orange-600' :
                          'text-red-600'
                        }`}>
                          {Math.round(evaluation.percentage)}점
                        </div>
                      </div>

                      {/* 세부 점수 그리드 */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        {criteriaMap[evaluation.criteriaTemplateId]?.criteria
                          .sort((a, b) => a.order - b.order)
                          .map(criteriaItem => {
                            const scoreData = evaluation.scores[criteriaItem.id];
                            if (!scoreData) return null;
                            
                            const percentage = (scoreData.score / scoreData.maxScore) * 100;
                            const criteriaName = criteriaItem.name;
                            const criteriaFeedback = evaluation.criteriaFeedback?.[criteriaItem.id];
                            
                            return (
                              <div key={criteriaItem.id} className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-semibold text-gray-800">{criteriaName}</span>
                                  <span className={`text-sm font-bold ${
                                    percentage >= 90 ? 'text-green-600' :
                                    percentage >= 80 ? 'text-blue-600' :
                                    percentage >= 70 ? 'text-yellow-600' :
                                    percentage >= 60 ? 'text-orange-600' : 
                                    'text-red-600'
                                  }`}>
                                    {Math.round(scoreData.score)}점
                                  </span>
                                </div>
                                
                                <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
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

                                {/* 기준별 피드백 */}
                                {criteriaFeedback && (
                                  <div className="mt-3 p-3 bg-white rounded border-l-4 border-blue-200">
                                    <p className="text-xs font-semibold text-blue-700 mb-1">💬 평가 의견</p>
                                    <p className="text-sm text-gray-700 leading-relaxed">{criteriaFeedback}</p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>

                      {/* 전체 한줄평 */}
                      {evaluation.feedback && (
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                          <div className="flex items-start gap-2">
                            <div className="text-blue-500 mt-0.5">💭</div>
                            <div>
                              <p className="text-sm font-semibold text-blue-800 mb-1">전체 평가</p>
                              <p className="text-sm text-blue-700 leading-relaxed">{evaluation.feedback}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 수정/삭제 버튼 (본인 평가만) */}
                      {currentUserId === evaluation.evaluatorId && (
                        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
                          <button
                            onClick={() => setEditingEvaluation(evaluation)}
                            className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors duration-150"
                          >
                            <span>✏️</span>
                            수정
                          </button>
                          <button
                            onClick={() => handleDeleteEvaluation(evaluation.id)}
                            className="flex items-center gap-1 px-3 py-2 text-sm text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors duration-150"
                          >
                            <span>🗑️</span>
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
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
