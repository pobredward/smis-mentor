# 📊 새로운 평가 시스템 개편 가이드

## 🎯 개요

기존의 단순한 서술형 피드백 시스템을 **다중 평가자 점수 시스템**으로 개편하여, 체계적이고 정량적인 평가가 가능하도록 개선했습니다.

## 🔄 기존 시스템 vs 새 시스템

### 기존 시스템
- ❌ 단순 서술형 피드백만 지원 (`interviewFeedback` 필드)
- ❌ 다중 평가자 시스템 부재
- ❌ 정량적 평가 불가능
- ❌ 평가 항목별 세분화 불가

### 새 시스템
- ✅ **다중 평가자** 점수 시스템
- ✅ **평가 항목별** 세분화된 점수
- ✅ **평가 유형별** 다른 기준 (면접/교육/업무완료)
- ✅ **가중치** 적용 가능
- ✅ **평균 점수** 자동 계산
- ✅ **서술형 피드백** + **정량적 점수** 병행
- ✅ 기존 시스템과의 **하위 호환성** 유지

## 🗂️ 데이터베이스 구조

### 1. `evaluations` 컬렉션 (신규)
```typescript
interface Evaluation {
  id: string;
  refUserId: string;           // 평가 대상자
  refApplicationId?: string;   // 지원 내역 (면접용)
  evaluationType: 'interview' | 'training' | 'work_completion';
  evaluationStage: string;     // '면접', '1차교육', '업무완료' 등
  evaluatorId: string;         // 평가자
  evaluatorName: string;
  
  scores: {                    // 항목별 점수
    [criteriaId: string]: {
      score: number;           // 1-10 점수
      weight: number;          // 가중치
      maxScore: number;        // 최대 점수
    }
  };
  
  totalScore: number;          // 가중 평균 점수
  feedback: string;            // 종합 피드백
  criteriaFeedback?: {         // 항목별 피드백
    [criteriaId: string]: string;
  };
  
  // ... 기타 메타데이터
}
```

### 2. `evaluationCriteria` 컬렉션 (신규)
```typescript
interface EvaluationCriteria {
  id: string;
  type: 'interview' | 'training' | 'work_completion';
  stage: string;
  name: string;                // 템플릿 이름
  criteria: {                  // 평가 항목들
    id: string;
    name: string;              // '의사소통능력', '기술역량' 등
    description: string;
    weight: number;            // 가중치
    maxScore: number;
    order: number;
  }[];
  isActive: boolean;
  isDefault: boolean;
}
```

### 3. `users` 컬렉션 (기존 + 추가)
```typescript
// 기존 User 인터페이스에 추가된 필드
interface User {
  // ... 기존 필드들
  
  evaluationSummary?: {        // 평가 요약 정보
    interview?: {
      averageScore: number;
      totalEvaluations: number;
      highestScore: number;
      lowestScore: number;
      lastEvaluatedAt: Timestamp;
    };
    training?: { /* 동일 구조 */ };
    workCompletion?: { /* 동일 구조 */ };
    overallAverage: number;
    totalEvaluations: number;
    lastUpdatedAt: Timestamp;
  };
}
```

## 🏗️ 구현된 기능

### 1. 평가 작성 시스템
- **EvaluationForm 컴포넌트**: 체계적인 평가 작성 폼
- 평가 유형별 다른 기준 적용
- 항목별 점수 + 코멘트 입력
- 가중치 자동 계산

### 2. 평가 조회 및 표시
- **EvaluationList 컴포넌트**: 평가 내역 목록
- **EvaluationSummary 컴포넌트**: 평가 요약 정보
- 점수별 색상 구분 (A+ ~ D 등급)
- 상세보기 토글 기능

### 3. 관리자 인터페이스 개편
#### `/admin/job-board-manage/applicants/[id]` (면접 관리)
- 기존 피드백 시스템 유지 (하위 호환성)
- **새로운 평가 점수 시스템** 추가
- 평가 작성 버튼 및 모달
- 지원자별 평가 요약 표시

#### `/admin/user-manage` (사용자 관리)
- 사용자 목록에 **평가 점수 요약** 표시
- 사용자 상세 정보에 **평가 내역** 추가
- 기존 관리자 피드백과 구분

## 📋 기본 평가 기준

### 면접 평가
1. **의사소통 능력** (25%) - 질문 이해도, 답변의 명확성, 표현력
2. **태도 및 자세** (20%) - 면접 태도, 적극성, 예의
3. **업무 역량** (30%) - 관련 경험, 기술적 이해도, 학습 의지
4. **조직 적합성** (25%) - 팀워크, 조직 문화 적응도, 가치관

