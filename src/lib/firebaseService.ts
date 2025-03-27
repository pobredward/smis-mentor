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
  User as FirebaseUser
} from 'firebase/auth';
import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL, 
  deleteObject,
  getStorage,
  uploadBytes
} from 'firebase/storage';
import { db, auth, storage } from './firebase';
import { User, JobCode, JobBoard, ApplicationHistory, JobExperience, JobBoardWithId, JobCodeWithId, ApplicationHistoryWithId, JobGroup, JobCodeWithGroup, Review } from '@/types';

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
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return null;
    return userDoc.data() as User;
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
};

export const deleteUser = async (userId: string) => {
  try {
    await deleteDoc(doc(db, 'users', userId));
    return true;
  } catch (error) {
    console.error('사용자 삭제 실패:', error);
    throw error;
  }
};

export const getUserJobCodesInfo = async (jobExperiences: Array<{id: string, group: JobGroup}> | string[]): Promise<JobCodeWithGroup[]> => {
  try {
    if (!jobExperiences || jobExperiences.length === 0) return [];
    
    console.log('=== getUserJobCodesInfo 호출 ===');
    console.log('검색할 jobExperiences:', jobExperiences);
    
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
          console.log(`'${idOrCode}'는 jobCodes 컬렉션의 문서 ID입니다.`);
          
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
          console.log(`'${idOrCode}'는 jobExperiences 컬렉션의 문서 ID입니다.`);
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
    
    return jobBoards;
  } catch (error) {
    console.error('모든 공고 조회 실패:', error);
    throw error;
  }
};

export const getActiveJobBoards = async () => {
  try {
    const jobBoardsRef = collection(db, 'jobBoards');
    const q = query(jobBoardsRef, where('status', '==', 'active'));
    const querySnapshot = await getDocs(q);
    
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
    
    return jobBoards;
  } catch (error) {
    console.error('활성화된 공고 조회 실패:', error);
    throw error;
  }
};

export const updateJobBoard = async (jobBoardId: string, jobBoardData: Partial<JobBoard>) => {
  return await updateDoc(doc(db, 'jobBoards', jobBoardId), jobBoardData);
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

// Auth 관련 함수
export const signIn = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    // 로그인 성공 시 마지막 로그인 시간 업데이트
    const userRecord = await getUserByEmail(email);
    if (userRecord) {
      await updateUser(userRecord.userId, {
        lastLoginAt: Timestamp.now() 
      });
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
export const uploadProfileImage = async (userId: string, file: File): Promise<string> => {
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
  jobExperienceGroups: JobGroup[] = []
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
      group: index < jobExperienceGroups.length ? jobExperienceGroups[index] : 'junior' as JobGroup
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
  const querySnapshot = await getDocs(collection(db, 'jobCodes'));
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as JobCode } as JobCodeWithId));
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

export const addUserJobCode = async (userId: string, jobCodeId: string, group: JobGroup): Promise<Array<{id: string, group: JobGroup}>> => {
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
    const newJobExperience = { id: jobCodeId, group };
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