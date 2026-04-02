import {
  collection,
  doc,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  Firestore,
} from 'firebase/firestore';

// ==================== JobBoard 관련 서비스 ====================

export const createJobBoard = async (db: Firestore, jobBoardData: Record<string, any>) => {
  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, 'jobBoards'), {
    ...jobBoardData,
    interviewPassword: jobBoardData.interviewPassword || '',
    interviewBaseDuration: jobBoardData.interviewBaseDuration || 30,
    interviewBaseLink: jobBoardData.interviewBaseLink || '',
    interviewBaseNotes: jobBoardData.interviewBaseNotes || '',
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
};

export const getJobBoardById = async (
  db: Firestore,
  jobBoardId: string
): Promise<any | null> => {
  const jobBoardDoc = await getDoc(doc(db, 'jobBoards', jobBoardId));
  if (!jobBoardDoc.exists()) return null;
  return { id: jobBoardDoc.id, ...jobBoardDoc.data() };
};

export const getAllJobBoards = async (db: Firestore): Promise<any[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, 'jobBoards'));

    const jobBoards = await Promise.all(
      querySnapshot.docs.map(async (docSnapshot) => {
        const jobBoardData = docSnapshot.data();
        const jobCodeDoc = await getDoc(doc(db, 'jobCodes', jobBoardData.refJobCodeId));
        const jobCodeData = jobCodeDoc.data();

        return {
          id: docSnapshot.id,
          ...jobBoardData,
          korea: jobCodeData?.korea ?? true,
        };
      })
    );

    return jobBoards;
  } catch (error) {
    console.error('모든 공고 조회 실패:', error);
    throw error;
  }
};

export const getActiveJobBoards = async (db: Firestore): Promise<any[]> => {
  try {
    const jobBoardsRef = collection(db, 'jobBoards');
    const q = query(jobBoardsRef, where('status', '==', 'active'));
    const querySnapshot = await getDocs(q);

    const jobCodeIds = new Set<string>();
    querySnapshot.docs.forEach((doc) => {
      const data = doc.data();
      jobCodeIds.add(data.refJobCodeId);
    });

    const jobCodePromises = Array.from(jobCodeIds).map(async (id) => {
      const jobCodeDoc = await getDoc(doc(db, 'jobCodes', id));
      return {
        id,
        data: jobCodeDoc.data(),
      };
    });

    const jobCodes = await Promise.all(jobCodePromises);

    const jobCodeMap = new Map<string, any>();
    jobCodes.forEach(({ id, data }) => {
      jobCodeMap.set(id, data);
    });

    const jobBoards = querySnapshot.docs.map((docSnapshot) => {
      const jobBoardData = docSnapshot.data();
      const jobCodeData = jobCodeMap.get(jobBoardData.refJobCodeId);

      return {
        id: docSnapshot.id,
        ...jobBoardData,
        korea: jobCodeData?.korea ?? true,
      };
    });

    return jobBoards;
  } catch (error) {
    console.error('활성화된 공고 조회 실패:', error);
    throw error;
  }
};

export const updateJobBoard = async (
  db: Firestore,
  jobBoardId: string,
  jobBoardData: Record<string, any>
) => {
  await updateDoc(doc(db, 'jobBoards', jobBoardId), jobBoardData);
  return jobBoardId;
};

export const deleteJobBoard = async (db: Firestore, jobBoardId: string) => {
  return await deleteDoc(doc(db, 'jobBoards', jobBoardId));
};

// ==================== ApplicationHistory 관련 서비스 ====================

export const createApplication = async (db: Firestore, applicationData: Record<string, any>) => {
  try {
    const docRef = await addDoc(collection(db, 'applicationHistories'), {
      ...applicationData,
      applicationDate: Timestamp.now(),
    });

    await updateDoc(doc(db, 'applicationHistories', docRef.id), {
      applicationHistoryId: docRef.id,
    });

    return docRef.id;
  } catch (error) {
    console.error('지원서 생성 실패:', error);
    throw error;
  }
};

