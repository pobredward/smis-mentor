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
  orderBy,
  serverTimestamp,
  limit as firestoreLimit
} from 'firebase/firestore';
import { 
  signOut as firebaseSignOut, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification, 
  sendPasswordResetEmail,
  updateProfile,
  User as FirebaseUser,
  deleteUser as deleteAuthUser
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL, 
  deleteObject,
  getStorage,
  uploadBytes
} from 'firebase/storage';
import { db, auth, storage } from './firebase';
import { User, JobCode, JobBoard, ApplicationHistory, JobExperience, JobBoardWithId, JobCodeWithId, ApplicationHistoryWithId, JobGroup, JobCodeWithGroup, Review, JobExperienceGroupRole } from '@/types';
import { getCache, setCache, CACHE_STORE, CACHE_TTL, getCacheCollection, setCacheCollection, removeCache, clearCacheCollection } from './cacheUtils';

// User 관련 함수
export const createUser = async (userData: Omit<User, 'userId' | 'id'>) => {
  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, 'users'), {
    ...userData,
    createdAt: now,
    updatedAt: now
  });
  return await updateDoc(doc(db, 'users', docRef.id), { userId: docRef.id, id: docRef.id });
};

export const getUserById = async (userId: string) => {
  try {
    // 캐시에서 데이터 확인
    const cachedUser = await getCache<User>(CACHE_STORE.USERS, userId);
    if (cachedUser) {
      console.log('캐시에서 사용자 정보 로드:', userId);
      return cachedUser;
    }

    // 캐시에 없는 경우 Firestore에서 조회
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return null;
    
    const userData = userDoc.data() as User;
    
    // 캐시에 저장 (1시간 유효)
    await setCache(CACHE_STORE.USERS, userData, CACHE_TTL.MEDIUM);
    
    return userData;
  } catch (error) {
    console.error('사용자 정보 가져오기 실패:', error);
    throw error;
  }
};

export const getUserByEmail = async (email: string) => {
  try {
    const q = query(collection(db, 'users'), where('email', '==', email));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;
    return querySnapshot.docs[0].data() as User;
  } catch (error) {
    console.error('이메일로 사용자 조회 실패:', error);
    throw error;
  }
};

export const getUserByPhone = async (phoneNumber: string) => {
  try {
    const q = query(collection(db, 'users'), where('phoneNumber', '==', phoneNumber));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;
    return querySnapshot.docs[0].data() as User;
  } catch (error) {
    console.error('전화번호로 사용자 조회 실패:', error);
    throw error;
  }
};

export const updateUser = async (userId: string, updates: Partial<User>) => {
  const now = Timestamp.now();
  const userRef = doc(db, 'users', userId);
  
  await updateDoc(userRef, {
    ...updates,
    updatedAt: now
  });
  
  // 해당 사용자 캐시 삭제 (다음 조회 시 새로 불러오도록)
  await clearUserCache(userId);
};

export const deactivateUser = async (userId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }
    
    const userData = userDoc.data() as User;
    const now = Timestamp.now();
    
    // 이메일 주소 백업을 위해 originalEmail 필드 추가
    await updateDoc(userRef, {
      status: 'inactive',
      name: `(탈퇴)${userData.name}`,
      originalEmail: userData.email, // 원본 이메일 저장
      updatedAt: now
    });
    
    // 현재 로그인된 사용자가 탈퇴하려는 사용자인 경우 Authentication 계정 삭제
    if (auth.currentUser && auth.currentUser.email === userData.email) {
      try {
        await deleteAuthUser(auth.currentUser);
        console.log('Firebase Authentication 계정이 삭제되었습니다.');
      } catch (authError) {
        console.error('Firebase Authentication 계정 삭제 실패:', authError);
        // Authentication 오류는 무시하고 Firestore 업데이트는 진행
      }
    }
    
    return true;
  } catch (error) {
    console.error('사용자 비활성화 실패:', error);
    throw error;
  }
};

