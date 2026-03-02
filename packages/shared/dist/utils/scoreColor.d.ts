/**
 * 점수별 색상 기준을 관리하는 유틸리티 함수들
 *
 * 10점 만점 기준:
 * 🟢 9점 이상: 초록색 (우수)
 * 🔵 8-8.9점: 파란색 (양호)
 * 🟡 7-7.9점: 노란색 (보통)
 * 🟠 6-6.9점: 주황색 (미흡)
 * 🔴 6점 미만: 빨간색 (부족)
 */
/**
 * 점수에 따른 색상 정보를 반환 (React Native용)
 * @param score 점수 (0-10 또는 0-100)
 * @param maxScore 최대 점수 (기본값: 10)
 * @returns 색상 hex 코드
 */
export declare function getScoreColor(score: number, maxScore?: number): string;
/**
 * 점수에 따른 텍스트 색상 클래스를 반환 (Web용 - Tailwind CSS)
 * @param score 점수 (0-10 또는 0-100)
 * @param maxScore 최대 점수 (기본값: 10)
 * @returns Tailwind CSS 텍스트 색상 클래스
 */
export declare function getScoreTextColor(score: number, maxScore?: number): string;
/**
 * 점수에 따른 배경 색상 클래스를 반환 (Web용 - Tailwind CSS)
 * @param score 점수 (0-10 또는 0-100)
 * @param maxScore 최대 점수 (기본값: 10)
 * @returns Tailwind CSS 배경 색상 클래스
 */
export declare function getScoreBackgroundColor(score: number, maxScore?: number): string;
/**
 * 점수에 따른 전체 색상 클래스 세트를 반환 (텍스트 + 배경 + 테두리) (Web용 - Tailwind CSS)
 * @param score 점수 (0-10 또는 0-100)
 * @param maxScore 최대 점수 (기본값: 10)
 * @returns 텍스트, 배경, 테두리 색상이 포함된 클래스 문자열
 */
export declare function getScoreColorSet(score: number, maxScore?: number): string;
/**
 * 점수에 따른 연한 배경 색상 클래스를 반환 (Web용 - Tailwind CSS)
 * @param score 점수 (0-10 또는 0-100)
 * @param maxScore 최대 점수 (기본값: 10)
 * @returns Tailwind CSS 연한 배경 색상 클래스
 */
export declare function getScoreLightBackgroundColor(score: number, maxScore?: number): string;
/**
 * 점수에 따른 등급을 반환
 * @param score 점수 (0-10 또는 0-100)
 * @param maxScore 최대 점수 (기본값: 10)
 * @returns 점수 등급 (A+, A, B+, B, C+, C, D)
 */
export declare function getScoreGrade(score: number, maxScore?: number): string;
/**
 * 10점 만점 기준으로 점수에 따른 등급을 반환 (기존 호환성)
 * @param score 점수 (0-10)
 * @returns 점수 등급
 */
export declare function getScoreGradeFromTen(score: number): string;
//# sourceMappingURL=scoreColor.d.ts.map