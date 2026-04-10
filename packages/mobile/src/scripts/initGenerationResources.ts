import { logger } from '@smis-mentor/shared';
/**
 * Firestore generationResources 초기 데이터 생성 스크립트
 * 
 * 사용법:
 * 1. Firebase Console에서 Firestore로 이동
 * 2. generationResources 컬렉션 생성
 * 3. 아래 데이터를 기반으로 문서 추가
 * 
 * 또는 Firebase Admin SDK를 사용하여 직접 실행
 */

import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

interface ResourceLink {
  id: string;
  title: string;
  url: string;
  createdAt: Timestamp;
  createdBy: string;
}

interface GenerationResources {
  jobCodeId: string;
  generation: string;
  code: string;
  educationLinks: ResourceLink[];
  scheduleLinks: ResourceLink[];
  guideLinks: ResourceLink[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// E27 기수 초기 데이터 (예시)
const e27InitialData: GenerationResources = {
  jobCodeId: 'OWEDDXiynrqgB2fPrgEC', // 실제 jobCodes의 문서 ID로 변경
  generation: '27기',
  code: 'E27',
  
  educationLinks: [
    // 교육 링크는 구글 시트가 없으므로 빈 배열 유지
    // 필요 시 여기에 링크 추가
  ],
  
  scheduleLinks: [
    {
      id: 'schedule-0125-e27',
      title: '01/25(월)',
      url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTeqDQfBdSUJ-3guJ7hWb0OKZg5Ro50um1zJXU_TRHmehTZIeUGmAM6wUb1CMiK4Cg_3EEGZLTrNU-y/pubhtml?gid=1788057941&single=true',
      createdAt: Timestamp.now(),
      createdBy: 'system',
    },
    {
      id: 'schedule-0212-e27',
      title: '02/12(금)',
      url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTeqDQfBdSUJ-3guJ7hWb0OKZg5Ro50um1zJXU_TRHmehTZIeUGmAM6wUb1CMiK4Cg_3EEGZLTrNU-y/pubhtml?gid=152149893&single=true',
      createdAt: Timestamp.now(),
      createdBy: 'system',
    },
    {
      id: 'schedule-regular-e27',
      title: '정규',
      url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTeqDQfBdSUJ-3guJ7hWb0OKZg5Ro50um1zJXU_TRHmehTZIeUGmAM6wUb1CMiK4Cg_3EEGZLTrNU-y/pubhtml?gid=114378486&single=true',
      createdAt: Timestamp.now(),
      createdBy: 'system',
    },
    {
      id: 'schedule-steam-e27',
      title: '스팀',
      url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTeqDQfBdSUJ-3guJ7hWb0OKZg5Ro50um1zJXU_TRHmehTZIeUGmAM6wUb1CMiK4Cg_3EEGZLTrNU-y/pubhtml?gid=1156954632&single=true',
      createdAt: Timestamp.now(),
      createdBy: 'system',
    },
  ],
  
  guideLinks: [
    {
      id: 'guide-0125-in-e27',
      title: '01/25 입소',
      url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTeqDQfBdSUJ-3guJ7hWb0OKZg5Ro50um1zJXU_TRHmehTZIeUGmAM6wUb1CMiK4Cg_3EEGZLTrNU-y/pubhtml?gid=1090825291&single=true',
      createdAt: Timestamp.now(),
      createdBy: 'system',
    },
    {
      id: 'guide-0213-out-e27',
      title: '02/13 퇴소',
      url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTeqDQfBdSUJ-3guJ7hWb0OKZg5Ro50um1zJXU_TRHmehTZIeUGmAM6wUb1CMiK4Cg_3EEGZLTrNU-y/pubhtml?gid=745751166&single=true',
      createdAt: Timestamp.now(),
      createdBy: 'system',
    },
    {
      id: 'guide-0213-vehicle-e27',
      title: '02/13 퇴소(차량)',
      url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTeqDQfBdSUJ-3guJ7hWb0OKZg5Ro50um1zJXU_TRHmehTZIeUGmAM6wUb1CMiK4Cg_3EEGZLTrNU-y/pubhtml?gid=2016129489&single=true',
      createdAt: Timestamp.now(),
      createdBy: 'system',
    },
  ],
  
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
};

/**
 * Firestore에 초기 데이터 생성
 */
export const createInitialGenerationResources = async () => {
  try {
    // jobCodeId를 문서 ID로 사용
    const docRef = doc(db, 'generationResources', e27InitialData.jobCodeId);
    await setDoc(docRef, e27InitialData);
    logger.info('✅ E27 기수 리소스 초기 데이터 생성 완료');
    return true;
  } catch (error) {
    logger.error('❌ 초기 데이터 생성 실패:', error);
    throw error;
  }
};

/**
 * JSON 형식으로 출력 (Firebase Console에서 직접 붙여넣기용)
 */
export const getInitialDataJSON = () => {
  return JSON.stringify(e27InitialData, null, 2);
};

// 스크립트 직접 실행 시
if (require.main === module) {
  createInitialGenerationResources()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
