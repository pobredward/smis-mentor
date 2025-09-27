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
  setDoc,
  deleteField
} from 'firebase/firestore';
import { db } from './firebase';
import { 
  Evaluation, 
  EvaluationCriteria, 
  EvaluationFormData, 
  UserEvaluationSummary,
  EvaluationStage
} from '@/types/evaluation';

// 평가 기준 템플릿 관리
export class EvaluationCriteriaService {
  private static collection = 'evaluationCriteria';

  // 기본 평가 기준 템플릿 생성
  static async createDefaultCriteria() {
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
            id: 'adaptation',
            name: '적응력',
            description: '새로운 환경에 대한 적응 정도',
            maxScore: 10,
            order: 1
          },
          {
            id: 'collaboration',
            name: '협업 능력',
            description: '동료들과의 소통 및 협력',
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
            id: 'leadership',
            name: '리더십',
            description: '팀을 이끄는 능력 및 솔선수범',
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
      console.log('기본 평가 기준이 생성되었습니다.');
    } catch (error) {
      console.error('기본 평가 기준 생성 오류:', error);
      throw error;
    }
  }

  // 평가 기준 조회 (단계별)
  static async getCriteriaByStage(stage: EvaluationStage) {
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
      console.error('평가 기준 조회 오류:', error);
      throw error;
    }
  }

      // 기본 평가 기준 조회
      static async getDefaultCriteria(stage: EvaluationStage) {
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
      static async getCriteriaById(criteriaId: string) {
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
  private static summaryCollection = 'userEvaluationSummaries';

  // 평가 생성
  static async createEvaluation(
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
      
      criteria.criteria.forEach(criteriaItem => {
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
      const maxTotalScore = 10; // 기본 최대 점수
      const percentage = (finalScore / maxTotalScore) * 100;
      
      console.log('💾 Saving evaluation with evaluatorName:', evaluatorName);
      
      const evaluationData: Omit<Evaluation, 'id'> = {
        refUserId: formData.targetUserId,
        refApplicationId: formData.refApplicationId,
        refJobBoardId: formData.refJobBoardId,
        evaluationStage: formData.evaluationStage,
        criteriaTemplateId: formData.criteriaTemplateId,
        evaluatorId,
        evaluatorName,
        evaluatorRole,
        scores: evaluationScores,
        totalScore: finalScore,
        maxTotalScore,
        percentage,
        feedback: formData.overallFeedback,
        criteriaFeedback,
        evaluationDate: Timestamp.now(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isFinalized: true,
        isVisible: false
      };
      
      // 평가 저장
      const docRef = await addDoc(collection(db, this.collection), evaluationData);
      
      // 사용자 평가 요약 업데이트
      await this.updateUserEvaluationSummary(formData.targetUserId);
      
      return docRef.id;
    } catch (error) {
      console.error('평가 생성 오류:', error);
      throw error;
    }
  }

  // 사용자별 평가 목록 조회
  static async getUserEvaluations(userId: string, stage?: EvaluationStage) {
    try {
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

  // 사용자 평가 요약 업데이트
  static async updateUserEvaluationSummary(userId: string) {
    try {
      const evaluations = await this.getUserEvaluations(userId);
      
      if (evaluations.length === 0) {
        // 평가가 없을 때 evaluationSummary 필드 완전 삭제
        await updateDoc(doc(db, 'users', userId), {
          evaluationSummary: deleteField(),
          updatedAt: Timestamp.now()
        });
        
        // 별도의 요약 컬렉션에서도 문서 삭제
        const summaryDocRef = doc(db, this.summaryCollection, userId);
        try {
          await deleteDoc(summaryDocRef);
        } catch (error) {
          // 문서가 없을 수도 있으므로 에러 무시
          console.log('요약 문서가 이미 존재하지 않습니다:', error);
        }
        
        console.log('모든 평가가 삭제되어 evaluationSummary 필드를 제거했습니다.');
        return;
      }
      
      const summary: Omit<UserEvaluationSummary, 'userId'> = {
        overallAverage: 0,
        totalEvaluations: evaluations.length,
        lastUpdatedAt: Timestamp.now()
      };
      
      // 평가 단계별 통계 계산
      const stageGroups = {
        documentReview: evaluations.filter(e => e.evaluationStage === '서류 전형'),
        interview: evaluations.filter(e => e.evaluationStage === '면접 전형'),
        faceToFaceEducation: evaluations.filter(e => e.evaluationStage === '대면 교육'),
        campLife: evaluations.filter(e => e.evaluationStage === '캠프 생활')
      };
      
      let totalScoreSum = 0;
      let totalCount = 0;
      
        Object.entries(stageGroups).forEach(([stage, stageEvaluations]) => {
          if (stageEvaluations.length > 0) {
            const scores = stageEvaluations.map(e => e.totalScore);
            const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
            const highest = Math.max(...scores);
            const lowest = Math.min(...scores);
            const lastEvaluated = stageEvaluations.sort((a, b) => 
              b.evaluationDate.seconds - a.evaluationDate.seconds
            )[0].evaluationDate;
            
            const stageData = {
              averageScore: average,
              totalEvaluations: stageEvaluations.length,
              highestScore: highest,
              lowestScore: lowest,
              lastEvaluatedAt: lastEvaluated,
              evaluations: stageEvaluations.map(e => e.id)
            };
            
            // 타입 안전한 방식으로 속성 할당
            switch (stage) {
              case 'documentReview':
                summary.documentReview = stageData;
                break;
              case 'interview':
                summary.interview = stageData;
                break;
              case 'faceToFaceEducation':
                summary.faceToFaceEducation = stageData;
                break;
              case 'campLife':
                summary.campLife = stageData;
                break;
            }
            
            totalScoreSum += average * stageEvaluations.length;
            totalCount += stageEvaluations.length;
          }
        });
      
      summary.overallAverage = totalCount > 0 ? totalScoreSum / totalCount : 0;
      
      // User 컬렉션의 evaluationSummary 필드 업데이트
      await updateDoc(doc(db, 'users', userId), {
        evaluationSummary: summary,
        updatedAt: Timestamp.now()
      });
      
      // 별도의 요약 컬렉션에도 저장 (선택사항)
      const summaryDocRef = doc(db, this.summaryCollection, userId);
      await setDoc(summaryDocRef, {
        userId,
        ...summary
      }, { merge: true });
      
    } catch (error) {
      console.error('사용자 평가 요약 업데이트 오류:', error);
      throw error;
    }
  }

  // 평가 수정
  static async updateEvaluation(evaluationId: string, updateData: Partial<Evaluation>) {
    try {
      await updateDoc(doc(db, this.collection, evaluationId), {
        ...updateData,
        updatedAt: Timestamp.now()
      });
      
      // 관련 사용자의 평가 요약도 업데이트
      const evaluationDoc = await getDoc(doc(db, this.collection, evaluationId));
      if (evaluationDoc.exists()) {
        const evaluation = evaluationDoc.data() as Evaluation;
        await this.updateUserEvaluationSummary(evaluation.refUserId);
      }
    } catch (error) {
      console.error('평가 수정 오류:', error);
      throw error;
    }
  }

  // 평가 삭제
  static async deleteEvaluation(evaluationId: string) {
    try {
      const evaluationDoc = await getDoc(doc(db, this.collection, evaluationId));
      if (!evaluationDoc.exists()) {
        throw new Error('평가를 찾을 수 없습니다.');
      }
      
      const evaluation = evaluationDoc.data() as Evaluation;
      const userId = evaluation.refUserId;
      
      await deleteDoc(doc(db, this.collection, evaluationId));
      
      // 사용자 평가 요약 업데이트
      await this.updateUserEvaluationSummary(userId);
    } catch (error) {
      console.error('평가 삭제 오류:', error);
      throw error;
    }
  }
}