export const reactivateUser = async (userId: string) => {
  try {
    // 1. Firestore에서 사용자 정보 조회
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }
    
    const userData = userDoc.data() as User;
    const now = Timestamp.now();
    const originalName = userData.name.replace(/^\(탈퇴\)/, '');
    
    // 저장된 원본 이메일이 있는지 확인
    const email = userData.originalEmail || userData.email;
    
    if (!email) {
      throw new Error('사용자의 이메일 정보를 찾을 수 없습니다.');
    }
    
    // 임시 비밀번호 생성 (랜덤 문자열)
    const tempPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-2).toUpperCase() + '!';
    
    // 2. 기존 로그인 상태 백업
    const currentUserBackup = auth.currentUser;
    
    console.log(`계정 복구 시작: ${email}`);
    
    try {
      // 3. 임시 로그아웃 (현재 사용자가 있는 경우)
      if (currentUserBackup) {
        console.log('기존 로그인 상태 백업 및 로그아웃');
        await firebaseSignOut(auth);
      }
      
      // 4. Authentication 계정 생성 시도
      try {
        console.log(`새 Authentication 계정 생성 시도: ${email}`);
        await createUserWithEmailAndPassword(auth, email, tempPassword);
        console.log('새 Authentication 계정 생성 성공');
      } catch (createError) {
        // 이미 계정이 존재하는 경우 (auth/email-already-in-use)
        if (createError instanceof FirebaseError && createError.code === 'auth/email-already-in-use') {
          console.log('이미 해당 이메일로 계정이 존재합니다.');
        } else {
          console.error('Authentication 계정 생성 오류:', createError);
          throw createError; // 다른 오류는 상위로 전파
        }
      }
      
      // 5. 비밀번호 재설정 이메일 전송
      console.log(`비밀번호 재설정 이메일 전송 시도: ${email}`);
      await sendPasswordResetEmail(auth, email);
      console.log('비밀번호 재설정 이메일 전송 성공');
      
      // 6. 원래 사용자로 다시 로그인 (필요한 경우)
      if (currentUserBackup) {
        // 현재는 간단히 로그아웃만 수행 (세션 유지는 복잡할 수 있음)
        console.log('로그아웃 상태 유지 (관리자는 새로 로그인 필요)');
        await firebaseSignOut(auth);
      }
    } catch (authError) {
      console.error('Authentication 계정 복구 오류:', authError);
      
      // 오류 발생 시 원래 사용자로 복원 시도
      if (currentUserBackup) {
        try {
          // 이 부분은 실제로는 작동하지 않을 수 있음 (세션 토큰을 저장할 수 없음)
          // 관리자에게 다시 로그인하라는 메시지를 표시하는 것이 더 적절함
          console.log('인증 오류 발생, 관리자는 다시 로그인해야 합니다.');
          await firebaseSignOut(auth);
        } catch (reloginError) {
          console.error('원래 사용자로 복원 실패:', reloginError);
        }
      }
      
      // 인증 오류가 있더라도 Firestore 업데이트는 계속 진행
    }
    
    // 7. Firestore 사용자 문서 업데이트
    await updateDoc(userRef, {
      status: 'active',
      name: originalName,
      email: email, // 원본 이메일 복원
      updatedAt: now
    });
    
    return true;
  } catch (error) {
    console.error('사용자 재활성화 실패:', error);
    throw error;
  }
};

export const deleteUser = async (userId: string) => {
  try {
    // 사용자 정보 가져오기
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }
    
    const userData = userDoc.data() as User;
    
    // 현재 인증된 사용자와 삭제하려는 사용자가 같은 경우
    // (사용자 자신이 탈퇴하는 경우)
    if (auth.currentUser && auth.currentUser.email === userData.email) {
      try {
        await deleteAuthUser(auth.currentUser);
        console.log('Firebase Authentication 계정이 삭제되었습니다.');
      } catch (authError) {
        console.error('Firebase Authentication 계정 삭제 실패:', authError);
        // Authentication 오류는 무시하고 Firestore 삭제는 진행
      }
    } else {
      // 관리자가 다른 사용자를 삭제하는 경우
      // 여기서는 관리자 권한으로 해당 사용자의 Authentication 계정을 직접 삭제할 수 없음
      // Firebase Admin SDK가 필요한 부분이므로 별도의 백엔드 API 구현이 필요
      console.log('관리자가 사용자를 삭제하는 경우, Authentication 계정은 삭제할 수 없습니다.');
    }
    
    // Firestore에서 사용자 문서 삭제
    await deleteDoc(userRef);
    return true;
  } catch (error) {
    console.error('사용자 삭제 실패:', error);
    throw error;
  }
};

