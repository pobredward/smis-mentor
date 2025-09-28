'use client';

import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { User } from '@/types';
import { getScoreTextColor, getScoreColorSet, getScoreGradeFromTen } from '@/utils/scoreColorUtils';

interface Props {
  user: User;
  showDetails?: boolean;
}

export default function EvaluationSummary({ user, showDetails = false }: Props) {
  const { evaluationSummary } = user;

  if (!evaluationSummary) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-500">아직 평가 내역이 없습니다.</p>
      </div>
    );
  }


  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* 전체 평균 점수 */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">종합 평가</h3>
            <p className="text-sm text-gray-600">
              총 {evaluationSummary.totalEvaluations}회 평가
            </p>
          </div>
          <div className="text-right">
            <div className={`inline-flex items-center px-4 py-2 rounded-lg border ${
              getScoreColorSet(evaluationSummary.overallAverage)
            }`}>
              <span className="text-2xl font-bold mr-2">
                {evaluationSummary.overallAverage.toFixed(1)}
              </span>
              <div className="text-right">
                <div className="text-sm font-medium">
                  {getScoreGradeFromTen(evaluationSummary.overallAverage)}
                </div>
                <div className="text-xs">/ 10.0</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 평가 유형별 점수 */}
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 서류 전형 평가 */}
          {evaluationSummary.documentReview && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-900">서류 전형</h4>
                <span className="text-xs text-gray-600">
                  {evaluationSummary.documentReview.totalEvaluations}회
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-600 mb-1">
                {evaluationSummary.documentReview.averageScore.toFixed(1)}
              </div>
              {showDetails && (
                <div className="text-xs text-gray-600 space-y-1">
                  <div>최고: {evaluationSummary.documentReview.highestScore.toFixed(1)}점</div>
                  <div>최저: {evaluationSummary.documentReview.lowestScore.toFixed(1)}점</div>
                  <div>
                    최근: {format(
                      evaluationSummary.documentReview.lastEvaluatedAt.toDate(), 
                      'MM/dd', 
                      { locale: ko }
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 면접 전형 평가 */}
          {evaluationSummary.interview && (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-blue-900">면접 전형</h4>
                <span className="text-xs text-blue-600">
                  {evaluationSummary.interview.totalEvaluations}회
                </span>
              </div>
              <div className="text-2xl font-bold text-blue-600 mb-1">
                {evaluationSummary.interview.averageScore.toFixed(1)}
              </div>
              {showDetails && (
                <div className="text-xs text-blue-600 space-y-1">
                  <div>최고: {evaluationSummary.interview.highestScore.toFixed(1)}점</div>
                  <div>최저: {evaluationSummary.interview.lowestScore.toFixed(1)}점</div>
                  <div>
                    최근: {format(
                      evaluationSummary.interview.lastEvaluatedAt.toDate(), 
                      'MM/dd', 
                      { locale: ko }
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 대면 교육 평가 */}
          {evaluationSummary.faceToFaceEducation && (
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-green-900">대면 교육</h4>
                <span className="text-xs text-green-600">
                  {evaluationSummary.faceToFaceEducation.totalEvaluations}회
                </span>
              </div>
              <div className="text-2xl font-bold text-green-600 mb-1">
                {evaluationSummary.faceToFaceEducation.averageScore.toFixed(1)}
              </div>
              {showDetails && (
                <div className="text-xs text-green-600 space-y-1">
                  <div>최고: {evaluationSummary.faceToFaceEducation.highestScore.toFixed(1)}점</div>
                  <div>최저: {evaluationSummary.faceToFaceEducation.lowestScore.toFixed(1)}점</div>
                  <div>
                    최근: {format(
                      evaluationSummary.faceToFaceEducation.lastEvaluatedAt.toDate(), 
                      'MM/dd', 
                      { locale: ko }
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 캠프 생활 평가 */}
          {evaluationSummary.campLife && (
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-purple-900">캠프 생활</h4>
                <span className="text-xs text-purple-600">
                  {evaluationSummary.campLife.totalEvaluations}회
                </span>
              </div>
              <div className="text-2xl font-bold text-purple-600 mb-1">
                {evaluationSummary.campLife.averageScore.toFixed(1)}
              </div>
              {showDetails && (
                <div className="text-xs text-purple-600 space-y-1">
                  <div>최고: {evaluationSummary.campLife.highestScore.toFixed(1)}점</div>
                  <div>최저: {evaluationSummary.campLife.lowestScore.toFixed(1)}점</div>
                  <div>
                    최근: {format(
                      evaluationSummary.campLife.lastEvaluatedAt.toDate(), 
                      'MM/dd', 
                      { locale: ko }
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 마지막 업데이트 */}
        <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500 text-center">
          마지막 업데이트: {format(
            evaluationSummary.lastUpdatedAt.toDate(), 
            'yyyy년 MM월 dd일 HH:mm', 
            { locale: ko }
          )}
        </div>
      </div>
    </div>
  );
}

// 컴팩트 버전 (사용자 목록에서 사용)
export function EvaluationSummaryCompact({ user }: { user: User }) {
  const { evaluationSummary } = user;


  const overallAverage = evaluationSummary?.overallAverage || 0;

  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <div className="flex items-center gap-1">
        <span className="text-gray-500">종합:</span>
        {evaluationSummary ? (
          <span className={`font-medium ${getScoreTextColor(overallAverage)}`}>
            {overallAverage.toFixed(1)}점
          </span>
        ) : (
          <span className="font-medium text-gray-400">-</span>
        )}
      </div>
      
      <div className="flex items-center gap-1">
        <span className="text-gray-500">서류:</span>
        <span className={`font-medium ${
          evaluationSummary?.documentReview?.averageScore 
            ? getScoreTextColor(evaluationSummary.documentReview.averageScore)
            : 'text-gray-600'
        }`}>
          {evaluationSummary?.documentReview?.averageScore.toFixed(1) || '-'}
        </span>
      </div>
      
      <div className="flex items-center gap-1">
        <span className="text-gray-500">면접:</span>
        <span className={`font-medium ${
          evaluationSummary?.interview?.averageScore 
            ? getScoreTextColor(evaluationSummary.interview.averageScore)
            : 'text-gray-600'
        }`}>
          {evaluationSummary?.interview?.averageScore.toFixed(1) || '-'}
        </span>
      </div>
      
      <div className="flex items-center gap-1">
        <span className="text-gray-500">교육:</span>
        <span className={`font-medium ${
          evaluationSummary?.faceToFaceEducation?.averageScore 
            ? getScoreTextColor(evaluationSummary.faceToFaceEducation.averageScore)
            : 'text-gray-600'
        }`}>
          {evaluationSummary?.faceToFaceEducation?.averageScore.toFixed(1) || '-'}
        </span>
      </div>
      
      <div className="flex items-center gap-1">
        <span className="text-gray-500">캠프:</span>
        <span className={`font-medium ${
          evaluationSummary?.campLife?.averageScore 
            ? getScoreTextColor(evaluationSummary.campLife.averageScore)
            : 'text-gray-600'
        }`}>
          {evaluationSummary?.campLife?.averageScore.toFixed(1) || '-'}
        </span>
      </div>
    </div>
  );
}