### 1차 교육 평가
1. **이해도** (30%) - 교육 내용의 이해 정도
2. **참여도** (25%) - 교육 참여 적극성, 질문 및 토론
3. **실습 수행** (30%) - 실습 과제 완성도, 적용 능력
4. **학습 태도** (15%) - 피드백 수용, 개선 의지

### 업무 완료 평가
1. **업무 품질** (35%) - 결과물의 완성도, 정확성
2. **일정 준수** (20%) - 납기 준수, 시간 관리
3. **협업 능력** (20%) - 팀원과의 소통, 협력
4. **주도성** (15%) - 문제 해결 능력, 적극성
5. **성장 가능성** (10%) - 학습 능력, 발전 가능성

## 🚀 설치 및 초기 설정

### 1. 기본 평가 기준 생성
```typescript
import { initializeDefaultEvaluationCriteria } from '@/scripts/initEvaluationCriteria';

// 브라우저 콘솔에서 실행
await initializeDefaultEvaluationCriteria();
```

### 2. 필요한 컴포넌트 import
```typescript
import EvaluationForm from '@/components/evaluation/EvaluationForm';
import EvaluationList from '@/components/evaluation/EvaluationList';
import EvaluationSummary, { EvaluationSummaryCompact } from '@/components/evaluation/EvaluationSummary';
```

### 3. 서비스 함수 사용
```typescript
import { EvaluationService, EvaluationCriteriaService } from '@/lib/evaluationService';

// 평가 생성
const evaluationId = await EvaluationService.createEvaluation(formData, evaluatorId, evaluatorName);

// 사용자 평가 조회
const evaluations = await EvaluationService.getUserEvaluations(userId);

// 평가 기준 조회
const criteria = await EvaluationCriteriaService.getCriteriaByType('interview', '면접');
```

## 💡 사용 방법

### 1. 면접 평가 작성
1. `/admin/job-board-manage/applicants/[id]` 접속
2. 지원자 선택
3. "평가 작성" 버튼 클릭
4. 평가 유형 선택 (면접/교육/업무완료)
5. 각 항목별 점수 입력 (1-10점)
6. 항목별 세부 코멘트 입력 (선택사항)
7. 종합 피드백 작성
8. "평가 저장" 클릭

### 2. 평가 내역 조회
- **지원자 관리 페이지**: 각 지원자의 평가 요약 및 최근 내역
- **사용자 관리 페이지**: 전체 사용자의 평가 점수 현황
- 점수별 색상 구분으로 한눈에 파악 가능

### 3. 다중 평가자 활용
- 같은 지원자에 대해 여러 관리자가 각각 평가 가능
- 평가자별로 구분되어 저장
- 평균 점수 자동 계산

## 🔧 커스터마이징

### 1. 새로운 평가 기준 추가
```typescript
const customCriteria: EvaluationCriteria = {
  type: 'training',
  stage: '2차교육',
  name: '심화 교육 평가',
  criteria: [
    {
      id: 'advanced_skill',
      name: '심화 기술 이해도',
      description: '고급 기술에 대한 이해 및 적용 능력',
      weight: 0.4,
      maxScore: 10,
      order: 1
    },
    // ... 추가 항목들
  ],
  // ... 기타 설정
};
```

### 2. 점수 계산 로직 수정
`EvaluationService.createEvaluation()` 함수에서 점수 계산 로직을 수정할 수 있습니다.

### 3. UI 커스터마이징
각 컴포넌트는 props를 통해 표시 방식을 조정할 수 있습니다.

## ⚠️ 주의사항

1. **하위 호환성**: 기존 `interviewFeedback` 필드는 그대로 유지되므로 기존 데이터에 영향 없음
2. **권한 관리**: 평가 작성은 관리자(`admin`) 권한이 있는 사용자만 가능
3. **데이터 일관성**: 평가 생성/수정 시 사용자의 `evaluationSummary` 자동 업데이트
4. **성능 고려**: 대량의 평가 데이터가 있는 경우 페이지네이션 고려 필요

## 📈 향후 개선 계획

1. **평가 분석 대시보드** 구현
2. **평가 기준 관리 UI** 추가
3. **평가 결과 Excel 내보내기** 기능
4. **평가자별 통계** 제공
5. **평가 알림 시스템** 구축

## 🤝 기여

새로운 평가 기준이나 기능 개선 아이디어가 있다면 언제든 제안해 주세요!

---

**📅 최종 업데이트**: 2025년 1월 23일  
**🔧 개발자**: Claude & 개발팀