export const getUserJobCodesInfo = async (jobExperiences: Array<{id: string, group: JobGroup}> | string[]): Promise<JobCodeWithGroup[]> => {
  try {
    if (!jobExperiences || jobExperiences.length === 0) return [];
    
    // console.log('=== getUserJobCodesInfo 호출 ===');
    // console.log('검색할 jobExperiences:', jobExperiences);
    
    // 배열 형식 확인 및 ID 추출
    const jobIds = jobExperiences.map(exp => {
      // 새 형식 (객체)인 경우
      if (typeof exp === 'object' && exp !== null && 'id' in exp) {
        return exp.id;
      }
      // 이전 형식 (문자열)인 경우 - 하위 호환성 유지
      return exp as string;
    });
    
    // 병렬로 처리할 작업 배열
    const tasks = jobIds.map(async (idOrCode, index) => {
      try {
        // 그룹 정보 준비 (새 형식인 경우에만 포함)
        const group = typeof jobExperiences[index] === 'object' && 'group' in jobExperiences[index]
          ? (jobExperiences[index] as {id: string, group: JobGroup}).group
          : 'junior' as JobGroup;
        
        // 1. 먼저 jobCodes 컬렉션에서 직접 ID로 조회
        const jobCodeDoc = await getDoc(doc(db, 'jobCodes', idOrCode));
        
        if (jobCodeDoc.exists()) {
          // console.log(`'${idOrCode}'는 jobCodes 컬렉션의 문서 ID입니다.`);
          
          // 그룹 정보와 함께 반환
          return {
            id: jobCodeDoc.id,
            ...jobCodeDoc.data() as JobCode,
            group
          } as JobCodeWithGroup;
        }
        
        // 2. jobCodes ID가 아닌 경우, 이전 로직대로 처리
        // 2.1 jobExperiences 컬렉션의 문서 ID인지 확인
        const jobExperienceDoc = await getDoc(doc(db, 'jobExperiences', idOrCode));
        
        if (jobExperienceDoc.exists()) {
          // console.log(`'${idOrCode}'는 jobExperiences 컬렉션의 문서 ID입니다.`);
          // jobExperiences 컬렉션에 문서가 존재하는 경우 (기존 로직)
          const jobExperience = { 
            jobExperienceId: idOrCode,
            ...jobExperienceDoc.data() 
          } as JobExperience;
          
          // 관련 JobCode 정보 가져오기
          const jobCodeQuery = query(
            collection(db, 'jobCodes'),
            where('generation', '==', jobExperience.refGeneration),
            where('code', '==', jobExperience.refCode)
          );
          
          const jobCodeSnapshot = await getDocs(jobCodeQuery);
          if (!jobCodeSnapshot.empty) {
            console.log(`jobExperience에서 참조하는 JobCode 찾음: ${jobExperience.refGeneration}-${jobExperience.refCode}`);
            return {
              id: jobCodeSnapshot.docs[0].id,
              ...jobCodeSnapshot.docs[0].data() as JobCode,
              group
            } as JobCodeWithGroup;
          } else {
            console.log(`jobExperience가 참조하는 JobCode를 찾을 수 없음: ${jobExperience.refGeneration}-${jobExperience.refCode}`);
          }
        } else {
          console.log(`'${idOrCode}'는 직접 코드로 간주하고 검색합니다.`);
          // 2.2. jobExperiences 컬렉션에 없는 경우, idOrCode를 직접 코드로 간주하고 검색
          const jobCodeQuery = query(
            collection(db, 'jobCodes'),
            where('code', '==', idOrCode),
            // 세대 기준 내림차순 정렬(최신 세대가 먼저 오도록)
            // generation 형식이 'G25'와 같은 형태일 경우 문자열 정렬로도 최신 세대가 먼저 옴
            orderBy('generation', 'desc')
          );
          
          const jobCodeSnapshot = await getDocs(jobCodeQuery);
          if (!jobCodeSnapshot.empty) {
            const jobCode = jobCodeSnapshot.docs[0].data() as JobCode;
            console.log(`코드 '${idOrCode}'에 해당하는 JobCode 찾음: ${jobCode.generation}-${jobCode.code}`);
            return {
              id: jobCodeSnapshot.docs[0].id,
              ...jobCode,
              group
            } as JobCodeWithGroup;
          } else {
            console.log(`코드 '${idOrCode}'에 해당하는 JobCode를 찾을 수 없음`);
          }
        }
        return null;
      } catch (error) {
        console.error('직무 코드 정보 가져오기 오류:', error);
        return null;
      }
    });
    
    // 모든 작업 완료 대기
    const results = await Promise.all(tasks);
    
    // null 값 제거 및 결과 반환
    return results.filter((result): result is JobCodeWithGroup => result !== null);
  } catch (error) {
    console.error('직무 코드 정보 가져오기 오류:', error);
    return [];
  }
};

// JobBoard 관련 함수
export const createJobBoard = async (jobBoardData: Omit<JobBoard, 'id' | 'createdAt'>) => {
  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, 'jobBoards'), {
    ...jobBoardData,
    interviewPassword: jobBoardData.interviewPassword || '',
    interviewBaseDuration: jobBoardData.interviewBaseDuration || 30,
    interviewBaseLink: jobBoardData.interviewBaseLink || '',
    interviewBaseNotes: jobBoardData.interviewBaseNotes || '',
    createdAt: now,
    updatedAt: now
  });
  return docRef.id;
};

export const getJobBoardById = async (jobBoardId: string) => {
  const jobBoardDoc = await getDoc(doc(db, 'jobBoards', jobBoardId));
  if (!jobBoardDoc.exists()) return null;
  return { id: jobBoardDoc.id, ...jobBoardDoc.data() as JobBoard } as JobBoardWithId;
};

