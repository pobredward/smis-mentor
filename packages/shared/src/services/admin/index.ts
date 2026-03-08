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
import type { JobExperienceGroupRole } from '../../types/camp';

// Local types (not exported to avoid conflicts)
interface JobCode {
  generation: string;
  code: string;
  name: string;
  eduDates: Timestamp[];
  startDate: Timestamp;
  endDate: Timestamp;
  location: string;
  korea: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

interface JobCodeWithId extends JobCode {
  id: string;
}

type JobGroup =
  | 'junior'
  | 'middle'
  | 'senior'
  | 'spring'
  | 'summer'
  | 'autumn'
  | 'winter'
  | 'common'
  | 'manager';

// JobExperienceGroupRole은 shared에서 import하여 사용

interface JobExperienceItem {
  id: string;
  group: JobGroup;
  groupRole?: JobExperienceGroupRole;
  classCode?: string;
}

interface User {
  userId: string;
  id: string;
  email: string;
  name: string;
  phoneNumber: string;
  phone?: string;
  role: 'user' | 'mentor' | 'admin';
  status: 'active' | 'inactive' | 'temp';
  jobExperiences?: JobExperienceItem[];
  address?: string;
  addressDetail?: string;
  profileImage?: string;
  isEmailVerified?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  lastLoginAt?: Timestamp;
  feedback?: string;
  [key: string]: unknown;
}

interface JobCodeWithGroup extends JobCodeWithId {
  group: JobGroup;
}

// ==================== 임시 사용자 생성 ====================
export const createTempUser = async (
  db: Firestore,
  name: string,
  phoneNumber: string,
  jobExperienceIds: string[],
  jobExperienceGroups: string[] = [],
  jobExperienceGroupRoles: string[] = [],
  jobExperienceClassCodes: (string | undefined)[] = [],
  role: 'mentor_temp' | 'foreign_temp' | 'admin' = 'mentor_temp'
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
      throw new Error('이미 등록된 유저입니다');
    }

    // JobExperiences 객체 배열 생성
    const jobExperiences: any[] = jobExperienceIds.map((id, index) => ({
      id,
      group:
        index < jobExperienceGroups.length ? jobExperienceGroups[index] : 'junior',
      groupRole:
        index < jobExperienceGroupRoles.length
          ? jobExperienceGroupRoles[index]
          : '담임',
      classCode:
        index < jobExperienceClassCodes.length
          ? jobExperienceClassCodes[index]
          : undefined,
    }));

    const now = Timestamp.now();

    // Firestore에 임시 사용자 정보 저장
    const userData: any = {
      email: '',
      name,
      phoneNumber,
      phone: phoneNumber,
      role,
      jobExperiences,
      address: '',
      addressDetail: '',
      profileImage: '',
      status: 'temp',
      isEmailVerified: false,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await addDoc(usersRef, userData);
    await updateDoc(doc(db, 'users', docRef.id), {
      userId: docRef.id,
      id: docRef.id,
    });

    return { success: true };
  } catch (error) {
    console.error('임시 사용자 생성 오류:', error);
    throw error;
  }
};

// ==================== 모든 사용자 조회 ====================
export const adminGetAllUsers = async (db: Firestore): Promise<any[]> => {
  try {
    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersRef);

    const users: any[] = [];
    querySnapshot.forEach((docSnapshot) => {
      users.push(docSnapshot.data());
    });

    return users;
  } catch (error) {
    console.error('모든 사용자 조회 실패:', error);
    throw error;
  }
};

// ==================== 사용자 업데이트 ====================
export const adminUpdateUser = async (
  db: Firestore,
  userId: string,
  updates: Record<string, any>
) => {
  const now = Timestamp.now();
  const userRef = doc(db, 'users', userId);

  await updateDoc(userRef, {
    ...updates,
    updatedAt: now,
  });
};

