import { Firestore } from 'firebase/firestore';
import { Evaluation, EvaluationCriteria, EvaluationFormData, EvaluationStage } from '../../types/evaluation';
export declare class EvaluationCriteriaService {
    private static collection;
    static createDefaultCriteria(db: Firestore): Promise<void>;
    static getCriteriaByStage(db: Firestore, stage: EvaluationStage): Promise<EvaluationCriteria[]>;
    static getDefaultCriteria(db: Firestore, stage: EvaluationStage): Promise<EvaluationCriteria | undefined>;
    static getCriteriaById(db: Firestore, criteriaId: string): Promise<EvaluationCriteria | null>;
}
export declare class EvaluationService {
    private static collection;
    private static summaryCollection;
    static createEvaluation(db: Firestore, formData: EvaluationFormData, evaluatorId: string, evaluatorName: string, evaluatorRole?: string): Promise<string>;
    static getUserEvaluations(db: Firestore, userId: string, stage?: EvaluationStage): Promise<Evaluation[]>;
    static updateUserEvaluationSummary(db: Firestore, userId: string): Promise<void>;
    static updateEvaluation(db: Firestore, evaluationId: string, updateData: Partial<Evaluation>): Promise<void>;
    static deleteEvaluation(db: Firestore, evaluationId: string): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map