export const getAllJobBoards = async () => {
  try {
    // 캐시에서 데이터 확인
    const cachedJobBoards = await getCacheCollection<JobBoardWithId>(CACHE_STORE.JOB_BOARDS);
    if (cachedJobBoards) {
      console.log('캐시에서 공고 목록 로드, 총', cachedJobBoards.length, '개');
      return cachedJobBoards;
    }

    // 캐시에 없는 경우 Firestore에서 조회
    const querySnapshot = await getDocs(collection(db, 'jobBoards'));
    
    // JobBoard 데이터와 함께 JobCode의 korea 값을 가져오기
    const jobBoards = await Promise.all(querySnapshot.docs.map(async (docSnapshot) => {
      const jobBoardData = docSnapshot.data() as JobBoard;
      const jobCodeDoc = await getDoc(doc(db, 'jobCodes', jobBoardData.refJobCodeId));
      const jobCodeData = jobCodeDoc.data() as JobCode;
      
      return { 
        id: docSnapshot.id, 
        ...jobBoardData,
        korea: jobCodeData.korea  // JobCode의 korea 값을 사용
      } as JobBoardWithId;
    }));
    
    // 캐시에 저장 (30분 유효)
    await setCacheCollection(CACHE_STORE.JOB_BOARDS, jobBoards, CACHE_TTL.MEDIUM);
    
    return jobBoards;
  } catch (error) {
    console.error('모든 공고 조회 실패:', error);
    throw error;
  }
};

export const getActiveJobBoards = async () => {
  try {
    // 브라우저 환경인지 확인
    const isBrowser = typeof window !== 'undefined';
    
    // 브라우저 환경에서만 캐시 사용
    if (isBrowser) {
      const cachedData = await getCacheCollection<JobBoardWithId>(CACHE_STORE.JOB_BOARDS);
      
      if (cachedData && cachedData.length > 0) {
        // 캐시에서 status가 active인 데이터만 필터링
        const activeBoards = cachedData.filter(board => board.status === 'active');
        if (activeBoards.length > 0) {
          console.log('캐시에서 활성화 공고 목록 로드, 총', activeBoards.length, '개');
          return activeBoards;
        }
      }
    }
    
    // Firestore에서 한 번에 필요한 데이터를 모두 가져오기
    const jobBoardsRef = collection(db, 'jobBoards');
    const q = query(jobBoardsRef, where('status', '==', 'active'));
    const querySnapshot = await getDocs(q);
    
    // 필요한 JobCode ID 수집
    const jobCodeIds = new Set<string>();
    querySnapshot.docs.forEach(doc => {
      const data = doc.data() as JobBoard;
      jobCodeIds.add(data.refJobCodeId);
    });
    
    // 필요한 모든 JobCode를 한 번에 가져오기
    const jobCodePromises = Array.from(jobCodeIds).map(async id => {
      const jobCodeDoc = await getDoc(doc(db, 'jobCodes', id));
      return { 
        id, 
        data: jobCodeDoc.data() as JobCode 
      };
    });
    
    const jobCodes = await Promise.all(jobCodePromises);
    
    // JobCode 맵 생성
    const jobCodeMap = new Map<string, JobCode>();
    jobCodes.forEach(({ id, data }) => {
      jobCodeMap.set(id, data);
    });
    
    // JobBoard 데이터 생성
    const jobBoards = querySnapshot.docs.map(docSnapshot => {
      const jobBoardData = docSnapshot.data() as JobBoard;
      const jobCodeData = jobCodeMap.get(jobBoardData.refJobCodeId);
      
      return { 
        id: docSnapshot.id, 
        ...jobBoardData,
        korea: jobCodeData?.korea ?? true  // JobCode의 korea 값을 사용하되, 없으면 기본값
      } as JobBoardWithId;
    });
    
    // 브라우저 환경에서만 캐시에 저장
    if (isBrowser) {
      // IndexedDB 캐시에 저장 (30분 유효)
      await setCacheCollection(CACHE_STORE.JOB_BOARDS, jobBoards, CACHE_TTL.MEDIUM);
    }
    
    return jobBoards;
  } catch (error) {
    console.error('활성화된 공고 조회 실패:', error);
    throw error;
  }
};

export const updateJobBoard = async (jobBoardId: string, jobBoardData: Partial<JobBoard>) => {
  await updateDoc(doc(db, 'jobBoards', jobBoardId), jobBoardData);
  
  // 해당 공고 캐시 삭제 및 관련 캐시 초기화
  await clearJobBoardCache(jobBoardId);
  
  return jobBoardId;
};

export const deleteJobBoard = async (jobBoardId: string) => {
  return await deleteDoc(doc(db, 'jobBoards', jobBoardId));
};

// ApplicationHistory 관련 함수
export const createApplication = async (applicationData: Omit<ApplicationHistory, 'applicationHistoryId' | 'applicationDate'>) => {
  try {
    const docRef = await addDoc(collection(db, 'applicationHistories'), {
      ...applicationData,
      applicationDate: Timestamp.now()
    });
    
    return await updateDoc(doc(db, 'applicationHistories', docRef.id), { 
      applicationHistoryId: docRef.id 
    });
  } catch (error) {
    console.error('지원서 생성 실패:', error);
    throw error;
  }
};

