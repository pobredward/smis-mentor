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
