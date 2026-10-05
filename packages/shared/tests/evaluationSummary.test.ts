import { describe, it, expect } from './_expect';
import { computeEvaluationSummary, type EvaluationSummarySource } from '../src/utils/evaluationSummary';

// Timestamp 대신 seconds 만 가진 값 (firebase / firebase-admin 어느 쪽이든 seconds 만 본다)
const ts = (seconds: number) => ({ seconds });
const NOW = ts(9999);
const ev = (id: string, evaluationStage: string, totalScore: number, seconds?: number): EvaluationSummarySource<{ seconds: number }> => ({
  id,
  evaluationStage,
  totalScore,
  ...(seconds !== undefined ? { evaluationDate: ts(seconds) } : {}),
});

describe('평가 요약 계산 (users.evaluationSummary)', () => {
  it('평가가 없으면 null (→ 필드 삭제)', () => {
    expect(computeEvaluationSummary([], NOW)).toBeNull();
  });

  it('단계별 평균·최고·최저·횟수·최근 평가 순 ID', () => {
    const s = computeEvaluationSummary(
      [ev('a', '서류 전형', 8, 100), ev('b', '서류 전형', 6, 300), ev('c', '서류 전형', 7, 200), ev('d', '면접 전형', 9, 50)],
      NOW
    );
    expect(s?.documentReview).toEqual({
      averageScore: 7,
      totalEvaluations: 3,
      highestScore: 8,
      lowestScore: 6,
      lastEvaluatedAt: ts(300),
      evaluations: ['b', 'c', 'a'],
    });
    expect(s?.interview).toEqual({
      averageScore: 9,
      totalEvaluations: 1,
      highestScore: 9,
      lowestScore: 9,
      lastEvaluatedAt: ts(50),
      evaluations: ['d'],
    });
    expect(s?.lastUpdatedAt).toEqual(NOW);
  });

  it('전체 평균은 평가 개수로 가중 (단계 평균의 단순 평균이 아님)', () => {
    const s = computeEvaluationSummary(
      [ev('a', '서류 전형', 6, 1), ev('b', '서류 전형', 8, 2), ev('c', '서류 전형', 10, 3), ev('d', '캠프 생활', 4, 4)],
      NOW
    );
    // (6+8+10+4) / 4 = 7  (단계 평균 8 과 4 의 단순 평균 6 이 아님)
    expect(s?.overallAverage).toBe(7);
    expect(s?.totalEvaluations).toBe(4);
    expect(s?.campLife?.averageScore).toBe(4);
  });

  it('평가를 다 지운 단계는 결과에 키 자체가 없다', () => {
    const before = computeEvaluationSummary([ev('a', '서류 전형', 8, 1), ev('b', '면접 전형', 6, 2)], NOW);
    expect(Object.keys(before ?? {}).includes('interview')).toBe(true);
    const after = computeEvaluationSummary([ev('a', '서류 전형', 8, 1)], NOW);
    expect(Object.keys(after ?? {}).sort()).toEqual(['documentReview', 'lastUpdatedAt', 'overallAverage', 'totalEvaluations']);
    expect(after?.overallAverage).toBe(8);
    expect(after?.totalEvaluations).toBe(1);
  });

  it('undefined 값을 넣지 않는다 (Firestore 저장 가능) · 평가 일시가 없으면 now', () => {
    const s = computeEvaluationSummary([ev('a', '대면 교육', 5)], NOW);
    expect(s?.faceToFaceEducation?.lastEvaluatedAt).toEqual(NOW);
    expect(Object.values(s ?? {}).some((v) => v === undefined)).toBe(false);
    expect(s?.documentReview).toBeUndefined();
  });

  it('4단계 밖의 평가는 단계·전체 평균에서 빠지고 총 횟수에만 든다 (기존 계산과 동일)', () => {
    const s = computeEvaluationSummary([ev('a', '서류 전형', 8, 1), ev('x', '기타', 2, 2)], NOW);
    expect(s?.totalEvaluations).toBe(2);
    expect(s?.overallAverage).toBe(8);
  });
});