export const getApplicationsByUserId = async (userId: string) => {
  try {
    const applicationsRef = collection(db, 'applicationHistories');
    const q = query(applicationsRef, where('refUserId', '==', userId));
    const querySnapshot = await getDocs(q);
    
    const applications: ApplicationHistory[] = [];
    querySnapshot.forEach((doc) => {
      applications.push({
        applicationHistoryId: doc.id,
        ...doc.data()
      } as ApplicationHistory);
    });
    
    // 지원일 기준으로 내림차순 정렬 (최신순)
    return applications.sort((a, b) => 
      b.applicationDate.seconds - a.applicationDate.seconds
    );
  } catch (error) {
    console.error('지원 내역 조회 오류:', error);
    throw error;
  }
};

export const getApplicationsByJobBoardId = async (jobBoardId: string) => {
  try {
    const applicationsRef = collection(db, 'applicationHistories');
    const q = query(applicationsRef, where('refJobBoardId', '==', jobBoardId));
    const querySnapshot = await getDocs(q);
    
    const applications: ApplicationHistoryWithId[] = [];
    querySnapshot.forEach((doc) => {
      applications.push({
        id: doc.id,
        ...doc.data() as ApplicationHistory
      } as ApplicationHistoryWithId);
    });
    
    // 지원일 기준으로 내림차순 정렬 (최신순)
    return applications.sort((a, b) => 
      b.applicationDate.seconds - a.applicationDate.seconds
    );
  } catch (error) {
    console.error(`공고 ID(${jobBoardId}) 지원 내역 조회 오류:`, error);
    throw error;
  }
};

export const updateApplication = async (applicationId: string, applicationData: Partial<ApplicationHistory>) => {
  return await updateDoc(doc(db, 'applicationHistories', applicationId), applicationData);
};

// 지원 취소 함수
export const cancelApplication = async (applicationId: string) => {
  try {
    const applicationRef = doc(db, 'applicationHistories', applicationId);
    
    // 지원서 상태 확인 (취소 가능한지 검증)
    const applicationSnap = await getDoc(applicationRef);
    if (!applicationSnap.exists()) {
      throw new Error('존재하지 않는 지원입니다.');
    }
    
    await deleteDoc(applicationRef);
    return true;
  } catch (error) {
    console.error('지원 취소 실패:', error);
    throw error;
  }
};

// Auth 관련 함수
export const signIn = async (email: string, password: string) => {
  try {
    // 회원가입 직후 로그인 문제 해결을 위해 지연 시간 증가
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    // Firebase 인증 상태가 반영될 시간을 확보
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 로그인 성공 시 마지막 로그인 시간 업데이트
    const userRecord = await getUserByEmail(email);
    if (userRecord) {
      await updateUser(userRecord.userId, {
        lastLoginAt: Timestamp.now() 
      });
      
      // 사용자 정보 업데이트 후 상태 반영을 위한 짧은 지연
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return userCredential.user;
  } catch (error) {
    console.error('로그인 실패:', error);
    throw error;
  }
};

export const signUp = async (email: string, password: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential;
  } catch (error) {
    console.error('회원가입 실패:', error);
    throw error;
  }
};

export const sendVerificationEmail = async (user: FirebaseUser) => {
  try {
    await sendEmailVerification(user);
    return true;
  } catch (error) {
    console.error('이메일 인증 메일 발송 실패:', error);
    throw error;
  }
};

export const resetPassword = async (email: string) => {
  try {
    await sendPasswordResetEmail(auth, email);
    return true;
  } catch (error) {
    console.error('비밀번호 재설정 이메일 발송 실패:', error);
    throw error;
  }
};

export const updateUserProfile = async (user: FirebaseUser, displayName?: string, photoURL?: string) => {
  try {
    await updateProfile(user, { displayName, photoURL });
    return true;
  } catch (error) {
    console.error('사용자 프로필 업데이트 실패:', error);
    throw error;
  }
};

export const signOut = async () => {
  try {
    await firebaseSignOut(auth);
    return true;
  } catch (error) {
    console.error('로그아웃 실패:', error);
    throw error;
  }
};

// 파일 업로드 관련 함수
export const uploadProfileImage = async (
  userId: string, 
  file: File, 
  onProgress?: (progress: number) => void
): Promise<string> => {
  try {
    // 파일 경로 생성
    const filePath = `profileImages/${userId}/${Date.now()}-${file.name}`;
    const storageRef = ref(storage, filePath);
    
    // 기존 프로필 이미지 URL 가져오기
    const userDoc = await getUserById(userId);
    const oldImageUrl = userDoc?.profileImage;
    
    // 이미지 업로드
    const uploadTask = uploadBytesResumable(storageRef, file);
    
    // 업로드 완료 대기 및 다운로드 URL 가져오기
    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          // 업로드 진행 상태 (필요시 사용)
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log(`업로드 진행률: ${progress}%`);
          // 진행률 콜백 호출
          if (onProgress) {
            onProgress(progress);
          }
        },
        (error) => {
          // 업로드 실패
          console.error('이미지 업로드 오류:', error);
          reject(error);
        },
        async () => {
          // 업로드 성공, URL 다운로드
          const downloadURL = await getDownloadURL(storageRef);
          
          // 사용자 정보 업데이트
          await updateUser(userId, { profileImage: downloadURL });
          
          // 이전 이미지가 있으면 삭제
          if (oldImageUrl) {
            try {
              const oldImageRef = ref(storage, oldImageUrl);
              await deleteObject(oldImageRef);
            } catch (error) {
              // 이전 이미지 삭제 실패해도 진행
              console.error('이전 이미지 삭제 오류:', error);
            }
          }
          
          resolve(downloadURL);
        }
      );
    });
  } catch (error) {
    console.error('프로필 이미지 업로드 실패:', error);
    throw error;
  }
};