// ==================== 사용자 삭제 ====================
export const adminDeleteUser = async (db: Firestore, userId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    await deleteDoc(userRef);
    return true;
  } catch (error) {
    console.error('사용자 삭제 실패:', error);
    throw error;
  }
};

// ==================== 사용자 재활성화 ====================
export const adminReactivateUser = async (db: Firestore, userId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }

    const userData = userDoc.data();
    const now = Timestamp.now();
    const originalName = userData.name.replace(/^\(탈퇴\)/, '');

    await updateDoc(userRef, {
      status: 'active',
      name: originalName,
      updatedAt: now,
    });

    return true;
  } catch (error) {
    console.error('사용자 재활성화 실패:', error);
    throw error;
  }
};

// ==================== JobCode 관련 함수 ====================

// 모든 JobCode 조회
export const adminGetAllJobCodes = async (db: Firestore): Promise<any[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, 'jobCodes'));
    const jobCodes = querySnapshot.docs.map((docSnapshot) => ({
      id: docSnapshot.id,
      ...docSnapshot.data(),
    }));

    return jobCodes;
  } catch (error) {
    console.error('직무 코드 조회 실패:', error);
    throw error;
  }
};

// JobCode 생성
export const adminCreateJobCode = async (
  db: Firestore,
  jobCodeData: Record<string, any>
) => {
  try {
    const docRef = await addDoc(collection(db, 'jobCodes'), jobCodeData);
    return docRef.id;
  } catch (error) {
    console.error('업무 코드 생성 실패:', error);
    throw error;
  }
};

// JobCode 삭제
export const adminDeleteJobCode = async (db: Firestore, jobCodeId: string) => {
  try {
    await deleteDoc(doc(db, 'jobCodes', jobCodeId));
    return true;
  } catch (error) {
    console.error('업무 코드 삭제 실패:', error);
    throw error;
  }
};

// JobCode 업데이트
export const adminUpdateJobCode = async (
  db: Firestore,
  jobCodeId: string,
  jobCodeData: Record<string, any>
) => {
  try {
    await updateDoc(doc(db, 'jobCodes', jobCodeId), jobCodeData);
    return true;
  } catch (error) {
    console.error('업무 코드 업데이트 실패:', error);
    throw error;
  }
};

// JobCode ID로 조회
export const adminGetJobCodeById = async (db: Firestore, jobCodeId: string) => {
  const jobCodeDoc = await getDoc(doc(db, 'jobCodes', jobCodeId));
  if (!jobCodeDoc.exists()) return null;
  return {
    id: jobCodeDoc.id,
    ...jobCodeDoc.data(),
  };
};

// 사용자 JobCode 추가
export const adminAddUserJobCode = async (
  db: Firestore,
  userId: string,
  jobCodeId: string,
  group: string,
  groupRole: string,
  classCode?: string
): Promise<any[]> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }
    const user = userDoc.data();
    const jobExperiences = user.jobExperiences || [];

    // 이미 존재하는지 확인
    const exists = jobExperiences.some((exp: any) => exp.id === jobCodeId);
    if (exists) {
      throw new Error('이미 추가된 직무 코드입니다.');
    }

    // 새 형식으로 추가
    const newJobExperience: any = {
      id: jobCodeId,
      group,
      groupRole,
    };
    if (classCode && classCode.trim() !== '') {
      newJobExperience.classCode = classCode.trim();
    }

    const updatedJobExperiences = [...jobExperiences, newJobExperience];
    await updateDoc(userRef, { jobExperiences: updatedJobExperiences });

    return updatedJobExperiences;
  } catch (error) {
    console.error('직무 코드 추가 실패:', error);
    throw error;
  }
};