export const getApplicationsByUserId = async (
  db: Firestore,
  userId: string
): Promise<any[]> => {
  try {
    const q = query(collection(db, 'applicationHistories'), where('refUserId', '==', userId)); // userId -> refUserId로 수정
    const querySnapshot = await getDocs(q);

    const applications = await Promise.all(
      querySnapshot.docs.map(async (docSnapshot) => {
        const applicationData = docSnapshot.data();

        const jobBoardDoc = await getDoc(
          doc(db, 'jobBoards', applicationData.refJobBoardId || applicationData.jobBoardId) // refJobBoardId 우선 사용
        );
        const jobBoardData = jobBoardDoc.data();

        return {
          id: docSnapshot.id,
          ...applicationData,
          jobBoardName: jobBoardData?.jobBoardName || '알 수 없음',
          generation: jobBoardData?.generation || '',
          code: jobBoardData?.code || '',
        };
      })
    );

    return applications;
  } catch (error) {
    console.error('사용자 지원 내역 조회 실패:', error);
    throw error;
  }
};

export const getApplicationsByJobBoardId = async (
  db: Firestore,
  jobBoardId: string
): Promise<any[]> => {
  try {
    console.log(`🔍 [getApplicationsByJobBoardId] 공고 ID: ${jobBoardId} 조회 시작`);
    console.log('📊 [getApplicationsByJobBoardId] db 객체:', db?.app?.name || 'db undefined');
    
    const q = query(
      collection(db, 'applicationHistories'),
      where('refJobBoardId', '==', jobBoardId)
    );
    const querySnapshot = await getDocs(q);

    console.log(`📦 [getApplicationsByJobBoardId] 쿼리 결과: ${querySnapshot.size}개 문서 발견`);

    const applications = await Promise.all(
      querySnapshot.docs.map(async (docSnapshot) => {
        const applicationData = docSnapshot.data();
        const userId = applicationData.refUserId || applicationData.userId; // refUserId 우선 사용
        console.log(`👤 [getApplicationsByJobBoardId] 지원서 ID: ${docSnapshot.id}, refUserId: ${applicationData.refUserId}, userId: ${applicationData.userId}`);

        if (!userId) {
          console.warn(`⚠️ [getApplicationsByJobBoardId] 지원서 ID ${docSnapshot.id}에 userId가 없습니다.`);
          return {
            id: docSnapshot.id,
            ...applicationData,
            userName: '알 수 없음',
            userEmail: '',
            userPhone: '',
          };
        }

        const userDoc = await getDoc(doc(db, 'users', userId));
        const userData = userDoc.data();

        return {
          id: docSnapshot.id,
          ...applicationData,
          userName: userData?.name || '알 수 없음',
          userEmail: userData?.email || '',
          userPhone: userData?.phoneNumber || userData?.phone || '',
        };
      })
    );

    console.log(`✅ [getApplicationsByJobBoardId] 최종 반환: ${applications.length}명`);
    return applications;
  } catch (error) {
    console.error('❌ [getApplicationsByJobBoardId] 공고별 지원자 조회 실패:', error);
    throw error;
  }
};

export const updateApplication = async (
  db: Firestore,
  applicationId: string,
  applicationData: Record<string, any>
) => {
  await updateDoc(doc(db, 'applicationHistories', applicationId), applicationData);
};

export const cancelApplication = async (db: Firestore, applicationId: string) => {
  try {
    await updateDoc(doc(db, 'applicationHistories', applicationId), {
      applicationStatus: 'cancelled',
    });

    return true;
  } catch (error) {
    console.error('지원 취소 실패:', error);
    throw error;
  }
};

/**
 * 관리자가 지원자의 지원장소(JobBoard)를 변경
 * 연관된 evaluations의 refJobBoardId도 함께 업데이트
 * 
 * @param db - Firestore 인스턴스
 * @param applicationId - 변경할 지원 내역 ID
 * @param newJobBoardId - 새로운 채용 공고 ID
 * @returns 업데이트된 문서 수 정보
 */
