'use client';

import { useState, useEffect } from 'react';
import { EvaluationStage, EvaluationCriteria, EvaluationFormData } from '@/types/evaluation';
import { EvaluationService, EvaluationCriteriaService } from '@/lib/evaluationService';
import Button from '@/components/common/Button';
import { toast } from 'react-hot-toast';

interface Props {
  targetUserId: string;
  targetUserName: string;
  evaluatorName: string;
  evaluationStage: EvaluationStage;
  refApplicationId?: string;
  refJobBoardId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function EvaluationModalForm({
  targetUserId,
  targetUserName,
  evaluatorName,
  evaluationStage,
  refApplicationId,
  refJobBoardId,
  onSuccess,
  onCancel
}: Props) {
  const [formData, setFormData] = useState<EvaluationFormData>({
    evaluationStage,
    criteriaTemplateId: '',
    targetUserId,
    targetUserName,
    refApplicationId,
    refJobBoardId,
    scores: {},
    overallFeedback: ''
  });
  
  const [criteriaTemplates, setCriteriaTemplates] = useState<EvaluationCriteria[]>([]);
  const [selectedCriteria, setSelectedCriteria] = useState<EvaluationCriteria | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadCriteriaTemplates();
  }, [evaluationStage]);

  const loadCriteriaTemplates = async () => {
    try {
      setIsLoading(true);
      const templates = await EvaluationCriteriaService.getCriteriaByStage(evaluationStage);
      setCriteriaTemplates(templates);
      
      if (templates.length > 0) {
        const defaultTemplate = templates.find(t => t.isDefault) || templates[0];
        handleSelectCriteria(defaultTemplate.id);
      }
    } catch (error) {
      console.error('평가 기준 로드 오류:', error);
      toast.error('평가 기준을 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectCriteria = async (templateId: string) => {
    const template = criteriaTemplates.find(t => t.id === templateId);
    if (template) {
      setSelectedCriteria(template);
      setFormData(prev => ({
        ...prev,
        criteriaTemplateId: templateId,
        scores: {} // 점수 초기화
      }));
    }
  };

  const handleScoreChange = (criteriaId: string, score: number) => {
    setFormData(prev => ({
      ...prev,
      scores: {
        ...prev.scores,
        [criteriaId]: {
          ...prev.scores[criteriaId],
          score
        }
      }
    }));
  };

  const handleCriteriaCommentChange = (criteriaId: string, comment: string) => {
    setFormData(prev => ({
      ...prev,
      scores: {
        ...prev.scores,
        [criteriaId]: {
          ...prev.scores[criteriaId],
          comment
        }
      }
    }));
  };

  const handleSubmit = async () => {
    if (!selectedCriteria) {
      toast.error('평가 기준을 선택해주세요.');
      return;
    }

    // 모든 항목에 점수가 입력되었는지 확인
    const missingScores = selectedCriteria.criteria.filter(
      criteria => !formData.scores[criteria.id]?.score
    );

    if (missingScores.length > 0) {
      toast.error(`다음 항목의 점수를 입력해주세요: ${missingScores.map(c => c.name).join(', ')}`);
      return;
    }

    if (!formData.overallFeedback.trim()) {
      toast.error('한줄평을 입력해주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      await EvaluationService.createEvaluation(formData, '', evaluatorName, '관리자');
      toast.success('평가가 성공적으로 저장되었습니다!');
      onSuccess();
    } catch (error) {
      console.error('평가 저장 오류:', error);
      toast.error('평가 저장에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">{evaluationStage} 평가</h2>
            <button
              onClick={onCancel}
              className="text-white hover:text-blue-200 text-xl font-bold p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-all"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 컨텐츠 */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {selectedCriteria ? (
            <div className="space-y-6">
              {/* 항목별 점수 입력 */}
              {selectedCriteria.criteria.map(criteria => (
                <div key={criteria.id} className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="mb-3">
                    <h4 className="font-medium text-gray-900">{criteria.name}</h4>
                    <p className="text-sm text-gray-600 mt-1">{criteria.description}</p>
                  </div>

                  {/* 점수 선택 */}
                  <div className="mb-3">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {Array.from({ length: criteria.maxScore }, (_, i) => i + 1).map(score => (
                        <button
                          key={score}
                          onClick={() => handleScoreChange(criteria.id, score)}
                          className={`
                            w-10 h-10 rounded-lg border font-bold transition-all hover:scale-105
                            ${formData.scores[criteria.id]?.score === score
                              ? 'border-blue-500 bg-blue-500 text-white'
                              : 'border-gray-300 hover:border-blue-300 hover:bg-blue-50'
                            }
                          `}
                        >
                          {score}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 세부 코멘트 */}
                  <div>
                    <textarea
                      value={formData.scores[criteria.id]?.comment || ''}
                      onChange={(e) => handleCriteriaCommentChange(criteria.id, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      placeholder="세부 코멘트 (선택사항)"
                    />
                  </div>
                </div>
              ))}

              {/* 종합 의견 */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  한줄평 *
                </label>
                <textarea
                  value={formData.overallFeedback}
                  onChange={(e) => setFormData(prev => ({ ...prev, overallFeedback: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="전체적인 평가 의견을 작성해주세요..."
                  required
                />
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="mt-2 text-gray-500">평가 기준을 불러오는 중...</p>
            </div>
          )}
        </div>

        {/* 푸터 버튼 */}
        <div className="border-t bg-gray-50 px-6 py-4 flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            취소
          </Button>
          
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            평가 저장
          </Button>
        </div>
      </div>
    </div>
  );
}
