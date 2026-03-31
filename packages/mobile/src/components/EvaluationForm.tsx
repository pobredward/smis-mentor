import React, { useState, useEffect } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  EvaluationStage,
  EvaluationCriteria,
  EvaluationFormData,
  EvaluationCriteriaService,
  EvaluationService,
  getScoreColor
} from '@smis-mentor/shared';
import { db } from '../config/firebase';

interface Props {
  targetUserId: string;
  targetUserName: string;
  evaluatorId: string;
  evaluatorName: string;
  evaluationStage: EvaluationStage;
  refApplicationId?: string;
  refJobBoardId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function EvaluationForm({
  targetUserId,
  targetUserName,
  evaluatorId,
  evaluatorName,
  evaluationStage,
  refApplicationId,
  refJobBoardId,
  onSuccess,
  onCancel
}: Props) {
  const [formData, setFormData] = useState<EvaluationFormData>({
    evaluationStage,
    criteriaTemplateId: '',
    targetUserId,
    targetUserName,
    refApplicationId,
    refJobBoardId,
    scores: {},
    overallFeedback: '',
    evaluatorName
  });

  const [selectedCriteria, setSelectedCriteria] = useState<EvaluationCriteria | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadCriteriaTemplate();
  }, []);

  const loadCriteriaTemplate = async () => {
    try {
      setIsLoading(true);
      const criteria = await EvaluationCriteriaService.getDefaultCriteria(db, evaluationStage);
      
      if (criteria) {
        setSelectedCriteria(criteria);
        setFormData(prev => ({
          ...prev,
          criteriaTemplateId: criteria.id
        }));
      } else {
        Alert.alert('오류', '평가 기준을 찾을 수 없습니다.');
      }
    } catch (error) {
      logger.error('평가 기준 로드 오류:', error);
      Alert.alert('오류', '평가 기준을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleScoreChange = (criteriaId: string, score: number) => {
    setFormData(prev => ({
      ...prev,
      scores: {
        ...prev.scores,
        [criteriaId]: {
          score,
          comment: prev.scores[criteriaId]?.comment || ''
        }
      }
    }));
  };

  const handleCommentChange = (criteriaId: string, comment: string) => {
    setFormData(prev => ({
      ...prev,
      scores: {
        ...prev.scores,
        [criteriaId]: {
          score: prev.scores[criteriaId]?.score || 0,
          comment
        }
      }
    }));
  };

  const handleSubmit = async () => {
    if (!selectedCriteria) {
      Alert.alert('오류', '평가 기준을 선택해주세요.');
      return;
    }

    // 평가자 이름 확인
    if (!formData.evaluatorName.trim()) {
      Alert.alert('오류', '평가자 이름을 입력해주세요.');
      return;
    }

    // 모든 항목에 점수가 입력되었는지 확인
    const missingScores = selectedCriteria.criteria.filter(
      criteria => !formData.scores[criteria.id]?.score
    );

    if (missingScores.length > 0) {
      Alert.alert(
        '점수 미입력',
        `다음 항목의 점수를 입력해주세요:\n${missingScores.map(c => c.name).join(', ')}`
      );
      return;
    }

    try {
      setIsSubmitting(true);
      await EvaluationService.createEvaluation(
        db,
        formData,
        evaluatorId,
        evaluatorName,
        '관리자'
      );
      
      Alert.alert('성공', '평가가 성공적으로 저장되었습니다.', [
        { text: '확인', onPress: onSuccess }
      ]);
    } catch (error) {
      logger.error('평가 저장 오류:', error);
      Alert.alert('오류', '평가 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>평가 기준을 불러오는 중...</Text>
      </View>
    );
  }

  if (!selectedCriteria) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={48} color="#EF4444" />
        <Text style={styles.errorText}>평가 기준을 불러올 수 없습니다.</Text>
        <TouchableOpacity style={styles.button} onPress={onCancel}>
          <Text style={styles.buttonText}>닫기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{evaluationStage} 평가</Text>
          <Text style={styles.headerSubtitle}>대상: {targetUserName}</Text>
        </View>
        <TouchableOpacity onPress={onCancel}>
          <Ionicons name="close" size={28} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 평가자 이름 입력 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>평가자 이름 *</Text>
          <TextInput
            style={styles.evaluatorInput}
            placeholder="평가자 이름을 입력하세요"
            placeholderTextColor="#9CA3AF"
            value={formData.evaluatorName}
            onChangeText={(text) =>
              setFormData(prev => ({ ...prev, evaluatorName: text }))
            }
          />
        </View>

        {/* 평가 항목 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>평가 항목</Text>
          {selectedCriteria.criteria.map(criterion => {
            const currentScore = formData.scores[criterion.id]?.score || 0;
            
            return (
              <View key={criterion.id} style={styles.criteriaItem}>
                <View style={styles.criteriaHeader}>
                  <Text style={styles.criteriaName}>{criterion.name}</Text>
                  <Text
                    style={[
                      styles.currentScore,
                      { color: getScoreColor(currentScore) }
                    ]}
                  >
                    {currentScore.toFixed(1)}점
                  </Text>
                </View>
                <Text style={styles.criteriaDescription}>
                  {criterion.description}
                </Text>
                
                {/* 점수 선택 버튼 */}
                <View style={styles.scoreButtons}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(score => (
                    <TouchableOpacity
                      key={score}
                      style={[
                        styles.scoreButton,
                        currentScore === score && styles.scoreButtonSelected,
                        currentScore === score && {
                          backgroundColor: getScoreColor(score),
                          borderColor: getScoreColor(score)
                        }
                      ]}
                      onPress={() => handleScoreChange(criterion.id, score)}
                    >
                      <Text
                        style={[
                          styles.scoreButtonText,
                          currentScore === score && styles.scoreButtonTextSelected
                        ]}
                      >
                        {score}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 항목별 코멘트 */}
                <TextInput
                  style={styles.commentInput}
                  placeholder="항목별 코멘트 (선택사항)"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={2}
                  value={formData.scores[criterion.id]?.comment || ''}
                  onChangeText={(text) => handleCommentChange(criterion.id, text)}
                />
              </View>
            );
          })}
        </View>

        {/* 종합 피드백 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>종합 피드백 (선택사항)</Text>
          <TextInput
            style={styles.feedbackInput}
            placeholder="종합적인 평가 의견을 입력해주세요"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
            value={formData.overallFeedback}
            onChangeText={(text) =>
              setFormData(prev => ({ ...prev, overallFeedback: text }))
            }
          />
        </View>
      </ScrollView>

      {/* 버튼 */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, styles.cancelButton]}
          onPress={onCancel}
          disabled={isSubmitting}
        >
          <Text style={styles.cancelButtonText}>취소</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.submitButton]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>평가 저장</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF'
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6B7280'
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24
  },
  errorText: {
    marginTop: 16,
    marginBottom: 24,
    fontSize: 16,
    color: '#374151',
    textAlign: 'center'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB'
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280'
  },
  content: {
    flex: 1,
    paddingHorizontal: 20
  },
  section: {
    marginVertical: 20
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16
  },
  criteriaItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16
  },
  criteriaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  criteriaName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1
  },
  currentScore: {
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 12
  },
  criteriaDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 18
  },
  scoreButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12
  },
  scoreButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center'
  },
  scoreButtonSelected: {
    borderWidth: 2
  },
  scoreButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280'
  },
  scoreButtonTextSelected: {
    color: '#FFFFFF'
  },
  commentInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    padding: 12,
    fontSize: 14,
    color: '#111827',
    minHeight: 60,
    textAlignVertical: 'top'
  },
  feedbackInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    padding: 16,
    fontSize: 14,
    color: '#111827',
    minHeight: 120,
    textAlignVertical: 'top'
  },
  evaluatorInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    padding: 16,
    fontSize: 16,
    color: '#111827',
    fontWeight: '500'
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB'
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280'
  },
  submitButton: {
    backgroundColor: '#3B82F6'
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF'
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF'
  }
});