// 임시 사용자 생성 함수
export const createTempUser = async (
  name: string,
  phoneNumber: string,
  jobExperienceIds: string[],
  jobExperienceGroups: JobGroup[] = [],
  jobExperienceGroupRoles: JobExperienceGroupRole[] = [],
  jobExperienceClassCodes: (string | undefined)[] = []
) => {
  try {
    // 동일한 이름과 전화번호를 가진 사용자가 있는지 확인
    const usersRef = collection(db, 'users');
    const q = query(
      usersRef,
      where('name', '==', name),
      where('phoneNumber', '==', phoneNumber)
    );
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      // 이미 존재하는 사용자가 있으면 오류 반환
      throw new Error('이미 등록된 유저입니다');
    }
    
    // JobExperiences 객체 배열 생성
    const jobExperiences = jobExperienceIds.map((id, index) => ({
      id,
      group: index < jobExperienceGroups.length ? jobExperienceGroups[index] : 'junior' as JobGroup,
      groupRole: index < jobExperienceGroupRoles.length ? jobExperienceGroupRoles[index] : '담임',
      classCode: index < jobExperienceClassCodes.length ? jobExperienceClassCodes[index] : undefined
    }));
    
    const now = Timestamp.now();
    
    // Firestore에 임시 사용자 정보 저장
    const userData: Omit<User, 'userId' | 'id'> = {
      email: '',
      name,
      phoneNumber,
      phone: phoneNumber,
      role: 'user',
      jobExperiences,
      password: '',
      address: '',
      addressDetail: '',
      agreedTerms: false,
      agreedPersonal: false,
      profileImage: '',
      status: 'temp',
      isEmailVerified: false,
      isPhoneVerified: false,
      isProfileCompleted: false,
      isTermsAgreed: false,
      isPersonalAgreed: false,
      isAddressVerified: false,
      isProfileImageUploaded: false,
      jobMotivation: '',
      feedback: '',
      createdAt: now,
      updatedAt: now
    };
    
    await createUser(userData);
    
    return { success: true };
  } catch (error) {
    console.error('임시 사용자 생성 오류:', error);
    throw error;
  }
};

// 모든 사용자 조회
export const getAllUsers = async () => {
  try {
    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersRef);
    
    const users: User[] = [];
    querySnapshot.forEach((doc) => {
      users.push(doc.data() as User);
    });
    
    return users;
  } catch (error) {
    console.error('모든 사용자 조회 실패:', error);
    throw error;
  }
};

// 특정 직무 코드에 해당하는 사용자 조회
export const getUsersByJobCode = async (generation: string, code: string) => {
  try {
    const users: User[] = [];
    
    // 접근 방식 1: jobExperiences 컬렉션을 통한 조회 (이전 방식)
    const jobExperiencesRef = collection(db, 'jobExperiences');
    const expQuery = query(
      jobExperiencesRef,
      where('refGeneration', '==', generation),
      where('refCode', '==', code)
    );
    
    const jobExperienceSnapshot = await getDocs(expQuery);
    const userIdsFromExperiences: string[] = [];
    
    jobExperienceSnapshot.forEach((doc) => {
      const data = doc.data() as JobExperience;
      if (data.refUserId) userIdsFromExperiences.push(data.refUserId);
    });
    
    // 접근 방식 2: jobCodes 컬렉션에서 해당 코드와 세대에 맞는 문서 ID 찾기 (새 방식)
    const jobCodesRef = collection(db, 'jobCodes');
    const codeQuery = query(
      jobCodesRef,
      where('generation', '==', generation),
      where('code', '==', code)
    );
    
    const jobCodeSnapshot = await getDocs(codeQuery);
    
    if (jobCodeSnapshot.empty) {
      // jobCodes에서 찾지 못한 경우, 기존 방식의 결과만 반환
      for (const userId of userIdsFromExperiences) {
        const user = await getUserById(userId);
        if (user) users.push(user);
      }
      return users;
    }
    
    // jobCodes에서 찾은 문서 ID
    const jobCodeId = jobCodeSnapshot.docs[0].id;
    
    // 해당 jobCodeId를 jobExperiences 배열의 id 필드에 포함하는 사용자 조회
    // 새로운 구조에서는 where 쿼리 대신 get 후 필터링 방식 사용
    const usersRef = collection(db, 'users');
    const userSnapshot = await getDocs(usersRef);
    
    userSnapshot.forEach((doc) => {
      const userData = doc.data() as User;
      // jobExperiences 배열에서 id 필드가 jobCodeId와 일치하는 항목이 있는지 확인
      if (userData.jobExperiences && userData.jobExperiences.some(exp => exp.id === jobCodeId)) {
        users.push(userData);
      }
    });
    
    // 기존 방식으로 찾은 사용자들도 추가 (중복 제거)
    for (const userId of userIdsFromExperiences) {
      const user = await getUserById(userId);
      if (user && !users.some(u => u.userId === user.userId)) {
        users.push(user);
      }
    }
    
    return users;
  } catch (error) {
    console.error('직무 코드별 사용자 조회 실패:', error);
    throw error;
  }
};

