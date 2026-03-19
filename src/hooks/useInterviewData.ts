/**
 * 면접 관리 커스텀 훅
 * 면접 데이터 로드 및 관리 로직을 담당합니다.
 */

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { JobBoard, ApplicationHistory, User } from '@/types';
import toast from 'react-hot-toast';

type JobBoardWithId = JobBoard & { id: string };

export type InterviewDateInfo = {
  jobBoardId: string;
  jobBoardTitle: string;
  date: Date;
  formattedDate: string;
  interviews: ApplicationWithUser[];
  recordingUrl?: string;
};

export type ApplicationWithUser = ApplicationHistory & { 
  id: string;
  user?: User;
  jobBoardTitle?: string;
  jobCode?: string;
};

export function useInterviewData() {
  const [interviewDates, setInterviewDates] = useState<InterviewDateInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDates, setLoadingDates] = useState(true);
  const [appliedCampsMap, setAppliedCampsMap] = useState<Record<string, string[]>>({});
  const [jobCodes, setJobCodes] = useState<{ code: string, count: number }[]>([]);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoadingDates(true);
      const jobBoardsRef = collection(db, 'jobBoards');
      const jobBoardsSnapshot = await getDocs(jobBoardsRef);
      
      const jobBoardsData = jobBoardsSnapshot.docs.map(doc => ({
        ...doc.data() as JobBoard,
        id: doc.id
      }));
      
      await loadInterviewDates(jobBoardsData);
    } catch (error) {
      console.error('채용 공고 로드 오류:', error);
      toast.error('채용 공고를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoadingDates(false);
      setLoading(false);
    }
  };

  const loadInterviewDates = async (jobBoardsData: JobBoardWithId[]) => {
    try {
      const interviewDateMap = new Map<string, InterviewDateInfo>();
      
      const now = new Date();
      const fiveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const fiveMonthsAgoTimestamp = Timestamp.fromDate(fiveMonthsAgo);
      
      const undefinedDateKey = 'undefined-date';
      interviewDateMap.set(undefinedDateKey, {
        jobBoardId: 'undefined',
        jobBoardTitle: '날짜 미정',
        date: new Date(),
        formattedDate: '날짜 미정',
        interviews: []
      });
      
      const applicationsRef = collection(db, 'applicationHistories');
      const q = query(
        applicationsRef, 
        where('applicationStatus', '==', 'accepted'),
        where('interviewDate', '>=', fiveMonthsAgoTimestamp)
      );
      
      const qNoDate = query(
        applicationsRef,
        where('applicationStatus', '==', 'accepted'),
        where('interviewDate', '==', null)
      );
      
      const [applicationsSnapshot, noDateSnapshot] = await Promise.all([
        getDocs(q),
        getDocs(qNoDate)
      ]);
      
      const allDocs = [...applicationsSnapshot.docs, ...noDateSnapshot.docs];
      
      const userIds = [...new Set(allDocs.map(doc => doc.data().refUserId))];
      const usersMap = new Map<string, User & { id: string }>();
      
      const batchSize = 30;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        const userPromises = batch.map(userId => 
          getDocs(query(collection(db, 'users'), where('userId', '==', userId)))
        );
        const userSnapshots = await Promise.all(userPromises);
        
        userSnapshots.forEach((snapshot, index) => {
          if (!snapshot.empty) {
            const userDoc = snapshot.docs[0];
            usersMap.set(batch[index], {
              ...userDoc.data() as User,
              id: userDoc.id
            });
          }
        });
      }
      
      const tempAppliedCampsMap: Record<string, string[]> = {};
      const codeCountMap = new Map<string, number>();
      
      for (const applicationDoc of allDocs) {
        const application = applicationDoc.data() as ApplicationHistory;
        const applicationId = applicationDoc.id;
        
        const jobBoard = jobBoardsData.find(jb => jb.id === application.refJobBoardId);
        if (!jobBoard) continue;
        
        const user = usersMap.get(application.refUserId);
        
        const applicationWithUser: ApplicationWithUser = {
          ...application,
          id: applicationId,
          user,
          jobBoardTitle: jobBoard.title,
          jobCode: jobBoard.code
        };
        
        codeCountMap.set(jobBoard.code, (codeCountMap.get(jobBoard.code) || 0) + 1);
        
        if (application.refUserId) {
          if (!tempAppliedCampsMap[application.refUserId]) {
            tempAppliedCampsMap[application.refUserId] = [];
          }
          if (!tempAppliedCampsMap[application.refUserId].includes(jobBoard.title)) {
            tempAppliedCampsMap[application.refUserId].push(jobBoard.title);
          }
        }
        
        if (application.interviewDate && application.interviewDate.seconds) {
          const interviewDate = application.interviewDate.toDate();
          const dateKey = interviewDate.toISOString().split('T')[0];
          
          if (!interviewDateMap.has(dateKey)) {
            interviewDateMap.set(dateKey, {
              jobBoardId: jobBoard.id,
              jobBoardTitle: jobBoard.title,
              date: interviewDate,
              formattedDate: interviewDate.toLocaleDateString('ko-KR'),
              interviews: []
            });
          }
          
          interviewDateMap.get(dateKey)?.interviews.push(applicationWithUser);
        } else {
          interviewDateMap.get(undefinedDateKey)?.interviews.push(applicationWithUser);
        }
      }
      
      const sortedDates = Array.from(interviewDateMap.values()).sort((a, b) => {
        if (a.formattedDate === '날짜 미정') return -1;
        if (b.formattedDate === '날짜 미정') return 1;
        return b.date.getTime() - a.date.getTime();
      });
      
      setInterviewDates(sortedDates);
      setAppliedCampsMap(tempAppliedCampsMap);
      
      const sortedJobCodes = Array.from(codeCountMap.entries())
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count);
      
      setJobCodes(sortedJobCodes);
    } catch (error) {
      console.error('면접 일정 로드 오류:', error);
      toast.error('면접 일정을 불러오는 중 오류가 발생했습니다.');
    }
  };

  return {
    interviewDates,
    loading,
    loadingDates,
    appliedCampsMap,
    jobCodes,
    setInterviewDates,
  };
}
