import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  Timestamp,
  writeBatch,
  deleteField,
  Firestore
} from 'firebase/firestore';
import { 
  Evaluation, 
  EvaluationCriteria, 
  EvaluationFormData, 
  EvaluationStage,
  EvaluationCriteriaItem
} from '../../types/evaluation';
import { logger } from '../../utils/logger';
import { computeEvaluationSummary } from '../../utils/evaluationSummary';
import { NotFoundError, DatabaseError } from '../../errors';

// 평가 기준 템플릿 관리
export class EvaluationCriteriaService {
  private static collection = 'evaluationCriteria';

  // 기본 평가 기준 템플릿 생성
  static async createDefaultCriteria(db: Firestore) {
    const defaultCriteria: Omit<EvaluationCriteria, 'id'>[] = [
      {
        stage: '서류 전형',
        name: '서류 전형 평가',
        description: '서류 전형에서 사용되는 평가 기준입니다.',
        criteria: [
          {
            id: 'document_completeness',
            name: '서류 완성도',
            description: '지원서 작성의 완성도 및 성실성',
            maxScore: 10,
            order: 1
          },
          {
            id: 'experience_relevance',
            name: '경력 적합성',
            description: '지원 분야와 관련된 경험 및 역량',
            maxScore: 10,
            order: 2
          },
          {
            id: 'motivation',
            name: '지원 동기',
            description: '지원 동기의 명확성 및 진정성',
            maxScore: 10,
            order: 3
          },
          {
            id: 'potential',
            name: '성장 잠재력',
            description: '향후 발전 가능성 및 학습 의지',
            maxScore: 10,
            order: 4
          }
        ],
        isActive: true,
        isDefault: true,
        createdBy: 'system',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      },
      {
        stage: '면접 전형',
        name: '면접 전형 평가',
        description: '면접 전형에서 사용되는 평가 기준입니다.',
        criteria: [
          {
            id: 'communication',
            name: '의사소통 능력',
            description: '질문 이해도, 답변의 명확성, 표현력',
            maxScore: 10,
            order: 1
          },
          {
            id: 'attitude',
            name: '태도 및 자세',
            description: '면접 태도, 적극성, 예의',
            maxScore: 10,
            order: 2
          },
          {
            id: 'competency',
            name: '업무 역량',
            description: '관련 경험, 기술적 이해도, 학습 의지',
            maxScore: 10,
            order: 3
          },
          {
            id: 'fit',
            name: '조직 적합성',
            description: '팀워크, 조직 문화 적응도, 가치관',
            maxScore: 10,
            order: 4
          }
        ],
        isActive: true,
        isDefault: true,
        createdBy: 'system',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      },
      {
        stage: '대면 교육',
        name: '대면 교육 평가',
        description: '대면 교육에서 사용되는 평가 기준입니다.',
        criteria: [
          {
            id: 'facial_expression',
            name: '표정',
            description: '좋은 인상인지를 떠나 교육 전반적으로 어떤 표정을 짓고있는지 기준',
            maxScore: 10,
            order: 1
          },
          {
            id: 'attitude',
            name: '태도',
            description: '자세가 흐트러지는지에 대한 여부나 교육에 대한 호응도 기준 (고개 끄덕임)',
            maxScore: 10,
            order: 2
          },
          {
            id: 'proactivity',
            name: '적극성',
            description: '질문 여부 기준',
            maxScore: 10,
            order: 3
          },
          {
            id: 'basic_manners',
            name: '기본 매너',
            description: '지각 여부 및 다른 선생님들간의 소통 시 태도',
            maxScore: 10,
            order: 4
          }
        ],
        isActive: true,
        isDefault: true,
        createdBy: 'system',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      },
      {
        stage: '캠프 생활',
        name: '캠프 생활 평가',
        description: '캠프 생활에서 사용되는 평가 기준입니다.',
        criteria: [
          {
            id: 'mentor_manager_collaboration',
            name: '멘토&매니저 협업',
            description: '멘토 간 협업 및 매니저와의 원활한 소통 및 협력',
            maxScore: 10,
            order: 1
          },
          {
            id: 'student_management',
            name: '학생 생활 관리',
            description: '학생들의 생활 관리 및 지도 능력',
            maxScore: 10,
            order: 2
          },
          {
            id: 'responsibility',
            name: '책임감',
            description: '맡은 역할에 대한 책임감 및 성실성',
            maxScore: 10,
            order: 3
          },
          {
            id: 'popularity',
            name: '인기도',
            description: '학생들이 이 멘토를 얼마나 좋아하고 따르는지',
            maxScore: 10,
            order: 4
          }
        ],
        isActive: true,
        isDefault: true,
        createdBy: 'system',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      }
    ];

    try {
      const batch = writeBatch(db);
      
      for (const criteria of defaultCriteria) {
        const docRef = doc(collection(db, this.collection));
        batch.set(docRef, criteria);
      }
      
      await batch.commit();
      logger.info('기본 평가 기준이 생성되었습니다.');
    } catch (error) {
      logger.error('기본 평가 기준 생성 오류:', error);
      throw new DatabaseError('기본 평가 기준 생성에 실패했습니다', error);
    }
  }