export const changeApplicationJobBoard = async (
  db: Firestore,
  applicationId: string,
  newJobBoardId: string
): Promise<{ updatedApplications: number; updatedEvaluations: number }> => {
  try {
    console.log(`🔄 [changeApplicationJobBoard] 시작: applicationId=${applicationId}, newJobBoardId=${newJobBoardId}`);

    // 1. 지원 내역 문서 조회 및 검증
    const applicationRef = doc(db, 'applicationHistories', applicationId);
    const applicationDoc = await getDoc(applicationRef);

    if (!applicationDoc.exists()) {
      throw new Error('지원 내역을 찾을 수 없습니다.');
    }

    const applicationData = applicationDoc.data();
    const oldJobBoardId = applicationData.refJobBoardId;

    if (oldJobBoardId === newJobBoardId) {
      throw new Error('동일한 채용 공고로는 변경할 수 없습니다.');
    }

    // 2. 새로운 JobBoard 존재 여부 확인
    const newJobBoardDoc = await getDoc(doc(db, 'jobBoards', newJobBoardId));
    if (!newJobBoardDoc.exists()) {
      throw new Error('변경하려는 채용 공고를 찾을 수 없습니다.');
    }

    // 3. applicationHistories 업데이트
    await updateDoc(applicationRef, {
      refJobBoardId: newJobBoardId,
      updatedAt: Timestamp.now(),
    });

    console.log(`✅ [changeApplicationJobBoard] applicationHistories 업데이트 완료`);

    // 4. 연관된 evaluations 조회 및 업데이트
    const evaluationsQuery = query(
      collection(db, 'evaluations'),
      where('refApplicationId', '==', applicationId)
    );
    const evaluationsSnapshot = await getDocs(evaluationsQuery);

    console.log(`📊 [changeApplicationJobBoard] 연관된 평가 ${evaluationsSnapshot.size}개 발견`);

    // 모든 evaluation 업데이트
    const updatePromises = evaluationsSnapshot.docs.map((evalDoc) =>
      updateDoc(doc(db, 'evaluations', evalDoc.id), {
        refJobBoardId: newJobBoardId,
        updatedAt: Timestamp.now(),
      })
    );

    await Promise.all(updatePromises);

    console.log(`✅ [changeApplicationJobBoard] 모든 평가 업데이트 완료`);

    return {
      updatedApplications: 1,
      updatedEvaluations: evaluationsSnapshot.size,
    };
  } catch (error) {
    console.error('❌ [changeApplicationJobBoard] 지원장소 변경 실패:', error);
    throw error;
  }
};

/**
 * JobBoard별 지원자 통계 재계산
 * 지원장소 변경 시 호출하여 통계를 갱신
 * 
 * @param db - Firestore 인스턴스
 * @param jobBoardId - 통계를 갱신할 채용 공고 ID
 */
export const recalculateJobBoardStats = async (
  db: Firestore,
  jobBoardId: string
): Promise<{
  totalApplications: number;
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  interviewScheduledCount: number;
  interviewPassedCount: number;
  finalAcceptedCount: number;
}> => {
  try {
    console.log(`📊 [recalculateJobBoardStats] 통계 재계산 시작: jobBoardId=${jobBoardId}`);

    // 해당 JobBoard의 모든 지원 내역 조회
    const applicationsQuery = query(
      collection(db, 'applicationHistories'),
      where('refJobBoardId', '==', jobBoardId)
    );
    const applicationsSnapshot = await getDocs(applicationsQuery);

    // 통계 계산
    const stats = {
      totalApplications: applicationsSnapshot.size,
      pendingCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      interviewScheduledCount: 0,
      interviewPassedCount: 0,
      finalAcceptedCount: 0,
    };

    applicationsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      
      // 서류 전형 상태
      if (data.applicationStatus === 'pending') stats.pendingCount++;
      if (data.applicationStatus === 'accepted') stats.acceptedCount++;
      if (data.applicationStatus === 'rejected') stats.rejectedCount++;
      
      // 면접 전형 상태
      if (data.interviewStatus === 'pending' || data.interviewStatus === 'complete') {
        stats.interviewScheduledCount++;
      }
      if (data.interviewStatus === 'passed') stats.interviewPassedCount++;
      
      // 최종 합격
      if (data.finalStatus === 'finalAccepted') stats.finalAcceptedCount++;
    });

    // JobBoard 문서에 통계 저장 (선택적)
    // 필요한 경우 주석 해제하여 사용
    /*
    await updateDoc(doc(db, 'jobBoards', jobBoardId), {
      stats,
      statsUpdatedAt: Timestamp.now(),
    });
    */

    console.log(`✅ [recalculateJobBoardStats] 통계 재계산 완료:`, stats);

    return stats;
  } catch (error) {
    console.error('❌ [recalculateJobBoardStats] 통계 재계산 실패:', error);
    throw error;
  }
};
