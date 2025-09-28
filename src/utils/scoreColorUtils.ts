/**
 * 점수별 색상 기준을 관리하는 유틸리티 함수들
 * 
 * 색상 기준:
 * - 90점 이상 (9점 이상): 초록색 (우수)
 * - 80-89점 (8-8.9점): 파란색 (양호)  
 * - 70-79점 (7-7.9점): 노란색 (보통)
 * - 60-69점 (6-6.9점): 주황색 (미흡)
 * - 60점 미만 (6점 미만): 빨간색 (부족)
 */

/**
 * 점수에 따른 텍스트 색상 클래스를 반환
 * @param score 점수 (0-10 또는 0-100)
 * @param maxScore 최대 점수 (기본값: 10)
 * @returns Tailwind CSS 텍스트 색상 클래스
 */
export function getScoreTextColor(score: number, maxScore: number = 10): string {
  const percentage = (score / maxScore) * 100;
  
  if (percentage >= 90) return 'text-green-600';
  if (percentage >= 80) return 'text-blue-600';
  if (percentage >= 70) return 'text-yellow-600';
  if (percentage >= 60) return 'text-orange-600';
  return 'text-red-600';
}

/**
 * 점수에 따른 배경 색상 클래스를 반환
 * @param score 점수 (0-10 또는 0-100)
 * @param maxScore 최대 점수 (기본값: 10)
 * @returns Tailwind CSS 배경 색상 클래스
 */
export function getScoreBackgroundColor(score: number, maxScore: number = 10): string {
  const percentage = (score / maxScore) * 100;
  
  if (percentage >= 90) return 'bg-green-500';
  if (percentage >= 80) return 'bg-blue-500';
  if (percentage >= 70) return 'bg-yellow-500';
  if (percentage >= 60) return 'bg-orange-500';
  return 'bg-red-500';
}

/**
 * 점수에 따른 전체 색상 클래스 세트를 반환 (텍스트 + 배경 + 테두리)
 * @param score 점수 (0-10 또는 0-100)
 * @param maxScore 최대 점수 (기본값: 10)
 * @returns 텍스트, 배경, 테두리 색상이 포함된 클래스 문자열
 */
export function getScoreColorSet(score: number, maxScore: number = 10): string {
  const percentage = (score / maxScore) * 100;
  
  if (percentage >= 90) return 'text-green-600 bg-green-50 border-green-200';
  if (percentage >= 80) return 'text-blue-600 bg-blue-50 border-blue-200';
  if (percentage >= 70) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
  if (percentage >= 60) return 'text-orange-600 bg-orange-50 border-orange-200';
  return 'text-red-600 bg-red-50 border-red-200';
}

/**
 * 점수에 따른 연한 배경 색상 클래스를 반환
 * @param score 점수 (0-10 또는 0-100)
 * @param maxScore 최대 점수 (기본값: 10)
 * @returns Tailwind CSS 연한 배경 색상 클래스
 */
export function getScoreLightBackgroundColor(score: number, maxScore: number = 10): string {
  const percentage = (score / maxScore) * 100;
  
  if (percentage >= 90) return 'bg-green-50';
  if (percentage >= 80) return 'bg-blue-50';
  if (percentage >= 70) return 'bg-yellow-50';
  if (percentage >= 60) return 'bg-orange-50';
  return 'bg-red-50';
}

/**
 * 점수에 따른 등급을 반환
 * @param score 점수 (0-10 또는 0-100)
 * @param maxScore 최대 점수 (기본값: 10)
 * @returns 점수 등급 (A+, A, B+, B, C+, C, D)
 */
export function getScoreGrade(score: number, maxScore: number = 10): string {
  const percentage = (score / maxScore) * 100;
  
  if (percentage >= 95) return 'A+';
  if (percentage >= 90) return 'A';
  if (percentage >= 85) return 'B+';
  if (percentage >= 80) return 'B';
  if (percentage >= 75) return 'C+';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
}

/**
 * 10점 만점 기준으로 점수에 따른 등급을 반환 (기존 호환성)
 * @param score 점수 (0-10)
 * @returns 점수 등급
 */
export function getScoreGradeFromTen(score: number): string {
  if (score >= 9) return 'A+';
  if (score >= 8) return 'A';
  if (score >= 7) return 'B+';
  if (score >= 6) return 'B';
  if (score >= 5) return 'C+';
  if (score >= 4) return 'C';
  return 'D';
}
