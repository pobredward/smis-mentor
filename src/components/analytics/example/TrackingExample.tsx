'use client';

import { useState } from 'react';
import useAnalytics from '@/hooks/useAnalytics';
import FunnelStep from '../FunnelStep';

// 샘플 트래킹 컴포넌트 - 실제 구현 시 참고용
export function JobViewTracker({ 
  jobId, 
  jobTitle, 
  jobCategory, 
  jobLocation,
  jobType
}: { 
  jobId: string; 
  jobTitle: string; 
  jobCategory: string; 
  jobLocation: string;
  jobType: string;
}) {
  const analyticsLogger = useAnalytics();
  
  // 컴포넌트가 마운트되면 채용 공고 조회 이벤트 발생
  useState(() => {
    analyticsLogger.trackJobView(
      jobId,
      jobTitle,
      jobCategory,
      jobLocation,
      jobType
    );
  });
  
  // 실제 렌더링하는 요소 없음 (추적 전용)
  return null;
}

// 검색 결과 트래킹 예시
export function SearchResultsTracker({ 
  searchTerm, 
  resultsCount 
}: { 
  searchTerm: string; 
  resultsCount: number;
}) {
  const analyticsLogger = useAnalytics();
  
  useState(() => {
    analyticsLogger.trackSearch(
      searchTerm,
      'job_search',
      resultsCount
    );
  });
  
  return null;
}

// 지원하기 버튼 컴포넌트 예시
export function ApplyButton({ 
  jobId, 
  jobTitle,
  onClick
}: { 
  jobId: string; 
  jobTitle: string;
  onClick: () => void;
}) {
  const analyticsLogger = useAnalytics();
  
  const handleClick = () => {
    // 지원 시작 이벤트 트래킹
    analyticsLogger.trackFunnelStart('job_application', {
      job_id: jobId,
      job_title: jobTitle,
    });
    
    // 실제 클릭 핸들러 호출
    onClick();
  };
  
  return (
    <button
      onClick={handleClick}
      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition duration-200"
    >
      지원하기
    </button>
  );
}

// 멀티 스텝 폼 예시
export function ApplicationForm({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const [step, setStep] = useState(1);
  const [isStepComplete, setIsStepComplete] = useState(false);
  
  const metadata = {
    job_id: jobId,
    job_title: jobTitle
  };
  
  const handleNextStep = () => {
    setIsStepComplete(true);
    
    // 다음 단계로 이동하기 전 약간의 지연을 주어서 이벤트가 기록될 시간을 줌
    setTimeout(() => {
      setStep(prev => prev + 1);
      setIsStepComplete(false);
    }, 100);
  };
  
  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <FunnelStep
            funnelName="job_application"
            stepNumber={1}
            stepName="personal_info"
            isStart={true}
            isComplete={isStepComplete}
            metadata={metadata}
          >
            <div className="space-y-4">
              <h2 className="text-xl font-bold">개인 정보</h2>
              <p>지원서 1단계 - 개인 정보 입력</p>
              <button 
                onClick={handleNextStep}
                className="bg-blue-600 text-white px-4 py-2 rounded"
              >
                다음 단계
              </button>
            </div>
          </FunnelStep>
        );
      
      case 2:
        return (
          <FunnelStep
            funnelName="job_application"
            stepNumber={2}
            stepName="education"
            isComplete={isStepComplete}
            metadata={metadata}
          >
            <div className="space-y-4">
              <h2 className="text-xl font-bold">학력 정보</h2>
              <p>지원서 2단계 - 학력 정보 입력</p>
              <button 
                onClick={handleNextStep}
                className="bg-blue-600 text-white px-4 py-2 rounded"
              >
                다음 단계
              </button>
            </div>
          </FunnelStep>
        );
        
      case 3:
        return (
          <FunnelStep
            funnelName="job_application"
            stepNumber={3}
            stepName="submit"
            isLastStep={true}
            isComplete={isStepComplete}
            metadata={metadata}
          >
            <div className="space-y-4">
              <h2 className="text-xl font-bold">지원서 제출</h2>
              <p>지원서 3단계 - 최종 제출</p>
              <button 
                onClick={() => {
                  setIsStepComplete(true);
                  // 여기서 실제 지원서 제출 API 호출
                }}
                className="bg-green-600 text-white px-4 py-2 rounded"
              >
                지원서 제출하기
              </button>
            </div>
          </FunnelStep>
        );
        
      default:
        return (
          <div className="text-center py-8">
            <h2 className="text-2xl font-bold text-green-600">지원 완료!</h2>
            <p>성공적으로 지원이 완료되었습니다.</p>
          </div>
        );
    }
  };
  
  return <div className="max-w-md mx-auto p-6 bg-white rounded shadow">{renderStep()}</div>;
} 