  // 평가 기준 조회 (단계별)
  static async getCriteriaByStage(db: Firestore, stage: EvaluationStage) {
    try {
      const q = query(
        collection(db, this.collection),
        where('stage', '==', stage),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as EvaluationCriteria[];
    } catch (error) {
      logger.error('평가 기준 조회 오류:', error);
      throw new DatabaseError('평가 기준 조회에 실패했습니다', error);
    }
  }

  // 기본 평가 기준 조회
  static async getDefaultCriteria(db: Firestore, stage: EvaluationStage) {
    try {
      const q = query(
        collection(db, this.collection),
        where('stage', '==', stage),
        where('isDefault', '==', true),
        where('isActive', '==', true)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))[0] as EvaluationCriteria | undefined;
    } catch (error) {
      console.error('기본 평가 기준 조회 오류:', error);
      throw error;
    }
  }

  // ID로 평가 기준 조회
  static async getCriteriaById(db: Firestore, criteriaId: string) {
    try {
      const docRef = doc(db, this.collection, criteriaId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data()
        } as EvaluationCriteria;
      }
      return null;
    } catch (error) {
      console.error('평가 기준 조회 오류:', error);
      throw error;
    }
  }
}

// 평가 관리 서비스
export class EvaluationService {
  private static collection = 'evaluations';