// JobCode 관련 함수
export const getJobCodeById = async (jobCodeId: string) => {
  const jobCodeDoc = await getDoc(doc(db, 'jobCodes', jobCodeId));
  if (!jobCodeDoc.exists()) return null;
  return { id: jobCodeDoc.id, ...jobCodeDoc.data() as JobCode } as JobCodeWithId;
};

export const getAllJobCodes = async () => {
  try {
    // 캐시에서 데이터 확인
    const cachedJobCodes = await getCacheCollection<JobCodeWithId>(CACHE_STORE.JOB_CODES);
    if (cachedJobCodes) {
      console.log('캐시에서 직무 코드 목록 로드, 총', cachedJobCodes.length, '개');
      return cachedJobCodes;
    }
    
    // Firestore에서 조회
    const querySnapshot = await getDocs(collection(db, 'jobCodes'));
    const jobCodes = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as JobCodeWithId[];
    
    // 캐시에 저장 (1시간 유효)
    await setCacheCollection(CACHE_STORE.JOB_CODES, jobCodes, CACHE_TTL.MEDIUM);
    
    return jobCodes;
  } catch (error) {
    console.error('직무 코드 조회 실패:', error);
    throw error;
  }
};

export const createJobCode = async (jobCodeData: Omit<JobCode, 'id'>) => {
  try {
    const docRef = await addDoc(collection(db, 'jobCodes'), jobCodeData);
    return docRef.id;
  } catch (error) {
    console.error('업무 코드 생성 실패:', error);
    throw error;
  }
};

export const deleteJobCode = async (jobCodeId: string) => {
  try {
    await deleteDoc(doc(db, 'jobCodes', jobCodeId));
    return true;
  } catch (error) {
    console.error('업무 코드 삭제 실패:', error);
    throw error;
  }
};

export const updateJobCode = async (jobCodeId: string, jobCodeData: Partial<JobCode>) => {
  try {
    await updateDoc(doc(db, 'jobCodes', jobCodeId), jobCodeData);
    return true;
  } catch (error) {
    console.error('업무 코드 업데이트 실패:', error);
    throw error;
  }
};

// 이미지 업로드 함수
export const uploadImage = async (file: File): Promise<string> => {
  try {
    const storage = getStorage();
    const timestamp = Date.now();
    const fileName = `job-board-images/${timestamp}_${file.name}`;
    const storageRef = ref(storage, fileName);
    
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    return downloadURL;
  } catch (error) {
    console.error('이미지 업로드 오류:', error);
    throw new Error('이미지 업로드에 실패했습니다.');
  }
};

export const addUserJobCode = async (
  userId: string,
  jobCodeId: string,
  group: JobGroup,
  groupRole: JobExperienceGroupRole,
  classCode?: string
): Promise<Array<{id: string, group: JobGroup, groupRole: JobExperienceGroupRole, classCode?: string}>> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }
    const user = userDoc.data() as User;
    const jobExperiences = user.jobExperiences || [];
    // 이미 존재하는지 확인
    const exists = jobExperiences.some(exp => exp.id === jobCodeId);
    if (exists) {
      throw new Error('이미 추가된 직무 코드입니다.');
    }
    // 새 형식으로 추가
    const newJobExperience = { id: jobCodeId, group, groupRole, classCode };
    const updatedJobExperiences = [...jobExperiences, newJobExperience];
    await updateUser(userId, { jobExperiences: updatedJobExperiences });
    return updatedJobExperiences;
  } catch (error) {
    console.error('직무 코드 추가 실패:', error);
    throw error;
  }
};

