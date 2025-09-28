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
import { getScoreTextColor, getScoreBackgroundColor } from '@/utils/scoreColorUtils';

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

  const getScoreColorClass = (percentage: number) => {
    return getScoreTextColor(percentage, 100);
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

  const canEditEvaluation = (evaluation: Evaluation) => {
    return currentUserId && evaluation.evaluatorId === currentUserId;
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
                    <div className="flex items-center gap-3">
                      {hasEvaluations && (
                        <div className="text-right">
                          <div className={`text-xl font-bold ${getScoreColorClass(average)}`}>
                            {Math.round(average)}점
                          </div>
                        </div>
                      )}
                      
                    </div>

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
                    {/* 현재 관리자가 평가하지 않았다면 맨 위에 평가 작성 버튼 표시 */}
                    {!hasCurrentUserEvaluated(stageKey) && showingEvaluationForm !== stageKey && (
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-blue-800">
                              {stageInfo.label} 평가를 작성해주세요
                            </p>
                            <p className="text-xs text-blue-600">
                              다른 관리자의 평가가 있지만, 회원님의 평가가 필요합니다.
                            </p>
                          </div>
                          <button
                            onClick={() => handleStartEvaluation(stageKey)}
                            className="px-3 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-1"
                          >
                            <span>📝</span>
                            평가 작성
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 평가 폼 (평가가 있는 섹션에서) */}
                    {showingEvaluationForm === stageKey && (
                      <div className="mb-4 bg-white rounded-lg p-4 border border-gray-200">
                        {renderEvaluationForm(stageKey)}
                      </div>
                    )}

                    {/* 항목별 평균 (여러 평가자가 있을 때만) */}
                    {evaluations.length > 1 && (
                      <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="text-sm font-medium text-blue-800 mb-3">📊 항목별 평균</div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                          {criteriaMap[evaluations[0]?.criteriaTemplateId]?.criteria
                            .sort((a, b) => a.order - b.order)
                            .map(criteriaItem => {
                            const criteriaId = criteriaItem.id;
                            const criteriaName = criteriaItem.name;
                            const avgScore = evaluations.reduce((sum, evaluation) => 
                              sum + (evaluation.scores[criteriaId]?.score || 0), 0) / evaluations.length;
                            const avgPercentage = (avgScore / criteriaItem.maxScore) * 100;
                            
                            return (
                              <div key={criteriaId} className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-gray-700 font-medium" title={criteriaName}>
                                    {criteriaName}
                                  </span>
                                  <span className={`text-sm font-bold ${getScoreColorClass(avgPercentage)}`}>
                                    {Math.round(avgScore)}점
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                                  <div 
                                    className={`h-2 rounded-full transition-all duration-300 ${getScoreBackgroundColor(avgPercentage, 100)}`}
                                    style={{ width: `${avgPercentage}%` }}
                                  ></div>
                                </div>
                                {/* 평가자별 점수 분포 미니 바 */}
                                <div className="flex gap-0.5">
                                  {evaluations.map((evaluation) => {
                                    const score = evaluation.scores[criteriaId];
                                    const percentage = score ? (score.score / score.maxScore) * 100 : 0;
                                    return (
                                      <div 
                                        key={evaluation.id}
                                        className={`flex-1 h-1 rounded-sm transition-all duration-300 ${getScoreBackgroundColor(percentage, 100).replace('bg-', 'bg-').replace('-500', '-400')}`}
                                        style={{ opacity: Math.max(percentage / 100, 0.3) }}
                                        title={`${evaluation.evaluatorName}: ${score?.score || 0}점`}
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

                    {/* 평가자별 간단 요약 - 너비 최대 활용 */}
                    <div className="space-y-2 mb-3">
                      {evaluations.map((evaluation) => (
                        <div
                          key={evaluation.id}
                          className="bg-white border-l-2 border-gray-300 pl-3 py-2"
                        >
                          {/* 평가자 정보 헤더 */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${getScoreBackgroundColor(evaluation.percentage, 100)}`}></div>
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
                              {Math.round(evaluation.percentage)}점
                            </div>
                          </div>

                          {/* 세부 점수 바 차트 - 전체 너비 활용 */}
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
                            {criteriaMap[evaluation.criteriaTemplateId]?.criteria
                              .sort((a, b) => a.order - b.order)
                              .filter(criteriaItem => evaluation.scores[criteriaItem.id])
                              .map((criteriaItem) => {
                              const scoreData = evaluation.scores[criteriaItem.id];
                              const percentage = (scoreData.score / scoreData.maxScore) * 100;
                              const criteriaName = criteriaItem.name;
                              
                              return (
                                <div key={criteriaItem.id} className="flex-1">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-gray-700 font-medium" title={criteriaName}>
                                      {criteriaName}
                                    </span>
                                    <span className={`text-xs font-bold ${getScoreColorClass(percentage)}`}>
                                      {Math.round(scoreData.score)}점
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                      className={`h-2 rounded-full transition-all duration-300 ${getScoreBackgroundColor(percentage, 100)}`}
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
                              &quot;{evaluation.feedback.length > 80 
                                ? evaluation.feedback.substring(0, 80) + '...' 
                                : evaluation.feedback}&quot;
                            </div>
                          )}
                        </div>
                      ))}
                    </div>


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
                          {evaluations.map((evaluation) => (
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
                                  {Math.round(evaluation.percentage)}점
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
                                {criteriaMap[evaluation.criteriaTemplateId]?.criteria
                                  .sort((a, b) => a.order - b.order)
                                  .filter(criteriaItem => evaluation.scores[criteriaItem.id])
                                  .map((criteriaItem) => {
                                  const scoreData = evaluation.scores[criteriaItem.id];
                                  const percentage = (scoreData.score / scoreData.maxScore) * 100;
                                  const criteriaComment = evaluation.criteriaFeedback?.[criteriaItem.id];
                                  const criteriaName = criteriaItem.name;
                                  
                                  return (
                                    <div key={criteriaItem.id} className="bg-white p-2 rounded border">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-medium text-gray-700">{criteriaName}</span>
                                        <span className={`text-sm font-bold ${getScoreColorClass(percentage)}`}>
                                          {Math.round(scoreData.score)}점
                                        </span>
                                      </div>
                                      
                                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                                        <div 
                                          className={`h-2 rounded-full transition-all duration-300 ${getScoreBackgroundColor(percentage, 100)}`}
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
                  <div className="p-4">
                    {showingEvaluationForm === stageKey ? (
                      // 평가 폼 렌더링
                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                        {renderEvaluationForm(stageKey)}
                      </div>
                    ) : !hasCurrentUserEvaluated(stageKey) ? (
                      <div className="text-center text-gray-500 mb-4">
                        <div className="text-gray-400 mb-2">📝</div>
                        <p className="text-sm mb-3">아직 {stageInfo.label} 평가가 없습니다.</p>
                        <button
                          onClick={() => handleStartEvaluation(stageKey)}
                          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        >
                          평가 작성하기
                        </button>
                      </div>
                    ) : (
                      <div className="text-center text-gray-500">
                        <div className="text-gray-400 mb-2">✅</div>
                        <p className="text-sm">이미 평가를 완료했습니다.</p>
                      </div>
                    )}
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
