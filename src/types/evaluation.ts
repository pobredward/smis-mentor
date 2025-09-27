import { Timestamp } from 'firebase/firestore';

// 평가 단계 (통일된 4단계)
export type EvaluationStage = '서류 전형' | '면접 전형' | '대면 교육' | '캠프 생활';

// 개별 평가 항목
export interface EvaluationScore {
  score: number;           // 실제 점수 (1-10)
  maxScore: number;        // 최대 점수 (기본 10)
}

// 평가 기준 항목
export interface EvaluationCriteriaItem {
  id: string;
  name: string;              // 평가 항목명 (예: '의사소통능력', '기술역량' 등)
  description: string;       // 평가 기준 설명
  maxScore: number;          // 최대 점수
  order: number;             // 표시 순서
}

// 평가 기준 템플릿
export interface EvaluationCriteria {
  id: string;
  stage: EvaluationStage;
  name: string;              // 평가 템플릿 이름
  description: string;       // 평가 템플릿 설명
  criteria: EvaluationCriteriaItem[];
  isActive: boolean;
  isDefault: boolean;        // 기본 템플릿 여부
  createdBy: string;         // 생성자 ID
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// 개별 평가 데이터
export interface Evaluation {
  id: string;
  refUserId: string;           // 평가 대상자 ID
  refApplicationId?: string;   // 지원 내역 ID (면접용)
  refJobBoardId?: string;      // 채용 공고 ID
  
  evaluationStage: EvaluationStage;
  criteriaTemplateId: string;  // 사용된 평가 기준 템플릿 ID
  
  evaluatorId: string;         // 평가자 ID
  evaluatorName: string;       // 평가자 이름
  evaluatorRole: string;       // 평가자 역할 (예: '팀장', '매니저' 등)
  
  // 점수 평가 항목들
  scores: {
    [criteriaId: string]: EvaluationScore;
  };
  
  totalScore: number;          // 가중 평균 점수
  maxTotalScore: number;       // 최대 총점
  percentage: number;          // 점수 백분율
  
  // 서술형 피드백
  feedback: string;            // 종합 코멘트
  criteriaFeedback?: {         // 항목별 세부 코멘트
    [criteriaId: string]: string;
  };
  
  // 추가 정보
  evaluationDate: Timestamp;   // 평가 실시일
  duration?: number;           // 평가 소요 시간 (분)
  
  // 메타데이터
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isFinalized: boolean;        // 평가 완료 여부
  isVisible: boolean;          // 평가 대상자에게 공개 여부
}

// 사용자별 평가 요약
export interface UserEvaluationSummary {
  userId: string;
  documentReview?: {
    averageScore: number;
    totalEvaluations: number;
    highestScore: number;
    lowestScore: number;
    lastEvaluatedAt: Timestamp;
    evaluations: string[];     // 평가 ID 목록
  };
  interview?: {
    averageScore: number;
    totalEvaluations: number;
    highestScore: number;
    lowestScore: number;
    lastEvaluatedAt: Timestamp;
    evaluations: string[];
  };
  faceToFaceEducation?: {
    averageScore: number;
    totalEvaluations: number;
    highestScore: number;
    lowestScore: number;
    lastEvaluatedAt: Timestamp;
    evaluations: string[];
  };
  campLife?: {
    averageScore: number;
    totalEvaluations: number;
    highestScore: number;
    lowestScore: number;
    lastEvaluatedAt: Timestamp;
    evaluations: string[];
  };
  overallAverage: number;      // 전체 평균 점수
  totalEvaluations: number;    // 총 평가 횟수
  lastUpdatedAt: Timestamp;
}

// 평가 통계 (관리자용)
export interface EvaluationStats {
  totalEvaluations: number;
  averageScore: number;
  scoreDistribution: {
    range: string;             // '9-10점', '7-8점' 등
    count: number;
    percentage: number;
  }[];
  evaluatorStats: {
    evaluatorId: string;
    evaluatorName: string;
    totalEvaluations: number;
    averageScore: number;
  }[];
  criteriaStats: {
    criteriaId: string;
    criteriaName: string;
    averageScore: number;
    evaluationCount: number;
  }[];
}

// 평가 폼 데이터 (UI용)
export interface EvaluationFormData {
  evaluationStage: EvaluationStage;
  criteriaTemplateId: string;
  targetUserId: string;
  targetUserName: string;
  refApplicationId?: string;
  refJobBoardId?: string;
  
  scores: {
    [criteriaId: string]: {
      score: number;
      comment?: string;
    };
  };
  
  overallFeedback: string;
}
