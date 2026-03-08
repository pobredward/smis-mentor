import { Timestamp } from 'firebase/firestore';
export type EvaluationStage = '서류 전형' | '면접 전형' | '대면 교육' | '캠프 생활';
export interface EvaluationScore {
    score: number;
    maxScore: number;
}
export interface EvaluationCriteriaItem {
    id: string;
    name: string;
    description: string;
    maxScore: number;
    order: number;
}
export interface EvaluationCriteria {
    id: string;
    stage: EvaluationStage;
    name: string;
    description: string;
    criteria: EvaluationCriteriaItem[];
    isActive: boolean;
    isDefault: boolean;
    createdBy: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}
export interface Evaluation {
    id: string;
    refUserId: string;
    refApplicationId?: string;
    refJobBoardId?: string;
    evaluationStage: EvaluationStage;
    criteriaTemplateId: string;
    evaluatorId: string;
    evaluatorName: string;
    evaluatorRole: string;
    scores: {
        [criteriaId: string]: EvaluationScore;
    };
    totalScore: number;
    maxTotalScore: number;
    percentage: number;
    feedback?: string;
    criteriaFeedback?: {
        [criteriaId: string]: string;
    };
    evaluationDate: Timestamp;
    duration?: number;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    isFinalized: boolean;
    isVisible: boolean;
}
export interface UserEvaluationSummary {
    userId: string;
    documentReview?: {
        averageScore: number;
        totalEvaluations: number;
        highestScore: number;
        lowestScore: number;
        lastEvaluatedAt: Timestamp;
        evaluations: string[];
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
    overallAverage: number;
    totalEvaluations: number;
    lastUpdatedAt: Timestamp;
}
export interface EvaluationStats {
    totalEvaluations: number;
    averageScore: number;
    scoreDistribution: {
        range: string;
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
    overallFeedback?: string;
    evaluatorName: string;
}
//# sourceMappingURL=evaluation.d.ts.map