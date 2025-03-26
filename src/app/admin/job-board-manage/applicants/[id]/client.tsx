'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, getDoc, collection, query, where, getDocs, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ApplicationHistory, JobBoard, User } from '@/types';
import { Timestamp } from 'firebase/firestore';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';

type JobBoardWithId = JobBoard & { id: string };

type ApplicationWithUser = ApplicationHistory & { 
  id: string;
  user?: User;
};

type FilterStatus = 'all' | 'accepted' | 'interview' | 'final';

type Props = {
  jobBoardId: string;
};

export function ApplicantsManageClient({ jobBoardId }: Props) {
  const router = useRouter();
  const [applications, setApplications] = useState<ApplicationWithUser[]>([]);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationWithUser | null>(null);
  const [jobBoard, setJobBoard] = useState<JobBoardWithId | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [feedbackText, setFeedbackText] = useState('');
  const [interviewBaseLink, setInterviewBaseLink] = useState('');
  const [interviewBaseDuration, setInterviewBaseDuration] = useState('');
  const [interviewBaseNotes, setInterviewBaseNotes] = useState('');
  const [filteredApplications, setFilteredApplications] = useState<ApplicationWithUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewTime, setInterviewTime] = useState('');
  
  const loadData = async () => {
    try {
      setIsLoading(true);
      
      // 채용 공고 정보 로드
      const jobBoardRef = doc(db, 'jobBoards', jobBoardId);
      const jobBoardDoc = await getDoc(jobBoardRef);
      
      if (!jobBoardDoc.exists()) {
        toast.error('채용 공고를 찾을 수 없습니다.');
        router.push('/admin/job-board-manage');
        return;
      }
      
      const jobBoardData = {
        ...jobBoardDoc.data(),
        id: jobBoardDoc.id
      } as JobBoardWithId;
      setJobBoard(jobBoardData);
      
      // 지원자 목록 로드
      const applicationsRef = collection(db, 'applicationHistories');
      const q = query(applicationsRef, where('refJobBoardId', '==', jobBoardId));
      const applicationsSnapshot = await getDocs(q);
      
      const applicationsData = await Promise.all(
        applicationsSnapshot.docs.map(async (docSnapshot) => {
          const data = docSnapshot.data() as ApplicationHistory;
          const userRef = doc(db, 'users', data.refUserId);
          const userDoc = await getDoc(userRef);
          const userData = userDoc.exists() ? userDoc.data() as DocumentData : undefined;
          
          return {
            ...data,
            id: docSnapshot.id,
            user: userData ? { ...userData, id: userDoc.id } as User : undefined
          } as ApplicationWithUser;
        })
      );
      
      setApplications(applicationsData);
      setFilteredApplications(applicationsData);
    } catch (error) {
      console.error('데이터 로드 오류:', error);
      toast.error('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    loadData();
  }, [jobBoardId, router]);
  
  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ... rest of the JSX from the original file ... */}
      </div>
    </Layout>
  );
} 