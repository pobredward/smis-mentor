'use client';

import { useState, useEffect } from 'react';
import { Evaluation, EvaluationCriteria } from '@/types/evaluation';
import { EvaluationService, EvaluationCriteriaService } from '@/lib/evaluationService';
import Button  from '@/components/common/Button';

interface Props {
  evaluation: Evaluation;
  onSuccess: () => void;
  onCancel: () => void;
}

interface EvaluationFormData {
  scores: { [criteriaId: string]: number };
  criteriaFeedback: { [criteriaId: string]: string };
  feedback: string;
}

export default function EvaluationEditForm({ evaluation, onSuccess, onCancel }: Props) {
  const [formData, setFormData] = useState<EvaluationFormData>({
    scores: {},
    criteriaFeedback: {},
    feedback: ''
  });
  const [criteriaTemplate, setCriteriaTemplate] = useState<EvaluationCriteria | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCriteria, setIsLoadingCriteria] = useState(true);

  useEffect(() => {
    loadCriteriaAndInitializeForm();
  }, [evaluation]);

  const loadCriteriaAndInitializeForm = async () => {
    try {
      setIsLoadingCriteria(true);
      const criteria = await EvaluationCriteriaService.getCriteriaById(evaluation.criteriaTemplateId);
      
      if (criteria) {
        setCriteriaTemplate(criteria);
        
        // 기존 평가 데이터로 폼 초기화
        const initialScores: { [criteriaId: string]: number } = {};
        const initialFeedback: { [criteriaId: string]: string } = {};
        
        criteria.criteria.forEach(criterion => {
          const existingScore = evaluation.scores[criterion.id];
          initialScores[criterion.id] = existingScore?.score || 0;
          initialFeedback[criterion.id] = evaluation.criteriaFeedback?.[criterion.id] || '';
        });
        
        setFormData({
          scores: initialScores,
          criteriaFeedback: initialFeedback,
          feedback: evaluation.feedback || ''
        });
      }
    } catch (error) {
      console.error('평가 기준 로드 오류:', error);
    } finally {
      setIsLoadingCriteria(false);
    }
  };

  const handleScoreChange = (criteriaId: string, score: number) => {
    setFormData(prev => ({
      ...prev,
      scores: { ...prev.scores, [criteriaId]: score }
    }));
  };

  const handleCriteriaFeedbackChange = (criteriaId: string, feedback: string) => {
    setFormData(prev => ({
      ...prev,
      criteriaFeedback: { ...prev.criteriaFeedback, [criteriaId]: feedback }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!criteriaTemplate) return;

    try {
      setIsLoading(true);
      
      // 점수 데이터 구성
      const evaluationScores: { [key: string]: { score: number; weight: number; maxScore: number } } = {};
      let totalWeightedScore = 0;
      let totalWeight = 0;

      criteriaTemplate.criteria.forEach(criterion => {
        const score = formData.scores[criterion.id] || 0;
        evaluationScores[criterion.id] = {
          score,
          weight: criterion.weight,
          maxScore: criterion.maxScore
        };
        
        totalWeightedScore += score * criterion.weight;
        totalWeight += criterion.weight;
      });

      const percentage = totalWeight > 0 ? (totalWeightedScore / totalWeight) : 0;

      // 평가 업데이트 데이터
      const updateData: Partial<Evaluation> = {
        scores: evaluationScores,
        criteriaFeedback: formData.criteriaFeedback,
        feedback: formData.feedback,
        percentage
      };

      await EvaluationService.updateEvaluation(evaluation.id, updateData);
      onSuccess();
    } catch (error) {
      console.error('평가 수정 오류:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingCriteria) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!criteriaTemplate) {
    return (
      <div className="text-center py-8 text-gray-500">
        평가 기준을 로드할 수 없습니다.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto max-h-[80vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-800">평가 수정</h2>
        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 평가 기준별 점수 입력 */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-700">평가 항목</h3>
          
          {criteriaTemplate.criteria.map((criterion) => (
            <div key={criterion.id} className="bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-800">{criterion.name}</h4>
                  {criterion.description && (
                    <p className="text-sm text-gray-600 mt-1">{criterion.description}</p>
                  )}
                </div>
                <div className="ml-4 text-right">
                  <div className="text-sm text-gray-500">
                    가중치: {(criterion.weight * 100).toFixed(0)}%
                  </div>
                  <div className="text-sm text-gray-500">
                    최대: {criterion.maxScore}점
                  </div>
                </div>
              </div>

              {/* 점수 입력 */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  점수 (0 - {criterion.maxScore}점)
                </label>
                <input
                  type="number"
                  min="0"
                  max={criterion.maxScore}
                  step="0.1"
                  value={formData.scores[criterion.id] || 0}
                  onChange={(e) => handleScoreChange(criterion.id, parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 세부 피드백 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  세부 코멘트 (선택사항)
                </label>
                <textarea
                  value={formData.criteriaFeedback[criterion.id] || ''}
                  onChange={(e) => handleCriteriaFeedbackChange(criterion.id, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="이 항목에 대한 구체적인 피드백을 입력하세요..."
                />
              </div>
            </div>
          ))}
        </div>

        {/* 전체 한줄평 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            한줄평
          </label>
          <textarea
            value={formData.feedback}
            onChange={(e) => setFormData(prev => ({ ...prev, feedback: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            placeholder="전체적인 평가 의견을 입력하세요..."
          />
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            취소
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
            disabled={isLoading}
          >
            수정 완료
          </Button>
        </div>
      </form>
    </div>
  );
}
