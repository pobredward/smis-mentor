'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { 
  EvaluationStage, 
  EvaluationCriteria, 
  EvaluationFormData 
} from '@/types/evaluation';
import { EvaluationCriteriaService, EvaluationService } from '@/lib/evaluationService';
import { initializeDefaultEvaluationCriteria } from '@/scripts/initEvaluationCriteria';
import Button from '@/components/common/Button';

interface Props {
  targetUserId: string;
  targetUserName: string;
  evaluatorId: string;
  evaluatorName: string;
  refApplicationId?: string;
  refJobBoardId?: string;
  onSuccess?: (evaluationId: string) => void;
  onCancel?: () => void;
}

export default function EvaluationForm({
  targetUserId,
  targetUserName,
  evaluatorId,
  evaluatorName,
  refApplicationId,
  refJobBoardId,
  onSuccess,
  onCancel
}: Props) {
  const [formData, setFormData] = useState<EvaluationFormData>({
    evaluationStage: '서류 전형',
    criteriaTemplateId: '',
    targetUserId,
    targetUserName,
    refApplicationId,
    refJobBoardId,
    scores: {},
    overallFeedback: '',
  });

  const [criteriaTemplates, setCriteriaTemplates] = useState<EvaluationCriteria[]>([]);
  const [selectedCriteria, setSelectedCriteria] = useState<EvaluationCriteria | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingCriteria, setIsCreatingCriteria] = useState(false);

  // 평가 단계 변경 시 기준 템플릿 로드
  useEffect(() => {
    loadCriteriaTemplates();
  }, [formData.evaluationStage]);

  const loadCriteriaTemplates = async () => {
    try {
      setIsLoading(true);
      console.log('평가 기준 로드 시작:', formData.evaluationStage);
      
      const templates = await EvaluationCriteriaService.getCriteriaByStage(
        formData.evaluationStage
      );
      
      console.log('로드된 템플릿:', templates);
      setCriteriaTemplates(templates);
      
      // 기본 템플릿이 있으면 자동 선택
      const defaultTemplate = templates.find(t => t.isDefault);
      if (defaultTemplate) {
        console.log('기본 템플릿 선택:', defaultTemplate.name);
        setFormData(prev => ({
          ...prev,
          criteriaTemplateId: defaultTemplate.id
        }));
        setSelectedCriteria(defaultTemplate);
      } else {
        console.log('기본 템플릿 없음, 첫 번째 템플릿 선택');
        if (templates.length > 0) {
          setFormData(prev => ({
            ...prev,
            criteriaTemplateId: templates[0].id
          }));
          setSelectedCriteria(templates[0]);
        }
      }
    } catch (error) {
      console.error('평가 기준 로드 오류:', error);
      toast.error('평가 기준을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 평가 기준 템플릿 선택
  const handleCriteriaTemplateChange = (templateId: string) => {
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

  // 점수 입력
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

  // 항목별 코멘트 입력
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

  // 폼 제출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
      toast.error('종합 피드백을 입력해주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      const evaluationId = await EvaluationService.createEvaluation(
        formData,
        evaluatorId,
        evaluatorName,
        '관리자'
      );
      
      toast.success('평가가 성공적으로 저장되었습니다.');
      onSuccess?.(evaluationId);
    } catch (error) {
      console.error('평가 저장 오류:', error);
      toast.error('평가 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 기본 평가 기준 생성 함수
  const handleCreateDefaultCriteria = async () => {
    try {
      setIsCreatingCriteria(true);
      const result = await initializeDefaultEvaluationCriteria();
      
      if (result.success) {
        toast.success('기본 평가 기준이 생성되었습니다.');
        // 평가 기준 다시 로드
        await loadCriteriaTemplates();
      } else {
        toast.error(result.message || '평가 기준 생성에 실패했습니다.');
      }
    } catch (error) {
      console.error('평가 기준 생성 오류:', error);
      toast.error('평가 기준 생성 중 오류가 발생했습니다.');
    } finally {
      setIsCreatingCriteria(false);
    }
  };

  const evaluationStages: { value: EvaluationStage; label: string }[] = [
    { value: '서류 전형', label: '서류 전형' },
    { value: '면접 전형', label: '면접 전형' },
    { value: '대면 교육', label: '대면 교육' },
    { value: '캠프 생활', label: '캠프 생활' }
  ];

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-2">평가 작성</h2>
        <div className="bg-gray-50 p-3 rounded-md">
          <p className="text-sm text-gray-700">
            <span className="text-gray-500">평가 대상자:</span> <span className="font-medium text-gray-900">{targetUserName}</span>
          </p>
          <p className="text-sm text-gray-700">
            <span className="text-gray-500">평가자:</span> <span className="font-medium text-blue-600">{evaluatorName}</span>
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 평가 단계 선택 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            평가 단계
          </label>
          <select
            value={formData.evaluationStage}
            onChange={(e) => setFormData(prev => ({
              ...prev,
              evaluationStage: e.target.value as EvaluationStage
            }))}
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          >
            {evaluationStages.map(stage => (
              <option key={stage.value} value={stage.value}>
                {stage.label}
              </option>
            ))}
          </select>
        </div>

        {/* 평가 기준 템플릿 선택 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            평가 기준
          </label>
          {isLoading ? (
            <div className="flex items-center p-2 text-sm text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 mr-2"></div>
              평가 기준을 불러오는 중...
            </div>
          ) : criteriaTemplates.length > 0 ? (
            <>
              <select
                value={formData.criteriaTemplateId}
                onChange={(e) => handleCriteriaTemplateChange(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              >
                <option value="">평가 기준 선택</option>
                {criteriaTemplates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              {selectedCriteria && (
                <p className="text-xs text-gray-500 mt-1">
                  {selectedCriteria.description}
                </p>
              )}
            </>
          ) : (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800 mb-2">
                선택한 단계({formData.evaluationStage})에 대한 평가 기준이 없습니다.
              </p>
              <p className="text-xs text-yellow-600 mb-3">
                기본 평가 기준을 생성하면 평가 항목들이 표시됩니다.
              </p>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleCreateDefaultCriteria}
                isLoading={isCreatingCriteria}
                disabled={isCreatingCriteria}
              >
                기본 평가 기준 생성
              </Button>
            </div>
          )}
        </div>

        {/* 평가 항목별 점수 입력 */}
        {selectedCriteria && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">평가 항목</h3>
            {selectedCriteria.criteria
              .sort((a, b) => a.order - b.order)
              .map(criteria => (
                <div key={criteria.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-medium text-gray-900">{criteria.name}</h4>
                      <p className="text-sm text-gray-600">{criteria.description}</p>
                      <p className="text-xs text-gray-500">
                        최대 점수: {criteria.maxScore}점
                      </p>
                    </div>
                  </div>

                  {/* 점수 선택 */}
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      점수 (1-{criteria.maxScore}점)
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {Array.from({ length: criteria.maxScore }, (_, i) => i + 1).map(score => (
                        <button
                          key={score}
                          type="button"
                          onClick={() => handleScoreChange(criteria.id, score)}
                          className={`px-3 py-1 rounded-md text-sm font-medium border ${
                            formData.scores[criteria.id]?.score === score
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {score}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 항목별 코멘트 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      세부 코멘트 (선택사항)
                    </label>
                    <textarea
                      value={formData.scores[criteria.id]?.comment || ''}
                      onChange={(e) => handleCriteriaCommentChange(criteria.id, e.target.value)}
                      placeholder="이 항목에 대한 구체적인 피드백을 입력하세요..."
                      className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                    />
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* 종합 피드백 (한줄평) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            한줄평 *
          </label>
          <textarea
            value={formData.overallFeedback}
            onChange={(e) => setFormData(prev => ({
              ...prev,
              overallFeedback: e.target.value
            }))}
            placeholder="해당 단계에 대한 전반적인 한줄평을 작성해주세요..."
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            required
          />
        </div>



        {/* 버튼 */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          {onCancel && (
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              취소
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting}
            disabled={isLoading || isSubmitting || !selectedCriteria}
          >
            평가 저장
          </Button>
        </div>
      </form>
    </div>
  );
}