  // 평가 생성
  static async createEvaluation(
    db: Firestore,
    formData: EvaluationFormData, 
    evaluatorId: string, 
    evaluatorName: string,
    evaluatorRole: string = '관리자'
  ) {
    try {
      // 평가 기준 조회
      const criteriaDoc = await getDoc(doc(db, 'evaluationCriteria', formData.criteriaTemplateId));
      if (!criteriaDoc.exists()) {
        throw new Error('평가 기준을 찾을 수 없습니다.');
      }
      
      const criteria = criteriaDoc.data() as EvaluationCriteria;
      
      // 점수 계산 (단순 평균)
      let totalScore = 0;
      let scoreCount = 0;
      
      const evaluationScores: { [key: string]: { score: number; maxScore: number } } = {};
      const criteriaFeedback: { [key: string]: string } = {};
      
      criteria.criteria.forEach((criteriaItem: EvaluationCriteriaItem) => {
        const scoreData = formData.scores[criteriaItem.id];
        if (scoreData) {
          totalScore += scoreData.score;
          scoreCount++;
          
          evaluationScores[criteriaItem.id] = {
            score: scoreData.score,
            maxScore: criteriaItem.maxScore
          };
          
          if (scoreData.comment) {
            criteriaFeedback[criteriaItem.id] = scoreData.comment;
          }
        }
      });
      
      const finalScore = scoreCount > 0 ? totalScore / scoreCount : 0;
      const maxTotalScore = 10;
      const percentage = (finalScore / maxTotalScore) * 100;
      
      const evaluationData: Omit<Evaluation, 'id'> = {
        refUserId: formData.targetUserId,
        evaluationStage: formData.evaluationStage,
        criteriaTemplateId: formData.criteriaTemplateId,
        evaluatorId,
        evaluatorName,
        evaluatorRole,
        scores: evaluationScores,
        totalScore: finalScore,
        maxTotalScore,
        percentage,
        criteriaFeedback,
        evaluationDate: Timestamp.now(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isFinalized: true,
        isVisible: false,
        ...(formData.overallFeedback && { feedback: formData.overallFeedback }),
        ...(formData.refApplicationId && { refApplicationId: formData.refApplicationId }),
        ...(formData.refJobBoardId && { refJobBoardId: formData.refJobBoardId })
      };
      
      // 평가 저장
      const docRef = await addDoc(collection(db, this.collection), evaluationData);
      
      // 사용자 평가 요약 업데이트
      await this.updateUserEvaluationSummary(db, formData.targetUserId);
      
      return docRef.id;
    } catch (error) {
      console.error('평가 생성 오류:', error);
      throw error;
    }
  }

  // 사용자별 평가 목록 조회
  static async getUserEvaluations(db: Firestore, userId: string, stage?: EvaluationStage) {
    try {
      // userId가 유효하지 않으면 빈 배열 반환
      if (!userId) {
        console.warn('getUserEvaluations: userId가 제공되지 않았습니다.');
        return [];
      }

      let q = query(
        collection(db, this.collection),
        where('refUserId', '==', userId),
        orderBy('evaluationDate', 'desc')
      );

      if (stage) {
        q = query(
          collection(db, this.collection),
          where('refUserId', '==', userId),
          where('evaluationStage', '==', stage),
          orderBy('evaluationDate', 'desc')
        );
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Evaluation[];
    } catch (error) {
      console.error('사용자 평가 조회 오류:', error);
      throw error;
    }
  }

  // 사용자 평가 요약 업데이트 — 그 사람의 평가 전부로 다시 계산해 users/{uid}.evaluationSummary 를 통째로 바꾼다
  // (updateDoc 은 필드 값을 통째로 덮어쓴다 — 평가를 다 지운 단계가 남지 않음. 예전 userEvaluationSummaries 컬렉션은 더 이상 쓰지 않음)
  static async updateUserEvaluationSummary(db: Firestore, userId: string) {
    try {
      // 평가 일시 정렬 없이 그 사람의 평가 전부 (MCP 서버 재계산과 같은 범위)
      const snapshot = await getDocs(query(collection(db, this.collection), where('refUserId', '==', userId)));
      const evaluations = snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as Evaluation);
      const summary = computeEvaluationSummary(evaluations, Timestamp.now());

      await updateDoc(doc(db, 'users', userId), {
        evaluationSummary: summary ?? deleteField(),
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('사용자 평가 요약 업데이트 오류:', error);
      throw error;
    }
  }

  // 평가 수정
  static async updateEvaluation(db: Firestore, evaluationId: string, updateData: Partial<Evaluation>) {
    try {
      await updateDoc(doc(db, this.collection, evaluationId), {
        ...updateData,
        updatedAt: Timestamp.now()
      });
      
      const evaluationDoc = await getDoc(doc(db, this.collection, evaluationId));
      if (evaluationDoc.exists()) {
        const evaluation = evaluationDoc.data() as Evaluation;
        await this.updateUserEvaluationSummary(db, evaluation.refUserId);
      }
    } catch (error) {
      console.error('평가 수정 오류:', error);
      throw error;
    }
  }

  // 평가 삭제
  static async deleteEvaluation(db: Firestore, evaluationId: string) {
    try {
      const evaluationDoc = await getDoc(doc(db, this.collection, evaluationId));
      if (!evaluationDoc.exists()) {
        throw new Error('평가를 찾을 수 없습니다.');
      }
      
      const evaluation = evaluationDoc.data() as Evaluation;
      const userId = evaluation.refUserId;
      
      await deleteDoc(doc(db, this.collection, evaluationId));
      
      await this.updateUserEvaluationSummary(db, userId);
    } catch (error) {
      console.error('평가 삭제 오류:', error);
      throw error;
    }
  }
}