// 사용자 JobCode 삭제
export const adminRemoveUserJobCode = async (
  db: Firestore,
  userId: string,
  jobCodeId: string
): Promise<any[]> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }
    const user = userDoc.data();
    const jobExperiences = user.jobExperiences || [];

    // 해당 jobCodeId를 제외한 배열 생성
    const updatedJobExperiences = jobExperiences.filter(
      (exp: any) => exp.id !== jobCodeId
    );

    await updateDoc(userRef, { jobExperiences: updatedJobExperiences });

    return updatedJobExperiences;
  } catch (error) {
    console.error('직무 코드 삭제 실패:', error);
    throw error;
  }
};

// 사용자 JobCode 정보 조회
export const adminGetUserJobCodesInfo = async (
  db: Firestore,
  jobExperiences: any[]
): Promise<any[]> => {
  try {
    if (!jobExperiences || jobExperiences.length === 0) return [];

    // 배열 형식 확인 및 ID 추출
    const jobIds = jobExperiences.map((exp) => {
      // 새 형식 (객체)인 경우
      if (typeof exp === 'object' && exp !== null && 'id' in exp) {
        return exp.id;
      }
      // 이전 형식 (문자열)인 경우
      return exp as string;
    });

    // 병렬로 처리할 작업 배열
    const tasks = jobIds.map(async (idOrCode, index) => {
      try {
        // 그룹 정보 준비 (새 형식인 경우에만 포함)
        const group =
          typeof jobExperiences[index] === 'object' && 'group' in jobExperiences[index]
            ? jobExperiences[index].group
            : 'junior';

        // jobCodes 컬렉션에서 직접 ID로 조회
        const jobCodeDoc = await getDoc(doc(db, 'jobCodes', idOrCode));

        if (jobCodeDoc.exists()) {
          return {
            id: jobCodeDoc.id,
            ...jobCodeDoc.data(),
            group,
          };
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
    return results.filter((result): result is any => result !== null);
  } catch (error) {
    console.error('직무 코드 정보 가져오기 오류:', error);
    return [];
  }
};

// 특정 직무 코드에 해당하는 사용자 조회
export const adminGetUsersByJobCode = async (
  db: Firestore,
  generation: string,
  code: string
): Promise<any[]> => {
  try {
    const users: any[] = [];

    // jobCodes 컬렉션에서 해당 코드와 세대에 맞는 문서 ID 찾기
    const jobCodesRef = collection(db, 'jobCodes');
    const codeQuery = query(
      jobCodesRef,
      where('generation', '==', generation),
      where('code', '==', code)
    );

    const jobCodeSnapshot = await getDocs(codeQuery);

    if (jobCodeSnapshot.empty) {
      return users;
    }

    // jobCodes에서 찾은 문서 ID
    const jobCodeId = jobCodeSnapshot.docs[0].id;

    // 해당 jobCodeId를 jobExperiences 배열의 id 필드에 포함하는 사용자 조회
    const usersRef = collection(db, 'users');
    const userSnapshot = await getDocs(usersRef);

    userSnapshot.forEach((docSnapshot) => {
      const userData = docSnapshot.data();
      // jobExperiences 배열에서 id 필드가 jobCodeId와 일치하는 항목이 있는지 확인
      if (
        userData.jobExperiences &&
        userData.jobExperiences.some((exp: any) => exp.id === jobCodeId)
      ) {
        users.push(userData);
      }
    });

    return users;
  } catch (error) {
    console.error('직무 코드별 사용자 조회 실패:', error);
    throw error;
  }
};

// 사용자 ID로 조회
export const adminGetUserById = async (db: Firestore, userId: string) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return null;

    const userData = userDoc.data();
    
    // id 필드가 없는 경우 자동으로 추가 (오래된 데이터 마이그레이션)
    if (!userData.id) {
      console.warn(`사용자 ${userId}에 id 필드가 없습니다. 자동으로 추가합니다.`);
      await updateDoc(doc(db, 'users', userId), { id: userId });
      return { ...userData, id: userId };
    }

    return userData;
  } catch (error) {
    console.error('사용자 정보 가져오기 실패:', error);
    throw error;
  }
};
