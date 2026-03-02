'use client';

import { useEffect } from 'react';
import useAnalytics from '@/hooks/useAnalytics';

interface FunnelStepProps {
  funnelName: string;
  stepNumber: number;
  stepName: string;
  isComplete?: boolean;
  isStart?: boolean;
  isLastStep?: boolean;
  metadata?: Record<string, unknown>;
  children: React.ReactNode;
}

/**
 * 퍼널 스텝을 분석하기 위한 컴포넌트
 * 폼 단계 또는 사용자 여정의 각 단계를 추적하는 데 사용
 * 
 * 사용 예:
 * <FunnelStep 
 *   funnelName="job_application"
 *   stepNumber={1} 
 *   stepName="personal_info"
 *   metadata={{ jobId: '123', jobTitle: '영어 멘토' }}
 * >
 *   <PersonalInfoForm />
 * </FunnelStep>
 */
export default function FunnelStep({
  funnelName,
  stepNumber,
  stepName,
  isComplete = false,
  isStart = false,
  isLastStep = false,
  metadata = {},
  children
}: FunnelStepProps) {
  const analyticsLogger = useAnalytics();

  useEffect(() => {
    // 단계 진입 시 이벤트 기록
    if (isStart) {
      // 퍼널 시작 이벤트
      analyticsLogger.trackFunnelStart(funnelName, {
        initial_step: stepName,
        ...metadata
      });
    } 
    
    // 단계 도달 이벤트 로깅
    analyticsLogger.trackFunnelStep(
      funnelName,
      stepNumber,
      stepName,
      {
        ...metadata
      }
    );

    // 컴포넌트 언마운트 시, 단계 완료 여부 확인
    return () => {
      if (isComplete) {
        // 현재 단계 완료 이벤트 로깅
        analyticsLogger.trackFunnelStep(
          funnelName,
          stepNumber,
          stepName,
          {
            status: 'completed',
            ...metadata
          }
        );
        
        // 마지막 단계인 경우 퍼널 완료 이벤트 로깅
        if (isLastStep) {
          analyticsLogger.trackFunnelComplete(funnelName, {
            total_steps: stepNumber,
            ...metadata
          });
        }
      }
    };
  }, [
    analyticsLogger, 
    funnelName, 
    stepNumber, 
    stepName, 
    isComplete, 
    isStart, 
    isLastStep, 
    metadata
  ]);

  return <>{children}</>;
} 