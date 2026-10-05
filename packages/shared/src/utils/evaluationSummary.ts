/**
 * 지원자 평가 요약(users/{uid}.evaluationSummary) 계산 — 앱(shared EvaluationService)·MCP 서버 공용
 *
 * - 한 사람의 평가 전부를 받아 요약을 처음부터 다시 만든다. 평가가 지워진 단계는 결과에서 빠진다.
 *   (저장할 때 merge 하지 말고 필드를 통째로 바꿔야 지운 단계가 남지 않는다)
 * - 어떤 평가를 셀지: 확정 여부(isFinalized)와 관계없이 그 사람의 평가 전부 (기존 앱·MCP 계산과 동일).
 *   단계별 평균은 4단계(서류 전형·면접 전형·대면 교육·캠프 생활)로 묶고, totalEvaluations 는 전체 평가 수.
 * - 시각 값(evaluationDate·now)은 그대로 넣는다 — firebase / firebase-admin Timestamp 어느 쪽이든 seconds 만 본다.
 */
import type { EvaluationStage, EvaluationStageSummary, UserEvaluationSummary } from '../types/evaluation';

export type EvaluationSummaryStageKey = 'documentReview' | 'interview' | 'faceToFaceEducation' | 'campLife';

/** 요약 단계 키 ↔ 평가 단계 이름 (화면·공유 링크가 이 키로 읽는다) */
export const EVALUATION_SUMMARY_STAGES: ReadonlyArray<readonly [EvaluationSummaryStageKey, EvaluationStage]> = [
  ['documentReview', '서류 전형'],
  ['interview', '면접 전형'],
  ['faceToFaceEducation', '대면 교육'],
  ['campLife', '캠프 생활'],
];

/** 계산에 필요한 평가 필드만 — Firestore 에서 읽은 문서를 그대로 넘겨도 된다 */
export interface EvaluationSummarySource<T extends { seconds: number } = { seconds: number }> {
  id: string;
  evaluationStage?: string;
  totalScore?: number;
  evaluationDate?: T | null;
}

const scoreOf = (e: EvaluationSummarySource<{ seconds: number }>) => {
  const n = Number(e.totalScore ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * 평가 목록 → users.evaluationSummary 값. 평가가 하나도 없으면 null (→ 필드를 지운다).
 * @param now lastUpdatedAt 으로 넣을 시각 (평가 일시가 없는 단계의 lastEvaluatedAt 에도 쓴다)
 */
export function computeEvaluationSummary<T extends { seconds: number }>(
  evaluations: ReadonlyArray<EvaluationSummarySource<T>>,
  now: T
): UserEvaluationSummary<T> | null {
  if (evaluations.length === 0) return null;

  const summary: UserEvaluationSummary<T> = {
    overallAverage: 0,
    totalEvaluations: evaluations.length,
    lastUpdatedAt: now,
  };

  let totalScoreSum = 0;
  let totalCount = 0;
  for (const [key, stage] of EVALUATION_SUMMARY_STAGES) {
    const list = evaluations.filter((e) => e.evaluationStage === stage);
    if (list.length === 0) continue;
    // 최근 평가 순 (평가 일시 없는 건 맨 뒤)
    const sorted = [...list].sort((a, b) => (b.evaluationDate?.seconds ?? 0) - (a.evaluationDate?.seconds ?? 0));
    const scores = sorted.map(scoreOf);
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const stageSummary: EvaluationStageSummary<T> = {
      averageScore: average,
      totalEvaluations: list.length,
      highestScore: Math.max(...scores),
      lowestScore: Math.min(...scores),
      lastEvaluatedAt: sorted[0].evaluationDate ?? now,
      evaluations: sorted.map((e) => e.id),
    };
    summary[key] = stageSummary;
    totalScoreSum += average * list.length;
    totalCount += list.length;
  }
  summary.overallAverage = totalCount > 0 ? totalScoreSum / totalCount : 0;

  return summary;
}
