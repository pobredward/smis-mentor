import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Evaluation,
  EvaluationStage,
  EvaluationService,
  EvaluationCriteriaService,
  EvaluationCriteria,
  getScoreColor
} from '@smis-mentor/shared';
import { db } from '../config/firebase';

interface Props {
  userId: string;
  onAddEvaluation?: (stage: EvaluationStage) => void;
}

export default function EvaluationStageCards({ userId, onAddEvaluation }: Props) {
  const [evaluationsByStage, setEvaluationsByStage] = useState<{
    [key in EvaluationStage]: Evaluation[];
  }>({
    '서류 전형': [],
    '면접 전형': [],
    '대면 교육': [],
    '캠프 생활': []
  });
  const [criteriaMap, setCriteriaMap] = useState<{[key: string]: EvaluationCriteria}>({});
  const [expandedStage, setExpandedStage] = useState<EvaluationStage | null>(null);
  const [expandedEvaluation, setExpandedEvaluation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const stages: EvaluationStage[] = ['서류 전형', '면접 전형', '대면 교육', '캠프 생활'];

  useEffect(() => {
    if (userId) {
      loadEvaluations();
    } else {
      console.warn('EvaluationStageCards: userId가 undefined입니다.');
      setIsLoading(false);
    }
  }, [userId]);

  const loadEvaluations = async () => {
    if (!userId) {
      console.error('평가 로드 오류: userId가 없습니다.');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const allEvaluations = await EvaluationService.getUserEvaluations(db, userId);
      
      // 평가 기준 템플릿들을 로드
      const criteriaTemplateIds = [...new Set(allEvaluations.map(e => e.criteriaTemplateId))];
      const criteriaData: {[key: string]: EvaluationCriteria} = {};
      
      await Promise.all(
        criteriaTemplateIds.map(async (templateId) => {
          try {
            const criteria = await EvaluationCriteriaService.getCriteriaById(db, templateId);
            if (criteria) {
              criteriaData[templateId] = criteria;
            }
          } catch (error) {
            console.error(`평가 기준 로드 실패 (${templateId}):`, error);
          }
        })
      );
      
      setCriteriaMap(criteriaData);
      
      const grouped = allEvaluations.reduce((acc, evaluation) => {
        if (!acc[evaluation.evaluationStage]) {
          acc[evaluation.evaluationStage] = [];
        }
        acc[evaluation.evaluationStage].push(evaluation);
        return acc;
      }, {} as { [key in EvaluationStage]: Evaluation[] });

      setEvaluationsByStage({
        '서류 전형': grouped['서류 전형'] || [],
        '면접 전형': grouped['면접 전형'] || [],
        '대면 교육': grouped['대면 교육'] || [],
        '캠프 생활': grouped['캠프 생활'] || []
      });
    } catch (error) {
      console.error('평가 로드 오류:', error);
      Alert.alert('오류', '평가 정보를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const getStageIcon = (stage: EvaluationStage): keyof typeof Ionicons.glyphMap => {
    switch (stage) {
      case '서류 전형':
        return 'document-text';
      case '면접 전형':
        return 'people';
      case '대면 교육':
        return 'school';
      case '캠프 생활':
        return 'home';
      default:
        return 'star';
    }
  };

  const calculateAverageScore = (evaluations: Evaluation[]) => {
    if (evaluations.length === 0) return 0;
    const sum = evaluations.reduce((acc, e) => acc + e.totalScore, 0);
    return sum / evaluations.length;
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  };

  const handleDeleteEvaluation = async (evaluationId: string, stage: EvaluationStage) => {
    Alert.alert(
      '평가 삭제',
      '이 평가를 삭제하시겠습니까? 삭제된 평가는 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await EvaluationService.deleteEvaluation(db, evaluationId);
              await loadEvaluations();
              Alert.alert('성공', '평가가 삭제되었습니다.');
            } catch (error) {
              console.error('평가 삭제 오류:', error);
              Alert.alert('오류', '평가 삭제에 실패했습니다.');
            }
          }
        }
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>평가 정보를 불러오는 중...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {stages.map(stage => {
        const evaluations = evaluationsByStage[stage];
        const averageScore = calculateAverageScore(evaluations);
        const isExpanded = expandedStage === stage;

        return (
          <View key={stage} style={styles.stageCard}>
            {/* 헤더 */}
            <TouchableOpacity
              style={styles.stageHeader}
              onPress={() => setExpandedStage(isExpanded ? null : stage)}
            >
              <View style={styles.stageHeaderLeft}>
                <Ionicons name={getStageIcon(stage)} size={24} color="#3B82F6" />
                <View style={styles.stageHeaderText}>
                  <Text style={styles.stageTitle}>{stage}</Text>
                  <Text style={styles.evaluationCount}>
                    {evaluations.length}건의 평가
                  </Text>
                </View>
              </View>
              <View style={styles.stageHeaderRight}>
                {evaluations.length > 0 && (
                  <View style={styles.averageScoreContainer}>
                    <Text
                      style={[
                        styles.averageScore,
                        { color: getScoreColor(averageScore) }
                      ]}
                    >
                      {averageScore.toFixed(1)}
                    </Text>
                  </View>
                )}
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={24}
                  color="#9CA3AF"
                />
              </View>
            </TouchableOpacity>

            {/* 평가 추가 버튼 */}
            {isExpanded && onAddEvaluation && (
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => onAddEvaluation(stage)}
              >
                <Ionicons name="add-circle-outline" size={20} color="#3B82F6" />
                <Text style={styles.addButtonText}>평가 추가</Text>
              </TouchableOpacity>
            )}

            {/* 평가 목록 */}
            {isExpanded && (
              <View style={styles.evaluationList}>
                {evaluations.length === 0 ? (
                  <Text style={styles.emptyText}>아직 평가가 없습니다.</Text>
                ) : (
                  evaluations.map(evaluation => {
                    const isDetailExpanded = expandedEvaluation === evaluation.id;
                    const criteria = criteriaMap[evaluation.criteriaTemplateId];
                    
                    return (
                      <View key={evaluation.id} style={styles.evaluationItem}>
                        {/* 평가 헤더 - 터치하면 상세 정보 토글 */}
                        <TouchableOpacity
                          style={styles.evaluationHeader}
                          onPress={() => setExpandedEvaluation(isDetailExpanded ? null : evaluation.id)}
                        >
                          <View style={styles.evaluationHeaderLeft}>
                            {/* 평가자 아바타 */}
                            <View style={styles.evaluatorAvatar}>
                              <Text style={styles.evaluatorAvatarText}>
                                {evaluation.evaluatorName?.charAt(0) || '?'}
                              </Text>
                            </View>
                            <View style={styles.evaluatorInfo}>
                              <Text style={styles.evaluatorName}>
                                {evaluation.evaluatorName}
                              </Text>
                              <Text style={styles.evaluationDate}>
                                {formatDate(evaluation.evaluationDate)}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.evaluationHeaderRight}>
                            <Text
                              style={[
                                styles.evaluationScore,
                                { color: getScoreColor(evaluation.totalScore) }
                              ]}
                            >
                              {evaluation.totalScore.toFixed(1)}점
                            </Text>
                            <Ionicons
                              name={isDetailExpanded ? 'chevron-up' : 'chevron-down'}
                              size={20}
                              color="#9CA3AF"
                            />
                          </View>
                        </TouchableOpacity>

                        {/* 평가 상세 정보 */}
                        {isDetailExpanded && criteria && (
                          <View style={styles.evaluationDetail}>
                            {/* 세부 점수 */}
                            <Text style={styles.detailSectionTitle}>세부 점수</Text>
                            {criteria.criteria
                              .sort((a, b) => a.order - b.order)
                              .map(criteriaItem => {
                                const scoreData = evaluation.scores[criteriaItem.id];
                                if (!scoreData) return null;
                                
                                const percentage = (scoreData.score / scoreData.maxScore) * 100;
                                const criteriaFeedback = evaluation.criteriaFeedback?.[criteriaItem.id];
                                
                                return (
                                  <View key={criteriaItem.id} style={styles.criteriaItem}>
                                    <View style={styles.criteriaHeader}>
                                      <Text style={styles.criteriaName}>{criteriaItem.name}</Text>
                                      <Text
                                        style={[
                                          styles.criteriaScore,
                                          { color: getScoreColor(scoreData.score) }
                                        ]}
                                      >
                                        {scoreData.score.toFixed(1)}점
                                      </Text>
                                    </View>
                                    
                                    {/* 점수 바 */}
                                    <View style={styles.progressBarContainer}>
                                      <View
                                        style={[
                                          styles.progressBar,
                                          {
                                            width: `${percentage}%`,
                                            backgroundColor: getScoreColor(scoreData.score)
                                          }
                                        ]}
                                      />
                                    </View>
                                    
                                    {/* 기준별 피드백 */}
                                    {criteriaFeedback && (
                                      <View style={styles.criteriaFeedback}>
                                        <Text style={styles.criteriaFeedbackLabel}>💬 평가 의견</Text>
                                        <Text style={styles.criteriaFeedbackText}>{criteriaFeedback}</Text>
                                      </View>
                                    )}
                                  </View>
                                );
                              })}
                            
                            {/* 전체 평가 */}
                            {evaluation.feedback && (
                              <View style={styles.overallFeedback}>
                                <Text style={styles.overallFeedbackLabel}>💭 전체 평가</Text>
                                <Text style={styles.overallFeedbackText}>{evaluation.feedback}</Text>
                              </View>
                            )}
                            
                            {/* 삭제 버튼 */}
                            <TouchableOpacity
                              style={styles.deleteButton}
                              onPress={() => handleDeleteEvaluation(evaluation.id, stage)}
                            >
                              <Ionicons name="trash-outline" size={18} color="#EF4444" />
                              <Text style={styles.deleteButtonText}>삭제</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6B7280'
  },
  stageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 0,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  stageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12
  },
  stageHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  stageHeaderText: {
    marginLeft: 12,
    flex: 1
  },
  stageTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4
  },
  evaluationCount: {
    fontSize: 12,
    color: '#6B7280'
  },
  stageHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  averageScoreContainer: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 8
  },
  averageScore: {
    fontSize: 18,
    fontWeight: '700'
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderStyle: 'dashed'
  },
  addButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6'
  },
  evaluationList: {
    paddingHorizontal: 12,
    paddingBottom: 12
  },
  emptyText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 14,
    paddingVertical: 20
  },
  evaluationItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },
  evaluationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  evaluationHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  evaluationHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  evaluatorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center'
  },
  evaluatorAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600'
  },
  evaluatorInfo: {
    marginLeft: 12,
    flex: 1
  },
  evaluatorName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2
  },
  evaluationDate: {
    fontSize: 12,
    color: '#6B7280'
  },
  evaluationScore: {
    fontSize: 18,
    fontWeight: '700'
  },
  evaluationDetail: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB'
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12
  },
  criteriaItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8
  },
  criteriaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  criteriaName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    flex: 1
  },
  criteriaScore: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 8
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8
  },
  progressBar: {
    height: '100%',
    borderRadius: 3
  },
  criteriaFeedback: {
    marginTop: 8,
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
    borderRadius: 6
  },
  criteriaFeedbackLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3B82F6',
    marginBottom: 4
  },
  criteriaFeedbackText: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18
  },
  overallFeedback: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  overallFeedbackLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 6
  },
  overallFeedbackText: {
    fontSize: 13,
    color: '#1E3A8A',
    lineHeight: 18
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA'
  },
  deleteButtonText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444'
  }
});