// 리뷰 관련 함수
export const getReviews = async () => {
  try {
    const reviewsQuery = query(
      collection(db, 'reviews'),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(reviewsQuery);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('리뷰를 가져오는 중 오류가 발생했습니다:', error);
    throw error;
  }
};

export const getReviewById = async (reviewId: string) => {
  try {
    const reviewDoc = await getDoc(doc(db, 'reviews', reviewId));
    if (reviewDoc.exists()) {
      return {
        id: reviewDoc.id,
        ...reviewDoc.data(),
      };
    } else {
      throw new Error('해당 리뷰를 찾을 수 없습니다.');
    }
  } catch (error) {
    console.error('리뷰를 가져오는 중 오류가 발생했습니다:', error);
    throw error;
  }
};

export const addReview = async (reviewData: Omit<Review, 'id' | 'createdAt' | 'updatedAt'>) => {
  try {
    const timestamp = serverTimestamp();
    
    const reviewRef = await addDoc(collection(db, 'reviews'), {
      ...reviewData,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    
    return reviewRef.id;
  } catch (error) {
    console.error('리뷰를 추가하는 중 오류가 발생했습니다:', error);
    throw error;
  }
};

export const updateReview = async (reviewId: string, reviewData: Partial<Omit<Review, 'id' | 'createdAt' | 'updatedAt'>>) => {
  try {
    const reviewRef = doc(db, 'reviews', reviewId);
    
    await updateDoc(reviewRef, {
      ...reviewData,
      updatedAt: serverTimestamp(),
    });
    
    return true;
  } catch (error) {
    console.error('리뷰를 업데이트하는 중 오류가 발생했습니다:', error);
    throw error;
  }
};

export const deleteReview = async (reviewId: string) => {
  try {
    await deleteDoc(doc(db, 'reviews', reviewId));
    return true;
  } catch (error) {
    console.error('리뷰를 삭제하는 중 오류가 발생했습니다:', error);
    throw error;
  }
};

export const getRecentReviews = async (limit: number = 3): Promise<Review[]> => {
  try {
    const reviewsQuery = query(
      collection(db, 'reviews'),
      orderBy('createdAt', 'desc'),
      firestoreLimit(limit)
    );
    
    const querySnapshot = await getDocs(reviewsQuery);
    return querySnapshot.docs.map((doc) => {
      const data = doc.data() as Omit<Review, 'id'>;
      return {
        ...data,
        id: doc.id,
      } as Review;
    });
  } catch (error) {
    console.error('최신 리뷰를 가져오는 중 오류가 발생했습니다:', error);
    return [];
  }
};

export const getBestReviews = async (limit: number = 3): Promise<Review[]> => {
  try {
    // 인덱스가 필요한 복합 쿼리 대신 모든 리뷰를 가져와서 클라이언트에서 필터링
    const reviewsQuery = query(
      collection(db, 'reviews'),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(reviewsQuery);
    const allReviews = querySnapshot.docs.map((doc) => {
      const data = doc.data() as Omit<Review, 'id'>;
      return {
        ...data,
        id: doc.id,
        // 기본 rating 값 추가 (실제 데이터에 없는 경우 대비)
        rating: data.rating || 5,
        // 리뷰 ID도 확장 (page.tsx의 ExtendedReview 타입과 호환되도록)
        reviewId: doc.id,
        // 작성자 기본값 설정
        writer: data.author?.name || '익명'
      } as Review & { rating: number, reviewId: string, writer: string };
    });
    
    // 클라이언트에서 "Best 후기" 필터링 수행
    const bestReviews = allReviews.filter(review => review.generation === 'Best 후기');
    
    // 지정된 개수만큼 반환
    return bestReviews.slice(0, limit);
  } catch (error) {
    console.error('Best 후기를 가져오는 중 오류가 발생했습니다:', error);
    return [];
  }
};

// 캐시 관리 유틸리티 함수
export const clearUserCache = async (userId: string) => {
  return await removeCache(CACHE_STORE.USERS, userId);
};

export const clearJobBoardCache = async (jobBoardId: string) => {
  // 특정 JobBoard 캐시 삭제
  const result = await removeCache(CACHE_STORE.JOB_BOARDS, jobBoardId);
  
  // 활성화된 공고 목록 캐시도 함께 삭제
  localStorage.removeItem('active_job_boards');
  
  return result;
};

export const clearJobBoardsCache = async () => {
  // 모든 JobBoard 캐시 삭제
  const result = await clearCacheCollection(CACHE_STORE.JOB_BOARDS);
  
  // 활성화된 공고 목록 캐시도 함께 삭제
  localStorage.removeItem('active_job_boards');
  
  return result;
};

export const clearJobCodesCache = async () => {
  return await clearCacheCollection(CACHE_STORE.JOB_CODES);
};

export const clearAllCaches = async () => {
  try {
    await Promise.all([
      clearCacheCollection(CACHE_STORE.USERS),
      clearCacheCollection(CACHE_STORE.JOB_BOARDS),
      clearCacheCollection(CACHE_STORE.JOB_CODES),
      clearCacheCollection(CACHE_STORE.APPLICATIONS),
      clearCacheCollection(CACHE_STORE.REVIEWS)
    ]);
    
    // localStorage 캐시도 함께 삭제
    localStorage.removeItem('active_job_boards');
    
    return true;
  } catch (error) {
    console.error('캐시 전체 삭제 실패:', error);
    return false;
  }
};

// 데이터 변경 시 관련 캐시를 초기화하는 유틸리티
export const refreshCacheAfterUpdate = async (collection: string, id: string) => {
  switch (collection) {
    case 'users':
      await clearUserCache(id);
      break;
    case 'jobBoards':
      await clearJobBoardCache(id);
      break;
    case 'jobCodes':
      await clearJobCodesCache();
      break;
    default:
      break;
  }
}; 